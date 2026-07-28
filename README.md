# Amex Offer Auto-Adder

A Chrome (Manifest V3) extension that automatically enrolls you in **every
eligible Amex offer across all your cards** while you're logged in. It works
from **any** Amex page (including the dashboard) — no need to open the offers
page or scroll.

It talks directly to Amex's own internal offers API using your logged-in
session cookies (the same endpoints the website itself uses), so it's fast and
doesn't depend on the page's DOM/layout.

## Files

| File            | Purpose                                                     |
| --------------- | ----------------------------------------------------------- |
| `manifest.json` | MV3 manifest (global + functions americanexpress hosts)      |
| `content.js`    | Calls Amex's offers API to enroll all offers, logs history   |
| `background.js` | Draws the toolbar icon (no binary PNGs needed)              |
| `icon.svg`      | Source icon artwork (blue Amex square + checkmark)          |
| `popup.html`    | Toolbar popup UI (toggle, run, stats)                       |
| `popup.js`      | Popup logic + progress stats (today/week/month/all)         |

## Live indicators

While a run is in progress you get two visual cues:

- **On-page toast** (bottom-right of the Amex tab): a blue card with a spinning
  wheel showing live progress ("12 added · 3 skipped — <merchant>"). It turns
  green with a ✓ when done, or red with an ✕ on error/throttling, then fades.
- **Toolbar icon**: the icon animates a rotating status wheel while running, and
  a **badge** shows the running count of offers added (green ✓ when finished,
  red ! if it was rate-limited).

## Stats / progress

Click the toolbar icon to see how many offers you've added:

- **Today / Week / Month / All** counters (week starts Monday).
- **Last added** — exact time + relative ("2h ago").
- **Recent** — the last 15 added offers with merchant name (when detectable)
  and how long ago.
- **Clear history** button to reset the log.

Every successful add is timestamped and stored in `chrome.storage.local` under
`history` (capped to the last 1000 entries), so stats persist across sessions
and survive browser restarts.

## Install (load unpacked)

1. Open `chrome://extensions` in Chrome (or Edge/Brave).
2. Turn on **Developer mode** (top-right).
3. Click **Load unpacked** and select this folder
   (`C:\Users\tyler\Documents\Nword`).
4. Pin the extension so its icon shows in the toolbar.

## Use

1. Log in to Amex (any page — the dashboard is fine).
2. Click the extension icon.
3. Either flip **Auto-add on visit** on (runs automatically when you open an
   Amex page) or click **Add offers now** for a one-off run.
4. Watch the counters. The dot pulses amber while running.

## How it works

- Uses your logged-in session cookies (`credentials: "include"`) to call Amex's
  own internal offers API — no DOM scraping, no scrolling.
- `GET /api/servicing/v1/member` → collects every card's `account_token`
  (including supplementary/authorized-user cards).
- Per card, `POST ReadOffersHubPresentation.web.v1` with
  `requestType: OFFERSHUB_LANDING`, walking pages `page1..page20`, keeping
  `offerType === "MERCHANT"` offers.
- For each offer, `POST CreateOffersHubEnrollment.web.v1` with the card's own
  `offerId`. Success = `status.purpose === "SUCCESS"`; business rejections
  (already added / ineligible) count as skipped.
- Randomized **0.25–0.7 s** between offers; retries transient (5xx/network)
  errors up to twice. **Stops immediately** on `429/403/401` or a non-JSON
  response (signs of throttling / logged-out).

## Tuning

Edit the `CFG` object at the top of `content.js`:

- `minDelay` / `maxDelay` — delay range between offers (ms). Bump up if you ever
  get throttled.
- `maxPages` — how many offer pages to walk per card.
- `maxRetries` / `retryMin` / `retryMax` — transient-error retry behavior.
- `maxEnroll` — safety cap on enrollments per run.

## If it stops working

Amex changes these internal endpoints occasionally. If nothing gets added:

1. Open DevTools (F12) → Console on any Amex tab; look for `[AmexAutoAdd]` logs
   (they'll show card counts, offer counts, and any "blocked"/"stopping").
2. In DevTools → **Network**, load the offers page normally and watch for calls
   to `ReadOffersHubPresentation.web.v1` / `CreateOffersHubEnrollment.web.v1`;
   compare the request body/URL to the constants in `content.js` and update if
   they changed.
3. Reload the extension on `chrome://extensions`.

## Notes / caveats

- This automates your own logged-in account, but calling these undocumented
  internal endpoints is a clear Terms-of-Service violation. Use at your own
  risk. Keep delays reasonable so you don't get rate-limited or flagged; the
  code hard-stops on throttling signals.
- Requires host permissions for both `global.americanexpress.com` and
  `functions.americanexpress.com` (already in the manifest).
- The toolbar icon is drawn at runtime by `background.js` (no bundled PNGs).
