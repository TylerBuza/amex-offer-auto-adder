# Install analytics (self-hosted)

A tiny PHP endpoint that counts anonymous install pings from the extension.
Runs on any PHP-capable Apache/Nginx host — no database, just flat files.

## Files

- `amex-ext/install.php` — receives the one-time install ping (POST JSON:
  `{id, version, browser, event}`), dedupes by `id`, appends a line to a log.
- `amex-ext/stats.php` — token-protected JSON summary (totals by browser /
  version / country / day).

## Deploy

1. Copy `amex-ext/` under your web root, e.g. `/var/www/yoursite/api/amex-ext/`.
2. Create a data dir **outside** the web root, writable by the web user:
   ```bash
   mkdir -p /var/www/amex-ext-data
   chown www-data:www-data /var/www/amex-ext-data
   chmod 750 /var/www/amex-ext-data
   ```
   (Both PHP files point at `/var/www/amex-ext-data` — change the `$DATA_DIR`
   constant if you use a different path.)
3. Set a stats token: replace `REPLACE_TOKEN` in `stats.php` with a random
   secret (`openssl rand -hex 16`).
4. Point the extension at your endpoint: set `INSTALL_PING_URL` in
   `background.js`.

## View stats

```
https://yoursite/api/amex-ext/stats.php?token=YOUR_TOKEN
```

## Notes

- Only a random client UUID, version, and browser are stored — no personal or
  Amex data. Country is derived from Cloudflare's `CF-IPCOUNTRY` header if
  present.
- The data dir is outside the web root so logs are never publicly served.
