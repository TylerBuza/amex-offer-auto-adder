# Chrome Web Store submission

## Submission record

- Submitted November 15, 2026; dashboard confirmed **Pending review**.
- Version: **2.0.1**; publisher: **Tyler Buza**.
- Item ID: `binllhimembkpanceinpeogelljioehd`.
- Visibility: public; free of charge; all regions.
- Automatic publication after approval: enabled.
- Uploaded: store ZIP, 128px icon, two 1280x800 screenshots.
- Saved: listing, privacy disclosures, permission justifications, privacy URL,
  and reviewer instructions (no shared financial-account credentials).
- Google displayed its broad-host-permission extended-review notice.
- ZIP SHA-256: `3ac210f409b51ffca2d9dc02a12ee4f813670508b51f16bef1a0928bfea8cc93`.
- Public store URL (available after publication):
  https://chromewebstore.google.com/detail/binllhimembkpanceinpeogelljioehd

## Store listing

- Name: Amex Offer Auto-Adder
- Publisher: Tyler Buza
- Contact: tyler@buza.dev
- Language: English (United States)
- Suggested category: Shopping
- Homepage: https://github.com/TylerBuza/amex-offer-auto-adder
- Support: https://github.com/TylerBuza/amex-offer-auto-adder/issues
- Privacy: https://github.com/TylerBuza/amex-offer-auto-adder/blob/main/PRIVACY.md
- Price: Free

### Short description

Add eligible Amex Offers across your cards, search saved offers, and see merchant reminders. Independent tool by Tyler Buza.

### Detailed description

Manage eligible American Express merchant offers from one place.

Amex Offer Auto-Adder uses your existing signed-in American Express session to
enroll eligible offers across the cards returned by your account. Click Add
offers now for a manual run, or use Auto-add on visit for automatic enrollment.

Features:
- Add eligible merchant offers across supported cards, including supplementary
  cards returned by American Express.
- Search locally cached eligible and added offers, with card-specific status,
  deal details, and expiration dates. Expired offers are hidden.
- See a reminder on matching merchant websites based on your cached offers.
- View local enrollment counts, recent additions, and per-card run details.
- Follow live progress and use light, dark, or automatic appearance.

Getting started:
1. Sign in at global.americanexpress.com.
2. Open the extension and click Add offers now.
3. After a run, search your cached offers or visit a matching merchant website.

Auto-add on visit and merchant reminders are enabled on first install and can be
turned off in the popup. Search reflects cached eligible/added offers, not
redeemed-offer savings history. Eligibility, enrollment, and credits are
controlled by American Express; rewards are not guaranteed. The integration uses
the US English Amex web interface and undocumented endpoints, which can change.

Account and offer data are processed locally and sent directly to American
Express for the features you use. First installation sends a random installation
identifier, version, and browser to buza.dev to count installs; the server records
a timestamp and country code when available. See the privacy policy for details.

Independent extension by Tyler Buza. Not affiliated with or endorsed by American
Express. Use of automated access may be restricted by American Express's terms.

## Privacy practices fields

Single purpose: Help signed-in American Express cardholders enroll in and use
eligible merchant offers, with local offer search and matching merchant reminders.

Permission justification — storage: Cache offer details, account-reference tokens,
per-card enrollment state, local history, and preferences so search and reminders
work across browser sessions.

Permission justification — scripting: Register the packaged merchant reminder
script on merchant domains found in the user's cached offer catalog. Remove
registrations when merchant reminders are disabled.

Host permission justification — *://*/*: Offers cover changing merchant domains.
The packaged reminder script runs only on domains derived from the cached catalog,
to show relevant offers while visiting those merchants. Amex hosts are used to
read and enroll offers with the user's signed-in session, and buza.dev receives
the first-install measurement request. Broad host access also allows the popup to
identify whether its active tab is the Amex site. No browsing history is uploaded.

Remote code: No. All executable scripts are packaged. Server responses are data,
not executable code. No eval, remote scripts, or external code loaders are used.

Data disclosures to review against the live dashboard wording:
- Personally identifiable information / identifiers: random install identifier;
  hosting infrastructure also sees IP/request metadata.
- Location: approximate country on the first-install record when available.
- Financial/payment information: card product labels, offer enrollment details,
  and account-reference tokens, processed locally and with Amex, not uploaded to
  the developer. No full payment-card numbers are intentionally collected.
- Authentication information: account-reference tokens and use of the existing
  Amex session; no passwords collected. Tokens stay local or go back to Amex.
- Website content: offer details obtained from Amex; processed locally.

Do not select "no user data" merely because account data stays local. Ensure the
final disclosures match the dashboard definitions and this privacy policy.
Certifications: no data sales; no unrelated purposes; no creditworthiness/lending
use. Owner must confirm these accurately describe the deployed service.

## Reviewer instructions

The popup can be opened without an account. Actual enrollment requires the
reviewer's own eligible US American Express account, signed in at
https://global.americanexpress.com/. No shared account or test credentials are
provided. Automatic enrollment is enabled at first installation; turn it off in
the popup before opening a signed-in Amex page if a manual run is preferred.

1. Sign in to Amex and open the popup from the toolbar.
2. Click Add offers now and observe the on-page progress notification.
3. Reopen the popup to see statistics and expand Search my offers.
4. Search a merchant name; expand a result to inspect its card-specific status.
5. Visit a matching merchant website to see the local reminder. Disable Merchant
   offer heads-up to unregister reminder scripts.

Offer availability varies by account. The developer cannot guarantee a particular
test offer. Illustrative store screenshots use fictional fixture values in the
actual popup, not a live financial account.

## Build and upload

Run `node scripts/build-store.mjs`. ZIP the contents of `dist/chrome-web-store/`
with manifest.json at the archive root. Exclude the Firefox build, server code,
tests, and store documents. Upload the resulting store ZIP, not the old GitHub
release ZIP. This build uses Chrome Web Store updates and only storage/scripting
permissions in addition to host access.

Store icon: store/icon128.png (96px artwork centered in a transparent 128px canvas,
also included in the store build). Screenshots: 1280x800 PNGs of the actual
popup with generic data. The README SVG mockups are not used as store screenshots.

The public privacy URL must be live before submission. Google must review and
approve the listing before it becomes public.
