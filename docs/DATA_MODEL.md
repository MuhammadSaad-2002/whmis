# WHMIS Data Model Notes

This is a practical entity map, not a replacement for migrations. Check
`database/migrations/` before changing schema and `database/manual/` before
changing cPanel/manual deployment assumptions.

## Main entities

- Users, roles, and permissions drive access.
- Companies are suppliers in the UI.
- Customers are pharmacies and may have one primary Booker plus many assigned Bookers.
- Products belong to suppliers and categories.
- Warehouses hold batches.
- Batches hold stock quantity, expiry, effective cost, and sample/loan flags.
- Stock movements are append-only references to the stock-changing source.
- Invoices, returns, samples, loans, payments, and ledger entries carry the operational history.

## Transaction families

- Purchases: `purchase_invoices` and `purchase_invoice_items`.
- Sales: `sales_invoices`, `sales_invoice_items`, and incentive snapshot rows.
- Bookings: `bookings`, `booking_items`, and booking incentive snapshot rows.
- Returns: `sales_returns`, `sales_return_items`, `purchase_returns`, and `purchase_return_items`.
- Samples: `sample_receipts`, `sample_receipt_items`, `sample_issues`, and `sample_issue_items`.
- Loans: `stock_loans` and `stock_loan_items`.
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
- Purchase bonus quantity dilutes `batches.effective_cost`.
- Sales consume FIFO by earliest expiry then id unless a batch is selected.
- Samples and loan stock are segregated through batch flags.
- Sales returns restore stock to consumed batches, capped by consumed minus already returned quantities.

## Ledger truth

- `ledger_entries.party` is morphic: customer or supplier.
- Customer debit increases receivable.
- Supplier credit increases payable.
- Payment allocations link payments to sales or purchase invoices morphically.
- Statements and aging are computed from ledger entries and allocation/payment behavior.

## Number series

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
