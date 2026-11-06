import { useEffect, useRef } from 'react';
import { chooseTurn } from '../bots/chooseTurn';
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
      const turn = chooseTurn(state);
      if (!turn) return;
      let current = state;
      if (current.turn.phase === 'move') {
        const ok = await store().animateMove(turn.action.actor, turn.path, STEP_MS * tempo);
        const next = store().game;
        if (!ok || !next || store().generation !== generation) return;
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
      }
    })();
  }, [game, wheel, anim, generation]);
}
