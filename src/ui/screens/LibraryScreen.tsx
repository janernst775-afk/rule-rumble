import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { RuleDefinition } from '../../lang/ast';
import { useApp } from '../../store/appStore';
import { allRules, exportJson, useLibrary } from '../../store/libraryStore';
import { MuteButton } from '../components/AudioControls';
import { RuleList } from '../components/RuleList';
import { RuleEditor } from '../editor/RuleEditor';
import { LazyWorkshop } from '../workshop/LazyWorkshop';
import { useProfile } from '../../store/profileStore';
import { buildPackage, packageJson, readPackage } from '../../store/rulePackage';
import { soundList, useSounds } from '../../store/soundStore';
import { useTextures } from '../../store/textureStore';
import { useWorkshop } from '../../store/workshopStore';
import { ruleDescription } from '../ruleText';

function saveFile(name: string, text: string): void {
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

/** Screen 8 "Bibliothek": rules, export/import and rule packages (SPEC 5.5, 5.9). */
export function LibraryScreen() {
  const { t } = useTranslation();
  const setScreen = useApp((s) => s.setScreen);
  const own = useLibrary((s) => s.rules);
  const remove = useLibrary((s) => s.remove);
  const importJson = useLibrary((s) => s.importJson);
  const [selected, setSelected] = useState<RuleDefinition | null>(null);
  const [importText, setImportText] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ initial: RuleDefinition | null } | null>(null);
  const [workshop, setWorkshop] = useState(false);
  const save = useLibrary((s) => s.save);
  const record = useLibrary((s) => s.record);
  const author = useProfile((s) => s.name);
  const textures = useTextures((s) => s.textures);
  const saveTexture = useTextures((s) => s.save);
  const soundMap = useSounds((s) => s.sounds);
  const saveSound = useSounds((s) => s.save);

  const rules = allRules(own);

  const download = () => saveFile('rule-rumble-regeln.json', exportJson(rules));

  /** Package: the selected rule, or all own rules plus the whole workshop. */
  const downloadPackage = () => {
    const ws = useWorkshop.getState();
    const pkg = buildPackage(
      selected ? [selected] : own,
      { effects: ws.effects, functions: ws.functions ?? [], npcTypes: ws.npcTypes },
      Object.values(textures),
      !selected,
      soundList(soundMap),
    );
    saveFile('rule-rumble-paket.json', packageJson(pkg));
  };

  /** Imports a package; returns false if the text is no package. */
  const importPackage = (text: string): boolean => {
    const ws = useWorkshop.getState();
    const pkg = readPackage(text, {
      effects: ws.effects,
      functions: ws.functions ?? [],
      npcTypes: ws.npcTypes,
    });
    if (!pkg) return false;
    // Imported definitions replace own ones with the same name (SPEC 5.9: share game modes).
    for (const f of pkg.functions) ws.saveFunction(f);
    for (const e of pkg.effects) ws.saveEffect(e);
    for (const n of pkg.npcTypes) ws.saveNpcType(n);
    const before = useLibrary.getState().rules.length;
    pkg.rules.forEach((r, i) => {
      const taken =
        r.id.startsWith('start.') || useLibrary.getState().rules.some((x) => x.id === r.id);
      record(taken ? { ...r, id: `import.${Date.now().toString(36)}.${i}` } : r);
    });
    const added = useLibrary.getState().rules.length - before;
    const names = new Set(Object.values(textures).map((x) => x.name.toLowerCase()));
    let newTextures = 0;
    pkg.textures.forEach((tex, i) => {
      if (names.has(tex.name.toLowerCase())) return;
      newTextures++;
      void saveTexture({
        id: textures[tex.id] ? `import.${Date.now().toString(36)}.${i}` : tex.id,
        name: tex.name,
        dataUrl: tex.dataUrl,
        author: t('library.importAuthor'),
        createdAt: Date.now(),
        inLibrary: true,
      });
    });
    // Imported sounds replace own ones with the same name, like effects.
    pkg.sounds.forEach((snd) => {
      const existing = soundList(soundMap).find((x) => x.name === snd.name);
      void saveSound({ ...snd, id: existing?.id ?? snd.id, createdAt: Date.now() });
    });
    setStatus(
      t('library.packageImported', {
        sounds: pkg.sounds.length,
        rules: added,
        effects: pkg.effects.length,
        functions: pkg.functions.length,
        npcs: pkg.npcTypes.length,
        textures: newTextures,
        rejected: pkg.rejected,
      }),
    );
    setImportText('');
    return true;
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
    if (importPackage(text)) return;
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
          <div className="library-actions">
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => setEditing({ initial: null })}
            >
              {t('editor.newRuleButton')}
            </button>
            <button type="button" className="btn btn-small" onClick={() => setWorkshop(true)}>
              {t('workshop.title')}
            </button>
            {selected && (
              <button
                type="button"
                className="btn btn-small"
                onClick={() => setEditing({ initial: selected })}
              >
                {selected.id.startsWith('start.') ? t('editor.editCopy') : t('editor.edit')}
              </button>
            )}
          </div>
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
            <button type="button" className="btn btn-small" onClick={downloadPackage}>
              {selected ? t('library.packageOne') : t('library.packageAll')}
            </button>
          </div>
          <p className="hint">{t('library.packageHint')}</p>
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
                  if (file && file.size < 8_000_000) runImport(await file.text());
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
      {workshop && <LazyWorkshop onClose={() => setWorkshop(false)} />}
      {editing && (
        <RuleEditor
          initial={editing.initial}
          game={null}
          author={author.trim() || t('lobby.roles.hero')}
          onClose={() => setEditing(null)}
          onSave={(def) => {
            save(def);
            setSelected(def);
            setEditing(null);
            setStatus(t('editor.saved', { name: def.ast.name }));
          }}
        />
      )}
    </main>
  );
}
