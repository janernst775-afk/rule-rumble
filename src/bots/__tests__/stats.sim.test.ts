import { it } from 'vitest';
import { makeGame } from '../../engine/__tests__/helpers';
import { playBotGame } from '../simulate';

it.skipIf(!process.env.SIM)(
  'stats',
  () => {
    const heroes = Number(process.env.HEROES ?? 2);
    const n = Number(process.env.N ?? 10);
    let boss = 0,
      draw = 0,
      rounds = 0;
    const t0 = performance.now();
    for (let seed = 1; seed <= n; seed++) {
      const end = playBotGame(
        makeGame(heroes, (s) => (s.tempo.roundLimit = { rounds: 100, outcome: 'draw' }), seed),
      );
      if (end.result?.winner === 'boss') boss++;
      if (end.result?.winner === 'draw') draw++;
      rounds += end.round;
    }
    process.stderr
      .write(`heroes=${heroes} n=${n} boss=${boss} draw=${draw} avgRounds=${(rounds / n).toFixed(1)} ms/game=${((performance.now() - t0) / n).toFixed(0)}
`);
  },
  600000,
);
