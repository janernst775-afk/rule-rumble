import type { TFunction } from 'i18next';
import type { EffectKind, RuleDefinition, TriggerKind } from '../lang/ast';
import { explainRule } from '../lang/explain';
import { libraryKey } from '../lang/library/startRules';

export const TRIGGER_KINDS: TriggerKind[] = [
  'roundStart',
  'roundEnd',
  'everyNRounds',
  'turnStart',
  'turnEnd',
  'enters',
  'leaves',
  'attack',
  'hit',
  'miss',
  'damage',
  'dies',
  'tileAdded',
  'tileRemoved',
];

export const EFFECT_KINDS: EffectKind[] = [
  'spawn',
  'damage',
  'heal',
  'moveMod',
  'teleport',
  'push',
  'skip',
  'shield',
  'setTileType',
  'removeTile',
  'addTileNear',
  'wheelMod',
  'setVar',
  'message',
];

export function effectKinds(def: RuleDefinition): EffectKind[] {
  return [...new Set([...def.ast.effects, ...def.ast.elseEffects].map((e) => e.kind))];
}

/**
 * Plain-language description: start rules have a hand-written text, every other rule
 * is explained from its AST (lang/explain.ts).
 */
export function ruleDescription(def: RuleDefinition, t: TFunction): string {
  if (def.id.startsWith('start.')) {
    const key = `startRules.${libraryKey(def.id)}`;
    const text = t(key);
    if (text !== key) return text;
  }
  return explainRule(def.ast, (k, p) => t(k, p));
}

export function usesRandom(def: RuleDefinition): boolean {
  const json = JSON.stringify(def.ast);
  return /"kind":"(chance|random|randomTile|randomEmptyTile|teleport)"/.test(json);
}

export function spawnsNpcs(def: RuleDefinition): boolean {
  return effectKinds(def).includes('spawn');
}
