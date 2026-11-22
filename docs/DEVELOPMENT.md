# Developing Amex Offer Auto-Adder

The runtime is a Manifest V3 browser extension with no third-party JavaScript dependencies. The root directory contains the Chromium build; [`firefox/`](../firefox/) contains the Firefox build with a background script in place of the Chromium service worker.

## How a run works

1. [`content.js`](../content.js) uses the signed-in Amex tab to read `/api/servicing/v1/member` for the cards and supplementary accounts returned by Amex.
2. For each card, it pages through `OFFERSHUB_LANDING` via `ReadOffersHubPresentation.web.v1`, keeping eligible `MERCHANT` offers with offer IDs. It reads page 1 of `ADDEDTOCARD_LANDING` for already-added offers.
3. It skips known enrollments and calls `CreateOffersHubEnrollment.web.v1` with **that card’s own offer ID**. A `SUCCESS` response counts as a new addition.
4. It saves a flat list for popup search and a domain-indexed catalog for merchant reminders. [`background.js`](../background.js) registers [`merchant-notice.js`](../merchant-notice.js) for matching domains. [`popup.js`](../popup.js) reads the local cache; it does not query Amex on each keystroke.

## Configuration and diagnostics

The `CFG` object in `content.js` controls the delay range (`minDelay`, `maxDelay`, in milliseconds), eligible-offer pagination (`maxPages`), transient retries (`maxRetries`), and per-run enrollment cap (`maxEnroll`). Keep shared behavior in sync with the corresponding files in `firefox/`.

For a run that returns nothing, start in the Amex tab’s DevTools console and filter for `[AmexAutoAdd]`. The messages distinguish an empty offer list, a skipped card, and a blocked run. If Amex changes an endpoint, compare the request names and response structure with the calls in `content.js`. Avoid sharing raw account responses or session data.

## Build and verify

Run these from the repository root with Node.js:

```sh
node scripts/build-store.mjs
node --test tests/offers.test.mjs
```

The build writes `dist/chrome-web-store/`. The tests exercise the source, Firefox, and generated store build, so build **before** testing. The store edition uses Chrome-managed updates; the sideloaded editions include the GitHub ZIP update checker.

For a store upload, ZIP the **contents** of the output folder with `manifest.json` at the root. [Store submission notes](../store/LISTING.md) cover screenshots, permissions, and reviewer instructions. The [privacy policy](../PRIVACY.md) documents the install-measurement endpoint; its server implementation is in [`server/`](../server/).
