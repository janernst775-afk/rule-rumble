import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './locales/de.json';
import en from './locales/en.json';

export const LANGUAGES = ['de', 'en'] as const;
export type Language = (typeof LANGUAGES)[number];

export function initI18n(language: Language): typeof i18n {
  if (!i18n.isInitialized) {
    void i18n.use(initReactI18next).init({
      resources: { de: { translation: de }, en: { translation: en } },
      lng: language,
      fallbackLng: 'de',
      interpolation: { escapeValue: false },
      returnNull: false,
    });
  } else {
    void i18n.changeLanguage(language);
  }
  return i18n;
}

export default i18n;
