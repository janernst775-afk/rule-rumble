// Every game event has a synthetic default sound (SPEC 8.2). Events that only accompany
// another sounded event (tileLeft next to tileEntered, …) stay silent on purpose.
import type { GameEvent } from '../engine/types';
import type { SfxId } from './sfx';

export const EVENT_SFX: Record<GameEvent['type'], SfxId | null> = {
  gameStarted: 'round',
  roundStarted: 'round',
  turnStarted: 'turn',
  tileLeft: null, // the step is heard with tileEntered
  tileEntered: 'step',
  attackDeclared: 'attack',
  wheelResolved: 'hit', // 'miss' when the attack misses, see sfxFor
  damaged: 'damage',
  died: 'death',
  tileAdded: 'tileAdd',
  tileRemoved: 'tileRemove',
  ruleAdded: 'ruleAdd',
  ruleActivated: 'ruleActive',
  ruleRemoved: 'ruleRemove',
  ruleFired: 'ruleFired',
  chainStopped: 'blocked',
  message: 'message',
  spawned: 'spawn',
  spawnBlocked: 'blocked',
  healed: 'heal',
  statusAdded: 'status',
  turnSkipped: 'skip',
  dodged: 'dodge',
  damageCapped: 'blocked',
  tileTypeChanged: 'tileType',
  voteStarted: 'vote',
  voteCast: 'click',
  soundPlayed: 'ruleSound', // a recorded sound of that name plays instead, if there is one
  waited: null, // a pause has no sound
  textureChanged: 'tileType',
  effectAborted: 'blocked',
  customEvent: 'signal',
  passed: 'click',
  turnEnded: null, // the next turnStarted is heard
  roundEnded: null, // the next roundStarted is heard
  gameOver: null, // victory / defeat jingle on the result
};

export function sfxFor(e: GameEvent): SfxId | null {
  if (e.type === 'wheelResolved') return e.hit ? 'hit' : 'miss';
  return EVENT_SFX[e.type];
}
