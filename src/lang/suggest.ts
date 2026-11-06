import { fold } from './keywords';

export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min((prev[j] ?? 0) + 1, (cur[j - 1] ?? 0) + 1, (prev[j - 1] ?? 0) + cost);
    }
    prev = cur;
  }
  return prev[n] ?? 0;
}

/** Closest candidate for "Meintest du …?", or null if nothing is reasonably close. */
export function suggest(word: string, candidates: readonly string[]): string | null {
  const w = fold(word);
  let best: { c: string; d: number } | null = null;
  for (const c of candidates) {
    const d = levenshtein(w, fold(c));
    if (!best || d < best.d) best = { c, d };
  }
  if (!best) return null;
  const limit = Math.max(2, Math.floor(w.length / 3));
  return best.d <= limit ? best.c : null;
}
