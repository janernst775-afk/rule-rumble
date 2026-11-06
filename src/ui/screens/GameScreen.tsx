import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { playSfx, setMusic } from '../../audio/audio';
import { DIRECTIONS, hasTile, parseKey, samePos, tileKey, tileLabel } from '../../engine/board';
import { removeTileError, validAddPositions } from '../../engine/tiles';
import {
  actionAvailability,
  attackTargets,
  baseWheelChance,
  boss,
  currentFigure,
  effectiveMove,
  moveOptions,
} from '../../engine/query';
import type { ActionType, Figure, Pos, TileKey } from '../../engine/types';
import { useApp } from '../../store/appStore';
import { useGame } from '../../store/gameStore';
import { usePrefs } from '../../store/prefsStore';
import { useTextures } from '../../store/textureStore';
import { MuteButton } from '../components/AudioControls';
import { Avatar } from '../components/Avatar';
import { Board } from '../components/Board';
import { Dialog } from '../components/Dialog';
import { PlayersPanel, RulesPanel } from '../components/GamePanels';
import { MenuIcon } from '../components/Icons';
import { PrefsDialog } from '../components/PrefsDialog';
import { TileDialog, type TileDialogResult } from '../components/TileDialog';
import { RulePicker } from '../components/RulePicker';
import { RuleEditor } from '../editor/RuleEditor';
import { useLibrary } from '../../store/libraryStore';
import { ruleSlotsFull } from '../../engine/rules';
import type { RuleDefinition } from '../../lang/ast';
import { VoteDialog } from '../components/VoteDialog';
import { Wheel } from '../components/Wheel';
import { displayParams, isHumanTurn } from '../gameUi';
import { useBotDriver } from '../useBotDriver';

const ACTIONS: { type: ActionType; key: string; className: string }[] = [
  { type: 'attack', key: '1', className: 'btn-red' },
  { type: 'addTile', key: '2', className: '' },
  { type: 'removeTile', key: '3', className: '' },
  { type: 'addRule', key: '4', className: 'btn-primary' },
  { type: 'pass', key: '5', className: 'btn-pass' },
];

const HUMAN_STEP_MS = 160;

type TileMode = 'none' | 'add' | 'remove';

export function GameScreen() {
  const { t } = useTranslation();
  const game = useGame((s) => s.game);
  const wheel = useGame((s) => s.wheel);
  const anim = useGame((s) => s.anim);
  const toasts = useGame((s) => s.toasts);
  const dispatch = useGame((s) => s.dispatch);
  const animateMove = useGame((s) => s.animateMove);
  const openWheel = useGame((s) => s.openWheel);
  const dismissToast = useGame((s) => s.dismissToast);
  const clearGame = useGame((s) => s.clear);
  const setScreen = useApp((s) => s.setScreen);
  const rightOpen = usePrefs((s) => s.rightPanelOpen);
  const setRightOpen = usePrefs((s) => s.setRightPanelOpen);
  const textures = useTextures((s) => s.textures);
  const saveTexture = useTextures((s) => s.save);

  const [planState, setPlanState] = useState<{ key: string; path: Pos[] }>({ key: '', path: [] });
  const [targetState, setTargetState] = useState<{ key: string; targets: Figure[] } | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [clock, setClock] = useState({ key: '', start: 0, now: 0 });
  const [tileModeState, setTileModeState] = useState<{ key: string; mode: TileMode }>({
    key: '',
    mode: 'none',
  });
  const [dialogState, setDialogState] = useState<{ key: string; pos: Pos } | null>(null);
  const [pickerKey, setPickerKey] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<{
    key: string;
    initial: RuleDefinition | null;
  } | null>(null);
  const [preselectId, setPreselectId] = useState<string | undefined>(undefined);
  const saveRule = useLibrary((s) => s.save);

  useBotDriver();

  const me = game ? currentFigure(game) : null;
  const human = game ? isHumanTurn(game) : false;
  const busy = wheel !== null || anim !== null;
  const canAct = human && !busy;
  const turnKey = game ? `${game.round}:${game.turn.index}` : '';
  // Tile mode resets after each tile action (Baumeister allows a second one).
  const tileKeyOfTurn = game ? `${turnKey}:${game.turn.tileActionsUsed}` : '';
  const tileMode: TileMode =
    canAct && tileModeState.key === tileKeyOfTurn ? tileModeState.mode : 'none';
  const setTileMode = useCallback(
    (mode: TileMode) => setTileModeState({ key: tileKeyOfTurn, mode }),
    [tileKeyOfTurn],
  );
  const dialogPos = dialogState?.key === tileKeyOfTurn && canAct ? dialogState.pos : null;
  const pickerOpen = pickerKey === turnKey && canAct && !game?.pendingVote;
  const editor = editorState?.key === turnKey && pickerOpen ? editorState : null;
  const setEditor = setEditorState;
  // The human votes when an overflow vote is pending and it is one of the voters.
  const humanVoter = game?.pendingVote
    ? game.pendingVote.voters.find(
        (v) => game.participants[v]?.controller === 'human' && !game.pendingVote?.votes[v],
      )
    : undefined;

  // Plan and target choice belong to one turn; they reset implicitly when the turn changes.
  const plan = useMemo(
    () => (planState.key === turnKey ? planState.path : []),
    [planState, turnKey],
  );
  const setPlan = useCallback((path: Pos[]) => setPlanState({ key: turnKey, path }), [turnKey]);
  const targetChoice = targetState?.key === turnKey ? targetState.targets : null;
  const setTargetChoice = useCallback(
    (targets: Figure[] | null) => setTargetState(targets ? { key: turnKey, targets } : null),
    [turnKey],
  );

  const reachable = useMemo(
    () => (game && me && canAct && game.turn.phase === 'move' ? moveOptions(game, me.id) : null),
    [game, me, canAct],
  );

  const addPositions = useMemo(
    () => (game && tileMode === 'add' ? validAddPositions(game) : []),
    [game, tileMode],
  );
  const removeReasons = useMemo(() => {
    const map = new Map<TileKey, string | null>();
    if (!game || tileMode !== 'remove') return map;
    for (const key of Object.keys(game.tiles)) {
      const error = removeTileError(game, parseKey(key));
      map.set(key, error ? `reason.${error}` : null);
    }
    return map;
  }, [game, tileMode]);

  // Music: game loop, boss phase under 30 % boss hp.
  const bossFig = game ? boss(game) : undefined;
  const bossPhase = bossFig ? bossFig.alive && bossFig.hp / bossFig.maxHp < 0.3 : false;
  useEffect(() => {
    setMusic(bossPhase ? 'boss' : 'game');
  }, [bossPhase]);

  // Game over → result screen.
  useEffect(() => {
    if (!game || game.status !== 'over' || wheel) return;
    const humans = Object.values(game.participants).filter((p) => p.controller === 'human');
    const won = humans.some((p) => game.result?.winners.includes(p.figureId));
    playSfx(won ? 'victory' : 'defeat');
    const timer = setTimeout(() => setScreen('result'), 1500);
    return () => clearTimeout(timer);
  }, [game, wheel, setScreen]);

  // Toasts disappear after a few seconds.
  useEffect(() => {
    if (toasts.length === 0) return;
    const first = toasts[0];
    const timer = setTimeout(() => first && dismissToast(first.id), 3200);
    return () => clearTimeout(timer);
  }, [toasts, dismissToast]);

  const confirmMove = useCallback(
    (path: Pos[]) => {
      if (!me || !canAct || game?.turn.phase !== 'move') return;
      setPlan([]);
      void animateMove(me.id, path, HUMAN_STEP_MS);
    },
    [me, canAct, game, animateMove, setPlan],
  );

  const doAction = useCallback(
    (type: ActionType) => {
      if (!game || !me || !canAct) return;
      if (type === 'pass') {
        playSfx('click');
        dispatch({ type: 'pass', actor: me.id });
        return;
      }
      if (game.turn.phase !== 'action') return;
      if (!actionAvailability(game, type).available) return;
      if (type === 'addTile' || type === 'removeTile') {
        const mode = type === 'addTile' ? 'add' : 'remove';
        playSfx('click');
        setTileMode(tileMode === mode ? 'none' : mode);
        return;
      }
      if (type === 'addRule') {
        playSfx('click');
        setPickerKey(turnKey);
        return;
      }
      if (type === 'attack') {
        const targets = attackTargets(game, me.id);
        if (targets.length === 1 && targets[0])
          openWheel(me.id, targets[0].id, baseWheelChance(game, me));
        else if (targets.length > 1) setTargetChoice(targets);
      }
    },
    [game, me, canAct, dispatch, openWheel, setTargetChoice, tileMode, setTileMode, turnKey],
  );

  // Turn timer (UI only; the engine never reads the clock).
  const turnTime = game?.settings.tempo.turnTimeSec ?? null;
  useEffect(() => {
    if (!turnTime || !human) return;
    const tick = () =>
      setClock((c) =>
        c.key === turnKey
          ? { ...c, now: Date.now() }
          : { key: turnKey, start: Date.now(), now: Date.now() },
      );
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 250);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [turnKey, turnTime, human]);
  const timeLeft =
    turnTime && human && clock.key === turnKey
      ? turnTime - Math.floor((clock.now - clock.start) / 1000)
      : null;
  useEffect(() => {
    if (timeLeft !== null && timeLeft <= 0 && me && human && !wheel && !anim) {
      dispatch({ type: 'pass', actor: me.id });
    }
  }, [timeLeft, me, human, wheel, anim, dispatch]);

  // Keyboard: arrows plan, Enter confirms, 1–5 actions, R toggles rules panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      if (wheel || menuOpen || prefsOpen || targetChoice || confirmLeave || dialogPos) return;
      if (pickerOpen || humanVoter) return;
      if (e.key === 'Escape' && tileMode !== 'none') {
        setTileMode('none');
        return;
      }
      if (e.key.toLowerCase() === 'r' && !e.ctrlKey && !e.metaKey) {
        setRightOpen(!rightOpen);
        return;
      }
      if (!game || !me || !canAct) return;
      const action = ACTIONS.find((a) => a.key === e.key);
      if (action) {
        e.preventDefault();
        doAction(action.type);
        return;
      }
      if (game.turn.phase !== 'move') return;
      const dirIndex = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'].indexOf(e.key);
      if (dirIndex >= 0) {
        e.preventDefault();
        const d = DIRECTIONS[dirIndex];
        if (!d) return;
        const from = plan.at(-1) ?? me.pos;
        const next = { x: from.x + d.x, y: from.y + d.y };
        const before = plan.length >= 2 ? plan[plan.length - 2] : me.pos;
        if (plan.length > 0 && before && samePos(next, before)) {
          setPlan(plan.slice(0, -1));
        } else if (plan.length < effectiveMove(me) && hasTile(game.tiles, next)) {
          setPlan([...plan, next]);
          playSfx('tick');
        }
      } else if (e.key === 'Enter') {
        e.preventDefault();
        confirmMove(plan);
      } else if (e.key === 'Escape') {
        setPlan([]);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    game,
    me,
    canAct,
    plan,
    setPlan,
    wheel,
    menuOpen,
    prefsOpen,
    targetChoice,
    confirmLeave,
    dialogPos,
    pickerOpen,
    humanVoter,
    tileMode,
    setTileMode,
    rightOpen,
    setRightOpen,
    doAction,
    confirmMove,
  ]);

  if (!game) return null;

  const onTileClick = (pos: Pos) => {
    if (tileMode === 'remove' && me) {
      if (removeReasons.get(tileKey(pos)) === null) {
        playSfx('tileRemove');
        dispatch({ type: 'removeTile', actor: me.id, pos });
      }
      return;
    }
    if (!reachable) return;
    const path = reachable.get(tileKey(pos));
    if (!path) return;
    const end = plan.at(-1);
    if (end && samePos(end, pos)) confirmMove(plan);
    else if (me && samePos(me.pos, pos) && plan.length === 0) confirmMove([]);
    else {
      setPlan(path);
      playSfx('tick');
    }
  };

  const participant = me ? game.participants[me.id] : undefined;
  const tilesCount = Object.keys(game.tiles).length;

  const onPlaceholderClick = (pos: Pos) => {
    if (!me) return;
    if (game.settings.board.customTextures) {
      setDialogState({ key: tileKeyOfTurn, pos });
    } else {
      playSfx('tileAdd');
      dispatch({ type: 'addTile', actor: me.id, pos, textureId: null });
    }
  };

  const onTileCreated = (pos: Pos, result: TileDialogResult) => {
    if (!me) return;
    if (result.texture && result.isNew) void saveTexture(result.texture);
    setDialogState(null);
    playSfx('tileAdd');
    dispatch({ type: 'addTile', actor: me.id, pos, textureId: result.texture?.id ?? null });
  };

  const leave = () => {
    clearGame();
    setScreen('lobby');
  };

  return (
    <main className="game-screen">
      <header className="game-top">
        <span className="round-badge">{t('game.round', { round: game.round })}</span>
        <div className="phase-banner" aria-live="polite">
          {participant && me && (
            <Avatar
              name={participant.name}
              avatar={participant.avatar}
              size={44}
              boss={me.kind === 'boss'}
            />
          )}
          <strong>
            {game.status === 'over'
              ? t(`log.gameOver.${game.result?.winner ?? 'draw'}`)
              : t('game.onTurn', { name: participant?.name ?? '' })}
          </strong>
          {game.status === 'playing' && (
            <>
              <span
                className={`phase-pill${game.turn.phase === 'move' ? ' is-active' : ' is-done'}`}
              >
                {t('game.phaseMove')}
                {game.turn.phase === 'action' ? ' ✓' : ''}
              </span>
              <span className={`phase-pill${game.turn.phase === 'action' ? ' is-active' : ''}`}>
                {t('game.phaseAction')}
              </span>
              {timeLeft !== null && (
                <span className="timer">
                  {t('game.timeLeft', { count: Math.max(0, timeLeft) })}
                </span>
              )}
            </>
          )}
        </div>
        <div className="game-top-right">
          <span className="tiles-count">
            {t('game.tiles', { count: tilesCount, max: game.settings.board.maxTiles })}
          </span>
          <MuteButton />
          <div className="menu-wrap">
            <button
              type="button"
              className="icon-btn"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={t('game.menu')}
              title={t('game.menu')}
              onClick={() => setMenuOpen(!menuOpen)}
            >
              <MenuIcon />
            </button>
            {menuOpen && (
              <div className="card menu" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setPrefsOpen(true);
                  }}
                >
                  {t('prefs.title')}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    setConfirmLeave(true);
                  }}
                >
                  {t('game.leave')}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <div className="hint-line" aria-live="polite">
        {game.status === 'playing' &&
          (human
            ? game.turn.phase === 'move'
              ? t('game.phaseMoveHint')
              : tileMode === 'add'
                ? t('game.addTileHint')
                : tileMode === 'remove'
                  ? t('game.removeTileHint')
                  : game.turn.tileActionsUsed > 0
                    ? t('game.secondTileActionHint')
                    : t('game.phaseActionHint')
            : t('game.botThinking', { name: participant?.name ?? '' }))}
      </div>

      <div className="game-body">
        <PlayersPanel state={game} />
        <section className="board-area">
          <div className="toasts" aria-live="polite">
            {toasts.map((toast) => (
              <div key={toast.id} className={`toast toast-${toast.tone}`}>
                {t(toast.key, displayParams(game, toast.params))}
              </div>
            ))}
          </div>
          <Board
            state={game}
            anim={anim}
            reachable={reachable}
            plan={plan}
            onTileClick={onTileClick}
            tileMode={tileMode}
            addPositions={addPositions}
            removeReasons={removeReasons}
            textures={textures}
            showTextures={game.settings.board.customTextures}
            onPlaceholderClick={onPlaceholderClick}
          />
          {canAct && game.turn.phase === 'move' && (
            <div className="move-controls">
              <button
                type="button"
                className="btn btn-soft"
                onClick={() => setPlan([])}
                disabled={plan.length === 0}
              >
                {t('game.resetMove')}
              </button>
              <button type="button" className="btn" onClick={() => confirmMove([])}>
                {t('game.stay')}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => confirmMove(plan)}
                disabled={plan.length === 0}
              >
                {t('game.confirmMove')}
              </button>
            </div>
          )}
        </section>
        <RulesPanel state={game} />
      </div>

      <nav className="action-bar" aria-label={t('game.phaseAction')}>
        {ACTIONS.map((a) => {
          const avail = actionAvailability(game, a.type);
          let reason: string | null = null;
          if (!human) reason = t('reason.notYourTurn');
          else if (a.type !== 'pass' && game.turn.phase === 'move') reason = t('reason.movePhase');
          else if (!avail.available) reason = t(avail.reason);
          const disabled = reason !== null || busy;
          return (
            <span key={a.type} className="action-wrap" title={reason ?? undefined}>
              <button
                type="button"
                className={`btn action-btn ${a.className}`}
                disabled={disabled}
                aria-keyshortcuts={a.key}
                aria-pressed={
                  a.type === 'addTile'
                    ? tileMode === 'add'
                    : a.type === 'removeTile'
                      ? tileMode === 'remove'
                      : undefined
                }
                aria-describedby={reason ? `reason-${a.type}` : undefined}
                onClick={() => doAction(a.type)}
              >
                <span className="action-key">{a.key}</span> {t(`game.actions.${a.type}`)}
              </button>
              {reason && (
                <span id={`reason-${a.type}`} className="visually-hidden">
                  {reason}
                </span>
              )}
            </span>
          );
        })}
      </nav>

      {targetChoice && me && (
        <Dialog title={t('game.chooseTarget')} onClose={() => setTargetChoice(null)}>
          <div className="target-list">
            {targetChoice.map((f) => {
              const p = game.participants[f.id];
              return (
                <button
                  key={f.id}
                  type="button"
                  className="btn target-btn"
                  onClick={() => {
                    setTargetChoice(null);
                    openWheel(me.id, f.id, baseWheelChance(game, me));
                  }}
                >
                  {p && (
                    <Avatar name={p.name} avatar={p.avatar} size={36} boss={f.kind === 'boss'} />
                  )}
                  {p?.name} · {t('common.lives', { count: f.hp })}
                </button>
              );
            })}
          </div>
        </Dialog>
      )}
      {wheel && (
        <Wheel
          game={game}
          wheel={wheel}
          manual={game.participants[wheel.attacker]?.controller === 'human'}
        />
      )}
      {prefsOpen && <PrefsDialog onClose={() => setPrefsOpen(false)} />}
      {dialogPos && me && (
        <TileDialog
          placeLabel={t('tileDialog.place', {
            label: tileLabel(
              {
                ...game.tiles,
                [tileKey(dialogPos)]: {
                  pos: dialogPos,
                  type: 'normal',
                  textureId: null,
                  visitedBy: [],
                },
              },
              dialogPos,
            ),
          })}
          author={participant?.name ?? ''}
          onCancel={() => setDialogState(null)}
          onCreate={(result) => onTileCreated(dialogPos, result)}
        />
      )}
      {pickerOpen && me && !editor && (
        <RulePicker
          game={game}
          preselectId={preselectId}
          onCancel={() => setPickerKey(null)}
          onEdit={(initial) => setEditor({ key: turnKey, initial })}
          onConfirm={(rule, replaceRuleId) => {
            setPickerKey(null);
            dispatch(
              replaceRuleId
                ? { type: 'addRule', actor: me.id, rule, replaceRuleId }
                : { type: 'addRule', actor: me.id, rule },
            );
          }}
        />
      )}
      {editor && me && (
        <RuleEditor
          initial={editor.initial}
          game={game}
          author={participant?.name ?? ''}
          onClose={() => setEditor(null)}
          onSave={(def) => {
            saveRule(def);
            setPreselectId(def.id);
            setEditor(null);
          }}
          onPlay={(def) => {
            saveRule(def);
            setEditor(null);
            // "Ersteller wählt" needs a choice: go back to the picker with the rule selected.
            if (ruleSlotsFull(game) && game.settings.rules.overflow === 'authorChooses') {
              setPreselectId(def.id);
              return;
            }
            setPickerKey(null);
            dispatch({ type: 'addRule', actor: me.id, rule: def });
          }}
        />
      )}
      {humanVoter && (
        <VoteDialog
          game={game}
          voter={humanVoter}
          onVote={(ruleId) => dispatch({ type: 'voteRule', actor: humanVoter, ruleId })}
        />
      )}
      {confirmLeave && (
        <Dialog title={t('game.leaveConfirm')} onClose={() => setConfirmLeave(false)}>
          <div className="dialog-actions">
            <button type="button" className="btn btn-soft" onClick={() => setConfirmLeave(false)}>
              {t('common.cancel')}
            </button>
            <button type="button" className="btn btn-red" onClick={leave}>
              {t('game.leave')}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}
