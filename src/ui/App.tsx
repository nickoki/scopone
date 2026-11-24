import { useCallback, useEffect, useState } from 'react';
import { setSoundEnabled } from '../audio/sound';
import { clearLocalGame, loadLocalGame, newLocalGame, saveLocalGame } from '../game/setup';
import type { LocalGame, LocalMode, SeatConfig } from '../game/types';
import { useLocalGame } from '../game/useLocalGame';
import { isRoomCode, normalizeRoomCode } from '../online/crypto';
import { useSettings } from '../state/settings';
import { GameScreen } from './game/GameScreen';
import { Home } from './Home';
import { HowTo } from './HowTo';
import { OnlineScreen } from './online/OnlineScreen';
import { SettingsScreen } from './SettingsScreen';
import { Setup } from './Setup';

type Route =
  | { name: 'home' }
  | { name: 'setup'; mode: LocalMode }
  | { name: 'game' }
  | { name: 'online'; code?: string }
  | { name: 'howto' }
  | { name: 'settings' };

/** A join link looks like https://…/?room=ABCDE */
function roomFromUrl(): string | undefined {
  try {
    const code = normalizeRoomCode(new URLSearchParams(location.search).get('room') ?? '');
    return isRoomCode(code) ? code : undefined;
  } catch {
    return undefined;
  }
}

function LocalGameScreen({
  game,
  onChange,
  onExit,
  onAbandon,
  onRematch,
}: {
  game: LocalGame;
  onChange: (g: LocalGame) => void;
  onExit: () => void;
  onAbandon: () => void;
  onRematch: () => void;
}) {
  const { settings } = useSettings();
  const ctl = useLocalGame(game, settings.speed, onChange);
  return <GameScreen ctl={ctl} onExit={onExit} onAbandon={onAbandon} onRematch={onRematch} />;
}

export function App() {
  const { settings } = useSettings();
  const [route, setRoute] = useState<Route>(() => {
    const code = roomFromUrl();
    return code ? { name: 'online', code } : { name: 'home' };
  });
  /** The unfinished game offered as "Resume" on the home screen. */
  const [saved, setSaved] = useState<LocalGame | null>(loadLocalGame);
  /** The game on screen. `key` changes for every game so the screen remounts. */
  const [active, setActive] = useState<{ game: LocalGame; key: number } | null>(null);

  useEffect(() => {
    setSoundEnabled(settings.sound);
  }, [settings.sound]);

  const home = useCallback(() => {
    setActive(null);
    setRoute({ name: 'home' });
  }, []);

  const nav = useCallback((to: 'ai' | 'pass' | 'online' | 'howto' | 'settings') => {
    if (to === 'ai' || to === 'pass') setRoute({ name: 'setup', mode: to });
    else if (to === 'online') setRoute({ name: 'online' });
    else if (to === 'howto') setRoute({ name: 'howto' });
    else setRoute({ name: 'settings' });
  }, []);

  const onGameChange = useCallback((g: LocalGame) => {
    saveLocalGame(g);
    setSaved(g.match.phase === 'matchEnd' ? null : g);
  }, []);

  const play = (g: LocalGame) => {
    setActive((prev) => ({ game: g, key: (prev?.key ?? 0) + 1 }));
    setRoute({ name: 'game' });
  };

  const start = (mode: LocalMode, seats: SeatConfig[], tutorial: boolean, rules = settings.rules) => {
    const g = newLocalGame(mode, seats, rules, tutorial);
    saveLocalGame(g);
    setSaved(g);
    play(g);
  };

  let screen;
  if (route.name === 'game' && active) {
    const g = active.game;
    screen = (
      <LocalGameScreen
        key={active.key}
        game={g}
        onChange={onGameChange}
        onExit={home}
        onAbandon={() => {
          clearLocalGame();
          setSaved(null);
          home();
        }}
        onRematch={() => start(g.mode, g.seats, false, g.match.rules)}
      />
    );
  } else if (route.name === 'setup') {
    screen = (
      <Setup
        mode={route.mode}
        hasSaved={saved !== null}
        onBack={home}
        onStart={(seats, tutorial) => start(route.mode, seats, tutorial)}
      />
    );
  } else if (route.name === 'online') {
    screen = (
      <OnlineScreen
        initialCode={route.code}
        onBack={() => {
          if (route.code) history.replaceState(null, '', location.pathname);
          home();
        }}
      />
    );
  } else if (route.name === 'howto') {
    screen = <HowTo onBack={home} />;
  } else if (route.name === 'settings') {
    screen = <SettingsScreen onBack={home} />;
  } else {
    screen = <Home saved={saved} onResume={() => saved && play(saved)} onNav={nav} />;
  }
  return <div className="app">{screen}</div>;
}
