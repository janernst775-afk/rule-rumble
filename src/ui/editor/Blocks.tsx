import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { NpcType, TileType } from '../../engine/types';
import type { CmpOp, Effect, Expr, Target, TileTarget, Trigger, TriggerKind } from '../../lang/ast';
import { printCondition } from '../../lang/printer';
import { CloseIcon, ChevronIcon } from '../components/Icons';
import { TRIGGER_KINDS } from '../ruleText';
import {
  defaultTrigger,
  isSimpleCondition,
  rightKind,
  targetKey,
  targetOptions,
  TILE_TYPES,
  tileKeyOf,
  tileOptions,
  valueKey,
  valueOptions,
} from './model';

type Tone = 'when' | 'and' | 'then' | 'else' | 'meta';

interface RowProps {
  tone: Tone;
  label: string;
  children: ReactNode;
  errors?: string[];
  onRemove?: () => void;
  onUp?: () => void;
  onDown?: () => void;
}

export function BlockRow({ tone, label, children, errors, onRemove, onUp, onDown }: RowProps) {
  const { t } = useTranslation();
  return (
    <div className={`block-row block-${tone}${errors?.length ? ' has-error' : ''}`}>
      <span className="block-label">{label}</span>
      <div className="block-fields">{children}</div>
      <div className="block-tools">
        {onUp && (
          <button
            type="button"
            className="mini-icon"
            aria-label={t('editor.up')}
            title={t('editor.up')}
            onClick={onUp}
          >
            <ChevronIcon dir="up" size={14} />
          </button>
        )}
        {onDown && (
          <button
            type="button"
            className="mini-icon"
            aria-label={t('editor.down')}
            title={t('editor.down')}
            onClick={onDown}
          >
            <ChevronIcon dir="down" size={14} />
          </button>
        )}
        {onRemove && (
          <button
            type="button"
            className="mini-icon"
            aria-label={t('editor.remove')}
            title={t('editor.remove')}
            onClick={onRemove}
          >
            <CloseIcon size={14} />
          </button>
        )}
      </div>
      {errors && errors.length > 0 && (
        <ul className="block-errors" role="alert">
          {errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------- small field controls ----------

function Select<T>({
  label,
  value,
  options,
  keyOf,
  labelOf,
  onChange,
}: {
  label: string;
  value: T;
  options: T[];
  keyOf: (v: T) => string;
  labelOf: (v: T) => string;
  onChange: (v: T) => void;
}) {
  const current = keyOf(value);
  const list = options.some((o) => keyOf(o) === current) ? options : [value, ...options];
  return (
    <select
      className="block-select"
      aria-label={label}
      value={current}
      onChange={(e) => {
        const next = list.find((o) => keyOf(o) === e.target.value);
        if (next !== undefined) onChange(next);
      }}
    >
      {list.map((o) => (
        <option key={keyOf(o)} value={keyOf(o)}>
          {labelOf(o)}
        </option>
      ))}
    </select>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  signed,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  signed?: boolean;
  suffix?: string;
  onChange: (v: number) => void;
}) {
  return (
    <span className="block-number">
      <input
        type="number"
        aria-label={label}
        value={value}
        min={min}
        max={max}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange(Math.round(v));
        }}
      />
      {suffix && <span>{suffix}</span>}
      {signed && value > 0 && <span className="block-sign">+</span>}
    </span>
  );
}

function TextField({
  label,
  value,
  maxLength,
  onChange,
}: {
  label: string;
  value: string;
  maxLength: number;
  onChange: (v: string) => void;
}) {
  return (
    <input
      className="block-text"
      aria-label={label}
      value={value}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

// ---------- labels ----------

type T = (key: string, params?: Record<string, string | number>) => string;

export function targetLabel(t: T, x: Target): string {
  return t(`editor.target.${x.kind === 'ref' ? x.ref : x.kind}`);
}

export function tileLabel(t: T, x: TileTarget): string {
  if (x.kind === 'figureTile')
    return t('editor.tile.figureTile', { who: t(`editor.target.${x.ref}`) });
  return t(`editor.tile.${x.kind}`);
}

export function valueLabel(t: T, e: Expr): string {
  switch (e.kind) {
    case 'figureProp':
      return t('editor.value.figureProp', {
        who: t(`editor.target.${e.ref}`),
        prop: t(`editor.prop.${e.prop}`),
      });
    case 'figureVar':
      return t('editor.value.figureVar', { who: t(`editor.target.${e.ref}`) });
    case 'tileProp': {
      const tile =
        e.tile.kind === 'figureTile' ? tileLabel(t, e.tile) : t(`editor.tile.${e.tile.kind}`);
      return t('editor.value.tileProp', { tile, prop: t(`editor.tileProp.${e.prop}`) });
    }
    case 'global':
      return t(`editor.global.${e.name}`);
    case 'worldVar':
      return t('editor.value.worldVar');
    case 'amount':
      return t('editor.value.amount');
    default:
      return e.kind;
  }
}

// ---------- trigger ----------

export function TriggerFields({
  trigger,
  onChange,
}: {
  trigger: Trigger;
  onChange: (t: Trigger) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Select<TriggerKind>
        label={t('editor.trigger.label')}
        value={trigger.kind}
        options={TRIGGER_KINDS}
        keyOf={(k) => k}
        labelOf={(k) => t(`editor.trigger.${k}`)}
        onChange={(k) => onChange(defaultTrigger(k))}
      />
      {trigger.kind === 'enters' && (
        <Select<boolean>
          label={t('editor.trigger.which')}
          value={trigger.newOnly}
          options={[false, true]}
          keyOf={(v) => String(v)}
          labelOf={(v) => (v ? t('editor.trigger.newTile') : t('editor.trigger.anyTile'))}
          onChange={(newOnly) => onChange({ kind: 'enters', newOnly })}
        />
      )}
      {trigger.kind === 'everyNRounds' && (
        <NumberField
          label={t('editor.trigger.n')}
          value={trigger.n}
          min={1}
          max={20}
          suffix={t('editor.rounds')}
          onChange={(n) => onChange({ kind: 'everyNRounds', n })}
        />
      )}
    </>
  );
}

// ---------- conditions ----------

const OPS: CmpOp[] = ['=', '!=', '<', '>', '<=', '>='];

export function ConditionFields({
  cond,
  trigger,
  onChange,
  onOpenText,
}: {
  cond: Expr;
  trigger: Trigger;
  onChange: (e: Expr) => void;
  onOpenText: () => void;
}) {
  const { t } = useTranslation();
  if (cond.kind === 'chance') {
    return (
      <>
        <span className="block-word">{t('editor.condition.chance')}</span>
        <NumberField
          label={t('editor.condition.chance')}
          value={cond.percent}
          min={1}
          max={99}
          suffix="%"
          onChange={(percent) => onChange({ kind: 'chance', percent })}
        />
      </>
    );
  }
  if (cond.kind !== 'cmp' || !isSimpleCondition(cond)) {
    return (
      <button
        type="button"
        className="code-chip"
        onClick={onOpenText}
        title={t('editor.codeBlockHint')}
      >
        {printCondition(cond, 'de')}
      </button>
    );
  }
  const right = cond.right;
  const kind = rightKind(cond.left);
  const ops = kind === 'number' ? OPS : (['=', '!='] as CmpOp[]);
  return (
    <>
      <Select<Expr>
        label={t('editor.condition.value')}
        value={cond.left}
        options={valueOptions(trigger)}
        keyOf={valueKey}
        labelOf={(v) => valueLabel(t, v)}
        onChange={(left) => {
          const k = rightKind(left);
          const nextRight: Expr =
            k === 'number'
              ? right.kind === 'num'
                ? right
                : { kind: 'num', value: 1 }
              : k === 'tileType'
                ? { kind: 'str', value: 'lava' }
                : { kind: 'str', value: 'Sumpf' };
          const op = k === 'number' || cond.op === '=' || cond.op === '!=' ? cond.op : '=';
          onChange({ kind: 'cmp', op, left, right: nextRight });
        }}
      />
      {(cond.left.kind === 'figureVar' || cond.left.kind === 'worldVar') && (
        <TextField
          label={t('editor.varName')}
          value={cond.left.name}
          maxLength={24}
          onChange={(name) => {
            const left = cond.left;
            if (left.kind === 'figureVar' || left.kind === 'worldVar') {
              onChange({ ...cond, left: { ...left, name: name.toLowerCase() } });
            }
          }}
        />
      )}
      <Select<CmpOp>
        label={t('editor.condition.op')}
        value={cond.op}
        options={ops}
        keyOf={(o) => o}
        labelOf={(o) => o}
        onChange={(op) => onChange({ ...cond, op })}
      />
      {kind === 'number' && right.kind === 'num' && (
        <NumberField
          label={t('editor.condition.number')}
          value={right.value}
          min={-1000}
          max={1000}
          onChange={(value) => onChange({ ...cond, right: { kind: 'num', value } })}
        />
      )}
      {kind === 'tileType' && (
        <Select<string>
          label={t('editor.tileType')}
          value={right.kind === 'str' ? right.value : 'lava'}
          options={TILE_TYPES}
          keyOf={(v) => v}
          labelOf={(v) => t(`game.tileTypes.${v}`)}
          onChange={(value) => onChange({ ...cond, right: { kind: 'str', value } })}
        />
      )}
      {kind === 'text' && (
        <TextField
          label={t('editor.textureName')}
          value={right.kind === 'str' ? right.value : ''}
          maxLength={30}
          onChange={(value) => onChange({ ...cond, right: { kind: 'str', value } })}
        />
      )}
    </>
  );
}

// ---------- effects ----------

export function EffectFields({
  effect,
  trigger,
  npcTypes,
  onChange,
  onOpenText,
}: {
  effect: Effect;
  trigger: Trigger;
  npcTypes: readonly NpcType[];
  onChange: (e: Effect) => void;
  onOpenText: () => void;
}) {
  const { t } = useTranslation();
  const targetSel = (target: Target, set: (x: Target) => void) => (
    <Select<Target>
      label={t('editor.targetLabel')}
      value={target}
      options={targetOptions(trigger)}
      keyOf={targetKey}
      labelOf={(x) => targetLabel(t, x)}
      onChange={set}
    />
  );
  const tileSel = (tile: TileTarget, set: (x: TileTarget) => void) => (
    <>
      <Select<TileTarget>
        label={t('editor.tileLabel')}
        value={tile}
        options={tileOptions(trigger)}
        keyOf={tileKeyOf}
        labelOf={(x) => tileLabel(t, x)}
        onChange={set}
      />
      {tile.kind === 'tilesOfType' && (
        <Select<TileType>
          label={t('editor.tileType')}
          value={tile.tileType}
          options={TILE_TYPES}
          keyOf={(v) => v}
          labelOf={(v) => t(`game.tileTypes.${v}`)}
          onChange={(tileType) => set({ kind: 'tilesOfType', tileType })}
        />
      )}
    </>
  );
  const rounds = (value: number, set: (n: number) => void) => (
    <>
      <span className="block-word">{t('editor.for')}</span>
      <NumberField
        label={t('editor.rounds')}
        value={value}
        min={1}
        max={5}
        suffix={t('editor.rounds')}
        onChange={set}
      />
    </>
  );

  switch (effect.kind) {
    case 'spawn':
      return (
        <>
          <Select<string>
            label={t('editor.npcType')}
            value={effect.npcType}
            options={npcTypes.map((n) => n.id)}
            keyOf={(v) => v}
            labelOf={(v) => npcTypes.find((n) => n.id === v)?.name ?? v}
            onChange={(npcType) => onChange({ ...effect, npcType })}
          />
          <span className="block-word">{t('editor.on')}</span>
          {tileSel(effect.at, (at) => onChange({ ...effect, at }))}
        </>
      );
    case 'damage':
    case 'heal':
    case 'shield':
    case 'skip':
    case 'teleport':
      return (
        <>
          {targetSel(effect.target, (target) => onChange({ ...effect, target }))}
          {effect.kind !== 'teleport' && <span className="block-word">1</span>}
        </>
      );
    case 'moveMod':
    case 'wheelMod':
      return (
        <>
          {targetSel(effect.target, (target) => onChange({ ...effect, target }))}
          <NumberField
            label={t('editor.delta')}
            value={effect.delta}
            min={effect.kind === 'moveMod' ? -3 : -50}
            max={effect.kind === 'moveMod' ? 3 : 50}
            suffix={effect.kind === 'wheelMod' ? '%' : undefined}
            signed
            onChange={(delta) => onChange({ ...effect, delta })}
          />
          {rounds(effect.rounds, (r) => onChange({ ...effect, rounds: r }))}
        </>
      );
    case 'push':
      return (
        <>
          {targetSel(effect.target, (target) => onChange({ ...effect, target }))}
          <span className="block-word">{t('editor.awayFrom')}</span>
          {tileSel(effect.from, (from) => onChange({ ...effect, from }))}
        </>
      );
    case 'setTileType':
      return (
        <>
          {tileSel(effect.at, (at) => onChange({ ...effect, at }))}
          <span className="block-word">{t('editor.into')}</span>
          <Select<TileType>
            label={t('editor.tileType')}
            value={effect.tileType}
            options={TILE_TYPES}
            keyOf={(v) => v}
            labelOf={(v) => t(`game.tileTypes.${v}`)}
            onChange={(tileType) => onChange({ ...effect, tileType })}
          />
        </>
      );
    case 'removeTile':
    case 'addTileNear':
      return tileSel(effect.at, (at) => onChange({ ...effect, at }));
    case 'setVar': {
      if (effect.value.kind !== 'num') {
        return (
          <button
            type="button"
            className="code-chip"
            onClick={onOpenText}
            title={t('editor.codeBlockHint')}
          >
            {t('editor.complexValue')}
          </button>
        );
      }
      const num = effect.value.value;
      return (
        <>
          <Select<'world' | string>
            label={t('editor.scope')}
            value={effect.scope.kind === 'world' ? 'world' : targetKey(effect.scope.target)}
            options={['world', ...targetOptions(trigger).map(targetKey)]}
            keyOf={(v) => v}
            labelOf={(v) =>
              v === 'world'
                ? t('editor.world')
                : targetLabel(
                    t,
                    targetOptions(trigger).find((x) => targetKey(x) === v) ?? { kind: 'all' },
                  )
            }
            onChange={(v) =>
              onChange({
                ...effect,
                scope:
                  v === 'world'
                    ? { kind: 'world' }
                    : {
                        kind: 'figures',
                        target: targetOptions(trigger).find((x) => targetKey(x) === v) ?? {
                          kind: 'all',
                        },
                      },
              })
            }
          />
          <TextField
            label={t('editor.varName')}
            value={effect.name}
            maxLength={24}
            onChange={(name) => onChange({ ...effect, name: name.toLowerCase() })}
          />
          <Select<'=' | '+' | '-'>
            label={t('editor.varOp')}
            value={effect.op}
            options={['=', '+', '-']}
            keyOf={(v) => v}
            labelOf={(v) => v}
            onChange={(op) => onChange({ ...effect, op })}
          />
          <NumberField
            label={t('editor.condition.number')}
            value={num}
            min={-1000}
            max={1000}
            onChange={(value) => onChange({ ...effect, value: { kind: 'num', value } })}
          />
        </>
      );
    }
    case 'message':
      return (
        <TextField
          label={t('editor.messageText')}
          value={effect.text}
          maxLength={80}
          onChange={(text) => onChange({ ...effect, text })}
        />
      );
  }
}
