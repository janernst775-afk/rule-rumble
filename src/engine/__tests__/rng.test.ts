import { describe, expect, it } from 'vitest';
import { deriveRng, nextFloat, randomInt } from '../rng';

describe('rng', () => {
  it('is deterministic for the same seed', () => {
    const seq = (seed: number) => {
      const h = { rng: seed };
      return Array.from({ length: 5 }, () => randomInt(h, 1000));
    };
    expect(seq(7)).toEqual(seq(7));
    expect(seq(7)).not.toEqual(seq(8));
  });

  it('returns floats in [0, 1)', () => {
    let s = 123;
    for (let i = 0; i < 1000; i++) {
      const r = nextFloat(s);
      expect(r.value).toBeGreaterThanOrEqual(0);
      expect(r.value).toBeLessThan(1);
      s = r.state;
    }
  });

  it('derives independent streams without touching the base', () => {
    expect(deriveRng(5, 'a')).toBe(deriveRng(5, 'a'));
    expect(deriveRng(5, 'a')).not.toBe(deriveRng(5, 'b'));
  });
});
