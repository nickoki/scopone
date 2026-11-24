import { useState, type ReactNode } from 'react';
import { SuitIcon } from '../cards';
import { SUITS, cardId, type CardId, type Suit } from '../engine';
import { useT } from '../i18n';
import { useSettings } from '../state/settings';
import { ScreenHeader, Segmented } from './common';
import { MiniCards } from './game/MiniCards';

const C = (suit: Suit, rank: number): CardId => cardId(suit, rank);

function Example({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="example">
      <div className="example-art">{children}</div>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

/** "This card" -> "takes these", with the non-captured table cards dimmed. */
function CaptureDemo({ play, table, taken }: { play: CardId; table: CardId[]; taken: CardId[] }) {
  const { settings } = useSettings();
  return (
    <div className="capture-demo">
      <MiniCards cards={[play]} cardStyle={settings.cardStyle} width={54} showIndex={settings.showIndex} />
      <span className="arrow" aria-hidden="true">➜</span>
      <span className="demo-table">
        {table.map((c) => (
          <span key={c} className={taken.includes(c) ? 'taken' : 'left'}>
            <MiniCards cards={[c]} cardStyle={settings.cardStyle} width={46} showIndex={settings.showIndex} highlight={taken} />
          </span>
        ))}
      </span>
    </div>
  );
}

function SeatingDiagram({ you, partner, opp }: { you: string; partner: string; opp: string }) {
  return (
    <svg viewBox="0 0 260 190" className="seating" role="img" aria-label="seating">
      <ellipse cx="130" cy="95" rx="70" ry="46" fill="#2f6b4a" stroke="#5a2d17" strokeWidth="6" />
      <path d="M176 122 A62 40 0 0 0 190 78" fill="none" stroke="#f2c230" strokeWidth="3" strokeLinecap="round" />
      <path d="M187 66 l5 14 l-13 -3 z" fill="#f2c230" />
      <path d="M84 68 A62 40 0 0 0 70 112" fill="none" stroke="#f2c230" strokeWidth="3" strokeLinecap="round" />
      <path d="M73 124 l-5 -14 l13 3 z" fill="#f2c230" />
      {[
        { x: 130, y: 172, label: you, cls: 'mate' },
        { x: 130, y: 20, label: partner, cls: 'mate' },
        { x: 232, y: 95, label: opp, cls: 'opp' },
        { x: 28, y: 95, label: opp, cls: 'opp' },
      ].map((s, i) => (
        <g key={i}>
          <rect x={s.x - 30} y={s.y - 13} width="60" height="26" rx="13" className={`seat-chip ${s.cls}`} />
          <text x={s.x} y={s.y + 4.5} textAnchor="middle" className="seat-chip-text">
            {s.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Rules() {
  const t = useT();
  const { settings } = useSettings();
  const s = t.howto.sections;
  const style = settings.cardStyle;
  const P = ({ lines }: { lines: readonly string[] }) => (
    <>
      {lines.map((l) => (
        <p key={l}>{l}</p>
      ))}
    </>
  );
  const prim: [string, number][] = [
    ['7', 21], ['6', 18], ['A', 16], ['5', 15], ['4', 14], ['3', 13], ['2', 12], [s.scoring.primieraFaces, 10],
  ];
  return (
    <div className="howto-body">
      <article>
        <h2>{s.intro.title}</h2>
        <P lines={s.intro.body} />
        <SeatingDiagram you={t.common.you} partner={t.setup.defaultPartner} opp={t.common.them} />
      </article>

      <article>
        <h2>{s.deck.title}</h2>
        <P lines={s.deck.body} />
        <div className="suit-row">
          {SUITS.map((suit, i) => (
            <span key={suit} className="suit-pill">
              <SuitIcon suit={suit} style={style} size={26} />
              {t.howto.glossary[9 + i]![0]}
            </span>
          ))}
        </div>
        <Example caption={s.deck.caption}>
          <MiniCards
            cards={[C('denari', 1), C('coppe', 7), C('spade', 8), C('bastoni', 9), C('denari', 10)]}
            cardStyle={style}
            width={52}
            showIndex={settings.showIndex}
          />
        </Example>
      </article>

      <article>
        <h2>{s.setup.title}</h2>
        <P lines={s.setup.body} />
      </article>

      <article>
        <h2>{s.capture.title}</h2>
        <P lines={s.capture.body} />
        <Example caption={s.capture.ex1}>
          <CaptureDemo play={C('coppe', 7)} table={[C('spade', 3), C('bastoni', 4), C('denari', 9)]} taken={[C('spade', 3), C('bastoni', 4)]} />
        </Example>
        <div className="callout">
          <h3>{s.capture.rule}</h3>
          <p>{s.capture.ruleBody}</p>
        </div>
        <Example caption={s.capture.ex2}>
          <CaptureDemo play={C('coppe', 7)} table={[C('spade', 7), C('spade', 3), C('bastoni', 4)]} taken={[C('spade', 7)]} />
        </Example>
        <ul>
          {s.capture.more.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </article>

      <article>
        <h2>{s.scopa.title}</h2>
        <P lines={s.scopa.body} />
        <Example caption={s.scopa.ex}>
          <CaptureDemo
            play={C('spade', 9)}
            table={[C('coppe', 2), C('denari', 4), C('bastoni', 3)]}
            taken={[C('coppe', 2), C('denari', 4), C('bastoni', 3)]}
          />
        </Example>
        <p>{s.scopa.lastCard}</p>
      </article>

      <article>
        <h2>{s.end.title}</h2>
        <P lines={s.end.body} />
      </article>

      <article>
        <h2>{s.scoring.title}</h2>
        <P lines={s.scoring.body} />
        <dl className="points-list">
          {s.scoring.items.map(([name, text]) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{text}</dd>
            </div>
          ))}
        </dl>
        <Example caption={t.howto.glossary[17]![1]!}>
          <MiniCards cards={[C('denari', 7)]} cardStyle={style} width={64} showIndex={settings.showIndex} />
        </Example>
        <h3>{s.scoring.primieraTitle}</h3>
        <p>{s.scoring.primieraBody}</p>
        <div className="prim-grid">
          {prim.map(([card, value]) => (
            <div key={card}>
              <b>{card}</b>
              <span>{value}</span>
            </div>
          ))}
        </div>
        <Example caption={s.scoring.primieraEx}>
          <MiniCards
            cards={[C('denari', 7), C('coppe', 7), C('spade', 6), C('bastoni', 1)]}
            cardStyle={style}
            width={50}
            showIndex={settings.showIndex}
          />
        </Example>
      </article>

      <article>
        <h2>{s.bonus.title}</h2>
        <P lines={s.bonus.body} />
        <p>{s.bonus.reBello}</p>
        <p>{s.bonus.napola}</p>
        <Example caption={s.bonus.napolaEx}>
          <MiniCards
            cards={[C('denari', 1), C('denari', 2), C('denari', 3), C('denari', 4)]}
            cardStyle={style}
            width={50}
            showIndex={settings.showIndex}
          />
        </Example>
      </article>

      <article>
        <h2>{s.win.title}</h2>
        <P lines={s.win.body} />
      </article>

      <article>
        <h2>{s.tips.title}</h2>
        <ol>
          {s.tips.body.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ol>
      </article>
    </div>
  );
}

function Glossary() {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="howto-body">
      <p className="caption">{t.howto.glossaryHint}</p>
      <div className="glossary">
        {t.howto.glossary.map(([term, def]) => (
          <div key={term} className={`term${open === term ? ' open' : ''}`}>
            <button type="button" aria-expanded={open === term} onClick={() => setOpen(open === term ? null : term!)}>
              {term}
            </button>
            {open === term && <p>{def}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function HowTo({ onBack }: { onBack: () => void }) {
  const t = useT();
  const [tab, setTab] = useState<'rules' | 'glossary'>('rules');
  return (
    <div className="screen howto">
      <ScreenHeader title={t.howto.title} onBack={onBack} />
      <div className="tabs">
        <Segmented
          options={[
            { value: 'rules', label: t.howto.tabs.rules },
            { value: 'glossary', label: t.howto.tabs.glossary },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>
      <div className="scroll">{tab === 'rules' ? <Rules /> : <Glossary />}</div>
    </div>
  );
}
