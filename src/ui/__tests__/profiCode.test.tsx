// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initI18n } from '../../i18n';
import { useWorkshop } from '../../store/workshopStore';
import { EffectWorkshop } from '../workshop/EffectWorkshop';

beforeAll(() => {
  initI18n('de');
  // CodeMirror measures text; jsdom has no layout.
  Range.prototype.getClientRects = () => [] as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => new DOMRect();
});
beforeEach(() => {
  useWorkshop.setState({
    effects: [
      {
        name: 'Rumpeln',
        author: 'T',
        symbol: '⚡',
        params: [],
        body: [
          { kind: 'play', sound: { kind: 'str', value: 'rumpeln' } },
          {
            kind: 'while',
            cond: { kind: 'chance', percent: 50 },
            body: [{ kind: 'do', effect: { kind: 'message', text: 'Bumm' } }],
          },
        ],
      },
    ],
    npcTypes: [],
    functions: [],
  });
});
afterEach(() => cleanup());

describe('Profi-Code in the effect workshop (smoke)', () => {
  it('shows Profi-Code as a grey code block in the block view', () => {
    render(<EffectWorkshop onClose={() => {}} />);
    expect(screen.getByText('CODE')).toBeInTheDocument();
    expect(screen.getByText(/SOLANGE ZUFALL 50%/)).toBeInTheDocument();
  });

  it('switches to the code view with the printed effect and a debugger', () => {
    render(<EffectWorkshop onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Profi-Code' }));
    expect(screen.getByText('rumpeln.effekt')).toBeInTheDocument();
    expect(screen.getByText('Geprüft ✓')).toBeInTheDocument();
    expect(document.querySelector('.cm-content')?.textContent).toContain('EFFEKT "Rumpeln"');
    fireEvent.click(screen.getByRole('button', { name: 'Schritt' }));
    expect(screen.getByText(/Schritt 1 von/)).toBeInTheDocument();
  });

  it('opens the function editor', () => {
    render(<EffectWorkshop onClose={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Funktion' }));
    expect(screen.getByText('meine_funktion.funktion')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Funktion speichern' })).toBeEnabled();
  });
});
