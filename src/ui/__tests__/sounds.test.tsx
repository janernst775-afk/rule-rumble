// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { WAV_PREFIX, bytesToBase64, encodeWav } from '../../audio/wav';
import { initI18n } from '../../i18n';
import { SoundEditor } from '../workshop/SoundEditor';

beforeAll(() => {
  initI18n('de');
});
afterEach(() => cleanup());

const wav = WAV_PREFIX + bytesToBase64(encodeWav(new Float32Array(22050).fill(0.3), 22050));

describe('SoundEditor (smoke)', () => {
  it('starts empty with a record button and cannot save yet', () => {
    render(<SoundEditor initial={null} takenNames={[]} author="Jan" onSave={() => {}} />);
    expect(screen.getByRole('button', { name: 'Aufnehmen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sound speichern' })).toBeDisabled();
  });

  it('edits an existing sound: trim, volume, name and save', () => {
    const onSave = vi.fn();
    render(
      <SoundEditor
        initial={{
          id: 's1',
          name: 'buh',
          dataUrl: wav,
          durationMs: 1000,
          author: 'Jan',
          createdAt: 1,
        }}
        takenNames={['pling']}
        author="Jan"
        onSave={onSave}
      />,
    );
    expect(screen.getByText('In Regeln und Effekten: SPIELE "buh"')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Anfang'), { target: { value: '200' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Pling' } });
    expect(screen.getByText('Diesen Namen gibt es schon.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Buh Laut' } });
    fireEvent.click(screen.getByRole('button', { name: 'Sound speichern' }));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ id: 's1', name: 'buh_laut', durationMs: 800 }),
    );
  });
});
