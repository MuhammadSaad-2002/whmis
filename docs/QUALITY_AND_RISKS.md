# WHMIS Quality and Risks

This file tracks verification habits, current coverage, and code areas where
small mistakes can create money, stock, access, or deployment bugs.

## Verification commands

```bash
git status --short
php artisan route:list
php artisan test
npm run build
npm run format:check
```

Avoid `npm run lint` during documentation-only or narrow bug-fix work unless
rewrites are allowed, because the script runs `eslint . --fix`.

## Current test coverage areas

The feature test suite covers authentication, settings, dashboard, notifications,
users, roles, audit log, imports, purchase restock, sales reservation, sales
batch validation, sales incentives, booking flow, Booker scoping/linking,
returns, return cancellation, reports, report netting, stock movement reports,
samples, stock loans, license behavior, financial position, ledger statement
descriptions, list summaries, morph maps, and HTTP smoke coverage.

## Logic hotspots

- Money math: `MarginCalculator` and `resources/js/lib/invoice-math.ts` must stay aligned.
- Stock mutation: `InventoryService` should remain the single mutation path.
- Posting/cancellation: invoice, return, sample, loan, and payment cancellation must reverse effects without losing history.
- Ledger: customer/supplier debit-credit meaning must stay consistent across sales, purchases, returns, and payments.
- Payment invoice lookup uses `PaymentService::openInvoices`: original invoice
  amount minus completed payment allocations minus linked return amounts. Only
  posted sales returns count; cancelled returns/payments must restore capacity.
  Zero/negative balances are excluded. `OpenInvoiceBalanceTest` covers the
  reported paid-plus-returned invoice, partial/cancelled returns and supplier
  returns. Unlinked supplier returns remain party credits, not invoice credits.
- FIFO: sale posting depends on earliest expiry then id unless a batch is explicitly chosen.
- Incentives: rules fill line fields; posting math should not special-case incentive internals.
- Reports: netting returns, bonus quantities, sample/loan segregation, and PHP date grouping exist to keep SQLite tests and MySQL production aligned. Keep invoice-cohort reports distinct from transaction-date activity reports, and always net returned COGS with returned revenue. The Stock on Loan report uses `loan_date`, groups rows by product, includes settled loan transactions, and derives dated returns from stock movements while loan items retain aggregate quantities. Dashboard period figures and charts must use the selected range and `ReportService` math so posted credit/debit notes are deducted consistently.
- Stock-loan return history is derived from the append-only stock movements and
  aggregated by product/day. Do not substitute `closed_at` for a physical return
  date. Cancellation stock reversals share return movement types; cancelled
  loans must not be presented as ordinary returned loans. The Stock on Loan
  period filters loan dates, while return dates and balances reflect current
  lifetime activity for the matching loans.
- Report visualizations are views of the returned rows and totals; they must not
  recalculate or replace server-authoritative financial values. Ranked chart
  definitions are supplied by `ReportVisualizationService` to both Inertia and
  PDF exports, while PDF SVGs are generated server-side for Dompdf compatibility.
- Search pickers: keyboard highlight scrolling must not be overridden by hover events when a highlighted row scrolls beneath a stationary pointer.
- Permissions: frontend hiding is convenience only; route middleware is the boundary.
- License: Super Admin must not be locked out.
- Morph maps: any new morph model must be registered before production use.

## Evidence-backed risks

- `.cpanel.yml` uses tolerant `|| true` deployment tasks. Safe deploys need manual verification because failed migrate/seed/link/clear tasks may not fail the cPanel deployment.
- `vendor/` and `public/build` are intentionally committed for cPanel. Package or frontend changes must update and commit the generated/runtime assets needed by production.
- `CLAUDE.md` contains important existing architecture rules. Keep this docs set and `CLAUDE.md` synchronized or future agents may follow stale guidance.
- The route inventory is large, so route/permission changes should be checked with `php artisan route:list` and at least targeted HTTP tests.
- Manual SQL files in `database/manual/` can drift from migrations if schema changes are made without updating both paths.
- Permission-only DB changes can be missed in production if they do not have a
  manual seed SQL file for phpMyAdmin imports.
- Untracked workspace state can exist. Do not clean or reset files unless explicitly asked.

## Safe-next-work notes

- Add an explicit docs update checklist to future feature PRs or commits.
- When introducing a new report, write tests for totals, return netting, filters, and export shape.
- When introducing a new stock flow, test stock movements, batch quantities, cancellation, and ledger/payment isolation.
- When changing stock-loan people fields, test loan-in internal users separately
  from loan-out outside-party text names and internal handler users.
- When changing permissions, test both route access and frontend navigation/control visibility.
- When changing database schema or seed data, update migrations/seeders and the
  matching `database/manual/*.sql` production import file in the same commit.
- When changing deployment, test the production-like path: committed assets, committed vendor changes, `.cpanel.yml`, migrations, seeders, and `.env.production.example`.
