// Synthesized sound effects.

export type SfxId =
  'click' | 'step' | 'tick' | 'hit' | 'miss' | 'damage' | 'death' | 'victory' | 'defeat';

interface Tone {
  type: OscillatorType;
  from: number;
  to?: number;
  start: number;
  duration: number;
  volume: number;
}

function tone(ctx: AudioContext, out: AudioNode, t0: number, tn: Tone): void {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = tn.type;
  const start = t0 + tn.start;
  const end = start + tn.duration;
  osc.frequency.setValueAtTime(tn.from, start);
  if (tn.to !== undefined) osc.frequency.exponentialRampToValueAtTime(tn.to, end);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(tn.volume, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  osc.connect(gain);
  gain.connect(out);
  osc.start(start);
  osc.stop(end + 0.02);
}

function noise(
  ctx: AudioContext,
  out: AudioNode,
  t0: number,
  duration: number,
  volume: number,
  cutoff: number,
): void {
  const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = cutoff;
  const gain = ctx.createGain();
  gain.gain.value = volume;
  src.connect(filter);
  filter.connect(gain);
  gain.connect(out);
  src.start(t0);
}

const NOTES = { C5: 523.25, E5: 659.25, G5: 783.99, C6: 1046.5, A4: 440, F4: 349.23, D4: 293.66 };

export function playSynthSfx(ctx: AudioContext, out: AudioNode, id: SfxId): void {
  const t = ctx.currentTime + 0.005;
  switch (id) {
    case 'click':
      tone(ctx, out, t, {
        type: 'triangle',
        from: 880,
        to: 660,
        start: 0,
        duration: 0.06,
        volume: 0.25,
      });
      break;
    case 'step':
      tone(ctx, out, t, {
        type: 'sine',
        from: 220,
        to: 140,
        start: 0,
        duration: 0.09,
        volume: 0.35,
      });
      noise(ctx, out, t, 0.05, 0.08, 1200);
      break;
    case 'tick':
      tone(ctx, out, t, { type: 'square', from: 1500, start: 0, duration: 0.02, volume: 0.08 });
      break;
    case 'hit':
      noise(ctx, out, t, 0.18, 0.35, 2500);
      tone(ctx, out, t, {
        type: 'sawtooth',
        from: 300,
        to: 90,
        start: 0,
        duration: 0.2,
        volume: 0.25,
      });
      break;
    case 'miss':
      tone(ctx, out, t, { type: 'sine', from: 700, to: 250, start: 0, duration: 0.3, volume: 0.2 });
      break;
    case 'damage':
      tone(ctx, out, t, {
        type: 'square',
        from: 200,
        to: 120,
        start: 0,
        duration: 0.15,
        volume: 0.15,
      });
      tone(ctx, out, t, {
        type: 'square',
        from: 160,
        to: 90,
        start: 0.12,
        duration: 0.15,
        volume: 0.15,
      });
      break;
    case 'death':
      tone(ctx, out, t, {
        type: 'triangle',
        from: 440,
        to: 110,
        start: 0,
        duration: 0.7,
        volume: 0.3,
      });
      noise(ctx, out, t + 0.1, 0.4, 0.1, 600);
      break;
    case 'victory':
      [NOTES.C5, NOTES.E5, NOTES.G5, NOTES.C6].forEach((f, i) =>
        tone(ctx, out, t, {
          type: 'triangle',
          from: f,
          start: i * 0.12,
          duration: i === 3 ? 0.6 : 0.14,
          volume: 0.3,
        }),
      );
      break;
    case 'defeat':
      [NOTES.A4, NOTES.F4, NOTES.D4].forEach((f, i) =>
        tone(ctx, out, t, {
          type: 'sawtooth',
          from: f,
          start: i * 0.22,
          duration: i === 2 ? 0.7 : 0.24,
          volume: 0.15,
        }),
      );
      break;
  }
}
