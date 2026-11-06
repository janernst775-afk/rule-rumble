// Deterministic seeded RNG (mulberry32). The state is a single 32-bit integer
// stored in GameState.rng, so games are reproducible from seed + actions.

/** Advances the state and returns a float in [0, 1). */
export function nextFloat(state: number): { value: number; state: number } {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Mutable cursor over an RNG state, for use inside a reducer draft. */
export interface RngHolder {
  rng: number;
}

export function randomFloat(holder: RngHolder): number {
  const { value, state } = nextFloat(holder.rng);
  holder.rng = state;
  return value;
}

/** Integer in [0, maxExclusive). */
export function randomInt(holder: RngHolder, maxExclusive: number): number {
  return Math.floor(randomFloat(holder) * maxExclusive);
}

export function randomPick<T>(holder: RngHolder, items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined;
  return items[randomInt(holder, items.length)];
}

/** Normalizes any number to a valid 32-bit seed. */
export function normalizeSeed(seed: number): number {
  return seed | 0;
}

/**
 * Derives an independent RNG state from a base state and a string salt
 * without advancing the base. Used by bots so that their choices are
 * reproducible but do not consume the game RNG.
 */
export function deriveRng(base: number, salt: string): number {
  let h = base ^ 0x9e3779b9;
  for (let i = 0; i < salt.length; i++) {
    h = Math.imul(h ^ salt.charCodeAt(i), 0x85ebca6b);
    h ^= h >>> 13;
  }
  return h | 0;
}
