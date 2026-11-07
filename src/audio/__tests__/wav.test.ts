import { describe, expect, it } from 'vitest';
import {
  SOUND_RATE,
  WAV_PREFIX,
  base64ToBytes,
  decodeWav,
  encodeWav,
  peaks,
  resample,
  soundName,
  toWavDataUrl,
  trimAndGain,
} from '../wav';

function ramp(n: number): Float32Array {
  return Float32Array.from({ length: n }, (_, i) => i / n);
}

describe('recorded sounds (SPEC 8.2)', () => {
  it('trims start and end and applies the volume', () => {
    const s = ramp(1000);
    const out = trimAndGain(s, 1000, 100, 300, 2);
    expect(out.length).toBe(200);
    expect(out[0]).toBeCloseTo(0.2);
    // clipped at 1
    expect(Math.max(...trimAndGain(s, 1000, 0, 1000, 5))).toBe(1);
  });

  it('resamples to the target rate', () => {
    expect(resample(ramp(44100), 44100, SOUND_RATE).length).toBe(SOUND_RATE);
    expect(resample(ramp(10), 100, 100)).toEqual(ramp(10));
  });

  it('encodes and decodes 16-bit mono WAV', () => {
    const s = Float32Array.from([0, 0.5, -0.5, 1, -1]);
    const bytes = encodeWav(s, SOUND_RATE);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('RIFF');
    expect(bytes.length).toBe(44 + 10);
    const back = decodeWav(bytes);
    expect(back.sampleRate).toBe(SOUND_RATE);
    back.samples.forEach((v, i) => expect(v).toBeCloseTo(s[i] ?? 0, 3));
  });

  it('builds a data URL that round-trips through base64', () => {
    const url = toWavDataUrl(ramp(44100 * 3), 44100, 0, 1000, 1);
    expect(url.startsWith(WAV_PREFIX)).toBe(true);
    const { samples } = decodeWav(base64ToBytes(url.slice(WAV_PREFIX.length)));
    expect(samples.length).toBe(SOUND_RATE);
  });

  it('computes waveform peaks and clean names', () => {
    expect(peaks(Float32Array.from([0.1, -0.9, 0.3, 0.2]), 2)).toEqual([
      expect.closeTo(0.9),
      expect.closeTo(0.3),
    ]);
    expect(soundName('  Zombie Stöhnen! ')).toBe('zombie_stöhnen');
  });
});
