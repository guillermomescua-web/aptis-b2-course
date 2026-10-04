export function splitWriting(exercises, session, plan) {
  const week = plan?.weeks?.[session.slice(0, 2)];
  if (!week) return { primary: exercises, extra: [] };
  const extraIds = new Set(week.extra);
  return { primary: exercises.filter(ex => !extraIds.has(ex.id)), extra: exercises.filter(ex => extraIds.has(ex.id)) };
}
