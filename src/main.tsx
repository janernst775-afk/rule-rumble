import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme.css';
import './ui/app.css';
import { initI18n } from './i18n';
import { usePrefs } from './store/prefsStore';
import { App } from './ui/App';

initI18n(usePrefs.getState().language);

const root = document.getElementById('root');
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
