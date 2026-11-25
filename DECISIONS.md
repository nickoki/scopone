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
- **Cards keep a stable DOM order** (sorted by key, stacking via `z-index`) whatever zone they are in, and a card's entrance animation is removed once it has run. Re-inserting a card's element when it moved from the hand to the table used to restart its deal animation, so a card you played appeared to fly in from the dealer's seat instead of rising from your hand.

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

**Timing.** In the app Difficile samples for a wall-clock budget of 480 ms (minimum 6 deals, maximum 400), off the main thread. Facile and Medio take well under 10 ms. Every computer move is padded to at least 1.4 s ("Slow"), 650 ms ("Normal") or 200 ms ("Fast") so the play can be followed, and capture animations add ~1 s of their own. Total thinking time therefore stays at or under about one second per move. This was measured in headless Chromium on a server CPU, **not on a physical iPhone**; because the budget is time-based rather than iteration-based, a slower phone gets fewer samples, not a longer wait.

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
- Only the host deals the next hand and starts a rematch; guests see "waiting for the host". After each deal everyone presses Ready on their own device before the first card (see *Ready before each hand*).
- **Disconnects:** when a seated player's presence disappears, the computer (Medio) plays their turns after a 5-second grace period, and the others see "X disconnected: the computer plays until they return". On return (same device → same key → same seat) the host immediately sends them the current state and they resume control. The same applies when iOS suspends the app in the background.
- **Reconnection** is left to the Supabase client, which rejoins a channel after errors and timeouts on its own; the app only builds a new channel when the old one is fully closed, and waits until it has been removed first (the client returns an existing channel with the same name). An earlier version tore channels down on every error and could loop forever, leaving guests stuck on "connecting".
- A development/test transport (`BroadcastChannel`, tabs of one browser) is built in. It is used automatically in `npm run dev` when Supabase is not configured, and never in a production build unless `VITE_ONLINE_TRANSPORT=local` is set.

## Move accuracy and hand review

After every hand each person playing on the device gets a score out of 10 ("7,2" = 72% move accuracy) and can open a review that walks through their decisions, chess.com style.

**The information rule.** A score or an explanation may depend only on what that player could know at that moment: their own cards and the public record up to that move. This is enforced by construction, not by convention:

- The analysis never receives a game state. It receives a `Decision` (`src/analysis/positions.ts`): the player's own dealt cards, how many cards each seat was dealt, the dealer, the cards dealt face up, the public plays *before* this move, and the move itself. The record has no field in which another player's card or a later move could travel, and it is the only thing sent to the analysis worker.
- `positionOf` rebuilds the position from that record with every other hand filled with placeholders, and `analysePosition` masks the other hands once more before doing anything, so even a caller holding the real cards (a test, the calibration script) cannot leak them.
- The random deals are seeded from the player's own cards, the table and the public plays, so nothing hidden can reach the result through the random numbers either — and the same decision always gets the same verdict, mid-hand or reopened later.
- It is tested: a unit test and every decision in `npm run accuracy` are analysed from the full game state, from the player's own masked view, with the other three hands shuffled, and from the finished hand; the four results must be identical.
- What it *does* assume: the player remembers every card that has been played (that is the skill being measured), and the one inference the strongest AI also makes — a player who left an available sweep on the table probably does not hold that rank.

**How a move is judged.** For the position as the player saw it, many possible deals of the unseen cards are drawn; every legal move is played on the same deals and the hand is played out (the Difficile machinery: heuristic playouts, exact search in the last three rounds). A move's value is the average final point difference of the hand. Then:

- **Adaptive sampling.** 200 deals for every legal move, then batches of 200 (up to 2,400) for the moves that matter — the one played and up to four that could be the best — until the gap is known to about ±0.045 points, the move played is clearly the best, or it is unmistakably a blunder.
- **Exact when possible.** When the unseen cards can be dealt in at most 600 ways, every deal is played exactly once instead of sampling, so late-hand verdicts have no sampling error.
- **Loss** = value of the best move − value of the move played, measured without the "best of several noisy averages always looks better than it is" bias: the deals are split in two halves, the best move is chosen on one half and the gap measured on the other, and vice versa. The truly best move is therefore not charged for a rival's lucky half.
- **Two judges at the end of the hand.** In the last three rounds the engine solves each sampled deal with all four hands face up — perfect play that no player at the table could reproduce. A move is then also judged with ordinary playouts, and the *more lenient* of the two verdicts counts.
- **Benefit of the doubt.** The loss held against the player (*credited loss*) is the measured gap minus an allowance of 0.08 points, or one standard error if that is larger. The allowance is continuous, so two almost identical measurements never get very different verdicts.
- **No harsh verdict without a reason that can be shown.** If the review cannot point to a concrete fact (a missed scopa, a sweep left on the table with its odds, the settebello, a valuable card exposed…), the credited loss is limited to 0.4 — at worst an "Inaccuracy". The simulation alone is not trusted to call something a mistake. With a concrete fact, the charge is limited to three times what that fact accounts for (a reason must explain at least a third of what is charged). It is a limit, not a switch: with the same facts a larger measured loss is never charged less than a smaller one.
- **Winning the match beats the margin.** When the hand decides the match — it ends with this hand in at least 90% of the possible deals, whichever of the two moves is played — the moves are also compared on how often the match is won. A move that earns fewer points on average but is not behind any rival in match wins is charged at most 0.15 ("Good"), and the review says why. At any other score the match usually goes on, every point still counts, and the guard does nothing.
- **Nothing to get right.** When every legal move is within 0.05 points of the best, the decision is shown but not scored.
- **Accuracy of a decision** = 100 · e^(−(credited loss / 0.4)²). The curve is flat near zero and steep in the middle so the number agrees with the label: a "Good" move keeps at least 87%, an "Inaccuracy" at least 37%, a "Mistake" at least 2%, and a scopa handed over is worth next to nothing.
- **Score of the hand** = the average accuracy of the scored decisions, each weighted by what was at stake there (what an average choice among the legal moves would lose — and never less than what the move played did lose — clamped to 0.2–1.5), divided by 10. Trivial choices count a little, decisions that decide the hand count a lot. Forced moves, even decisions and moves the computer made for an absent player are not scored. The match figure is the same average over all the hands.
- **One marking scale on every device.** There is deliberately no lighter analysis for slow phones: fewer deals mean a larger margin of error, which the scoring forgives, so a cheaper analysis would be a more lenient marker.

**Classes** (credited loss in points): *Migliore / Best* 0 · *Buona / Good* ≤ 0.15 · *Imprecisione / Inaccuracy* ≤ 0.4 · *Errore / Mistake* ≤ 0.8 · *Errore grave / Blunder* above. *Finezza / Great find* is a best move where the obvious move (what the Medio heuristic would play at a glance) was worse by at least 0.5 points beyond doubt, according to both judges. *Obbligata / Forced* is unscored.

**Explanations.** Each option carries plain facts computed from the player's view: does it sweep, how many cards / Coins / Napola cards it puts in the pile, which sevens, the settebello or the Re bello it takes *from the table* (capturing with a valuable card already in hand is a different, smaller thing and is worded as "banking" it), what total it leaves on the table and how many cards that would sweep it are still unseen. Two kinds of numbers are shown, and both come from the very deals the verdict was computed on, so the explanation and the score cannot disagree about the odds:

- the chance that the *next player* holds the card that sweeps the table (the share of the sampled deals in which they do);
- what the playouts saw happen in the three plays before the player's next turn: the opponents sweeping, the partner sweeping, the settebello or a valuable laid card being taken.

Three guards keep an explanation honest: apart from certain, immediate points (a scopa, the settebello, the Re bello) it is dropped when the simulation's per-category split contradicts it; it must account for a real share of the loss charged (at least a third of it), so a detail worth a tenth of a point is never offered as the reason for a mistake that costs a whole one; and points already decided (one side has 21 cards or 6 Coins) are not mentioned. At most two reasons are shown. When there is a visible fact that is too small to explain the loss, it is still named — the player can see it on the table — followed by the admission that most of the difference comes later. With no fact at all, the review says that nothing is obvious on the spot and names the scoring category the simulation loses most in. It never says what another player *actually* held: that would read as using hidden cards.

The figure in the verdict ("about −1.4 points on average") is the gap as measured, the same number as in the list of moves below it. What is held against the player can be less (the benefit of the doubt, the limits above); when that changes the mark, the review says so in words: "…in the score this move counts as −0.4".

**Where it appears.**

- Hand-end screen: one line per person on the device (score ring, counts by class, "Review the hand"), pinned to the bottom with the Next-hand button so it never scrolls out of reach. A pending analysis never blocks the next hand.
- Review screen: for each decision — what the others played since your previous move, the table, your cards at that moment with the card played and the better card ringed, the verdict with the average points lost, the reasons, and every legal move ranked by how far behind the best it is ("≈ equal" when the difference is too small to count; "≈" before a number marks a rougher estimate, for moves the sampling gave up on early). Move strip, Previous/Next, swipe, arrow keys; it opens on the costliest decision. Earlier hands of the match can be reopened from the scoreboard and at match end, where the match accuracy is also shown.
- Nothing about a hand in progress is ever shown, and only finished hands can be opened: a grade is computed from the mover's hidden cards, so showing it mid-hand would leak information on a shared phone and coach the player everywhere else.
- Settings → "Move analysis" (also in the in-game menu) switches the whole thing off.

**Modes.** Vs computer: your moves. Pass-and-play: every person's moves, one line each at hand end and a switcher in the review (by then all cards are public). Online: each device analyses only its own seat from its own masked view; nothing is added to the network protocol and scores are not shared. Online, a move counts as yours only if this device recorded you tapping that very card at that point of the hand; moves the computer made for you while you were away are shown in the review but not scored.

**When it runs.** Incrementally during play, in a second Web Worker, one decision at a time. No analysis is started while a computer player is thinking: its strength depends on how much it can compute in a fixed time, so the review must not compete with it. A decision is queued as soon as its position can be rebuilt on this device; on a shared phone some have to wait for the end of the hand. If the worker cannot start, the very same analysis runs on the UI thread (slower, same marks).

**Persistence.** `scopone.reviews.v1` keeps the reviews per game, for up to three games side by side — the saved local game, a hosted room and a joined room can all be reopened, and opening one must not wipe the reviews of another. Per game at most 12 hands are kept; the whole record is held under 600,000 characters (least recently used games go first, then the oldest hands), because storage is shared with the saved game itself. Only what the review shows is kept (verdict, reasons, the list of moves): the working data of the analysis is dropped once the reasons are worked out, which makes a hand about 9 KB per person. Nothing is written until a game has something to remember. The record carries a version of the analysis, so verdicts from an older marking scale are never mixed with new ones (the note of which cards a player tapped themselves online is kept across versions and even while the feature is switched off: it cannot be worked out again). Online, the key naming the game is taken from the state actually on screen, so a rematch cannot file the last moves of the previous match under the new one. A local game is filed under its own random id, drawn independently of the deck's seed, so nothing kept with the reviews can be used to work out the cards.

**Paywall seam.** `src/state/entitlements.ts` is the only place that decides whether `accuracy` (the score) and `review` (the move-by-move review) are available; today it answers yes to both. When `accuracy` is locked nothing is computed or stored and no score line appears; when only `review` is locked the score is shown, its line is labelled "Premium" and opens a locked screen — the natural place for an offer. Adding payments means implementing that one function; nothing else needs to know about plans. Both locked states can be tried today with `window.__scoponeLocked = ['review']` (or `['accuracy']`) in the browser console, and were tested that way.

**Calibration and validation** (`npm run accuracy -- --hands 30`; the analysed seat plays at that level, the other three play Medio; every hand is analysed with a running match score, as in the app, cycling through 0–0, 9–7, 15–14, 19–12 and 12–19 to 21; 729 decisions):

| Level in the analysed seat | Hand score /10: mean (10th–90th pct) | Great find | Best | Good | Inaccuracy | Mistake | Blunder | Mean loss (points) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Facile | 5.9 (3.5–9.1) | 1% | 35% | 18% | 26% | 12% | 8% | 0.40 |
| Medio | 7.8 (5.8–10.0) | 0% | 60% | 15% | 19% | 4% | 2% | 0.20 |
| Difficile | 9.6 (9.2–10.0) | 6% | 77% | 9% | 7% | 1% | 0% | 0.05 |

- **The score ranks the levels**, with room at both ends (the random play of the browser tests typically scores 3 to 5). The review screen quotes these three figures as a yardstick.
- **Hidden-information check: pass.** Every one of the 729 decisions analysed from the full state, the player's own view, shuffled hidden hands and the finished hand gave identical results.
- **Precision:** standard error of a loss 0.030 points on average (90th percentile 0.063).
- **Repeatability** (same decisions, different sampled deals): a move's accuracy moves by 3.0 points of 100 on average (90th percentile 11), a hand's score by 0.23 of 10 (90th percentile 0.6).
- **Time per decision:** 0.24 s on average, 0.55 s at the 90th percentile, 1.6 s at worst (server CPU, shared with other jobs).
- **Explanations:** of 162 decisions measured as costing at least 0.3 points, 98 (60%) came with a concrete reason; the others are limited to "Inaccuracy" as described above.
- **Match guard:** applied to 0 of 438 decisions at 0–0, 9–7 and 15–14, to 8 of 146 at 19–12 and to 20 of 145 at 12–19 — only where the hand decides the match.
- The constants were chosen with the script's what-if table: a tighter curve or no limit separates the levels more but punishes on the simulation's word alone; a looser one squeezes everybody towards 10.

**Independent review.** Before release the feature was reviewed by five independent reviewers (information leaks, statistics, truthfulness of the explanations, state and storage, the interface on phone-sized screens), each finding then challenged by a second reviewer. What they found, all fixed and covered by tests where a test can cover it:

- The match guard was armed by a single sampled deal in which the match ended, so from mid-match on it forgave real blunders. It now needs the match to end with the hand in at least 90% of the deals.
- The limit on unexplained losses was a switch: with the same facts a larger measured loss could be charged less than a smaller one. It is now a limit tied to what the reasons account for.
- The verdict showed the charged figure while the list of moves showed the measured one for the same move; "≈ equal" could label a move the list ranked well behind.
- "You could have taken the settebello / a seven" was said about cards played from the player's own hand; the settebello could be counted again as "a seven"; Italian percentages lacked elision ("nell'8%", "nello 0%"); a computer-played move was headed "Forced".
- One storage slot for all games: opening another game wiped the reviews (and, online, the note of which moves were the player's own) of a game that could still be resumed. An online rematch started while analyses were pending could file the previous match's moves under the new one.
- The id of a local game in the stored reviews was a reversible function of the deck's seed.
- Smaller things: the calibration script did not pass the match score (so it never exercised the guard), the "great find" label could rest on the open-card search alone, the hand switcher's arrows were never disabled, the pinned accuracy line covered the running total on an iPhone SE with every optional scoring row on.

**Limitations.**

- The "best move" is the opinion of a playout engine that assumes sensible but unsophisticated play from everyone and no signalling conventions. A strong player's deliberate convention play can be marked down. The noise allowance, the lenient second judge and the unexplained-loss cap reduce this; they do not remove it.
- Simple playouts overstate what a slip costs when everyone afterwards plays well: in a check during development, with the rest of the hand played by the strongest AI, losses in the first seven rounds came out at roughly 40–75% of the predicted figure (and about in full in the last three rounds). No blanket correction is applied (a factor of 0.7 would show a missed scopa as 0.7 of a point); the allowance and the cap absorb part of it.
- Outside the match-deciding guard above, the engine maximises the expected points of the hand, not the chance of winning the match.
- A hand has at most ten decisions, so one hand's score is a coarse number (see the repeatability figure above); the match figure is steadier.
- Only the people on the device are analysed, not the computer players or remote opponents.
- Timings were measured on a server CPU, not on a phone.

## UI and interaction

- **Tap or slide, then confirm.** Tap a card to select it (legal captures light up on the table, everything else dims), then press the button to play it. You can also hold and slide across the hand: the card under your thumb rises (with its captures previewed on the table) and the one you lift off is selected. Tapping the selected card again puts it back; a card is never played by tapping or dragging it. Sliding also works when it is not your turn, just to look at your cards — nothing is selected then. When several captures are possible they are listed as chips and tapping a highlighted table card cycles through the options.
- **Ready before each hand.** After every deal nobody plays until each person has pressed **Pronto / Ready**, so everyone can study their cards first. Computer seats are always ready. On a shared phone (pass-and-play) each person takes the phone, looks and readies in turn, with the first to play going last so the phone ends up in the right hands. Online, each player readies on their own device and the host only starts when all are in; a player who is disconnected does not hold the table up (the computer covers for them as usual). The gate is not saved: reopening a game before the first card asks again.
- **Game speed:** Slow, Normal or Fast (Settings and the in-game menu). It scales every card movement, the deal, how long a capturing card rests on what it takes, and the pause before a computer move. Slow is roughly twice as long as Normal. Online, each device animates at its own speed, and the host's setting paces the computer's moves for the whole table.
- **Large numbers** (Settings and the in-game menu, off by default) for players who need bigger text: the corner index on every card is drawn 1.75× larger (the artwork shrinks to make room) and the last-play markers, seat labels and pile counts grow. It switches the corner index on, since that is where the value is shown.
- **Each player's last action** is shown next to their seat (yours sits above the status line): the card they played and, after an arrow, what it captured; a card on its own was laid on the table. It is replaced the next time that player plays and cleared at each new hand, so at most one action per player is visible and nothing older can be read back — counting cards is still up to you. The eye button's "last trick" stays as the traditional peek at the most recent capture.
- **Corner index** (rank + suit glyph, top-left) is on by default. Traditional Italian cards have no indices, which makes a fanned ten-card hand unreadable on a phone, and it helps players new to the deck (Fante = 8, Cavallo = 9, Re = 10). It can be switched off.
- **Layout:** your hand at the bottom, partner on top, opponents left and right, the turn passing to your right. The opponents' capture pile is top-left; yours is at the right end of the status row, next to your hand. All cards are absolutely positioned sprites moved with CSS transforms, so dealing, playing and capturing animate without layout work.
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
| `scopone.reviews.v1` | The move reviews of up to three games (at most 12 hands each, under 600,000 characters in all), with the analysis version. Each game is filed under an id unrelated to its deck. |

## What was verified, and how

- `npm test`: 128 unit tests pass.
- `npm run simulate`: results above; zero rule violations or crashes.
- `npm run build`: passes with no TypeScript errors.
- Headless Chromium (Playwright, iPhone-sized viewports 390×844 and 375×667) against the dev server and the production build: full local games to hand end and match end, tutorial, multiple-capture selection, pass-and-play, settings, rules and glossary, Italian and English device languages, resume after reload, **service worker offline** (reload and play against Difficile with the network off), and the online flow described above between tabs.
- Move accuracy and review, in the same headless browser: a hand against the computer (the score appears with the hand-end screen, the review opens on the costliest decision and steps through every move, in Italian and English), pass-and-play (one line per person, switcher in the review, nothing shown mid-hand, a reload resumes), online between tabs (host and guest each see only their own score; moves the computer played for an absent player are marked and unscored; nothing new on the wire), both locked states of the paywall seam, the small-screen layout (iPhone SE size, Classico with every optional scoring row: the running total stays visible above the pinned accuracy line; the verdict and the list of moves state the same figure on every decision), reviews of a local game surviving a detour through an online room, and — on the production build with the network off — a whole hand followed by its accuracy and review.

**Not verified:** behaviour on a physical iPhone / real Safari (safe-area insets, the installed-app shell, audio unlock, background suspension), and the Supabase transport against a live project. Both are written to the documented platform behaviour but should be smoke-tested once after deployment.
