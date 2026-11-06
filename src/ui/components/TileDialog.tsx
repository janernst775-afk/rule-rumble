import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TextureRecord } from '../../assets/store';
import { libraryTextures, useTextures } from '../../store/textureStore';
import { ACCEPTED_TYPES, checkImageFile } from '../avatarUtils';
import { Dialog } from './Dialog';
import { CloseIcon } from './Icons';
import { ImageCropper } from './ImageCropper';
import { PaintCanvas, type PaintCanvasHandle, type PaintState } from './paint/PaintCanvas';
import { BRUSH_SIZES, PALETTE, TEXTURE_SIZE, type PaintTool } from './paint/paintConfig';
import { PaintToolbar } from './paint/PaintToolbar';

type Tab = 'draw' | 'upload' | 'library';

export interface TileDialogResult {
  /** null = plain tile without texture */
  texture: TextureRecord | null;
  /** true if the texture is new and must be stored */
  isNew: boolean;
}

interface Props {
  placeLabel: string;
  author: string;
  onCancel: () => void;
  onCreate: (result: TileDialogResult) => void;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tex-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** "Feld anlegen" (SPEC 4.1, reference screen 4). */
export function TileDialog({ placeLabel, author, onCancel, onCreate }: Props) {
  const { t } = useTranslation();
  const nameId = useId();
  const textures = useTextures((s) => s.textures);
  const hideTexture = useTextures((s) => s.save);
  const [tab, setTab] = useState<Tab>('draw');
  const [tool, setTool] = useState<PaintTool>('brush');
  const [color, setColor] = useState(PALETTE[6] ?? '#6A9A3F');
  const [size, setSize] = useState<number>(BRUSH_SIZES[1]);
  const [grid, setGrid] = useState(true);
  const [drawing, setDrawing] = useState<PaintState>({
    dataUrl: '',
    blank: true,
    canUndo: false,
    canRedo: false,
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [picked, setPicked] = useState<TextureRecord | null>(null);
  const [name, setName] = useState('');
  const [saveToLibrary, setSaveToLibrary] = useState(true);
  const paint = useRef<PaintCanvasHandle>(null);

  const library = libraryTextures(textures);

  // Current image per tab; library picks keep their own name.
  const preview =
    tab === 'draw'
      ? drawing.blank
        ? null
        : drawing.dataUrl
      : tab === 'upload'
        ? uploaded
        : (picked?.dataUrl ?? null);
  const needsName = tab !== 'library' && preview !== null;
  const nameOk = !needsName || name.trim().length > 0;

  // Ctrl+Z / Ctrl+Y in the draw tab.
  useEffect(() => {
    if (tab !== 'draw') return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      if ((e.target as HTMLElement | null)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        paint.current?.undo();
      } else if (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey)) {
        e.preventDefault();
        paint.current?.redo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [tab]);

  const create = () => {
    if (!nameOk) return;
    if (tab === 'library') {
      onCreate({ texture: picked, isNew: false });
      return;
    }
    if (!preview) {
      onCreate({ texture: null, isNew: false });
      return;
    }
    onCreate({
      texture: {
        id: newId(),
        name: name.trim().slice(0, 30),
        dataUrl: preview,
        author,
        createdAt: Date.now(),
        inLibrary: saveToLibrary,
      },
      isNew: true,
    });
  };

  const tabs: { id: Tab; label: string }[] = [
    { id: 'draw', label: t('tileDialog.tabs.draw') },
    { id: 'upload', label: t('tileDialog.tabs.upload') },
    { id: 'library', label: t('tileDialog.tabs.library') },
  ];

  return (
    <Dialog title={t('tileDialog.title')} onClose={onCancel} width={1080}>
      <div className="tile-dialog-head">
        <span className="pill">{placeLabel}</span>
        <div role="tablist" className="segmented tile-tabs" aria-label={t('tileDialog.title')}>
          {tabs.map((x) => (
            <button
              key={x.id}
              type="button"
              role="tab"
              aria-selected={tab === x.id}
              aria-pressed={tab === x.id}
              onClick={() => setTab(x.id)}
            >
              {x.label}
            </button>
          ))}
        </div>
      </div>

      <div className="tile-dialog-body">
        <div className="tile-dialog-main" role="tabpanel">
          {/* The paint canvas stays mounted so a drawing survives tab switches. */}
          <div className="paint-area" hidden={tab !== 'draw'}>
            <PaintToolbar
              tool={tool}
              size={size}
              grid={grid}
              canUndo={drawing.canUndo}
              canRedo={drawing.canRedo}
              onTool={setTool}
              onSize={setSize}
              onGrid={setGrid}
              onUndo={() => paint.current?.undo()}
              onRedo={() => paint.current?.redo()}
            />
            <PaintCanvas
              ref={paint}
              tool={tool}
              color={color}
              size={size}
              grid={grid}
              label={t('tileDialog.canvas')}
              onChange={setDrawing}
              onPick={(hex) => {
                setColor(hex);
                setTool('brush');
              }}
            />
          </div>

          {tab === 'upload' && (
            <div className="upload-area">
              {uploadFile ? (
                <ImageCropper
                  key={uploadFile.name + uploadFile.size}
                  file={uploadFile}
                  shape="square"
                  outputSize={TEXTURE_SIZE}
                  applyLabel={t('tileDialog.useImage')}
                  onApply={setUploaded}
                  onCancel={() => {
                    setUploadFile(null);
                    setUploaded(null);
                  }}
                />
              ) : (
                <label className="upload-drop">
                  <span className="btn btn-primary">{t('tileDialog.chooseFile')}</span>
                  <span className="hint">{t('tileDialog.uploadHint')}</span>
                  <input
                    type="file"
                    accept={ACCEPTED_TYPES.join(',')}
                    className="visually-hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = '';
                      if (!file) return;
                      const problem = checkImageFile(file);
                      setUploadError(problem);
                      if (!problem) setUploadFile(file);
                    }}
                  />
                </label>
              )}
              {uploadError && (
                <p className="form-error" role="alert">
                  {t(uploadError)}
                </p>
              )}
            </div>
          )}

          {tab === 'library' && (
            <div className="texture-library">
              {library.length === 0 && <p className="hint">{t('tileDialog.emptyLibrary')}</p>}
              <ul className="texture-grid">
                {library.map((tex) => (
                  <li key={tex.id} className={picked?.id === tex.id ? 'is-picked' : ''}>
                    <button
                      type="button"
                      className="texture-pick"
                      aria-pressed={picked?.id === tex.id}
                      onClick={() => setPicked(tex)}
                    >
                      <img src={tex.dataUrl} alt="" />
                      <span>{tex.name}</span>
                    </button>
                    <button
                      type="button"
                      className="mini-icon texture-delete"
                      aria-label={t('tileDialog.removeFromLibrary', { name: tex.name })}
                      title={t('tileDialog.removeFromLibrary', { name: tex.name })}
                      onClick={() => {
                        // Keep the record so tiles that use it still render; only hide it.
                        void hideTexture({ ...tex, inLibrary: false });
                        if (picked?.id === tex.id) setPicked(null);
                      }}
                    >
                      <CloseIcon size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="tile-dialog-side">
          {tab === 'draw' && (
            <div>
              <span className="label">{t('tileDialog.colors')}</span>
              <div className="palette" role="group" aria-label={t('tileDialog.colors')}>
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    type="button"
                    className="swatch"
                    style={{ background: c }}
                    aria-label={c}
                    aria-pressed={color.toUpperCase() === c}
                    onClick={() => {
                      setColor(c);
                      if (tool === 'eraser' || tool === 'picker') setTool('brush');
                    }}
                  />
                ))}
                <label className="swatch swatch-custom" title={t('tileDialog.customColor')}>
                  <span className="visually-hidden">{t('tileDialog.customColor')}</span>
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value.toUpperCase())}
                  />
                </label>
              </div>
            </div>
          )}

          <div className="previews">
            <div>
              <span className="label">{t('tileDialog.seamless')}</span>
              <div
                className="preview-seamless"
                style={preview ? { backgroundImage: `url(${preview})` } : undefined}
                role="img"
                aria-label={t('tileDialog.seamless')}
              />
            </div>
            <div>
              <span className="label">{t('tileDialog.onBoard')}</span>
              <div
                className="preview-tile"
                style={preview ? { backgroundImage: `url(${preview})` } : undefined}
                role="img"
                aria-label={t('tileDialog.onBoard')}
              />
            </div>
          </div>

          {tab !== 'library' ? (
            <>
              <label htmlFor={nameId} className="label">
                {t('tileDialog.name')}
              </label>
              <input
                id={nameId}
                className="input"
                value={name}
                maxLength={30}
                placeholder={t('tileDialog.namePlaceholder')}
                onChange={(e) => setName(e.target.value)}
              />
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={saveToLibrary}
                  onChange={(e) => setSaveToLibrary(e.target.checked)}
                />
                {t('tileDialog.saveToLibrary')}
              </label>
            </>
          ) : (
            picked && <p className="texture-picked-name">{picked.name}</p>
          )}
          {/* One fixed hint slot so the dialog does not jump while typing. */}
          <p className="hint dialog-hint" aria-live="polite">
            {!preview
              ? t('tileDialog.plainHint')
              : needsName && !nameOk
                ? t('tileDialog.nameRequired')
                : ' '}
          </p>

          <div className="dialog-actions">
            <button type="button" className="btn btn-soft" onClick={onCancel}>
              {t('common.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-primary btn-wide"
              disabled={!nameOk}
              onClick={create}
            >
              {t('tileDialog.create')}
            </button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}
