// Rule packages (SPEC 5.9): rules, effects, functions, NPC types, textures and sounds in one
// JSON file, so players can share whole game modes. Imported files are untrusted: every
// part is shape-checked and validated before it is used.
import type { TextureRecord } from '../assets/store';
import { DEFAULT_NPC_TYPES } from '../engine/npc';
import { validNpcType } from '../engine/rules';
import { DEFAULT_SETTINGS } from '../engine/settings';
import type { NpcType } from '../engine/types';
import type { EffectDef, Expr, FunctionDef, RuleDefinition } from '../lang/ast';
import { resolveBundle, visitExpr, visitStmts } from '../lang/bundle';
import { validateEffect, validateFunction, validateNpcCode, validateRule } from '../lang/validator';

export const PACKAGE_FORMAT = 'rule-rumble/package';

export interface PackageTexture {
  id: string;
  name: string;
  dataUrl: string;
}

export interface RulePackage {
  format: typeof PACKAGE_FORMAT;
  version: 1;
  rules: RuleDefinition[];
  effects: EffectDef[];
  functions: FunctionDef[];
  npcTypes: NpcType[];
  textures: PackageTexture[];
  /** Own sounds (v0.7); always empty until then. */
  sounds: unknown[];
}

const MAX_TEXTURE_URL = 400_000;

function byName<T extends { name: string }>(list: readonly T[]): T[] {
  const seen = new Map<string, T>();
  for (const x of list) seen.set(x.name.toLowerCase(), x);
  return [...seen.values()];
}

/** Text literals used anywhere in rules and code (to find the textures a package needs). */
function textsOf(
  rules: RuleDefinition[],
  effects: EffectDef[],
  functions: FunctionDef[],
): Set<string> {
  const out = new Set<string>();
  const onExpr = (e: Expr) => {
    if (e.kind === 'str') out.add(e.value.toLowerCase());
  };
  for (const r of rules) {
    r.ast.conditions.forEach((c) => visitExpr(c, onExpr));
    visitStmts(
      [...r.ast.effects, ...r.ast.elseEffects].map((effect) => ({ kind: 'do', effect })),
      () => {},
      onExpr,
    );
  }
  for (const d of [...effects, ...functions]) visitStmts(d.body, () => {}, onExpr);
  return out;
}

/** Builds a package from rules plus everything they need from the workshop. */
export function buildPackage(
  rules: readonly RuleDefinition[],
  workshop: { effects: EffectDef[]; functions: FunctionDef[]; npcTypes: NpcType[] },
  textures: readonly TextureRecord[],
  includeWorkshop: boolean,
): RulePackage {
  const allNpcs = [...DEFAULT_NPC_TYPES, ...workshop.npcTypes];
  const effects: EffectDef[] = includeWorkshop ? [...workshop.effects] : [];
  const functions: FunctionDef[] = includeWorkshop ? [...workshop.functions] : [];
  const npcTypes: NpcType[] = includeWorkshop ? [...workshop.npcTypes] : [];
  const out: RuleDefinition[] = [];
  for (const rule of rules) {
    const b = resolveBundle(
      rule.ast,
      [...workshop.effects, ...(rule.bundle?.effects ?? [])],
      [...allNpcs, ...(rule.bundle?.npcTypes ?? [])],
      [...workshop.functions, ...(rule.bundle?.functions ?? [])],
    );
    effects.push(...b.effects);
    functions.push(...(b.functions ?? []));
    npcTypes.push(...b.npcTypes.filter((n) => !DEFAULT_NPC_TYPES.some((d) => d.id === n.id)));
    out.push({ id: rule.id, author: rule.author, ast: structuredClone(rule.ast) });
  }
  const uniqueEffects = byName(effects);
  const uniqueFunctions = byName(functions);
  const uniqueNpcs = [...new Map(npcTypes.map((n) => [n.id, n])).values()];
  const used = textsOf(out, uniqueEffects, uniqueFunctions);
  return {
    format: PACKAGE_FORMAT,
    version: 1,
    rules: out,
    effects: structuredClone(uniqueEffects),
    functions: structuredClone(uniqueFunctions),
    npcTypes: structuredClone(uniqueNpcs),
    textures: textures
      .filter((t) => used.has(t.name.toLowerCase()))
      .map((t) => ({ id: t.id, name: t.name, dataUrl: t.dataUrl })),
    sounds: [],
  };
}

export interface PackageImport {
  rules: RuleDefinition[];
  effects: EffectDef[];
  functions: FunctionDef[];
  npcTypes: NpcType[];
  textures: PackageTexture[];
  rejected: number;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

function list(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}

function looksLikeEffect(v: unknown): v is EffectDef {
  return (
    isObject(v) &&
    typeof v.name === 'string' &&
    typeof v.symbol === 'string' &&
    Array.isArray(v.params) &&
    Array.isArray(v.body)
  );
}

function looksLikeFunction(v: unknown): v is FunctionDef {
  return (
    isObject(v) &&
    typeof v.name === 'string' &&
    Array.isArray(v.params) &&
    v.params.every((p) => typeof p === 'string') &&
    Array.isArray(v.body)
  );
}

function looksLikeNpc(v: unknown): v is NpcType {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    typeof v.symbol === 'string' &&
    typeof v.color === 'string' &&
    (v.image === undefined || v.image === null || typeof v.image === 'string') &&
    (v.code === undefined || v.code === null || Array.isArray(v.code))
  );
}

function looksLikeRule(v: unknown): v is RuleDefinition {
  if (!isObject(v) || typeof v.id !== 'string' || typeof v.author !== 'string') return false;
  const ast = v.ast;
  return (
    isObject(ast) &&
    typeof ast.name === 'string' &&
    isObject(ast.trigger) &&
    Array.isArray(ast.conditions) &&
    Array.isArray(ast.effects) &&
    Array.isArray(ast.elseEffects)
  );
}

function looksLikeTexture(v: unknown): v is PackageTexture {
  return (
    isObject(v) &&
    typeof v.id === 'string' &&
    typeof v.name === 'string' &&
    v.name.length <= 30 &&
    typeof v.dataUrl === 'string' &&
    v.dataUrl.startsWith('data:image/png;base64,') &&
    v.dataUrl.length <= MAX_TEXTURE_URL
  );
}

/** Validation must never crash on hostile input. */
function safe(check: () => boolean): boolean {
  try {
    return check();
  } catch {
    return false;
  }
}

/** Reads a package; returns null if the text is no package at all. */
export function readPackage(
  text: string,
  existing: { effects: EffectDef[]; functions: FunctionDef[]; npcTypes: NpcType[] },
): PackageImport | null {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isObject(raw) || raw.format !== PACKAGE_FORMAT) return null;
  let rejected = 0;
  const keep = <T>(items: unknown[], shape: (v: unknown) => v is T): T[] => {
    const out: T[] = [];
    for (const item of items) {
      if (shape(item)) out.push(structuredClone(item));
      else rejected++;
    }
    return out;
  };
  const effects = keep(list(raw.effects), looksLikeEffect);
  const functions = keep(list(raw.functions), looksLikeFunction);
  const npcTypes = keep(list(raw.npcTypes), looksLikeNpc);
  const rules = keep(list(raw.rules), looksLikeRule);
  const textures = keep(list(raw.textures), looksLikeTexture);

  // Everything is checked together with what the player already has.
  const S = DEFAULT_SETTINGS;
  const allFunctions = byName([...existing.functions, ...functions]);
  const allEffects = byName([...existing.effects, ...effects]);
  const allNpcs = [
    ...new Map(
      [...DEFAULT_NPC_TYPES, ...existing.npcTypes, ...npcTypes].map((n) => [n.id, n]),
    ).values(),
  ];
  const okFunctions = functions.filter((f) =>
    safe(() => validateFunction(f, S, allFunctions).length === 0),
  );
  const okEffects = effects.filter((e) =>
    safe(() => validateEffect(e, S, allNpcs, allEffects, allFunctions).length === 0),
  );
  const okNpcs = npcTypes.filter((n) =>
    safe(
      () =>
        validNpcType(n) &&
        (!n.code ||
          validateNpcCode({ npc: n.id, body: n.code }, S, allNpcs, allEffects, allFunctions)
            .length === 0),
    ),
  );
  const okRules = rules.filter((r) =>
    safe(() => validateRule(r.ast, S, allNpcs, allEffects, allFunctions).length === 0),
  );
  rejected +=
    functions.length -
    okFunctions.length +
    effects.length -
    okEffects.length +
    npcTypes.length -
    okNpcs.length +
    rules.length -
    okRules.length;
  return {
    rules: okRules.map((r) => ({ id: r.id, author: r.author.slice(0, 30), ast: r.ast })),
    effects: okEffects,
    functions: okFunctions,
    npcTypes: okNpcs,
    textures,
    rejected,
  };
}

export function packageJson(pkg: RulePackage): string {
  return JSON.stringify(pkg, null, 2);
}
