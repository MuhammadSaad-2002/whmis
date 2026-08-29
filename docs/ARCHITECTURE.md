# WHMIS Architecture

WHMIS is a single Laravel application with an Inertia React frontend. Routes
return Inertia pages for interactive screens and Blade views for PDFs.

## Request and UI flow

- Browser requests hit Laravel routes in `routes/web.php`, `routes/auth.php`, and `routes/settings.php`.
- Authenticated app routes are wrapped in `auth` and `licensed`.
- Route-level permissions use `can:<permission>`.
- Controllers load data, validate request payloads, call services, and return Inertia pages or redirects with flash messages.
- React pages live under `resources/js/pages/<module>/`.
- Shared navigation is defined in `resources/js/components/nav-config.ts` and filtered by permissions shared from `HandleInertiaRequests`.
- Ziggy `route()` names are the frontend route contract.

## Backend layering

- Controllers: HTTP orchestration, validation, redirects, Inertia props.
- Services: business rules and transactional side effects.
- Models: relationships, casts, query scopes, and audit participation.
- Seeders: baseline roles, permissions, warehouse, number series, admin user, and initial license.
- Migrations plus `database/manual/`: schema history and manual cPanel fallback SQL snippets.

## Core services

- `MarginCalculator`: purchase/sale line math, invoice totals, discount, GST, profit/margin.
- `InventoryService`: stock receipts, FIFO consumption, reservation, sample/loan stock, returns, movements, and adjustments.
- `InvoicePostingService`: purchase and sale post/cancel transactions.
- `ReturnService`: immediate sales/purchase return posting and sales return cancellation.
- `SamplePostingService`: sample receipt/issue post/cancel transactions.
- `StockLoanPostingService`: loan stock post, return, cancel, and close.
- `LedgerService`: morphic customer/supplier ledger, outstanding, aging, financial position, statements.
- `PaymentService`: receipts/payments, allocations, auto-settlement, cancellation.
- `BookingService`: approved booking to draft sales invoice conversion.
- `IncentiveEngine`: incentive matching and line effect calculation.
- `ReportService`: report catalog and uniform report payloads.
- `DashboardService`: executive dashboard payload.
- `LicenseService`: license status, activation, and banner payload.
- `AlertService`: permission-targeted notifications.
- `NumberSeriesService`: row-locked document number generation.

## Stock and finance flow

- Purchase posting receives stock into batches and credits suppliers.
- Sales posting consumes stock by FIFO or selected batch, checks credit limits for non-cash sales, calculates profit/cost, and debits customers.
- Cash invoices auto-settle through payments.
- Returns create stock and ledger counter-effects.
- Cancellation reverses prior stock, ledger, and payment effects instead of mutating history.
- Samples and loan stock are segregated from normal trade stock through batch flags and dedicated posting services.

## Auth, license, and audit

- Laravel session auth protects app routes.
- Spatie permissions gate routes and frontend controls.
- `EnsureLicensed` redirects non-Super-Admin authenticated users to `license/locked` when no valid license exists.
- Super Admin is the vendor/system role and is not license-gated.
- Auditable models use OwenIt auditing and custom `AuditLogger` entries for permission sync and important admin events.
- Morph maps are enforced in `AppServiceProvider`.

## Runtime and deployment

- Local development can use `composer dev` for server, queue listener, logs, and Vite.
- Production uses committed PHP dependencies and compiled assets.
- `.cpanel.yml` is tolerant with `|| true`, so deployment may not hard-fail even if a task did not run. Verify production after deploy.
- Queue, session, and cache drivers can use database tables created by migrations.
