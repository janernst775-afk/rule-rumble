// Combines parser and validator errors for the editor: every message gets a line and,
// where possible, a suggestion ("Zeile 3: auslöser gibt es bei RUNDENSTART nicht.
// Meintest du alle?", SPEC 5.4).
import type { NpcType, Settings } from '../engine/types';
import type { EffectDef, FunctionDef, RuleAST } from './ast';
import { TRIGGER_CONTEXT } from './context';
import { EVENT_KW, KW, TARGET_W, TILE_W, VALUE_W } from './keywords';
import { parseRule, type ParsedRule, type RuleLines } from './parser';
import { validateRule, type ValidationError } from './validator';

export interface Diagnostic {
  source: 'parse' | 'validate';
  /** i18n key: parse.<code> or validation.<code> */
  key: string;
  line: number;
  col: number;
  params?: Record<string, string | number>;
  suggestion?: string;
}

/** Maps a validator path like "effects.1.value" to the source line. */
export function lineOf(lines: RuleLines, path: string): number {
  const [part, index] = path.split('.');
  const i = Number(index ?? 0);
  switch (part) {
    case 'name':
      return lines.name;
    case 'trigger':
      return lines.trigger;
    case 'conditions':
      return lines.conditions[i] ?? lines.trigger;
    case 'effects':
      return lines.effects[i] ?? lines.trigger;
    case 'elseEffects':
      return lines.elseEffects[i] ?? lines.trigger;
    case 'duration':
      return lines.duration ?? lines.name;
    case 'limit':
      return lines.limit ?? lines.name;
    default:
      return lines.name;
  }
}

const CONTEXT_WORD: Record<string, string> = {
  trigger: TARGET_W.trigger.de,
  attacker: TARGET_W.attacker.de,
  target: TARGET_W.target.de,
  onTile: TARGET_W.onTile.de,
  neighbors: TARGET_W.neighbors.de,
  nearest: TARGET_W.nearest.de,
  eventTile: TILE_W.eventTile.de,
  fromTile: TILE_W.fromTile.de,
  neighborTiles: TILE_W.neighborTiles.de,
  amount: VALUE_W.amount.de,
};

function eventWord(rule: RuleAST): string {
  const t = rule.trigger;
  if (t.kind === 'everyNRounds') return `${KW.every.de} ${t.n} ${KW.rounds.de}`;
  if (t.kind === 'custom') return `${KW.event.de} "${t.event}"`;
  return EVENT_KW[t.kind].de;
}

/** Suggestion for a context value that the trigger does not offer. */
function contextSuggestion(rule: RuleAST, value: string): string | undefined {
  const ctx = TRIGGER_CONTEXT[rule.trigger.kind];
  const isTile = value === 'eventTile' || value === 'fromTile' || value === 'neighborTiles';
  if (isTile) return ctx.eventTile ? TILE_W.eventTile.de : TILE_W.randomTile.de;
  if (value === 'amount') return undefined;
  const fig = ctx.figures[0];
  return fig ? TARGET_W[fig].de : TARGET_W.all.de;
}

export function validationDiagnostics(
  rule: RuleAST,
  lines: RuleLines,
  errors: ValidationError[],
): Diagnostic[] {
  return errors.map((e) => {
    const d: Diagnostic = {
      source: 'validate',
      key: `validation.${e.code}`,
      line: e.line ?? lineOf(lines, e.path),
      col: 1,
    };
    if (e.code === 'contextMissing') {
      const value = String(e.params?.value ?? '');
      d.key = 'validation.contextMissingAt';
      d.params = { value: CONTEXT_WORD[value] ?? value, event: eventWord(rule) };
      const s = contextSuggestion(rule, value);
      if (s) d.suggestion = s;
    } else if (e.params) {
      d.params = e.params;
    }
    return d;
  });
}

/** Parses and validates the editor text against the running game. */
export function checkRuleText(
  text: string,
  settings: Settings,
  npcTypes: readonly NpcType[],
  effects: readonly EffectDef[] = [],
  functions: readonly FunctionDef[] = [],
): { rule: ParsedRule | null; diagnostics: Diagnostic[] } {
  const { rule, errors } = parseRule(text);
  if (!rule) {
    return {
      rule: null,
      diagnostics: errors.map((e) => {
        const d: Diagnostic = { source: 'parse', key: `parse.${e.code}`, line: e.line, col: e.col };
        if (e.params) d.params = e.params;
        if (e.suggestion) d.suggestion = e.suggestion;
        return d;
      }),
    };
  }
  const vErrors = validateRule(rule.ast, settings, npcTypes, effects, functions);
  return { rule, diagnostics: validationDiagnostics(rule.ast, rule.lines, vErrors) };
}
