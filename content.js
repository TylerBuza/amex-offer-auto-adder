/* Amex Offer Auto-Adder — content script (API mode)
 *
 * Instead of clicking DOM buttons on the offers page, this talks directly to
 * Amex's own internal offers API using your logged-in session cookies. That
 * means it works from ANY Amex page (dashboard included), needs no scrolling,
 * and enrolls every eligible offer across all your cards — fast.
 *
 * Personal-use automation of your own logged-in account. These are
 * undocumented internal endpoints; Amex may change them or rate-limit. The
 * code stops immediately on any throttling/blocked response.
 */

(() => {
  "use strict";

  // ---- Endpoints -------------------------------------------------------------
  const MEMBER_URL = "https://global.americanexpress.com/api/servicing/v1/member";
  const READ_OFFERS_URL =
    "https://functions.americanexpress.com/ReadOffersHubPresentation.web.v1";
  const ENROLL_URL =
    "https://functions.americanexpress.com/CreateOffersHubEnrollment.web.v1";
  const LOCALE = "en-US";

  // ---- Tunables --------------------------------------------------------------
  const CFG = {
    minDelay: 250, // ms between offers (fast; bump up if throttled)
    maxDelay: 700,
    maxPages: 20, // eligible-offer pages to walk per card
    maxRetries: 2, // retries on transient (5xx / network) errors
    retryMin: 300,
    retryMax: 600,
    maxEnroll: 1000, // safety cap per run
  };

  // ---- State -----------------------------------------------------------------
  let enabled = false;
  let running = false;
  let dryRun = false; // diagnose mode: report what WOULD be added, don't enroll
  const stats = { added: 0, skipped: 0, failed: 0 };

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const rand = (min, max) => Math.floor(min + Math.random() * (max - min));
  const log = (...a) => console.log("[AmexAutoAdd]", ...a);

  function getPath(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? o : o[k]), obj);
  }

  // ---- On-page progress overlay ---------------------------------------------
  const Overlay = (() => {
    let el, spinner, titleEl, subEl, hideTimer;

    function ensure() {
      if (el) return;
      el = document.createElement("div");
      el.id = "amex-auto-add-overlay";
      el.innerHTML = `
        <div class="aaa-spin"></div>
        <div class="aaa-text">
          <div class="aaa-title">Adding Amex offers…</div>
          <div class="aaa-sub">Starting…</div>
        </div>`;
      const style = document.createElement("style");
      style.textContent = `
        #amex-auto-add-overlay {
          position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;
          display: flex; align-items: center; gap: 12px;
          background: #006fcf; color: #fff;
          font-family: -apple-system, Segoe UI, Roboto, sans-serif;
          padding: 12px 16px; border-radius: 12px;
          box-shadow: 0 8px 28px rgba(0,0,0,.28);
          transform: translateY(20px); opacity: 0;
          transition: opacity .25s ease, transform .25s ease;
          max-width: 300px; pointer-events: none;
        }
        #amex-auto-add-overlay.aaa-show { transform: translateY(0); opacity: 1; }
        #amex-auto-add-overlay.aaa-done { background: #2e9b3f; }
        #amex-auto-add-overlay.aaa-error { background: #c0392b; }
        #amex-auto-add-overlay .aaa-spin {
          width: 22px; height: 22px; flex: none; border-radius: 50%;
          border: 3px solid rgba(255,255,255,.35); border-top-color: #fff;
          animation: aaa-rotate .8s linear infinite;
        }
        #amex-auto-add-overlay.aaa-done .aaa-spin,
        #amex-auto-add-overlay.aaa-error .aaa-spin { animation: none; border: none; }
        #amex-auto-add-overlay .aaa-title { font-weight: 700; font-size: 13px; line-height: 1.2; }
        #amex-auto-add-overlay .aaa-sub { font-size: 12px; opacity: .9; margin-top: 2px; }
        @keyframes aaa-rotate { to { transform: rotate(360deg); } }
      `;
      (document.head || document.documentElement).appendChild(style);
      (document.body || document.documentElement).appendChild(el);
      spinner = el.querySelector(".aaa-spin");
      titleEl = el.querySelector(".aaa-title");
      subEl = el.querySelector(".aaa-sub");
    }

    function show(title, sub) {
      ensure();
      clearTimeout(hideTimer);
      el.className = "aaa-show";
      if (title) titleEl.textContent = title;
      if (sub != null) subEl.textContent = sub;
    }
    function update(sub) {
      if (el && subEl) subEl.textContent = sub;
    }
    function finish(kind, title, sub) {
      ensure();
      el.className = "aaa-show " + (kind === "error" ? "aaa-error" : "aaa-done");
      spinner.textContent = kind === "error" ? "✕" : "✓";
      spinner.style.cssText =
        "font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;";
      if (title) titleEl.textContent = title;
      if (sub != null) subEl.textContent = sub;
      hideTimer = setTimeout(hide, 5000);
    }
    function hide() {
      if (!el) return;
      el.classList.remove("aaa-show");
    }
    return { show, update, finish, hide };
  })();

  // ---- HTTP helpers ----------------------------------------------------------
  async function requestJson(url, options) {
    const res = await fetch(url, options);
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status}`);
      err.httpStatus = res.status;
      err.transient = res.status >= 500;
      err.blocked =
        res.status === 429 || res.status === 403 || res.status === 401;
      throw err;
    }
    // A 2xx that isn't JSON usually means a login/challenge interstitial.
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      const err = new Error("Non-JSON response (likely logged out / blocked)");
      err.blocked = true;
      throw err;
    }
  }

  function postJson(url, body) {
    return requestJson(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  function getJson(url) {
    return requestJson(url, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });
  }

  // ---- API calls -------------------------------------------------------------
  async function fetchCards() {
    const data = await getJson(MEMBER_URL);
    const accounts = getPath(data, "accounts") || [];
    const cards = [];
    for (const account of accounts) {
      if (account.account_token) {
        cards.push({
          token: account.account_token,
          name:
            getPath(account, "product.description") ||
            getPath(account, "profile.embossed_name") ||
            "Card",
        });
      }
      for (const supp of account.supplementary_accounts || []) {
        const token =
          (supp && supp.account_token) ||
          getPath(supp, "account.account_token");
        if (!token) continue;
        cards.push({
          token,
          name:
            (getPath(account, "product.description") || "Card") + " (supp)",
        });
      }
    }
    return cards;
  }

  function readOffersHub(token, requestType, page) {
    const body = {
      accountNumberProxy: token,
      locale: LOCALE,
      requestType,
    };
    if (page) body.offerPage = page;
    return postJson(READ_OFFERS_URL, body);
  }

  async function fetchEligibleOffers(token) {
    const offers = [];
    for (let i = 1; i <= CFG.maxPages; i++) {
      const page = `page${i}`;
      const data = await readOffersHub(token, "OFFERSHUB_LANDING", page);
      const items = getPath(data, `recommendedOffers.offersList.${page}`);
      if (!Array.isArray(items) || items.length === 0) break;
      for (const offer of items) {
        if (offer.offerType === "MERCHANT" && offer.offerId) offers.push(offer);
      }
    }
    return offers;
  }

  // Offers already added to this card (ADDEDTOCARD_LANDING, single page).
  async function fetchAddedOffers(token) {
    try {
      const data = await readOffersHub(token, "ADDEDTOCARD_LANDING");
      const items = getPath(data, "addedToCardViewAll.offersList.page1");
      return Array.isArray(items) ? items : [];
    } catch (e) {
      log("Could not read added offers:", e.message);
      return [];
    }
  }

  function offerKey(offer) {
    return offer.pznAnalyticsId || offer.offerId;
  }

  function enrollOffer(token, offerId) {
    return postJson(ENROLL_URL, {
      accountNumberProxy: token,
      offerId, // the card's OWN raw offerId (not pznAnalyticsId)
      locale: LOCALE,
      enrollmentTrigger: "OFFERSHUB_TILE",
      requestType: "OFFERSHUB_ENROLLMENT",
      synchronizeOnly: false,
      offerUnencrypted: false,
    });
  }

  function isEnrollSuccess(resp) {
    return (
      String(getPath(resp, "status.purpose") || "").toUpperCase() === "SUCCESS"
    );
  }

  function offerName(offer) {
    return (offer.title || offer.name || "Offer").toString().slice(0, 80);
  }

  // ---- Main run --------------------------------------------------------------
  async function run() {
    if (running) return;
    running = true;
    updateBadge("run");
    stats.added = 0;
    stats.skipped = 0;
    stats.failed = 0;
    pushStats();
    log("Starting API auto-add…");
    Overlay.show("Adding Amex offers…", "Loading your cards…");
    setBadge("…", "#006fcf");

    try {
      const cards = await fetchCards();
      log(`Found ${cards.length} card(s).`);
      if (cards.length === 0) {
        log("No cards — are you logged in?");
        Overlay.finish("error", "No cards found", "Are you logged in?");
        setBadge("!", "#c0392b");
        return;
      }

      let enrolled = 0;
      let cardIdx = 0;
      for (const card of cards) {
        if (!enabled) break;
        cardIdx++;
        Overlay.update(
          `Reading ${card.name} (${cardIdx}/${cards.length})…`
        );
        let offers;
        try {
          offers = await fetchEligibleOffers(card.token);
        } catch (e) {
          if (e.blocked) {
            log("Blocked while reading offers — stopping.", e.message);
            break;
          }
          log("Read failed for card, skipping:", card.name, e.message);
          continue;
        }

        // Skip offers already on this card so the count reflects NEW adds only.
        const added = await fetchAddedOffers(card.token);
        const addedKeys = new Set(added.map(offerKey));
        const before = offers.length;
        offers = offers.filter((o) => !addedKeys.has(offerKey(o)));
        log(
          `${card.name}: ${before} eligible, ${added.length} already added, ` +
            `${offers.length} new to add.`
        );
        if (offers.length) {
          log(
            "New offers:",
            offers.map((o) => offerName(o)).join(" | ")
          );
        }

        for (const offer of offers) {
          if (!enabled || enrolled >= CFG.maxEnroll) break;

          if (dryRun) {
            // Diagnose mode: report what WOULD be added, don't enroll.
            enrolled++;
            stats.added++;
            recordAddPreview(offerName(offer), card.name);
            pushStats();
            Overlay.update(
              `[DRY RUN] would add ${stats.added} — ${offerName(offer)}`
            );
            setBadge(String(stats.added), "#e8a400");
            continue;
          }

          let ok = false;
          let blocked = false;
          for (let attempt = 0; attempt <= CFG.maxRetries; attempt++) {
            try {
              const resp = await enrollOffer(card.token, offer.offerId);
              ok = isEnrollSuccess(resp);
              break;
            } catch (e) {
              if (e.blocked) {
                blocked = true;
                break;
              }
              if (e.transient && attempt < CFG.maxRetries) {
                await sleep(rand(CFG.retryMin, CFG.retryMax));
                continue;
              }
              break;
            }
          }

          if (blocked) {
            log("Throttled/blocked — stopping run to stay safe.");
            enabled = false;
            Overlay.finish(
              "error",
              "Stopped (rate-limited)",
              `Added ${stats.added} before Amex throttled. Try later.`
            );
            setBadge("!", "#c0392b");
            break;
          }

          enrolled++;
          if (ok) {
            stats.added++;
            recordAdd(offerName(offer), card.name);
          } else {
            stats.skipped++; // business rejection (e.g. already added/ineligible)
          }
          pushStats();
          Overlay.update(
            `${stats.added} added · ${stats.skipped} skipped — ` +
              offerName(offer)
          );
          setBadge(String(stats.added), "#006fcf");

          await sleep(rand(CFG.minDelay, CFG.maxDelay));
        }
      }

      log(
        `Done. Added ${stats.added}, skipped ${stats.skipped}, ` +
          `failed ${stats.failed}.`
      );
      if (enabled) {
        if (dryRun) {
          Overlay.finish(
            "done",
            `Dry run: ${stats.added} new offer(s) to add`,
            stats.added
              ? "Nothing was enrolled. Check console for the list."
              : "You're already enrolled in everything eligible."
          );
          setBadge(stats.added ? String(stats.added) : "0", "#e8a400");
        } else {
          Overlay.finish(
            "done",
            stats.added ? "Offers added!" : "Nothing new to add",
            `${stats.added} new · ${stats.skipped} already/ineligible`
          );
          setBadge(stats.added ? String(stats.added) : "✓", "#2e9b3f");
        }
      }
    } catch (e) {
      log("Error:", e);
      stats.failed++;
      Overlay.finish("error", "Something went wrong", String(e.message || e));
      setBadge("!", "#c0392b");
    } finally {
      running = false;
      updateBadge("idle");
      pushStats();
    }
  }

  // Ask the background service worker to update the toolbar badge.
  function setBadge(text, color) {
    try {
      chrome.runtime.sendMessage({ type: "badge", text, color });
    } catch (_) {}
  }

  // ---- Messaging / stats to popup -------------------------------------------
  function pushStats() {
    try {
      chrome.runtime.sendMessage({ type: "stats", stats, running });
    } catch (_) {}
  }
  function updateBadge(state) {
    try {
      chrome.runtime.sendMessage({ type: "state", state });
    } catch (_) {}
  }

  // ---- History logging -------------------------------------------------------
  function recordAdd(merchant, card) {
    try {
      chrome.storage.local.get({ history: [] }, (res) => {
        const history = res.history || [];
        history.push({ t: Date.now(), m: merchant || "", c: card || "" });
        if (history.length > 1000) history.splice(0, history.length - 1000);
        chrome.storage.local.set({ history });
      });
    } catch (_) {}
  }
  // Dry-run: only log to console, never touch persistent history.
  function recordAddPreview(merchant, card) {
    log(`[DRY RUN] would add: "${merchant}" on ${card}`);
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "getState") {
      sendResponse({ enabled, running, dryRun, stats, onOffersPage: true });
    } else if (msg.type === "setEnabled") {
      enabled = msg.value;
      chrome.storage.local.set({ enabled });
      if (enabled) {
        dryRun = false;
        run();
      }
      sendResponse({ ok: true });
    } else if (msg.type === "runNow") {
      enabled = true;
      dryRun = false;
      run();
      sendResponse({ ok: true });
    } else if (msg.type === "dryRun") {
      // Diagnose: read + report what WOULD be added, enroll nothing.
      enabled = true;
      dryRun = true;
      run();
      sendResponse({ ok: true });
    }
    return true;
  });

  // ---- Boot ------------------------------------------------------------------
  chrome.storage.local.get(
    { enabled: false, pendingRunUntil: 0 },
    (res) => {
      enabled = !!res.enabled;
      const pending = res.pendingRunUntil && res.pendingRunUntil > Date.now();
      if (pending) chrome.storage.local.remove("pendingRunUntil");
      if (enabled || pending) {
        // Small delay to let the session settle after page load.
        setTimeout(run, 1500);
      }
    }
  );
})();
