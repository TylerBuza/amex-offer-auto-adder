// Build an upload folder containing only the Chrome Web Store runtime files.
// ZIP the contents of dist/chrome-web-store, not the enclosing directory.
import { readFile, writeFile, mkdir, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Script } from 'node:vm';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = path.join(root, 'dist/chrome-web-store');
const read = async (name) => (await readFile(path.join(root, name), 'utf8')).replace(/\r\n/g, '\n');
function replaceOnce(text, before, after) {
  if (text.split(before).length !== 2) throw new Error(`Build marker missing or duplicated: ${before}`);
  return text.replace(before, after);
}
function cut(text, from, to, replacement = '') {
  const start = text.indexOf(from);
  const end = text.indexOf(to, start + from.length);
  if (start < 0 || end < 0) throw new Error(`Build section not found: ${from}`);
  return text.slice(0, start) + replacement + text.slice(end);
}

const manifest = JSON.parse(await read('manifest.json'));
manifest.permissions = ['storage', 'scripting'];
// Host access is necessary for matching locally cached offers on merchant sites.
// It also provides tab URL access for the Amex popup without the tabs permission.
manifest.update_url = 'https://clients2.google.com/service/update2/crx';
manifest.minimum_chrome_version = '109';
manifest.description = 'Add eligible Amex Offers across your cards, search saved offers, and see merchant reminders. Independent tool by Tyler Buza.';

let background = await read('background.js');
background = cut(background, '  } else if (msg.type === "checkUpdateNow") {',
  '  } else if (msg.type === "enrollOne") {');
background = replaceOnce(background, '  scheduleUpdateChecks();\n', '');
background = replaceOnce(background, '  checkForUpdate(true); // force one check right after install/update\n', '');
background = replaceOnce(background, '  checkForUpdate();\n', '');
const updateMarker = '// ---- Update checker';
if (!background.includes(updateMarker)) throw new Error('Update checker marker missing');
background = background.slice(0, background.indexOf(updateMarker));

let popup = await read('popup.js');
popup = cut(popup, 'async function renderUpdateBanner()', 'async function renderHeadsUp()');
popup = replaceOnce(popup, '  try {\n    await renderUpdateBanner();\n  } catch (e) {\n    console.log("[AmexAutoAdd] update banner failed:", e);\n  }\n', '');
popup = cut(popup, 'checkUpdateBtn.addEventListener("click",', 'clearBtn.addEventListener("click",');
popup = replaceOnce(popup, 'const checkUpdateBtn = $("checkUpdate");\n', '');
popup = replaceOnce(popup, 'const updateStatus = $("updateStatus");\n', '');

let html = await read('popup.html');
html = cut(html, '    <div class="update-banner"', '    <div class="body">');
html = cut(html, '      <div class="update-row">', '      <div class="credit">',
  '      <div class="update-note">Updates are managed by Chrome Web Store.</div>\n\n');
html = replaceOnce(html, '        by <b>Tyler Buza</b> ·',
  '        Independent extension · by <b>Tyler Buza</b> ·');

for (const [name, code] of [['background.js', background], ['popup.js', popup]]) {
  new Script(code, { filename: name });
  if (/chrome\.(downloads|notifications|alarms)|api\.github\.com|downloadUpdate|checkForUpdate/.test(code)) {
    throw new Error(`External updater remains in ${name}`);
  }
}
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const name of ['content.js', 'merchant-notice.js', 'LICENSE', 'icons']) {
  await cp(path.join(root, name), path.join(output, name), { recursive: true });
}
await cp(path.join(root, 'store/icon128.png'), path.join(output, 'icons/icon128.png'));
for (const [name, content] of [
  ['manifest.json', JSON.stringify(manifest, null, 2) + '\n'],
  ['background.js', background], ['popup.js', popup], ['popup.html', html],
]) await writeFile(path.join(output, name), content);
console.log(`Chrome Web Store v${manifest.version}: ${output}`);
