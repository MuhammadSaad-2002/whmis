# Deploying WHMIS ERP to cPanel via GitHub

The app is a single Laravel 12 application (Inertia + React compiled to static
assets). To make deployment a **pure `git pull`**, this repo commits both the
compiled frontend (`public/build`) **and** the PHP dependencies (`vendor/`), so
the cPanel host needs **only PHP 8.2+ and MySQL** — no Node, no Composer.

Deployment uses **cPanel Git™ Version Control**: after each pull, cPanel runs the
`.cpanel.yml` script in the repo root (migrate + rebuild caches).

Production is `whms.vwisdomtechnologies.com`. Required PHP extensions:
`mbstring, xml, zip, gd, curl, pdo_mysql, bcmath, ctype, fileinfo, tokenizer, openssl`.

> **Secrets never live in Git.** The real `.env` (with the DB password and
> `APP_KEY`) is created on the server only. `.gitignore` excludes `.env` and
> `.env.*`. See `.env.production.example` for the key list.

---

## One-time server setup — NO terminal required (cPanel UI only)

The database is imported via phpMyAdmin and `APP_KEY` is set by hand, so none of
the `php artisan` commands need to be run on the server.

### 1. Import the database (phpMyAdmin)
The DB + user `vwisdomo_whmis` already exist. In **MySQL Databases**, confirm the
user is attached to the DB with **ALL PRIVILEGES**. Then:
- Download **`database/production-seed.sql`** from the repo (GitHub → the file →
  "Download raw", or grab it from the clone after step 2).
- **phpMyAdmin** → select the `vwisdomo_whmis` database → **Import** → choose that
  file → **Go**. This creates all tables and the baseline data (5 roles, all
  permissions, the `admin@whmis.local` user, the default warehouse, number series).
  It contains **no** sample/test records.

### 2. Clone the repo — Git Version Control → Create
- **Clone URL** (private repo): `https://<PAT>@github.com/MuhammadSaad-2002/whmis.git`
  (or add an SSH deploy key).
- **Repository Path**: `whmis` → clones to `/home/vwisdomo/whmis` (vendor + build come with it).

### 3. Document root
**Domains → whms.vwisdomtechnologies.com → Document Root** → set to
`/home/vwisdomo/whmis/public`.

### 4. Create the production `.env` (File Manager — no terminal)
Create `/home/vwisdomo/whmis/.env` from `.env.production.example`, and paste a
real `APP_KEY` (a `base64:…` value) and the DB password. Because there is no
`config:cache` step, the app reads this `.env` live — no artisan needed.
`storage/` and `bootstrap/cache/` are writable by default on cPanel (the PHP
process runs as the account user); if you hit a write error, set them to `775`
via File Manager → Permissions.

### 5. Scheduler cron
cPanel → **Cron Jobs**, every minute:
```
* * * * * /usr/local/bin/php /home/vwisdomo/whmis/artisan schedule:run >/dev/null 2>&1
```
This drives `whmis:check-alerts` (low stock / expiry / overdue notifications).
(Optional — the app works without it; only the automated alerts need it.)

### 6. First login
Open `https://whms.vwisdomtechnologies.com/login` → `admin@whmis.local` /
`password` → **change the password immediately** (user menu → Settings → Password).

> **Troubleshooting a 500 on first load:** set `APP_DEBUG=true` in `.env` to see
> the real error, fix it, then set it back to `false`. Common causes: wrong
> `APP_KEY` format, DB credentials, or `storage/` not writable.

---

## Deploying updates

**Locally** (developer machine):
```bash
npm run build                 # refresh public/build
git add -A && git commit -m "…"
git push origin main
```

**On cPanel** → Git Version Control → the repo → **Manage** →
**Update from Remote**, then **Deploy HEAD Commit**. That pull triggers
`.cpanel.yml`:
```
php artisan down → migrate --force → config:cache → route:cache → view:cache → storage:link → up
```

**Optional fully-automatic pull** (cPanel has no native inbound push-webhook) —
add a cron that pulls and redeploys, e.g. every 10 minutes:
```
*/10 * * * * cd /home/vwisdomo/whmis && git pull >/dev/null 2>&1 && /usr/local/bin/php artisan migrate --force && /usr/local/bin/php artisan config:cache && /usr/local/bin/php artisan route:cache && /usr/local/bin/php artisan view:cache
```

---

## Notes

- **Why vendor/ is committed:** guarantees the host needs no Composer and no
  build step — deploy is a plain pull. When you add/upgrade a PHP package,
  run `composer update` locally and commit the changed `vendor/` + `composer.lock`.
- PDFs (invoices, statements, reports) use dompdf — pure PHP, no headless browser.
- Report Excel exports use PhpSpreadsheet — needs `ext-zip`, `ext-gd`, `ext-xml`.
- The test suite (`php artisan test`) runs on in-memory SQLite and never touches
  the MySQL data.
- After first setup, **rotate any PAT** that was shared in plaintext.
