import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';

const VIEW = 240;

interface Props {
  file: File;
  shape: 'circle' | 'square';
  /** Edge length of the square PNG that is produced. */
  outputSize: number;
  applyLabel: string;
  onApply: (dataUrl: string) => void;
  onCancel?: () => void;
}

/** Square crop with zoom and drag; output is a PNG data URL of `outputSize`². */
export function ImageCropper({ file, shape, outputSize, applyLabel, onApply, onCancel }: Props) {
  const { t } = useTranslation();
  const [loaded, setLoaded] = useState<{ src: string; img: HTMLImageElement } | null>(null);
  const img = loaded?.img ?? null;
  const src = loaded?.src ?? null;
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  // The object URL lives inside this effect, so StrictMode's double invocation in
  // development never revokes a URL that is still loading.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    let alive = true;
    let settled = false;
    image.onload = () => {
      settled = true;
      if (alive) setLoaded({ src: url, img: image });
      else URL.revokeObjectURL(url);
    };
    image.onerror = () => {
      settled = true;
      URL.revokeObjectURL(url);
    };
    image.src = url;
    return () => {
      alive = false;
      // Revoke only once loading has finished; a pending load revokes in its handler.
      if (settled) URL.revokeObjectURL(url);
    };
  }, [file]);

  // Base scale: the shorter image side fills the view.
  const baseScale = img ? VIEW / Math.min(img.naturalWidth, img.naturalHeight) : 1;
  const scale = baseScale * zoom;
  const w = img ? img.naturalWidth * scale : VIEW;
  const h = img ? img.naturalHeight * scale : VIEW;
  const clampOffset = (o: { x: number; y: number }) => ({
    x: Math.min((w - VIEW) / 2, Math.max(-(w - VIEW) / 2, o.x)),
    y: Math.min((h - VIEW) / 2, Math.max(-(h - VIEW) / 2, o.y)),
  });
  const off = clampOffset(offset);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y };
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setOffset(clampOffset({ x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };
  const onPointerUp = () => {
    drag.current = null;
  };

  const apply = () => {
    if (!img) return;
    // Offscreen canvas only for resizing; nothing is rendered with it.
    const canvas = document.createElement('canvas');
    canvas.width = outputSize;
    canvas.height = outputSize;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = outputSize / VIEW;
    const left = (VIEW - w) / 2 + off.x;
    const top = (VIEW - h) / 2 + off.y;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, left * k, top * k, w * k, h * k);
    onApply(canvas.toDataURL('image/png'));
  };

  return (
    <div className="crop">
      <div
        className={`crop-view crop-${shape}`}
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {src && (
          <img
            src={src}
            alt=""
            draggable={false}
            style={{
              width: w,
              height: h,
              left: (VIEW - w) / 2 + off.x,
              top: (VIEW - h) / 2 + off.y,
            }}
          />
        )}
      </div>
      <label className="crop-zoom">
        <span className="label">{t('avatar.zoom')}</span>
        <input
          type="range"
          min={1}
          max={3}
          step={0.01}
          value={zoom}
          onChange={(e) => setZoom(Number(e.target.value))}
        />
      </label>
      <div className="dialog-actions">
        {onCancel && (
          <button type="button" className="btn btn-soft" onClick={onCancel}>
            {t('common.cancel')}
          </button>
        )}
        <button type="button" className="btn btn-primary" onClick={apply} disabled={!img}>
          {applyLabel}
        </button>
      </div>
    </div>
  );
}
