import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AI_LEVELS } from '../../ai/types';
import { unlockAudio } from '../../audio/sound';
import { isRoomCode, loadIdentity, makeRoomCode, normalizeRoomCode } from '../../online/crypto';
import { GuestSession, type SavedGuestRoom } from '../../online/guest';
import { HostSession, type SavedHostRoom } from '../../online/host';
import { AI_SEAT_NAMES, type Lobby, type LobbySeat } from '../../online/protocol';
import { createTransport, transportKind } from '../../online/transport';
import { useGuestController, useHostController } from '../../online/useOnlineGame';
import { useT } from '../../i18n';
import { useSettings } from '../../state/settings';
import { KEYS, loadJson, removeKey } from '../../state/storage';
import { Icon, Modal, ScreenHeader, Section } from '../common';
import { GameScreen } from '../game/GameScreen';
import { useOnline } from '../Home';
import { RulesEditor } from '../RulesEditor';

type Session = HostSession | GuestSession;

const MAX_ROOM_AGE_MS = 12 * 60 * 60 * 1000;

function loadSavedHost(): SavedHostRoom | null {
  const s = loadJson<SavedHostRoom>(KEYS.hostRoom);
  return s && s.lobby && isRoomCode(s.code) && Date.now() - s.savedAt < MAX_ROOM_AGE_MS ? s : null;
}

function loadSavedGuest(): SavedGuestRoom | null {
  const s = loadJson<SavedGuestRoom>(KEYS.guestRoom);
  return s && isRoomCode(s.code) && Date.now() - s.savedAt < MAX_ROOM_AGE_MS ? s : null;
}

export function OnlineScreen({ initialCode, onBack }: { initialCode?: string; onBack: () => void }) {
  const t = useT();
  const { settings, update } = useSettings();
  const kind = transportKind();
  const online = useOnline();
  const [session, setSession] = useState<Session | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState(settings.playerName);
  const [code, setCode] = useState(normalizeRoomCode(initialCode ?? ''));
  const [savedHost, setSavedHost] = useState(loadSavedHost);
  const [savedGuest, setSavedGuest] = useState(loadSavedGuest);
  const sessionRef = useRef<Session | null>(null);
  sessionRef.current = session;

  // Leaving the screen disconnects, but keeps enough to come back.
  useEffect(
    () => () => {
      const s = sessionRef.current;
      if (s?.role === 'host') s.suspend();
      else s?.leave(false);
    },
    [],
  );

  const playerName = () => {
    const n = name.trim().slice(0, 14) || t.common.player(Math.floor(Math.random() * 90) + 10);
    if (n !== settings.playerName) update({ playerName: n });
    return n;
  };

  const open = async (make: (deps: { identity: Awaited<ReturnType<typeof loadIdentity>>; transport: Awaited<ReturnType<typeof createTransport>>; name: string }) => Session) => {
    unlockAudio();
    setBusy(true);
    setError(null);
    try {
      const [identity, transport] = await Promise.all([loadIdentity(), createTransport()]);
      const s = make({ identity, transport, name: playerName() });
      s.start();
      setSession(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createRoom = (restore?: SavedHostRoom) =>
    open(({ identity, transport, name: n }) => {
      // A saved room can only be reopened by the device that created it.
      const ok = restore && restore.lobby.hostId === identity.id ? restore : undefined;
      return new HostSession(transport, identity, n, ok?.code ?? makeRoomCode(), settings.rules, ok);
    });

  const joinRoom = (roomCode: string) =>
    open(({ identity, transport, name: n }) => new GuestSession(transport, identity, n, roomCode));

  const closeSession = () => {
    setSession(null);
    setSavedHost(loadSavedHost());
    setSavedGuest(loadSavedGuest());
  };

  if (session?.role === 'host') {
    return (
      <HostView
        session={session}
        onSuspend={() => {
          session.suspend();
          closeSession();
          onBack();
        }}
        onClose={() => {
          session.close();
          closeSession();
        }}
      />
    );
  }
  if (session?.role === 'guest') {
    return (
      <GuestView
        session={session}
        onLeave={(forget) => {
          session.leave(forget);
          closeSession();
        }}
      />
    );
  }

  const disabled = busy || !kind || !online;
  return (
    <div className="screen">
      <ScreenHeader title={t.online.title} onBack={onBack} />
      <div className="scroll">
        <p className="intro">{t.online.intro}</p>
        {!kind && <p className="warn">{t.online.notConfigured}</p>}
        {kind === 'local' && <p className="warn soft">{t.online.localTransport}</p>}
        {kind && !online && <p className="warn">{t.online.needOnline}</p>}
        {error && <p className="warn">{error}</p>}

        <Section>
          <label className="row col">
            <span className="row-label">{t.online.yourName}</span>
            <input
              className="text-input"
              type="text"
              maxLength={14}
              autoComplete="off"
              autoCapitalize="words"
              placeholder={t.settings.namePlaceholder}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
        </Section>

        {savedHost && (
          <button type="button" className="btn wide resume-room" disabled={disabled} onClick={() => void createRoom(savedHost)}>
            {t.online.resumeHost(savedHost.code)}
          </button>
        )}
        {savedGuest && (
          <button type="button" className="btn wide resume-room" disabled={disabled} onClick={() => void joinRoom(savedGuest.code)}>
            {t.online.rejoin(savedGuest.code)}
          </button>
        )}

        <button
          type="button"
          className="btn primary wide big"
          disabled={disabled}
          onClick={() => {
            removeKey(KEYS.hostRoom);
            void createRoom();
          }}
        >
          {t.online.create}
        </button>

        <Section title={t.online.joinTitle}>
          <form
            className="row join-row"
            onSubmit={(e) => {
              e.preventDefault();
              if (isRoomCode(code) && !disabled) void joinRoom(code);
            }}
          >
            <input
              className="text-input code-input"
              type="text"
              inputMode="text"
              autoCapitalize="characters"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              maxLength={5}
              aria-label={t.online.roomCode}
              placeholder={t.online.codePlaceholder}
              value={code}
              onChange={(e) => setCode(normalizeRoomCode(e.target.value))}
            />
            <button type="submit" className="btn primary" disabled={disabled || !isRoomCode(code)}>
              {t.online.join}
            </button>
          </form>
        </Section>
        <p className="section-note">{t.online.privacy}</p>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ lobby

function seatLabel(seat: LobbySeat, index: number, levels: Record<string, string>): { name: string; sub: string } {
  if (seat.kind === 'ai') return { name: AI_SEAT_NAMES[index]!, sub: `CPU · ${levels[seat.level]!.split(' ')[0]}` };
  return { name: seat.name, sub: '' };
}

function LobbyView({
  lobby,
  myId,
  host,
  status,
  onLeave,
  leaveLabel,
}: {
  lobby: Lobby;
  myId: string;
  host: HostSession | null;
  status: string | null;
  onLeave: () => void;
  leaveLabel: string;
}) {
  const t = useT();
  const [picking, setPicking] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const pos = [t.seats.south, t.seats.east, t.seats.north, t.seats.west];
  const seated = new Set(lobby.seats.flatMap((s) => (s.kind === 'player' ? [s.id] : [])));

  const share = async () => {
    const url = `${location.origin}/?room=${lobby.code}`;
    const text = t.online.shareText(lobby.code);
    try {
      if (navigator.share) await navigator.share({ title: 'Scopone', text, url });
      else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }
    } catch {
      /* cancelled */
    }
  };

  const SeatChip = ({ i }: { i: number }) => {
    const s = lobby.seats[i]!;
    const label = seatLabel(s, i, t.levels);
    const offline = s.kind === 'player' && !lobby.players.find((p) => p.id === s.id)?.online;
    return (
      <button
        type="button"
        className={`lobby-seat team-${i % 2} pos-${i}${s.kind === 'ai' ? ' ai' : ''}${offline ? ' offline' : ''}`}
        disabled={!host}
        onClick={() => setPicking(i)}
      >
        <small>{pos[i]}</small>
        <b>
          <Icon name={s.kind === 'ai' ? 'robot' : 'person'} size={16} /> {label.name}
          {s.kind === 'player' && s.id === myId ? ` (${t.common.you.toLowerCase()})` : ''}
        </b>
        <small>{offline ? t.game.awayTag : label.sub || (s.kind === 'player' && s.id === lobby.hostId ? t.online.host : ' ')}</small>
      </button>
    );
  };

  return (
    <div className="screen">
      <ScreenHeader title={t.online.title} onBack={onLeave} />
      <div className="scroll">
        <div className="room-code">
          <small>{t.online.roomCode}</small>
          <strong data-testid="room-code">{lobby.code}</strong>
          <button type="button" className="btn" onClick={() => void share()}>
            <Icon name={copied ? 'check' : 'share'} size={18} /> {copied ? t.online.copied : t.online.share}
          </button>
        </div>
        {status && <p className="warn soft">{status}</p>}

        <section className="section">
          <h2>{t.online.seatsTitle}</h2>
          <p className="section-note top">{host ? t.online.seatsHint : t.online.seatsHintGuest}</p>
          <div className="lobby-table">
            <SeatChip i={2} />
            <SeatChip i={3} />
            <div className="lobby-felt">
              <span>
                {t.common.teamA}: {pos[0]} + {pos[2]}
              </span>
              <span>
                {t.common.teamB}: {pos[1]} + {pos[3]}
              </span>
            </div>
            <SeatChip i={1} />
            <SeatChip i={0} />
          </div>
        </section>

        <Section title={t.online.waitingPlayers}>
          {lobby.players.length <= 1 && <p className="about dim">{t.online.nobody}</p>}
          <ul className="player-list">
            {lobby.players.map((p) => (
              <li key={p.id} className={p.online ? '' : 'offline'}>
                <Icon name="person" size={16} /> {p.name}
                {p.host && <i className="tag">{t.online.host}</i>}
                {!seated.has(p.id) && <i className="tag away">{t.online.unseated}</i>}
                {!p.online && <i className="tag away">{t.game.awayTag}</i>}
              </li>
            ))}
          </ul>
        </Section>

        <Section title={t.setup.rules}>
          <RulesEditor rules={lobby.rules} onChange={(p) => host?.setRules(p)} disabled={!host} />
        </Section>
        <p className="section-note">{t.online.privacy}</p>
        <button type="button" className="btn wide ghost danger" onClick={onLeave}>
          {leaveLabel}
        </button>
      </div>
      <footer className="screen-footer">
        {host ? (
          <button type="button" className="btn primary wide big" onClick={() => host.startGame()}>
            {t.online.startGame}
          </button>
        ) : (
          <p className="waiting">{t.online.waitingHost}</p>
        )}
      </footer>

      {picking !== null && host && (
        <Modal sheet onClose={() => setPicking(null)} label={t.online.assign}>
          <h2>
            {t.online.assign} <small>({pos[picking]})</small>
          </h2>
          <div className="btn-col">
            {lobby.players
              .filter((p) => p.online)
              .map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn wide"
                  onClick={() => {
                    host.assignSeat(picking, { kind: 'player', id: p.id, name: p.name });
                    setPicking(null);
                  }}
                >
                  <Icon name="person" size={18} /> {p.name}
                </button>
              ))}
            {AI_LEVELS.map((level) => (
              <button
                key={level}
                type="button"
                className="btn wide"
                disabled={lobby.seats[picking]!.kind === 'player' && (lobby.seats[picking] as { id: string }).id === lobby.hostId}
                onClick={() => {
                  host.assignSeat(picking, { kind: 'ai', level });
                  setPicking(null);
                }}
              >
                <Icon name="robot" size={18} /> {t.common.computer} · {t.levels[level]}
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}

function RoomTag({ code }: { code: string }) {
  const t = useT();
  return (
    <p className="room-tag">
      {t.online.roomCode}: <b>{code}</b>
    </p>
  );
}

function HostView({ session, onSuspend, onClose }: { session: HostSession; onSuspend: () => void; onClose: () => void }) {
  const t = useT();
  const { settings } = useSettings();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const ctl = useHostController(session, settings.speed, t);
  const [confirmClose, setConfirmClose] = useState(false);

  if (snap.lobby.started && ctl) {
    return (
      <GameScreen
        ctl={ctl}
        onExit={onSuspend}
        onAbandon={onClose}
        onRematch={() => session.startGame()}
        menuExtra={<RoomTag code={snap.lobby.code} />}
      />
    );
  }
  return (
    <>
      <LobbyView
        lobby={snap.lobby}
        myId={snap.lobby.hostId}
        host={session}
        status={snap.status === 'connected' ? null : snap.status === 'connecting' ? t.online.connecting : t.online.reconnecting}
        onLeave={() => setConfirmClose(true)}
        leaveLabel={t.online.closeRoom}
      />
      {confirmClose && (
        <Modal onClose={() => setConfirmClose(false)} label={t.online.closeRoom}>
          <h2>{t.online.closeRoom}?</h2>
          <div className="btn-col">
            <button type="button" className="btn primary wide danger" onClick={onClose}>
              {t.online.closeRoom}
            </button>
            <button type="button" className="btn wide" onClick={() => setConfirmClose(false)}>
              {t.common.cancel}
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

function GuestView({ session, onLeave }: { session: GuestSession; onLeave: (forget: boolean) => void }) {
  const t = useT();
  const { settings } = useSettings();
  const snap = useSyncExternalStore(session.subscribe, session.getSnapshot);
  const ctl = useGuestController(session, settings.speed, t);
  const [myId, setMyId] = useState('');
  useEffect(() => {
    void loadIdentity().then((i) => setMyId(i.id));
  }, []);

  if (snap.phase === 'playing' && ctl) {
    return <GameScreen ctl={ctl} onExit={() => onLeave(true)} menuExtra={<RoomTag code={session.code} />} />;
  }
  if (snap.phase === 'lobby' && snap.lobby) {
    return (
      <LobbyView
        lobby={snap.lobby}
        myId={myId}
        host={null}
        status={snap.status !== 'connected' ? t.online.reconnecting : !snap.hostOnline ? t.online.hostAway : null}
        onLeave={() => onLeave(true)}
        leaveLabel={t.online.leave}
      />
    );
  }
  const message =
    snap.phase === 'closed' ? t.online.closed : snap.phase === 'notFound' ? t.online.notFound : t.online.connecting;
  return (
    <div className="screen">
      <ScreenHeader title={t.online.title} onBack={() => onLeave(snap.phase !== 'connecting')} />
      <div className="scroll centered">
        <div className="room-code">
          <small>{t.online.roomCode}</small>
          <strong>{session.code}</strong>
        </div>
        <p className={snap.phase === 'connecting' ? 'waiting' : 'warn'}>{message}</p>
        <button type="button" className="btn wide" onClick={() => onLeave(true)}>
          {t.common.back}
        </button>
      </div>
    </div>
  );
}
