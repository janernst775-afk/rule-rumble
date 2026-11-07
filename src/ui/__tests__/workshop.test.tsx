// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { initI18n } from '../../i18n';
import { useWorkshop } from '../../store/workshopStore';
import { EffectWorkshop } from '../workshop/EffectWorkshop';

beforeAll(() => {
  initI18n('de');
});
beforeEach(() => {
  useWorkshop.setState({ effects: [], npcTypes: [] });
});
afterEach(() => cleanup());

describe('EffectWorkshop (smoke)', () => {
  it('builds and saves a small effect from blocks', () => {
    render(<EffectWorkshop onClose={() => {}} />);
    const name = screen.getByLabelText('Name');
    fireEvent.change(name, { target: { value: 'Rumpeln' } });
    const add = screen.getAllByLabelText('+ Schritt hinzufügen')[0]!;
    fireEvent.change(add, { target: { value: 'play' } });
    expect(screen.queryByText(/Der Effekt braucht mindestens einen Schritt/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Effekt speichern' }));
    const saved = useWorkshop.getState().effects;
    expect(saved).toHaveLength(1);
    expect(saved[0]?.name).toBe('Rumpeln');
    expect(saved[0]?.body.map((s) => s.kind)).toEqual(['play']);
  });

  it('refuses to save an empty effect', () => {
    render(<EffectWorkshop onClose={() => {}} />);
    expect(screen.getByText(/mindestens einen Schritt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Effekt speichern' })).toBeDisabled();
  });
});
