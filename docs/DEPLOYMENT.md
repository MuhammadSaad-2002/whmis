# Deploying WHMIS ERP to cPanel via GitHub

The app is a single Laravel 12 application (Inertia + React compiled to static
assets). To make deployment a **pure `git pull`**, this repo commits both the
compiled frontend (`public/build`) **and** the PHP dependencies (`vendor/`), so
the cPanel host needs **only PHP 8.2+ and MySQL** — no Node, no Composer.

Deployment uses **cPanel Git™ Version Control**: after each pull, cPanel runs the
`.cpanel.yml` script in the repo root (migrate + rebuild caches).

Production is `whmis.vwisdomtechnologies.com`. Required PHP extensions:
`mbstring, xml, zip, gd, curl, pdo_mysql, bcmath, ctype, fileinfo, tokenizer, openssl`.

> **Secrets never live in Git.** The real `.env` (with the DB password and
> `APP_KEY`) is created on the server only. `.gitignore` excludes `.env` and
> `.env.*`. See `.env.production.example` for the key list.

---

## One-time server setup (cPanel UI)

### 1. Database
`vwisdomo_whmis` (DB + user) already exist. In **MySQL Databases**, confirm the
user `vwisdomo_whmis` is attached to the DB `vwisdomo_whmis` with **ALL PRIVILEGES**.

### 2. Clone the repo — Git Version Control → Create
- **Clone URL**: for a private repo, authenticate with a PAT in the URL:
  `https://<PAT>@github.com/MuhammadSaad-2002/whmis.git` (or add an SSH deploy key).
- **Repository Path**: `whmis` → clones to `/home/vwisdomo/whmis` (vendor + build come with it).

### 3. Document root
**Domains → whmis.vwisdomtechnologies.com → Document Root** → set to
`/home/vwisdomo/whmis/public`.

### 4. Create the production `.env`
Create `/home/vwisdomo/whmis/.env` (File Manager or Terminal) from
`.env.production.example`, filling `DB_PASSWORD`. Leave `APP_KEY` blank — the next
step generates it.

### 5. Initialize (cPanel Terminal — vendor is present, so no composer)
```bash
cd /home/vwisdomo/whmis
php artisan key:generate            # writes APP_KEY into .env
php artisan migrate --force
php artisan db:seed --force         # roles, admin user, default warehouse, number series (ONE TIME)
php artisan storage:link
php artisan config:cache && php artisan route:cache && php artisan view:cache
```
Ensure `storage/` and `bootstrap/cache/` are writable (`chmod -R 775`).

If `php` isn't 8.2+, use the account's selected binary, e.g.
`/opt/cpanel/ea-php82/root/usr/bin/php`, and update the same path in `.cpanel.yml`.

### 6. Scheduler cron
cPanel → **Cron Jobs**, every minute:
```
* * * * * /usr/local/bin/php /home/vwisdomo/whmis/artisan schedule:run >/dev/null 2>&1
```
This drives `whmis:check-alerts` (low stock / expiry / overdue notifications).

### 7. First login
Open `https://whmis.vwisdomtechnologies.com/login` → `admin@whmis.local` /
`password` → **change the password immediately** (user menu → Settings → Password).

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
