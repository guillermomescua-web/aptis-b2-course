export const MAX_AUDIO_BYTES = 16 * 1024 * 1024;
export function inspectWav(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str = (at, n) => String.fromCharCode(...bytes.subarray(at, at + n));
  if (bytes.length < 44 || str(0, 4) !== 'RIFF' || str(8, 4) !== 'WAVE' || view.getUint32(4, true) + 8 !== bytes.length) throw new Error('WAV inválido.');
  let channels, rate, align, offset, size;
  for (let at = 12; at + 8 <= bytes.length;) {
    const length = view.getUint32(at + 4, true), start = at + 8;
    if (start + length > bytes.length) throw new Error('WAV truncado.');
    const tag = str(at, 4);
    if (tag === 'fmt ') {
      if (length < 16 || view.getUint16(start, true) !== 1 || view.getUint16(start + 14, true) !== 16) throw new Error('Se requiere WAV PCM de 16 bits.');
      channels = view.getUint16(start + 2, true); rate = view.getUint32(start + 4, true); align = view.getUint16(start + 12, true);
      if (![1, 2].includes(channels) || rate < 8000 || rate > 48000 || align !== channels * 2 || view.getUint32(start + 8, true) !== rate * align) throw new Error('Formato WAV inválido.');
    } else if (tag === 'data') { if (offset !== undefined) throw new Error('WAV ambiguo.'); offset = start; size = length; }
    at = start + length + length % 2;
  }
  if (!rate || offset === undefined || size % align) throw new Error('Audio sin muestras válidas.');
  const duration = size / align / rate;
  if (duration < 0.75 || duration > 185) throw new Error('Graba entre 1 segundo y 3 minutos de respuesta.');
  let energy = 0, samples = 0;
  for (let at = offset; at < offset + size; at += 2) { const sample = view.getInt16(at, true) / 32768; energy += sample * sample; samples++; }
  if (Math.sqrt(energy / samples) < 0.0005) throw new Error('La grabación contiene silencio. Revisa el micrófono y vuelve a grabar.');
  return { duration, rate, channels };
}
export function audioBase64(bytes) {
  let raw = '';
  for (let at = 0; at < bytes.length; at += 16384) raw += String.fromCharCode(...bytes.subarray(at, at + 16384));
  return btoa(raw);
}
