const STORAGE_KEY = 'aptis-b2-vocabulary-v1';
const SCHEMA_VERSION = 1;
const INTERVAL_DAYS = [2, 7, 14, 30];
const MODES = {
  quick: { label: '5 min · Quick Review', count: 5 },
  b2: { label: '10 min · B2 Vocabulary', count: 10 },
  weak: { label: '15 min · Weak Words', count: 15 },
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const normalize = value => String(value || '').trim().toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
let vocabularyData;
let active = null;
let activeCategory = 'All categories';
let loadPromise;
let latestErrors = [];

function blankState() { return { schemaVersion: SCHEMA_VERSION, units: {} }; }
function loadState() {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (value?.schemaVersion === SCHEMA_VERSION && value.units && typeof value.units === 'object' && !Array.isArray(value.units)) return value;
  } catch { /* A damaged or unavailable optional lab save starts fresh. */ }
  return blankState();
}
let labState = loadState();
function saveState() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(labState)); } catch { /* The main course store is independent. */ }
}
function progressFor(id) {
  return labState.units[id] || { repetitions: 0, lapses: 0, mistakes: 0, status: 'New', dueAt: 0, lastCorrect: null };
}
function updateProgress(id, correct) {
  const previous = progressFor(id);
  const repetitions = correct ? previous.repetitions + 1 : Math.max(0, previous.repetitions - 1);
  const interval = INTERVAL_DAYS[Math.min(Math.max(repetitions - 1, 0), INTERVAL_DAYS.length - 1)];
  labState.units[id] = {
    repetitions,
    lapses: correct ? Math.max(0, previous.lapses - 1) : previous.lapses + 1,
    mistakes: (previous.mistakes ?? previous.lapses) + (correct ? 0 : 1),
    status: !correct ? 'Learning' : repetitions >= 4 ? 'Mastered' : repetitions >= 2 ? 'Review' : 'Learning',
    dueAt: Date.now() + (correct ? interval * 86400000 : 0),
    lastCorrect: correct,
  };
  saveState();
}

function personalErrors(errors) {
  const prepositionSignal = /\b(preposition|depend\s+(?:of|on)|discuss\s+about|responsible\s+(?:of|for)|interested\s+(?:on|in)|comply\s+(?:to|with)|refer\s+(?:at|to)|in favour\s+(?:for|of))\b/i;
  return (errors || []).filter(error => {
    const category = String(error.category || '').toLowerCase();
    return /vocabulary|collocation/.test(category) || /preposition|prep\b/i.test(category) || prepositionSignal.test(`${error.error || ''} ${error.correction || ''}`);
  }).map((error, index) => ({
    id: `VOC-PER-${encodeURIComponent(String(error.key || index)).replace(/%/g, '_')}`,
    term: 'Personal error', category: 'Personal errors', definition: error.correction,
    example: error.error, prompt: error.error, correct: error.correction, choices: [],
    source: 'personal', sourceRef: error.id || '', personal: true,
  }));
}

function allUnits(errors) { return [...vocabularyData.units, ...personalErrors(errors)]; }
function due(item) { const dueAt = progressFor(item.id).dueAt; return dueAt > 0 && dueAt <= Date.now(); }
function status(item) { return progressFor(item.id).status; }
function categoryUnits(items, category) {
  if (category === 'All categories') return items;
  if (category === 'Personal errors') return items.filter(item => item.personal);
  return items.filter(item => !item.personal && item.category === category);
}
function sourceLabel(item) {
  if (item.source === 'week') return `Course · ${item.sourceRef.split('-E')[0]}`;
  if (item.source === 'mock') return `Mock · ${item.sourceRef.slice(0, 6)}`;
  if (item.source === 'personal') return `Error Tracker · ${item.sourceRef}`;
  if (item.source === 'extra') return 'Extra B2 Practice';
  return 'Vocabulary Masterbook';
}
function intervalLabel(dateMs) {
  if (!dateMs || dateMs <= Date.now()) return 'pendiente';
  const days = Math.ceil((dateMs - Date.now()) / 86400000);
  return `en ${days} ${days === 1 ? 'día' : 'días'}`;
}
function chooseItems(items, mode, category) {
  const filtered = categoryUnits(items, category);
  const count = MODES[mode].count;
  if (mode === 'weak') {
    return [...filtered].sort((a, b) => {
      const pa = progressFor(a.id), pb = progressFor(b.id);
      return Number((pb.mistakes ?? pb.lapses) > 0) - Number((pa.mistakes ?? pa.lapses) > 0) || (pb.mistakes ?? pb.lapses) - (pa.mistakes ?? pa.lapses) || pb.lapses - pa.lapses || pa.repetitions - pb.repetitions || pa.dueAt - pb.dueAt || a.id.localeCompare(b.id);
    }).slice(0, count);
  }
  const pending = filtered.filter(due).sort((a, b) => {
    const pa = progressFor(a.id), pb = progressFor(b.id);
    return (pa.dueAt || 0) - (pb.dueAt || 0) || a.id.localeCompare(b.id);
  });
  const unseen = filtered.filter(item => progressFor(item.id).repetitions === 0 && progressFor(item.id).lapses === 0 && !pending.includes(item));
  const next = mode === 'quick' ? [...pending, ...unseen] : [...pending, ...unseen, ...filtered.filter(item => !pending.includes(item) && !unseen.includes(item))];
  return next.slice(0, count);
}

function inventoryStats(items) {
  const seen = items.filter(item => { const p = progressFor(item.id); return p.repetitions > 0 || p.lapses > 0; }).length;
  const mastered = items.filter(item => status(item) === 'Mastered').length;
  const learning = items.filter(item => status(item) === 'Learning').length;
  const difficult = items.filter(item => (progressFor(item.id).mistakes ?? progressFor(item.id).lapses) > 0).length;
  const dueToday = items.filter(item => progressFor(item.id).dueAt > 0 && due(item)).length;
  return { seen, mastered, learning, difficult, dueToday, total: items.length, percent: items.length ? Math.round(seen / items.length * 100) : 0 };
}

function homeHTML(items, errors) {
  const stats = inventoryStats(items);
  const personalCount = items.filter(item => item.personal).length;
  const options = ['All categories', ...vocabularyData.categories, 'Personal errors'];
  return `<section class="vocab-lab">
    <div class="hero"><div><p class="eyebrow">PRÁCTICA OPCIONAL · REPASO ESPACIADO</p><h1 class="page-title">Vocabulary Lab</h1><p class="page-subtitle">Recupera chunks, significados y patrones léxicos fuera del plan de 8 semanas. El progreso de este laboratorio queda separado del progreso del curso.</p></div><div class="hero-side">${stats.total} UNIDADES · LOCAL</div></div>
    <section class="vocab-feature card"><div><p class="eyebrow">TU SIGUIENTE REPASO</p><h2>Practica una idea cada vez.</h2><p>Responde antes de revelar la corrección. Los aciertos alargan el intervalo; los errores vuelven a la cola de repaso.</p></div><div class="vocab-progress-wrap"><div class="vocab-progress-label"><span>Unidades vistas</span><strong>${stats.seen} / ${stats.total}</strong></div><div class="vocab-progress-bar" role="progressbar" aria-label="Unidades vistas" aria-valuemin="0" aria-valuemax="${stats.total}" aria-valuenow="${stats.seen}"><span style="width:${stats.percent}%"></span></div></div></section>
    <section class="vocab-stats" aria-label="Estadísticas de Vocabulary Lab">
      <div class="stat-card"><div class="stat-label">Unidades vistas</div><div class="stat-value">${stats.seen}</div></div><div class="stat-card"><div class="stat-label">Dominadas</div><div class="stat-value">${stats.mastered}</div></div><div class="stat-card"><div class="stat-label">En aprendizaje</div><div class="stat-value">${stats.learning}</div></div><div class="stat-card"><div class="stat-label">Difíciles</div><div class="stat-value">${stats.difficult}</div></div><div class="stat-card"><div class="stat-label">Revisiones pendientes hoy</div><div class="stat-value">${stats.dueToday}</div></div>
    </section>
    <section class="section-space"><div class="vocab-filter-row"><div><h2 class="section-heading">Elige una práctica</h2><p class="card-subtitle">Las sesiones no cambian las 32 sesiones principales.</p></div><label class="vocab-filter">Categoría<select id="vocab-category">${options.map(option => `<option value="${escapeHTML(option)}" ${activeCategory === option ? 'selected' : ''}>${escapeHTML(option)}</option>`).join('')}</select></label></div>
      <div class="vocab-mode-grid">${Object.entries(MODES).map(([mode, details]) => `<button class="vocab-mode-card" type="button" data-vocab-start="${mode}"><span>${escapeHTML(details.label)}</span><small>${mode === 'weak' ? `${stats.difficult || 'Prioriza'} unidades con errores previos` : mode === 'quick' ? `${stats.dueToday} revisiones pendientes hoy` : 'Mezcla unidades del banco del curso'}</small><strong>Empezar →</strong></button>`).join('')}</div>
    </section>
    <section class="section-space"><h2 class="section-heading">Categorías</h2><div class="vocab-category-grid">${vocabularyData.categories.map(category => `<button type="button" class="vocab-category-chip ${activeCategory === category ? 'selected' : ''}" data-vocab-filter="${escapeHTML(category)}">${escapeHTML(category)}<span>${items.filter(item => !item.personal && item.category === category).length}</span></button>`).join('')}<button type="button" class="vocab-category-chip ${activeCategory === 'Personal errors' ? 'selected' : ''}" data-vocab-filter="Personal errors">Personal errors<span>${personalCount}</span></button></div></section>
    <p class="vocab-source-note">Fuentes: Vocabulary Masterbook, ejercicios de Vocabulary de Weeks 1–8 y secciones Vocabulary de los cuatro mocks.${errors.length ? ` ${personalCount} errores personales elegibles.` : ' Los errores de Vocabulary, Collocation y preposiciones aparecerán aquí cuando existan.'}</p>
  </section>`;
}

function practiceHTML() {
  const item = active.items[active.index];
  if (!item) return `<section class="vocab-lab"><div class="empty-state"><h2>${active.items.length ? 'Sesión completada' : 'Sin unidades para este filtro'}</h2><p>${active.items.length ? 'Has terminado este bloque de práctica.' : 'No hay revisiones pendientes en esta categoría ahora. Prueba B2 Vocabulary o Weak Words.'}</p><button class="primary-button" type="button" data-vocab-home>Volver al Vocabulary Lab</button></div></section>`;
  const progress = Math.round((active.index / active.items.length) * 100);
  const record = progressFor(item.id);
  const personal = item.personal;
  const choices = personal ? [] : item.choices;
  const answered = active.answered;
  const correctChoice = item.correct;
  const feedback = answered === null || personal ? '' : `<div class="vocab-feedback ${answered ? 'good' : 'needs-work'}" role="status"><strong>${answered ? 'Correcto' : 'Aún no'}</strong><p>${escapeHTML(item.definition || `Respuesta: ${correctChoice}`)}</p><p class="vocab-answer-line">Respuesta: <strong>${escapeHTML(correctChoice)}</strong></p><small>Próxima revisión: ${escapeHTML(intervalLabel(progressFor(item.id).dueAt))} · Estado: ${escapeHTML(progressFor(item.id).status)}</small></div>`;
  return `<section class="vocab-lab"><div class="vocab-practice-top"><button class="text-link" type="button" data-vocab-home>← Vocabulary Lab</button><span>${escapeHTML(MODES[active.mode].label)}</span></div><div class="vocab-session-progress"><div><strong>Pregunta ${active.index + 1} de ${active.items.length}</strong><span>${active.correctCount} correctas · ${active.wrongCount} por repasar</span></div><div class="vocab-progress-bar" role="progressbar" aria-label="Progreso de la sesión" aria-valuemin="0" aria-valuemax="${active.items.length}" aria-valuenow="${active.index}"><span style="width:${progress}%"></span></div></div>
    <article class="vocab-question card"><div class="vocab-question-head"><span class="tag">${escapeHTML(item.category)}</span><span class="tag">${escapeHTML(status(item))}</span><small>${escapeHTML(sourceLabel(item))}</small></div><p class="vocab-prompt">${escapeHTML(item.prompt)}</p>${personal ? `<p class="vocab-personal-error"><strong>Error registrado:</strong> ${escapeHTML(item.example)}</p><p class="card-subtitle">Intenta corregirlo por escrito o en voz alta. Después muestra la corrección y valora si lo recordabas.</p>${answered === null ? `<textarea class="vocab-answer-input" data-vocab-personal-answer aria-label="Tu corrección" placeholder="Escribe una corrección antes de mostrar la solución">${escapeHTML(active.personalInput || '')}</textarea><button class="primary-button" type="button" data-vocab-reveal>Mostrar corrección</button>` : `<div class="vocab-feedback needs-work"><strong>Corrección del Error Tracker</strong><p>Tu intento: ${escapeHTML(active.personalInput || 'práctica oral')}</p><p>Corrección: ${escapeHTML(item.correct)}</p></div>${!active.personalRated ? `<div class="vocab-rate-actions"><button class="secondary-button" type="button" data-vocab-rate="true">Lo recordaba</button><button class="secondary-button" type="button" data-vocab-rate="false">Necesito repasar</button></div>` : `<p class="vocab-source-note">Valoración guardada: ${active.personalResult ? 'Lo recordaba' : 'Necesito repasar'}.</p>`}`}` : `<div class="vocab-choices" role="group" aria-label="Opciones de respuesta">${choices.map((choice, index) => `<button class="vocab-choice" type="button" data-vocab-choice="${index}" ${answered !== null ? 'disabled' : ''}><span>${String.fromCharCode(65 + index)}</span>${escapeHTML(choice)}</button>`).join('')}</div>`}${feedback}${!personal && answered !== null ? `<button class="primary-button vocab-next" type="button" data-vocab-next>Siguiente</button>` : ''}${personal && active.personalRated ? `<button class="primary-button vocab-next" type="button" data-vocab-next>Siguiente</button>` : ''}</article>
    <p class="vocab-session-note">Tu resultado de práctica no se añade a las sesiones ni modifica los errores originales.</p></section>`;
}

function paint(container, errors) {
  const items = allUnits(errors);
  container.innerHTML = active ? practiceHTML() : homeHTML(items, errors);
}

function bind(container, getErrors) {
  if (container.dataset.vocabularyLabBound === 'true') return;
  container.dataset.vocabularyLabBound = 'true';
  container.addEventListener('input', event => {
    if (event.target.matches('[data-vocab-personal-answer]') && active) active.personalInput = event.target.value;
  });
  container.addEventListener('change', event => {
    if (event.target.id !== 'vocab-category') return;
    activeCategory = event.target.value;
    paint(container, getErrors());
  });
  container.addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.vocabFilter) { activeCategory = button.dataset.vocabFilter; paint(container, getErrors()); return; }
    if (button.dataset.vocabStart) {
      const items = categoryUnits(allUnits(getErrors()), activeCategory);
      let selected = chooseItems(items, button.dataset.vocabStart, activeCategory);
      if (button.dataset.vocabStart === 'quick' && selected.every(item => !due(item))) selected = selected.slice(0, MODES.quick.count);
      if (button.dataset.vocabStart === 'weak' && !selected.some(item => (progressFor(item.id).mistakes ?? progressFor(item.id).lapses) > 0)) {
        selected.sort((a, b) => progressFor(a.id).repetitions - progressFor(b.id).repetitions || a.id.localeCompare(b.id));
      }
      active = { mode: button.dataset.vocabStart, items: selected, index: 0, answered: null, correctCount: 0, wrongCount: 0, repeated: new Set(), personalRated: false };
      paint(container, getErrors());
      return;
    }
    if (button.hasAttribute('data-vocab-home')) { active = null; paint(container, getErrors()); return; }
    if (button.dataset.vocabChoice !== undefined && active) {
      const item = active.items[active.index];
      if (!item || active.answered !== null) return;
      const choice = item.choices[Number(button.dataset.vocabChoice)];
      active.answered = normalize(choice) === normalize(item.correct);
      if (active.answered) active.correctCount += 1; else active.wrongCount += 1;
      updateProgress(item.id, active.answered);
      if (!active.answered && !active.repeated.has(item.id)) {
        active.repeated.add(item.id);
        active.items.push(item);
      }
      paint(container, getErrors());
      return;
    }
    if (button.hasAttribute('data-vocab-reveal') && active) {
      const typed = container.querySelector('[data-vocab-personal-answer]')?.value || '';
      if (!typed.trim()) { container.querySelector('[data-vocab-personal-answer]')?.focus(); return; }
      active.answered = false;
      active.personalRated = false;
      paint(container, getErrors());
      return;
    }
    if (button.dataset.vocabRate !== undefined && active) {
      const correct = button.dataset.vocabRate === 'true';
      const item = active.items[active.index];
      updateProgress(item.id, correct);
      if (correct) active.correctCount += 1; else active.wrongCount += 1;
      active.personalRated = true;
      active.personalResult = correct;
      if (!correct && !active.repeated.has(item.id)) { active.repeated.add(item.id); active.items.push(item); }
      paint(container, getErrors());
      return;
    }
    if (button.hasAttribute('data-vocab-next') && active) {
      active.index += 1; active.answered = null; active.personalRated = false;
      paint(container, getErrors());
    }
  });
}

export async function renderVocabularyLab(container, errors = []) {
  latestErrors = errors || [];
  bind(container, () => latestErrors);
  container.innerHTML = '<section class="card">Cargando Vocabulary Lab…</section>';
  try {
    if (!loadPromise) loadPromise = fetch(new URL('../data/vocabulary.json', import.meta.url)).then(response => {
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    }).then(data => {
      if (data.schemaVersion !== 1 || !Array.isArray(data.categories) || !Array.isArray(data.units)) throw new Error('Datos de Vocabulary Lab incompatibles.');
      vocabularyData = data;
      return data;
    });
    await loadPromise;
    paint(container, errors || []);
  } catch {
    container.innerHTML = '<section class="card"><h1>No se pudo abrir Vocabulary Lab</h1><p>Comprueba que el archivo local del banco léxico está disponible y vuelve a intentarlo.</p></section>';
  }
}
