import { describe, expect, it } from 'vitest';
import type { NpcType } from '../../engine/types';
import { parseProgram } from '../../lang/parser';
import { SCHWAECHSTE_GEIST_FLUT } from '../../lang/__tests__/spec58';
import type { TextureRecord } from '../../assets/store';
import { buildPackage, packageJson, readPackage, PACKAGE_FORMAT } from '../rulePackage';

const program = parseProgram(SCHWAECHSTE_GEIST_FLUT).parsed.program;
const geist: NpcType = {
  id: 'geist',
  name: 'Geist',
  symbol: 'G',
  color: '#9B5CF6',
  image: 'data:image/png;base64,AAAA',
  hp: 1,
  move: 1,
  behavior: 'chase',
  code: program.npcCode[0]?.body ?? null,
};
const sumpf: TextureRecord = {
  id: 'tex1',
  name: 'Sumpf',
  dataUrl: 'data:image/png;base64,BBBB',
  author: 'A',
  createdAt: 1,
  inLibrary: true,
};
const empty = { effects: [], functions: [], npcTypes: [] };

describe('rule packages (SPEC 5.9)', () => {
  it('exports rules with everything they need and imports them again', () => {
    const rule = parseProgram(
      'REGEL "Spuk"\nWENN BETRITT feld\nUND feld.textur = "Sumpf"\nDANN SPAWNE geist AUF feld',
    ).parsed.program.rules[0]!;
    const pkg = buildPackage(
      [{ id: 'own.spuk', author: 'Jan', ast: rule }],
      { effects: [], functions: program.functions, npcTypes: [geist] },
      [sumpf],
      false,
    );
    expect(pkg.format).toBe(PACKAGE_FORMAT);
    expect(pkg.npcTypes.map((n) => n.id)).toEqual(['geist']);
    // Geist's own code calls schwächste(): the function travels along.
    expect(pkg.functions.map((f) => f.name)).toEqual(['schwächste']);
    expect(pkg.textures.map((t) => t.name)).toEqual(['Sumpf']);
    expect(pkg.sounds).toEqual([]);

    const back = readPackage(packageJson(pkg), empty);
    expect(back).not.toBeNull();
    expect(back?.rejected).toBe(0);
    expect(back?.rules.map((r) => r.ast.name)).toEqual(['Spuk']);
    expect(back?.npcTypes[0]?.code).toEqual(geist.code);
    expect(back?.textures[0]?.dataUrl).toBe(sumpf.dataUrl);
  });

  it('exports the whole workshop when asked', () => {
    const pkg = buildPackage(
      [{ id: 'own.flut', author: 'Jan', ast: program.rules[0]! }],
      { effects: [], functions: program.functions, npcTypes: [geist] },
      [],
      true,
    );
    expect(pkg.rules.length).toBe(1);
    expect(pkg.functions.length).toBe(1);
    expect(pkg.npcTypes.length).toBe(1);
  });

  it('rejects broken or unsafe parts of an imported package', () => {
    const evil = parseProgram('FUNKTION boese(x)\n  SCHADEN x 1\n  GIB ZURÜCK 1\nENDE').parsed
      .program.functions[0];
    const text = JSON.stringify({
      format: PACKAGE_FORMAT,
      version: 1,
      rules: [{ id: 'x', author: 'y', ast: { name: 'kaputt' } }],
      effects: [],
      functions: [evil],
      npcTypes: [{ ...geist, hp: 99 }],
      textures: [{ id: 't', name: 'Script', dataUrl: 'javascript:alert(1)' }],
      sounds: [],
    });
    const back = readPackage(text, empty);
    expect(back?.rules).toEqual([]);
    expect(back?.functions).toEqual([]);
    expect(back?.npcTypes).toEqual([]);
    expect(back?.textures).toEqual([]);
    expect(back?.rejected).toBe(4);
  });

  it('returns null for texts that are no package', () => {
    expect(readPackage('nicht json', empty)).toBeNull();
    expect(
      readPackage(JSON.stringify({ format: 'rule-rumble/rules', rules: [] }), empty),
    ).toBeNull();
  });
});
