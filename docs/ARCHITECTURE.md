# WHMIS Architecture

WHMIS is a single Laravel application with an Inertia React frontend. Routes
return Inertia pages for interactive screens and Blade views for PDFs.

## Request and UI flow

- Browser requests hit Laravel routes in `routes/web.php`, `routes/auth.php`, and `routes/settings.php`.
- Authenticated app routes are wrapped in `auth` and `licensed`.
- Route-level permissions use `can:<permission>`.
- Controllers load data, validate request payloads, call services, and return Inertia pages or redirects with flash messages.
- React pages live under `resources/js/pages/<module>/`.
- Instrument Sans is self-hosted from the [upstream Instrument font files](https://github.com/Instrument/instrument-sans/tree/7fa22308a3d0c94ee2b3cd537a1196b65db34a3e/fonts).
  Vite builds the variable WOFF2 faces from `resources/fonts/`. PDF views embed
  static TTF faces from `public/fonts/instrument-sans/`, which also contains the
  SIL Open Font License. Dompdf caches metrics in writable `storage/fonts/`.
- Shared navigation is defined in `resources/js/components/nav-config.ts` and filtered by permissions shared from `HandleInertiaRequests`.
- `workspace/index.tsx` hosts the active Inertia view. `lib/embedded.ts` handles
  in-place visits and per-view Back. Explicit desktop record actions may mount
  more frames. Booking, sale and purchase editors use `hooks/use-draft-leave.tsx`
  to prevent losing edits. Laravel still authorizes all requests.
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
- `DashboardService`: executive dashboard props, split into lazily resolved
  period and snapshot data. Inertia period visits skip snapshot queries; the
  server PDF still resolves a complete data set.
- `LicenseService`: license status, activation, and banner payload.
- `AlertService`: permission-targeted notifications.
- `NumberSeriesService`: row-locked document number generation.
- `HrService`: employee attendance/leave validation, salary versions, payroll snapshots,
  approval/posting locks, employee cash entries, and counter-entry reversals.
- `HrReportService`: HR report registry and signed employee subledger totals,
  consumed by existing dashboards, reports, and financial position.

HR uses `HrController`, `resources/js/pages/hr/`, and `pdf/payslip.blade.php`.
It has a dedicated `hr_transactions` employee subledger; trade ledger and stock
services remain unchanged. See [HR_MODULE.md](HR_MODULE.md) for accounting policy.

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

- Distribution operations use `DispatchService`, `CollectionService`,
  `InvoiceBalanceService`, `OperationsController`, and `BookerWorkdayController`.
  Invoice balances are shared with customer payment allocation lookups.
  Operational events reference existing invoices but never repost stock or money.
- `whmis:provision` applies additive upgrade seeds; `whmis:doctor` and
  `/system/health` expose read-only readiness checks. See
  [DISTRIBUTION_OPERATIONS.md](DISTRIBUTION_OPERATIONS.md).

- Local development can use `composer dev` for server, queue listener, logs, and Vite.
- Production uses committed PHP dependencies and compiled assets.
- `.cpanel.yml` now chains migration, provisioning, cache clearing, and readiness
  checks so failures are not suppressed. App-up and an existing storage link
  remain tolerant. Verify the production workflows after deployment.
- Queue, session, and cache drivers can use database tables created by migrations.
