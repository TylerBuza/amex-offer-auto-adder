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

  // Recent list (newest first, up to 15).
  const recent = document.getElementById("recent");
  recent.innerHTML = "";
  const items = history.slice(-15).reverse();
  if (items.length === 0) {
    recent.innerHTML = '<div class="empty">No offers added yet.</div>';
  } else {
    for (const h of items) {
      const div = document.createElement("div");
      div.className = "item";
      const name = document.createElement("span");
      name.className = "m";
      name.textContent = h.m || "Offer added";
      name.title = h.c ? `${h.m} — ${h.c}` : h.m || "";
      const when = document.createElement("span");
      when.className = "when";
      when.textContent = timeAgo(h.t);
      when.title = fullTime(h.t);
      div.appendChild(name);
      div.appendChild(when);
      recent.appendChild(div);
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
    if (link) link.href = updateInfo.url;
    banner.style.display = "flex";
  } else {
    banner.style.display = "none";
  }
}

async function refresh() {
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
  hint.textContent = "Ready on Amex (works from any page, incl. dashboard).";
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

runNow.addEventListener("click", async () => {
  const tab = await activeTab();
  if (!onAmex(tab)) return;
  await chrome.storage.local.set({ enabled: true });
  // API mode works from any Amex page — just tell the content script to run.
  tell(tab.id, { type: "setEnabled", value: true });
  tell(tab.id, { type: "runNow" });
  refresh();
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

// Kick off, but never let a startup failure freeze the popup.
refresh().catch((e) => console.log("[AmexAutoAdd] refresh failed:", e));
