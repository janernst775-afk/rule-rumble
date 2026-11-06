import { describe, expect, it } from 'vitest';
import { makeGame } from '../../engine/__tests__/helpers';
import { attackTargets, currentFigure, moveOptions } from '../../engine/query';
import { applyAction } from '../../engine/reducer';
import { deriveRng, randomFloat, randomPick, type RngHolder } from '../../engine/rng';
import { validAddPositions } from '../../engine/tiles';
import type { Action, GameState, TileType } from '../../engine/types';
import { START_RULES } from '../library/startRules';
import { withRules } from './helpers';

/** Fast random policy so that every kind of event happens in a few rounds. */
function randomTurn(state: GameState, rng: RngHolder): GameState {
  const me = currentFigure(state);
  if (!me) return state;
  const act = (a: Action) => {
    const r = applyAction(state, a);
    if (!r.ok) throw new Error(`${a.type}: ${r.error.code}`);
    state = r.state;
  };
  if (state.pendingVote) return state;
  if (me.kind === 'npc') {
    act({ type: 'npcAct', actor: me.id });
    return state;
  }
  const paths = [...moveOptions(state, me.id).values()];
  act({ type: 'move', actor: me.id, path: randomPick(rng, paths) ?? [] });
  if (state.status !== 'playing' || currentFigure(state)?.id !== me.id) return state;
  const targets = attackTargets(state, me.id);
  const roll = randomFloat(rng);
  if (targets.length > 0 && roll < 0.8) {
    act({ type: 'attack', actor: me.id, target: targets[0]!.id });
  } else if (roll < 0.35 && validAddPositions(state).length > 0) {
    act({
      type: 'addTile',
      actor: me.id,
      pos: randomPick(rng, validAddPositions(state))!,
      textureId: null,
    });
  } else {
    act({ type: 'pass', actor: me.id });
  }
  return state;
}

function prepared(seed: number): GameState {
  let s = makeGame(3, (st) => (st.rules.ruleDamagePerFigurePerRound = 5), seed);
  const tiles = structuredClone(s.tiles);
  const typed: [string, TileType][] = [
    ['1,1', 'lava'],
    ['2,1', 'eis'],
    ['1,2', 'eis'],
    ['2,2', 'falle'],
    ['0,0', 'heilquelle'],
    ['1,0', 'heilquelle'],
  ];
  for (const [k, t] of typed) tiles[k] = { ...tiles[k]!, type: t };
  for (const k of ['3,1', '3,2', '1,3', '2,3']) tiles[k] = { ...tiles[k]!, textureId: 'tex-sumpf' };
  s = { ...s, tiles, textureNames: { 'tex-sumpf': 'Sumpf' } };
  // Every hero starts with souls so that "Seelen einlösen" can fire.
  for (const id of ['f1', 'f2', 'f3']) {
    s = {
      ...s,
      figures: { ...s.figures, [id]: { ...s.figures[id]!, hp: 2, vars: { seelen: 3 } } },
    };
  }
  return s;
}

describe('start library (SPEC 5.5)', () => {
  it('has 15–20 rules, at most 2 spawn NPCs, unique ids', () => {
    expect(START_RULES.length).toBeGreaterThanOrEqual(15);
    expect(START_RULES.length).toBeLessThanOrEqual(20);
    const spawning = START_RULES.filter((r) =>
      [...r.ast.effects, ...r.ast.elseEffects].some((e) => e.kind === 'spawn'),
    );
    expect(spawning.length).toBeLessThanOrEqual(2);
    expect(new Set(START_RULES.map((r) => r.id)).size).toBe(START_RULES.length);
  });

  it.each(START_RULES.map((r) => [r.id, r] as const))('%s fires in a game', (_id, def) => {
    let fired = false;
    for (let seed = 1; seed <= 6 && !fired; seed++) {
      let s = withRules(prepared(seed), def.ast);
      const rng: RngHolder = { rng: deriveRng(seed, def.id) };
      for (let turn = 0; turn < 120 && s.status === 'playing'; turn++) {
        s = randomTurn(s, rng);
        if ((s.rules[0]?.firedTotal ?? 0) > 0) {
          fired = true;
          break;
        }
      }
    }
    expect(fired).toBe(true);
  });
});
