# Scopone

The Italian card game **Scopone** (Scientifico and Classico) as an installable web app for iPhone.
Open the link, tap **Add to Home Screen**, and it behaves like a native app: full screen, offline, no browser bars.

- **vs Computer** – any seat can be a person or an AI (Facile / Medio / Difficile, chosen per seat).
- **Pass-and-play** – 2–4 people on one phone, with a "pass the phone" screen between turns.
- **Online room** – the host creates a 5-character code, friends join with it; AIs fill empty seats and cover for anyone who drops.
- Italian and English, three original card styles (Napoletane, Piacentine, Siciliane), illustrated rules, glossary, guided tutorial.

Design choices and their reasons are in [DECISIONS.md](./DECISIONS.md).

## Contents

1. [Local development](#local-development)
2. [Backend setup (Supabase, free tier)](#backend-setup-supabase-free-tier)
3. [Deploying to Vercel](#deploying-to-vercel)
4. [Adding the app to the iPhone home screen](#adding-the-app-to-the-iphone-home-screen)
5. [Tests and the AI simulator](#tests-and-the-ai-simulator)
6. [Project layout](#project-layout)

## Local development

Requires Node 20 or newer.

```bash
npm install
npm run dev          # http://localhost:5173
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run build` | Type-check (`tsc -b`) and build the production bundle + service worker into `dist/` |
| `npm run preview` | Serve `dist/` locally (use this to try the service worker / offline mode) |
| `npm test` | Unit tests (Vitest) |
| `npm run simulate` | 1,000 AI-vs-AI games per matchup with an independent rule checker |
| `npm run assets` | Regenerate icons and iOS splash screens (needs Playwright's Chromium; outputs are committed) |

Everything except online rooms works with no configuration.

**Online rooms in development.** With no Supabase variables set, `npm run dev` uses a built-in test transport: rooms work **between tabs of the same browser** (no server). To develop against the real backend, copy `.env.example` to `.env.local` and fill in the two values described below.

To test on a real phone on your Wi-Fi run `npm run dev -- --host` and open the printed network URL. Note that online rooms and the service worker need HTTPS (or `localhost`), so use a Vercel preview deployment to try those on a phone.

## Backend setup (Supabase, free tier)

Online play uses **Supabase Realtime** (Broadcast + Presence) only. There are **no database tables, no SQL, no auth users and no server code** to set up; the app just needs a project to relay messages through.

1. Go to <https://supabase.com>, sign up (free) and click **New project**.
   - Choose any name, a database password (not used by this app; keep it somewhere safe anyway) and the region closest to your players.
   - Plan: **Free**.
2. Wait for the project to finish provisioning (a minute or two).
3. Open **Project Settings → API** (in newer dashboards: **Project Settings → Data API** for the URL and **API Keys** for the key) and copy:
   - **Project URL**, e.g. `https://abcdefghijklmnop.supabase.co`
   - the **anon / public** key (a long `eyJ…` token) *or* the newer **publishable** key (`sb_publishable_…`). Either works. **Never use the `service_role` / secret key.**
4. Open **Realtime → Settings** and check that the Realtime service is enabled and that **public access to channels is allowed** (this is the default for new projects). The app uses public channels; if you turn this off, nobody can join a room.
5. Put the two values in your environment:

   ```bash
   # .env.local (local development) — and the same two names in Vercel
   VITE_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
   ```

That is the whole backend.

**Shortcut on Vercel:** instead of steps 1–5 you can add the **Supabase integration** from your Vercel project (Storage / Integrations → Supabase). It creates `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (or `…_PUBLISHABLE_KEY`), and the app reads those too, so nothing else needs to be set. Only the `NEXT_PUBLIC_SUPABASE_*` values reach the browser; the integration's secret/service-role keys are never bundled. Redeploy after connecting it. Step 4 (Realtime enabled, public channels allowed) still applies.

Things to know about the free tier (as documented by Supabase at the time of writing; check their pricing page for current numbers):

- **Free projects are paused after about a week without activity.** If rooms suddenly stop connecting, open the Supabase dashboard and press **Restore project**. Local modes are unaffected.
- Realtime quotas are roughly 200 simultaneous connections, 100 messages per second and 2 million messages per month. A full game uses a few hundred small messages, so this is ample for games among friends.

Both values are public by design (they ship in the browser bundle). The game does not rely on them for secrecy: each player's hand is end-to-end encrypted between that player and the host (see DECISIONS.md → *Online play*).

## Deploying to Vercel

**From the dashboard**

1. Push this repository to GitHub.
2. In Vercel: **Add New… → Project**, import the repository. Vercel detects **Vite**; the defaults are right (`npm run build`, output `dist`). `vercel.json` also pins them and sets cache headers for the service worker.
3. Under **Environment Variables** add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (Production and Preview).
4. **Deploy**.

**From the command line**

```bash
npm i -g vercel
vercel link
vercel env add VITE_SUPABASE_URL
vercel env add VITE_SUPABASE_ANON_KEY
vercel --prod
```

Notes

- `VITE_*` variables are baked in at build time. After changing them, **redeploy**.
- Without the two variables the site still deploys and every local mode works; the Online screen explains that online play is not configured.
- Updates: the service worker fetches a new version in the background and switches to it on the next launch. If you want to be sure, close the app from the app switcher and open it again.

## Adding the app to the iPhone home screen

1. Open the site's URL in **Safari** on the iPhone.
2. Tap the **Share** button (the square with an arrow).
3. Scroll down and tap **Add to Home Screen**, then **Add**.
4. Launch **Scopone** from the home screen icon. It opens full screen with its own splash screen.

Good to know

- Open the app **once while online** after installing so it can cache itself; after that, vs Computer, Pass-and-play, the rules and settings all work offline (airplane mode included).
- The home-screen app has its own storage: settings and an unfinished game saved in Safari do not carry over, and vice versa.
- A shared room link (`https://your-site/?room=ABCDE`) opens in Safari, not in the installed app. In the installed app, go to **Online room** and type the 5-character code instead.
- iOS suspends web apps in the background. If you switch away during an online game the computer covers your seat after a few seconds and you take it back automatically when you return.

## Tests and the AI simulator

```bash
npm test
```

94 unit tests cover: capture rules (including rank-match-first and mandatory capture), every scoring category and its tie, Napola run lengths 3–10, primiera values and ties, the last-card scopa toggle, the end-of-game rules (target reached, both past the target, exact tie), dealing, turn order, player views, the AI levels (legal play, no peeking, card tracking, inference) and the online encryption.

```bash
npm run simulate                       # 1,000 games per matchup
npm run simulate -- --games 200        # quicker
npm run simulate -- --samples 60       # more Monte Carlo deals per Difficile decision
```

The simulator plays full matches headlessly, cycling through both variants and every rule toggle. After **every move** a checker written independently of the engine (brute-force capture enumeration, card conservation, turn order, scopa bookkeeping, re-computed hand scores and winner) verifies the result; any violation or crash makes the script exit non-zero. The latest results are recorded in DECISIONS.md.

## Project layout

```
src/
  engine/     Pure rules engine (no UI): cards, seeded RNG, dealing, captures, scoring, match flow
  ai/         Facile / Medio / Difficile, the Web Worker and its main-thread client
  game/       Controllers shared by the UI: display sequencing, local (vs computer / pass-and-play) games
  online/     Encryption, transports (Supabase / same-browser test), host and guest sessions
  cards/      Original SVG card art in three regional styles
  ui/         React screens and components
  i18n/       Italian and English text
  state/      Settings and localStorage helpers
  audio/      Synthesised sound effects
scripts/
  simulate.ts     Headless AI-vs-AI simulator with rule checker
  gen-assets.mjs  Icon and splash-screen generator
public/           Icons, favicon, iOS splash screens
```
