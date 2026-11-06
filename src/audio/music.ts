// Tiny synthesized music loops with a look-ahead scheduler and crossfades.

export type MusicTrack = 'menu' | 'game' | 'boss';

interface TrackDef {
  bpm: number;
  /** Semitone offsets from A2 per 16th step; null = rest. */
  bass: (number | null)[];
  lead: (number | null)[];
  leadType: OscillatorType;
  bassType: OscillatorType;
  drums: boolean;
}

const TRACKS: Record<MusicTrack, TrackDef> = {
  menu: {
    bpm: 104,
    bass: [0, null, 12, null, 5, null, 17, null, 7, null, 19, null, 5, null, 17, null],
    lead: [24, null, 28, 31, null, 28, null, null, 26, null, 29, 33, null, 29, null, null],
    leadType: 'triangle',
    bassType: 'sine',
    drums: false,
  },
  game: {
    bpm: 120,
    bass: [0, 0, 12, 0, 3, 3, 15, 3, 5, 5, 17, 5, 7, 7, 19, 7],
    lead: [null, 24, null, 27, null, 24, 31, null, null, 29, null, 27, null, 24, null, null],
    leadType: 'square',
    bassType: 'triangle',
    drums: true,
  },
  boss: {
    bpm: 140,
    bass: [0, 0, 0, 12, 1, 1, 1, 13, 0, 0, 0, 12, 6, 6, 5, 5],
    lead: [24, null, 25, null, 24, null, 30, 29, 24, null, 25, null, 31, 30, 29, null],
    leadType: 'sawtooth',
    bassType: 'square',
    drums: true,
  },
};

const A2 = 110;
const freq = (semi: number) => A2 * Math.pow(2, semi / 12);

class TrackVoice {
  readonly gain: GainNode;
  private step = 0;
  private nextTime: number;

  constructor(
    private readonly ctx: AudioContext,
    out: AudioNode,
    private readonly def: TrackDef,
  ) {
    this.gain = ctx.createGain();
    this.gain.gain.value = 0.0001;
    this.gain.connect(out);
    this.nextTime = ctx.currentTime + 0.05;
  }

  schedule(until: number): void {
    const stepDur = 60 / this.def.bpm / 4;
    while (this.nextTime < until) {
      const i = this.step % 16;
      const bass = this.def.bass[i];
      const lead = this.def.lead[i];
      if (bass !== null && bass !== undefined)
        this.note(this.def.bassType, freq(bass), stepDur * 0.9, 0.18);
      if (lead !== null && lead !== undefined)
        this.note(this.def.leadType, freq(lead), stepDur * 1.6, 0.07);
      if (this.def.drums && i % 4 === 0) this.kick();
      if (this.def.drums && i % 8 === 4) this.snare();
      this.nextTime += stepDur;
      this.step++;
    }
  }

  private note(type: OscillatorType, f: number, dur: number, vol: number): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = f;
    const t = this.nextTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g);
    g.connect(this.gain);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private kick(): void {
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    const t = this.nextTime;
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(45, t + 0.12);
    g.gain.setValueAtTime(0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.15);
    osc.connect(g);
    g.connect(this.gain);
    osc.start(t);
    osc.stop(t + 0.17);
  }

  private snare(): void {
    const len = Math.floor(this.ctx.sampleRate * 0.1);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = 0.12;
    src.connect(g);
    g.connect(this.gain);
    src.start(this.nextTime);
  }
}

const LOOKAHEAD = 0.25;
const FADE = 1.2;

export class MusicPlayer {
  private current: { track: MusicTrack; voice: TrackVoice } | null = null;
  private fading: TrackVoice[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly ctx: AudioContext,
    private readonly out: AudioNode,
  ) {}

  play(track: MusicTrack): void {
    if (this.current?.track === track) return;
    const now = this.ctx.currentTime;
    if (this.current) this.fadeOut(this.current.voice, now);
    const voice = new TrackVoice(this.ctx, this.out, TRACKS[track]);
    voice.gain.gain.setValueAtTime(0.0001, now);
    voice.gain.gain.exponentialRampToValueAtTime(1, now + FADE);
    this.current = { track, voice };
    this.ensureTimer();
  }

  stop(): void {
    if (this.current) this.fadeOut(this.current.voice, this.ctx.currentTime);
    this.current = null;
  }

  private fadeOut(voice: TrackVoice, now: number): void {
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setValueAtTime(Math.max(0.0001, voice.gain.gain.value), now);
    voice.gain.gain.exponentialRampToValueAtTime(0.0001, now + FADE);
    this.fading.push(voice);
    setTimeout(
      () => {
        this.fading = this.fading.filter((v) => v !== voice);
        voice.gain.disconnect();
      },
      (FADE + 0.5) * 1000,
    );
  }

  private ensureTimer(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      const until = this.ctx.currentTime + LOOKAHEAD;
      this.current?.voice.schedule(until);
      for (const v of this.fading) v.schedule(until);
      if (!this.current && this.fading.length === 0 && this.timer) {
        clearInterval(this.timer);
        this.timer = null;
      }
    }, 80);
  }
}
