import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AVATAR_SIZE } from '../avatarUtils';
import { Dialog } from './Dialog';

const VIEW = 240;

interface Props {
  file: File;
  onCancel: () => void;
  onDone: (dataUrl: string) => void;
}

/** Square crop with zoom and drag, shown through a circular mask, output 256×256 PNG. */
export function AvatarCropDialog({ file, onCancel, onDone }: Props) {
  const { t } = useTranslation();
  const [src] = useState(() => URL.createObjectURL(file));
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const image = new Image();
    image.onload = () => setImg(image);
    image.src = src;
    return () => URL.revokeObjectURL(src);
  }, [src]);

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
    // Offscreen canvas only for resizing; nothing is rendered with canvas.
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const k = AVATAR_SIZE / VIEW;
    const left = (VIEW - w) / 2 + off.x;
    const top = (VIEW - h) / 2 + off.y;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, left * k, top * k, w * k, h * k);
    onDone(canvas.toDataURL('image/png'));
  };

  return (
    <Dialog title={t('avatar.cropTitle')} onClose={onCancel}>
      <div className="crop">
        <div
          className="crop-view"
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
          <button type="button" className="btn btn-soft" onClick={onCancel}>
            {t('common.cancel')}
          </button>
          <button type="button" className="btn btn-primary" onClick={apply} disabled={!img}>
            {t('avatar.apply')}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
