// Start library (SPEC 5.5): rules that show the breadth of the system – board changes,
// movement, wheel chances, variables, textures, teleport, shields. At most two spawn NPCs.
// The rules are written in the rule language (start.regeln.txt) and parsed at load time.
import type { RuleDefinition } from '../ast';
import { fold } from '../keywords';
import { parseRules } from '../parser';
import source from './start.regeln.txt?raw';

/** "Heilquelle entspringt" → "heilquelle-entspringt" */
export function slug(name: string): string {
  return fold(name)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function load(): RuleDefinition[] {
  const { rules, errors } = parseRules(source);
  if (errors.length > 0) {
    const first = errors[0];
    throw new Error(`start.regeln.txt line ${first?.line}: ${first?.code}`);
  }
  return rules.map((r) => ({ id: `start.${slug(r.ast.name)}`, author: 'Rule Rumble', ast: r.ast }));
}

export const START_RULES: RuleDefinition[] = load();

/** i18n key part for a library rule id ("start.lava-steigt" → "lava-steigt"). */
export function libraryKey(id: string): string {
  return id.replace(/^start\./, '');
}
