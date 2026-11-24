import { useEffect, useState } from 'react';
import type { LocalGame } from '../game/types';
import { useT } from '../i18n';
import { Icon } from './common';

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

function isIos(): boolean {
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

interface HomeProps {
  saved: LocalGame | null;
  onResume: () => void;
  onNav: (to: 'ai' | 'pass' | 'online' | 'howto' | 'settings') => void;
}

export function Home({ saved, onResume, onNav }: HomeProps) {
  const t = useT();
  const online = useOnline();
  const showInstall = isIos() && !isStandalone();
  return (
    <div className="screen home">
      <div className="scroll">
        <div className="hero">
          <img src="/favicon.svg" alt="" className="hero-logo" width="112" height="112" />
          <h1>{t.appName}</h1>
          <p>{t.tagline}</p>
        </div>

        <nav className="menu">
          {saved && (
            <button type="button" className="menu-item resume" onClick={onResume}>
              <Icon name="play" size={26} />
              <span>
                <b>{t.home.resume}</b>
                <small>{t.home.resumeHint(saved.match.handNumber, saved.match.scores[0], saved.match.scores[1])}</small>
              </span>
              <Icon name="chevron" size={18} />
            </button>
          )}
          <button type="button" className="menu-item" onClick={() => onNav('ai')}>
            <Icon name="robot" size={26} />
            <span>
              <b>{t.home.vsComputer}</b>
              <small>{t.home.vsComputerHint}</small>
            </span>
            <Icon name="chevron" size={18} />
          </button>
          <button type="button" className="menu-item" onClick={() => onNav('pass')}>
            <Icon name="phone" size={26} />
            <span>
              <b>{t.home.passPlay}</b>
              <small>{t.home.passPlayHint}</small>
            </span>
            <Icon name="chevron" size={18} />
          </button>
          <button type="button" className="menu-item" onClick={() => onNav('online')}>
            <Icon name={online ? 'globe' : 'wifiOff'} size={26} />
            <span>
              <b>{t.home.online}</b>
              <small>{online ? t.home.onlineHint : t.home.offline}</small>
            </span>
            <Icon name="chevron" size={18} />
          </button>
        </nav>

        <div className="home-links">
          <button type="button" className="btn ghost" onClick={() => onNav('howto')}>
            <Icon name="book" size={20} /> {t.home.howTo}
          </button>
          <button type="button" className="btn ghost" onClick={() => onNav('settings')}>
            <Icon name="gear" size={20} /> {t.home.settings}
          </button>
        </div>

        {showInstall && (
          <div className="install-tip">
            <Icon name="share" size={20} />
            <span>
              <b>{t.home.installTitle}</b> — {t.home.installBody}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
