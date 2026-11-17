// Capture the real reminder script over a fictional, locally served storefront.
// No merchant or Amex requests are made.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.argv[2] || 'playwright');
const root = fileURLToPath(new URL('../', import.meta.url));
const out = path.join(root, 'dist/store-assets');
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'msedge', headless: true });
try {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await context.route('**/*', route => {
    if (route.request().url() !== 'https://shop.example.com/') return route.abort();
    return route.fulfill({ contentType: 'text/html', body: `<!doctype html>
      <html><head><meta charset="utf-8"><style>
      *{box-sizing:border-box}body{margin:0;color:#182d34;background:#f5f3ed;font-family:Arial,sans-serif}
      .intro{height:185px;background:#14263e;color:#fff;padding:30px 48px}
      .intro small{color:#77baff;font-size:14px;letter-spacing:2px;font-weight:bold}
      .intro h1{font-size:36px;margin:14px 0 10px;letter-spacing:-.6px}
      .intro p{color:#bdcde0;font-size:18px;margin:0}
      nav{padding:25px 48px;display:flex;justify-content:space-between;border-bottom:1px solid #deded4;font-size:14px}
      nav b{letter-spacing:1.3px}nav span{color:#617472}
      main{padding:40px 48px;display:grid;grid-template-columns:1fr 1fr;gap:60px}
      .photo{background:#dce4d9;border-radius:18px;height:420px;display:flex;align-items:center;justify-content:center}
      .bag{width:200px;height:285px;background:#e4caa3;border-radius:9px 9px 18px 18px;box-shadow:14px 20px 30px #20372d29;transform:rotate(-7deg);border-top:18px solid #cdb18b;display:flex;align-items:center;justify-content:center}
      .label{background:#244e46;width:150px;padding:24px 10px;color:#fff;text-align:center}
      .label small{font-size:10px;letter-spacing:1px}.label strong{display:block;font-size:23px;line-height:1.3;margin:16px 0}
      .product small{color:#536b61;letter-spacing:2px}.product h2{font-size:40px;margin:16px 0}
      .product p{line-height:1.7;color:#61736d;max-width:400px}.price{font-size:24px;margin:18px 0}
      .buy{display:inline-block;padding:16px 34px;background:#244e46;color:#fff;border-radius:6px}
      .foot{padding:0 48px;color:#76837d;font-size:13px}
      </style></head><body>
      <header class="intro"><small>MERCHANT-SITE OFFER REMINDERS</small><h1>Shopping here? Check your Amex Offer.</h1><p>See the deal and its card right on a matching merchant's website.</p></header>
      <nav><b>EXAMPLE COFFEE CO.</b><span>Shop coffee &nbsp; / &nbsp; Our story &nbsp; / &nbsp; Your bag</span></nav>
      <main><div class="photo"><div class="bag"><div class="label"><small>EXAMPLE COFFEE CO.</small><strong>DAILY<br>BLEND</strong><small>WHOLE BEAN · 12 OZ</small></div></div></div>
      <div class="product"><small>FRESHLY ROASTED</small><h2>Your daily ritual.</h2><p>A balanced coffee for slow mornings.<br>Chocolate notes. Smooth finish.</p><div class="price">$18.00</div><div class="buy">Add to bag</div></div></main>
      <div class="foot">Independent extension by Tyler Buza · buza.dev</div></body></html>` });
  });
  await page.addInitScript(() => {
    const state = {
      headsUpEnabled: true, headsUpDismissed: {}, theme: 'dark',
      offerCatalog: { 'example.com': [{
        name: 'Example Coffee Co.', detail: 'Spend $50 or more, get $10 back.',
        card: 'Example Card', expiry: 'Expires 12/31/30',
        expiresAt: new Date(2030, 11, 31).getTime(),
        token: 'fictional-account', offerId: 'fictional-offer', enrolled: false, confidence: 5,
      }] },
    };
    window.chrome = {
      storage: { local: {
        get(defaults, cb) { cb({ ...defaults, ...state }); },
        set(next) { Object.assign(state, next); },
      } },
      runtime: { sendMessage(_message, cb) { cb({ ok: true }); } },
    };
  });
  await page.goto('https://shop.example.com/');
  await page.addScriptTag({ content: await readFile(path.join(root, 'merchant-notice.js'), 'utf8') });
  const notice = page.locator('#amex-merchant-notice');
  await notice.waitFor({ state: 'visible' });
  await page.waitForFunction(() => getComputedStyle(document.querySelector('#amex-merchant-notice')).opacity === '1');
  assert.match(await notice.innerText(), /Amex Offer available/);
  assert.match(await notice.innerText(), /Spend \$50 or more, get \$10 back/);
  await page.screenshot({ path: path.join(out, '00-merchant-reminder.png') });
  await page.locator('.amn-x').click();
  await page.locator('.amn-session').click();
  await notice.waitFor({ state: 'detached' });
  assert.equal(await page.evaluate(() => sessionStorage.getItem('amexHeadsUpDismissed')), 'example.com');
  assert.deepEqual(errors, []);
  console.log('Actual reminder screenshot captured; matching and session-dismissal checks passed.');
} finally { await browser.close(); }
