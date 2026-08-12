import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { THEME_CSS } from './styles';

// Design System v2 tokens. Injected once at boot rather than imported as a .css
// file because this package has no CSS pipeline configured (styles are CSS-in-JS
// objects). The custom properties this defines are what every `var(--x)` in
// styles.ts resolves against, and they carry both the light and dark palettes,
// so the whole cockpit gets dark mode without any component knowing about it.
// Guarded by id so React StrictMode's double-invoke cannot inject it twice.
const THEME_STYLE_ID = 'af-theme-v2';
if (!document.getElementById(THEME_STYLE_ID)) {
  const el = document.createElement('style');
  el.id = THEME_STYLE_ID;
  el.textContent = THEME_CSS;
  document.head.appendChild(el);
}

const root = document.getElementById('root');
if (root) {
  ReactDOM.createRoot(root).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  );
}
