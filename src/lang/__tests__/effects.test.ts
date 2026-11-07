import { describe, expect, it } from 'vitest';
import { makeGame, place } from '../../engine/__tests__/helpers';
import { DEFAULT_NPC_TYPES } from '../../engine/npc';
import { applyAction } from '../../engine/reducer';
import { DEFAULT_SETTINGS, cloneSettings } from '../../engine/settings';
import type { Action, ApplyResult, GameState } from '../../engine/types';
import type { EffectDef, Expr, RuleDefinition, Stmt } from '../ast';
import { parseRule } from '../parser';
import { printRule } from '../printer';
import { validateEffect, validateRule } from '../validator';

function ok(r: ApplyResult): GameState {
  if (!r.ok) throw new Error(r.error.code);
  return r.state;
}
const stay = (actor: string): Action => ({ type: 'move', actor, path: [] });

const v = (name: string): Expr => ({ kind: 'var', name });
const q = (name: Extract<Expr, { kind: 'query' }>['name'], ...args: Expr[]): Expr => ({
  kind: 'query',
  name,
  args,
});
const feld: Expr = { kind: 'tileRef', tile: { kind: 'eventTile' } };
const num = (value: number): Expr => ({ kind: 'num', value });

/** SPEC 5.7 "Erdbeben", built from blocks. */
const ERDBEBEN: EffectDef = {
  name: 'Erdbeben',
  author: 'Test',
  symbol: '⚡',
  params: [{ name: 'stärke', type: 'number' }],
  body: [
    { kind: 'play', sound: { kind: 'str', value: 'rumpeln' } },
    {
      kind: 'forEach',
      var: 'f',
      in: q('neighborTiles', feld, v('stärke')),
      body: [
        {
          kind: 'if',
          cond: {
            kind: 'and',
            items: [
              { kind: 'chance', percent: 30 },
              { kind: 'cmp', op: '=', left: q('count', q('figuresOn', v('f'))), right: num(0) },
            ],
          },
          then: [
            { kind: 'do', effect: { kind: 'removeTile', at: { kind: 'value', expr: v('f') } } },
          ],
          else: [],
        },
      ],
    },
  ],
};

function ruleText(text: string, effects: EffectDef[]): RuleDefinition {
  const r = parseRule(text);
  if (!r.rule) throw new Error(JSON.stringify(r.errors));
  return { id: 'own.t', author: 'Test', ast: r.rule.ast, bundle: { effects, npcTypes: [] } };
}

function check(def: EffectDef, effects: EffectDef[] = [def]) {
  return validateEffect(def, DEFAULT_SETTINGS, DEFAULT_NPC_TYPES, effects).map((e) => e.code);
}

describe('effect workshop: validation (SPEC 5.7)', () => {
  it('accepts the Erdbeben example', () => {
    expect(check(ERDBEBEN)).toEqual([]);
  });

  it('checks parameter types and unknown variables', () => {
    const bad: EffectDef = {
      ...ERDBEBEN,
      name: 'Kaputt',
      body: [
        {
          kind: 'do',
          effect: { kind: 'damage', target: { kind: 'value', expr: v('stärke') }, amount: 1 },
        },
        { kind: 'do', effect: { kind: 'removeTile', at: { kind: 'value', expr: v('unbekannt') } } },
      ],
    };
    expect(check(bad)).toEqual(expect.arrayContaining(['typeMismatch', 'unknownVariable']));
  });

  it('forEach needs a set and gives its element type to the variable', () => {
    const def: EffectDef = {
      ...ERDBEBEN,
      name: 'Liste',
      body: [
        { kind: 'forEach', var: 'x', in: v('stärke'), body: [] },
        {
          kind: 'forEach',
          var: 'g',
          in: q('allFigures'),
          body: [
            {
              kind: 'do',
              effect: { kind: 'heal', target: { kind: 'value', expr: v('g') }, amount: 1 },
            },
          ],
        },
      ],
    };
    expect(check(def)).toEqual(['notASet']);
  });

  it('enforces structural limits: repeat ≤ 10, names, no identity variables', () => {
    const def: EffectDef = {
      name: 'Zu viel',
      author: 'x',
      symbol: 'abc',
      params: [{ name: 'rolle', type: 'number' }],
      body: [{ kind: 'repeat', times: num(11), body: [] }],
    };
    expect(check(def)).toEqual(
      expect.arrayContaining(['effectName', 'symbolTooLong', 'forbiddenProperty', 'repeatRange']),
    );
  });

  it('rules: calls need a known effect with matching arguments', () => {
    const settings = cloneSettings(DEFAULT_SETTINGS);
    const ast = (text: string) => parseRule(text).rule!.ast;
    expect(
      validateRule(ast('REGEL "A"\nWENN TREFFER\nDANN Erdbeben(1)'), settings, DEFAULT_NPC_TYPES, [
        ERDBEBEN,
      ]),
    ).toEqual([]);
    const codes = (text: string) =>
      validateRule(ast(text), settings, DEFAULT_NPC_TYPES, [ERDBEBEN]).map((e) => e.code);
    expect(codes('REGEL "A"\nWENN TREFFER\nDANN Beben(1)')).toContain('unknownEffect');
    expect(codes('REGEL "A"\nWENN TREFFER\nDANN Erdbeben(1, 2)')).toContain('argCount');
    expect(codes('REGEL "A"\nWENN TREFFER\nDANN Erdbeben(angreifer)')).toContain('argType');
  });
});

describe('effect calls in the rule language', () => {
  it('parses and prints Name(args) with numbers, figures, tiles and sets', () => {
    const text =
      'REGEL "A"\nWENN TREFFER\nDANN Erdbeben(1)\nDANN Schubs(angreifer, ziel.feld, alle, nachbarfelder, "x")';
    const r = parseRule(text);
    expect(r.errors).toEqual([]);
    expect(printRule(r.rule!.ast)).toBe(text);
    expect(r.rule!.ast.effects[1]).toMatchObject({
      kind: 'call',
      effect: 'Schubs',
      args: [
        { kind: 'figureRef', ref: 'attacker' },
        { kind: 'tileRef', tile: { kind: 'figureTile', ref: 'target' } },
        { kind: 'targets', target: { kind: 'all' } },
        { kind: 'tiles', target: { kind: 'neighborTiles' } },
        { kind: 'str', value: 'x' },
      ],
    });
  });
});

describe('interpreter (SPEC 5.7 / 5.8)', () => {
  it('"Beben bei Treffer": Erdbeben(1) removes empty neighbor tiles in a game', () => {
    let removed = 0;
    for (let seed = 1; seed <= 8; seed++) {
      let s = place(
        makeGame(1, (st) => (st.rules.activationDelay = 0), seed),
        'f2',
        3,
        3,
      );
      s = place(s, 'f1', 3, 3);
      s = { ...s, settings: { ...s.settings, combat: { ...s.settings.combat, wheelChance: 90 } } };
      s = ok(applyAction(s, stay('f1')));
      s = ok(
        applyAction(s, {
          type: 'addRule',
          actor: 'f1',
          rule: ruleText('REGEL "Beben bei Treffer"\nWENN TREFFER\nDANN Erdbeben(1)', [ERDBEBEN]),
        }),
      );
      expect(s.effects.map((e) => e.name)).toEqual(['Erdbeben']);
      // boss (f2) attacks f1 on (3,3) next round … play until a hit happens
      for (let i = 0; i < 12 && s.status === 'playing'; i++) {
        const me = s.turn.order[s.turn.index]!;
        s = ok(applyAction(s, stay(me)));
        if (s.turn.order[s.turn.index] !== me) continue;
        const other = me === 'f1' ? 'f2' : 'f1';
        const r = applyAction(s, { type: 'attack', actor: me, target: other });
        s = r.ok ? r.state : ok(applyAction(s, { type: 'pass', actor: me }));
      }
      removed += 36 - Object.keys(s.tiles).length;
    }
    expect(removed).toBeGreaterThan(0);
  });

  it('stops runaway effects with the step budget and keeps changes so far', () => {
    // 10 × 10 × 10 × 10 iterations with a world change in the innermost loop
    const loop = (body: Stmt[]): Stmt => ({ kind: 'repeat', times: num(10), body });
    const endless: EffectDef = {
      name: 'Endlos',
      author: 'x',
      symbol: '∞',
      params: [],
      body: [
        loop([
          loop([
            loop([
              loop([
                {
                  kind: 'do',
                  effect: {
                    kind: 'setVar',
                    scope: { kind: 'world' },
                    name: 'z',
                    op: '+',
                    value: num(1),
                  },
                },
              ]),
            ]),
          ]),
        ]),
      ],
    };
    let s = ok(
      applyAction(
        makeGame(1, (st) => (st.rules.activationDelay = 0)),
        stay('f1'),
      ),
    );
    s = ok(
      applyAction(s, {
        type: 'addRule',
        actor: 'f1',
        rule: ruleText('REGEL "E"\nWENN ZUGSTART\nDANN Endlos()', [endless]),
      }),
    );
    const r = applyAction(s, { type: 'pass', actor: 'f2' });
    if (!r.ok) throw new Error();
    expect(r.events.some((e) => e.type === 'effectAborted' && e.reason === 'steps')).toBe(true);
    expect(r.state.world.z).toBeGreaterThan(0);
    expect(r.state.world.z).toBeLessThan(10_000);
  });

  it('limits the call depth to 5 (recursion)', () => {
    const rec: EffectDef = {
      name: 'Tiefer',
      author: 'x',
      symbol: 'T',
      params: [],
      body: [
        {
          kind: 'do',
          effect: { kind: 'setVar', scope: { kind: 'world' }, name: 'd', op: '+', value: num(1) },
        },
        { kind: 'do', effect: { kind: 'call', effect: 'Tiefer', args: [] } },
      ],
    };
    let s = ok(
      applyAction(
        makeGame(1, (st) => (st.rules.activationDelay = 0)),
        stay('f1'),
      ),
    );
    s = ok(
      applyAction(s, {
        type: 'addRule',
        actor: 'f1',
        rule: ruleText('REGEL "R"\nWENN ZUGSTART\nDANN Tiefer()', [rec]),
      }),
    );
    const r = applyAction(s, { type: 'pass', actor: 'f2' });
    if (!r.ok) throw new Error();
    const aborts = r.events.filter((e) => e.type === 'effectAborted' && e.reason === 'depth');
    expect(aborts.length).toBeGreaterThan(0);
    // each firing runs exactly 5 nested calls before the depth limit stops it
    expect((r.state.world.d ?? 0) - (s.world.d ?? 0)).toBe(5 * aborts.length);
  });

  it('primitives keep their limits inside effects (no instant death)', () => {
    const hard: EffectDef = {
      name: 'Hammer',
      author: 'x',
      symbol: 'H',
      params: [{ name: 'opfer', type: 'figure' }],
      body: [
        {
          kind: 'repeat',
          times: num(10),
          body: [
            {
              kind: 'do',
              effect: { kind: 'damage', target: { kind: 'value', expr: v('opfer') }, amount: 1 },
            },
          ],
        },
      ],
    };
    let s = ok(
      applyAction(
        makeGame(1, (st) => (st.rules.activationDelay = 0)),
        stay('f1'),
      ),
    );
    s = ok(
      applyAction(s, {
        type: 'addRule',
        actor: 'f1',
        rule: ruleText('REGEL "H"\nWENN ZUGSTART\nDANN Hammer(auslöser)', [hard]),
      }),
    );
    s = ok(applyAction(s, { type: 'pass', actor: 'f2' }));
    // boss has 4 life; rule damage per round is capped at 2
    expect(s.figures.f2!.hp).toBe(2);
  });

  it('MERKE, WÄHLE ZUFÄLLIG, TEXTUR and SPIELE', () => {
    const def: EffectDef = {
      name: 'Bunt',
      author: 'x',
      symbol: 'B',
      params: [],
      body: [
        { kind: 'let', name: 'n', value: q('count', q('allFigures')) },
        { kind: 'pick', var: 't', from: q('emptyTiles') },
        { kind: 'texture', tile: v('t'), name: { kind: 'str', value: 'Sumpf' } },
        {
          kind: 'do',
          effect: { kind: 'setVar', scope: { kind: 'world' }, name: 'n', op: '=', value: v('n') },
        },
        { kind: 'play', sound: { kind: 'str', value: 'pling' } },
      ],
    };
    expect(check(def)).toEqual([]);
    let s = ok(
      applyAction(
        makeGame(2, (st) => (st.rules.activationDelay = 0)),
        stay('f1'),
      ),
    );
    s = ok(
      applyAction(s, {
        type: 'addRule',
        actor: 'f1',
        rule: ruleText('REGEL "B"\nWENN ZUGSTART\nDANN Bunt()', [def]),
      }),
    );
    const r = applyAction(s, { type: 'pass', actor: 'f2' });
    if (!r.ok) throw new Error();
    expect(r.state.world.n).toBe(3);
    expect(
      Object.values(r.state.tiles).some(
        (t) => t.textureId && r.state.textureNames[t.textureId] === 'Sumpf',
      ),
    ).toBe(true);
    expect(r.events.some((e) => e.type === 'soundPlayed')).toBe(true);
  });

  it('rejects rules whose bundled effect is invalid', () => {
    const broken: EffectDef = { ...ERDBEBEN, body: [] };
    const s = ok(applyAction(makeGame(1), stay('f1')));
    const r = applyAction(s, {
      type: 'addRule',
      actor: 'f1',
      rule: ruleText('REGEL "A"\nWENN TREFFER\nDANN Erdbeben(1)', [broken]),
    });
    expect(r.ok ? null : r.error.code).toBe('invalidRule');
  });

  it('custom NPC types travel with the rule and can be spawned', () => {
    const geist = {
      id: 'geist',
      name: 'Geist',
      symbol: 'G',
      color: '#9B5CF6',
      hp: 2,
      move: 2,
      behavior: 'wander' as const,
    };
    let s = ok(
      applyAction(
        makeGame(1, (st) => (st.rules.activationDelay = 0)),
        stay('f1'),
      ),
    );
    const r = parseRule(
      'REGEL "Spuk"\nWENN ZUGSTART\nDANN SPAWNE geist AUF zufälliges_leeres_feld',
    );
    const def: RuleDefinition = {
      id: 'own.s',
      author: 'T',
      ast: r.rule!.ast,
      bundle: { effects: [], npcTypes: [geist] },
    };
    s = ok(applyAction(s, { type: 'addRule', actor: 'f1', rule: def }));
    s = ok(applyAction(s, { type: 'pass', actor: 'f2' }));
    const npc = Object.values(s.figures).find((f) => f.npcTypeId === 'geist');
    expect(npc).toMatchObject({ hp: 2, baseMove: 2 });
  });
});
