import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './ui/App';
import { SettingsProvider } from './state/settings';
import './styles.css';

// Behave like a native app: no pinch-zoom, no double-tap zoom, no rubber-band selection.
const stop = (e: Event) => e.preventDefault();
document.addEventListener('gesturestart', stop);
document.addEventListener('gesturechange', stop);
document.addEventListener(
  'touchmove',
  (e) => {
    if (e.touches.length > 1) e.preventDefault();
  },
  { passive: false },
);
document.addEventListener('contextmenu', (e) => {
  const el = e.target as HTMLElement | null;
  if (!el || !el.closest('input, textarea')) e.preventDefault();
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SettingsProvider>
      <App />
    </SettingsProvider>
  </StrictMode>,
);
