import { useTranslation } from 'react-i18next';
import { initI18n, LANGUAGES, type Language } from '../../i18n';
import { usePrefs } from '../../store/prefsStore';
import { useProfile } from '../../store/profileStore';
import { VolumeSliders } from './AudioControls';
import { Segmented, Toggle } from './Controls';
import { Dialog } from './Dialog';

export function PrefsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const language = usePrefs((s) => s.language);
  const setLanguage = usePrefs((s) => s.setLanguage);
  const codeLang = useProfile((s) => s.codeLang);
  const setCodeLang = useProfile((s) => s.setCodeLang);
  const muteOthers = usePrefs((s) => s.muteOthersSounds);
  const setMuteOthers = usePrefs((s) => s.setMuteOthersSounds);
  const change = (l: Language) => {
    setLanguage(l);
    initI18n(l);
  };
  return (
    <Dialog title={t('prefs.title')} onClose={onClose}>
      <div className="prefs">
        <div>
          <span className="label">{t('prefs.language')}</span>
          <Segmented
            label={t('prefs.language')}
            value={language}
            options={LANGUAGES.map((l) => ({ value: l, label: t(`prefs.languages.${l}`) }))}
            onChange={change}
          />
        </div>
        <div>
          <span className="label">{t('prefs.codeLang')}</span>
          <Segmented
            label={t('prefs.codeLang')}
            value={codeLang}
            options={(['de', 'en'] as const).map((l) => ({
              value: l,
              label: t(`prefs.codeLangs.${l}`),
            }))}
            onChange={setCodeLang}
          />
        </div>
        <VolumeSliders />
        <div className="prefs-toggle">
          <span className="label">{t('audio.muteOthers')}</span>
          <Toggle label={t('audio.muteOthers')} checked={muteOthers} onChange={setMuteOthers} />
        </div>
      </div>
    </Dialog>
  );
}
