// Audio facade (SPEC 8.2). Everything is synthesized with the Web Audio API for now;
// the interface allows swapping in real files later.
import { playSynthSfx, type SfxId } from './sfx';
import { MusicPlayer, type MusicTrack } from './music';

export type { SfxId } from './sfx';
export type { MusicTrack } from './music';

interface AudioGraph {
  ctx: AudioContext;
  master: GainNode;
  sfx: GainNode;
  music: GainNode;
  player: MusicPlayer;
}

let graph: AudioGraph | null = null;
let volumes = { music: 0.5, sfx: 0.8, muted: false };
let wantedTrack: MusicTrack | null = null;

function ensureGraph(): AudioGraph | null {
  if (graph) return graph;
  const Ctor =
    typeof window !== 'undefined'
      ? (window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
      : undefined;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const master = ctx.createGain();
    const sfx = ctx.createGain();
    const music = ctx.createGain();
    sfx.connect(master);
    music.connect(master);
    master.connect(ctx.destination);
    graph = { ctx, master, sfx, music, player: new MusicPlayer(ctx, music) };
    applyVolumes();
    return graph;
  } catch {
    return null;
  }
}

function applyVolumes(): void {
  if (!graph) return;
  const t = graph.ctx.currentTime;
  graph.master.gain.setTargetAtTime(volumes.muted ? 0 : 1, t, 0.02);
  graph.sfx.gain.setTargetAtTime(volumes.sfx, t, 0.02);
  graph.music.gain.setTargetAtTime(volumes.music * 0.5, t, 0.05);
}

/** Must be called from a user gesture once; browsers block audio before that. */
export function unlockAudio(): void {
  const g = ensureGraph();
  if (!g) return;
  if (g.ctx.state === 'suspended') void g.ctx.resume();
  if (wantedTrack) g.player.play(wantedTrack);
}

export function setVolumes(next: { music: number; sfx: number; muted: boolean }): void {
  volumes = next;
  applyVolumes();
}

export function playSfx(id: SfxId): void {
  const g = graph;
  if (!g || g.ctx.state !== 'running' || volumes.muted) return;
  playSynthSfx(g.ctx, g.sfx, id);
}

/** Switches the background loop with a soft crossfade; null stops the music. */
export function setMusic(track: MusicTrack | null): void {
  wantedTrack = track;
  const g = graph;
  if (!g || g.ctx.state !== 'running') return;
  if (track) g.player.play(track);
  else g.player.stop();
}
