// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { initI18n } from '../../i18n';
import { toGameSetup } from '../../lobby/lobby';
import { useApp } from '../../store/appStore';
import { useGame } from '../../store/gameStore';
import { App } from '../App';

beforeAll(() => {
  initI18n('de');
});

afterEach(() => {
  cleanup();
  act(() => {
    useGame.getState().clear();
    useApp.setState({ screen: 'start', lobby: null });
  });
});

describe('screens (smoke)', () => {
  it('renders the start screen', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: 'Lobby erstellen' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beitreten' })).toBeDisabled();
  });

  it('opens the lobby with templates', () => {
    render(<App />);
    act(() => screen.getByRole('button', { name: 'Lobby erstellen' }).click());
    expect(screen.getByText('Klassisch')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start' })).toBeEnabled();
  });

  it('renders the game screen with the action bar', () => {
    act(() =>
      useApp.getState().openLobby({ name: 'Jan', avatar: { image: null, color: '#34C77B' } }),
    );
    const lobby = useApp.getState().lobby!;
    act(() => {
      useGame.getState().start(toGameSetup(lobby, 1));
      useApp.getState().setScreen('game');
    });
    render(<App />);
    expect(screen.getByText('Jan ist am Zug')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Passen/ })).toBeEnabled();
    expect(screen.getByRole('button', { name: /Angreifen/ })).toBeDisabled();
  });

  it('renders the result screen', () => {
    act(() =>
      useApp.getState().openLobby({ name: 'Jan', avatar: { image: null, color: '#34C77B' } }),
    );
    const lobby = useApp.getState().lobby!;
    act(() => {
      useGame.getState().start(toGameSetup(lobby, 1));
      const g = useGame.getState().game!;
      useGame.setState({
        game: {
          ...g,
          status: 'over',
          result: { winner: 'heroes', winners: ['f1'], reason: 'bossDied' },
        },
      });
      useApp.getState().setScreen('result');
    });
    render(<App />);
    expect(screen.getByText('Die Helden gewinnen!')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nochmal' })).toBeInTheDocument();
  });
});
