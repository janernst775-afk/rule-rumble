// Which context values each trigger provides (SPEC 5.2, table "Auslöser").
import type { FigureRef, TriggerKind } from './ast';

export interface TriggerContext {
  figures: readonly FigureRef[];
  /** feld */
  eventTile: boolean;
  /** von_feld */
  fromTile: boolean;
  /** menge */
  amount: boolean;
}

const none: TriggerContext = { figures: [], eventTile: false, fromTile: false, amount: false };

export const TRIGGER_CONTEXT: Record<TriggerKind, TriggerContext> = {
  roundStart: none,
  roundEnd: none,
  everyNRounds: none,
  turnStart: { ...none, figures: ['trigger'] },
  turnEnd: { ...none, figures: ['trigger'] },
  enters: { ...none, figures: ['trigger'], eventTile: true, fromTile: true },
  leaves: { ...none, figures: ['trigger'], eventTile: true, fromTile: true },
  attack: { ...none, figures: ['attacker', 'target'] },
  hit: { ...none, figures: ['attacker', 'target'] },
  miss: { ...none, figures: ['attacker', 'target'] },
  damage: { ...none, figures: ['trigger'], amount: true },
  dies: { ...none, figures: ['trigger'], eventTile: true },
  tileAdded: { ...none, figures: ['trigger'], eventTile: true },
  tileRemoved: { ...none, figures: ['trigger'], eventTile: true },
};

/** Whether a figure-relative target set (onTile, neighbors, nearest) has an anchor. */
export function hasAnchor(ctx: TriggerContext): boolean {
  return ctx.eventTile || ctx.figures.length > 0;
}
