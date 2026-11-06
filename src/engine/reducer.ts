import { createTile, isValidPath, tileKey, tileLabel } from './board';
import { createBus, emit, type Bus } from './bus';
import { resolveAttack } from './combat';
import { walkPath } from './movement';
import { npcTurn } from './npc';
import { attackTargets, currentFigureId, effectiveMove } from './query';
import { addRule, addRuleError, castVote, voteError } from './rules';
import { addTileError, removeTileError } from './tiles';
import { checkVictory, endTurn, log } from './turn';
import type { Action, ActionError, ApplyResult, GameState } from './types';

function fail(code: ActionError['code'], detail?: string): ApplyResult {
  return { ok: false, error: detail === undefined ? { code } : { code, detail } };
}

/**
 * Copies every part of the state that a reducer may mutate. Settings and existing
 * participants are never mutated; the participants record is copied because
 * spawned NPCs add entries.
 */
function draftOf(state: GameState): GameState {
  return {
    ...state,
    turn: { ...state.turn, order: [...state.turn.order] },
    tiles: structuredClone(state.tiles),
    figures: structuredClone(state.figures),
    participants: { ...state.participants },
    rules: structuredClone(state.rules),
    pendingVote: state.pendingVote ? structuredClone(state.pendingVote) : null,
    ruleDamage: { ...state.ruleDamage },
    textureNames: { ...state.textureNames },
    world: { ...state.world },
    stats: structuredClone(state.stats),
    log: [...state.log],
  };
}

function done(bus: Bus): ApplyResult {
  // Rules may have decided the game in the middle of an action.
  if (bus.state.status === 'playing') checkVictory(bus);
  return { ok: true, state: bus.state, events: bus.events };
}

/** The single entry point of the engine: state + action → new state + events. */
export function applyAction(state: GameState, action: Action): ApplyResult {
  if (state.status === 'over') return fail('gameOver');
  const actor = state.figures[action.actor];
  if (!actor) return fail('unknownFigure', action.actor);

  // Votes are cast by every voter, independent of whose turn it is.
  if (state.pendingVote) {
    if (action.type !== 'voteRule') return fail('votePending');
    const error = voteError(state, action.actor, action.ruleId);
    if (error) return fail(error);
    const bus = createBus(draftOf(state));
    castVote(bus, action.actor, action.ruleId);
    return done(bus);
  }
  if (action.type === 'voteRule') return fail('noVote');

  if (currentFigureId(state) !== action.actor) return fail('notYourTurn');
  if (actor.kind === 'npc' && action.type !== 'npcAct') return fail('npcActsAlone');

  switch (action.type) {
    case 'npcAct': {
      if (actor.kind !== 'npc') return fail('notNpc');
      const bus = createBus(draftOf(state));
      const npc = bus.state.figures[actor.id];
      if (npc) npcTurn(bus, npc);
      return done(bus);
    }

    case 'move': {
      if (state.turn.phase !== 'move') return fail('wrongPhase');
      if (action.path.length > effectiveMove(actor)) return fail('pathTooLong');
      if (!isValidPath(state.tiles, actor.pos, action.path)) return fail('invalidPath');
      const bus = createBus(draftOf(state));
      const draft = bus.state;
      const steps = walkPath(bus, actor.id, action.path);
      const fig = draft.figures[actor.id];
      const stats = draft.stats[actor.id];
      if (stats) stats.tilesMoved += steps;
      if (steps > 0 && fig) {
        log(draft, 'log.moved', { figure: actor.id, tile: tileLabel(draft.tiles, fig.pos) });
      }
      if (draft.status !== 'playing') return done(bus);
      // A rule may have knocked the mover out during the walk.
      if (!fig || !fig.alive) endTurn(bus);
      else draft.turn.phase = 'action';
      return done(bus);
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
      const bus = createBus(draftOf(state));
      resolveAttack(bus, actor.id, target.id);
      if (bus.state.status === 'playing') endTurn(bus);
      return done(bus);
    }

    case 'pass': {
      const bus = createBus(draftOf(state));
      log(bus.state, 'log.passed', { figure: actor.id });
      emit(bus, { type: 'passed', figure: actor.id });
      if (bus.state.status === 'playing') endTurn(bus);
      return done(bus);
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
      const bus = createBus(draftOf(state));
      const draft = bus.state;
      const stats = draft.stats[actor.id];
      draft.turn.tileActionsUsed += 1;
      if (action.type === 'addTile') {
        const tile = createTile(action.pos);
        tile.textureId = action.textureId;
        draft.tiles[tileKey(action.pos)] = tile;
        if (action.textureId && action.textureName) {
          draft.textureNames[action.textureId] = action.textureName.slice(0, 30);
        }
        if (stats) stats.tilesAdded += 1;
        log(draft, 'log.tileAdded', { figure: actor.id, tile: tileLabel(draft.tiles, action.pos) });
        emit(bus, {
          type: 'tileAdded',
          figure: actor.id,
          pos: { ...action.pos },
          textureId: action.textureId,
        });
      } else {
        const label = tileLabel(draft.tiles, action.pos);
        delete draft.tiles[tileKey(action.pos)];
        if (stats) stats.tilesRemoved += 1;
        log(draft, 'log.tileRemoved', { figure: actor.id, tile: label });
        emit(bus, { type: 'tileRemoved', figure: actor.id, pos: { ...action.pos } });
      }
      if (draft.status !== 'playing') return done(bus);
      // With "tile actions count double" the turn stays open for a second tile action or a pass.
      const me = draft.figures[actor.id];
      if (!me?.alive || draft.turn.tileActionsUsed >= draft.settings.board.tileActionsPerAction) {
        endTurn(bus);
      }
      return done(bus);
    }

    case 'addRule': {
      if (state.turn.phase !== 'action') return fail('wrongPhase');
      if (state.turn.tileActionsUsed > 0) return fail('tileActionsUsed');
      const error = addRuleError(state, action.rule, action.replaceRuleId);
      if (error) return fail(error);
      const bus = createBus(draftOf(state));
      addRule(bus, actor.id, action.rule, action.replaceRuleId);
      return done(bus);
    }
  }
}
