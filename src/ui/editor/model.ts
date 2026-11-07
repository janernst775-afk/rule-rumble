// Editor model: default blocks for the palette and the options that make sense for the
// current trigger (only context values the trigger offers, SPEC 5.2).
import type { TileType } from '../../engine/types';
import type {
  EffectDef,
  Effect,
  EffectKind,
  Expr,
  FigureRef,
  RuleAST,
  Target,
  TileTarget,
  Trigger,
  TriggerKind,
} from '../../lang/ast';
import { hasAnchor, TRIGGER_CONTEXT } from '../../lang/context';

export const TILE_TYPES: TileType[] = ['normal', 'lava', 'eis', 'heilquelle', 'falle'];

export function emptyRule(name: string): RuleAST {
  return {
    name,
    trigger: { kind: 'enters', newOnly: true },
    conditions: [],
    effects: [],
    elseEffects: [],
    duration: null,
    limit: null,
  };
}

export function defaultTrigger(kind: TriggerKind): Trigger {
  if (kind === 'everyNRounds') return { kind, n: 3 };
  if (kind === 'enters') return { kind, newOnly: false };
  if (kind === 'custom') return { kind, event: 'signal' };
  return { kind } as Trigger;
}

export type ConditionTemplate = 'chance' | 'hp' | 'tileType' | 'round' | 'texture' | 'variable';
export const CONDITION_TEMPLATES: ConditionTemplate[] = [
  'chance',
  'hp',
  'tileType',
  'round',
  'texture',
  'variable',
];

function firstRef(trigger: Trigger): FigureRef | null {
  return TRIGGER_CONTEXT[trigger.kind].figures[0] ?? null;
}

/** A sensible condition for the current trigger. */
export function defaultCondition(template: ConditionTemplate, trigger: Trigger): Expr {
  const ref = firstRef(trigger);
  const ctx = TRIGGER_CONTEXT[trigger.kind];
  const tile = ctx.eventTile
    ? ({ kind: 'eventTile' } as const)
    : ref
      ? ({ kind: 'figureTile', ref } as const)
      : null;
  switch (template) {
    case 'chance':
      return { kind: 'chance', percent: 30 };
    case 'hp':
      return ref
        ? {
            kind: 'cmp',
            op: '<',
            left: { kind: 'figureProp', ref, prop: 'hp' },
            right: { kind: 'num', value: 2 },
          }
        : {
            kind: 'cmp',
            op: '>',
            left: { kind: 'global', name: 'round' },
            right: { kind: 'num', value: 3 },
          };
    case 'tileType':
      return tile
        ? {
            kind: 'cmp',
            op: '=',
            left: { kind: 'tileProp', tile, prop: 'type' },
            right: { kind: 'str', value: 'lava' },
          }
        : {
            kind: 'cmp',
            op: '>',
            left: { kind: 'global', name: 'tileCount' },
            right: { kind: 'num', value: 30 },
          };
    case 'texture':
      return tile
        ? {
            kind: 'cmp',
            op: '=',
            left: { kind: 'tileProp', tile, prop: 'texture' },
            right: { kind: 'str', value: 'Sumpf' },
          }
        : {
            kind: 'cmp',
            op: '>',
            left: { kind: 'global', name: 'tileCount' },
            right: { kind: 'num', value: 30 },
          };
    case 'round':
      return {
        kind: 'cmp',
        op: '>',
        left: { kind: 'global', name: 'round' },
        right: { kind: 'num', value: 3 },
      };
    case 'variable':
      return ref
        ? {
            kind: 'cmp',
            op: '>=',
            left: { kind: 'figureVar', ref, name: 'punkte' },
            right: { kind: 'num', value: 3 },
          }
        : {
            kind: 'cmp',
            op: '>=',
            left: { kind: 'worldVar', name: 'punkte' },
            right: { kind: 'num', value: 3 },
          };
  }
}

/** Targets that the trigger offers. */
export function targetOptions(trigger: Trigger): Target[] {
  const ctx = TRIGGER_CONTEXT[trigger.kind];
  const out: Target[] = ctx.figures.map((ref) => ({ kind: 'ref', ref }));
  if (hasAnchor(ctx)) out.push({ kind: 'onTile' }, { kind: 'neighbors' }, { kind: 'nearest' });
  out.push({ kind: 'random' }, { kind: 'all' }, { kind: 'allNpcs' });
  return out;
}

/** Tile targets that the trigger offers. */
export function tileOptions(trigger: Trigger): TileTarget[] {
  const ctx = TRIGGER_CONTEXT[trigger.kind];
  const out: TileTarget[] = [];
  if (ctx.eventTile) out.push({ kind: 'eventTile' });
  if (ctx.fromTile) out.push({ kind: 'fromTile' });
  for (const ref of ctx.figures) out.push({ kind: 'figureTile', ref });
  if (hasAnchor(ctx)) out.push({ kind: 'neighborTiles' });
  out.push(
    { kind: 'randomTile' },
    { kind: 'randomEmptyTile' },
    { kind: 'tilesOfType', tileType: 'lava' },
  );
  return out;
}

/** Value options for the left side of a comparison. */
export function valueOptions(trigger: Trigger): Expr[] {
  const ctx = TRIGGER_CONTEXT[trigger.kind];
  const out: Expr[] = [];
  for (const ref of ctx.figures) {
    for (const prop of ['hp', 'maxHp', 'move', 'wheelChance', 'shield'] as const) {
      out.push({ kind: 'figureProp', ref, prop });
    }
    out.push({ kind: 'figureVar', ref, name: 'punkte' });
  }
  const tiles = [
    ...(ctx.eventTile ? [{ kind: 'eventTile' } as const] : []),
    ...(ctx.fromTile ? [{ kind: 'fromTile' } as const] : []),
    ...ctx.figures.map((ref) => ({ kind: 'figureTile', ref }) as const),
  ];
  for (const tile of tiles) {
    for (const prop of ['type', 'figureCount', 'texture'] as const)
      out.push({ kind: 'tileProp', tile, prop });
  }
  out.push(
    { kind: 'global', name: 'round' },
    { kind: 'global', name: 'tileCount' },
    { kind: 'global', name: 'npcCount' },
    { kind: 'worldVar', name: 'punkte' },
  );
  if (ctx.amount) out.push({ kind: 'amount' });
  return out;
}

/** Identifies a value option independent of variable names. */
export function valueKey(e: Expr): string {
  switch (e.kind) {
    case 'figureProp':
      return `fp:${e.ref}:${e.prop}`;
    case 'figureVar':
      return `fv:${e.ref}`;
    case 'tileProp':
      return `tp:${e.tile.kind === 'figureTile' ? `f-${e.tile.ref}` : e.tile.kind}:${e.prop}`;
    case 'global':
      return `g:${e.name}`;
    case 'worldVar':
      return 'wv';
    case 'amount':
      return 'amount';
    default:
      return `x:${e.kind}`;
  }
}

export function targetKey(t: Target): string {
  return t.kind === 'ref' ? `ref:${t.ref}` : t.kind;
}

export function tileKeyOf(t: TileTarget): string {
  return t.kind === 'figureTile' ? `ft:${t.ref}` : t.kind;
}

/** Kind of the right-hand input for a comparison left value. */
export function rightKind(left: Expr): 'number' | 'tileType' | 'text' {
  if (left.kind === 'tileProp' && left.prop === 'type') return 'tileType';
  if (left.kind === 'tileProp' && left.prop === 'texture') return 'text';
  return 'number';
}

/** Can the block view edit this condition, or is it shown as a code block? */
export function isSimpleCondition(e: Expr): boolean {
  if (e.kind === 'chance') return true;
  if (e.kind !== 'cmp') return false;
  const leftOk = !['cmp', 'and', 'or', 'not', 'chance', 'num', 'str'].includes(e.left.kind);
  const rightOk = e.right.kind === 'num' || e.right.kind === 'str';
  return leftOk && rightOk;
}

export function defaultEffect(kind: EffectKind, trigger: Trigger): Effect {
  const target = targetOptions(trigger)[0] ?? { kind: 'all' };
  const tile = tileOptions(trigger)[0] ?? { kind: 'randomTile' };
  switch (kind) {
    case 'spawn':
      return { kind, npcType: 'zombie', at: tile };
    case 'damage':
    case 'heal':
    case 'shield':
      return { kind, target, amount: 1 };
    case 'skip':
      return { kind, target, turns: 1 };
    case 'moveMod':
      return { kind, target, delta: 1, rounds: 1 };
    case 'wheelMod':
      return { kind, target, delta: 10, rounds: 1 };
    case 'teleport':
      return { kind, target };
    case 'push':
      return { kind, target, from: tile, distance: 1 };
    case 'setTileType':
      return { kind, at: tile, tileType: 'lava' };
    case 'removeTile':
      return { kind, at: { kind: 'randomEmptyTile' } };
    case 'addTileNear':
      return { kind, at: tile };
    case 'setVar':
      return {
        kind,
        scope: { kind: 'figures', target },
        name: 'punkte',
        op: '+',
        value: { kind: 'num', value: 1 },
      };
    case 'message':
    case 'code':
      return { kind: 'message', text: 'Achtung!' };
    case 'call':
      return { kind, effect: '', args: [] };
  }
}

export function newRuleId(): string {
  return `own.${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;
}

/** Default call of an own effect in a rule: arguments taken from the event where possible. */
export function ruleCallFor(def: EffectDef, trigger: Trigger): Effect {
  const ctx = TRIGGER_CONTEXT[trigger.kind];
  const ref = ctx.figures[0];
  const args: Expr[] = def.params.map((p) => {
    switch (p.type) {
      case 'number':
        return { kind: 'num', value: 1 };
      case 'figure':
        return ref ? { kind: 'figureRef', ref } : { kind: 'none' };
      case 'figureSet':
        return { kind: 'targets', target: { kind: 'all' } };
      case 'tile':
        return ctx.eventTile
          ? { kind: 'tileRef', tile: { kind: 'eventTile' } }
          : ref
            ? { kind: 'tileRef', tile: { kind: 'figureTile', ref } }
            : { kind: 'none' };
      case 'tileSet':
        return { kind: 'tiles', target: tileOptions(trigger)[0] ?? { kind: 'randomTile' } };
      default:
        return { kind: 'str', value: '' };
    }
  });
  return { kind: 'call', effect: def.name, args };
}

export function mergeById<T extends { id: string }>(a: readonly T[], b: readonly T[]): T[] {
  return [...a, ...b.filter((x) => !a.some((y) => y.id === x.id))];
}

export function mergeByName<T extends { name: string }>(a: readonly T[], b: readonly T[]): T[] {
  return [...a.filter((x) => !b.some((y) => y.name.toLowerCase() === x.name.toLowerCase())), ...b];
}
