<h1 align="center">Amex Offer Auto-Adder</h1>

<p align="center">
  A Chrome extension that instantly enrolls you in <b>every eligible Amex Offer
  across all your cards</b> — no scrolling, no clicking through tiles.
</p>

<p align="center">
  <img alt="Manifest V3" src="https://img.shields.io/badge/Manifest-V3-006fcf">
  <img alt="Chrome" src="https://img.shields.io/badge/Chrome%20%7C%20Edge%20%7C%20Brave-supported-2e9b3f">
  <img alt="License: MIT" src="https://img.shields.io/badge/License-MIT-yellow.svg">
  <img alt="No dependencies" src="https://img.shields.io/badge/dependencies-none-lightgrey">
</p>

---

Amex Offers make you add each deal to your card one tile at a time — dozens of
them, on every card. This extension does it all in one click by talking to
Amex's own offers API with your existing logged-in session. It works from **any**
Amex page (the dashboard is fine), covers **every card** on your account
including authorized-user cards, and only counts offers that were **actually
new** to each card.

## Features

- **One click, every card** — reads all your cards and enrolls every eligible
  merchant offer, including supplementary/authorized-user cards.
- **Works anywhere on Amex** — no need to open the Offers page or scroll.
- **Fast** — direct API calls, not DOM automation. Hundreds of offers in
  seconds, with randomized pacing to stay gentle.
- **Honest counts** — de-dupes against offers already on each card, so "added"
  means genuinely new enrollments.
- **Live progress** — an on-page toast and an animated toolbar status wheel show
  what's happening in real time.
- **Stats & history** — today / week / month / all-time counters, a per-card
  breakdown of the last run, and a log of recently added offers.
- **Safe by default** — stops immediately on any rate-limit or logged-out
  response instead of hammering the API.

## Install

> Loaded unpacked — this isn't on the Chrome Web Store.

1. **Download** this repo (Code → Download ZIP, or grab a
   [release](../../releases)) and unzip it.
2. Open `chrome://extensions` in Chrome, Edge, or Brave.
3. Turn on **Developer mode** (top-right).
4. Click **Load unpacked** and select the folder containing `manifest.json`.
5. Pin the extension so its icon shows in the toolbar.

## Usage

1. Log in to Amex (any page — the dashboard works).
2. Click the extension icon.
3. Click **Add offers now** for a one-off run, or flip **Auto-add on visit** on
   to run automatically whenever you open an Amex page.
4. Watch the toolbar status wheel and the on-page toast track progress. Open the
   popup any time for stats and a per-card breakdown.

## How it works

Everything runs client-side using your own session cookies
(`credentials: "include"`) — no passwords, no tokens, no external servers.

1. `GET /api/servicing/v1/member` → every card's `account_token`.
2. Per card, `POST ReadOffersHubPresentation.web.v1`
   (`requestType: OFFERSHUB_LANDING`), walking pages until they run out, keeping
   `offerType === "MERCHANT"` offers.
3. Fetch already-added offers (`ADDEDTOCARD_LANDING`) and filter them out.
4. For each remaining offer, `POST CreateOffersHubEnrollment.web.v1` with that
   card's own `offerId`. Success = `status.purpose === "SUCCESS"`.

Pacing is randomized (~0.25–0.7 s between offers); transient `5xx`/network
errors retry a couple of times, and any `429/403/401` or non-JSON response stops
the run immediately.

## Configuration

Tweak the `CFG` object at the top of [`content.js`](content.js):

| Option                  | What it does                                   |
| ----------------------- | ---------------------------------------------- |
| `minDelay` / `maxDelay` | Delay range between offers (ms). Raise if throttled. |
| `maxPages`              | Offer pages to walk per card.                  |
| `maxRetries`            | Retries on transient (5xx/network) errors.     |
| `maxEnroll`             | Safety cap on enrollments per run.             |

## Troubleshooting

Amex changes their internal endpoints from time to time. If nothing gets added:

1. Open DevTools (F12) → **Console** on an Amex tab and look for `[AmexAutoAdd]`
   logs — they show card counts, per-card offer counts, and any "blocked" state.
2. In the **Network** tab, load the Offers page and compare the real requests to
   `ReadOffersHubPresentation.web.v1` / `CreateOffersHubEnrollment.web.v1`
   against the constants in `content.js`; update if they've changed.
3. Reload the extension on `chrome://extensions`.

## Project layout

| File            | Purpose                                                |
| --------------- | ------------------------------------------------------ |
| `manifest.json` | MV3 manifest, permissions, icons                       |
| `content.js`    | Reads cards & offers, enrolls, logs stats              |
| `background.js` | Toolbar icon, animated status wheel, badge             |
| `popup.html/js` | Popup UI: toggle, run button, stats & history          |
| `icons/`        | Toolbar / extension icons                              |

## Disclaimer

For personal use on your own account. It automates undocumented American Express
endpoints, which is against Amex's Terms of Service — use at your own risk. The
extension is not affiliated with or endorsed by American Express.

## License

[MIT](LICENSE)
