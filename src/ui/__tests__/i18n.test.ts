import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import de from '../../locales/de.json';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
    return /\.tsx?$/.test(name) ? [p] : [];
  });
}

function has(obj: unknown, path: string): boolean {
  let cur: unknown = obj;
  for (const part of path.split('.')) {
    if (cur === null || typeof cur !== 'object' || !(part in cur)) return false;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string';
}

describe('i18n', () => {
  it('every literal t() key used in the UI exists in de.json', () => {
    const missing: string[] = [];
    for (const file of files('src/ui')) {
      const src = readFileSync(file, 'utf8');
      for (const m of src.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) {
        const key = m[1]!;
        if (!has(de, key) && !has(de, `${key}_one`)) missing.push(`${file}: ${key}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('engine log keys exist', () => {
    for (const key of [
      'log.roundStarted',
      'log.moved',
      'log.hit',
      'log.miss',
      'log.died',
      'log.passed',
      'log.shieldBlocked',
      'log.gameOver.heroes',
      'log.gameOver.boss',
      'log.gameOver.draw',
    ]) {
      expect(has(de, key), key).toBe(true);
    }
  });
});
