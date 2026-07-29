/* Amex Offer Auto-Adder — merchant heads-up
 *
 * Runs on merchant websites (registered dynamically for domains that appear in
 * your cached Amex offer catalog). If the current site matches an offer you
 * have — or one you're eligible for but haven't added — it shows a small
 * bottom-right card. Eligible-but-not-added offers get an "Add now" button.
 *
 * No data leaves your machine; matching is done against locally cached offers.
 */

(() => {
  "use strict";
  if (window.__amexMerchantNoticeLoaded) return;
  window.__amexMerchantNoticeLoaded = true;

  function registrable(host) {
    if (!host) return "";
    host = String(host).toLowerCase().replace(/^www\./, "");
    const parts = host.split(".").filter(Boolean);
    if (parts.length <= 2) return parts.join(".");
    if (/\.(co|com|org|net|gov|ac)\.[a-z]{2}$/.test(host))
      return parts.slice(-3).join(".");
    return parts.slice(-2).join(".");
  }

  const currentDomain = registrable(location.hostname);
  if (!currentDomain) return;

  // Never show the heads-up on Amex's own sites (or common non-merchant hosts).
  const NEVER_ON = new Set([
    "americanexpress.com",
    "amex.com",
    "amexoffers.com",
    "americanexpress.ca",
  ]);
  if (NEVER_ON.has(currentDomain)) return;

  chrome.storage.local.get(
    {
      offerCatalog: {},
      headsUpEnabled: true,
      headsUpDismissed: {},
      theme: "auto",
    },
    (res) => {
      if (!res.headsUpEnabled) return;
      let entries = (res.offerCatalog || {})[currentDomain];
      if (!entries || !entries.length) return;

      // Drop expired offers so they never show up.
      const now = Date.now();
      entries = entries.filter((e) => !(e.expiresAt && e.expiresAt < now));
      if (!entries.length) return;

      // Permanently dismissed for this domain ("forever").
      if (res.headsUpDismissed && res.headsUpDismissed[currentDomain]) return;

      // Dismissed for this browser session (per-tab sessionStorage).
      try {
        if (sessionStorage.getItem("amexHeadsUpDismissed") === currentDomain)
          return;
      } catch (_) {}

      // Resolve the theme: explicit light/dark, or "auto" -> follow the site.
      let dark = res.theme === "dark";
      if (res.theme !== "dark" && res.theme !== "light") {
        dark =
          window.matchMedia &&
          window.matchMedia("(prefers-color-scheme: dark)").matches;
      }

      // Prefer showing a not-yet-added offer (actionable) over an enrolled one.
      const notAdded = entries.filter((e) => !e.enrolled);
      const primary = (notAdded[0] || entries[0]);
      showCard(primary, entries.length, dark);
    }
  );

  function showCard(offer, total, dark) {
    const wrap = document.createElement("div");
    wrap.id = "amex-merchant-notice";
    if (dark) wrap.className = "amn-dark";
    const added = offer.enrolled;
    const lowConf = offer.confidence && offer.confidence <= 1;

    wrap.innerHTML = `
      <div class="amn-head">
        <span class="amn-badge">AMEX</span>
        <span class="amn-title">${
          lowConf ? "Possible Amex Offer" : "Amex Offer available"
        }</span>
        <div class="amn-dismiss">
          <button class="amn-x" title="Dismiss">&times;</button>
          <div class="amn-menu">
            <div class="amn-menu-label">Hide for this site:</div>
            <button class="amn-session">This session</button>
            <button class="amn-forever">Forever</button>
          </div>
        </div>
      </div>
      <div class="amn-merchant">${escapeHtml(offer.name)}</div>
      ${offer.detail ? `<div class="amn-detail">${escapeHtml(offer.detail)}</div>` : ""}
      <div class="amn-meta">
        ${added ? `✓ Added to ${escapeHtml(offer.card)}` : `On ${escapeHtml(offer.card)}`}
        ${offer.expiry ? ` · ${escapeHtml(offer.expiry)}` : ""}
      </div>
      ${
        added
          ? ""
          : `<button class="amn-add">Add to card now</button>`
      }
      ${total > 1 ? `<div class="amn-more">+${total - 1} more offer(s) here</div>` : ""}
    `;

    const style = document.createElement("style");
    style.textContent = `
      #amex-merchant-notice {
        --amn-bg:#fff; --amn-text:#1a1a1a; --amn-title:#006fcf;
        --amn-detail:#333; --amn-meta:#666; --amn-muted:#888; --amn-x:#999;
        --amn-menu-bg:#fff; --amn-menu-border:#e2e2e2; --amn-menu-hover:#f2f6fb;
        --amn-accent:#006fcf;
        position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;
        width: 300px; background: var(--amn-bg); color: var(--amn-text);
        font-family: -apple-system, Segoe UI, Roboto, sans-serif;
        border-radius: 12px; box-shadow: 0 10px 34px rgba(0,0,0,.28);
        border-top: 4px solid var(--amn-accent);
        transform: translateY(16px); opacity: 0;
        transition: opacity .25s ease, transform .25s ease;
      }
      #amex-merchant-notice.amn-dark {
        --amn-bg:#2a3240; --amn-text:#e8eef7; --amn-title:#5aa9ee;
        --amn-detail:#bcc8d8; --amn-meta:#93a3ba; --amn-muted:#93a3ba; --amn-x:#93a3ba;
        --amn-menu-bg:#323b4b; --amn-menu-border:#3f4b5e; --amn-menu-hover:#3a4658;
        --amn-accent:#5aa9ee;
      }
      #amex-merchant-notice.amn-show { transform: translateY(0); opacity: 1; }
      #amex-merchant-notice .amn-head {
        display: flex; align-items: center; gap: 8px; padding: 10px 12px 0;
      }
      #amex-merchant-notice .amn-badge {
        background: #006fcf; color: #fff; font-weight: 800; font-size: 10px;
        letter-spacing: .5px; padding: 2px 6px; border-radius: 4px;
      }
      #amex-merchant-notice .amn-title { font-size: 12px; font-weight: 600; color:var(--amn-title); flex: 1; }
      #amex-merchant-notice .amn-dismiss { position: relative; }
      #amex-merchant-notice .amn-x {
        border: 0; background: none; font-size: 20px; line-height: 1;
        color: var(--amn-x); cursor: pointer; padding: 0 2px;
      }
      #amex-merchant-notice .amn-menu {
        display: none; position: absolute; top: 24px; right: 0; z-index: 1;
        background: var(--amn-menu-bg); border: 1px solid var(--amn-menu-border);
        border-radius: 8px;
        box-shadow: 0 6px 18px rgba(0,0,0,.28); padding: 6px; width: 130px;
      }
      #amex-merchant-notice .amn-menu.amn-open { display: block; }
      #amex-merchant-notice .amn-menu-label {
        font-size: 10px; color: var(--amn-muted); padding: 2px 4px 4px;
      }
      #amex-merchant-notice .amn-menu button {
        display: block; width: 100%; text-align: left; border: 0;
        background: none; padding: 6px 8px; font-size: 12px; color: var(--amn-text);
        cursor: pointer; border-radius: 6px;
      }
      #amex-merchant-notice .amn-menu button:hover { background: var(--amn-menu-hover); }
      #amex-merchant-notice .amn-forever { color: #e06666 !important; }
      #amex-merchant-notice .amn-merchant { font-size: 15px; font-weight: 700; padding: 6px 12px 0; }
      #amex-merchant-notice .amn-detail { font-size: 13px; padding: 4px 12px 0; color:var(--amn-detail); }
      #amex-merchant-notice .amn-meta { font-size: 11px; color:var(--amn-meta); padding: 6px 12px 0; }
      #amex-merchant-notice .amn-add {
        display: block; width: calc(100% - 24px); margin: 10px 12px;
        padding: 9px; border: 0; border-radius: 7px; background: var(--amn-accent);
        color: #fff; font-weight: 700; cursor: pointer;
      }
      #amex-merchant-notice .amn-add:disabled { background: #9bc4e6; cursor: default; }
      #amex-merchant-notice .amn-add.amn-done { background: #2e9b3f; }
      #amex-merchant-notice .amn-more { font-size: 11px; color:var(--amn-muted); padding: 0 12px 10px; }
    `;
    (document.head || document.documentElement).appendChild(style);
    (document.body || document.documentElement).appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("amn-show"));

    const close = () => {
      wrap.classList.remove("amn-show");
      setTimeout(() => wrap.remove(), 300);
    };
    const dismissSession = () => {
      try {
        sessionStorage.setItem("amexHeadsUpDismissed", currentDomain);
      } catch (_) {}
      close();
    };
    const dismissForever = () => {
      try {
        chrome.storage.local.get({ headsUpDismissed: {} }, (res) => {
          const d = res.headsUpDismissed || {};
          d[currentDomain] = Date.now();
          chrome.storage.local.set({ headsUpDismissed: d });
        });
      } catch (_) {}
      close();
    };

    const menu = wrap.querySelector(".amn-menu");
    const xBtn = wrap.querySelector(".amn-x");
    xBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      menu.classList.toggle("amn-open");
    });
    wrap.querySelector(".amn-session").addEventListener("click", dismissSession);
    wrap.querySelector(".amn-forever").addEventListener("click", dismissForever);
    // Close the menu when clicking elsewhere on the page.
    document.addEventListener(
      "click",
      (e) => {
        if (!wrap.contains(e.target)) menu.classList.remove("amn-open");
      },
      true
    );

    const addBtn = wrap.querySelector(".amn-add");
    if (addBtn) {
      addBtn.addEventListener("click", () => {
        addBtn.disabled = true;
        addBtn.textContent = "Adding…";
        chrome.runtime.sendMessage(
          { type: "enrollOne", token: offer.token, offerId: offer.offerId },
          (resp) => {
            void chrome.runtime.lastError;
            if (resp && resp.ok) {
              addBtn.textContent = "✓ Added";
              addBtn.classList.add("amn-done");
              setTimeout(dismiss, 2500);
            } else {
              addBtn.disabled = false;
              addBtn.textContent =
                resp && resp.reason === "not_logged_in"
                  ? "Log in to Amex first"
                  : "Try again";
            }
          }
        );
      });
    }
  }

  function escapeHtml(s) {
    return String(s || "").replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    }[c]));
  }
})();
