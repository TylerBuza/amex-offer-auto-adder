// Never let a missing element throw and kill the whole popup script.
function $(id) {
  return (
    document.getElementById(id) || {
      style: {},
      classList: { add() {}, remove() {} },
      addEventListener() {},
      textContent: "",
      checked: false,
      disabled: false,
    }
  );
}
const toggle = $("toggle");
const runNow = $("runNow");
const dot = $("dot");
const statusText = $("statusText");
const hint = $("hint");
const clearBtn = $("clear");
const headsUpToggle = $("headsUpToggle");
const cacheInfo = $("cacheInfo");
const offerSearch = $("offerSearch");
const offerResults = $("offerResults");
const searchToggle = $("searchToggle");
const searchWrap = $("searchWrap");
const searchChev = $("searchChev");
const offerTotalCount = $("offerTotalCount");
const checkUpdateBtn = $("checkUpdate");
const updateStatus = $("updateStatus");
const themeBtn = $("themeBtn");

// ---- Theme (auto / light / dark) -------------------------------------------
// Cycles: auto (follows OS) -> light -> dark -> auto.
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "light" || theme === "dark") {
    root.setAttribute("data-theme", theme);
  } else {
    root.removeAttribute("data-theme"); // auto = follow prefers-color-scheme
  }
  if (themeBtn) {
    const label =
      theme === "light"
        ? "☀ Light"
        : theme === "dark"
        ? "🌙 Dark"
        : "🅰 Auto";
    themeBtn.textContent = label;
    themeBtn.title = "Theme: " + (theme || "auto") + " — click to change";
    themeBtn.setAttribute("data-mode", theme || "auto");
  }
}

// Apply saved theme ASAP to avoid a flash.
try {
  chrome.storage.local.get({ theme: "auto" }, (r) => applyTheme(r.theme));
} catch (_) {
  applyTheme("auto");
}

if (themeBtn) {
  themeBtn.addEventListener("click", () => {
    chrome.storage.local.get({ theme: "auto" }, (r) => {
      const next =
        r.theme === "auto" ? "light" : r.theme === "light" ? "dark" : "auto";
      chrome.storage.local.set({ theme: next });
      applyTheme(next);
    });
  });
}

async function activeTab() {
  try {
    const [tab] = await chrome.tabs.query({
      active: true,
      currentWindow: true,
    });
    return tab;
  } catch {
    return null;
  }
}
function onAmex(tab) {
  return (
    tab && tab.url && tab.url.startsWith("https://global.americanexpress.com/")
  );
}

// Fire-and-forget message that never rejects/hangs the popup.
function tell(tabId, msg) {
  try {
    chrome.tabs.sendMessage(tabId, msg, () => void chrome.runtime.lastError);
  } catch {}
}
// Ask with a hard timeout so the popup can never freeze waiting.
function ask(tabId, msg, timeoutMs = 1200) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(null);
      }
    }, timeoutMs);
    try {
      chrome.tabs.sendMessage(tabId, msg, (resp) => {
        void chrome.runtime.lastError;
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(resp || null);
        }
      });
    } catch {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(null);
      }
    }
  });
}

// ---- Time helpers ----------------------------------------------------------
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function startOfWeek() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // Monday = 0
  d.setDate(d.getDate() - day);
  return d.getTime();
}
function startOfMonth() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
}

function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return m + "m ago";
  const h = Math.floor(m / 60);
  if (h < 24) return h + "h ago";
  const days = Math.floor(h / 24);
  if (days < 7) return days + "d ago";
  return new Date(ts).toLocaleDateString();
}
function fullTime(ts) {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

// Safe storage getter with timeout so the popup never hangs on storage.
function getStorage(defaults, timeoutMs = 1000) {
  return new Promise((resolve) => {
    let done = false;
    const t = setTimeout(() => {
      if (!done) {
        done = true;
        resolve(defaults);
      }
    }, timeoutMs);
    try {
      chrome.storage.local.get(defaults, (res) => {
        void chrome.runtime.lastError;
        if (!done) {
          done = true;
          clearTimeout(t);
          resolve(res || defaults);
        }
      });
    } catch {
      if (!done) {
        done = true;
        clearTimeout(t);
        resolve(defaults);
      }
    }
  });
}

// ---- Stats render ----------------------------------------------------------
async function renderStats() {
  const { history = [] } = await getStorage({ history: [] });
  const today = startOfToday();
  const week = startOfWeek();
  const month = startOfMonth();

  let cToday = 0,
    cWeek = 0,
    cMonth = 0;
  for (const h of history) {
    if (h.t >= today) cToday++;
    if (h.t >= week) cWeek++;
    if (h.t >= month) cMonth++;
  }

  document.getElementById("s-today").textContent = cToday;
  document.getElementById("s-week").textContent = cWeek;
  document.getElementById("s-month").textContent = cMonth;
  document.getElementById("s-all").textContent = history.length;

  const last = history[history.length - 1];
  document.getElementById("lastAdded").textContent = last
    ? `${fullTime(last.t)} (${timeAgo(last.t)})`
    : "never";

  // Recent list (newest first, up to 15). Each item is clickable to expand
  // details (pulled from the offer catalog when available).
  const recent = document.getElementById("recent");
  recent.innerHTML = "";
  const items = history.slice(-15).reverse();
  if (items.length === 0) {
    recent.innerHTML = '<div class="empty">No offers added yet.</div>';
  } else {
    for (const h of items) {
      const wrap = document.createElement("div");
      wrap.className = "recent-item";

      const row = document.createElement("div");
      row.className = "item recent-row";
      const name = document.createElement("span");
      name.className = "m";
      name.textContent = h.m || "Offer added";
      name.title = h.c ? `${h.m} — ${h.c}` : h.m || "";
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = timeAgo(h.t);
      when.title = fullTime(h.t);
      row.appendChild(name);
      row.appendChild(when);

      // Details, filled from the catalog lookup on the offer name.
      const det = document.createElement("div");
      det.className = "recent-details";
      const match = findOfferByName(h.m);
      const detailText = match && match.detail ? match.detail : "";
      const card = h.c || (match && match.card) || "";
      const expiry = match && match.expiry ? match.expiry : "";
      const expText = expiry
        ? /^expires/i.test(expiry.trim())
          ? expiry.trim()
          : "Expires " + expiry.trim()
        : "";
      const link =
        match && match.url
          ? `<a class="offer-link" href="${escapeHtml(match.url)}" target="_blank" rel="noopener">${escapeHtml(match.domain)}</a>`
          : "";
      det.innerHTML = `
        <div>${escapeHtml(detailText) || "Added " + fullTime(h.t)}</div>
        <div class="meta">${card ? "Added to: " + escapeHtml(card) : ""}${
        expText ? " · " + escapeHtml(expText) : ""
      }</div>
        ${link}`;

      row.addEventListener("click", () => wrap.classList.toggle("open"));
      wrap.appendChild(row);
      wrap.appendChild(det);
      recent.appendChild(wrap);
    }
  }

  document.getElementById("total").textContent =
    history.length + " total added";

  // Per-card breakdown from the most recent run.
  const wrap = document.getElementById("lastRunWrap");
  const perCardEl = document.getElementById("perCard");
  const lastRun = (await getStorage({ lastRun: null })).lastRun;
  if (wrap && perCardEl) {
    if (lastRun && lastRun.perCard && lastRun.perCard.length) {
      perCardEl.innerHTML = "";
      for (const c of lastRun.perCard) {
        const div = document.createElement("div");
        div.className = "item";
        const n = document.createElement("span");
        n.className = "m";
        n.textContent = c.name;
        n.title = c.name;
        const v = document.createElement("span");
        v.className = "when";
        v.textContent = "+" + c.added;
        div.appendChild(n);
        div.appendChild(v);
        perCardEl.appendChild(div);
      }
      wrap.style.display = "";
    } else {
      wrap.style.display = "none";
    }
  }
}

// ---- Live state ------------------------------------------------------------
function renderLive(state) {
  toggle.checked = !!state.enabled;
  dot.className = "dot" + (state.running ? " run" : state.enabled ? " on" : "");
  statusText.textContent = state.running
    ? "Running…"
    : state.enabled
    ? "Enabled"
    : "Disabled";
}

async function renderUpdateBanner() {
  const banner = document.getElementById("updateBanner");
  if (!banner) return;
  const { updateInfo } = await getStorage({ updateInfo: null });
  if (updateInfo && updateInfo.latest) {
    const verEl = document.getElementById("updateVer");
    const curEl = document.getElementById("currentVer");
    const link = document.getElementById("updateLink");
    if (verEl) verEl.textContent = "v" + updateInfo.latest;
    if (curEl) curEl.textContent = "v" + updateInfo.current;
    if (link) link.textContent = updateInfo.assetUrl ? "Download" : "View";
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

// Download the new zip (or open the release page as a fallback).
const updateLinkBtn = document.getElementById("updateLink");
if (updateLinkBtn) {
  updateLinkBtn.addEventListener("click", () => {
    updateLinkBtn.disabled = true;
    updateLinkBtn.textContent = "Downloading…";
    try {
      chrome.runtime.sendMessage({ type: "downloadUpdate" }, (resp) => {
        void chrome.runtime.lastError;
        updateLinkBtn.disabled = false;
        if (resp && resp.downloaded) {
          updateLinkBtn.textContent = "✓ Saved";
          const span = document.querySelector("#updateBanner span");
          if (span)
            span.textContent =
              "Downloaded. Unzip it, then reload the extension at chrome://extensions.";
        } else if (resp && resp.opened) {
          updateLinkBtn.textContent = "Opened";
        } else {
          updateLinkBtn.textContent = "Download";
        }
      });
    } catch (_) {
      updateLinkBtn.disabled = false;
      updateLinkBtn.textContent = "Download";
    }
  });
}

async function renderHeadsUp() {
  const { headsUpEnabled, catalogCount, catalogUpdatedAt, headsUpDismissed } =
    await getStorage({
      headsUpEnabled: true,
      catalogCount: 0,
      catalogUpdatedAt: 0,
      headsUpDismissed: {},
    });
  headsUpToggle.checked = headsUpEnabled !== false;

  cacheInfo.textContent = "";
  if (catalogCount > 0) {
    const ago = catalogUpdatedAt ? " · updated " + timeAgo(catalogUpdatedAt) : "";
    cacheInfo.appendChild(
      document.createTextNode(`${catalogCount} merchant offer(s) cached${ago}`)
    );
  } else {
    cacheInfo.appendChild(
      document.createTextNode(
        "Run once to cache offers, then get a heads-up on merchant sites."
      )
    );
  }

  // Offer a reset if any sites were hidden "forever".
  const hiddenCount = Object.keys(headsUpDismissed || {}).length;
  if (hiddenCount > 0) {
    cacheInfo.appendChild(document.createElement("br"));
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = `Reset ${hiddenCount} hidden site(s)`;
    link.style.color = "#006fcf";
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await chrome.storage.local.set({ headsUpDismissed: {} });
      try {
        chrome.runtime.sendMessage({ type: "catalogUpdated" });
      } catch (_) {}
      renderHeadsUp();
    });
    cacheInfo.appendChild(link);
  }
}

async function refresh() {
  try {
    await renderHeadsUp();
  } catch (e) {
    console.log("[AmexAutoAdd] headsUp render failed:", e);
  }
  try {
    await renderUpdateBanner();
  } catch (e) {
    console.log("[AmexAutoAdd] update banner failed:", e);
  }
  try {
    await renderStats();
  } catch (e) {
    console.log("[AmexAutoAdd] renderStats failed:", e);
  }
  const tab = await activeTab();
  const stored = await getStorage({ enabled: false });
  if (!onAmex(tab)) {
    renderLive({ enabled: stored.enabled, running: false });
    runNow.disabled = true;
    hint.textContent = "Not on americanexpress.com. Open the offers page first.";
    return;
  }
  runNow.disabled = false;
  hint.textContent =
    "Connected to American Express. Ready to add offers from any page.";
  const state = await ask(tab.id, { type: "getState" });
  if (state) {
    renderLive(state);
  } else {
    renderLive({ enabled: stored.enabled, running: false });
    hint.textContent = "Reload the Amex tab to activate the extension.";
  }
}

// ---- Events ----------------------------------------------------------------
toggle.addEventListener("change", async () => {
  const value = toggle.checked;
  await chrome.storage.local.set({ enabled: value });
  const tab = await activeTab();
  if (onAmex(tab)) tell(tab.id, { type: "setEnabled", value });
  refresh();
});

headsUpToggle.addEventListener("change", async () => {
  const value = headsUpToggle.checked;
  await chrome.storage.local.set({ headsUpEnabled: value });
  // Ask the service worker to (un)register the merchant heads-up script.
  try {
    chrome.runtime.sendMessage({ type: "catalogUpdated" });
  } catch (_) {}
});

runNow.addEventListener("click", async () => {
  const tab = await activeTab();
  if (!onAmex(tab)) return;
  await chrome.storage.local.set({ enabled: true });
  // API mode works from any Amex page — just tell the content script to run.
  tell(tab.id, { type: "setEnabled", value: true });
  tell(tab.id, { type: "runNow" });
  refresh();
});



checkUpdateBtn.addEventListener("click", () => {
  checkUpdateBtn.disabled = true;
  updateStatus.textContent = "Checking…";
  try {
    chrome.runtime.sendMessage({ type: "checkUpdateNow" }, (resp) => {
      void chrome.runtime.lastError;
      checkUpdateBtn.disabled = false;
      if (resp && resp.updateInfo && resp.updateInfo.latest) {
        updateStatus.textContent =
          "Update available: v" + resp.updateInfo.latest;
        renderUpdateBanner(); // show the banner at the top too
      } else {
        updateStatus.textContent = "You're up to date";
        setTimeout(() => {
          updateStatus.textContent = "Auto-checks every 12 hours";
        }, 4000);
      }
    });
  } catch (_) {
    checkUpdateBtn.disabled = false;
    updateStatus.textContent = "Auto-checks every 12 hours";
  }
});

clearBtn.addEventListener("click", async () => {
  if (!confirm("Clear all added-offer history?")) return;
  await chrome.storage.local.set({ history: [] });
  renderStats();
});

// Live updates while a run is in progress.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "stats") {
    dot.className = "dot" + (msg.running ? " run" : " on");
    statusText.textContent = msg.running ? "Running…" : "Enabled";
    renderStats(); // history was just updated in storage
  } else if (msg.type === "state") {
    dot.className = "dot" + (msg.state === "run" ? " run" : " on");
    statusText.textContent = msg.state === "run" ? "Running…" : "Idle";
  }
});

// Re-render stats if storage changes while popup is open.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.history) renderStats();
  });
} catch {}

// ---- Offer search ----------------------------------------------------------
let allOffers = []; // flat list from the last run (added + eligible)

function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])
  );
}

// Look up a cached offer by (approximate) merchant name, for Recent details.
function findOfferByName(name) {
  if (!name || !Array.isArray(allOffers)) return null;
  const n = name.trim().toLowerCase();
  return (
    allOffers.find((o) => (o.name || "").trim().toLowerCase() === n) ||
    allOffers.find((o) => (o.name || "").trim().toLowerCase().startsWith(n)) ||
    null
  );
}

// Merge duplicate offers (same name+detail) across cards into one entry.
function dedupeOffers(list) {
  const map = new Map();
  for (const o of list) {
    const key = (o.name || "") + "|" + (o.detail || "");
    if (!map.has(key)) {
      map.set(key, { ...o, cards: [o.card], enrolled: o.enrolled });
    } else {
      const e = map.get(key);
      if (o.card && !e.cards.includes(o.card)) e.cards.push(o.card);
      e.enrolled = e.enrolled || o.enrolled;
    }
  }
  return [...map.values()];
}

function renderOffers(query) {
  const q = (query || "").trim().toLowerCase();
  let list = dedupeOffers(allOffers);
  if (q) {
    list = list.filter(
      (o) =>
        (o.name || "").toLowerCase().includes(q) ||
        (o.detail || "").toLowerCase().includes(q) ||
        (o.domain || "").toLowerCase().includes(q)
    );
  }
  // Sort: added first, then alphabetical by name.
  list.sort((a, b) => {
    if (!!b.enrolled !== !!a.enrolled) return b.enrolled ? 1 : -1;
    return (a.name || "").localeCompare(b.name || "");
  });

  offerResults.innerHTML = "";
  if (allOffers.length === 0) {
    offerResults.innerHTML =
      '<div class="empty">Run once to load your offers, then search here.</div>';
    return;
  }
  if (list.length === 0) {
    offerResults.innerHTML = '<div class="empty">No matching offers.</div>';
    return;
  }

  const count = document.createElement("div");
  count.className = "search-count";
  count.textContent =
    list.length + (q ? " match" + (list.length === 1 ? "" : "es") : " offers");
  offerResults.appendChild(count);

  const shown = list.slice(0, 200); // cap for performance
  for (const o of shown) {
    const el = document.createElement("div");
    el.className = "offer";
    const tag = o.enrolled
      ? '<span class="offer-tag added">Added</span>'
      : '<span class="offer-tag eligible">Eligible</span>';
    const cards = (o.cards || [o.card]).filter(Boolean).join(", ");
    const link = o.url
      ? `<a class="offer-link" href="${escapeHtml(o.url)}" target="_blank" rel="noopener">${escapeHtml(o.domain)}</a>`
      : "";
    // Amex's expiry text sometimes already starts with "Expires"; don't double it.
    let expiryText = "";
    if (o.expiry) {
      expiryText = /^expires/i.test(o.expiry.trim())
        ? o.expiry.trim()
        : "Expires " + o.expiry.trim();
    }
    el.innerHTML = `
      <div class="offer-head">
        <span class="offer-name">${escapeHtml(o.name)}</span>
        ${tag}
      </div>
      <div class="offer-details">
        <div>${escapeHtml(o.detail) || "No details available."}</div>
        <div class="meta">${o.enrolled ? "Added to" : "Available on"}: ${escapeHtml(cards)}${
          expiryText ? " · " + escapeHtml(expiryText) : ""
        }</div>
        ${link}
      </div>`;
    // Toggle details on click (but let link clicks pass through).
    el.querySelector(".offer-head").addEventListener("click", () =>
      el.classList.toggle("open")
    );
    offerResults.appendChild(el);
  }
}

async function loadOffers() {
  const { offerList } = await getStorage({ offerList: [] });
  allOffers = Array.isArray(offerList) ? offerList : [];
  // Show the total count next to the collapsed header.
  const uniq = dedupeOffers(allOffers).length;
  if (offerTotalCount)
    offerTotalCount.textContent = uniq ? "(" + uniq + ")" : "";
  renderOffers(offerSearch.value || "");
}

let searchOpen = false;
function setSearchOpen(open) {
  searchOpen = open;
  searchWrap.style.display = open ? "block" : "none";
  searchToggle.classList[open ? "add" : "remove"]("open");
  if (searchChev) searchChev.textContent = open ? "▾" : "▸";
  if (open) offerSearch.focus();
}

searchToggle.addEventListener("click", () => setSearchOpen(!searchOpen));

offerSearch.addEventListener("input", () => renderOffers(offerSearch.value));

// Keep the list fresh if a run updates the offers while the popup is open.
try {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.offerList) loadOffers();
  });
} catch {}

loadOffers();

// Kick off, but never let a startup failure freeze the popup.
refresh().catch((e) => console.log("[AmexAutoAdd] refresh failed:", e));
