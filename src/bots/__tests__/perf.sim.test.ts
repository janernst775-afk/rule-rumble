import { it } from 'vitest';
import { makeGame } from '../../engine/__tests__/helpers';
import { playBotTurn } from '../simulate';

it.skipIf(!process.env.SIM)('perf', () => {
  let s = makeGame(3, (st) => (st.tempo.roundLimit = { rounds: 40, outcome: 'draw' }), 5);
  let worst = 0;
  let turns = 0;
  const t0 = performance.now();
  while (s.status === 'playing' && turns < 400) {
    const t = performance.now();
    s = playBotTurn(s);
    worst = Math.max(worst, performance.now() - t);
    turns++;
  }
  const added = s.log.filter((l) => l.key === 'log.ruleAdded').map((l) => l.params.rule);
  process.stderr.write(
    `turns=${turns} total=${(performance.now() - t0).toFixed(0)}ms worst=${worst.toFixed(0)}ms rounds=${s.round} rules=${JSON.stringify(added)} result=${s.result?.winner}\n`,
  );
});
