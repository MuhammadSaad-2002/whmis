# WHMIS Project Context

WHMIS is a pharmaceutical distribution ERP for Pakistan-market wholesale flows.
It manages suppliers, products, pharmacies/customers, purchases, sales, bookings,
returns, sample stock, loan stock, inventory, payments, ledgers, reports,
notifications, users, roles, audit logs, and license control.

## Stack

- Backend: Laravel 12, PHP 8.2+.
- Frontend: Inertia v2, React 19, TypeScript, Vite 6, Tailwind 4, shadcn/Radix components.
- Auth and authorization: Laravel session auth with Spatie Laravel Permission.
- Database: SQLite for tests/local starter config; MySQL/MariaDB for production.
- Exports: dompdf for PDFs and PhpSpreadsheet/Laravel Excel for XLSX/imports.
- Deployment: single cPanel-friendly Laravel app, with committed `vendor/` and `public/build` for production pulls.

## Domain language

- Supplier is user-facing language for `Company` internally.
- Customer means pharmacy/customer receiving products.
- Booker means field/user role assigned to customers and bookings.
- Batch is the stock unit, with expiry, quantity, cost, and flags for sample or loan stock.
- Bonus quantity dilutes effective purchase cost and can be granted on sales/incentives.
- Posted means financially and/or stock-effective.
- Cancelled means reversed by explicit counter-effects.

## Current module map

- Overview: dashboard and executive dashboard.
- Workspace: tabbed shell for in-app navigation.
- Master data: suppliers, categories, products, customers, incentive rules.
- Transactions: bookings, purchase invoices, sales invoices, returns.
- Special stock: sample receipts/issues and loan stock in/out.
- Finance: payments, party ledgers, financial position, auto-settlements.
- Inventory: stock position, batches, movements, adjustments.
- Reporting: registry-driven reports using one generic report view/export shape.
- Administration: users, roles, permission catalog, audit log, Booker assignment log, license screen.

## Deployment model

Production is documented in `DEPLOYMENT.md`. The target model is a cPanel Git
deployment where the server needs PHP and MySQL only. `.cpanel.yml` runs
`artisan up`, migrations, seeders, `storage:link`, and `optimize:clear`.

Secrets stay out of Git. Production `.env` is created on the server from
`.env.production.example`.

## Current-state notes

- Self-registration is disabled; users are provisioned by Super Admin/admin flows.
- The seeded login is `admin@whmis.local` / `password`; production docs require changing it immediately.
- The scheduler runs `whmis:check-alerts` daily at 08:00 when cron calls `artisan schedule:run`.
- Existing docs and generated assets under `docs/commercial`, `docs/presentation`, `public/build`, and `vendor` are intentional for this deployment model.
