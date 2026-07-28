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

  chrome.storage.local.get(
    { offerCatalog: {}, headsUpEnabled: true, headsUpDismissed: {} },
    (res) => {
      if (!res.headsUpEnabled) return;
      const entries = (res.offerCatalog || {})[currentDomain];
      if (!entries || !entries.length) return;

      // Session-suppress per domain (cleared when the browser session ends is
      // approximated via sessionStorage on this tab; plus a stored dismiss).
      try {
        if (sessionStorage.getItem("amexHeadsUpDismissed") === currentDomain)
          return;
      } catch (_) {}

      // Prefer showing a not-yet-added offer (actionable) over an enrolled one.
      const notAdded = entries.filter((e) => !e.enrolled);
      const primary = (notAdded[0] || entries[0]);
      showCard(primary, entries.length);
    }
  );

  function showCard(offer, total) {
    const wrap = document.createElement("div");
    wrap.id = "amex-merchant-notice";
    const added = offer.enrolled;
    const lowConf = offer.confidence && offer.confidence <= 1;

    wrap.innerHTML = `
      <div class="amn-head">
        <span class="amn-badge">AMEX</span>
        <span class="amn-title">${
          lowConf ? "Possible Amex Offer" : "Amex Offer available"
        }</span>
        <button class="amn-x" title="Dismiss">&times;</button>
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
        position: fixed; z-index: 2147483647; right: 20px; bottom: 20px;
        width: 300px; background: #fff; color: #1a1a1a;
        font-family: -apple-system, Segoe UI, Roboto, sans-serif;
        border-radius: 12px; box-shadow: 0 10px 34px rgba(0,0,0,.28);
        border-top: 4px solid #006fcf; overflow: hidden;
        transform: translateY(16px); opacity: 0;
        transition: opacity .25s ease, transform .25s ease;
      }
      #amex-merchant-notice.amn-show { transform: translateY(0); opacity: 1; }
      #amex-merchant-notice .amn-head {
        display: flex; align-items: center; gap: 8px; padding: 10px 12px 0;
      }
      #amex-merchant-notice .amn-badge {
        background: #006fcf; color: #fff; font-weight: 800; font-size: 10px;
        letter-spacing: .5px; padding: 2px 6px; border-radius: 4px;
      }
      #amex-merchant-notice .amn-title { font-size: 12px; font-weight: 600; color:#006fcf; flex: 1; }
      #amex-merchant-notice .amn-x {
        border: 0; background: none; font-size: 20px; line-height: 1;
        color: #999; cursor: pointer; padding: 0 2px;
      }
      #amex-merchant-notice .amn-merchant { font-size: 15px; font-weight: 700; padding: 6px 12px 0; }
      #amex-merchant-notice .amn-detail { font-size: 13px; padding: 4px 12px 0; color:#333; }
      #amex-merchant-notice .amn-meta { font-size: 11px; color:#666; padding: 6px 12px 0; }
      #amex-merchant-notice .amn-add {
        display: block; width: calc(100% - 24px); margin: 10px 12px;
        padding: 9px; border: 0; border-radius: 7px; background: #006fcf;
        color: #fff; font-weight: 700; cursor: pointer;
      }
      #amex-merchant-notice .amn-add:disabled { background: #9bc4e6; cursor: default; }
      #amex-merchant-notice .amn-add.amn-done { background: #2e9b3f; }
      #amex-merchant-notice .amn-more { font-size: 11px; color:#888; padding: 0 12px 10px; }
    `;
    (document.head || document.documentElement).appendChild(style);
    (document.body || document.documentElement).appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add("amn-show"));

    const dismiss = () => {
      try {
        sessionStorage.setItem("amexHeadsUpDismissed", currentDomain);
      } catch (_) {}
      wrap.classList.remove("amn-show");
      setTimeout(() => wrap.remove(), 300);
    };
    wrap.querySelector(".amn-x").addEventListener("click", dismiss);

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
