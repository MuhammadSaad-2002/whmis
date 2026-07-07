# Deploying WHMS ERP to cPanel via GitHub

The app is a single Laravel 12 application (Inertia + React compiled to static
assets). To make deployment a **pure `git pull`**, this repo commits both the
compiled frontend (`public/build`) **and** the PHP dependencies (`vendor/`), so
the cPanel host needs **only PHP 8.2+ and MySQL** — no Node, no Composer.

Deployment uses **cPanel Git™ Version Control**: after each pull, cPanel runs the
`.cpanel.yml` script in the repo root. That script now **provisions the database
on its own** — `migrate → db:seed → storage:link → optimize:clear` — so a first
deploy needs no phpMyAdmin import.

Production is `whms.digitalupthrust.com.pk`. Required PHP extensions:
`mbstring, xml, zip, gd, curl, pdo_mysql, bcmath, ctype, fileinfo, tokenizer, openssl`.

> **Secrets never live in Git.** The real `.env` (with the DB password and
> `APP_KEY`) is created on the server only. `.gitignore` excludes `.env` and
> `.env.*`. See `.env.production.example` for the key list.

---

## One-time server setup

### 1. Create the database + user (MySQL Databases)
Create the DB and user (e.g. `digitalu_whms` / `digitalu_whms`) and attach the
user with **ALL PRIVILEGES**. Leave the database **empty** — `.cpanel.yml` builds
the schema and seeds baseline data (5 roles, all permissions, the
`admin@whmis.local` user, default warehouse, number series) on deploy.

### 2. Clone the repo — Git Version Control → Create
- **Clone URL** (private repo): `https://<PAT>@github.com/MuhammadSaad-2002/whmis.git`
  (or add an SSH deploy key).
- **Repository Path**: `whms` → clones into the account home (vendor + build come with it).

### 3. Document root
**Domains → whms.digitalupthrust.com.pk → Document Root** → set to
`<app-path>/public` (e.g. `/home/<account>/whms/public`). Pointing it at the app
root instead of `/public` is the most common "site shows a file listing / wrong
page" cause.

### 4. Create the production `.env` (File Manager — no terminal)
Create `<app-path>/.env` from `.env.production.example`, and set a real `APP_KEY`
(a `base64:…` value), the DB password, and `APP_URL=https://whms.digitalupthrust.com.pk`
(**no trailing slash**). Because there is no `config:cache` step, the app reads
this `.env` live. `storage/` and `bootstrap/cache/` are writable by default on
cPanel (the PHP process runs as the account user); if you hit a write error, set
them to `775` via File Manager → Permissions.

### 5. PHP version
Select **PHP 8.4** for the domain. `.cpanel.yml` calls the CloudLinux alt-php CLI
at `/opt/alt/php84/usr/bin/php`. If the host isn't CloudLinux or the path differs,
find it (`which php` in Terminal, or cPanel MultiPHP) and update `.cpanel.yml`
first — otherwise the deploy tasks silently no-op (`|| true`) and the DB won't seed.

### 6. Deploy
Git Version Control → the repo → **Manage** → **Update from Remote**, then
**Deploy HEAD Commit**. The pull triggers `.cpanel.yml`:
```
artisan up → migrate --force → db:seed --force → storage:link → optimize:clear
```

### 7. Scheduler cron (optional)
cPanel → **Cron Jobs**, every minute (adjust the PHP path + app path):
```
* * * * * /opt/alt/php84/usr/bin/php <app-path>/artisan schedule:run >/dev/null 2>&1
```
This drives `whmis:check-alerts` (low stock / expiry / overdue notifications).
The app works without it; only the automated alerts need it.

### 8. First login
Open `https://whms.digitalupthrust.com.pk/login` → `admin@whmis.local` /
`password` → **change the password immediately** (user menu → Settings → Password)
and create a real super-admin.

> **Verify + clean up:** `https://whms.digitalupthrust.com.pk/ping.php` is a
> committed diagnostic (PHP version, vendor, `.env`, storage writability, DB
> connect, 39-table count). Confirm it passes, then **delete `public/ping.php`**.

> **Troubleshooting a 500 on first load:** set `APP_DEBUG=true` in `.env` to see
> the real error, fix it, then set it back to `false`. Common causes: wrong
> `APP_KEY` format, DB credentials, or `storage/` not writable.

> **Login won't stick / 419 behind Cloudflare:** `bootstrap/app.php` calls
> `trustProxies(at: '*')` so Laravel detects HTTPS from `X-Forwarded-Proto` and
> `SESSION_SECURE_COOKIE=true` works. If a login loop persists, confirm TLS is
> actually terminating in front of the origin.

---

## Deploying updates

**Locally** (developer machine):
```bash
npm run build                 # refresh public/build
git add -A && git commit -m "…"
git push origin main
```

**On cPanel** → Git Version Control → the repo → **Manage** →
**Update from Remote**, then **Deploy HEAD Commit** (runs `.cpanel.yml` as above).
The seeders are idempotent, so re-seeding on every deploy is safe and keeps
roles/permissions in sync.

**Manual fallback (if the Git deploy tasks can't run):** import
`database/production-seed.sql` into the empty database via phpMyAdmin — it lands
the full schema + admin + roles + warehouse + number series + a populated
`migrations` table in one shot. Do **not** also run `migrate --seed` in that case.

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
