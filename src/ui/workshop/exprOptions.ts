// Options for expression pickers in the effect workshop, depending on the wanted type
// and the variables in scope.
import type { Expr, QueryName, Stmt, ValueType } from '../../lang/ast';
import { inferType } from '../../lang/validator';

export type Want = ValueType | 'anySet' | 'comparable';

export interface ExprOption {
  key: string;
  /** i18n key + params for the label */
  label: [string, Record<string, string>?];
  create: () => Expr;
}

export const QUERY_ARGS: Record<QueryName, Want[]> = {
  figuresOn: ['tile'],
  neighborTiles: ['tile', 'number'],
  tilesOfType: ['text'],
  tilesWithTexture: ['text'],
  emptyTiles: [],
  allFigures: [],
  allNpcs: [],
  nearestFigure: ['tile'],
  distance: ['tile', 'tile'],
  randomNumber: ['number', 'number'],
  count: ['anySet'],
  edgeTiles: [],
};

const QUERY_RESULT: Record<QueryName, ValueType> = {
  figuresOn: 'figureSet',
  neighborTiles: 'tileSet',
  tilesOfType: 'tileSet',
  tilesWithTexture: 'tileSet',
  emptyTiles: 'tileSet',
  allFigures: 'figureSet',
  allNpcs: 'figureSet',
  nearestFigure: 'figure',
  distance: 'number',
  randomNumber: 'number',
  count: 'number',
  edgeTiles: 'tileSet',
};

function defaultArg(w: Want): Expr {
  switch (w) {
    case 'number':
      return { kind: 'num', value: 1 };
    case 'tile':
      return { kind: 'tileRef', tile: { kind: 'eventTile' } };
    case 'text':
      return { kind: 'str', value: 'lava' };
    default:
      return { kind: 'query', name: 'allFigures', args: [] };
  }
}

function accepts(want: Want, t: ValueType): boolean {
  switch (want) {
    case 'anySet':
      return t === 'figureSet' || t === 'tileSet' || t === 'figure' || t === 'tile';
    case 'comparable':
      return t === 'number' || t === 'text' || t === 'figure' || t === 'tile';
    case 'figureSet':
      return t === 'figureSet' || t === 'figure';
    case 'tileSet':
      return t === 'tileSet' || t === 'tile';
    case 'text':
    case 'npcType':
    case 'texture':
    case 'sound':
      return t === 'text' || t === 'npcType' || t === 'texture' || t === 'sound';
    default:
      return want === t;
  }
}

const FIGURE_NUMBER_PROPS = ['hp', 'maxHp', 'move', 'wheelChance', 'shield'];

export function exprOptions(want: Want, scope: ReadonlyMap<string, ValueType>): ExprOption[] {
  const out: ExprOption[] = [];
  const isNum = accepts(want, 'number');
  const isText = accepts(want, 'text');
  if (isNum)
    out.push({
      key: 'num',
      label: ['workshop.expr.number'],
      create: () => ({ kind: 'num', value: 1 }),
    });
  if (isText)
    out.push({
      key: 'str',
      label: ['workshop.expr.text'],
      create: () => ({ kind: 'str', value: '' }),
    });
  if (accepts(want, 'tile')) {
    out.push({
      key: 'feld',
      label: ['workshop.expr.feld'],
      create: () => ({ kind: 'tileRef', tile: { kind: 'eventTile' } }),
    });
  }
  for (const [name, type] of scope) {
    if (accepts(want, type)) {
      out.push({
        key: `var:${name}`,
        label: ['workshop.expr.var', { name }],
        create: () => ({ kind: 'var', name }),
      });
    }
    if (type === 'figure') {
      if (isNum) {
        for (const prop of FIGURE_NUMBER_PROPS) {
          out.push({
            key: `prop:${name}:${prop}`,
            label: ['workshop.expr.prop', { name, prop: `editor.prop.${prop}` }],
            create: () => ({ kind: 'varProp', name, prop }),
          });
        }
      }
      if (accepts(want, 'tile')) {
        out.push({
          key: `prop:${name}:tile`,
          label: ['workshop.expr.figureTile', { name }],
          create: () => ({ kind: 'varProp', name, prop: 'tile' }),
        });
      }
    }
    if (type === 'tile') {
      if (isNum) {
        out.push({
          key: `prop:${name}:figureCount`,
          label: ['workshop.expr.prop', { name, prop: 'editor.tileProp.figureCount' }],
          create: () => ({ kind: 'varProp', name, prop: 'figureCount' }),
        });
      }
      if (isText) {
        for (const prop of ['type', 'texture']) {
          out.push({
            key: `prop:${name}:${prop}`,
            label: ['workshop.expr.prop', { name, prop: `editor.tileProp.${prop}` }],
            create: () => ({ kind: 'varProp', name, prop }),
          });
        }
      }
    }
  }
  for (const q of Object.keys(QUERY_RESULT) as QueryName[]) {
    if (!accepts(want, QUERY_RESULT[q])) continue;
    out.push({
      key: `q:${q}`,
      label: [`workshop.query.${q}`],
      create: () => ({ kind: 'query', name: q, args: QUERY_ARGS[q].map(defaultArg) }),
    });
  }
  if (isNum) {
    for (const g of ['round', 'tileCount', 'npcCount'] as const) {
      out.push({
        key: `g:${g}`,
        label: [`editor.global.${g}`],
        create: () => ({ kind: 'global', name: g }),
      });
    }
  }
  if (want === 'figure' || want === 'tile' || want === 'comparable') {
    out.push({ key: 'none', label: ['workshop.expr.none'], create: () => ({ kind: 'none' }) });
  }
  return out;
}

export function exprKey(e: Expr): string {
  switch (e.kind) {
    case 'num':
      return 'num';
    case 'str':
      return 'str';
    case 'var':
      return `var:${e.name.toLowerCase()}`;
    case 'varProp':
      return `prop:${e.name.toLowerCase()}:${e.prop}`;
    case 'query':
      return `q:${e.name}`;
    case 'tileRef':
      return e.tile.kind === 'eventTile' ? 'feld' : 'other';
    case 'global':
      return `g:${e.name}`;
    case 'none':
      return 'none';
    default:
      return 'other';
  }
}

const ELEMENT: Partial<Record<string, ValueType>> = { figureSet: 'figure', tileSet: 'tile' };

/** Scope before each statement of a list (MERKE / WÄHLE add variables). */
export function scopesOf(
  stmts: Stmt[],
  start: ReadonlyMap<string, ValueType>,
): Map<string, ValueType>[] {
  const out: Map<string, ValueType>[] = [];
  const cur = new Map(start);
  for (const s of stmts) {
    out.push(new Map(cur));
    if (s.kind === 'let') {
      const t = inferType(s.value, cur);
      cur.set(s.name.toLowerCase(), t === 'unknown' || t === 'none' || t === 'bool' ? 'number' : t);
    } else if (s.kind === 'pick') {
      const t = inferType(s.from, cur);
      cur.set(s.var.toLowerCase(), ELEMENT[t] ?? 'figure');
    }
  }
  return out;
}

export function elementType(set: Expr, scope: ReadonlyMap<string, ValueType>): ValueType {
  return ELEMENT[inferType(set, scope)] ?? 'figure';
}
