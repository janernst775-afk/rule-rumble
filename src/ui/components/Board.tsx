import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  addablePositions,
  boardBounds,
  parseKey,
  samePos,
  tileKey,
  tileLabel,
} from '../../engine/board';
import type { TextureRecord } from '../../assets/store';
import type { Figure, GameState, Pos, TileKey, TileType } from '../../engine/types';
import { GAP, PITCH, TILE } from '../gameUi';
import { initials } from '../avatarUtils';
import { MinusIcon, PlusIcon, TargetIcon } from './Icons';

interface Props {
  state: GameState;
  /** Display override while a figure walks. */
  anim: { figure: string; pos: Pos } | null;
  reachable: Map<TileKey, Pos[]> | null;
  plan: Pos[];
  onTileClick: (pos: Pos) => void;
  /** Tile action mode of the human player. */
  tileMode: 'none' | 'add' | 'remove';
  /** Valid positions for "Feld +" (shown as dashed placeholders in add mode). */
  addPositions: Pos[];
  /** For remove mode: i18n reason why a tile cannot be removed, null if it can. */
  removeReasons: Map<TileKey, string | null>;
  textures: Record<string, TextureRecord>;
  showTextures: boolean;
  onPlaceholderClick: (pos: Pos) => void;
}

interface View {
  scale: number;
  x: number;
  y: number;
}

const SLOT_OFFSETS: Record<number, Pos[]> = {
  1: [{ x: 0, y: 0 }],
  2: [
    { x: 0, y: -12 },
    { x: 0, y: 12 },
  ],
  3: [
    { x: -12, y: -12 },
    { x: 12, y: -12 },
    { x: 0, y: 12 },
  ],
  4: [
    { x: -12, y: -12 },
    { x: 12, y: -12 },
    { x: -12, y: 12 },
    { x: 12, y: 12 },
  ],
};

function displayPos(fig: Figure, anim: Props['anim']): Pos {
  return anim && anim.figure === fig.id ? anim.pos : fig.pos;
}

export function Board({
  state,
  anim,
  reachable,
  plan,
  onTileClick,
  tileMode,
  addPositions,
  removeReasons,
  textures,
  showTextures,
  onPlaceholderClick,
}: Props) {
  const { t } = useTranslation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View>({ scale: 1, x: 0, y: 0 });
  const [hover, setHover] = useState<{ key: TileKey; x: number; y: number } | null>(null);
  const drag = useRef<{ x: number; y: number; vx: number; vy: number; moved: boolean } | null>(
    null,
  );

  // Bounds include the ring of possible new tiles so the board does not jump in add mode.
  const ring = useMemo(() => addablePositions(state.tiles), [state.tiles]);
  const bounds = boardBounds({
    ...state.tiles,
    ...Object.fromEntries(
      ring.map((p) => [
        tileKey(p),
        { pos: p, type: 'normal' as const, textureId: null, visitedBy: [] },
      ]),
    ),
  });
  const usedTextures = useMemo(() => {
    if (!showTextures) return [];
    const ids = new Set(Object.values(state.tiles).map((t) => t.textureId));
    return [...ids].filter((id): id is string => !!id && !!textures[id]);
  }, [state.tiles, textures, showTextures]);
  const width = (bounds.maxX - bounds.minX + 1) * PITCH + GAP;
  const height = (bounds.maxY - bounds.minY + 1) * PITCH + GAP;
  const px = (p: Pos) => (p.x - bounds.minX) * PITCH + GAP;
  const py = (p: Pos) => (p.y - bounds.minY) * PITCH + GAP;

  const currentId = state.status === 'playing' ? state.turn.order[state.turn.index] : undefined;
  const planEnd = plan.at(-1);
  const planKeys = useMemo(() => new Set(plan.map(tileKey)), [plan]);

  // Groups living figures per tile for slot placement.
  const byTile = useMemo(() => {
    const map = new Map<TileKey, Figure[]>();
    for (const id of [
      ...state.seatOrder,
      ...Object.keys(state.figures).filter((k) => !state.seatOrder.includes(k)),
    ]) {
      const fig = state.figures[id];
      if (!fig || !fig.alive) continue;
      const k = tileKey(displayPos(fig, anim));
      map.set(k, [...(map.get(k) ?? []), fig]);
    }
    return map;
  }, [state.figures, state.seatOrder, anim]);

  // Wheel zoom needs a non-passive listener.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setView((v) => ({
        ...v,
        scale: Math.min(2.5, Math.max(0.4, v.scale * (e.deltaY < 0 ? 1.1 : 0.9))),
      }));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    drag.current = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  };
  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    const dy = e.clientY - d.y;
    if (!d.moved && Math.hypot(dx, dy) > 5) {
      d.moved = true;
      e.currentTarget.setPointerCapture(e.pointerId);
    }
    if (d.moved) setView((v) => ({ ...v, x: d.vx + dx, y: d.vy + dy }));
  };
  const onPointerUp = () => {
    // Keep `moved` for the click handler that fires right after pointerup.
    setTimeout(() => (drag.current = null), 0);
  };
  const clickTile = (pos: Pos) => {
    if (drag.current?.moved) return;
    onTileClick(pos);
  };

  const hoverInfo = hover ? state.tiles[hover.key] : undefined;
  const hoverFigures = hoverInfo ? (byTile.get(hover?.key ?? '') ?? []) : [];

  return (
    <div
      ref={wrapRef}
      className="board-wrap"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerLeave={() => setHover(null)}
    >
      <div
        className="board-transform"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.scale})` }}
      >
        <svg
          className="board-svg"
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="group"
          aria-label={t('game.boardLabel')}
        >
          <defs>
            <pattern id="tile-dots" width="12" height="12" patternUnits="userSpaceOnUse">
              <circle cx="3" cy="3" r="1.6" fill="#2B1A4A" opacity="0.12" />
              <circle cx="9" cy="9" r="1.6" fill="#2B1A4A" opacity="0.12" />
            </pattern>
            {Object.values(state.figures).map((f) => {
              const img = state.participants[f.id]?.avatar.image;
              return img ? (
                <pattern
                  key={f.id}
                  id={`img-${f.id}`}
                  width="1"
                  height="1"
                  patternContentUnits="objectBoundingBox"
                >
                  <image href={img} width="1" height="1" preserveAspectRatio="xMidYMid slice" />
                </pattern>
              ) : null;
            })}
            {usedTextures.map((id) => (
              <pattern
                key={id}
                id={`tex-${id}`}
                width="1"
                height="1"
                patternContentUnits="objectBoundingBox"
              >
                <image
                  href={textures[id]?.dataUrl}
                  width="1"
                  height="1"
                  preserveAspectRatio="none"
                  style={{ imageRendering: 'pixelated' }}
                />
              </pattern>
            ))}
          </defs>

          {Object.entries(state.tiles).map(([key, tile]) => {
            const pos = parseKey(key);
            const isReach = reachable?.has(key) ?? false;
            const isPlan = planKeys.has(key);
            const isEnd = planEnd !== undefined && samePos(planEnd, pos);
            const label = tileLabel(state.tiles, pos);
            const classes = ['tile'];
            if (isReach) classes.push('is-reachable');
            if (tileMode === 'remove') {
              classes.push(removeReasons.get(key) === null ? 'is-removable' : 'is-blocked');
            }
            const texture =
              showTextures && tile.textureId && textures[tile.textureId] ? tile.textureId : null;
            if (isPlan) classes.push('is-plan');
            if (isEnd) classes.push('is-plan-end');
            const occupants = byTile.get(key) ?? [];
            return (
              <g
                key={key}
                className={classes.join(' ')}
                transform={`translate(${px(pos)} ${py(pos)})`}
                onClick={() => clickTile(pos)}
                onMouseEnter={(e) => setHover({ key, x: e.clientX, y: e.clientY })}
                onMouseMove={(e) => setHover({ key, x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setHover((h) => (h?.key === key ? null : h))}
                role={
                  isReach || (tileMode === 'remove' && removeReasons.get(key) === null)
                    ? 'button'
                    : undefined
                }
                aria-label={`${t('game.tile', { label })}${occupants.length ? ': ' + occupants.map((f) => state.participants[f.id]?.name ?? f.id).join(', ') : ''}`}
              >
                <rect className="tile-shadow" x={0} y={5} width={TILE} height={TILE} rx={12} />
                <rect
                  className={`tile-face${texture ? ' has-texture' : ''}`}
                  x={0}
                  y={0}
                  width={TILE}
                  height={TILE}
                  rx={12}
                  style={texture ? { fill: `url(#tex-${texture})` } : undefined}
                />
                {!texture && (
                  <rect
                    x={0}
                    y={0}
                    width={TILE}
                    height={TILE}
                    rx={12}
                    fill="url(#tile-dots)"
                    pointerEvents="none"
                  />
                )}
                {tileMode === 'remove' && removeReasons.get(key) === null && (
                  <rect
                    className="tile-remove-mark"
                    x={0}
                    y={0}
                    width={TILE}
                    height={TILE}
                    rx={12}
                  />
                )}
                {tile.type !== 'normal' && <TileTypeBadge type={tile.type} />}
                {tile.type !== 'normal' && (
                  <rect
                    x={2}
                    y={2}
                    width={TILE - 4}
                    height={TILE - 4}
                    rx={10}
                    className={`tile-type tile-type-${tile.type}`}
                  />
                )}
              </g>
            );
          })}

          {tileMode === 'add' &&
            addPositions.map((pos) => {
              const label = tileLabel(state.tiles, pos);
              return (
                <g
                  key={`add-${tileKey(pos)}`}
                  className="tile-placeholder"
                  transform={`translate(${px(pos)} ${py(pos)})`}
                  role="button"
                  tabIndex={0}
                  aria-label={t('game.addTileAt', { label })}
                  onClick={() => !drag.current?.moved && onPlaceholderClick(pos)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onPlaceholderClick(pos);
                    }
                  }}
                >
                  <rect x={2} y={2} width={TILE - 4} height={TILE - 4} rx={12} />
                  <path d={`M${TILE / 2} ${TILE / 2 - 10}v20M${TILE / 2 - 10} ${TILE / 2}h20`} />
                </g>
              );
            })}

          {[...byTile.entries()].map(([key, figs]) => {
            const pos = parseKey(key);
            const slots = SLOT_OFFSETS[Math.min(4, figs.length)] ?? SLOT_OFFSETS[1]!;
            const r = figs.length === 1 ? 20 : 14;
            return figs.slice(0, 4).map((fig, i) => {
              const slot = slots[i] ?? { x: 0, y: 0 };
              const p = state.participants[fig.id];
              const cx = px(pos) + TILE / 2 + slot.x;
              const cy = py(pos) + TILE / 2 + slot.y;
              const isCurrent = fig.id === currentId;
              return (
                <g
                  key={fig.id}
                  className="token"
                  style={{ transform: `translate(${cx}px, ${cy}px)` }}
                  pointerEvents="none"
                >
                  {isCurrent && <circle r={r + 6} className="token-ring" />}
                  <circle
                    r={r}
                    fill={p?.avatar.image ? `url(#img-${fig.id})` : (p?.avatar.color ?? '#999')}
                    className="token-body"
                  />
                  {!p?.avatar.image && (
                    <text
                      className="token-text"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={r * 0.75}
                    >
                      {fig.kind === 'npc'
                        ? (state.npcTypes.find((n) => n.id === fig.npcTypeId)?.symbol ?? 'N')
                        : initials(p?.name ?? '?')}
                    </text>
                  )}
                  {fig.kind === 'boss' && (
                    <path
                      d={`M${-r * 0.55} ${-r - 2} l0 ${-r * 0.55} l${r * 0.27} ${r * 0.3} l${r * 0.28} ${-r * 0.42} l${r * 0.28} ${r * 0.42} l${r * 0.27} ${-r * 0.3} l0 ${r * 0.55} z`}
                      fill="#FFC83D"
                      stroke="#2B1A4A"
                      strokeWidth={2}
                      strokeLinejoin="round"
                    />
                  )}
                </g>
              );
            });
          })}
        </svg>
      </div>

      {hover && hoverInfo && (
        <div
          className="tile-tooltip"
          style={{ left: hover.x + 14, top: hover.y + 14 }}
          role="tooltip"
        >
          <strong>{t('game.tile', { label: tileLabel(state.tiles, hoverInfo.pos) })}</strong>
          <span>
            {t(`game.tileTypes.${hoverInfo.type}`)} ·{' '}
            {hoverFigures.length
              ? hoverFigures.map((f) => state.participants[f.id]?.name ?? f.id).join(', ')
              : t('game.tileEmpty')}
          </span>
          {hoverInfo.textureId && textures[hoverInfo.textureId] && (
            <span>
              {t('game.textureBy', {
                name: textures[hoverInfo.textureId]?.name,
                author: textures[hoverInfo.textureId]?.author,
              })}
            </span>
          )}
          <span>{t('game.tileInfoRules')}</span>
          {tileMode === 'remove' && removeReasons.get(hover?.key ?? '') && (
            <span className="tooltip-reason">{t(removeReasons.get(hover?.key ?? '') ?? '')}</span>
          )}
        </div>
      )}

      <div className="zoom-controls">
        <button
          type="button"
          className="icon-btn icon-btn-small"
          aria-label={t('game.zoomIn')}
          title={t('game.zoomIn')}
          onClick={() => setView((v) => ({ ...v, scale: Math.min(2.5, v.scale * 1.2) }))}
        >
          <PlusIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-small"
          aria-label={t('game.zoomOut')}
          title={t('game.zoomOut')}
          onClick={() => setView((v) => ({ ...v, scale: Math.max(0.4, v.scale / 1.2) }))}
        >
          <MinusIcon size={18} />
        </button>
        <button
          type="button"
          className="icon-btn icon-btn-small"
          aria-label={t('game.center')}
          title={t('game.center')}
          onClick={() => setView({ scale: 1, x: 0, y: 0 })}
        >
          <TargetIcon size={18} />
        </button>
      </div>
    </div>
  );
}

const TYPE_ICON: Record<Exclude<TileType, 'normal'>, { color: string; path: string }> = {
  lava: {
    color: '#FF7A1A',
    path: 'M0 -6c3 3 5 5 5 8a5 5 0 0 1-10 0c0-2 2-4 3-5 0 2 1 3 2 3 0-2-1-4 0-6z',
  },
  eis: { color: '#4FB6F0', path: 'M0 -6v12M-5 -3l10 6M-5 3l10 -6' },
  heilquelle: { color: '#2FA866', path: 'M-2 -6h4v4h4v4h-4v4h-4v-4h-4v-4h4z' },
  falle: { color: '#8A5A2B', path: 'M0 -6l6 11h-12zM0 -2v3M0 3v0.5' },
  wasser: { color: '#2B7BD8', path: 'M-6 -1q3 -3 6 0t6 0M-6 4q3 -3 6 0t6 0' },
};

/** Small symbol in the tile corner so rule tile types stay readable over textures (SPEC 4.1). */
function TileTypeBadge({ type }: { type: Exclude<TileType, 'normal'> }) {
  const icon = TYPE_ICON[type];
  return (
    <g transform={`translate(${TILE - 13} 13)`} pointerEvents="none" aria-hidden="true">
      <circle r={10} fill="#fff" stroke={icon.color} strokeWidth={2.5} />
      <path
        d={icon.path}
        fill={type === 'eis' || type === 'falle' || type === 'wasser' ? 'none' : icon.color}
        stroke={icon.color}
        strokeWidth={type === 'eis' || type === 'falle' || type === 'wasser' ? 2 : 0}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}
