# WHMIS Functionality Index

This inventory describes the current product surface and the code areas most
likely to matter when changing each module.

## Overview and workspace

- Dashboard: `/dashboard`; Booker users receive own-data dashboard, while users with `dashboard.executive` receive the executive dashboard.
- Executive PDF: `/dashboard/executive/pdf`.
- Workspace: `/workspace`; tabbed shell that hosts the app navigation experience.
- Navigation source: `resources/js/components/nav-config.ts`.

## Master data

- Suppliers: `/suppliers`; implemented by `CompanyController` and `Company`.
- Categories: `/categories`; implemented by `ProductCategoryController`.
- Products: `/products`, product import, and product template download.
- Customers: `/customers`, customer import, template download, primary Booker, assigned Bookers, and assignment audit.
- Incentive rules: `/incentives`; supports global, supplier, product, and customer scopes.

## Transactions

- Purchases: list/create/edit/post/cancel/duplicate/print under `/purchases`.
- Sales: list/create/edit/post/cancel/print/summary/net-position under `/sales`.
- Bookings: draft, submit, approve, reject, cancel, and convert to linked draft sales invoice.
- Returns: sales and purchase return flows under `/returns`; lookups expose returnable invoice/item data.

## Samples

- Sample receipts: free-of-charge stock in from supplier, draft/edit/post/cancel/print.
- Sample issues: free-of-charge stock out to customer, draft/edit/post/cancel/print.
- Sample flows do not create money or ledger entries; they use segregated stock.

## Stock loans

- Loan stock in and out use `/loans/in` and `/loans/out`.
- Flows support create/edit/post/record return/cancel/close.
- Loan stock is segregated from normal stock and reports outstanding stock by partner and product.
- Loan stock out stores outside-party requested/received people as text names,
  while request-received-by and handed-over-by remain internal user fields.

## Inventory

- Inventory summary: `/inventory`.
- Batches: `/inventory/batches`.
- Movements: `/inventory/movements`.
- Adjustments: `/inventory/adjustments`.
- All stock changes should pass through `InventoryService`.

## Finance

- Payments: `/payments`; supports receipts/payments, allocations, and cancellation.
- Ledger position: `/ledger/position` and PDF export.
- Customer statements: `/ledger/customers/{customer}` and PDF.
- Supplier statements: `/ledger/suppliers/{company}` and PDF.
- Ledger is morphic across customers and suppliers.

## Reports

Reports are registered in `ReportService::catalog()` and rendered by the generic
reports page/export pipeline.

Current report keys:

- `sales-register`
- `product-sales`
- `product-sales-daily`
- `customer-sales`
- `booker-sales`
- `incentives-given`
- `purchase-register`
- `supplier-purchases`
- `bonus-analysis`
- `stock-position`
- `stock-movement`
- `expiry`
- `sample-stock`
- `sample-movement`
- `sample-issue-product`
- `sample-issue-recipient`
- `slow-fast-moving`
- `stock-on-loan`
- `outstanding`
- `supplier-payables`
- `profit-by-month`

Adding a report should mean one catalog entry, one service method, and tests for
its aggregation/netting behavior.

## Administration

- Users: create/update/password/toggle/delete.
- Roles: create/update/delete and sync permissions.
- Permission catalog: view grouped permissions and role membership.
- Audit log: view model/admin events.
- Booker assignments: append-only customer-to-Booker assignment history.
- License: Super-Admin/vendor-managed activation and current key history.

## Notifications and imports

- Notifications: bell API under `/notifications`, read/read-all actions, and `SystemAlert`.
- Scheduled alerts: `whmis:check-alerts` for low stock, expiry, and overdue signals.
- Imports: product and customer Excel imports with templates and per-row error handling.

## PDFs and documents

- Purchase invoice, sales invoice, statements, sales net position, financial position, executive dashboard, samples, and generic reports use Blade PDF views under `resources/views/pdf/`.
