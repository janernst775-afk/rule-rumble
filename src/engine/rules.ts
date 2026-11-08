// Rule lifecycle in a running game: adding (with the four overflow variants),
// activation, duration and votes (SPEC 2.2, 5.1, 6.1).
import { validateEffect, validateFunction, validateNpcCode, validateRule } from '../lang/validator';
import { NPC_LIMITS } from './limits';
import type { EffectDef, FunctionDef, RuleDefinition } from '../lang/ast';
import { emit, type Bus } from './bus';
import { endTurn, log } from './turn';
import type { ActionErrorCode, ActiveRule, FigureId, GameState, NpcType } from './types';

export function isRuleActive(state: GameState, rule: ActiveRule): boolean {
  return (
    state.round >= rule.activeFromRound &&
    (rule.expiresAfterRound === null || state.round <= rule.expiresAfterRound)
  );
}

/** Active and pending rules both count against "max. aktive Regeln". */
export function ruleSlotsFull(state: GameState): boolean {
  const max = state.settings.rules.maxActive;
  return max !== null && state.rules.length >= max;
}

export function oldestRule(state: GameState, among = state.rules): ActiveRule | undefined {
  return [...among].sort((a, b) => a.order - b.order)[0];
}

/** Checks an addRule action before it is applied. */
export function addRuleError(
  state: GameState,
  rule: RuleDefinition,
  replaceRuleId: string | undefined,
): ActionErrorCode | null {
  const { effects, npcTypes, functions } = withBundle(state, rule);
  const settings = state.settings;
  if (validateRule(rule.ast, settings, npcTypes, effects, functions).length > 0) {
    return 'invalidRule';
  }
  for (const def of rule.bundle?.effects ?? []) {
    if (validateEffect(def, settings, npcTypes, effects, functions).length > 0) {
      return 'invalidRule';
    }
  }
  for (const def of rule.bundle?.functions ?? []) {
    if (validateFunction(def, settings, functions).length > 0) return 'invalidRule';
  }
  for (const npc of rule.bundle?.npcTypes ?? []) {
    if (!validNpcType(npc)) return 'invalidRule';
    const code = npc.code ? { npc: npc.id, body: npc.code } : null;
    if (code && validateNpcCode(code, settings, npcTypes, effects, functions).length > 0) {
      return 'invalidRule';
    }
  }
  if (!ruleSlotsFull(state)) return null;
  switch (state.settings.rules.overflow) {
    case 'blockNew':
      return 'ruleLimitReached';
    case 'authorChooses':
      if (!replaceRuleId) return 'chooseRuleToReplace';
      return state.rules.some((r) => r.id === replaceRuleId) ? null : 'unknownRule';
    case 'dropOldest':
    case 'vote':
      return null;
  }
}

function removeRule(bus: Bus, ruleId: string, reason: 'overflow' | 'expired' | 'vote'): void {
  const state = bus.state;
  const rule = state.rules.find((r) => r.id === ruleId);
  if (!rule) return;
  state.rules = state.rules.filter((r) => r.id !== ruleId);
  state.pastRules = [...(state.pastRules ?? []), rule];
  log(state, 'log.ruleRemoved', { rule: rule.def.ast.name });
  emit(bus, { type: 'ruleRemoved', rule: rule.id, name: rule.def.ast.name, reason });
}

/** Effects and NPC types of the game plus those a rule brings along (newer versions win). */
export function withBundle(
  state: GameState,
  rule: RuleDefinition,
): { effects: EffectDef[]; npcTypes: NpcType[]; functions: FunctionDef[] } {
  const effects = [...state.effects];
  for (const def of rule.bundle?.effects ?? []) {
    const i = effects.findIndex((e) => e.name.toLowerCase() === def.name.toLowerCase());
    if (i >= 0) effects[i] = def;
    else effects.push(def);
  }
  const npcTypes = [...state.npcTypes];
  for (const npc of rule.bundle?.npcTypes ?? []) {
    const i = npcTypes.findIndex((n) => n.id === npc.id);
    if (i >= 0) npcTypes[i] = npc;
    else npcTypes.push(npc);
  }
  const functions = [...(state.functions ?? [])];
  for (const def of rule.bundle?.functions ?? []) {
    const i = functions.findIndex((f) => f.name.toLowerCase() === def.name.toLowerCase());
    if (i >= 0) functions[i] = def;
    else functions.push(def);
  }
  return { effects, npcTypes, functions };
}

/** Own NPC types (SPEC 5.9): life 1–3, movement 0–3, a behavior template. */
export function validNpcType(npc: NpcType): boolean {
  return (
    /^[a-z0-9_äöüß-]{1,30}$/.test(npc.id) &&
    npc.name.trim().length > 0 &&
    npc.name.length <= 30 &&
    Number.isInteger(npc.hp) &&
    npc.hp >= NPC_LIMITS.hp.min &&
    npc.hp <= NPC_LIMITS.hp.max &&
    Number.isInteger(npc.move) &&
    npc.move >= NPC_LIMITS.move.min &&
    npc.move <= NPC_LIMITS.move.max &&
    ['chase', 'wander', 'stand', 'flee'].includes(npc.behavior) &&
    [...npc.symbol].length <= 2 &&
    (npc.sound === undefined ||
      npc.sound === null ||
      (typeof npc.sound === 'string' && npc.sound.length <= 30))
  );
}

function insertRule(bus: Bus, def: RuleDefinition, authorId: FigureId): void {
  const state = bus.state;
  // The rule's own effects and NPC types join the game (SPEC 5.7, 5.9).
  const merged = withBundle(state, def);
  state.effects = structuredClone(merged.effects);
  state.npcTypes = structuredClone(merged.npcTypes);
  state.functions = structuredClone(merged.functions);
  const id = `r${state.nextId++}`;
  const activeFromRound = state.round + state.settings.rules.activationDelay;
  const rule: ActiveRule = {
    id,
    def: structuredClone(def),
    authorId,
    order: state.nextId,
    addedRound: state.round,
    activeFromRound,
    expiresAfterRound: def.ast.duration === null ? null : activeFromRound + def.ast.duration - 1,
    firedThisRound: 0,
    firedThisTurn: 0,
    firedTotal: 0,
  };
  state.rules.push(rule);
  log(state, 'log.ruleAdded', { figure: authorId, rule: def.ast.name, round: activeFromRound });
  emit(bus, { type: 'ruleAdded', rule: id, name: def.ast.name, activeFromRound });
  if (activeFromRound <= state.round) {
    emit(bus, { type: 'ruleActivated', rule: id, name: def.ast.name });
  }
}

/** Applies a validated addRule action, including the overflow behaviour. */
export function addRule(
  bus: Bus,
  authorId: FigureId,
  def: RuleDefinition,
  replaceRuleId: string | undefined,
): void {
  const state = bus.state;
  if (ruleSlotsFull(state)) {
    switch (state.settings.rules.overflow) {
      case 'dropOldest': {
        const oldest = oldestRule(state);
        if (oldest) removeRule(bus, oldest.id, 'overflow');
        break;
      }
      case 'authorChooses':
        if (replaceRuleId) removeRule(bus, replaceRuleId, 'overflow');
        break;
      case 'vote': {
        const voters = votersOf(state);
        state.pendingVote = { candidate: structuredClone(def), authorId, voters, votes: {} };
        log(state, 'log.voteStarted', { figure: authorId, rule: def.ast.name });
        emit(bus, { type: 'voteStarted', voters });
        return; // The turn continues once every voter has voted.
      }
      case 'blockNew':
        return;
    }
  }
  insertRule(bus, def, authorId);
  endTurn(bus);
}

/** All living heroes and the boss vote; NPCs do not. */
export function votersOf(state: GameState): FigureId[] {
  return state.seatOrder.filter((id) => state.figures[id]?.alive);
}

export function voteError(
  state: GameState,
  voter: FigureId,
  ruleId: string,
): ActionErrorCode | null {
  const vote = state.pendingVote;
  if (!vote) return 'noVote';
  if (!vote.voters.includes(voter)) return 'notVoter';
  if (vote.votes[voter]) return 'alreadyVoted';
  if (!state.rules.some((r) => r.id === ruleId)) return 'unknownRule';
  return null;
}

/** Records a vote; after the last vote the rule with most votes goes (tie: oldest). */
export function castVote(bus: Bus, voter: FigureId, ruleId: string): void {
  const state = bus.state;
  const vote = state.pendingVote;
  if (!vote) return;
  vote.votes[voter] = ruleId;
  emit(bus, { type: 'voteCast', figure: voter, rule: ruleId });
  const open = vote.voters.filter((v) => state.figures[v]?.alive && !vote.votes[v]);
  if (open.length > 0) return;
  const counts = new Map<string, number>();
  for (const id of Object.values(vote.votes)) counts.set(id, (counts.get(id) ?? 0) + 1);
  const max = Math.max(...counts.values());
  const tied = state.rules.filter((r) => counts.get(r.id) === max);
  const loser = oldestRule(state, tied);
  state.pendingVote = null;
  if (loser) removeRule(bus, loser.id, 'vote');
  insertRule(bus, vote.candidate, vote.authorId);
  endTurn(bus);
}

/** At round start: rules whose activation round has come (SPEC 3, step 1). */
export function activateRules(bus: Bus): void {
  const state = bus.state;
  for (const rule of state.rules) {
    if (rule.activeFromRound === state.round && rule.addedRound < state.round) {
      log(state, 'log.ruleActivated', { rule: rule.def.ast.name });
      emit(bus, { type: 'ruleActivated', rule: rule.id, name: rule.def.ast.name });
    }
  }
}

/** At round end: rules whose DAUER is over leave the game. */
export function expireRules(bus: Bus): void {
  const state = bus.state;
  for (const rule of [...state.rules]) {
    if (rule.expiresAfterRound !== null && state.round >= rule.expiresAfterRound) {
      removeRule(bus, rule.id, 'expired');
    }
  }
}
