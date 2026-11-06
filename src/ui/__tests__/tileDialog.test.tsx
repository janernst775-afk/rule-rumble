// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMemoryTextureRepo } from '../../assets/store';
import { initI18n } from '../../i18n';
import { setTextureRepo, useTextures } from '../../store/textureStore';
import { TileDialog } from '../components/TileDialog';

beforeAll(() => {
  initI18n('de');
  // jsdom has no canvas; the paint canvas must tolerate a missing 2D context.
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  setTextureRepo(createMemoryTextureRepo());
});

afterEach(() => cleanup());

describe('TileDialog (smoke)', () => {
  it('creates a plain tile when nothing is drawn', () => {
    const onCreate = vi.fn();
    render(
      <TileDialog placeLabel="Platz C7" author="Jan" onCancel={() => {}} onCreate={onCreate} />,
    );
    expect(screen.getByText('Neues Feld')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Zeichnen' })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Feld anlegen' }));
    expect(onCreate).toHaveBeenCalledWith({ texture: null, isNew: false });
  });

  it('offers library textures', async () => {
    await act(async () => {
      await useTextures.getState().save({
        id: 't1',
        name: 'Sumpf',
        dataUrl: 'data:image/png;base64,',
        author: 'Mila',
        createdAt: 1,
        inLibrary: true,
      });
    });
    const onCreate = vi.fn();
    render(
      <TileDialog placeLabel="Platz C7" author="Jan" onCancel={() => {}} onCreate={onCreate} />,
    );
    fireEvent.click(screen.getByRole('tab', { name: 'Meine Texturen' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sumpf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Feld anlegen' }));
    expect(onCreate.mock.calls[0]?.[0]).toMatchObject({ texture: { id: 't1' }, isNew: false });
  });
});
