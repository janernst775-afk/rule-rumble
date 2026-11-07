// Balance simulation (SPEC 6.3, v0.8): bot-against-bot games with random library rules.
// Pure and deterministic for a given seed; runs in Node via `npm run sim`.
import { playBotTurn } from '../bots/simulate';
import { applyAction } from '../engine/reducer';
import { deriveRng, randomInt, type RngHolder } from '../engine/rng';
import { TEMPLATES, cloneSettings, type TemplateId } from '../engine/settings';
import { createGame, type SeatSetup } from '../engine/setup';
import type { Difficulty, GameState, Settings } from '../engine/types';
import { START_RULES } from '../lang/library/startRules';
import { validateRule } from '../lang/validator';

export interface SimOptions {
  games: number;
  seed: number;
  /** Library rules that are already in play when a game starts. */
  startRules: number;
  /** Turns after which a game counts as unfinished. */
  maxTurns: number;
  difficulty: Difficulty;
}

export const DEFAULT_SIM: SimOptions = {
  games: 1000,
  seed: 1,
  startRules: 2,
  maxTurns: 600,
  difficulty: 'normal',
};

export interface SimResult {
  template: TemplateId;
  games: number;
  bossWins: number;
  heroWins: number;
  draws: number;
  unfinished: number;
  /** Average number of rounds of finished games. */
  avgRounds: number;
  /** Boss win rate among finished games (0..1). */
  bossRate: number;
}

function seats(heroes: number, difficulty: Difficulty): SeatSetup[] {
  const seat = (role: 'hero' | 'boss', name: string): SeatSetup => ({
    role,
    name,
    avatar: { image: null, color: '#34C77B' },
    controller: 'bot',
    difficulty,
  });
  return [
    ...Array.from({ length: heroes }, (_, i) => seat('hero', `H${i + 1}`)),
    seat('boss', 'B'),
  ];
}

/** Heroes per game: Solo has one, the other templates 2 to 4. */
function heroCount(template: TemplateId, rng: RngHolder): number {
  return template === 'solo' ? 1 : 2 + randomInt(rng, 3);
}

/** Puts random valid library rules into play (added by the first hero, active at once). */
function withStartRules(state: GameState, count: number, rng: RngHolder): GameState {
  const pool = START_RULES.filter(
    (r) => validateRule(r.ast, state.settings, state.npcTypes).length === 0,
  );
  let s = state;
  for (let i = 0; i < count && pool.length > 0; i++) {
    const def = pool.splice(randomInt(rng, pool.length), 1)[0];
    if (!def) break;
    const actor = s.turn.order[s.turn.index] ?? 'f1';
    const moved = applyAction(s, { type: 'move', actor, path: [] });
    if (!moved.ok) break;
    const added = applyAction(moved.state, { type: 'addRule', actor, rule: def });
    if (!added.ok) break;
    s = added.state;
  }
  return s;
}

export function simulateGame(
  settings: Settings,
  template: TemplateId,
  seed: number,
  opts: SimOptions,
): GameState {
  const rng: RngHolder = { rng: deriveRng(seed, `sim:${template}`) };
  const s0 = cloneSettings(settings);
  s0.rules.activationDelay = 0;
  let s = createGame({
    seed,
    settings: s0,
    seats: seats(heroCount(template, rng), opts.difficulty),
  }).state;
  s = withStartRules(s, opts.startRules, rng);
  for (let i = 0; i < opts.maxTurns && s.status === 'playing'; i++) s = playBotTurn(s);
  return s;
}

/** Counts of one batch of games. */
export interface SimCounts {
  bossWins: number;
  heroWins: number;
  draws: number;
  unfinished: number;
  rounds: number;
}

/** Plays the games with index `from` (inclusive) to `to` (exclusive) of one template. */
export function simulateRange(
  template: TemplateId,
  opts: SimOptions,
  from: number,
  to: number,
  settings: Settings = TEMPLATES[template],
): SimCounts {
  const c: SimCounts = { bossWins: 0, heroWins: 0, draws: 0, unfinished: 0, rounds: 0 };
  for (let i = from; i < to; i++) {
    const s = simulateGame(settings, template, opts.seed * 100_000 + i, opts);
    if (!s.result) {
      c.unfinished++;
      continue;
    }
    c.rounds += s.round;
    if (s.result.winner === 'boss') c.bossWins++;
    else if (s.result.winner === 'heroes') c.heroWins++;
    else c.draws++;
  }
  return c;
}

export function summarize(template: TemplateId, games: number, counts: SimCounts[]): SimResult {
  const sum = counts.reduce(
    (a, c) => ({
      bossWins: a.bossWins + c.bossWins,
      heroWins: a.heroWins + c.heroWins,
      draws: a.draws + c.draws,
      unfinished: a.unfinished + c.unfinished,
      rounds: a.rounds + c.rounds,
    }),
    { bossWins: 0, heroWins: 0, draws: 0, unfinished: 0, rounds: 0 },
  );
  const finished = games - sum.unfinished;
  return {
    template,
    games,
    bossWins: sum.bossWins,
    heroWins: sum.heroWins,
    draws: sum.draws,
    unfinished: sum.unfinished,
    avgRounds: finished > 0 ? Math.round((sum.rounds / finished) * 10) / 10 : 0,
    bossRate: finished > 0 ? sum.bossWins / finished : 0,
  };
}

/** Plays `opts.games` games with one template in this thread. */
export function simulateTemplate(
  template: TemplateId,
  opts: SimOptions,
  settings: Settings = TEMPLATES[template],
): SimResult {
  return summarize(template, opts.games, [simulateRange(template, opts, 0, opts.games, settings)]);
}

/** The target of SPEC 6.3: boss win rate 40–60 %. */
export function inTarget(r: SimResult): boolean {
  return r.bossRate >= 0.4 && r.bossRate <= 0.6;
}
