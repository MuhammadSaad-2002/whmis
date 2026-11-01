# WHMIS — Pharmaceutical Distribution ERP

Laravel 12 + Inertia v2 + React 19/TypeScript + Tailwind 4 + shadcn/ui, MySQL.
Single deployable app (cPanel-friendly, no Node on server). Currency PKR, Pakistan
tax fields (GST/NTN/STRN/CNIC).

## Commands

- `php artisan test` — full suite (SQLite in-memory; safe, never touches MySQL dev DB)
- `npm run build` — compile frontend; `npm run dev` for Vite HMR
- `php artisan serve` — local server; login `admin@whmis.local` / `password`
- Local DB: XAMPP MariaDB, database `whmis`, root/no password

## Architecture (read before touching money/stock code)

All business rules live in `app/Services/` — controllers are thin:

- `MarginCalculator` — single source of line/header math (discount → GST → net → margin).
  Mirrored client-side in `resources/js/lib/invoice-math.ts`; **keep both in sync**.
  Server recomputes authoritatively on save/post — never trust client totals.
- `InventoryService` — every stock mutation. Batches are FIFO-consumed by earliest
  expiry then id. `batches.effective_cost` = net purchase ÷ (qty + bonus) — this is
  how bonus stock dilutes cost. `stock_movements` is the append-only truth.
- `InvoicePostingService` — transactional post/cancel for both invoice types.
  Only drafts are editable; posted invoices are cancelled via counter-entries
  (stock + ledger reversal), never deleted.
- `LedgerService` — one morphic `ledger_entries` table for customers (debit =
  receivable up) and suppliers (credit = payable up). Aging = oldest-first netting.
- `PaymentService` — receipts/payments + allocations; cash invoices auto-settle on post.
- `NumberSeriesService` — row-locked sequences (PI-YYYY-0001, SI-, BK-, RCV-, PAY-, ADJ-).
- `IncentiveEngine` — matches `incentive_rules` by scope (customer > product > company > global,
  then priority) and computes line effects (bonus/discount/price). Rules only FILL line fields;
  posting math never special-cases them, so manual override is free. F4 in grids → `/lookup/rules`.
- `BookingService::convertToSale` — approved booking → linked draft sales invoice
  (sale_type `booking`); stock is NOT reserved, checked only at posting.
- Credit limit enforced in `InvoicePostingService::postSale` for non-cash sales.

Morph map is enforced in `AppServiceProvider` — register any new morphed model there
or it throws.

RBAC: spatie/laravel-permission; permissions like `sales.post` are route middleware
(`can:`) and shared to React via `HandleInertiaRequests` → `usePermissions()` hook.

## Employees and HR (October 2026)

Read `docs/HR_MODULE.md` before changing payroll or employee finance. `HrService`
owns salary/attendance/leave and payroll lifecycle. `hr_transactions` is an
append-only employee subledger (expense/payable/advance/cash-out), integrated
into financial position and aggregate profit reporting. Do not put employee
payments into customer/supplier ledger entries or change product COGS. Production
needs the matching HR schema and additive permission SQL in `database/manual/`.

## Frontend conventions

- Pages in `resources/js/pages/<module>/`; use `AppLayout`, `route()` (Ziggy),
  `Paginator`, `money/amount/qty` from `lib/format.ts`.
- Invoice entry grids: `useKeyboardGrid` hook (Enter/↑↓/F2) + `useInvoiceHotkeys`
  (F8 save, F9 post) + `ProductSearchDialog`. Purchase and sales forms each own
  their table markup.
- Flash messages: controllers `->with('success'|'error', …)`; rendered by
  `FlashToaster` (sonner) in the layout.

## Phase 3 additions

- **Returns** post immediately (no draft): `ReturnService` — sales returns restore stock to
  the batches the invoice consumed (capped by consumed−already-returned per batch), refund
  proportional to line net; credit_note/debit_note ledger entries. Series SR-/PR-.
- **Notifications**: single `SystemAlert` class + `AlertService` (dedup by unread type+entity);
  `whmis:check-alerts` scheduled daily (low stock/expiry/overdue); booking submit and
  credit-limit block also notify. Bell in header polls `/notifications` every 60s.
- **Reports**: registry in `ReportService::catalog()`; every report returns
  {columns,rows,totals,chart?} rendered by the ONE generic `reports/show.tsx` page and the
  same-shaped xlsx (`ReportExport`) / PDF (`pdf/report.blade.php`). Adding a report is one
  method plus one catalog entry. Date grouping in PHP, not SQL (SQLite tests ≡ MySQL).
- **Excel import**: `ProductsImport`/`CustomersImport` upsert by name, per-row errors; shared
  `import-dialog.tsx`; template downloads.
- **Charts**: `trend-chart.tsx` (recharts, 2 series, colors from validated dataviz palette,
  theme-aware) on dashboard + profit-by-month report.
- **Grid Enter circuit**: `useKeyboardGrid` accepts `enterOrder` (cols Enter visits; last →
  next row's first). Line GST %/remarks/rule cells are skipped but Tab-reachable. Last header
  field (Invoice GST % / booking date) hands off to grid cell (0,0). Price/percent inputs
  normalize to 0.00 on blur via `dec2` in lib/format.ts.

## Roadmap state (2026-07-06)

Phases 1–3 complete (71 tests). "Companies" renamed to "Suppliers" user-facing only
(routes `/suppliers`, permissions `suppliers.*`) — internal names unchanged. Enter-as-Tab in
all plain forms via `resources/js/lib/enter-to-next.ts` (scoped to form/dialog/[data-enter-nav]).

Remaining (Phase 4): multi-warehouse UI + transfers, barcode, WhatsApp/email invoice sharing,
attachments, approval workflows, scheduled reports, user-management screen, backup command.
