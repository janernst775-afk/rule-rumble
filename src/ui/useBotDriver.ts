import { useEffect, useRef } from 'react';
import { chooseTurn, type BotOptions } from '../bots/chooseTurn';
import { useLibrary } from '../store/libraryStore';
import { allNpcTypes, useWorkshop, withBundleFromWorkshop } from '../store/workshopStore';
import { chooseVote } from '../bots/ruleChoice';
import { isSameTurn } from '../bots/simulate';
import { baseWheelChance } from '../engine/query';
import { BOT_TEMPO, useGame } from '../store/gameStore';
import { isHumanTurn } from './gameUi';

const STEP_MS = 600;
const THINK_MS = 650;

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Plays bot (and NPC) turns with animation. Runs once per turn key so that
 * StrictMode double effects and re-renders never trigger a second move.
 */
export function useBotDriver(): void {
  const game = useGame((s) => s.game);
  const wheel = useGame((s) => s.wheel);
  const anim = useGame((s) => s.anim);
  const generation = useGame((s) => s.generation);
  const handled = useRef<string | null>(null);

  useEffect(() => {
    if (!game || game.status !== 'playing' || wheel || anim || isHumanTurn(game)) return;
    if (game.pendingVote) return; // handled by the vote effect below
    // One run per turn: the run itself handles both phases.
    const key = `${generation}:${game.round}:${game.turn.index}`;
    if (handled.current === key) return;
    handled.current = key;

    const tempo = BOT_TEMPO[game.settings.bots.speed];
    const store = useGame.getState;
    void (async () => {
      await wait(THINK_MS * tempo);
      const state = store().game;
      if (!state || store().generation !== generation) return;
      const turn = chooseTurn(state, botOptions());
      if (!turn) return;
      let current = state;
      if (turn.action.type === 'npcAct') {
        store().dispatch(turn.action);
        return;
      }
      if (current.turn.phase === 'move') {
        const ok = await store().animateMove(turn.action.actor, turn.path, STEP_MS * tempo);
        const next = store().game;
        if (!ok || !next || store().generation !== generation) return;
        // A rule (lava, trap …) may have ended the turn during the walk.
        if (!isSameTurn(state, next)) return;
        current = next;
        await wait(250 * tempo);
      }
      if (turn.action.type === 'attack') {
        const attacker = current.figures[turn.action.actor];
        if (!attacker) return;
        store().openWheel(
          turn.action.actor,
          turn.action.target,
          baseWheelChance(current, attacker),
        );
        await wait(700 * tempo);
        if (store().generation !== generation) return;
        store().spinWheel();
      } else {
        store().dispatch(turn.action);
        // "Tile actions count double": a second tile action (or pass) may follow.
        const after = store().game;
        if (after && current && isSameTurn(current, after)) {
          await wait(THINK_MS * tempo);
          if (store().generation !== generation) return;
          const second = chooseTurn(after, botOptions());
          if (second) {
            store().dispatch(second.action);
          }
        }
      }
    })();
  }, [game, wheel, anim, generation]);

  // Overflow vote: bot voters vote one after another, independent of whose turn it is.
  const voteKey = useRef<string | null>(null);
  useEffect(() => {
    const vote = game?.pendingVote;
    if (!game || !vote || wheel || anim) return;
    const botVoter = vote.voters.find(
      (v) => !vote.votes[v] && game.participants[v]?.controller !== 'human',
    );
    if (!botVoter) return;
    const key = `${generation}:${game.round}:${game.turn.index}:${botVoter}`;
    if (voteKey.current === key) return;
    voteKey.current = key;
    const tempo = BOT_TEMPO[game.settings.bots.speed];
    // No cleanup: re-renders must not cancel the vote; the generation check guards stale runs.
    setTimeout(() => {
      const s = useGame.getState().game;
      if (!s?.pendingVote || useGame.getState().generation !== generation) return;
      useGame.getState().dispatch({
        type: 'voteRule',
        actor: botVoter,
        ruleId: chooseVote(s, botVoter),
      });
    }, THINK_MS * tempo);
  }, [game, wheel, anim, generation]);
}

/** Bots on "Schwer" may also bring the player's own library rules (SPEC 7). */
function botOptions(): BotOptions {
  const ws = useWorkshop.getState();
  return {
    extraRules: useLibrary
      .getState()
      .rules.map((r) =>
        withBundleFromWorkshop(r, ws.effects, allNpcTypes(ws.npcTypes), ws.functions ?? []),
      ),
  };
}
