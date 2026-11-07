import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  TEMPLATES,
  TEMPLATE_IDS,
  bossHpFor,
  cloneSettings,
  countChangedValues,
  sanitizeSettings,
} from '../settings';

describe('settings', () => {
  it('has spec defaults', () => {
    expect(DEFAULT_SETTINGS.rules.maxActive).toBe(6);
    expect(DEFAULT_SETTINGS.board.startSize).toBe(6);
    expect(DEFAULT_SETTINGS.figures.heroHp).toBe(3);
    expect(DEFAULT_SETTINGS.combat.wheelChance).toBe(50);
  });

  it('provides six sane templates', () => {
    expect(TEMPLATE_IDS).toHaveLength(6);
    for (const id of TEMPLATE_IDS) {
      expect(sanitizeSettings(TEMPLATES[id])).toEqual(TEMPLATES[id]);
    }
  });

  it('computes boss hp per hero, solo and fixed', () => {
    expect(bossHpFor(DEFAULT_SETTINGS, 3)).toBe(12);
    expect(bossHpFor(DEFAULT_SETTINGS, 1)).toBe(3);
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.figures.bossHp = { mode: 'fixed', value: 7 };
    expect(bossHpFor(s, 4)).toBe(7);
  });

  it('clamps values and keeps the start board within min/max tiles', () => {
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.combat.wheelChance = 99;
    s.figures.heroMove = 7;
    s.board.startSize = 10;
    s.board.maxTiles = 60;
    const out = sanitizeSettings(s);
    expect(out.combat.wheelChance).toBe(90);
    expect(out.figures.heroMove).toBe(3);
    expect(out.board.maxTiles).toBe(100);
  });

  it('counts changed values', () => {
    const s = cloneSettings(DEFAULT_SETTINGS);
    s.figures.heroHp = 5;
    s.rules.maxActive = 7;
    expect(countChangedValues(DEFAULT_SETTINGS, s)).toBe(2);
  });
});
