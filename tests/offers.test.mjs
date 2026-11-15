import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = (file) => readFileSync(new URL('../' + file, import.meta.url), 'utf8');
function section(text, start, end) {
  const a = text.indexOf(start), b = text.indexOf(end, a);
  assert.ok(a >= 0 && b > a);
  return text.slice(a, b);
}
const offer = (token, offerId, enrolled) => ({
  token, offerId, enrolled, name: 'Example Shoes', detail: 'Spend $50, get $10',
  card: 'Example Card ' + token,
});

for (const prefix of ['', 'firefox/', 'dist/chrome-web-store/']) {
  test(prefix + 'search never infers identity or enrollment from offer descriptions', () => {
    const context = vm.createContext({});
    vm.runInContext(section(source(prefix + 'popup.js'), 'function dedupeOffers(', 'function renderOffers('), context);
    const input = [offer('a', 'one', true), offer('b', 'one', false), offer('a', 'two', false)];
    const result = context.dedupeOffers(input);
    assert.equal(result.length, 3);
    assert.equal(result[1].enrolled, false);
    assert.deepEqual(Array.from(result[0].cards), ['Example Card a']);
    const repeated = context.dedupeOffers([offer('a', 'one', false), offer('a', 'one', true)]);
    assert.equal(repeated.length, 1);
    assert.equal(repeated[0].enrolled, true);
    assert.equal(context.dedupeOffers([offer('', '', false), offer('', '', true)]).length, 2);
    assert.equal(input[1].enrolled, false);
  });

  test(prefix + 'single enrollment updates both caches only for the intended account and offer', async () => {
    let data = { offerList: [offer('a', 'one', false), offer('b', 'one', false), offer('a', 'two', false)] };
    data.offerCatalog = { 'example.com': structuredClone(data.offerList) };
    const context = vm.createContext({ chrome: { storage: { local: {
      get: async () => structuredClone(data),
      set: async (next) => { data = { ...data, ...next }; },
    } } } });
    vm.runInContext(section(source(prefix + 'background.js'), 'async function markEnrolledInCatalog(', '// ---- Merchant heads-up'), context);
    await context.markEnrolledInCatalog('a', 'one');
    for (const list of [data.offerList, data.offerCatalog['example.com']]) {
      assert.deepEqual(list.map((o) => o.enrolled), [true, false, false]);
    }
  });

  test(prefix + 'bulk run marks successful enrollments and preserves rejected offers as eligible', async () => {
    const catalog = {}, offerList = [];
    const context = vm.createContext({
      running: false, enabled: true, stats: {}, catalog, offerList,
      CFG: { maxEnroll: 10, maxRetries: 0, minDelay: 0, maxDelay: 0 },
      updateBadge() {}, pushStats() {}, log() {}, setBadge() {}, recordAdd() {}, saveCatalog() {},
      Overlay: { show() {}, update() {}, finish() {} },
      chrome: { storage: { local: { set() {} } }, runtime: { sendMessage() {} } },
      fetchCards: async () => [{ token: 'a', name: 'Example Card A' }, { token: 'b', name: 'Example Card B' }],
      fetchEligibleOffers: async () => [{ offerId: 'one' }], fetchAddedOffers: async () => [],
      offerKey: (o) => o.offerId, offerName: () => 'Example Shoes',
      enrollOffer: async (token) => ({ ok: token === 'a' }), isEnrollSuccess: (r) => r.ok,
      rand: () => 0, sleep: async () => {},
      addToCatalog(o, card, enrolled) {
        const entry = { ...o, token: card.token, enrolled };
        offerList.push(entry);
        (catalog['example.com'] ||= []).push({ ...entry });
      },
    });
    vm.runInContext(section(source(prefix + 'content.js'), 'async function run()', '// Ask the background'), context);
    await context.run();
    assert.deepEqual(offerList.map((o) => o.enrolled), [true, false]);
    assert.deepEqual(catalog['example.com'].map((o) => o.enrolled), [true, false]);
    assert.equal(context.stats.failed, 0);
    assert.equal(context.stats.added, 1);
  });
}

test('store background starts with only declared APIs and has no external updater', () => {
  const listeners = [];
  const event = { addListener: (fn) => listeners.push(fn) };
  const context = vm.createContext({ chrome: {
    runtime: { onMessage: event, onInstalled: event, onStartup: event },
  } });
  vm.runInContext(source('dist/chrome-web-store/background.js'), context);
  assert.equal(listeners.length, 3);
  const manifest = JSON.parse(source('dist/chrome-web-store/manifest.json'));
  assert.deepEqual(manifest.permissions, ['storage', 'scripting']);
  assert.ok(manifest.update_url.startsWith('https://clients2.google.com/'));
  assert.doesNotMatch(source('dist/chrome-web-store/background.js'), /chrome\.(downloads|notifications|alarms)|api\.github\.com/);
});
