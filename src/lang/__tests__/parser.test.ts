import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_NPC_TYPES } from '../../engine/npc';
import { DEFAULT_SETTINGS } from '../../engine/settings';
import { checkRuleText } from '../diagnose';
import { explainRule } from '../explain';
import { START_RULES } from '../library/startRules';
import { parseRule, parseRules } from '../parser';
import { printRule, printRules } from '../printer';
import { ruleStrength } from '../strength';
import { FIXTURE_RULES } from './startRulesFixture';

function parseOne(text: string) {
  const r = parseRule(text);
  if (!r.rule) throw new Error(JSON.stringify(r.errors));
  return r.rule.ast;
}

describe('parser round-trip (SPEC 5.6)', () => {
  it('the text library describes exactly the v0.3 rules', () => {
    expect(START_RULES.map((r) => r.ast)).toEqual(FIXTURE_RULES.map((r) => r.ast));
  });

  it.each(START_RULES.map((r) => [r.ast.name, r] as const))(
    '%s: print(parse(text)) is stable',
    (_n, def) => {
      const text = printRule(def.ast);
      const ast = parseOne(text);
      expect(ast).toEqual(def.ast);
      expect(printRule(ast)).toBe(text);
    },
  );

  it.each(START_RULES.map((r) => [r.ast.name, r] as const))(
    '%s: English print parses to the same AST',
    (_n, def) => {
      const en = printRule(def.ast, 'en');
      expect(parseOne(en)).toEqual(def.ast);
    },
  );

  it('the shipped text file is in normalized form', () => {
    const file = readFileSync('src/lang/library/start.regeln.txt', 'utf8');
    const body = file
      .split('\n')
      .filter((l) => !l.startsWith('#'))
      .join('\n')
      .trim();
    expect(body).toBe(printRules(START_RULES.map((r) => r.ast)));
  });

  it('normalizes case, spacing, comments and umlaut spellings', () => {
    const messy = [
      '# Kommentar',
      'regel   "Teleport"   # dahinter auch',
      'wenn zugstart',
      'und zufall 15 %',
      'dann teleport AUSLOESER zufaellig',
    ].join('\n');
    expect(printRule(parseOne(messy))).toBe(
      [
        'REGEL "Teleport"',
        'WENN ZUGSTART',
        'UND ZUFALL 15%',
        'DANN TELEPORT auslöser ZUFÄLLIG',
      ].join('\n'),
    );
  });

  it('accepts English aliases and mixed language', () => {
    const en = [
      'RULE "Lava"',
      'IF ENTERS tile',
      'AND tile.type = lava AND NOT trigger.hp < 2',
      'THEN DAMAGE trigger 1',
      'ELSE WHEEL trigger +10% FOR 2 ROUNDS',
      'DURATION 3 ROUNDS',
      'LIMIT 2 PER TURN',
    ].join('\n');
    const de = parseOne(en);
    expect(printRule(de)).toBe(
      [
        'REGEL "Lava"',
        'WENN BETRITT feld',
        'UND feld.typ = lava UND NICHT auslöser.leben < 2',
        'DANN SCHADEN auslöser 1',
        'SONST RADCHANCE auslöser +10% FÜR 2 RUNDEN',
        'DAUER 3 RUNDEN',
        'LIMIT 2 PRO ZUG',
      ].join('\n'),
    );
  });

  it('keeps precedence with ODER, UND, NICHT and parentheses', () => {
    const ast = parseOne(
      'REGEL "P"\nWENN RUNDENENDE\nUND (runde > 3 ODER welt.flut = 1) UND NICHT (anzahl_npcs >= 2)\nDANN ZEIGE "x"',
    );
    expect(printRule(ast)).toContain(
      'UND (runde > 3 ODER welt.flut = 1) UND NICHT anzahl_npcs >= 2',
    );
    expect(parseOne(printRule(ast))).toEqual(ast);
  });

  it('parses several rules in one text', () => {
    const { rules, errors } = parseRules(printRules(START_RULES.slice(0, 3).map((r) => r.ast)));
    expect(errors).toEqual([]);
    expect(rules).toHaveLength(3);
  });

  it('escapes quotes in names and messages', () => {
    const ast = parseOne('REGEL "Er sagt \\"Hallo\\""\nWENN RUNDENSTART\nDANN ZEIGE "a \\"b\\""');
    expect(ast.name).toBe('Er sagt "Hallo"');
    expect(parseOne(printRule(ast))).toEqual(ast);
  });
});

describe('error messages with line, column and suggestion (SPEC 5.4)', () => {
  it('unknown event word → suggestion', () => {
    const { errors } = parseRule('REGEL "A"\nWENN RUNDENSTRAT\nDANN ZEIGE "x"');
    expect(errors[0]).toMatchObject({
      code: 'unknownEvent',
      line: 2,
      col: 6,
      suggestion: 'RUNDENSTART',
    });
  });

  it('unknown target → suggestion', () => {
    const { errors } = parseRule('REGEL "A"\nWENN TREFFER\nDANN SCHADEN angrefer 1');
    expect(errors[0]).toMatchObject({ code: 'unknownTarget', line: 3, suggestion: 'angreifer' });
  });

  it('unknown line keyword → suggestion', () => {
    const { errors } = parseRule('REGEL "A"\nWEN RUNDENSTART\nDANN ZEIGE "x"');
    expect(errors[0]).toMatchObject({ code: 'unknownLine', line: 2, col: 1, suggestion: 'WENN' });
  });

  it('missing parts and unterminated strings', () => {
    expect(parseRule('REGEL "A"\nWENN RUNDENSTART').errors[0]?.code).toBe('missingThen');
    expect(parseRule('WENN RUNDENSTART').errors[0]?.code).toBe('expectedRule');
    expect(parseRule('REGEL "A\nWENN RUNDENSTART\nDANN ZEIGE "x"').errors[0]?.code).toBe(
      'unterminatedString',
    );
    expect(parseRule('REGEL "A"\nWENN RUNDENSTART\nDANN SCHADEN alle eins').errors[0]?.code).toBe(
      'expectedNumber',
    );
  });

  it('trailing words are reported', () => {
    const { errors } = parseRule('REGEL "A"\nWENN RUNDENSTART jetzt\nDANN ZEIGE "x"');
    expect(errors[0]).toMatchObject({ code: 'trailing', line: 2, col: 18 });
  });

  it('context errors name the line and suggest a valid word', () => {
    const { diagnostics } = checkRuleText(
      'REGEL "A"\nWENN RUNDENSTART\nDANN SCHADEN auslöser 1',
      DEFAULT_SETTINGS,
      DEFAULT_NPC_TYPES,
    );
    expect(diagnostics[0]).toMatchObject({
      key: 'validation.contextMissingAt',
      line: 3,
      params: { value: 'auslöser', event: 'RUNDENSTART' },
      suggestion: 'alle',
    });
  });

  it('collects one error per line and keeps parsing', () => {
    const { errors } = parseRule('REGEL "A"\nWENN XY\nDANN FOO\nDANN ZEIGE "ok"');
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });
});

describe('explain and strength', () => {
  const t = (key: string, params?: Record<string, string | number>) =>
    `${key}${params ? JSON.stringify(params) : ''}`;

  it('explains every start rule without throwing', () => {
    for (const r of START_RULES) expect(explainRule(r.ast, t).length).toBeGreaterThan(10);
  });

  it('rates rules harmless / exciting / heavy', () => {
    const levels = START_RULES.map((r) => ruleStrength(r.ast).level);
    expect(new Set(levels).size).toBeGreaterThan(1);
    const heavy = parseOne('REGEL "H"\nWENN ZUGSTART\nDANN SCHADEN alle 1');
    expect(ruleStrength(heavy).level).toBe('heavy');
    const mild = parseOne('REGEL "M"\nWENN ALLE 5 RUNDEN\nDANN ZEIGE "Hallo"');
    expect(ruleStrength(mild).level).toBe('harmless');
  });
});
