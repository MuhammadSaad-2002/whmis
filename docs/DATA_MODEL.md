# WHMIS Data Model Notes

This is a practical entity map, not a replacement for migrations. Check
`database/migrations/` before changing schema and `database/manual/` before
changing cPanel/manual deployment assumptions.

## Main entities

- The [integrated workflow](INTEGRATED_DISTRIBUTION.md) adds booking-to-invoice
  line allocations, exact issued batch allocations, pickup event items, daily
  collection submissions, maker-checker requests, named cash/bank entries,
  and invoice/employee commission awards and compensating ledger entries.

### Distribution operations

`booker_visits` is unique per Booker/customer/date. `dispatches` has one optional
tracker per sales invoice; `dispatch_events` and `dispatch_event_items` preserve
delivery actions and signed delivery/correction quantities. A unique request UUID
prevents duplicate event submission. `collection_follow_ups` stores append-only
contact/promise history with assignee, actor, dates and notes. None of these tables
is a stock or financial subledger. Their audit actions attach to the existing
customer/invoice morph aliases, so no additional morph map entries are required.
Schema and permission SQL: `database/manual/2026_11_16_*.sql`.
The optional `customer_delivery_schedules` row holds ISO booking and delivery
weekdays, default Salesman, and the activation timestamp for delivery automation.
`customer_salesman_history` is an append-only log of changes to the default.
It snapshots the previous and new salesman and the editor (IDs and names), with
the change time. It does not backfill old history or drive invoice assignment.
`dispatches.planned_date` is a scheduled date, not a dispatch or delivery event.
Production imports: `2026_11_23_create_delivery_schedules.sql` and
`2026_11_23_seed_salesman_permissions.sql`; existing installations add
`2026_11_24_create_customer_salesman_history.sql`.

### Booking lifecycle timestamps

`created_at` is the first persisted draft, not the business `booking_date`.
`updated_at` tracks the latest header change (including status changes).
`last_edited_at` records the latest successful draft save separately.
`submitted_at`, `rejected_at`, `converted_at`, and `cancelled_at` record server
times for their transitions; `approved_at` already exists. Historically
`approved_at` also stored rejection time; the additive migration copies that
value for currently rejected bookings only. Other unknown historical milestone
times remain NULL; they must not be invented from `updated_at`.
Deploy using the migration or
`database/manual/2026_11_01_add_booking_lifecycle_timestamps.sql`, not both.
These timestamps have no stock, ledger, or calculation effects.

Booking dates, sales invoice dates, and sales due dates are calendar dates
serialized as `YYYY-MM-DD`, not UTC timestamps. Conversion defaults the draft
invoice date to the current Pakistan business date, separately from the source
booking date and the timestamp used for dispatch scheduling.

- Users, roles, and permissions drive access.
- Companies are suppliers in the UI.
- Customers are pharmacies and may have one primary Booker plus many assigned Bookers.
- Products belong to suppliers and categories. `products.visible_to_bookers`
  defaults to true and controls field Booker visibility, not stock or product status.
  Production SQL: [add Booker visibility](../database/manual/2026_11_23_add_booker_visibility_to_products.sql).
- Warehouses hold batches.
- Batches hold stock quantity, expiry, effective cost, and sample/loan flags.
- Stock movements are append-only references to the stock-changing source.
- Invoices, returns, samples, loans, payments, and ledger entries carry the operational history.

## Transaction families

- Purchases: `purchase_invoices` and `purchase_invoice_items`.
- Sales: `sales_invoices`, `sales_invoice_items`, and incentive snapshot rows.
- Bookings: `bookings`, `booking_items`, and booking incentive snapshot rows.
- Returns: `sales_returns`, `sales_return_items`, `purchase_returns`, and `purchase_return_items`.
  Sales-return item `quantity` is total physical units restored; `bonus_quantity`
  is the free portion (defaults to zero for historical returns). Apply the
  matching [manual SQL](../database/manual/2026_11_24_add_bonus_quantity_to_sales_return_items.sql)
  or the Laravel migration before deploying.
- Samples: `sample_receipts`, `sample_receipt_items`, `sample_issues`, and `sample_issue_items`.
- Loans: `stock_loans` and `stock_loan_items`.
- Loan-out outside-party people are stored as text fields on `stock_loans`;
  internal loan handlers remain nullable user foreign keys.
- Finance: `ledger_entries`, `payments`, and `payment_allocations`.

## Lifecycle states

- Invoices: `draft`, `posted`, `cancelled`.
- Bookings: `draft`, `pending`, `approved`, `converted`, `rejected`, `cancelled`.
- Sales returns: current code includes posted/cancelled behavior.
- Payments: includes completed/pending/bounced/cancelled fields in schema.
- Loan stock: managed through post, return, cancel, and close operations.

## Stock truth

- `batches.quantity` is current stock.
- `stock_movements` is the audit trail for stock changes and references the source model morphically.
- Stock-loan return dates are read from `loan_in_return` and `loan_out_return`
  movements referenced to the loan. Multiple batch movements for the same
  product/day are summed for display. `stock_loans.closed_at` is an independent
  administrative closure timestamp, not a return timestamp. Cancellation uses
  the same stock reversal movement types, so cancelled loans are excluded from
  displayed return history and the Stock on Loan report.
- Purchase bonus quantity dilutes `batches.effective_cost`.
- Sales consume FIFO by earliest expiry then id unless a batch is selected.
- Samples and loan stock are segregated through batch flags.
- Sales returns restore billed and bonus units to consumed batches, with
  independent return limits by invoice line. Reports reverse COGS using the
  original sale movement costs. Only billed returns can credit the customer.

## Ledger truth

- `ledger_entries.party` is morphic: customer or supplier.
- Customer debit increases receivable.
- Supplier credit increases payable.
- Payment allocations link payments to sales or purchase invoices morphically.
- Statements and aging are computed from ledger entries and allocation/payment behavior.

## Number series

HR adds `EMP`, `PRL`, and `HRT` employee/payroll/employee-transaction series.

`NumberSeriesService` generates row-locked sequence numbers. Defaults are seeded
by `SystemSeeder`. Existing prefixes include purchase, sales, booking, receipt,
payment, return, adjustment, sample, and loan-related document series.

## Morph maps

`AppServiceProvider` enforces morph aliases for users, customers, companies,
invoices, returns, payments, stock movements, roles, permissions, and related
models. Add any new morph-referenced model there before using it in ledger,
stock, audit, payments, or notifications.

## Manual deployment schema

`database/manual/` contains SQL files for manual cPanel fallback or targeted
schema updates. Keep these aligned with migrations when adding production-facing
tables or columns.

Every DB-related change must include a manual SQL companion when production may
need phpMyAdmin import instead of `artisan migrate` or `artisan db:seed`.
Permission/role seed changes also need manual SQL, even when no migration is
created.

## HR entities and accounting

`employees` optionally links one-to-one to `users`, with department, designation,
and reporting manager FKs. Linked users cannot be deleted/replaced. Employment
dates determine payroll eligibility. No HR feature changes stock quantities.

`employee_salaries` has unique employee/effective-month versions;
`employee_attendances` has unique employee/day records. `hr_leave_types` configures
paid status and annual allowance; `employee_leaves` snapshots paid status and
working-day count, with pending/approved/rejected/cancelled lifecycle.

`payrolls` are draft/approved/posted/cancelled; nullable unique `active_period`
permits replacement only after cancellation. `payroll_items` stores one employee
snapshot per payroll, including base, overtime, bonus, commission, deductions,
recovery, expense, and net salary. Approved/posted payroll locks its inputs.

`hr_transactions` records signed expense, payable, advance, and cash-out changes.
Reversals negate all four amounts and uniquely reference the original row.
Expense/payable arise on posting, not salary payment. Advance recovery offsets
an asset, not expense. HR entries do not enter the trade morphic ledger.
All HR models have audited morph aliases; see [HR_MODULE.md](HR_MODULE.md).

Production companions: `2026_10_31_create_hr_tables.sql` and
`2026_10_31_seed_hr_permissions.sql` under `database/manual/`.

For stock loaning on a production database that does not yet have the module,
import the existing schema SQL files first, then
`database/manual/2026_08_25_seed_stock_loan_permissions.sql`.
