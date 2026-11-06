import { describe, expect, it } from 'vitest';
import { makeGame } from '../../engine/__tests__/helpers';
import { START_RULES } from '../../lang/library/startRules';
import { parseRule } from '../../lang/parser';
import { testRunRule } from '../testRun';

function rule(text: string) {
  const r = parseRule(text);
  if (!r.rule) throw new Error(JSON.stringify(r.errors));
  return { id: 'own.x', author: 'Test', ast: r.rule.ast };
}

describe('test run (SPEC 5.4)', () => {
  it('reports firings and affected figures over 10 rounds', () => {
    const res = testRunRule(
      makeGame(2),
      rule('REGEL "Gift"\nWENN RUNDENSTART\nDANN SCHADEN alle 1'),
      1,
    );
    expect(res.fired).toBeGreaterThan(0);
    expect(res.figures.length).toBeGreaterThan(0);
    expect(res.figures.every((f) => f.damage >= 1)).toBe(true);
  });

  it('works without a running game and is deterministic', () => {
    const def = START_RULES.find((r) => r.id === 'start.lava-steigt')!;
    const a = testRunRule(null, def, 7);
    expect(a).toEqual(testRunRule(null, def, 7));
    expect(a.tilesChanged).toBeGreaterThanOrEqual(3);
  });

  it('does not change the original game', () => {
    const g = makeGame(1);
    const before = JSON.stringify(g);
    testRunRule(g, START_RULES[0]!, 3);
    expect(JSON.stringify(g)).toBe(before);
  });
});
