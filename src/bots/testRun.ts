// "Testlauf" (SPEC 5.4): simulates a rule for 10 rounds on a copy of the current game
// (or a small demo game) with the fast bot policy and reports how often it fires and
// whom it affects. Pure and deterministic for a given seed.
import { causeOf } from '../engine/bus';
import { cloneSettings, DEFAULT_SETTINGS } from '../engine/settings';
import { withBundle } from '../engine/rules';
import { createGame } from '../engine/setup';
import type { ActiveRule, GameEvent, GameState } from '../engine/types';
import type { RuleDefinition } from '../lang/ast';
import { fastTurn } from './ruleChoice';

export const TEST_RUN_ROUNDS = 10;
const TEST_RULE_ID = 'test-run';

export interface TestRunFigure {
  id: string;
  name: string;
  /** Effects of the tested rule that hit this figure. */
  hits: number;
  damage: number;
  heal: number;
}

export interface TestRunResult {
  rounds: number;
  fired: number;
  figures: TestRunFigure[];
  tilesChanged: number;
  spawns: number;
  messages: number;
  gameOver: boolean;
}

/** A small neutral game for test runs outside a running game. */
export function demoGame(seed: number): GameState {
  const avatar = (color: string) => ({ image: null, color });
  return createGame({
    seed,
    settings: cloneSettings(DEFAULT_SETTINGS),
    seats: [
      {
        role: 'hero',
        name: 'Held A',
        avatar: avatar('#34C77B'),
        controller: 'bot',
        difficulty: 'normal',
      },
      {
        role: 'hero',
        name: 'Held B',
        avatar: avatar('#3DA5FF'),
        controller: 'bot',
        difficulty: 'normal',
      },
      {
        role: 'boss',
        name: 'Boss',
        avatar: avatar('#E5383B'),
        controller: 'bot',
        difficulty: 'normal',
      },
    ],
  }).state;
}

function withTestRule(state: GameState, def: RuleDefinition): GameState {
  const rule: ActiveRule = {
    id: TEST_RULE_ID,
    def: structuredClone(def),
    authorId: state.seatOrder[0] ?? 'f1',
    order: state.nextId + 1000,
    addedRound: state.round - 1,
    activeFromRound: state.round,
    expiresAfterRound: null,
    firedThisRound: 0,
    firedThisTurn: 0,
    firedTotal: 0,
  };
  // Own effects and NPC types of the rule join the test game, as with addRule.
  const merged = withBundle(state, def);
  return {
    ...structuredClone(state),
    pendingVote: null,
    effects: structuredClone(merged.effects),
    npcTypes: structuredClone(merged.npcTypes),
    rules: [...state.rules, rule],
  };
}

const FIGURE_EVENTS = new Set<GameEvent['type']>([
  'damaged',
  'healed',
  'statusAdded',
  'turnSkipped',
  'tileEntered',
]);

export function testRunRule(
  base: GameState | null,
  def: RuleDefinition,
  seed: number,
): TestRunResult {
  let state = withTestRule(base ?? demoGame(seed), def);
  state = { ...state, rng: (state.rng ^ seed) | 0 };
  const figures = new Map<string, TestRunFigure>();
  const result: TestRunResult = {
    rounds: 0,
    fired: 0,
    figures: [],
    tilesChanged: 0,
    spawns: 0,
    messages: 0,
    gameOver: false,
  };
  const figureEntry = (id: string): TestRunFigure => {
    let entry = figures.get(id);
    if (!entry) {
      entry = { id, name: state.participants[id]?.name ?? id, hits: 0, damage: 0, heal: 0 };
      figures.set(id, entry);
    }
    return entry;
  };
  const onEvents = (events: GameEvent[]) => {
    for (const e of events) {
      if (e.type === 'ruleFired' && e.rule === TEST_RULE_ID) result.fired++;
      if (causeOf(e) !== TEST_RULE_ID) continue;
      if (FIGURE_EVENTS.has(e.type) && 'figure' in e && e.figure) {
        const f = figureEntry(e.figure);
        f.hits++;
        if (e.type === 'damaged') f.damage += e.amount;
        if (e.type === 'healed') f.heal += e.amount;
      }
      if (e.type === 'tileTypeChanged' || e.type === 'tileAdded' || e.type === 'tileRemoved') {
        result.tilesChanged++;
      }
      if (e.type === 'spawned') result.spawns++;
      if (e.type === 'message') result.messages++;
    }
  };
  const startRound = state.round;
  for (let i = 0; i < 400 && state.status === 'playing'; i++) {
    if (state.round >= startRound + TEST_RUN_ROUNDS) break;
    const next = fastTurn(state, onEvents);
    if (next === state) break;
    state = next;
  }
  result.rounds = Math.min(
    TEST_RUN_ROUNDS,
    state.round - startRound + (state.status === 'over' ? 1 : 0),
  );
  result.gameOver = state.status === 'over';
  result.figures = [...figures.values()].sort((a, b) => b.hits - a.hits);
  return result;
}
