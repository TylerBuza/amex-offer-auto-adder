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

// ---- Messages from content script ------------------------------------------
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg) return;
  if (msg.type === "state") {
    if (msg.state === "run") startSpin();
    else stopSpin();
  } else if (msg.type === "badge") {
    setBadge(msg.text, msg.color);
    // If it's a terminal state marker, clear it after a bit.
    if (msg.text === "✓" || msg.text === "!") scheduleBadgeClear(8000);
  }
});

// Only draw on real lifecycle events, each wrapped so a failure can never
// crash the service worker (which would make the toolbar action unresponsive).
chrome.runtime.onInstalled.addListener(() => {
  try {
    setIcon();
  } catch (e) {
    console.log("[AmexAutoAdd] onInstalled icon error:", e);
  }
});
chrome.runtime.onStartup.addListener(() => {
  try {
    setIcon();
  } catch (e) {
    console.log("[AmexAutoAdd] onStartup icon error:", e);
  }
});
