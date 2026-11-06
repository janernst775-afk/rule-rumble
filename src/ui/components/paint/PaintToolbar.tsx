import { useTranslation } from 'react-i18next';
import { BRUSH_SIZES, type PaintTool } from './paintConfig';

interface Props {
  tool: PaintTool;
  size: number;
  grid: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onTool: (t: PaintTool) => void;
  onSize: (s: number) => void;
  onGrid: (g: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
}

const ICONS: Record<PaintTool | 'undo' | 'redo' | 'grid', string> = {
  brush: 'M4 20c3 0 5-2 5-4.5S11 12 13 10l7-7-1-1-7 7c-2 2-4.5 2-4.5 4.5S4 17 4 20z',
  eraser: 'M3 17l9-9 6 6-6 6H6zM12 8l4-4 5 5-4 4',
  fill: 'M5 11l7-7 7 7-7 7zM19 15c1 2 2 3 2 4a2 2 0 0 1-4 0c0-1 1-2 2-4z',
  picker: 'M14 4l6 6-2 2-6-6zM12 6l-8 8v4h4l8-8',
  undo: 'M9 7L4 12l5 5M4 12h10a6 6 0 0 1 0 12',
  redo: 'M15 7l5 5-5 5M20 12H10a6 6 0 0 0 0 12',
  grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16M15 4v16',
};

function Icon({ path }: { path: string }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  );
}

export function PaintToolbar(p: Props) {
  const { t } = useTranslation();
  const tools: PaintTool[] = ['brush', 'eraser', 'fill', 'picker'];
  return (
    <div className="paint-toolbar" role="toolbar" aria-label={t('tileDialog.tools.label')}>
      {tools.map((tool) => (
        <button
          key={tool}
          type="button"
          className="tool-btn"
          aria-pressed={p.tool === tool}
          aria-label={t(`tileDialog.tools.${tool}`)}
          title={t(`tileDialog.tools.${tool}`)}
          onClick={() => p.onTool(tool)}
        >
          <Icon path={ICONS[tool]} />
        </button>
      ))}
      <button
        type="button"
        className="tool-btn"
        disabled={!p.canUndo}
        aria-label={t('tileDialog.tools.undo')}
        title={`${t('tileDialog.tools.undo')} (Strg+Z)`}
        onClick={p.onUndo}
      >
        <Icon path={ICONS.undo} />
      </button>
      <button
        type="button"
        className="tool-btn"
        disabled={!p.canRedo}
        aria-label={t('tileDialog.tools.redo')}
        title={`${t('tileDialog.tools.redo')} (Strg+Y)`}
        onClick={p.onRedo}
      >
        <Icon path={ICONS.redo} />
      </button>
      <button
        type="button"
        className="tool-btn"
        aria-pressed={p.grid}
        aria-label={t('tileDialog.tools.grid')}
        title={t('tileDialog.tools.grid')}
        onClick={() => p.onGrid(!p.grid)}
      >
        <Icon path={ICONS.grid} />
      </button>
      <div className="brush-sizes" role="group" aria-label={t('tileDialog.tools.size')}>
        {BRUSH_SIZES.map((s, i) => (
          <button
            key={s}
            type="button"
            className="size-btn"
            aria-pressed={p.size === s}
            aria-label={t(`tileDialog.tools.sizes.${i}`)}
            title={t(`tileDialog.tools.sizes.${i}`)}
            onClick={() => p.onSize(s)}
          >
            <span style={{ width: 6 + i * 6, height: 6 + i * 6 }} />
          </button>
        ))}
      </div>
    </div>
  );
}
