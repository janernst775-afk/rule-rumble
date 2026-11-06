import { useEffect, useImperativeHandle, useRef, type PointerEvent, type Ref } from 'react';
import {
  floodFill,
  getPixel,
  hexToRgba,
  History,
  isBlank,
  rgbaToHex,
} from '../../../assets/paint/raster';
import { TEXTURE_SIZE, type PaintTool } from './paintConfig';

const SCALE = 3;

export interface PaintState {
  dataUrl: string;
  blank: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

export interface PaintCanvasHandle {
  undo: () => void;
  redo: () => void;
  toDataUrl: () => string;
  isBlank: () => boolean;
}

interface Props {
  ref?: Ref<PaintCanvasHandle>;
  tool: PaintTool;
  color: string;
  size: number;
  grid: boolean;
  label: string;
  /** Called after each finished stroke / fill / undo with the new PNG. */
  onChange: (state: PaintState) => void;
  onPick: (hex: string) => void;
}

/** 128×128 pixel canvas (the only canvas rendering in the app, SPEC 9). */
export function PaintCanvas({ ref, tool, color, size, grid, label, onChange, onPick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const history = useRef(new History<ImageData>(40));
  const last = useRef<{ x: number; y: number } | null>(null);

  const ctx = () => canvasRef.current?.getContext('2d', { willReadFrequently: true }) ?? null;
  const snapshot = () => ctx()?.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE) ?? null;
  const emit = () => {
    const c = canvasRef.current;
    const data = snapshot();
    if (c && data) {
      onChange({
        dataUrl: c.toDataURL('image/png'),
        blank: isBlank(data),
        canUndo: history.current.canUndo,
        canRedo: history.current.canRedo,
      });
    }
  };

  useImperativeHandle(ref, () => ({
    undo: () => {
      const current = snapshot();
      const prev = current ? history.current.undo(current) : null;
      if (prev) {
        ctx()?.putImageData(prev, 0, 0);
        emit();
      }
    },
    redo: () => {
      const current = snapshot();
      const next = current ? history.current.redo(current) : null;
      if (next) {
        ctx()?.putImageData(next, 0, 0);
        emit();
      }
    },
    toDataUrl: () => canvasRef.current?.toDataURL('image/png') ?? '',
    isBlank: () => {
      const data = snapshot();
      return data ? isBlank(data) : true;
    },
  }));

  useEffect(() => {
    const c = ctx();
    if (c) c.imageSmoothingEnabled = false;
  }, []);

  const toPixel = (e: PointerEvent<HTMLCanvasElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.floor(((e.clientX - rect.left) / rect.width) * TEXTURE_SIZE);
    const y = Math.floor(((e.clientY - rect.top) / rect.height) * TEXTURE_SIZE);
    return {
      x: Math.min(TEXTURE_SIZE - 1, Math.max(0, x)),
      y: Math.min(TEXTURE_SIZE - 1, Math.max(0, y)),
    };
  };

  const stamp = (x: number, y: number) => {
    const c = ctx();
    if (!c) return;
    const half = Math.floor(size / 2);
    if (tool === 'eraser') c.clearRect(x - half, y - half, size, size);
    else {
      c.fillStyle = color;
      c.fillRect(x - half, y - half, size, size);
    }
  };

  const line = (from: { x: number; y: number }, to: { x: number; y: number }) => {
    const steps = Math.max(Math.abs(to.x - from.x), Math.abs(to.y - from.y), 1);
    for (let i = 1; i <= steps; i++) {
      stamp(
        Math.round(from.x + ((to.x - from.x) * i) / steps),
        Math.round(from.y + ((to.y - from.y) * i) / steps),
      );
    }
  };

  const onPointerDown = (e: PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
    const p = toPixel(e);
    const c = ctx();
    const before = snapshot();
    if (!c || !before) return;
    if (tool === 'picker') {
      const px = getPixel(before, p.x, p.y);
      if (px[3] > 0) onPick(rgbaToHex(px));
      return;
    }
    history.current.push(before);
    if (tool === 'fill') {
      const data = snapshot();
      if (data && floodFill(data, p.x, p.y, hexToRgba(color)) > 0) c.putImageData(data, 0, 0);
      emit();
      return;
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = p;
    stamp(p.x, p.y);
  };

  const onPointerMove = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!last.current) return;
    const p = toPixel(e);
    line(last.current, p);
    last.current = p;
  };

  const onPointerUp = () => {
    if (!last.current) return;
    last.current = null;
    emit();
  };

  return (
    <div
      className={`paint-canvas${grid ? ' has-grid' : ''}`}
      style={{ width: TEXTURE_SIZE * SCALE }}
    >
      <canvas
        ref={canvasRef}
        width={TEXTURE_SIZE}
        height={TEXTURE_SIZE}
        aria-label={label}
        role="img"
        className={`tool-${tool}`}
        style={{ width: TEXTURE_SIZE * SCALE, height: TEXTURE_SIZE * SCALE }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      />
    </div>
  );
}
