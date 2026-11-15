// Capture the actual packaged popup with fictional local data; no Amex login.
// Dependencies: playwright and sharp. Optional module paths as CLI arguments.
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const sharp = require(process.argv[3] || 'sharp');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist/store-assets');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1400 }, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  // Screenshot fixtures must never send requests to a real account or telemetry.
  await page.route(/^https?:/, (route) => route.abort());
  await page.addInitScript(() => {
    const now = Date.now();
    const common = {
      name: 'Example Coffee Co.', detail: 'Spend $50 or more, get $10 back.',
      expiry: '12/31/30', expiresAt: new Date(2030, 11, 31, 23, 59, 59).getTime(),
      domain: 'example.com', url: 'https://example.com',
    };
    const data = {
      theme: 'dark', enabled: true, headsUpEnabled: true, headsUpDismissed: {},
      catalogCount: 2, catalogUpdatedAt: now,
      offerList: [
        { ...common, token: 'fixture-a', offerId: 'fixture-one', card: 'Example Card A', enrolled: true },
        { ...common, token: 'fixture-b', offerId: 'fixture-one', card: 'Example Card B', enrolled: false },
        { ...common, name: 'Sample Store', token: 'fixture-a', offerId: 'fixture-two', card: 'Example Card A', enrolled: true },
      ],
      history: [
        { t: now - 60000, m: 'Sample Store', c: 'Example Card A' },
        { t: now, m: 'Example Coffee Co.', c: 'Example Card A' },
      ],
      lastRun: { at: now, added: 2, perCard: [{ name: 'Example Card A', added: 2 }] },
    };
    const changed = { addListener() {} };
    window.chrome = {
      storage: {
        onChanged: changed,
        local: {
          get(defaults, callback) {
            const result = { ...defaults, ...data };
            if (callback) callback(result);
            return Promise.resolve(result);
          },
          set(next) { Object.assign(data, next); return Promise.resolve(); },
        },
      },
      runtime: {
        onMessage: changed,
        sendMessage(_msg, callback) { callback?.({}); },
      },
      tabs: {
        query: async () => [{ id: 1, url: 'https://global.americanexpress.com/' }],
        sendMessage(_id, _msg, callback) { callback?.({ enabled: true, running: false }); },
      },
    };
  });
  await page.goto(pathToFileURL(path.join(root, 'dist/chrome-web-store/popup.html')).href);
  await page.locator('#hint').filter({ hasText: 'Connected to American Express' }).waitFor();
  assert.equal(await page.locator('#checkUpdate').count(), 0);
  const dashboard = await page.locator('body').screenshot({ omitBackground: true });
  await page.locator('#searchToggle').click();
  await page.locator('#offerSearch').fill('coffee');
  assert.equal(await page.locator('.offer').count(), 2);
  assert.equal(await page.locator('.offer-tag.added').count(), 1);
  assert.equal(await page.locator('.offer-tag.eligible').count(), 1);
  for (const el of await page.locator('.offer-head').all()) await el.click();
  assert.match(await page.locator('.offer').first().innerText(), /Added to: Example Card A/);
  assert.match(await page.locator('.offer').last().innerText(), /Available on: Example Card B/);
  await page.locator('.offer-head').last().click();
  const top = await page.locator('#searchToggle').boundingBox();
  const bottom = await page.locator('#searchWrap').boundingBox();
  const search = await page.screenshot({
    clip: { x: 0, y: top.y - 14, width: 280, height: bottom.y + bottom.height - top.y + 28 },
  });
  assert.deepEqual(errors, []);

  async function compose(name, image, title, lines) {
    const frame = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="800">
      <defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="#101e32"/><stop offset="1" stop-color="#203d60"/></linearGradient></defs>
      <rect width="1280" height="800" fill="url(#bg)"/>
      <circle cx="1100" cy="60" r="420" fill="#006fcf" opacity=".13"/>
      <text x="70" y="124" fill="#76bafa" font-family="Segoe UI,Arial" font-size="22" font-weight="600">AMEX OFFER AUTO-ADDER</text>
      <text x="70" y="238" fill="#ffffff" font-family="Segoe UI,Arial" font-size="42" font-weight="700">${title}</text>
      ${lines.map((text, i) => `<text x="70" y="${302 + i * 40}" fill="#c1d2e6" font-family="Segoe UI,Arial" font-size="23">${text}</text>`).join('')}
      <text x="70" y="700" fill="#90a8c4" font-family="Segoe UI,Arial" font-size="18">Independent extension by Tyler Buza · buza.dev</text>
      </svg>`);
    const resized = await sharp(image).resize({ width: 430, height: 700, fit: 'inside' }).png().toBuffer();
    const { width, height } = await sharp(resized).metadata();
    await sharp(frame).composite([{ input: resized, left: 770 + Math.floor((430 - width) / 2), top: Math.floor((800 - height) / 2) }])
      .removeAlpha().png().toFile(path.join(out, name));
  }
  await compose('01-dashboard.png', dashboard, 'Your offers, in one place.', [
    'Enroll eligible offers across your cards.',
    'Track additions and recent activity.',
    'Choose automatic or manual runs.',
  ]);
  await compose('02-offer-search.png', search, 'Find the offer. Check the card.', [
    'Search merchants and offer details.',
    'See added and eligible status per card.',
    'Keep different card offers separate.',
  ]);
  await sharp(path.join(root, 'store/icon128.png'))
    .png().toFile(path.join(out, 'store-icon-128.png'));
  console.log('Popup smoke checks passed; actual-UI screenshots and store icon: ' + out);
} finally {
  await browser.close();
}
