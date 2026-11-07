// Acceptance v0.7: a recorded sound is played by an own rule in the game.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EVENT_SFX } from '../../audio/eventSounds';
import { seat } from '../../engine/__tests__/helpers';
import { cloneSettings, DEFAULT_SETTINGS } from '../../engine/settings';
import { parseRule } from '../../lang/parser';
import { useGame } from '../gameStore';
import { usePrefs } from '../prefsStore';
import { useProfile } from '../profileStore';
import { useSounds } from '../soundStore';

const played = vi.hoisted(() => ({ recorded: [] as string[], sfx: [] as string[] }));
vi.mock('../../audio/audio', () => ({
  playSfx: (id: string) => played.sfx.push(id),
  playRecorded: (key: string) => played.recorded.push(key),
  setMusic: () => {},
}));

const buh = {
  id: 'snd1',
  name: 'buh',
  dataUrl: 'data:audio/wav;base64,UklGRg==',
  durationMs: 500,
  author: 'Jan',
  createdAt: 7,
};

function startWithRule(): void {
  const settings = cloneSettings(DEFAULT_SETTINGS);
  settings.rules.activationDelay = 0;
  useGame.getState().start({
    seed: 3,
    settings,
    seats: [seat('hero', 'Jan', 'human'), seat('boss', 'Boss')],
  });
  const ast = parseRule('REGEL "Buh"\nWENN ZUGSTART\nDANN SPIELE "buh"').rule!.ast;
  const g = useGame.getState();
  g.dispatch({ type: 'move', actor: 'f1', path: [] });
  g.dispatch({ type: 'addRule', actor: 'f1', rule: { id: 'own.buh', author: 'Jan', ast } });
  vi.runAllTimers();
}

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  vi.useFakeTimers();
  played.recorded.length = 0;
  played.sfx.length = 0;
  useSounds.setState({ sounds: { snd1: buh }, loaded: true });
  useProfile.setState({ name: 'Jan' });
  usePrefs.setState({ muteOthersSounds: false });
});

describe('sounds in the game (SPEC 8.2)', () => {
  it('a recorded sound is played by an own rule (acceptance v0.7)', () => {
    startWithRule();
    expect(played.recorded).toEqual(['snd1:7']);
  });

  it('plays the synthetic default sound when there is no recording', () => {
    useSounds.setState({ sounds: {} });
    startWithRule();
    expect(played.recorded).toEqual([]);
    expect(played.sfx).toContain('ruleSound');
  });

  it('"Eigene Sounds anderer Spieler stumm" silences recordings of others', () => {
    useSounds.setState({ sounds: { snd1: { ...buh, author: 'Mara' } } });
    usePrefs.setState({ muteOthersSounds: true });
    startWithRule();
    expect(played.recorded).toEqual([]);
    expect(played.sfx).toContain('ruleSound');
  });

  it('game events have synthetic default sounds', () => {
    startWithRule();
    expect(played.sfx).toEqual(expect.arrayContaining(['ruleAdd']));
    const silent = Object.entries(EVENT_SFX)
      .filter(([, id]) => id === null)
      .map(([k]) => k);
    // Only events that accompany another sounded event (or a pause) are silent.
    expect(silent.sort()).toEqual(['gameOver', 'roundEnded', 'tileLeft', 'turnEnded', 'waited']);
  });
});
