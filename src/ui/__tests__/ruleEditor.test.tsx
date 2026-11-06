// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../i18n';
import { START_RULES } from '../../lang/library/startRules';
import { RuleEditor } from '../editor/RuleEditor';

beforeAll(() => {
  initI18n('de');
});
afterEach(() => cleanup());

const zombieLand = START_RULES.find((r) => r.id === 'start.zombie-land')!;

describe('RuleEditor (smoke)', () => {
  it('shows a start rule as blocks with text preview and explanation', () => {
    render(
      <RuleEditor
        initial={zombieLand}
        game={null}
        author="Jan"
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    expect(screen.getByLabelText('Name der Regel')).toHaveValue('Zombie-Land');
    expect(screen.getByText(/SPAWNE zombie AUF feld/)).toBeInTheDocument();
    expect(screen.getByText(/zum ersten Mal/)).toBeInTheDocument();
  });

  it('adds a block from the palette and saves a copy of a start rule', () => {
    const onSave = vi.fn();
    render(
      <RuleEditor
        initial={zombieLand}
        game={null}
        author="Jan"
        onClose={() => {}}
        onSave={onSave}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Schild' }));
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    const saved = onSave.mock.calls[0]?.[0];
    expect(saved.id).not.toBe(zombieLand.id);
    expect(saved.author).toBe('Jan');
    expect(saved.ast.effects.map((e: { kind: string }) => e.kind)).toEqual(['spawn', 'shield']);
  });

  it('keeps blocks and text in sync and blocks switching on syntax errors', () => {
    render(
      <RuleEditor
        initial={zombieLand}
        game={null}
        author="Jan"
        onClose={() => {}}
        onSave={() => {}}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const area = screen.getByLabelText('Regel als Text') as HTMLTextAreaElement;
    expect(area.value).toContain('WENN BETRITT neues_feld');
    fireEvent.change(area, {
      target: { value: area.value.replace('LIMIT 1 PRO RUNDE', 'LIMIT 1 PRO RUNDEE') },
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Zeile 5');
    fireEvent.click(screen.getByRole('button', { name: 'Bausteine' }));
    expect(screen.getByText(/erst beheben/)).toBeInTheDocument();
    fireEvent.change(area, { target: { value: area.value.replace('RUNDEE', 'ZUG') } });
    fireEvent.click(screen.getByRole('button', { name: 'Bausteine' }));
    expect(screen.getByLabelText('pro')).toHaveValue('turn');
  });

  it('shows validation errors with line and suggestion in the text view', () => {
    render(
      <RuleEditor initial={null} game={null} author="Jan" onClose={() => {}} onSave={() => {}} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Text' }));
    const area = screen.getByLabelText('Regel als Text');
    fireEvent.change(area, {
      target: { value: 'REGEL "A"\nWENN RUNDENSTART\nDANN SCHADEN auslöser 1' },
    });
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Zeile 3: „auslöser“ gibt es bei RUNDENSTART nicht. Meintest du „alle“?',
    );
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeDisabled();
  });
});
