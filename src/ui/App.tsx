import { useEffect } from 'react';
import { setMusic } from '../audio/audio';
import { useApp } from '../store/appStore';
import { useGame } from '../store/gameStore';
import { useAudioPrefsSync } from './useAudioPrefsSync';
import { GameScreen } from './screens/GameScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { ResultScreen } from './screens/ResultScreen';
import { StartScreen } from './screens/StartScreen';

export function App() {
  useAudioPrefsSync();
  const screen = useApp((s) => s.screen);
  const hasGame = useGame((s) => s.game !== null);

  useEffect(() => {
    if (screen === 'start' || screen === 'lobby') setMusic('menu');
    if (screen === 'result') setMusic(null);
  }, [screen]);

  switch (screen) {
    case 'start':
      return <StartScreen />;
    case 'lobby':
      return <LobbyScreen />;
    case 'game':
      return hasGame ? <GameScreen /> : <StartScreen />;
    case 'result':
      return hasGame ? <ResultScreen /> : <StartScreen />;
  }
}
