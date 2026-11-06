import { describe, expect, it } from 'vitest';
import {
  History,
  floodFill,
  getPixel,
  hexToRgba,
  isBlank,
  rgbaToHex,
  type Raster,
} from '../paint/raster';
import { createMemoryTextureRepo } from '../store';

function raster(w: number, h: number): Raster {
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

describe('raster', () => {
  it('converts colors', () => {
    expect(hexToRgba('#FF7AC6')).toEqual([255, 122, 198, 255]);
    expect(rgbaToHex([255, 122, 198, 255])).toBe('#FF7AC6');
    expect(hexToRgba('#fff')).toEqual([255, 255, 255, 255]);
  });

  it('flood fills a closed region only', () => {
    const r = raster(5, 5);
    const wall = hexToRgba('#000000');
    for (let y = 0; y < 5; y++) r.data.set(wall, (y * 5 + 2) * 4);
    expect(floodFill(r, 0, 0, hexToRgba('#FF0000'))).toBe(10);
    expect(getPixel(r, 1, 4)).toEqual([255, 0, 0, 255]);
    expect(getPixel(r, 3, 0)).toEqual([0, 0, 0, 0]);
    expect(floodFill(r, 0, 0, hexToRgba('#FF0000'))).toBe(0);
  });

  it('fills a whole 128 canvas', () => {
    const r = raster(128, 128);
    expect(isBlank(r)).toBe(true);
    expect(floodFill(r, 64, 64, hexToRgba('#34C77B'))).toBe(128 * 128);
    expect(isBlank(r)).toBe(false);
  });

  it('keeps a bounded undo/redo history', () => {
    const h = new History<number>(2);
    h.push(1);
    h.push(2);
    h.push(3);
    expect(h.undo(4)).toBe(3);
    expect(h.undo(3)).toBe(2);
    expect(h.undo(2)).toBeNull();
    expect(h.redo(2)).toBe(3);
    h.push(9);
    expect(h.canRedo).toBe(false);
  });
});

describe('texture repo (memory)', () => {
  it('stores, lists and removes textures', async () => {
    const repo = createMemoryTextureRepo();
    await repo.put({
      id: 'a',
      name: 'Sumpf',
      dataUrl: 'data:',
      author: 'Jan',
      createdAt: 1,
      inLibrary: true,
    });
    expect((await repo.list()).map((t) => t.name)).toEqual(['Sumpf']);
    await repo.remove('a');
    expect(await repo.list()).toEqual([]);
  });
});
