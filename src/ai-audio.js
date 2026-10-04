export const MAX_RECORDING_BYTES = 12 * 1024 * 1024;
export function encodeWav(samples, sampleRate) {
  const output = new ArrayBuffer(44 + samples.length * 2), view = new DataView(output);
  const text = (at, s) => [...s].forEach((c, i) => view.setUint8(at + i, c.charCodeAt(0)));
  text(0, 'RIFF'); view.setUint32(4, 36 + samples.length * 2, true); text(8, 'WAVE'); text(12, 'fmt ');
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); text(36, 'data'); view.setUint32(40, samples.length * 2, true);
  samples.forEach((sample, i) => { const n = Math.max(-1, Math.min(1, sample)); view.setInt16(44 + i * 2, Math.round(n < 0 ? n * 32768 : n * 32767), true); });
  return new Blob([output], { type: 'audio/wav' });
}
export async function recordingToWav(blob) {
  if (!blob?.size || blob.size > MAX_RECORDING_BYTES) throw new Error('La grabación está vacía o supera 12 MB.');
  const Context = globalThis.AudioContext || globalThis.webkitAudioContext;
  const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  if (!Context || !Offline) throw new Error('Este navegador no permite preparar el audio para IA. Usa un navegador actualizado; tu grabación sigue disponible.');
  const context = new Context();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    if (decoded.duration < 0.75 || decoded.duration > 185) throw new Error('Graba entre 1 segundo y 3 minutos de respuesta.');
    // Only a container/PCM conversion for API compatibility: no trimming or pause removal.
    const renderer = new Offline(1, Math.ceil(decoded.duration * 24000), 24000);
    const source = renderer.createBufferSource(); source.buffer = decoded; source.connect(renderer.destination); source.start();
    const rendered = await renderer.startRendering();
    return { blob: encodeWav(rendered.getChannelData(0), 24000), duration: rendered.duration };
  } catch (error) {
    if (error instanceof DOMException) throw new Error('No se pudo preparar el audio. Tu grabación sigue disponible para reproducirla y reintentar.');
    throw error;
  } finally { await context.close().catch(() => {}); }
}
