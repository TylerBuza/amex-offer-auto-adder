/* Service worker: draws the toolbar icon on an OffscreenCanvas so we don't
 * need to ship binary PNG files. Runs once on install/startup.
 */

const SIZES = [16, 32, 48, 128];

function drawIcon(size) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size / 128; // scale from 128 design space

  // Rounded blue square background.
  const r = 20 * s;
  ctx.fillStyle = "#006fcf";
  roundRect(ctx, 0, 0, size, size, r);
  ctx.fill();

  // "AMEX" text (skip on tiny sizes where it'd be unreadable).
  if (size >= 32) {
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${30 * s}px Arial, Helvetica, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("AMEX", 64 * s, 40 * s);
  }

  // White circle + checkmark (the "added" badge).
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  const cy = size >= 32 ? 88 : 68;
  ctx.arc(64 * s, cy * s, (size >= 32 ? 24 : 42) * s, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "#006fcf";
  ctx.lineWidth = 7 * s;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.beginPath();
  const off = size >= 32 ? 0 : -20;
  ctx.moveTo(52 * s, (88 + off) * s);
  ctx.lineTo(60 * s, (97 + off) * s);
  ctx.lineTo(76 * s, (78 + off) * s);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function setIcon() {
  try {
    const imageData = {};
    for (const size of SIZES) imageData[size] = drawIcon(size);
    chrome.action.setIcon({ imageData });
  } catch (e) {
    console.log("[AmexAutoAdd] icon draw failed:", e);
  }
}

// ---- Animated "status wheel" on the toolbar icon --------------------------
// Draws a rotating arc over the blue square and advances it on a timer while a
// run is in progress. Stops (and restores the normal icon) when idle.
let spinTimer = null;
let spinAngle = 0;

function drawSpinnerIcon(size, angle) {
  const canvas = new OffscreenCanvas(size, size);
  const ctx = canvas.getContext("2d");
  const s = size / 128;

  // Blue rounded background (same as base icon).
  ctx.fillStyle = "#006fcf";
  roundRect(ctx, 0, 0, size, size, 20 * s);
  ctx.fill();

  // Track ring.
  const cx = 64 * s,
    cy = 64 * s,
    r = 40 * s;
  ctx.lineWidth = 12 * s;
  ctx.lineCap = "round";
  ctx.strokeStyle = "rgba(255,255,255,0.30)";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Rotating white arc (about 100°).
  ctx.strokeStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(cx, cy, r, angle, angle + Math.PI * 0.55);
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

function startSpin() {
  if (spinTimer) return;
  spinTimer = setInterval(() => {
    spinAngle += 0.5;
    try {
      const imageData = {};
      for (const size of SIZES) imageData[size] = drawSpinnerIcon(size, spinAngle);
      chrome.action.setIcon({ imageData });
    } catch (e) {
      /* ignore transient worker/canvas errors */
    }
  }, 90);
}

function stopSpin() {
  if (spinTimer) {
    clearInterval(spinTimer);
    spinTimer = null;
  }
  // Restore the packaged manifest icon (icons/*.png). Passing an empty
  // details object resets to the default_icon defined in the manifest.
  try {
    chrome.action.setIcon({ path: DEFAULT_ICON });
  } catch (_) {
    setIcon(); // fallback to the canvas-drawn icon
  }
}

const DEFAULT_ICON = {
  16: "icons/icon16.png",
  32: "icons/icon32.png",
  48: "icons/icon48.png",
  128: "icons/icon128.png",
};

// ---- Badge (count / status) -----------------------------------------------
function setBadge(text, color) {
  try {
    chrome.action.setBadgeBackgroundColor({ color: color || "#006fcf" });
    chrome.action.setBadgeText({ text: (text || "").toString().slice(0, 4) });
  } catch (_) {}
}

// Auto-clear a success/error badge after a while.
let badgeClearTimer = null;
function scheduleBadgeClear(ms) {
  clearTimeout(badgeClearTimer);
  badgeClearTimer = setTimeout(() => setBadge("", "#006fcf"), ms);
}

// ---- Single-offer enrollment (for the merchant "Add now" button) -----------
// The merchant heads-up runs on non-Amex sites and can't call Amex with your
// cookies. The service worker can (broad host_permissions + credentials).
const ENROLL_URL_BG =
  "https://functions.americanexpress.com/CreateOffersHubEnrollment.web.v1";

async function enrollOneOffer(token, offerId) {
  const res = await fetch(ENROLL_URL_BG, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      accountNumberProxy: token,
      offerId,
      locale: "en-US",
      enrollmentTrigger: "OFFERSHUB_TILE",
      requestType: "OFFERSHUB_ENROLLMENT",
      synchronizeOnly: false,
      offerUnencrypted: false,
    }),
  });
  if (!res.ok) return { ok: false, reason: "http_" + res.status };
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, reason: "not_logged_in" };
  }
  const ok =
    String((data.status && data.status.purpose) || "").toUpperCase() ===
    "SUCCESS";
  return { ok, reason: ok ? "" : "rejected" };
}

// ---- Messages from content scripts -----------------------------------------
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg) return;
  if (msg.type === "state") {
    if (msg.state === "run") startSpin();
    else stopSpin();
  } else if (msg.type === "badge") {
    setBadge(msg.text, msg.color);
    if (msg.text === "✓" || msg.text === "!") scheduleBadgeClear(8000);
  } else if (msg.type === "catalogUpdated") {
    registerMerchantNotice();
  } else if (msg.type === "enrollOne") {
    // Async: keep the message channel open with `return true`.
    enrollOneOffer(msg.token, msg.offerId)
      .then((r) => {
        if (r.ok) markEnrolledInCatalog(msg.offerId);
        sendResponse(r);
      })
      .catch((e) => sendResponse({ ok: false, reason: String(e && e.message) }));
    return true;
  }
});

// Flip an offer's cached "enrolled" flag after a successful Add-now.
function markEnrolledInCatalog(offerId) {
  try {
    chrome.storage.local.get({ offerCatalog: {} }, (res) => {
      const cat = res.offerCatalog || {};
      let changed = false;
      for (const host of Object.keys(cat)) {
        for (const e of cat[host]) {
          if (e.offerId === offerId && !e.enrolled) {
            e.enrolled = true;
            changed = true;
          }
        }
      }
      if (changed) chrome.storage.local.set({ offerCatalog: cat });
    });
  } catch (_) {}
}

// ---- Merchant heads-up content-script registration -------------------------
// Registers merchant-notice.js only on the domains present in the catalog,
// so it doesn't run on every site unnecessarily.
async function registerMerchantNotice() {
  try {
    const { offerCatalog, headsUpEnabled } = await new Promise((res) =>
      chrome.storage.local.get(
        { offerCatalog: {}, headsUpEnabled: true },
        res
      )
    );
    // Remove any previous registration first.
    try {
      await chrome.scripting.unregisterContentScripts({
        ids: ["amexMerchantNotice"],
      });
    } catch (_) {}

    const domains = Object.keys(offerCatalog || {});
    if (!headsUpEnabled || domains.length === 0) return;

    const matches = domains.map((d) => `*://*.${d}/*`);
    // Also match the bare domain (no subdomain).
    for (const d of domains) matches.push(`*://${d}/*`);

    await chrome.scripting.registerContentScripts([
      {
        id: "amexMerchantNotice",
        js: ["merchant-notice.js"],
        matches,
        runAt: "document_idle",
        persistAcrossSessions: true,
      },
    ]);
  } catch (e) {
    console.log("[AmexAutoAdd] registerMerchantNotice error:", e);
  }
}

// Only draw on real lifecycle events, each wrapped so a failure can never
// crash the service worker (which would make the toolbar action unresponsive).
chrome.runtime.onInstalled.addListener((details) => {
  try {
    setIcon();
  } catch (e) {
    console.log("[AmexAutoAdd] onInstalled icon error:", e);
  }
  // Enable "auto-add on visit" by default on a fresh install, without
  // overriding a choice the user has already made on updates/reloads.
  if (details && details.reason === "install") {
    try {
      chrome.storage.local.get(
        { enabled: null, headsUpEnabled: null },
        (res) => {
          const seed = {};
          if (res.enabled === null || res.enabled === undefined)
            seed.enabled = true;
          if (res.headsUpEnabled === null || res.headsUpEnabled === undefined)
            seed.headsUpEnabled = true;
          if (Object.keys(seed).length) chrome.storage.local.set(seed);
        }
      );
    } catch (e) {
      console.log("[AmexAutoAdd] default-enable error:", e);
    }
  }
  // A fresh manifest version is installed; clear any old update banner and
  // (re)schedule the background update checks.
  try {
    chrome.storage.local.remove(["updateInfo"]);
  } catch (_) {}
  scheduleUpdateChecks();
  checkForUpdate(true); // force one check right after install/update
  registerMerchantNotice(); // re-establish heads-up script on update/install
});
chrome.runtime.onStartup.addListener(() => {
  try {
    setIcon();
  } catch (e) {
    console.log("[AmexAutoAdd] onStartup icon error:", e);
  }
  checkForUpdate();
  registerMerchantNotice();
});

// ---- Update checker --------------------------------------------------------
// Periodically asks GitHub for the latest release. If it's newer than the
// installed version, stores update info (so the popup can show a banner) and
// fires a one-time desktop notification linking to the release.
const GITHUB_REPO = "TylerBuza/amex-offer-auto-adder";
const LATEST_RELEASE_API =
  "https://api.github.com/repos/" + GITHUB_REPO + "/releases/latest";
const RELEASES_PAGE = "https://github.com/" + GITHUB_REPO + "/releases/latest";
const UPDATE_ALARM = "amexAutoAdd_updateCheck";

// Compare dotted versions: returns true if `a` is strictly newer than `b`.
function isNewer(a, b) {
  const pa = String(a).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b).replace(/^v/i, "").split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000; // 12h

async function checkForUpdate(force) {
  try {
    // Rate-limit ourselves to at most once per 24h (across startups/alarms).
    if (!force) {
      const { lastUpdateCheck } = await new Promise((res) =>
        chrome.storage.local.get({ lastUpdateCheck: 0 }, res)
      );
      if (lastUpdateCheck && Date.now() - lastUpdateCheck < CHECK_INTERVAL_MS) {
        return;
      }
    }
    chrome.storage.local.set({ lastUpdateCheck: Date.now() });

    const current = chrome.runtime.getManifest().version;
    const res = await fetch(LATEST_RELEASE_API, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!res.ok) return; // no releases yet, rate-limited, offline, etc.
    const data = await res.json();
    const tag = data.tag_name || data.name || "";
    const latest = tag.replace(/^v/i, "");
    if (!latest) return;

    if (isNewer(latest, current)) {
      const url = data.html_url || RELEASES_PAGE;
      const info = {
        latest,
        current,
        url,
        notes: (data.body || "").slice(0, 400),
        checkedAt: Date.now(),
      };
      chrome.storage.local.set({ updateInfo: info });

      // Notify once per new version (avoid nagging every check).
      chrome.storage.local.get({ notifiedVersion: "" }, (r) => {
        if (r.notifiedVersion === latest) return;
        chrome.storage.local.set({ notifiedVersion: latest });
        try {
          chrome.notifications.create("amexAutoAdd_update_" + latest, {
            type: "basic",
            iconUrl: "icons/icon128.png",
            title: "Amex Offer Auto-Adder — update available",
            message: `Version ${latest} is out (you have ${current}). Click to view the release.`,
            priority: 1,
          });
        } catch (_) {}
      });
    } else {
      // Up to date: clear any stale banner.
      chrome.storage.local.remove("updateInfo");
    }
  } catch (_) {
    /* offline / transient — try again next alarm */
  }
}

// Clicking the notification opens the release page.
chrome.notifications.onClicked.addListener((id) => {
  if (id && id.startsWith("amexAutoAdd_update_")) {
    chrome.storage.local.get({ updateInfo: null }, (r) => {
      const url = (r.updateInfo && r.updateInfo.url) || RELEASES_PAGE;
      chrome.tabs.create({ url });
      try {
        chrome.notifications.clear(id);
      } catch (_) {}
    });
  }
});

// Schedule periodic checks (every 12h) and run one shortly after install.
function scheduleUpdateChecks() {
  try {
    chrome.alarms.create(UPDATE_ALARM, {
      delayInMinutes: 1,
      periodInMinutes: 720,
    });
  } catch (_) {}
}
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm && alarm.name === UPDATE_ALARM) checkForUpdate();
});
