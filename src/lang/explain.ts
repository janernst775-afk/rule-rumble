// AST → plain-language sentence (SPEC 5.4 "Klartext-Vorschau"). Pure: the caller passes
// a translate function (i18next's t in the UI); keys live under explain.* in de.json.
import type { Effect, Expr, FigureRef, RuleAST, Target, TileTarget, Trigger } from './ast';

export type Translate = (key: string, params?: Record<string, string | number>) => string;

function figure(ref: FigureRef, t: Translate): string {
  return t(`explain.figure.${ref}`);
}

function triggerText(tr: Trigger, t: Translate): string {
  if (tr.kind === 'everyNRounds') return t('explain.trigger.everyNRounds', { n: tr.n });
  if (tr.kind === 'enters')
    return t(tr.newOnly ? 'explain.trigger.entersNew' : 'explain.trigger.enters');
  return t(`explain.trigger.${tr.kind}`);
}

function valueText(e: Expr, t: Translate): string {
  switch (e.kind) {
    case 'num':
      return String(e.value);
    case 'str':
      return `„${e.value}“`;
    case 'figureProp':
      return t(`explain.prop.${e.prop}`, { of: figure(e.ref, t) });
    case 'figureVar':
      return t('explain.figureVar', { name: e.name, of: figure(e.ref, t) });
    case 'tileProp': {
      const tile =
        e.tile.kind === 'figureTile'
          ? t('explain.tileOf', { of: figure(e.tile.ref, t) })
          : t(`explain.tile.${e.tile.kind}`);
      return t(`explain.tileProp.${e.prop}`, { tile });
    }
    case 'global':
      return t(`explain.global.${e.name}`);
    case 'worldVar':
      return t('explain.worldVar', { name: e.name });
    case 'amount':
      return t('explain.amount');
    default:
      return condText(e, t);
  }
}

function condText(e: Expr, t: Translate): string {
  switch (e.kind) {
    case 'chance':
      return t('explain.chance', { percent: e.percent });
    case 'cmp':
      return t(`explain.cmp.${opKey(e.op)}`, {
        left: valueText(e.left, t),
        right: valueText(e.right, t),
      });
    case 'not':
      return t('explain.not', { cond: condText(e.item, t) });
    case 'and':
      return e.items.map((i) => condText(i, t)).join(` ${t('explain.and')} `);
    case 'or':
      return `(${e.items.map((i) => condText(i, t)).join(` ${t('explain.or')} `)})`;
    default:
      return valueText(e, t);
  }
}

function opKey(op: string): string {
  return { '=': 'eq', '!=': 'ne', '<': 'lt', '>': 'gt', '<=': 'le', '>=': 'ge' }[op] ?? 'eq';
}

function targetText(tg: Target, t: Translate): string {
  return tg.kind === 'ref' ? figure(tg.ref, t) : t(`explain.target.${tg.kind}`);
}

function tileText(tt: TileTarget, t: Translate): string {
  if (tt.kind === 'figureTile') return t('explain.tileOf', { of: figure(tt.ref, t) });
  if (tt.kind === 'tilesOfType') return t('explain.tile.tilesOfType', { type: tt.tileType });
  return t(`explain.tile.${tt.kind}`);
}

export function effectText(e: Effect, t: Translate): string {
  switch (e.kind) {
    case 'spawn':
      return t('explain.effect.spawn', { npc: capitalize(e.npcType), tile: tileText(e.at, t) });
    case 'damage':
    case 'heal':
    case 'shield':
    case 'skip':
    case 'teleport':
      return t(`explain.effect.${e.kind}`, { target: targetText(e.target, t) });
    case 'moveMod':
    case 'wheelMod':
      return t(`explain.effect.${e.kind}${e.delta >= 0 ? 'Up' : 'Down'}`, {
        target: targetText(e.target, t),
        delta: Math.abs(e.delta),
        count: e.rounds,
      });
    case 'push':
      return t('explain.effect.push', {
        target: targetText(e.target, t),
        tile: tileText(e.from, t),
      });
    case 'setTileType':
      return t('explain.effect.setTileType', { tile: tileText(e.at, t), type: e.tileType });
    case 'removeTile':
    case 'addTileNear':
      return t(`explain.effect.${e.kind}`, { tile: tileText(e.at, t) });
    case 'setVar': {
      const owner = e.scope.kind === 'world' ? t('explain.world') : targetText(e.scope.target, t);
      const key = e.op === '=' ? 'setVarSet' : e.op === '+' ? 'setVarAdd' : 'setVarSub';
      return t(`explain.effect.${key}`, { name: e.name, owner, value: valueText(e.value, t) });
    }
    case 'message':
      return t('explain.effect.message', { text: e.text });
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** One or two sentences describing the rule. */
export function explainRule(rule: RuleAST, t: Translate): string {
  let head = triggerText(rule.trigger, t);
  if (rule.conditions.length > 0) {
    head += ` ${t('explain.if', { cond: rule.conditions.map((c) => condText(c, t)).join(` ${t('explain.and')} `) })}`;
  }
  const then = rule.effects.map((e) => effectText(e, t)).join(', ');
  let text = `${capitalize(head)}: ${then}.`;
  if (rule.elseEffects.length > 0) {
    text += ` ${t('explain.otherwise', { effects: rule.elseEffects.map((e) => effectText(e, t)).join(', ') })}`;
  }
  if (rule.limit) {
    text += ` ${t(`explain.limit.${rule.limit.per}`, { count: rule.limit.count })}`;
  }
  if (rule.duration !== null) text += ` ${t('explain.duration', { count: rule.duration })}`;
  return text;
}
