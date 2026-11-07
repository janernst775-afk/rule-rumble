import type { Expr, Target, TileTarget } from '../../lang/ast';

type T = (key: string, params?: Record<string, string | number>) => string;

export function targetLabel(t: T, x: Target): string {
  return t(`editor.target.${x.kind === 'ref' ? x.ref : x.kind}`);
}

export function tileLabel(t: T, x: TileTarget): string {
  if (x.kind === 'figureTile')
    return t('editor.tile.figureTile', { who: t(`editor.target.${x.ref}`) });
  return t(`editor.tile.${x.kind}`);
}

export function valueLabel(t: T, e: Expr): string {
  switch (e.kind) {
    case 'figureProp':
      return t('editor.value.figureProp', {
        who: t(`editor.target.${e.ref}`),
        prop: t(`editor.prop.${e.prop}`),
      });
    case 'figureVar':
      return t('editor.value.figureVar', { who: t(`editor.target.${e.ref}`) });
    case 'tileProp': {
      const tile =
        e.tile.kind === 'figureTile' ? tileLabel(t, e.tile) : t(`editor.tile.${e.tile.kind}`);
      return t('editor.value.tileProp', { tile, prop: t(`editor.tileProp.${e.prop}`) });
    }
    case 'global':
      return t(`editor.global.${e.name}`);
    case 'worldVar':
      return t('editor.value.worldVar');
    case 'amount':
      return t('editor.value.amount');
    default:
      return e.kind;
  }
}
