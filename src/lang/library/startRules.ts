// Start library (SPEC 5.5): rules that show the breadth of the system – board changes,
// movement, wheel chances, variables, textures, teleport, shields. At most two spawn NPCs.
// Descriptions live in de.json under library.<key>.desc (explain.ts follows in v0.4).
import type { RuleDefinition } from '../ast';
import { fx, on, rule, where, who, x } from '../build';

const def = (key: string, ast: RuleDefinition['ast']): RuleDefinition => ({
  id: `start.${key}`,
  author: 'Rule Rumble',
  ast,
});

export const START_RULES: RuleDefinition[] = [
  def(
    'zombie-land',
    rule('Zombie-Land', on.enters(true), {
      when: [x.chance(30)],
      then: [fx.spawn('zombie')],
      limit: { count: 1, per: 'round' },
    }),
  ),
  def(
    'geisterstunde',
    rule('Geisterstunde', on.everyNRounds(5), {
      then: [fx.say('Die Geisterstunde schlägt!'), fx.spawn('zombie', where.randomEmptyTile)],
    }),
  ),
  def(
    'lava-steigt',
    rule('Lava steigt', on.everyNRounds(3), { then: [fx.tileType(where.randomTile, 'lava')] }),
  ),
  def(
    'lava-brennt',
    rule('Lava brennt', on.enters(), {
      when: [x.cmp(x.tileType(), '=', x.str('lava'))],
      then: [fx.damage(who.trigger)],
    }),
  ),
  def(
    'glatteis',
    rule('Glatteis', on.everyNRounds(2), { then: [fx.tileType(where.randomEmptyTile, 'eis')] }),
  ),
  def(
    'eis-rutscht',
    rule('Eis rutscht', on.enters(), {
      when: [x.cmp(x.tileType(), '=', x.str('eis'))],
      then: [fx.push(who.trigger, where.fromTile)],
    }),
  ),
  def(
    'heilquelle',
    rule('Heilquelle entspringt', on.everyNRounds(4), {
      then: [fx.tileType(where.randomEmptyTile, 'heilquelle')],
    }),
  ),
  def(
    'quellwasser',
    rule('Quellwasser', on.turnEnd(), {
      when: [x.cmp(x.tileType(where.of('trigger')), '=', x.str('heilquelle'))],
      then: [fx.heal(who.trigger)],
    }),
  ),
  def(
    'tueckisches-neuland',
    rule('Tückisches Neuland', on.tileAdded(), {
      when: [x.chance(50)],
      then: [fx.tileType(where.tile, 'falle')],
    }),
  ),
  def(
    'falle',
    rule('Falle schnappt zu', on.enters(), {
      when: [x.cmp(x.tileType(), '=', x.str('falle'))],
      then: [fx.skip(who.trigger), fx.tileType(where.tile, 'normal')],
    }),
  ),
  def(
    'erdbeben',
    rule('Erdbeben', on.everyNRounds(3), {
      then: [fx.say('Die Erde bebt!'), fx.removeTile(where.randomEmptyTile)],
    }),
  ),
  def(
    'gluecksspiel',
    rule('Glücksspiel', on.miss(), {
      when: [x.chance(50)],
      then: [fx.damage(who.attacker)],
      otherwise: [fx.wheel(who.attacker, 10, 1)],
      duration: 5,
    }),
  ),
  def('rueckenwind', rule('Rückenwind', on.hit(), { then: [fx.move(who.attacker, 1, 1)] })),
  def(
    'rueckstoss',
    rule('Rückstoß', on.hit(), { then: [fx.push(who.target, where.of('attacker'))] }),
  ),
  def(
    'seelensammler',
    rule('Seelensammler', on.dies(), { then: [fx.setVar(who.neighbors, 'seelen', '+', x.num(1))] }),
  ),
  def(
    'seelen-einloesen',
    rule('Seelen einlösen', on.turnStart(), {
      when: [x.cmp(x.figVar('trigger', 'seelen'), '>=', x.num(3))],
      then: [fx.heal(who.trigger), fx.setVar(who.trigger, 'seelen', '=', x.num(0))],
    }),
  ),
  def(
    'teleport-chaos',
    rule('Teleport-Chaos', on.turnStart(), {
      when: [x.chance(15)],
      then: [fx.teleport(who.trigger)],
    }),
  ),
  def('schutzengel', rule('Schutzengel', on.roundStart(), { then: [fx.shield(who.random)] })),
  def(
    'sumpf',
    rule('Sumpfig', on.enters(), {
      when: [x.cmp(x.tileTexture(), '=', x.str('Sumpf'))],
      then: [fx.move(who.trigger, -1, 1)],
    }),
  ),
  def(
    'flut',
    rule('Die Flut', on.roundEnd(), {
      when: [x.cmp(x.world('flut'), '>=', x.num(4))],
      then: [
        fx.say('Die Flut kommt!'),
        fx.removeTile(where.randomEmptyTile),
        fx.setWorld('flut', '=', x.num(0)),
      ],
      otherwise: [fx.setWorld('flut', '+', x.num(1))],
    }),
  ),
];

/** i18n key part for a library rule id ("start.lava-steigt" → "lava-steigt"). */
export function libraryKey(id: string): string {
  return id.replace(/^start\./, '');
}
