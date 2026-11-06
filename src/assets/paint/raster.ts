// Pure pixel helpers for the paint program (no DOM, testable in Node).

export type Rgba = [number, number, number, number];

export interface Raster {
  width: number;
  height: number;
  /** RGBA bytes, row-major (same layout as ImageData.data). */
  data: Uint8ClampedArray;
}

export function hexToRgba(hex: string): Rgba {
  const h = hex.replace('#', '');
  const full = h.length === 3 ? [...h].map((c) => c + c).join('') : h;
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

export function rgbaToHex([r, g, b]: Rgba): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();
}

export function getPixel(raster: Raster, x: number, y: number): Rgba {
  const i = (y * raster.width + x) * 4;
  const d = raster.data;
  return [d[i] ?? 0, d[i + 1] ?? 0, d[i + 2] ?? 0, d[i + 3] ?? 0];
}

function setPixel(raster: Raster, x: number, y: number, c: Rgba): void {
  const i = (y * raster.width + x) * 4;
  raster.data[i] = c[0];
  raster.data[i + 1] = c[1];
  raster.data[i + 2] = c[2];
  raster.data[i + 3] = c[3];
}

function sameColor(a: Rgba, b: Rgba): boolean {
  // Fully transparent pixels count as equal regardless of their RGB.
  if (a[3] === 0 && b[3] === 0) return true;
  return a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
}

/** 4-way scanline flood fill. Mutates `raster`; returns the number of changed pixels. */
export function floodFill(raster: Raster, x: number, y: number, color: Rgba): number {
  const { width, height } = raster;
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  const target = getPixel(raster, x, y);
  if (sameColor(target, color)) return 0;
  let changed = 0;
  const stack: [number, number][] = [[x, y]];
  while (stack.length > 0) {
    const next = stack.pop();
    if (!next) break;
    const [sx, sy] = next;
    if (!sameColor(getPixel(raster, sx, sy), target)) continue;
    let lx = sx;
    while (lx > 0 && sameColor(getPixel(raster, lx - 1, sy), target)) lx--;
    let up = false;
    let down = false;
    for (let cx = lx; cx < width && sameColor(getPixel(raster, cx, sy), target); cx++) {
      setPixel(raster, cx, sy, color);
      changed++;
      if (sy > 0) {
        const match = sameColor(getPixel(raster, cx, sy - 1), target);
        if (match && !up) stack.push([cx, sy - 1]);
        up = match;
      }
      if (sy < height - 1) {
        const match = sameColor(getPixel(raster, cx, sy + 1), target);
        if (match && !down) stack.push([cx, sy + 1]);
        down = match;
      }
    }
  }
  return changed;
}

/** True if no pixel is visible. */
export function isBlank(raster: Raster): boolean {
  for (let i = 3; i < raster.data.length; i += 4) if ((raster.data[i] ?? 0) !== 0) return false;
  return true;
}

/** Bounded undo/redo history of snapshots. */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];

  constructor(private readonly limit = 40) {}

  /** Records the state before a change. */
  push(snapshot: T): void {
    this.past.push(snapshot);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(current: T): T | null {
    const prev = this.past.pop();
    if (prev === undefined) return null;
    this.future.push(current);
    return prev;
  }

  redo(current: T): T | null {
    const next = this.future.pop();
    if (next === undefined) return null;
    this.past.push(current);
    return next;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }
}
