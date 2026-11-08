import { useTranslation } from 'react-i18next';
import { playSfx } from '../../audio/audio';
import { useApp } from '../../store/appStore';
import { useGame } from '../../store/gameStore';
import { Avatar } from '../components/Avatar';
import { ruleDescription } from '../ruleText';

export function ResultScreen() {
  const { t } = useTranslation();
  const game = useGame((s) => s.game);
  const clear = useGame((s) => s.clear);
  const setScreen = useApp((s) => s.setScreen);
  if (!game || !game.result) return null;
  const result = game.result;

  const title =
    result.winner === 'heroes'
      ? t('result.heroesWin')
      : result.winner === 'boss'
        ? t('result.bossWins')
        : t('result.draw');
  const ids = game.seatOrder;
  // Rule album (v0.8): every rule of this game in the order it came in.
  const album = [...(game.pastRules ?? []), ...game.rules].sort((a, b) => a.order - b.order);
  const active = new Set(game.rules.map((r) => r.id));

  const again = () => {
    playSfx('click');
    clear();
    setScreen('lobby');
  };

  return (
    <main className="result-screen">
      <section className="card result-card">
        <h1 className="result-title">{title}</h1>
        <p className="hint">{t(`result.reasons.${result.reason}`)}</p>

        {result.winners.length > 0 && (
          <div className="winners" aria-label={t('result.winners')}>
            {result.winners.map((id) => {
              const p = game.participants[id];
              return p ? (
                <div key={id} className="winner">
                  <Avatar
                    name={p.name}
                    avatar={p.avatar}
                    size={84}
                    boss={game.figures[id]?.kind === 'boss'}
                  />
                  <strong>{p.name}</strong>
                </div>
              ) : null;
            })}
          </div>
        )}

        <p>{t('result.rounds', { count: game.round })}</p>

        <h2 className="subhead">{t('result.stats')}</h2>
        <table className="stats-table">
          <thead>
            <tr>
              <th scope="col">{t('result.statsCols.player')}</th>
              <th scope="col">{t('result.statsCols.lives')}</th>
              <th scope="col">{t('result.statsCols.attacks')}</th>
              <th scope="col">{t('result.statsCols.hits')}</th>
              <th scope="col">{t('result.statsCols.damageDealt')}</th>
              <th scope="col">{t('result.statsCols.damageTaken')}</th>
              <th scope="col">{t('result.statsCols.tilesMoved')}</th>
              <th scope="col">{t('result.statsCols.tilesAdded')}</th>
              <th scope="col">{t('result.statsCols.tilesRemoved')}</th>
            </tr>
          </thead>
          <tbody>
            {ids.map((id) => {
              const p = game.participants[id];
              const f = game.figures[id];
              const s = game.stats[id];
              if (!p || !f || !s) return null;
              return (
                <tr key={id} className={f.alive ? '' : 'is-dead'}>
                  <th scope="row">
                    <Avatar name={p.name} avatar={p.avatar} size={28} dimmed={!f.alive} /> {p.name}
                  </th>
                  <td>
                    {f.hp} / {f.maxHp}
                  </td>
                  <td>{s.attacks}</td>
                  <td>{s.hits}</td>
                  <td>{s.damageDealt}</td>
                  <td>{s.damageTaken}</td>
                  <td>{s.tilesMoved}</td>
                  <td>{s.tilesAdded}</td>
                  <td>{s.tilesRemoved}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <h2 className="subhead">{t('result.albumTitle', { count: album.length })}</h2>
        {album.length === 0 ? (
          <p className="hint">{t('result.albumEmpty')}</p>
        ) : (
          <ol className="rule-album">
            {album.map((r) => {
              const author = game.participants[r.authorId];
              return (
                <li key={r.id} className={`album-card${active.has(r.id) ? '' : ' is-past'}`}>
                  <div className="album-head">
                    <strong>{r.def.ast.name}</strong>
                    <span className="pill">
                      {active.has(r.id) ? t('result.albumActive') : t('result.albumGone')}
                    </span>
                  </div>
                  <p>{ruleDescription(r.def, t)}</p>
                  <p className="hint">
                    {t('result.albumMeta', {
                      author: author?.name ?? '?',
                      round: r.activeFromRound,
                      count: r.firedTotal,
                    })}
                  </p>
                </li>
              );
            })}
          </ol>
        )}

        <div className="result-actions">
          <button
            type="button"
            className="btn btn-soft"
            onClick={() => {
              clear();
              setScreen('start');
            }}
          >
            {t('result.toStart')}
          </button>
          <button type="button" className="btn btn-primary btn-big" onClick={again} autoFocus>
            {t('result.again')}
          </button>
        </div>
      </section>
    </main>
  );
}
