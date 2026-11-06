import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSfx } from '../../audio/audio';
import type { GameState } from '../../engine/types';
import { useGame, type WheelState } from '../../store/gameStore';
import { Avatar } from './Avatar';

export const SPIN_MS = 2000;
const RESULT_MS = 1400;
const R = 150;

function arcPath(fromDeg: number, toDeg: number): string {
  const rad = (d: number) => ((d - 90) * Math.PI) / 180;
  const x1 = R * Math.cos(rad(fromDeg));
  const y1 = R * Math.sin(rad(fromDeg));
  const x2 = R * Math.cos(rad(toDeg));
  const y2 = R * Math.sin(rad(toDeg));
  const large = toDeg - fromDeg > 180 ? 1 : 0;
  return `M0 0 L${x1} ${y1} A${R} ${R} 0 ${large} 1 ${x2} ${y2} Z`;
}

function labelPos(deg: number, dist: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: dist * Math.cos(rad), y: dist * Math.sin(rad), rot: deg > 180 ? deg + 90 : deg - 90 };
}

interface Props {
  game: GameState;
  wheel: WheelState;
  /** The human is the attacker and spins manually. */
  manual: boolean;
}

/** Attack wheel overlay (SPEC 3, 8 screen 5). The result is decided by the engine before the spin. */
export function Wheel({ game, wheel, manual }: Props) {
  const { t } = useTranslation();
  const spin = useGame((s) => s.spinWheel);
  const showResult = useGame((s) => s.showWheelResult);
  const commit = useGame((s) => s.commitWheel);
  const cancel = useGame((s) => s.cancelWheel);
  const [rotation, setRotation] = useState(0);

  const chance = wheel.chance ?? wheel.previewChance;
  const hitDeg = chance * 3.6;
  const attacker = game.participants[wheel.attacker];
  const target = game.participants[wheel.target];
  const targetFig = game.figures[wheel.target];
  const shield = targetFig?.statuses.some((s) => s.kind === 'shield') ?? false;

  useEffect(() => {
    if (wheel.stage !== 'spinning' || wheel.roll === undefined) return;
    // Bring the rolled angle under the pointer after five full turns.
    const target = 360 * 5 + (360 - wheel.roll * 3.6);
    const raf = requestAnimationFrame(() => setRotation(target));
    let delay = 60;
    let tickTimer: ReturnType<typeof setTimeout>;
    const tick = () => {
      playSfx('tick');
      delay *= 1.12;
      tickTimer = setTimeout(tick, delay);
    };
    tick();
    const done = setTimeout(() => {
      clearTimeout(tickTimer);
      showResult();
    }, SPIN_MS);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(done);
      clearTimeout(tickTimer);
    };
  }, [wheel.stage, wheel.roll, showResult]);

  useEffect(() => {
    if (wheel.stage !== 'result') return;
    const timer = setTimeout(commit, RESULT_MS);
    return () => clearTimeout(timer);
  }, [wheel.stage, commit]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' && manual && wheel.stage === 'ready') {
        e.preventDefault();
        spin();
      } else if (e.key === 'Escape' && manual && wheel.stage === 'ready') {
        cancel();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [manual, wheel.stage, spin, cancel]);

  const hitLabel = labelPos(hitDeg / 2, R * 0.58);
  const missLabel = labelPos(hitDeg + (360 - hitDeg) / 2, R * 0.58);

  return (
    <div className="overlay">
      <div
        className="card wheel-card"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wheel-title"
      >
        <div className="wheel-versus">
          <div className="wheel-fighter">
            {attacker && (
              <Avatar
                name={attacker.name}
                avatar={attacker.avatar}
                size={72}
                boss={game.figures[wheel.attacker]?.kind === 'boss'}
              />
            )}
            <span>{attacker?.name}</span>
          </div>
          <span className="vs-badge">{t('wheel.vs')}</span>
          <div className="wheel-fighter">
            {target && (
              <Avatar
                name={target.name}
                avatar={target.avatar}
                size={72}
                boss={targetFig?.kind === 'boss'}
              />
            )}
            <span>{target?.name}</span>
          </div>
        </div>
        <h2 id="wheel-title">
          {t('wheel.attacks', { attacker: attacker?.name, target: target?.name })}
        </h2>

        <div className="wheel-stage">
          <svg
            className="wheel-pointer"
            width="44"
            height="40"
            viewBox="0 0 44 40"
            aria-hidden="true"
          >
            <path
              d="M4 4h36L22 36z"
              fill="#fff"
              stroke="#2B1A4A"
              strokeWidth="4"
              strokeLinejoin="round"
            />
          </svg>
          <svg
            width={R * 2 + 12}
            height={R * 2 + 12}
            viewBox={`${-R - 6} ${-R - 6} ${R * 2 + 12} ${R * 2 + 12}`}
            aria-hidden="true"
          >
            <g
              style={{
                transform: `rotate(${rotation}deg)`,
                transition:
                  wheel.stage === 'spinning'
                    ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.2, 1)`
                    : 'none',
              }}
            >
              <path d={arcPath(0, hitDeg)} fill="#21A05E" />
              <path d={arcPath(hitDeg, 360)} fill="#E5383B" />
              <line x1="0" y1="0" x2="0" y2={-R} stroke="#2B1A4A" strokeWidth="4" />
              <line
                x1="0"
                y1="0"
                x2={R * Math.cos(((hitDeg - 90) * Math.PI) / 180)}
                y2={R * Math.sin(((hitDeg - 90) * Math.PI) / 180)}
                stroke="#2B1A4A"
                strokeWidth="4"
              />
              <text
                className="wheel-label"
                transform={`translate(${hitLabel.x} ${hitLabel.y}) rotate(${hitLabel.rot})`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {t('wheel.hit').toUpperCase()}
              </text>
              <text
                className="wheel-label"
                transform={`translate(${missLabel.x} ${missLabel.y}) rotate(${missLabel.rot})`}
                textAnchor="middle"
                dominantBaseline="central"
              >
                {t('wheel.miss').toUpperCase()}
              </text>
            </g>
            <circle r={R} fill="none" stroke="#2B1A4A" strokeWidth="6" />
            <circle r={18} fill="#FFC83D" stroke="#2B1A4A" strokeWidth="5" />
          </svg>
        </div>

        <div className="wheel-pills">
          <span className="pill pill-green">{t('wheel.hitInfo')}</span>
          <span className="pill">{t('wheel.chance', { count: Math.round(chance) })}</span>
          <span className="pill">{shield ? t('wheel.shield') : t('wheel.noShield')}</span>
        </div>

        <div className="wheel-actions" aria-live="polite">
          {wheel.stage === 'ready' && manual && (
            <>
              <button type="button" className="btn btn-soft" onClick={cancel}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-big wheel-spin"
                onClick={spin}
                autoFocus
              >
                {t('wheel.spin')}
              </button>
            </>
          )}
          {wheel.stage === 'ready' && !manual && (
            <span className="wheel-result">{t('wheel.spin')}</span>
          )}
          {wheel.stage === 'ready' && manual && <span className="hint">{t('wheel.spinHint')}</span>}
          {wheel.stage === 'result' && (
            <>
              <span className={`wheel-result ${wheel.hit ? 'is-hit' : 'is-miss'}`}>
                {wheel.hit ? t('wheel.resultHit', { target: target?.name }) : t('wheel.resultMiss')}
              </span>
              <button type="button" className="btn" onClick={commit}>
                {t('wheel.continue')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
