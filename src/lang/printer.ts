// AST → normalized rule text in the player's language (SPEC 5.6, 5.8).
// print(parse(text)) yields this normalized form (round-trip tests).
import type {
  Effect,
  EffectDef,
  Expr,
  FigureRef,
  FunctionDef,
  NpcCode,
  ProgramAST,
  RuleAST,
  Stmt,
  Target,
  TileTarget,
  Trigger,
} from './ast';
import {
  ACTION_KW,
  DEF_KW,
  LIST_W,
  PARAM_TYPE_W,
  SELF_W,
  STMT_KW,
  EVENT_KW,
  FIGURE_PROP_W,
  KW,
  TARGET_W,
  TILE_PROP_W,
  TILE_TYPE_W,
  TILE_W,
  VALUE_W,
  NONE_W,
  QUERY_W,
  type CodeLang,
} from './keywords';

const REF_WORD: Record<FigureRef, keyof typeof TARGET_W> = {
  trigger: 'trigger',
  attacker: 'attacker',
  target: 'target',
};

function quote(text: string): string {
  return `"${text.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function refWord(ref: FigureRef, lang: CodeLang): string {
  return TARGET_W[REF_WORD[ref]][lang];
}

function rounds(n: number, lang: CodeLang): string {
  return `${n} ${(n === 1 ? KW.round : KW.rounds)[lang]}`;
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

function printTrigger(t: Trigger, lang: CodeLang): string {
  switch (t.kind) {
    case 'everyNRounds':
      return `${KW.every[lang]} ${t.n} ${(t.n === 1 ? KW.round : KW.rounds)[lang]}`;
    case 'enters':
      return `${EVENT_KW.enters[lang]} ${(t.newOnly ? TILE_W.newTile : TILE_W.eventTile)[lang]}`;
    case 'leaves':
      return `${EVENT_KW.leaves[lang]} ${TILE_W.eventTile[lang]}`;
    case 'custom':
      return `${KW.event[lang]} ${quote(t.event)}`;
    default:
      return EVENT_KW[t.kind][lang];
  }
}

/** Is this expression a tile-type lookup (so that strings print as bare tile types)? */
function isTileType(e: Expr): boolean {
  return (e.kind === 'tileProp' || e.kind === 'varProp' || e.kind === 'prop') && e.prop === 'type';
}

const PROP_WORDS: Record<string, { de: string; en: string }> = {
  ...FIGURE_PROP_W,
  ...TILE_PROP_W,
  length: LIST_W.length,
};

function propWord(prop: string, lang: CodeLang): string {
  return PROP_WORDS[prop]?.[lang] ?? prop;
}

const BARE_QUERIES = new Set(['allFigures', 'emptyTiles', 'allNpcs', 'edgeTiles']);

/**
 * Precedence of the code language: 0 ODER, 1 UND, 2 NICHT, 3 comparison, 4 + -, 5 * /,
 * 6 atoms. Operands below `min` get parentheses.
 */
function prec(e: Expr): number {
  switch (e.kind) {
    case 'or':
      return 0;
    case 'and':
      return 1;
    case 'not':
      return 2;
    case 'cmp':
      return 3;
    case 'arith':
      return e.op === '+' || e.op === '-' ? 4 : 5;
    case 'num':
      return e.value < 0 ? 4 : 6;
    default:
      return 6;
  }
}

function printCode(e: Expr, lang: CodeLang, min: number, bareTileType = false): string {
  const text = printBare(e, lang, bareTileType);
  return prec(e) < min ? `(${text})` : text;
}

function printBare(e: Expr, lang: CodeLang, bareTileType: boolean): string {
  switch (e.kind) {
    case 'num':
      return String(e.value);
    case 'str': {
      const tt = TILE_TYPE_W[e.value as keyof typeof TILE_TYPE_W];
      return bareTileType && tt ? tt[lang] : quote(e.value);
    }
    case 'figureProp':
      return `${refWord(e.ref, lang)}.${FIGURE_PROP_W[e.prop][lang]}`;
    case 'figureVar':
      return `${refWord(e.ref, lang)}.${e.name}`;
    case 'tileProp': {
      const tile =
        e.tile.kind === 'figureTile'
          ? `${refWord(e.tile.ref, lang)}.${FIGURE_PROP_W.tile[lang]}`
          : TILE_W[e.tile.kind][lang];
      return `${tile}.${TILE_PROP_W[e.prop][lang]}`;
    }
    case 'global':
      return VALUE_W[e.name][lang];
    case 'worldVar':
      return `${VALUE_W.world[lang]}.${e.name}`;
    case 'amount':
      return VALUE_W.amount[lang];
    case 'none':
      return NONE_W[lang];
    case 'var':
      return e.name;
    case 'varProp':
      return `${e.name}.${propWord(e.prop, lang)}`;
    case 'prop':
      return `${printCode(e.of, lang, 6)}.${propWord(e.prop, lang)}`;
    case 'self':
      return SELF_W[lang];
    case 'query':
      return e.args.length === 0 && BARE_QUERIES.has(e.name)
        ? QUERY_W[e.name][lang]
        : `${QUERY_W[e.name][lang]}(${e.args.map((a) => printCode(a, lang, 0)).join(', ')})`;
    case 'fcall':
      return `${e.name}(${e.args.map((a) => printCode(a, lang, 0)).join(', ')})`;
    case 'list':
      return `[${e.items.map((a) => printCode(a, lang, 0)).join(', ')}]`;
    case 'figureRef':
      return refWord(e.ref, lang);
    case 'tileRef':
      return e.tile.kind === 'figureTile'
        ? `${refWord(e.tile.ref, lang)}.${FIGURE_PROP_W.tile[lang]}`
        : TILE_W[e.tile.kind][lang];
    case 'targets':
      return printTarget(e.target, lang);
    case 'tiles':
      return printTile(e.target, lang);
    case 'chance':
      return `${KW.chance[lang]} ${e.percent}%`;
    case 'cmp': {
      const bare = isTileType(e.left) || isTileType(e.right);
      return `${printCode(e.left, lang, 4, bare)} ${e.op} ${printCode(e.right, lang, 4, bare)}`;
    }
    case 'arith': {
      const p = e.op === '+' || e.op === '-' ? 4 : 5;
      return `${printCode(e.left, lang, p)} ${e.op} ${printCode(e.right, lang, p + 1)}`;
    }
    case 'not':
      return `${KW.not[lang]} ${printCode(e.item, lang, 3)}`;
    case 'and':
      return e.items.map((i) => printCode(i, lang, 2)).join(` ${KW.and[lang]} `);
    case 'or':
      return e.items.map((i) => printCode(i, lang, 1)).join(` ${KW.or[lang]} `);
  }
}

function printValue(e: Expr, lang: CodeLang, bareTileType: boolean): string {
  return printCode(e, lang, 0, bareTileType);
}

function printTarget(t: Target, lang: CodeLang): string {
  if (t.kind === 'value') return printCode(t.expr, lang, 6);
  return t.kind === 'ref' ? refWord(t.ref, lang) : TARGET_W[t.kind][lang];
}

function printTile(t: TileTarget, lang: CodeLang): string {
  if (t.kind === 'value') return printCode(t.expr, lang, 6);
  if (t.kind === 'figureTile') return `${refWord(t.ref, lang)}.${FIGURE_PROP_W.tile[lang]}`;
  if (t.kind === 'tilesOfType')
    return `${TILE_W.tilesOfType[lang]} ${TILE_TYPE_W[t.tileType][lang]}`;
  return TILE_W[t.kind][lang];
}

export function printEffect(e: Effect, lang: CodeLang): string {
  if (e.kind === 'code') return printStmts([e.stmt], lang, 0).join('\n');
  if (e.kind === 'call') {
    return `${e.effect}(${e.args.map((a) => printValue(a, lang, false)).join(', ')})`;
  }
  const kw = ACTION_KW[e.kind][lang];
  switch (e.kind) {
    case 'spawn':
      return `${kw} ${e.npcType} ${KW.at[lang]} ${printTile(e.at, lang)}`;
    case 'damage':
    case 'heal':
    case 'shield':
      return `${kw} ${printTarget(e.target, lang)} ${e.amount}`;
    case 'skip':
      return `${kw} ${printTarget(e.target, lang)} ${e.turns}`;
    case 'moveMod':
      return `${kw} ${printTarget(e.target, lang)} ${signed(e.delta)} ${KW.for[lang]} ${rounds(e.rounds, lang)}`;
    case 'wheelMod':
      return `${kw} ${printTarget(e.target, lang)} ${signed(e.delta)}% ${KW.for[lang]} ${rounds(e.rounds, lang)}`;
    case 'teleport':
      return e.near
        ? `${kw} ${printTarget(e.target, lang)} ${KW.nextTo[lang]} ${printTile(e.near, lang)}`
        : `${kw} ${printTarget(e.target, lang)} ${KW.randomly[lang]}`;
    case 'push':
      return `${kw} ${printTarget(e.target, lang)} ${KW.awayFrom[lang]} ${printTile(e.from, lang)} ${e.distance}`;
    case 'setTileType':
      return `${kw} ${printTile(e.at, lang)} ${KW.to[lang]} ${TILE_TYPE_W[e.tileType][lang]}`;
    case 'removeTile':
      return `${kw} ${printTile(e.at, lang)}`;
    case 'addTileNear':
      return `${kw} ${KW.nextTo[lang]} ${printTile(e.at, lang)}`;
    case 'setVar': {
      const scope =
        e.scope.kind === 'world'
          ? VALUE_W.world[lang]
          : e.scope.target.kind === 'value'
            ? printCode(e.scope.target.expr, lang, 6)
            : printTarget(e.scope.target, lang);
      return `${kw} ${scope}.${e.name} ${e.op} ${printValue(e.value, lang, false)}`;
    }
    case 'message':
      return `${kw} ${quote(e.text)}`;
  }
}

/** Any expression as rule text (also variables, queries and effect arguments). */
export function printExprText(e: Expr, lang: CodeLang): string {
  return printValue(e, lang, false);
}

export function printCondition(e: Expr, lang: CodeLang): string {
  return printCode(e, lang, 0);
}

export function printRule(rule: RuleAST, lang: CodeLang = 'de'): string {
  const lines = [
    `${KW.rule[lang]} ${quote(rule.name)}`,
    `${KW.when[lang]} ${printTrigger(rule.trigger, lang)}`,
    ...rule.conditions.map((c) => `${KW.and[lang]} ${printCondition(c, lang)}`),
    ...rule.effects.map((e) => `${KW.then[lang]} ${printEffect(e, lang)}`),
    ...rule.elseEffects.map((e) => `${KW.else[lang]} ${printEffect(e, lang)}`),
  ];
  if (rule.duration !== null) lines.push(`${KW.duration[lang]} ${rounds(rule.duration, lang)}`);
  if (rule.limit) {
    const per = { round: KW.round, turn: KW.turn, game: KW.game }[rule.limit.per][lang];
    lines.push(`${KW.limit[lang]} ${rule.limit.count} ${KW.per[lang]} ${per}`);
  }
  return lines.join('\n');
}

export function printRules(rules: RuleAST[], lang: CodeLang = 'de'): string {
  return rules.map((r) => printRule(r, lang)).join('\n\n');
}

// ---------- effect bodies and Profi-Code (SPEC 5.7, 5.8) ----------

const INDENT = '  ';

function block(head: string, body: Stmt[], lang: CodeLang, depth: number): string[] {
  const pad = INDENT.repeat(depth);
  return [`${pad}${head}`, ...printStmts(body, lang, depth + 1), `${pad}${STMT_KW.end[lang]}`];
}

/** Statements as indented code lines. */
export function printStmts(stmts: Stmt[], lang: CodeLang, depth = 0): string[] {
  const pad = INDENT.repeat(depth);
  const out: string[] = [];
  const x = (e: Expr) => printCode(e, lang, 0);
  for (const s of stmts) {
    switch (s.kind) {
      case 'do':
        out.push(`${pad}${printEffect(s.effect, lang)}`);
        break;
      case 'if':
        out.push(`${pad}${KW.when[lang]} ${x(s.cond)}`);
        out.push(...printStmts(s.then, lang, depth + 1));
        if (s.else.length > 0) {
          out.push(`${pad}${KW.else[lang]}`);
          out.push(...printStmts(s.else, lang, depth + 1));
        }
        out.push(`${pad}${STMT_KW.end[lang]}`);
        break;
      case 'repeat':
        out.push(
          ...block(
            `${STMT_KW.repeat[lang]} ${x(s.times)} ${STMT_KW.times[lang]}`,
            s.body,
            lang,
            depth,
          ),
        );
        break;
      case 'forEach':
        out.push(
          ...block(
            `${STMT_KW.forEach[lang]} ${s.var} ${STMT_KW.in[lang]} ${x(s.in)}`,
            s.body,
            lang,
            depth,
          ),
        );
        break;
      case 'while':
        out.push(...block(`${STMT_KW.while[lang]} ${x(s.cond)}`, s.body, lang, depth));
        break;
      case 'after':
        out.push(...block(`${STMT_KW.after[lang]} ${rounds(s.rounds, lang)}`, s.body, lang, depth));
        break;
      case 'pick':
        out.push(`${pad}${STMT_KW.pick[lang]} ${s.var} ${STMT_KW.from[lang]} ${x(s.from)}`);
        break;
      case 'let':
        out.push(`${pad}${STMT_KW.let[lang]} ${s.name} = ${x(s.value)}`);
        break;
      case 'play':
        out.push(`${pad}${STMT_KW.play[lang]} ${x(s.sound)}`);
        break;
      case 'texture':
        out.push(`${pad}${STMT_KW.texture[lang]} ${printCode(s.tile, lang, 6)} ${x(s.name)}`);
        break;
      case 'wait':
        out.push(`${pad}${STMT_KW.wait[lang]} ${s.seconds}`);
        break;
      case 'return':
        out.push(`${pad}${STMT_KW.return[lang]} ${x(s.value)}`);
        break;
      case 'send':
        out.push(`${pad}${STMT_KW.send[lang]} ${quote(s.event)}`);
        break;
      case 'listAdd':
        out.push(`${pad}${s.list}.${LIST_W.add[lang]}(${x(s.value)})`);
        break;
      case 'say':
        out.push(`${pad}${ACTION_KW.message[lang]} ${x(s.text)}`);
        break;
    }
  }
  return out;
}

/** A single statement as text (code blocks in the block view). */
export function printStmtText(s: Stmt, lang: CodeLang): string {
  return printStmts([s], lang, 0).join('\n');
}

export function printEffectDef(def: EffectDef, lang: CodeLang = 'de'): string {
  const params =
    def.params.length > 0
      ? ` (${def.params.map((p) => `${p.name}: ${PARAM_TYPE_W[p.type][lang]}`).join(', ')})`
      : '';
  return [
    `${DEF_KW.effect[lang]} ${quote(def.name)}${params}`,
    ...printStmts(def.body, lang, 1),
    STMT_KW.end[lang],
  ].join('\n');
}

export function printFunction(def: FunctionDef, lang: CodeLang = 'de'): string {
  return [
    `${DEF_KW.function[lang]} ${def.name}(${def.params.join(', ')})`,
    ...printStmts(def.body, lang, 1),
    STMT_KW.end[lang],
  ].join('\n');
}

export function printNpcCode(code: NpcCode, lang: CodeLang = 'de'): string {
  return [
    `${DEF_KW.npc[lang]} ${quote(code.npc)} ${KW.turn[lang]}`,
    ...printStmts(code.body, lang, 1),
    STMT_KW.end[lang],
  ].join('\n');
}

/** A whole code text: functions, effects, NPC behaviors, then rules. */
export function printProgram(p: ProgramAST, lang: CodeLang = 'de'): string {
  return [
    ...p.functions.map((f) => printFunction(f, lang)),
    ...p.effects.map((e) => printEffectDef(e, lang)),
    ...p.npcCode.map((n) => printNpcCode(n, lang)),
    ...p.rules.map((r) => printRule(r, lang)),
  ].join('\n\n');
}
