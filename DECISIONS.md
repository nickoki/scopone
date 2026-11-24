# Decisions

Everything the brief left open, what was chosen and why. Limitations are listed where they apply and summarised at the end.

## Stack

| Decision | Why |
| --- | --- |
| Vite 8, React 19, TypeScript 7 (`strict`, plus `noUnusedLocals/Parameters`, `verbatimModuleSyntax`) | As requested; latest stable versions at build time. |
| `vite-plugin-pwa` (Workbox `generateSW`, `registerType: 'autoUpdate'`) | Generates the manifest and a precaching service worker with no hand-written SW code. A new version is fetched in the background and used on the next launch; no update prompt to interrupt a game. |
| No router, no state library, no CSS framework | The app is a handful of screens; a `useState` route and one stylesheet keep the bundle small (≈116 kB gzipped for the app, Supabase loaded lazily only when a room is opened). |
| System fonts only | Nothing to download, so text renders identically offline. Serif (Iowan/Palatino/Georgia) for headings, San Francisco for body. |
| Build target ES2022 | Aimed at iOS 16 and newer (it uses module workers and CSS `:has()`); older iPhones are not a target and were not considered. |

## Architecture

- **`src/engine` is pure TypeScript with no UI or browser imports.** vs Computer, pass-and-play, the online host, the AI search and the simulator all call the same functions. Capture resolution exists exactly once (`applyMoveMut`); `playMove` is the validating, immutable wrapper around it.
- **Cards are integers 0–39** (`suit * 10 + rank - 1`). States are plain JSON: cheap to clone for the AI, trivially serialisable for localStorage and the network.
- **Seeded RNG:** mulberry32. The whole generator state is one int32 stored in the match (`rngState`), so a saved game resumes with the same future deals and any game can be replayed from `(rules, seed)`. The first dealer is drawn from the seed.
- **Player views:** `viewFor(match, seats)` replaces every other hand with `-1` placeholders and strips the seed/RNG state. The UI only ever renders views, and the AI is only ever given a view of its own seat (it also re-masks its input defensively, and a unit test checks that swapping the hidden hands does not change its answer).
- **AI in a Web Worker** (`src/ai/worker.ts`, module worker). If the worker cannot start, the client falls back to the main thread with a smaller budget rather than hanging the game.
- **Display sequencing** (`useDisplay`): the real state may jump ahead instantly; the screen replays each change as one animation at a time (card lands on what it captures → cards slide to the pile; deal; lay-down). Input and the AI wait for the screen to catch up. If several states arrive at once (reconnect) it skips to the newest.

## Rules — choices where traditions differ

The requested rules are implemented as written. Points the brief did not settle:

| Topic | Decision |
| --- | --- |
| Seats and direction | Seats 0–3; partners are 0+2 and 1+3. "Counter-clockwise" = the turn passes to the player on your right (seat + 1), as at an Italian table. |
| Who leads | The player to the dealer's right. The dealer therefore plays the last card of the hand. The deal passes to the right each hand. First dealer is random (from the seed). |
| Must you capture? | Yes: if the card you play can capture, it must (you still choose *which* card to play, and which capture when several exist). This is the standard rule and is what "a card that captures nothing stays on the table" implies. |
| Rank match with two equal cards on the table | You take exactly one of them, and you choose which (it matters for Coins). |
| Classico: three or four Kings dealt to the table | The deal is void and redone (traditional rule: such a table can never be swept). The redeal continues the same seeded stream, so it stays reproducible. |
| Ace | No "asso piglia tutto" variant: an Ace is just a 1. |
| Primiera with a missing suit | The missing suit counts 0 and the totals are still compared ("the higher total wins"). Some circles require all four suits to compete; with 40 cards split between two teams this almost never changes the result. |
| Napola | Run of Coins from the Ace; 3 points for A-2-3, +1 per further consecutive card, capped at 10. Holding all ten Coins scores 10 points (some traditions award the whole game instead; not implemented). |
| Last-card scopa toggle | Named "L'ultima carta non fa scopa". On (default) = the sweep made by the very last card of the hand scores nothing. It affects only that single card; the cards still go to the capturing team. |
| Leftover cards when nobody captured in the whole hand | Practically impossible, but handled: they go to nobody. |
| End of game | Checked only at the end of a hand (no stopping mid-hand when a scopa reaches the target). At least one team at/over the target and unequal totals → higher total wins; equal totals → another hand. |
| Defaults | Scientifico, to 21, last-card rule on, Re bello off, Napola off. Rules live in Settings and are snapshotted into each new game; changing them never alters a game in progress. |

## AI

Three levels, selectable per seat. All of them see only what a human in that seat would see.

- **Facile** – uniformly random legal move, except that any move that clears the table is always taken.
- **Medio** – one-ply evaluation in "point" units: value of every captured card (card count, Coins, settebello, 7s/6s/Aces for primiera, Re bello and low Coins when those options are on), +1 for a scopa, a penalty for exposing a valuable card when laying down, and a penalty proportional to the chance that the next player can sweep what is left (table total ≤ 10). It has **no memory**: its odds use only its own hand and the table.
- **Difficile** – everything in Medio, plus:
  1. **Card tracking**: unseen cards = 40 − own hand − table − both capture piles; these are exactly the cards in the other three hands.
  2. **Inference**: a player who left a sweep on the table when one was available is assumed not to hold that rank. Sampling honours this where possible.
  3. **Exact sweep odds** for the opponent who plays next (hypergeometric over the unseen cards), so it does not leave easy scope.
  4. **Monte Carlo**: it samples possible deals of the unseen cards. For each deal every candidate move (the best six by the heuristic) is played out to the end of the hand with all four seats using the heuristic policy — so the partner's likely cards are played *for* the team, which is where setting the partner up comes from — and scored with the real scoring function. With three or fewer cards left per player the playout is replaced by an exact alpha-beta search of the sampled deal.
  5. The move with the best average point difference wins (the heuristic is a small tie-breaking prior).

**Timing.** In the app Difficile samples for a wall-clock budget of 480 ms (minimum 6 deals, maximum 400), off the main thread. Facile and Medio take well under 10 ms. Every computer move is padded to at least 650 ms ("Normal") or 200 ms ("Fast") so the play can be followed, and capture animations add ~1 s of their own. Total thinking time therefore stays at or under about one second per move. This was measured in headless Chromium on a server CPU, **not on a physical iPhone**; because the budget is time-based rather than iteration-based, a slower phone gets fewer samples, not a longer wait.

**Simulation results** (`npm run simulate`, 1,000 full games per matchup, target 11, cycling both variants and all rule toggles, team seating alternated every game, 30 sampled deals per Difficile decision):

| Matchup (A vs B) | Games | A wins | B wins | Avg. final score A / B | Moves checked | Violations |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Facile vs Facile | 1,000 | 49.4% | 50.6% | 10.50 / 10.46 | 97,036 | 0 |
| Medio vs Medio | 1,000 | 49.7% | 50.3% | 9.96 / 10.08 | 131,128 | 0 |
| Difficile vs Difficile | 1,000 | 52.5% | 47.5% | 10.24 / 10.01 | 123,820 | 0 |
| **Difficile vs Facile** | 1,000 | **99.9%** | 0.1% | 14.60 / 2.68 | 78,872 | 0 |
| Difficile vs Medio | 1,000 | 78.3% | 21.7% | 12.18 / 7.54 | 124,040 | 0 |
| Medio vs Facile | 1,000 | 98.3% | 1.7% | 14.17 / 3.43 | 86,052 | 0 |

6,000 games, 640,948 moves, no rule violations and no crashes. Difficile beat Facile in 999 of 1,000 games and Medio in 78%. Mirror matchups sit near 50%, as they should. The slowest single Difficile decision at this fixed sample count took 288 ms (with four simulator processes sharing four cores); the whole run took 6 min 35 s.

Known weaknesses: no long-range "spariglio" planning beyond what the playouts discover, no modelling of an opponent deliberately declining a sweep, and Medio-level opponents are assumed in playouts.

## Online play

**Backend: Supabase Realtime (Broadcast + Presence), nothing else.**

- Free tier, works from a static Vercel site with two public env vars, no server code to deploy, and no database schema, RLS policies or auth to maintain. Setup is "create a project, copy two values".
- Alternatives considered: Firebase Realtime Database (more setup, security rules to write, larger SDK), Ably/Pusher (also fine, but token auth needs a serverless function to be safe), PartyKit/Cloudflare Durable Objects (a proper authoritative server, but a second deployment target and more moving parts than the brief asks for).
- Cost of the choice: free Supabase projects pause after about a week of inactivity and must be restored from the dashboard (documented in the README).

**Model: host-authoritative, with end-to-end encrypted hands.**

A pure message relay cannot deal cards or validate moves, so one device must. The host's browser holds the only full copy of the match, validates every move with the rules engine, runs the AI seats and deals.

To still satisfy "players receive only their own hand":

- Every device has an ECDH P-256 key pair (WebCrypto, stored in localStorage). The player id is a hash of the public key.
- After each change the host sends every guest *their* view (own hand, public table, piles, scores), encrypted with AES-GCM under a key derived between host and that guest. Moves from guests are encrypted the same way, which also authenticates them.
- Other guests, anyone who guesses the room code, and Supabase itself only see ciphertext for hands and moves. This is verified by an automated test in which a third "eavesdropper" tab records every message in the room: none contained game data in clear.
- Only the lobby (names, seat assignments, rules, who is online) is sent in clear.

**Limitations of this model (accepted, documented):**

1. **The host can see everything in principle.** The host's device holds all four hands. The normal UI never shows them, but a host with modified client code could cheat. Removing this would need a real authoritative server (e.g. Supabase Edge Functions + Postgres with RLS, or a Durable Object).
2. **The host must stay connected.** If the host drops, guests see "the host has disconnected" and the game pauses. The host's room is saved on their device and can be reopened ("Reopen your room XXXXX") for 12 hours; guests reconnect automatically. There is no host migration.
3. **No protection against a guest impersonating the host** of a room they are in (they could announce themselves as host to newcomers). Friends-only games; out of scope.
4. **Room codes are not reserved server-side.** 5 characters from a 31-symbol alphabet (no 0/O/1/I/L) ≈ 28.6 million codes; two hosts picking the same code at the same time is possible but very unlikely.
5. **The Supabase transport has not been run against a live Supabase project from the build environment** (no network access to supabase.co). It is tested end to end against a local stand-in that speaks the same realtime wire protocol (channel join, heartbeats, presence, binary broadcasts): two isolated browser "phones" create and join a room, play, survive a failed first join, a server restart mid-game and a guest going offline. When the connection fails, the screen shows the server's reason under *Technical details* instead of spinning.

**Other online choices**

- Guests are auto-seated in the next free seat (East, North, West) on joining; the host can then tap any seat to put a player or a computer level there. Assigning a seated player to another seat swaps the two occupants. Seats 0+2 and 1+3 are the teams, so seating *is* team assignment. Extra people (5th onwards) can watch without seeing any hand.
- Only the host deals the next hand and starts a rematch; guests see "waiting for the host".
- **Disconnects:** when a seated player's presence disappears, the computer (Medio) plays their turns after a 5-second grace period, and the others see "X disconnected: the computer plays until they return". On return (same device → same key → same seat) the host immediately sends them the current state and they resume control. The same applies when iOS suspends the app in the background.
- **Reconnection** is left to the Supabase client, which rejoins a channel after errors and timeouts on its own; the app only builds a new channel when the old one is fully closed, and waits until it has been removed first (the client returns an existing channel with the same name). An earlier version tore channels down on every error and could loop forever, leaving guests stuck on "connecting".
- A development/test transport (`BroadcastChannel`, tabs of one browser) is built in. It is used automatically in `npm run dev` when Supabase is not configured, and never in a production build unless `VITE_ONLINE_TRANSPORT=local` is set.

## UI and interaction

- **Tap, then confirm.** Tap a card to select it (legal captures light up on the table, everything else dims), tap it again or press the button to play. When several captures are possible they are listed as chips and tapping a highlighted table card cycles through the options. Two taps prevent mis-plays on a phone; drag was optional and is not implemented.
- **Corner index** (rank + suit glyph, top-left) is on by default. Traditional Italian cards have no indices, which makes a fanned ten-card hand unreadable on a phone, and it helps players new to the deck (Fante = 8, Cavallo = 9, Re = 10). It can be switched off.
- **Layout:** your hand at the bottom, partner on top, opponents left and right, the turn passing to your right. All cards are absolutely positioned sprites moved with CSS transforms, so dealing, playing and capturing animate without layout work.
- **"Us/Them"** labels are relative to whoever is looking. In pass-and-play with people on both teams, and when watching an all-computer game, team labels use player names / "Team A/B" instead.
- **Pass-and-play privacy:** whenever a different person is up, an opaque "pass the phone to …" screen appears and the hand is only shown after tapping. A new hand always starts face down. With exactly one human on the device no pass screen is needed.
- **Any seat can be a person or a computer** in both local modes; four computers gives a spectator game.
- **Last trick:** the eye button shows the most recent capture (who played what and what it took) and the most recent play.
- **Tutorial:** offered once before the first local game, and available as a toggle in setup and in the in-game menu. It rings every card that can capture (pulsing if it can sweep) and a "coach" line explains the situation: forced rank match vs. sum, multiple options, scopa, what to avoid when laying down.
- **Sound** is synthesised with Web Audio (no audio files to cache). Mute is in the top bar and in Settings. iOS only allows sound after the first tap.
- **Card art:** original SVG drawings generated from shared geometry with per-style themes (palette, suit shapes, frames, backs; Piacentine court cards are double-headed). Suits keep the same dominant colour in all styles. Napoletane and Siciliane court figures share underlying figure geometry and differ in costume, proportions and palette rather than being fully separate drawings. Swords and clubs are laid out in clean countable rows rather than the traditional interlacing.
- **Language:** Italian if the device prefers Italian, otherwise English; overridable in Settings. Italian game terms (Scopa, Settebello, Primiera…) are kept in both languages and explained in the glossary.
- **Launch images:** flat background (gradients made 2–3 MB PNGs); 13 portrait iPhone sizes from the SE to the 17 Pro Max. They are not precached by the service worker (iOS reads them at install time).

## Persistence

`localStorage`, every access wrapped in try/catch (`src/state/storage.ts`); if storage is unavailable the game simply does not remember anything.

| Key | Content |
| --- | --- |
| `scopone.settings.v1` | Language, card style, index, sound, speed, rules, player name. Validated field by field on load. |
| `scopone.game.v1` | The unfinished local game (seats, full match incl. RNG state). Saved after every move, removed when the match ends or is abandoned. Leaving a game keeps it; "Resume game" appears on the home screen. |
| `scopone.identity.v1` | The device's key pair for online rooms. |
| `scopone.host.v1` / `scopone.guest.v1` | The last room hosted / joined, for reopening or rejoining (ignored after 12 hours). |

## What was verified, and how

- `npm test`: 90 unit tests pass.
- `npm run simulate`: results above; zero rule violations or crashes.
- `npm run build`: passes with no TypeScript errors.
- Headless Chromium (Playwright, iPhone-sized viewports 390×844 and 375×667) against the dev server and the production build: full local games to hand end and match end, tutorial, multiple-capture selection, pass-and-play, settings, rules and glossary, Italian and English device languages, resume after reload, **service worker offline** (reload and play against Difficile with the network off), and the online flow described above between tabs.

**Not verified:** behaviour on a physical iPhone / real Safari (safe-area insets, the installed-app shell, audio unlock, background suspension), and the Supabase transport against a live project. Both are written to the documented platform behaviour but should be smoke-tested once after deployment.
