// Pure helpers for recorded sounds (SPEC 8.2): trim, volume, resample, WAV encoding and
// waveform peaks. Recordings are stored as small mono WAV data URLs (embeddable in packages).

/** Sample rate of stored sounds: enough for voices and noises, small files. */
export const SOUND_RATE = 22050;
/** Longest recording (SPEC 8.2). */
export const MAX_SOUND_MS = 3000;

/** Cuts [startMs, endMs) out of the samples and applies a volume factor (clipped to ±1). */
export function trimAndGain(
  samples: Float32Array,
  sampleRate: number,
  startMs: number,
  endMs: number,
  gain: number,
): Float32Array {
  const from = Math.max(0, Math.floor((startMs / 1000) * sampleRate));
  const to = Math.min(samples.length, Math.ceil((endMs / 1000) * sampleRate));
  const out = new Float32Array(Math.max(0, to - from));
  for (let i = 0; i < out.length; i++) {
    out[i] = Math.max(-1, Math.min(1, (samples[from + i] ?? 0) * gain));
  }
  return out;
}

/** Linear resampling (good enough for short voice clips). */
export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to || samples.length === 0) return samples.slice();
  const length = Math.max(1, Math.round((samples.length * to) / from));
  const out = new Float32Array(length);
  const ratio = from / to;
  for (let i = 0; i < length; i++) {
    const pos = i * ratio;
    const a = Math.floor(pos);
    const frac = pos - a;
    const x = samples[a] ?? 0;
    const y = samples[a + 1] ?? x;
    out[i] = x + (y - x) * frac;
  }
  return out;
}

/** 16-bit PCM mono WAV. */
export function encodeWav(samples: Float32Array, sampleRate: number): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  text(0, 'RIFF');
  view.setUint32(4, 36 + samples.length * 2, true);
  text(8, 'WAVE');
  text(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, 1, true); // mono
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, 'data');
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(44 + i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
  }
  return bytes;
}

/** Reads the samples of a WAV written by encodeWav (for tests and previews). */
export function decodeWav(bytes: Uint8Array): { samples: Float32Array; sampleRate: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const sampleRate = view.getUint32(24, true);
  const length = view.getUint32(40, true) / 2;
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const v = view.getInt16(44 + i * 2, true);
    samples[i] = v < 0 ? v / 0x8000 : v / 0x7fff;
  }
  return { samples, sampleRate };
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export const WAV_PREFIX = 'data:audio/wav;base64,';

/** Trimmed, volume-adjusted recording as a WAV data URL. */
export function toWavDataUrl(
  samples: Float32Array,
  sampleRate: number,
  startMs: number,
  endMs: number,
  gain: number,
): string {
  const cut = trimAndGain(samples, sampleRate, startMs, endMs, gain);
  return WAV_PREFIX + bytesToBase64(encodeWav(resample(cut, sampleRate, SOUND_RATE), SOUND_RATE));
}

/** Peak level (0..1) per bar for the waveform display. */
export function peaks(samples: Float32Array, bars: number): number[] {
  const out: number[] = [];
  const size = Math.max(1, Math.floor(samples.length / bars));
  for (let b = 0; b < bars; b++) {
    let max = 0;
    for (let i = b * size; i < Math.min(samples.length, (b + 1) * size); i++) {
      max = Math.max(max, Math.abs(samples[i] ?? 0));
    }
    out.push(max);
  }
  return out;
}

/** Sound names as used in SPIELE "name": lower case letters, digits and _. */
export function soundName(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_äöüß]/g, '')
    .slice(0, 30);
}
