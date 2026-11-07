import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { NPC_LIMITS } from '../../engine/limits';
import type { NpcBehavior, NpcType } from '../../engine/types';
import { slug } from '../../lang/library/startRules';
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
}

/** Own NPC type (SPEC 5.9): name, look (drawn or uploaded), life, movement, behavior. */
export function NpcEditor({ initial, takenIds, onSave, onDelete }: Props) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? t('workshop.npc.defaultName'));
  const [symbol, setSymbol] = useState(initial?.symbol ?? 'G');
  const [color, setColor] = useState(initial?.color ?? '#9B5CF6');
  const [image, setImage] = useState<string | null>(initial?.image ?? null);
  const [hp, setHp] = useState(initial?.hp ?? 1);
  const [move, setMove] = useState(initial?.move ?? 1);
  const [behavior, setBehavior] = useState<NpcBehavior>(initial?.behavior ?? 'chase');
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
  const valid = name.trim().length > 0 && id.length > 0 && !idTaken && [...symbol].length <= 2;

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
          <Segmented
            label={t('workshop.npc.behavior')}
            value={behavior}
            options={BEHAVIORS.map((b) => ({ value: b, label: t(`workshop.npc.behaviors.${b}`) }))}
            onChange={setBehavior}
          />
          <p className="hint">{t('workshop.npc.codeSoon')}</p>
        </div>
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
