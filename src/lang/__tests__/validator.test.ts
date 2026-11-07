import { describe, expect, it } from 'vitest';
import { DEFAULT_NPC_TYPES } from '../../engine/npc';
import { DEFAULT_SETTINGS, cloneSettings } from '../../engine/settings';
import type { Settings } from '../../engine/types';
import type { RuleAST } from '../ast';
import { fx, on, rule, where, who, x } from '../build';
import { START_RULES } from '../library/startRules';
import { validateRule } from '../validator';

function codes(ast: RuleAST, settings: Settings = DEFAULT_SETTINGS): string[] {
  return validateRule(ast, settings, DEFAULT_NPC_TYPES).map((e) => e.code);
}

describe('validator', () => {
  it('accepts every start rule', () => {
    for (const r of START_RULES) expect(codes(r.ast), r.id).toEqual([]);
  });

  it('requires a name and 1–3 effects', () => {
    expect(codes(rule(' ', on.roundStart(), { then: [fx.say('x')] }))).toContain('nameMissing');
    expect(codes(rule('A', on.roundStart(), { then: [] }))).toContain('noEffects');
    const four = [fx.say('a'), fx.say('b'), fx.say('c'), fx.say('d')];
    expect(codes(rule('A', on.roundStart(), { then: four }))).toContain('tooManyEffects');
    expect(
      codes(
        rule('A', on.roundStart(), { when: [x.chance(50)], then: [fx.say('a')], otherwise: four }),
      ),
    ).toContain('tooManyEffects');
  });

  it('checks context values per trigger (SPEC 5.2)', () => {
    // RUNDENSTART has no auslöser
    expect(codes(rule('A', on.roundStart(), { then: [fx.damage(who.trigger)] }))).toContain(
      'contextMissing',
    );
    // TREFFER has angreifer/ziel, but no feld
    expect(codes(rule('A', on.hit(), { then: [fx.tileType(where.tile, 'lava')] }))).toContain(
      'contextMissing',
    );
    // von_feld only for BETRITT / VERLÄSST
    expect(codes(rule('A', on.dies(), { then: [fx.push(who.trigger, where.fromTile)] }))).toContain(
      'contextMissing',
    );
    // menge only for SCHADEN
    expect(
      codes(
        rule('A', on.turnStart(), { when: [x.cmp(x.amount, '>', x.num(0))], then: [fx.say('a')] }),
      ),
    ).toContain('contextMissing');
    expect(codes(rule('A', on.hit(), { then: [fx.damage(who.target)] }))).toEqual([]);
  });

  it('enforces the fixed limits (SPEC 6.2)', () => {
    const big = { kind: 'damage', target: who.all, amount: 3 } as const;
    expect(codes(rule('A', on.roundStart(), { then: [big] }))).toContain('amountRange');
    expect(codes(rule('A', on.roundStart(), { then: [fx.move(who.all, 5, 1)] }))).toContain(
      'deltaRange',
    );
    expect(codes(rule('A', on.roundStart(), { then: [fx.wheel(who.all, 80, 1)] }))).toContain(
      'deltaRange',
    );
    expect(codes(rule('A', on.roundStart(), { then: [fx.move(who.all, 1, 9)] }))).toContain(
      'roundsRange',
    );
    const longText = 'x'.repeat(81);
    expect(codes(rule('A', on.roundStart(), { then: [fx.say(longText)] }))).toContain(
      'messageTooLong',
    );
    const skip2 = { kind: 'skip', target: who.all, turns: 2 } as const;
    expect(codes(rule('A', on.roundStart(), { then: [skip2] }))).toContain('skipRange');
  });

  it('rejects identity properties – rules are the same for everyone (SPEC 6.1)', () => {
    for (const name of ['rolle', 'name', 'ersteller', 'Boss']) {
      const r = rule('A', on.turnStart(), {
        when: [x.cmp(x.figVar('trigger', name), '=', x.num(1))],
        then: [fx.say('a')],
      });
      expect(codes(r), name).toContain('forbiddenProperty');
    }
  });

  it('type-checks comparisons and tile types', () => {
    expect(
      codes(
        rule('A', on.enters(), { when: [x.cmp(x.tileType(), '=', x.num(1))], then: [fx.say('a')] }),
      ),
    ).toContain('typeMismatch');
    expect(
      codes(
        rule('A', on.enters(), {
          when: [x.cmp(x.tileType(), '=', x.str('sumpf'))],
          then: [fx.say('a')],
        }),
      ),
    ).toContain('unknownTileType');
    expect(
      codes(
        rule('A', on.enters(), {
          when: [x.cmp(x.tileType(), '<', x.str('lava'))],
          then: [fx.say('a')],
        }),
      ),
    ).toContain('stringCompare');
  });

  it('respects game settings: random off, NPCs off, unknown NPC type', () => {
    const noRandom = cloneSettings(DEFAULT_SETTINGS);
    noRandom.rules.allowRandom = false;
    expect(
      codes(rule('A', on.roundStart(), { then: [fx.shield(who.random)] }), noRandom),
    ).toContain('randomNotAllowed');
    expect(
      codes(rule('A', on.enters(), { when: [x.chance(30)], then: [fx.say('a')] }), noRandom),
    ).toContain('randomNotAllowed');
    const noNpcs = cloneSettings(DEFAULT_SETTINGS);
    noNpcs.npcs.maxOnBoard = 0;
    expect(codes(rule('A', on.enters(), { then: [fx.spawn('zombie')] }), noNpcs)).toContain(
      'npcsDisabled',
    );
    expect(codes(rule('A', on.enters(), { then: [fx.spawn('drache')] }))).toContain(
      'unknownNpcType',
    );
  });

  it('needs a condition for SONST', () => {
    expect(
      codes(rule('A', on.roundStart(), { then: [fx.say('a')], otherwise: [fx.say('b')] })),
    ).toContain('elseWithoutCondition');
  });
});
