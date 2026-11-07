// Profi-Code (SPEC 5.8): the examples "schwächste()", "Geist" and "Flut" run unchanged,
// and the safety limits hold.
import { describe, expect, it } from 'vitest';
import { makeGame, place, setHp } from '../../engine/__tests__/helpers';
import { createBus } from '../../engine/bus';
import { applyAction } from '../../engine/reducer';
import { DEFAULT_SETTINGS, cloneSettings } from '../../engine/settings';
import type { ApplyResult, GameEvent, GameState, NpcType } from '../../engine/types';
import type { EffectDef, FunctionDef, ProgramAST, RuleDefinition } from '../ast';
import { callFunction, newEnv } from '../interpreter';
import { parseEffectText, parseProgram, parseRule, stripLines } from '../parser';
import { printProgram } from '../printer';
import {
  validateEffect,
  validateFunction,
  validateNpcCode,
  validateRule,
  npcTypeFor,
} from '../validator';
import { ERDBEBEN_TEXT, SCHWAECHSTE_GEIST_FLUT } from './spec58';

function program(text: string): ProgramAST {
  const r = parseProgram(text);
  if (r.errors.length > 0) throw new Error(JSON.stringify(r.errors));
  return r.parsed.program;
}

function ok(r: ApplyResult): GameState {
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
}

/** Plays the figure on turn: NPCs act, everybody else passes. */
function playTurn(s: GameState, events: GameEvent[] = []): GameState {
  const actor = s.turn.order[s.turn.index];
  if (!actor) throw new Error('no actor');
  const fig = s.figures[actor];
  const r = applyAction(
    s,
    fig?.kind === 'npc' ? { type: 'npcAct', actor } : { type: 'pass', actor },
  );
  if (!r.ok) throw new Error(`${actor}: ${r.error.code}`);
  events.push(...r.events);
  return r.state;
}

function playRounds(s: GameState, rounds: number, events: GameEvent[] = []): GameState {
  const target = s.round + rounds;
  while (s.round < target && s.status === 'playing') s = playTurn(s, events);
  return s;
}

function ruleDef(text: string, extra: Partial<RuleDefinition['bundle']> = {}): RuleDefinition {
  const r = parseRule(text);
  if (!r.rule) throw new Error(JSON.stringify(r.errors));
  return {
    id: 'own.p',
    author: 'Test',
    ast: r.rule.ast,
    bundle: { effects: [], npcTypes: [], ...extra },
  };
}

function addRule(s: GameState, def: RuleDefinition, events: GameEvent[] = []): GameState {
  const actor = s.turn.order[s.turn.index] ?? 'f1';
  s = ok(applyAction(s, { type: 'move', actor, path: [] }));
  const r = applyAction(s, { type: 'addRule', actor, rule: def });
  if (r.ok) events.push(...r.events);
  return ok(r);
}

const P = program(SCHWAECHSTE_GEIST_FLUT);
const SCHWAECHSTE = P.functions[0] as FunctionDef;
const GEIST: NpcType = {
  id: 'geist',
  name: 'Geist',
  symbol: 'G',
  color: '#9B5CF6',
  hp: 1,
  move: 1,
  behavior: 'chase',
  code: P.npcCode[0]?.body ?? null,
};

describe('Profi-Code parser and printer (SPEC 5.8)', () => {
  it('parses the SPEC examples without errors', () => {
    expect(P.functions.map((f) => f.name)).toEqual(['schwächste']);
    expect(P.npcCode.map((n) => n.npc)).toEqual(['Geist']);
    expect(P.rules.map((r) => r.name)).toEqual(['Flut']);
    expect(program(ERDBEBEN_TEXT).effects.map((e) => e.name)).toEqual(['Erdbeben']);
  });

  it('round-trips: parse(print(ast)) equals ast', () => {
    for (const text of [SCHWAECHSTE_GEIST_FLUT, ERDBEBEN_TEXT]) {
      const ast = program(text);
      const printed = printProgram(ast);
      expect(stripLines(program(printed))).toEqual(stripLines(ast));
      // The normalized text is stable.
      expect(printProgram(program(printed))).toBe(printed);
    }
  });

  it('prints in English and parses the English aliases', () => {
    const ast = program(SCHWAECHSTE_GEIST_FLUT);
    const en = printProgram(ast, 'en');
    expect(en).toContain('FUNCTION schwächste(menge)');
    expect(en).toContain('FOR EACH f IN menge');
    expect(en).toContain('RETURN beste');
    expect(stripLines(program(en))).toEqual(stripLines(ast));
  });

  it('accepts UE/OE/AE spellings and lower case keywords', () => {
    const text = 'funktion f(x)\n  gib zurueck x + 1\nende';
    expect(program(text).functions[0]?.body[0]?.kind).toBe('return');
  });

  it('the Erdbeben text gives the same AST as the blocks', () => {
    const fromText = parseEffectText(ERDBEBEN_TEXT.split('\n\nREGEL')[0] ?? '');
    expect(fromText.errors).toEqual([]);
    const body = stripLines(fromText.effect?.body);
    expect(body?.[0]).toEqual({ kind: 'play', sound: { kind: 'str', value: 'rumpeln' } });
    expect(body?.[1]).toMatchObject({
      kind: 'forEach',
      var: 'f',
      in: {
        kind: 'query',
        name: 'neighborTiles',
        args: [
          { kind: 'tileRef', tile: { kind: 'eventTile' } },
          { kind: 'var', name: 'stärke' },
        ],
      },
    });
  });

  it('reports errors with line numbers and suggestions', () => {
    const r = parseProgram('FUNKTION f(a)\n  MERKE b = a +\nENDE');
    expect(r.errors[0]).toMatchObject({ code: 'expectedValue', line: 2 });
    const r2 = parseProgram('FUNKTION f(a)\n  GIB ZURÜCK a');
    expect(r2.errors).toEqual([expect.objectContaining({ code: 'missingEnd', line: 1 })]);
    const r3 = parseProgram('NPC "Geist" ZUG\n  MERKE z = schwaechste\nENDE');
    expect(r3.errors[0]).toMatchObject({ code: 'unknownValue', line: 2 });
    const r4 = parseProgram('ENDE');
    expect(r4.errors[0]).toMatchObject({ code: 'unexpectedEnd', line: 1 });
  });

  it('local variables shadow words of the rule language', () => {
    const body = P.npcCode[0]?.body ?? [];
    expect(stripLines(body[1])).toEqual({
      kind: 'do',
      effect: {
        kind: 'teleport',
        target: { kind: 'value', expr: { kind: 'self' } },
        near: { kind: 'value', expr: { kind: 'varProp', name: 'ziel', prop: 'tile' } },
      },
    });
  });
});

describe('Profi-Code validation (SPEC 5.8)', () => {
  const S = DEFAULT_SETTINGS;

  it('accepts the SPEC examples', () => {
    expect(validateFunction(SCHWAECHSTE, S, P.functions)).toEqual([]);
    const code = P.npcCode[0]!;
    expect(validateNpcCode(code, S, [GEIST], [], P.functions)).toEqual([]);
    expect(npcTypeFor(code, [GEIST])?.id).toBe('geist');
    expect(validateRule(P.rules[0]!, S, [], [], P.functions)).toEqual([]);
  });

  it('functions must not change the world', () => {
    const f = program('FUNKTION boese(x)\n  SCHADEN x 1\n  GIB ZURÜCK 1\nENDE').functions[0]!;
    expect(validateFunction(f, S, [f]).map((e) => e.code)).toContain('worldChangeInFunction');
  });

  it('respects the setting "Profi-Code erlaubt"', () => {
    const off = cloneSettings(S);
    off.rules.proCodeAllowed = false;
    expect(validateRule(P.rules[0]!, off, [], [], P.functions).map((e) => e.code)).toContain(
      'proCodeDisabled',
    );
    expect(validateFunction(SCHWAECHSTE, off, P.functions).map((e) => e.code)).toContain(
      'proCodeDisabled',
    );
    // Plain rules and block effects stay allowed.
    const plain = parseRule('REGEL "A"\nWENN RUNDENSTART\nDANN SCHADEN alle 1').rule!.ast;
    expect(validateRule(plain, off, [])).toEqual([]);
    const erdbeben = program(ERDBEBEN_TEXT).effects[0]!;
    expect(validateEffect(erdbeben, off, [], [erdbeben])).toEqual([]);
  });

  it('selbst only in NPC code, GIB ZURÜCK only in functions', () => {
    // `selbst` is no word outside NPC code: the parser rejects it.
    const e = parseProgram('EFFEKT "X"\n  TELEPORT selbst ZUFÄLLIG\nENDE');
    expect(e.errors[0]).toMatchObject({ line: 2, params: { found: 'selbst' } });
    const r = parseProgram('EFFEKT "X"\n  GIB ZURÜCK 1\nENDE').parsed.program.effects[0]!;
    expect(validateEffect(r, S, [], [r]).map((x) => x.code)).toContain('returnOutsideFunction');
  });

  it('validator errors carry the code line', () => {
    const f = program('FUNKTION f(a)\n  MERKE b = 1\n  SCHADEN a 1\nENDE').functions[0]!;
    const errors = validateFunction(f, S, [f]);
    expect(errors[0]).toMatchObject({ code: 'worldChangeInFunction', line: 3 });
  });
});

describe('Profi-Code runtime: the SPEC examples run unchanged', () => {
  it('schwächste() returns the figure with the fewest lives', () => {
    let s = makeGame(3);
    s = setHp(s, 'f2', 1);
    s = { ...s, functions: [SCHWAECHSTE] };
    const bus = createBus(structuredClone(s));
    const env = newEnv(bus, { id: 't', name: 't' }, {});
    const all = { t: 'figs' as const, ids: ['f1', 'f2', 'f3', 'f4'] };
    expect(callFunction(env, 'schwächste', [all])).toEqual({ t: 'fig', id: 'f2' });
    expect(callFunction(env, 'schwächste', [{ t: 'figs', ids: [] }])).toBe(null);
  });

  it('Geist teleports next to the weakest figure and plays "buh"', () => {
    let s = makeGame(2, (st) => (st.rules.activationDelay = 0));
    s = setHp(s, 'f2', 1);
    s = place(s, 'f2', 2, 2);
    const spawnRule = ruleDef(
      'REGEL "Spuk"\nWENN RUNDENSTART\nDANN SPAWNE geist AUF zufälliges_leeres_feld\nLIMIT 1 PRO SPIEL',
      {
        npcTypes: [GEIST],
        functions: [SCHWAECHSTE],
      },
    );
    s = addRule(s, spawnRule);
    const events: GameEvent[] = [];
    s = playRounds(s, 3, events);
    const ghost = Object.values(s.figures).find((f) => f.npcTypeId === 'geist');
    expect(ghost).toBeDefined();
    expect(events.some((e) => e.type === 'soundPlayed' && e.sound === 'buh')).toBe(true);
    const weakest = s.figures.f2!;
    const d = Math.abs(ghost!.pos.x - weakest.pos.x) + Math.abs(ghost!.pos.y - weakest.pos.y);
    expect(d).toBe(1);
  });

  it('Flut: every 4th round end the edge becomes water and "flut" is sent', () => {
    let s = makeGame(2, (st) => (st.rules.activationDelay = 0));
    s = addRule(
      s,
      ruleDef(SCHWAECHSTE_GEIST_FLUT.slice(SCHWAECHSTE_GEIST_FLUT.indexOf('REGEL "Flut"'))),
    );
    s = addRule(s, ruleDef('REGEL "Alarm"\nWENN EREIGNIS "flut"\nDANN ZEIGE "Land unter!"'));
    const events: GameEvent[] = [];
    s = playRounds(s, 3, events);
    expect(Object.values(s.tiles).some((t) => t.type === 'wasser')).toBe(false);
    s = playRounds(s, 1, events);
    expect(s.world.flut).toBe(0);
    const water = Object.values(s.tiles).filter((t) => t.type === 'wasser');
    expect(water.length).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'customEvent' && e.name === 'flut')).toBe(true);
    expect(events.some((e) => e.type === 'message' && e.text === 'Land unter!')).toBe(true);
  });

  it('is deterministic: same seed and actions give the same state', () => {
    const run = () => {
      let s = makeGame(2, (st) => (st.rules.activationDelay = 0), 7);
      s = addRule(
        s,
        ruleDef('REGEL "Spuk"\nWENN RUNDENSTART\nDANN SPAWNE geist AUF zufälliges_leeres_feld', {
          npcTypes: [GEIST],
          functions: [SCHWAECHSTE],
        }),
      );
      return playRounds(s, 4);
    };
    expect(run()).toEqual(run());
  });
});

describe('Profi-Code runtime: language features', () => {
  function runEffect(text: string, functions: FunctionDef[] = []) {
    const effect = parseEffectText(text).effect;
    if (!effect) throw new Error(JSON.stringify(parseEffectText(text).errors));
    let s = makeGame(2, (st) => (st.rules.activationDelay = 0));
    const events: GameEvent[] = [];
    s = addRule(
      s,
      ruleDef(`REGEL "T"\nWENN ZUGSTART\nDANN ${effect.name}()\nLIMIT 1 PRO SPIEL`, {
        effects: [effect as EffectDef],
        functions,
      }),
      events,
    );
    return { s, events };
  }

  it('lists, länge, füge_hinzu and text joining', () => {
    const { s, events } = runEffect(
      'EFFEKT "L"\n  MERKE l = [1, 2]\n  l.füge_hinzu(3)\n  SETZE welt.n = l.länge * 10 / 2\n  ZEIGE "Zahl: " + welt.n\nENDE',
    );
    expect(s.world.n).toBe(15);
    expect(events.some((e) => e.type === 'message' && e.text === 'Zahl: 15')).toBe(true);
  });

  it('SOLANGE loops end by condition', () => {
    const { s } = runEffect(
      'EFFEKT "W"\n  MERKE i = 0\n  SOLANGE i < 5\n    MERKE i = i + 1\n  ENDE\n  SETZE welt.i = i\nENDE',
    );
    expect(s.world.i).toBe(5);
  });

  it('an endless SOLANGE stops at the step budget, earlier changes stay', () => {
    const { s, events } = runEffect(
      'EFFEKT "Endlos"\n  SETZE welt.vorher = 1\n  SOLANGE 1 = 1\n    SETZE welt.x + 1\n  ENDE\nENDE',
    );
    expect(s.world.vorher).toBe(1);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'effectAborted', reason: 'steps' }),
    );
    expect(s.log.some((l) => l.key === 'log.effectAborted.steps')).toBe(true);
  });

  it('recursion deeper than 20 stops', () => {
    const f = program('FUNKTION tief(n)\n  GIB ZURÜCK tief(n + 1)\nENDE').functions[0]!;
    const { events } = runEffect('EFFEKT "R"\n  SETZE welt.r = tief(0)\nENDE', [f]);
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'effectAborted', reason: 'depth' }),
    );
  });

  it('recursion within the limit works (factorial)', () => {
    const f = program(
      'FUNKTION fak(n)\n  WENN n <= 1\n    GIB ZURÜCK 1\n  ENDE\n  GIB ZURÜCK n * fak(n - 1)\nENDE',
    ).functions[0]!;
    const { s } = runEffect('EFFEKT "F"\n  SETZE welt.f = fak(5)\nENDE', [f]);
    expect(s.world.f).toBe(120);
  });

  it('lists longer than 200 elements stop', () => {
    const { events } = runEffect(
      'EFFEKT "Lang"\n  MERKE l = []\n  WIEDERHOLE 10 MAL\n    SOLANGE 1 = 1\n      l.füge_hinzu(1)\n    ENDE\n  ENDE\nENDE',
    );
    expect(events).toContainEqual(
      expect.objectContaining({ type: 'effectAborted', reason: 'list' }),
    );
  });

  it('NACH 2 RUNDEN runs the block two rounds later', () => {
    let { s } = runEffect(
      'EFFEKT "Spaeter"\n  NACH 2 RUNDEN\n    SETZE welt.spaet = 1\n  ENDE\nENDE',
    );
    expect(s.delayed.length).toBe(1);
    const due = s.delayed[0]!.dueRound;
    s = playRounds(s, 1);
    expect(s.world.spaet ?? 0).toBe(0);
    while (s.round < due) s = playTurn(s);
    expect(s.world.spaet).toBe(1);
    expect(s.delayed.length).toBe(0);
  });

  it('world changes from code still go through the limits (damage max 2 per round)', () => {
    const { s } = runEffect(
      'EFFEKT "Hart"\n  WIEDERHOLE 5 MAL\n    SCHADEN alle_figuren 1\n  ENDE\nENDE',
    );
    for (const f of Object.values(s.figures)) {
      expect(f.maxHp - f.hp).toBeLessThanOrEqual(2);
    }
  });
});
