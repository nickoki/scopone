/**
 * Generates the PWA icons and the iOS launch (splash) images into public/.
 * Uses the Playwright/Chromium that is already on the machine:  npm run assets
 * The outputs are committed, so this only needs re-running if the artwork changes.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = (p) => join(root, 'public', p);
mkdirSync(out('icons'), { recursive: true });
mkdirSync(out('splash'), { recursive: true });

// The launch images use a flat background on purpose: gradients make multi-megabyte PNGs.
/** The emblem: a fanned pair of cards with a golden coin. Drawn in a 512 box. */
const emblem = `
  <g transform="rotate(-14 256 300)">
    <rect x="150" y="120" width="170" height="290" rx="18" fill="#f7ecd4" stroke="#3a2114" stroke-width="8"/>
    <g fill="#2f5d8a" stroke="#3a2114" stroke-width="5">
      <circle cx="205" cy="190" r="22"/><circle cx="265" cy="190" r="22"/>
      <circle cx="205" cy="340" r="22"/><circle cx="265" cy="340" r="22"/>
    </g>
  </g>
  <g transform="rotate(10 256 300)">
    <rect x="196" y="108" width="178" height="304" rx="19" fill="#fbf3df" stroke="#3a2114" stroke-width="8"/>
    <g transform="translate(285 260)">
      ${Array.from({ length: 12 }, (_, i) => `<path d="M0 -92 L13 -62 L-13 -62 Z" fill="#e0a526" stroke="#3a2114" stroke-width="4" stroke-linejoin="round" transform="rotate(${i * 30})"/>`).join('')}
      <circle r="64" fill="#f2c230" stroke="#3a2114" stroke-width="8"/>
      <circle r="44" fill="#fbf3df" stroke="#3a2114" stroke-width="6"/>
      <circle r="24" fill="#c0392b" stroke="#3a2114" stroke-width="6"/>
    </g>
  </g>`;

const iconSvg = (pad) => `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <radialGradient id="bg" cx="50%" cy="38%" r="75%">
      <stop offset="0" stop-color="#8a4a26"/><stop offset="0.6" stop-color="#5a2d17"/><stop offset="1" stop-color="#2a170d"/>
    </radialGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <g transform="translate(256 256) scale(${pad}) translate(-262 -262)">${emblem}</g>
</svg>`;

const splashHtml = `
<html><body style="margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;
  background:#3a1f12;font-family:Georgia,'Times New Roman',serif">
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="60 60 400 400" style="width:46vw;max-width:260px">${emblem}</svg>
  <div style="color:#f7ecd4;font-size:13vw;font-style:italic;font-weight:700;letter-spacing:.01em;margin-top:2vh;text-shadow:0 2px 0 rgba(0,0,0,.35)">Scopone</div>
  <div style="color:#e0a526;font-size:3.6vw;letter-spacing:.42em;text-transform:uppercase;margin-top:1vh;padding-left:.42em">scientifico</div>
</body></html>`;

// [css width, css height, device pixel ratio] — portrait iPhones.
export const SPLASH = [
  [320, 568, 2], [375, 667, 2], [414, 736, 3], [375, 812, 3], [414, 896, 2], [414, 896, 3],
  [390, 844, 3], [428, 926, 3], [393, 852, 3], [430, 932, 3], [402, 874, 3], [440, 956, 3], [420, 912, 3],
];

const browser = await chromium.launch();

async function shot(html, width, height, scale, file) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  await page.setContent(html);
  await page.screenshot({ path: out(file), type: 'png' });
  await ctx.close();
}

const iconPage = (svg) => `<html><body style="margin:0;width:100vw;height:100vh">${svg}</body></html>`;
await shot(iconPage(iconSvg(1.0)), 180, 180, 1, 'icons/apple-touch-icon.png');
await shot(iconPage(iconSvg(1.0)), 192, 192, 1, 'icons/icon-192.png');
await shot(iconPage(iconSvg(1.0)), 512, 512, 1, 'icons/icon-512.png');
await shot(iconPage(iconSvg(0.72)), 512, 512, 1, 'icons/icon-maskable-512.png');
writeFileSync(out('favicon.svg'), iconSvg(1.0).trim() + '\n');

for (const [w, h, r] of SPLASH) {
  await shot(splashHtml, w, h, r, `splash/splash-${w * r}x${h * r}.png`);
}
await browser.close();

// Print the <link> tags for index.html.
for (const [w, h, r] of SPLASH) {
  console.log(
    `<link rel="apple-touch-startup-image" media="screen and (device-width: ${w}px) and (device-height: ${h}px) and (-webkit-device-pixel-ratio: ${r}) and (orientation: portrait)" href="/splash/splash-${w * r}x${h * r}.png" />`,
  );
}
