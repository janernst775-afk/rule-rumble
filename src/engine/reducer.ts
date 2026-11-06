import { createTile, isValidPath, tileKey, tileLabel } from './board';
import { attackTargets, baseWheelChance, currentFigureId, effectiveMove } from './query';
import { randomFloat, randomInt } from './rng';
import { addTileError, removeTileError } from './tiles';
import { damageFigure, endTurn, log } from './turn';
import type { Action, ActionError, ApplyResult, GameEvent, GameState } from './types';

function fail(code: ActionError['code'], detail?: string): ApplyResult {
  return { ok: false, error: detail === undefined ? { code } : { code, detail } };
}

/**
 * Copies every part of the state that a reducer may mutate. Settings and
 * participants are never mutated by the engine and are shared.
 */
function draftOf(state: GameState): GameState {
  return {
    ...state,
    turn: { ...state.turn, order: [...state.turn.order] },
    tiles: structuredClone(state.tiles),
    figures: structuredClone(state.figures),
    rules: structuredClone(state.rules),
    world: { ...state.world },
    stats: structuredClone(state.stats),
    log: [...state.log],
  };
}

/** The single entry point of the engine: state + action → new state + events. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.status === 'over') return fail('gameOver');
  const actor = state.figures[action.actor];
  if (!actor) return fail('unknownFigure', action.actor);
  if (currentFigureId(state) !== action.actor) return fail('notYourTurn');

  switch (action.type) {
    case 'move': {
      if (state.turn.phase !== 'move') return fail('wrongPhase');
      if (action.path.length > effectiveMove(actor)) return fail('pathTooLong');
      if (!isValidPath(state.tiles, actor.pos, action.path)) return fail('invalidPath');
      const draft = draftOf(state);
      const events: GameEvent[] = [];
      const fig = draft.figures[actor.id];
      if (!fig) return fail('unknownFigure');
      for (const step of action.path) {
        events.push({ type: 'tileLeft', figure: fig.id, pos: { ...fig.pos } });
        fig.pos = { ...step };
        const tile = draft.tiles[tileKey(step)];
        const firstVisit = tile ? !tile.visitedBy.includes(fig.id) : false;
        if (tile && firstVisit) tile.visitedBy.push(fig.id);
        events.push({ type: 'tileEntered', figure: fig.id, pos: { ...step }, firstVisit });
      }
      const stats = draft.stats[fig.id];
      if (stats) stats.tilesMoved += action.path.length;
      if (action.path.length > 0) {
        log(draft, 'log.moved', { figure: fig.id, tile: tileLabel(draft.tiles, fig.pos) });
      }
      draft.turn.phase = 'action';
      return { ok: true, state: draft, events };
    }

    case 'attack': {
      if (state.turn.phase !== 'action') return fail('wrongPhase');
      if (state.turn.tileActionsUsed > 0) return fail('tileActionsUsed');
      const target = state.figures[action.target];
      if (!target || !target.alive || target.id === actor.id) return fail('invalidTarget');
      const allowed = attackTargets(state, actor.id).some((f) => f.id === target.id);
      if (!allowed) {
        const sameTile = target.pos.x === actor.pos.x && target.pos.y === actor.pos.y;
        return fail(sameTile ? 'friendlyFireOff' : 'noTarget');
      }
      const draft = draftOf(state);
      const events: GameEvent[] = [];
      const spread = draft.settings.combat.wheelChanceSpread;
      const base = baseWheelChance(draft, actor);
      const chance =
        spread > 0
          ? Math.min(100, Math.max(0, base - spread + randomInt(draft, spread * 2 + 1)))
          : base;
      events.push({ type: 'attackDeclared', attacker: actor.id, target: target.id, chance });
      const roll = randomFloat(draft) * 100;
      const hit = roll < chance;
      events.push({
        type: 'wheelResolved',
        attacker: actor.id,
        target: target.id,
        chance,
        roll,
        hit,
      });
      const stats = draft.stats[actor.id];
      if (stats) {
        stats.attacks += 1;
        if (hit) stats.hits += 1;
        else stats.misses += 1;
      }
      log(draft, hit ? 'log.hit' : 'log.miss', { attacker: actor.id, target: target.id, chance });
      if (hit) {
        const targetDraft = draft.figures[target.id];
        const shieldIdx = targetDraft
          ? targetDraft.statuses.findIndex((s) => s.kind === 'shield')
          : -1;
        if (targetDraft && shieldIdx >= 0) {
          targetDraft.statuses.splice(shieldIdx, 1);
          log(draft, 'log.shieldBlocked', { figure: target.id });
        } else {
          damageFigure(draft, events, target.id, 1, 'attack', actor.id);
        }
      }
      endTurn(draft, events);
      return { ok: true, state: draft, events };
    }

    case 'pass': {
      const draft = draftOf(state);
      const events: GameEvent[] = [{ type: 'passed', figure: actor.id }];
      log(draft, 'log.passed', { figure: actor.id });
      endTurn(draft, events);
      return { ok: true, state: draft, events };
    }

    case 'addTile':
    case 'removeTile': {
      if (state.turn.phase !== 'action') return fail('wrongPhase');
      if (state.turn.tileActionsUsed >= state.settings.board.tileActionsPerAction) {
        return fail('tileActionsUsed');
      }
      const error =
        action.type === 'addTile'
          ? addTileError(state, action.pos)
          : removeTileError(state, action.pos);
      if (error) return fail(error);
      const draft = draftOf(state);
      const events: GameEvent[] = [];
      const stats = draft.stats[actor.id];
      if (action.type === 'addTile') {
        const tile = createTile(action.pos);
        tile.textureId = action.textureId;
        draft.tiles[tileKey(action.pos)] = tile;
        events.push({
          type: 'tileAdded',
          figure: actor.id,
          pos: { ...action.pos },
          textureId: action.textureId,
        });
        if (stats) stats.tilesAdded += 1;
        log(draft, 'log.tileAdded', { figure: actor.id, tile: tileLabel(draft.tiles, action.pos) });
      } else {
        const label = tileLabel(draft.tiles, action.pos);
        delete draft.tiles[tileKey(action.pos)];
        events.push({ type: 'tileRemoved', figure: actor.id, pos: { ...action.pos } });
        if (stats) stats.tilesRemoved += 1;
        log(draft, 'log.tileRemoved', { figure: actor.id, tile: label });
      }
      draft.turn.tileActionsUsed += 1;
      // With "tile actions count double" the turn stays open for a second tile action or a pass.
      if (draft.turn.tileActionsUsed >= draft.settings.board.tileActionsPerAction) {
        endTurn(draft, events);
      }
      return { ok: true, state: draft, events };
    }

    case 'addRule':
      return fail('notYetAvailable', action.type);
  }
}
