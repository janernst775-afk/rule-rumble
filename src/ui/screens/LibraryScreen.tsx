import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleDefinition } from '../../lang/ast';
import { useApp } from '../../store/appStore';
import { allRules, exportJson, useLibrary } from '../../store/libraryStore';
import { MuteButton } from '../components/AudioControls';
import { RuleList } from '../components/RuleList';
import { ruleDescription } from '../ruleText';

/** Screen 8 "Bibliothek" (rules only in v0.3; effects, textures, sounds follow later). */
export function LibraryScreen() {
  const { t } = useTranslation();
  const setScreen = useApp((s) => s.setScreen);
  const own = useLibrary((s) => s.rules);
  const remove = useLibrary((s) => s.remove);
  const importJson = useLibrary((s) => s.importJson);
  const [selected, setSelected] = useState<RuleDefinition | null>(null);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const rules = allRules(own);

  const download = () => {
    const blob = new Blob([exportJson(rules)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'rule-rumble-regeln.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(exportJson(selected ? [selected] : rules));
      setStatus(t('library.copied'));
    } catch {
      setStatus(t('library.copyFailed'));
    }
  };

  const runImport = (text: string) => {
    const result = importJson(text);
    setStatus(t('library.imported', { added: result.added, rejected: result.rejected }));
    if (result.added > 0) setImportText('');
  };

  return (
    <main className="library-screen">
      <header className="lobby-header">
        <button type="button" className="logo-btn" onClick={() => setScreen('start')}>
          <span className="title-logo">{t('app.title')}</span>
        </button>
        <div className="lobby-header-right">
          <MuteButton />
        </div>
      </header>
      <div className="library-body">
        <section className="card library-list">
          <div className="players-head">
            <h2>{t('library.title')}</h2>
            <span className="players-count">{rules.length}</span>
          </div>
          <RuleList
            rules={rules}
            selectedId={selected?.id ?? null}
            onSelect={setSelected}
            onRemove={(def) => {
              remove(def.id);
              if (selected?.id === def.id) setSelected(null);
            }}
          />
        </section>
        <aside className="card library-side">
          {selected ? (
            <>
              <h3>{selected.ast.name}</h3>
              <p>{ruleDescription(selected, t)}</p>
              <p className="hint">{t('rules.by', { author: selected.author })}</p>
            </>
          ) : (
            <p className="hint">{t('library.selectHint')}</p>
          )}
          <h3 className="subhead">{t('library.export')}</h3>
          <div className="library-actions">
            <button type="button" className="btn btn-small" onClick={() => void copy()}>
              {selected ? t('library.copyOne') : t('library.copyAll')}
            </button>
            <button type="button" className="btn btn-small" onClick={download}>
              {t('library.download')}
            </button>
          </div>
          <h3 className="subhead">{t('library.import')}</h3>
          <label className="visually-hidden" htmlFor="import-text">
            {t('library.importLabel')}
          </label>
          <textarea
            id="import-text"
            className="import-text"
            placeholder={t('library.importPlaceholder')}
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <div className="library-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              disabled={!importText.trim()}
              onClick={() => runImport(importText)}
            >
              {t('library.importButton')}
            </button>
            <label className="btn btn-soft btn-small">
              {t('library.importFile')}
              <input
                type="file"
                accept="application/json,.json"
                className="visually-hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file && file.size < 1_000_000) runImport(await file.text());
                }}
              />
            </label>
          </div>
          {status && (
            <p className="hint" role="status">
              {status}
            </p>
          )}
          <button type="button" className="btn btn-soft" onClick={() => setScreen('start')}>
            {t('common.back')}
          </button>
        </aside>
      </div>
    </main>
  );
}
