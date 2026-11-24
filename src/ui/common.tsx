import { useEffect, type ReactNode } from 'react';

type IconName =
  | 'back' | 'menu' | 'sound' | 'mute' | 'eye' | 'score' | 'close' | 'share' | 'check'
  | 'robot' | 'person' | 'globe' | 'book' | 'gear' | 'phone' | 'play' | 'chevron' | 'bulb' | 'wifiOff';

const PATHS: Record<IconName, ReactNode> = {
  back: <path d="M15 5l-7 7 7 7" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  sound: <path d="M4 10v4h3l5 4V6L7 10H4zM16 9a4 4 0 010 6M18.5 6.5a8 8 0 010 11" />,
  mute: <path d="M4 10v4h3l5 4V6L7 10H4zM16 9.5l5 5M21 9.5l-5 5" />,
  eye: <><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></>,
  score: <path d="M5 4h14v16H5zM9 8h6M9 12h6M9 16h3" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  share: <path d="M12 15V4M8 8l4-4 4 4M5 12v7h14v-7" />,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  robot: <><rect x="5" y="8" width="14" height="11" rx="3" /><path d="M12 4v4M9 13h.01M15 13h.01M9.5 16h5" /></>,
  person: <><circle cx="12" cy="8" r="4" /><path d="M4 20c1.2-4 4.3-6 8-6s6.8 2 8 6" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
  book: <path d="M12 6c-2-1.5-5-2-8-1.5v13c3-.5 6 0 8 1.5 2-1.5 5-2 8-1.5v-13C17 4 14 4.5 12 6zM12 6v13" />,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M12 2.500v3M12 18.500v3M2.5 12h3M18.5 12h3M5.3 5.300l2.1 2.100M16.6 16.600l2.1 2.100M5.3 18.700l2.1-2.100M16.6 7.400l2.1-2.1" /></>,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.500h2" /></>,
  play: <path d="M8 5l11 7-11 7z" />,
  chevron: <path d="M9 5l7 7-7 7" />,
  bulb: <path d="M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.900c.6.5 1 1.3 1 2.100h5c0-.8.4-1.6 1-2.100A6 6 0 0012 3z" />,
  wifiOff: <path d="M3 3l18 18M5 12.500a10 10 0 013.5-2.300M19 12.500a10 10 0 00-5-2.800M8.5 16a5 5 0 017 0M12 19.500h.01M2 9a15 15 0 014.2-2.800M22 9a15 15 0 00-10-3.9" />,
};

export function Icon({ name, size = 22 }: { name: IconName; size?: number }) {
  return (
    <svg
      className="icon"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  );
}

export function IconButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button type="button" className={`icon-btn${active ? ' active' : ''}`} aria-label={label} title={label} onClick={onClick}>
      <Icon name={icon} />
    </button>
  );
}

export function ScreenHeader({ title, onBack, right }: { title: string; onBack?: () => void; right?: ReactNode }) {
  return (
    <header className="screen-header">
      <div className="screen-header-side">
        {onBack && <IconButton icon="back" label="Back" onClick={onBack} />}
      </div>
      <h1>{title}</h1>
      <div className="screen-header-side right">{right}</div>
    </header>
  );
}

export function Toggle({
  label,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label className={`row toggle-row${disabled ? ' disabled' : ''}`}>
      <span className="row-text">
        <span className="row-label">{label}</span>
        {hint && <span className="row-hint">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="switch" aria-hidden="true" />
    </label>
  );
}

export function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={o.value === value ? 'on' : ''}
          disabled={disabled}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Centered dialog (or bottom sheet) over a dimmed backdrop. */
export function Modal({
  children,
  onClose,
  sheet,
  className = '',
  label,
}: {
  children: ReactNode;
  onClose?: () => void;
  sheet?: boolean;
  className?: string;
  label?: string;
}) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={`backdrop${sheet ? ' sheet' : ''}`} onClick={onClose}>
      <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={label} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

export function Section({ title, children, note }: { title?: string; children: ReactNode; note?: string }) {
  return (
    <section className="section">
      {title && <h2>{title}</h2>}
      <div className="card-panel">{children}</div>
      {note && <p className="section-note">{note}</p>}
    </section>
  );
}
