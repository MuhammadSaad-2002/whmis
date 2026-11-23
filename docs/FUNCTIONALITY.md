# WHMIS Functionality Index

Payment allocation lookups show only positive invoice balances after completed
payments and linked returns. Posted sales return credits and purchase return
debits reduce the amount due; cancelled sales returns and cancelled payments
are excluded. This calculation uses existing records, including historical
returns, without altering invoice totals or ledger entries.

This inventory describes the current product surface and the code areas most
likely to matter when changing each module.

## Overview and workspace

- Dashboard: `/dashboard`; Booker users receive their own-data dashboard, while users with `dashboard.executive` receive Executive Overview. Its period menu defaults to 12 months and includes Today, Yesterday, This Month, Last Month, rolling 3/6/9/12 months, Year to Date, and a custom date range. Both ends are inclusive and presets use Pakistan business dates. Period KPIs and the sales/profit/margin and stock build-up charts use posted sales net of credit notes and purchases net of debit notes. Rankings use their underlying product and customer profitability reports; percentage shares use the total positive net revenue for that report's population. Top Products switches between revenue and share; chart legends toggle series. Recent Sales filters, searches and sorts the latest eight invoices.
- Receivables aging, loan quantities, expiring in-stock batches, invoice pipeline and staff balances are current snapshots. Working-capital days are estimates using current balances and the selected period's sales, COGS and purchases; missing activity yields no estimate.
- Period changes request only date-dependent dashboard props. The original view,
  chart legends, and invoice search remain in place while the update loads.
  Snapshot cards keep their timestamp; **Refresh dashboard data** in the period
  menu updates them without navigating away. Charts draw immediately on first
  load, then animate data changes unless reduced motion is enabled.
- Executive Overview's Export PDF opens the browser's print-to-PDF view with charts. The server-generated summary remains at `/dashboard/executive/pdf`.
- Workspace: `/workspace`. Ordinary links and the top bar navigate in the
  current view. **Back** restores the previous screen's list filters and scroll.
  Desktop booking, sale, and purchase rows have a separate **Open in workspace
  tab** action for comparing records. The strip appears only when multiple tabs
  are open and is hidden on phones and narrow tablets. Tab URLs restore only in
  the same authenticated session and browser tab; a new login starts at home.
- Booking, sale, and purchase drafts prompt **Stay**, **Discard**, or **Save
  Draft** before leaving, closing a workspace tab, or logging out. A failed
  save keeps the editor open. The browser shows its own warning for browser
  close or reload.
- All roles use the top bar. Wide screens show permitted **Daily Work** links
  with remaining pages under **More**. Narrow screens use **Pages**.
- Field Bookers can change the workspace appearance, but their profile and
  signed-in password settings and account deletion are not self-service.
- Navigation source: `resources/js/components/nav-config.ts`.

## Master data

- Suppliers: `/suppliers`; implemented by `CompanyController` and `Company`.
- Categories: `/categories`; implemented by `ProductCategoryController`.
- Products: `/products`, product import, and product template download.
  Product editors can turn off **Show to Bookers** per product. The default is
  on. This hides products from field Booker searches and new orders without
  deactivating the product for staff or changing saved orders.
- Customers: `/customers`, customer import, template download, primary Booker, assigned Bookers, and assignment audit.
- Incentive rules: `/incentives`; supports global, supplier, product, and customer scopes.

## Transactions

- Booker Workday (`/booker/workday`): assigned-customer visit planning, account
  balances, customer-preselected bookings and repeat quantities at current prices.
- Dispatch (`/dispatch`): posted invoice picking/packing, staff assignment, dated
  partial delivery attempts, corrections, return-settled closure and basic picking
  list printing. Tracking does not move stock or create payments.
  Salesmen work their assigned deliveries, and Admins can set customer booking
  and delivery weekdays and print a daily stop sheet per assignee.
- Collections (`/collections`): live positive invoice balances, return/payment
  breakdown, overdue/latest-follow-up filters, responsible staff and promises.
  Follow-ups do not settle invoices. See [DISTRIBUTION_OPERATIONS.md](DISTRIBUTION_OPERATIONS.md).

- Purchases: list/create/edit/post/cancel/duplicate/print under `/purchases`.
- Sales: list/create/edit/post/cancel/print/summary/net-position under `/sales`.
  The list includes status counts, date presets, sortable net-of-return figures,
  an invoice preview, CSV export, and printing or posting selected rows. Posting
  still requires `sales.post` and uses the same stock and credit checks as the
  invoice editor.
- Bookings: draft, submit, approve, reject, cancel, and convert to linked draft sales invoice.
- On phones and tablets the booking form puts customer selection above compact
  product cards. Product selection opens a searchable dialog; each card keeps
  quantity, bonus, unit price, incentives, and line total within reach. Optional
  details and adjustments expand on demand, and Discount/GST validation errors
  expand their fields automatically. Read-only bookings show item values as text.
  The footer keeps the total and enabled workflow actions visible, with a
  collapsible subtotal breakdown. Desktop retains its grid and keyboard shortcuts.
- Booking lists show first-save and latest-change timestamps, with current-status
  time. On phones and tablets, bookings appear as cards with collapsible filters
  and timestamp details. The desktop table retains keyboard navigation.
  The form's expandable activity panel shows creation, last draft save,
  submission, approval/rejection, conversion, and cancellation in Asia/Karachi
  (PKT), independently of the business booking date. This is a milestone summary,
  not a log of every draft save. Unknown historical times remain unrecorded.
- Reopened bookings load supplier, current retail price, and live stock for the
  booking warehouse using the same quantity aggregation as the product picker.
  Saved quantities, bonuses, trade prices, discounts, tax, remarks, and incentive
  selections remain on the booking items; displayed stock is current, not a
  historical stock snapshot or reservation.
- The field-Booker booking form hides booking date, warehouse, and supplier
  labels (including product search); booking approvers retain these details.
  Hidden date/warehouse values are retained, and stock/retail remain visible.
  The incentive picker wraps mobile rule details, bounds its scroll area to
  the viewport, and provides a Done button without changing rule eligibility.
- Returns: sales and purchase return flows under `/returns`; lookups expose returnable invoice/item data.

## Samples

- Sample receipts: free-of-charge stock in from supplier, draft/edit/post/cancel/print.
- Sample issues: free-of-charge stock out to customer, draft/edit/post/cancel/print.
- Sample flows do not create money or ledger entries; they use segregated stock.

## Stock loans

- Loan stock in and out use `/loans/in` and `/loans/out`.
- Flows support create/edit/post/record return/cancel/close.
- Loan stock is segregated from normal stock and reports outstanding stock by partner and product. Loan reporting and dashboard totals keep loan-out and borrowed-in quantities separate; the report can filter and group by direction.
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
  The PDF opens with a chart summary; receivables, payables, and payment activity
  tables start on page two and continue if necessary.
  Expand a customer or supplier for unpaid documents. The date window filters paid
  amounts and the payments log, not the current ledger balances or aging. The
  settlement planner is a preview and does not record transactions.
  The shared payment form fills allocations oldest invoice date first, then invoice
  ID; staff can override them or leave funds on account. Editing the total restores
  automatic allocation.
- Customer statements: `/ledger/customers/{customer}` and PDF.
- Supplier statements: `/ledger/suppliers/{company}` and PDF.
- Ledger is morphic across customers and suppliers.

## Reports

Reports are registered in `ReportService::catalog()` and rendered by the generic
reports page/export pipeline. The reports centre groups report definitions by
business area, and report datasets can declare a `group_by` field for grouped
table presentation.

`product-sales` is an invoice-cohort profitability report: the date range selects
sales invoices, then every posted return against those invoices is netted from
quantity, revenue, and COGS. `product-sales-daily` remains an activity-by-date
report and buckets returns on their actual return date.

`all-time-product-cogs` has no date range. It presents lifetime billed quantity,
bonus units, returned quantity, net quantity sold, gross COGS, return COGS, and
net COGS per product, with grand totals and an optional supplier filter.

**Supplier Purchase Value & Net Sales** lists all-time posted sales by supplier
through today's Pakistan business date. Products appear first, showing billed,
bonus, and returned units and **Purchase Value** (posted COGS net of return cost).
The second table shows one row per invoice/supplier with the customer's name,
sale date, purchase value, the full invoice total for reference, and the supplier’s
net sale value. Supplier revenue includes its proportional share of header
discount and tax, less posted return credits. Product and invoice purchase
totals reconcile; full invoice totals are not added across suppliers. Excel
and PDF include both sections. For a single supplier, neither table repeats
the supplier column, and the PDF highlights the supplier in its header.
The closing summary shows total purchase value, total net sale value, and
gross profit before operating expenses.
Archived products remain in sales history.

`all-time-purchases-stock` (Reports → Inventory → All-Time Purchases, Sales & Stock)
shows one row per product and a grand total. Its only filter is the product's
supplier, with no supplier column. Net Purchased and Net Sold include bonus units
and deduct effective purchase and posted sales returns respectively. On Hold
counts all draft sales invoice units, including drafts without reservations.
Stock on Hand adds available and reserved batch stock. Available Now reads the
live available quantity, which already accounts for reservations and stock
movements. Both stock columns exclude sample and borrowed-in stock. Excel and
PDF use the same figures.

`stock-on-loan` uses `stock_loans.loan_date` as the transaction date and returns
one row per loan item within the selected period. Posted, partially returned,
returned, and closed loans are included; pending drafts and cancelled loans are
excluded. Rows are grouped by product and ordered by date, then show direction,
loan number, partner, quantities, and the people involved. For loan-out rows,
`Received By` is the outside-party name while `Request Received By` and
`Handed Over By` are internal WHMIS users. For loan-in rows, `Received By` is the
internal WHMIS receiver. The returned quantity remains the aggregate stored on
the loan item. Return dates and quantities come from append-only stock movements,
grouped by product and calendar day. The register shows the latest physical
return date; the loan detail shows the complete dated return history, even after
the loan is fully returned and editing is disabled. A separate closure date is
shown when a loan is manually closed, since closure does not itself move stock.
The report also totals units received on loan, sent on loan, received back,
and returned to the partner separately, so opposite flows are not combined.
The report date range selects loans by loan date; their return dates and current
balances can be later than the selected range. Loan-in means stock received from
the partner and returned to them; loan-out means stock sent to the partner and
received back from them. Cancelled loans are excluded from the report because
their inventory reversals are not ordinary returns.

Current report keys:

- `sales-register`
- `product-sales`
- `all-time-product-cogs`
- `all-time-purchases-stock`
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

The shared report screen adds four headline totals when totals are available,
report-specific ranked charts with metric/top-count/order controls, and a sticky
scrollable table with a frozen first column. Report filters live in a compact
collapsible panel: dates, entity selections, direction, expiry, and ordering are
all staged locally and only update the report when **Apply Filters** is clicked.
Cancel discards staged changes, while date quick presets only prepare the range
for the same explicit apply action. Excel and PDF continue to use the same
server-authoritative report rows and totals. PDF exports include server-rendered
SVG visualizations: a top-10 ranked chart for reports with ranked metrics and a
sales/profit trend graph when the report supplies time-series chart data.
Negative report values are highlighted and carry an information tooltip that
explains the likely row-level cause from revenue, returns, COGS, quantities, or
balances. PDFs render the same negative values in red with a printable guide.

## Human Resources

- `/hr/employees`: employee/Booker register and profiles; salary versions on profiles.
- Booker profiles include searchable bulk customer assignment through
  `/hr/employees/{employee}/customers`; active assignments populate new bookings.
- `/hr/attendance`: dated attendance, overtime, corrections before payroll lock.
- `/hr/leave`: leave requests, approvals, rejections, cancellations.
- `/hr/payroll`: monthly draft generation, review, approval, posting, reversal.
- `/hr/finance`: salary payments, recoverable advances/repayments, reversals.
- `/hr/settings`: departments, designations, annual leave policy.
- `/hr/my-profile`: linked employee self-service, own leave requests and payslips.
- `/hr/payslips/{item}/pdf`: posted/cancelled payslip PDF, owner or payroll viewer only.
- Eight `hr-*` reports are registered by `HrReportService` under Human Resources,
  with generic Excel/PDF export and selected ranked charts.
- Financial position includes employee advances/payables/cash; dashboards and
  monthly profit report show payroll expense and profit after payroll separately
  from sales contribution. See [HR_MODULE.md](HR_MODULE.md) for formulas and limits.

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
