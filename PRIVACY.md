# Privacy policy — Amex Offer Auto-Adder

Updated November 15, 2026. Developer: Tyler Buza, https://buza.dev.
Contact: tyler@buza.dev.

## Purpose and account data

The extension helps you enroll in, find, and use eligible American Express
merchant offers. It communicates directly with American Express using your
existing signed-in browser session. It does not ask for your password or read
your password from a sign-in form.

It processes card product labels, account-reference tokens returned by American
Express, offer identifiers, merchant names, offer descriptions, expiration dates,
and enrollment status. These details, settings, and local enrollment history are
stored in Chrome's local extension storage to provide search, statistics, and
merchant reminders. Enrollment requests send the relevant account-reference
token and offer identifier back to American Express. Account-reference tokens
are not full card numbers, but are treated as sensitive account data.

The extension does not send your Amex account details, offers, card data, or
enrollment history to Tyler Buza's server, advertisers, or analytics providers.
American Express processes requests under its own privacy policy.

## Merchant website access

The extension registers its packaged reminder script on merchant domains derived
from your cached offers. The script compares the current site's hostname with
the locally stored catalog and can display a reminder. Website content is not
uploaded to the developer. The extension does not keep or transmit a browsing
history. Turn off **Merchant offer heads-up** to disable these reminders.

## Installation measurement

On first installation, the extension sends a locally generated random installation
identifier, extension version, browser name, and an install event to
`https://buza.dev/api/amex-ext/install.php`. This measures installations. It is a
pseudonymous identifier, not a name or email address.

The receiving application records those fields with a timestamp and, when
provided by the hosting infrastructure, an approximate country code. Network
requests necessarily expose an IP address and request headers to the hosting
infrastructure; its access/security logs may retain those details. The install
record written by the application does not store the IP address. Install
measurement is not sent on offer searches, enrollment runs, or merchant visits.

The install-record application does not currently implement automatic expiry.
For questions or deletion requests, contact tyler@buza.dev. Since the random
identifier is not linked to your email, identifying a specific install record
may require that identifier. Uninstalling does not delete server-side records.

## Updates

The Chrome Web Store edition uses Chrome's built-in extension update service.
The GitHub sideloaded editions also request public release information from
GitHub to check for updates, and can download an update ZIP when you request it.
Those requests do not contain your Amex account or offer data; GitHub receives
ordinary network metadata such as your IP address.

## Choices, retention, and sharing

Settings and account/offer data remain in local extension storage until replaced,
cleared, or the extension is removed. **Clear history** clears the local
enrollment history, not the cached offer catalog. Removing the extension removes
its local storage. Auto-add and merchant reminders can be disabled in the popup.

Data is used to provide the extension's features and measure installations. It is
not sold, used for personalized advertising, or used to determine creditworthiness
or lending eligibility. Service providers involved in hosting and delivering
network requests process the network information described above.

Amex Offer Auto-Adder's use and transfer of information received from Google APIs
will adhere to the Chrome Web Store User Data Policy, including the Limited Use
requirements. This extension is independently developed and is not affiliated
with or endorsed by American Express.
