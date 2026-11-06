// AST → normalized rule text in the player's language (SPEC 5.6, 5.8).
// print(parse(text)) yields this normalized form (round-trip tests).
import type { Effect, Expr, FigureRef, RuleAST, Target, TileTarget, Trigger } from './ast';
import {
  ACTION_KW,
  EVENT_KW,
  FIGURE_PROP_W,
  KW,
  TARGET_W,
  TILE_PROP_W,
  TILE_TYPE_W,
  TILE_W,
  VALUE_W,
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
    default:
      return EVENT_KW[t.kind][lang];
  }
}

/** Is this expression a tile-type lookup (so that strings print as bare tile types)? */
function isTileType(e: Expr): boolean {
  return e.kind === 'tileProp' && e.prop === 'type';
}

function printValue(e: Expr, lang: CodeLang, bareTileType: boolean): string {
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
    default:
      return printExpr(e, lang, 0);
  }
}

/** Precedence: 0 = or, 1 = and, 2 = not / atom. */
function printExpr(e: Expr, lang: CodeLang, parent: number): string {
  switch (e.kind) {
    case 'chance':
      return `${KW.chance[lang]} ${e.percent}%`;
    case 'cmp': {
      const bare = isTileType(e.left) || isTileType(e.right);
      return `${printValue(e.left, lang, bare)} ${e.op} ${printValue(e.right, lang, bare)}`;
    }
    case 'not':
      return `${KW.not[lang]} ${printExpr(e.item, lang, 2)}`;
    case 'and': {
      const text = e.items.map((i) => printExpr(i, lang, 1)).join(` ${KW.and[lang]} `);
      return parent > 1 ? `(${text})` : text;
    }
    case 'or': {
      const text = e.items.map((i) => printExpr(i, lang, 0)).join(` ${KW.or[lang]} `);
      return parent > 0 ? `(${text})` : text;
    }
    default:
      return printValue(e, lang, false);
  }
}

function printTarget(t: Target, lang: CodeLang): string {
  return t.kind === 'ref' ? refWord(t.ref, lang) : TARGET_W[t.kind][lang];
}

function printTile(t: TileTarget, lang: CodeLang): string {
  if (t.kind === 'figureTile') return `${refWord(t.ref, lang)}.${FIGURE_PROP_W.tile[lang]}`;
  if (t.kind === 'tilesOfType')
    return `${TILE_W.tilesOfType[lang]} ${TILE_TYPE_W[t.tileType][lang]}`;
  return TILE_W[t.kind][lang];
}

export function printEffect(e: Effect, lang: CodeLang): string {
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
      return `${kw} ${printTarget(e.target, lang)} ${KW.randomly[lang]}`;
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
        e.scope.kind === 'world' ? VALUE_W.world[lang] : printTarget(e.scope.target, lang);
      return `${kw} ${scope}.${e.name} ${e.op} ${printValue(e.value, lang, false)}`;
    }
    case 'message':
      return `${kw} ${quote(e.text)}`;
  }
}

export function printCondition(e: Expr, lang: CodeLang): string {
  return printExpr(e, lang, 0);
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
