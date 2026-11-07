// Runtime values as the debugger's variables view shows them.
import type { TFunction } from 'i18next';
import type { GameState } from '../../engine/types';
import type { Value } from '../../lang/interpreter';

function tileName(pos: { x: number; y: number }): string {
  return `${String.fromCharCode(65 + pos.x)}${pos.y + 1}`;
}

/** A runtime value as the variables view shows it (figure names only here, never in code). */
export function formatValue(v: Value, state: GameState, t: TFunction): string {
  if (v === null) return t('workshop.debug.none');
  if (typeof v === 'boolean') return v ? t('workshop.debug.yes') : t('workshop.debug.no');
  if (typeof v === 'number') return String(Math.round(v * 100) / 100);
  if (typeof v === 'string') return `"${v}"`;
  switch (v.t) {
    case 'fig': {
      const f = state.figures[v.id];
      const name =
        state.participants[v.id]?.name ??
        state.npcTypes.find((n) => n.id === f?.npcTypeId)?.name ??
        v.id;
      return f ? `${name} (${tileName(f.pos)})` : name;
    }
    case 'tile':
      return tileName(v.pos);
    case 'figs':
      return t('workshop.debug.figures', { count: v.ids.length });
    case 'tiles':
      return t('workshop.debug.tiles', { count: v.pos.length });
    case 'list': {
      const shown = v.items.slice(0, 5).map((i) => formatValue(i, state, t));
      return `[${shown.join(', ')}${v.items.length > 5 ? ', …' : ''}]`;
    }
  }
}
