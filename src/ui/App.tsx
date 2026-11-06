import { useEffect } from 'react';
import { setMusic } from '../audio/audio';
import { useApp } from '../store/appStore';
import { useGame } from '../store/gameStore';
import { useTextures } from '../store/textureStore';
import { useAudioPrefsSync } from './useAudioPrefsSync';
import { GameScreen } from './screens/GameScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ResultScreen } from './screens/ResultScreen';
import { StartScreen } from './screens/StartScreen';
import { LibraryScreen } from './screens/LibraryScreen';
import { onRuleAdded } from '../store/gameStore';
import { useLibrary } from '../store/libraryStore';

export function App() {
  useAudioPrefsSync();
  const screen = useApp((s) => s.screen);
  const hasGame = useGame((s) => s.game !== null);
  const loadTextures = useTextures((s) => s.load);

  useEffect(() => {
    void loadTextures();
  }, [loadTextures]);

  // Every rule that enters a game is kept in the local library (SPEC 5.5).
  useEffect(() => onRuleAdded((def) => useLibrary.getState().record(def)), []);

  useEffect(() => {
    if (screen === 'start' || screen === 'lobby' || screen === 'library') setMusic('menu');
    if (screen === 'result') setMusic(null);
  }, [screen]);

  switch (screen) {
    case 'start':
      return <StartScreen />;
    case 'library':
      return <LibraryScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'game':
      return hasGame ? <GameScreen /> : <StartScreen />;
    case 'result':
      return hasGame ? <ResultScreen /> : <StartScreen />;
  }
}
