import { useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { debugNpc, type DebugRun } from '../../bots/debugRun';
import { NPC_LIMITS } from '../../engine/limits';
import { DEFAULT_SETTINGS } from '../../engine/settings';
import type { NpcBehavior, NpcType } from '../../engine/types';
import type { EffectDef, FunctionDef } from '../../lang/ast';
import { slug } from '../../lang/library/startRules';
import { parseProgram } from '../../lang/parser';
import { printNpcCode } from '../../lang/printer';
import { validateNpcCode } from '../../lang/validator';
import { useProfile } from '../../store/profileStore';
import { CodePanel } from '../code/CodePanel';
import type { CodeProblem } from '../code/CodeEditor';
import { DebugPanel } from '../code/DebugPanel';
import type { CompletionWords } from '../code/language';
import { parseProblems, validationProblems } from '../code/problems';
import { ACCEPTED_TYPES, checkImageFile } from '../avatarUtils';
import { Avatar } from '../components/Avatar';
import { Segmented, Stepper } from '../components/Controls';
import { ImageCropper } from '../components/ImageCropper';
import {
  PaintCanvas,
  type PaintCanvasHandle,
  type PaintState,
} from '../components/paint/PaintCanvas';
import { PaintToolbar } from '../components/paint/PaintToolbar';
import {
  BRUSH_SIZES,
  PALETTE,
  TEXTURE_SIZE,
  type PaintTool,
} from '../components/paint/paintConfig';

const BEHAVIORS: NpcBehavior[] = ['chase', 'wander', 'stand', 'flee'];

interface Props {
  initial: NpcType | null;
  /** Ids already taken by other NPC types. */
  takenIds: string[];
  onSave: (npc: NpcType, previousId: string | null) => void;
  onDelete?: (() => void) | undefined;
  /** Effects, functions and NPC types own code may use. */
  library: {
    effects: readonly EffectDef[];
    functions: readonly FunctionDef[];
    npcTypes: readonly NpcType[];
  };
  words: CompletionWords;
  /** Names of recorded sounds (NPC sound, SPEC 5.9). */
  sounds: string[];
}

/** Own NPC type (SPEC 5.9): name, look, life, movement, behavior template or own code (5.8). */
export function NpcEditor({ initial, takenIds, onSave, onDelete, library, words, sounds }: Props) {
  const { t } = useTranslation();
  const lang = useProfile((s) => s.codeLang);
  const [name, setName] = useState(initial?.name ?? t('workshop.npc.defaultName'));
  const [symbol, setSymbol] = useState(initial?.symbol ?? 'G');
  const [color, setColor] = useState(initial?.color ?? '#9B5CF6');
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [hp, setHp] = useState(initial?.hp ?? 1);
  const [move, setMove] = useState(initial?.move ?? 1);
  const [behavior, setBehavior] = useState<NpcBehavior>(initial?.behavior ?? 'chase');
  const [useCode, setUseCode] = useState(!!initial?.code?.length);
  const [sound, setSound] = useState<string>(initial?.sound ?? '');
  const [codeText, setCodeText] = useState(() =>
    initial?.code?.length
      ? printNpcCode({ npc: initial.name, body: initial.code }, lang)
      : t('workshop.npc.codeTemplate', { name: initial?.name ?? t('workshop.npc.defaultName') }),
  );
  const [debug, setDebug] = useState<{ run: DebugRun; index: number } | null>(null);
  const [look, setLook] = useState<'symbol' | 'draw' | 'upload'>('symbol');
  const [tool, setTool] = useState<PaintTool>('brush');
  const [size, setSize] = useState<number>(BRUSH_SIZES[1]);
  const [paint, setPaint] = useState<PaintState>({
    dataUrl: '',
    blank: true,
    canUndo: false,
    canRedo: false,
  });
  const paintRef = useRef<PaintCanvasHandle>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const id = slug(name).slice(0, 30);
  const idTaken = takenIds.includes(id) && id !== initial?.id;

  // Own behavior: NPC "Name" ZUG … ENDE, checked against this type.
  const code = useMemo((): { body: NpcType['code']; problems: CodeProblem[] } => {
    if (!useCode) return { body: null, problems: [] };
    const { parsed, errors } = parseProgram(codeText);
    const problems = parseProblems(errors, t);
    const p = parsed.program;
    const npcCode = p.npcCode[0];
    const count = p.npcCode.length + p.rules.length + p.effects.length + p.functions.length;
    if (errors.length === 0 && (!npcCode || count > 1)) {
      problems.push({ line: 1, message: t(npcCode ? 'parse.oneNpcOnly' : 'parse.expectedNpc') });
    }
    if (!npcCode || problems.length > 0) return { body: null, problems };
    const self: NpcType = { id, name, symbol, color, hp, move, behavior };
    const types = [...library.npcTypes.filter((n) => n.id !== id && n.id !== initial?.id), self];
    const errs = validateNpcCode(
      { npc: id, body: npcCode.body },
      DEFAULT_SETTINGS,
      types,
      library.effects,
      library.functions,
    );
    problems.push(...validationProblems(errs, t));
    return { body: problems.length === 0 ? npcCode.body : null, problems };
  }, [useCode, codeText, t, id, name, symbol, color, hp, move, behavior, library, initial]);

  const valid =
    name.trim().length > 0 &&
    id.length > 0 &&
    !idTaken &&
    [...symbol].length <= 2 &&
    (!useCode || !!code.body);

  const debugStep = (toEnd: boolean) => {
    if (!code.body) return;
    const run =
      debug?.run ??
      debugNpc(
        { id: id || 'npc', name, symbol, color, hp, move, behavior },
        code.body,
        { ...library },
        1,
      );
    const last = run.steps.length - 1;
    setDebug({ run, index: toEnd ? last : Math.min(last, (debug?.index ?? -1) + 1) });
  };

  const save = () => {
    if (!valid) return;
    onSave(
      {
        id,
        name: name.trim(),
        symbol: symbol.trim() || name.trim().charAt(0).toUpperCase(),
        color,
        image,
        hp,
        move,
        behavior,
        code: useCode ? code.body : null,
        sound: sound || null,
      },
      initial?.id ?? null,
    );
  };

  return (
    <div className="npc-editor">
      <div className="npc-preview">
        <Avatar name={symbol || '?'} avatar={{ image, color }} size={96} />
        <code className="hint">SPAWNE {id || '…'} AUF feld</code>
      </div>
      <div className="npc-fields">
        <label>
          <span className="label">{t('workshop.npc.name')}</span>
          <input
            className="input input-small"
            value={name}
            maxLength={30}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        {idTaken && <p className="form-error">{t('workshop.npc.idTaken', { id })}</p>}
        <div className="npc-row">
          <div className="npc-stat">
            <span className="label">{t('workshop.npc.life')}</span>
            <Stepper
              label={t('workshop.npc.life')}
              value={hp}
              min={NPC_LIMITS.hp.min}
              max={NPC_LIMITS.hp.max}
              onChange={setHp}
            />
          </div>
          <div className="npc-stat">
            <span className="label">{t('workshop.npc.move')}</span>
            <Stepper
              label={t('workshop.npc.move')}
              value={move}
              min={NPC_LIMITS.move.min}
              max={NPC_LIMITS.move.max}
              onChange={setMove}
            />
          </div>
        </div>
        <div>
          <span className="label">{t('workshop.npc.behavior')}</span>
          <Segmented<NpcBehavior | 'code'>
            label={t('workshop.npc.behavior')}
            value={useCode ? 'code' : behavior}
            options={[
              ...BEHAVIORS.map((b) => ({ value: b, label: t(`workshop.npc.behaviors.${b}`) })),
              { value: 'code' as const, label: t('workshop.npc.behaviorCode') },
            ]}
            onChange={(v) => {
              setDebug(null);
              if (v === 'code') setUseCode(true);
              else {
                setUseCode(false);
                setBehavior(v);
              }
            }}
          />
          <p className="hint">{t('workshop.npc.codeSoon')}</p>
        </div>
        {useCode && (
          <div className="npc-code">
            <CodePanel
              file={t('workshop.fileNpc', { name: id || 'npc' })}
              value={codeText}
              onChange={(v) => {
                setCodeText(v);
                setDebug(null);
              }}
              problems={code.problems}
              words={words}
              lang={lang}
              activeLine={debug ? (debug.run.steps[debug.index]?.line ?? null) : null}
            />
            <DebugPanel
              run={debug?.run ?? null}
              index={debug?.index ?? -1}
              disabled={!code.body}
              onStep={() => debugStep(false)}
              onContinue={() => debugStep(true)}
              onRestart={() => setDebug(null)}
            />
          </div>
        )}
        <label>
          <span className="label">{t('workshop.npc.sound')}</span>
          <select className="block-select" value={sound} onChange={(e) => setSound(e.target.value)}>
            <option value="">{t('workshop.npc.noSound')}</option>
            {[...new Set([...(sound ? [sound] : []), ...sounds])].map((s) => (
              <option key={s} value={s}>
                🔊 {s}
              </option>
            ))}
          </select>
          <span className="hint">{t('workshop.npc.soundHint')}</span>
        </label>
        <div>
          <span className="label">{t('workshop.npc.look')}</span>
          <Segmented
            label={t('workshop.npc.look')}
            value={look}
            options={(['symbol', 'draw', 'upload'] as const).map((l) => ({
              value: l,
              label: t(`workshop.npc.looks.${l}`),
            }))}
            onChange={setLook}
          />
        </div>
        {look === 'symbol' && (
          <div className="npc-row">
            <label>
              <span className="label">{t('workshop.npc.symbol')}</span>
              <input
                className="input input-small npc-symbol"
                value={symbol}
                maxLength={2}
                onChange={(e) => setSymbol(e.target.value)}
              />
            </label>
            <div className="palette npc-colors" role="group" aria-label={t('tileDialog.colors')}>
              {PALETTE.slice(2).map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  style={{ background: c }}
                  aria-label={c}
                  aria-pressed={color.toUpperCase() === c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            {image && (
              <button
                type="button"
                className="btn btn-soft btn-small"
                onClick={() => setImage(null)}
              >
                {t('avatar.remove')}
              </button>
            )}
          </div>
        )}
        {look === 'draw' && (
          <div className="npc-paint">
            <div className="paint-area">
              <PaintToolbar
                tool={tool}
                size={size}
                grid
                canUndo={paint.canUndo}
                canRedo={paint.canRedo}
                onTool={setTool}
                onSize={setSize}
                onGrid={() => {}}
                onUndo={() => paintRef.current?.undo()}
                onRedo={() => paintRef.current?.redo()}
              />
              <PaintCanvas
                ref={paintRef}
                tool={tool}
                color={color}
                size={size}
                grid
                label={t('tileDialog.canvas')}
                onChange={setPaint}
                onPick={setColor}
              />
            </div>
            <div className="palette" role="group" aria-label={t('tileDialog.colors')}>
              {PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  className="swatch"
                  style={{ background: c }}
                  aria-label={c}
                  aria-pressed={color.toUpperCase() === c}
                  onClick={() => setColor(c)}
                />
              ))}
            </div>
            <button
              type="button"
              className="btn btn-small"
              disabled={paint.blank}
              onClick={() => setImage(paint.dataUrl)}
            >
              {t('workshop.npc.usePicture')}
            </button>
          </div>
        )}
        {look === 'upload' && (
          <div className="upload-area npc-upload">
            {file ? (
              <ImageCropper
                key={file.name + file.size}
                file={file}
                shape="circle"
                outputSize={TEXTURE_SIZE}
                applyLabel={t('workshop.npc.usePicture')}
                onApply={(url) => {
                  setImage(url);
                  setFile(null);
                }}
                onCancel={() => setFile(null)}
              />
            ) : (
              <label className="upload-drop">
                <span className="btn btn-primary">{t('tileDialog.chooseFile')}</span>
                <input
                  type="file"
                  accept={ACCEPTED_TYPES.join(',')}
                  className="visually-hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (!f) return;
                    const problem = checkImageFile(f);
                    setFileError(problem);
                    if (!problem) setFile(f);
                  }}
                />
              </label>
            )}
            {fileError && <p className="form-error">{t(fileError)}</p>}
          </div>
        )}
        <div className="dialog-actions">
          {onDelete && (
            <button type="button" className="btn btn-soft" onClick={onDelete}>
              {t('workshop.delete')}
            </button>
          )}
          <button type="button" className="btn btn-primary" disabled={!valid} onClick={save}>
            {t('workshop.npc.save')}
          </button>
        </div>
      </div>
    </div>
  );
}
