// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../../i18n';
import { TutorialDialog } from '../components/TutorialDialog';

beforeAll(() => {
  initI18n('de');
});
afterEach(() => cleanup());

describe('"So geht\'s" tutorial (smoke)', () => {
  it('walks through all steps and closes at the end', () => {
    const onClose = vi.fn();
    render(<TutorialDialog onClose={onClose} />);
    expect(screen.getByText('Helden gegen Boss')).toBeInTheDocument();
    for (let i = 0; i < 6; i++) fireEvent.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(screen.getByText('Tastenkürzel')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: "Los geht's!" }));
    expect(onClose).toHaveBeenCalled();
  });
});
