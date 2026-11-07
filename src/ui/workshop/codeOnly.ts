// Which statements the block view cannot show (SPEC 5.8): they appear as grey code blocks.
import type { Expr, Stmt, StmtKind } from '../../lang/ast';
import { visitExpr } from '../../lang/bundle';

const PRO_STMTS = new Set<StmtKind>(['while', 'return', 'send', 'after', 'listAdd', 'say']);
const PRO_EXPRS = new Set<Expr['kind']>(['arith', 'list', 'fcall', 'self', 'prop']);

function usesProExpr(exprs: Expr[]): boolean {
  let found = false;
  for (const e of exprs) {
    visitExpr(e, (x) => {
      if (PRO_EXPRS.has(x.kind)) found = true;
    });
  }
  return found;
}

/** Own expressions of a statement (not those of nested statements). */
function ownExprs(s: Stmt): Expr[] {
  switch (s.kind) {
    case 'do': {
      const e = s.effect;
      const out: Expr[] = [];
      const tgt = (t: { kind: string; expr?: Expr }) => {
        if (t.kind === 'value' && t.expr) out.push(t.expr);
      };
      if ('target' in e) tgt(e.target);
      if ('at' in e) tgt(e.at);
      if (e.kind === 'push') tgt(e.from);
      if (e.kind === 'setVar') {
        out.push(e.value);
        if (e.scope.kind === 'figures') tgt(e.scope.target);
      }
      if (e.kind === 'call') out.push(...e.args);
      return out;
    }
    case 'if':
    case 'while':
      return [s.cond];
    case 'repeat':
      return [s.times];
    case 'forEach':
      return [s.in];
    case 'pick':
      return [s.from];
    case 'let':
    case 'return':
    case 'listAdd':
      return [s.value];
    case 'play':
      return [s.sound];
    case 'texture':
      return [s.tile, s.name];
    case 'say':
      return [s.text];
    default:
      return [];
  }
}

/** Statements the blocks cannot show: they appear as a grey code block (SPEC 5.8). */
export function isCodeOnly(s: Stmt): boolean {
  if (PRO_STMTS.has(s.kind)) return true;
  if (
    s.kind === 'do' &&
    (s.effect.kind === 'code' || (s.effect.kind === 'teleport' && s.effect.near))
  ) {
    return true;
  }
  return usesProExpr(ownExprs(s));
}
