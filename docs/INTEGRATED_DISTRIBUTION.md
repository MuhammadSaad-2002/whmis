# Integrated distribution, Treasury and commissions

## Daily workflow

1. Booker creates and submits a booking. The Admin approves it and uses **Invoice
   quantities** to create one or several draft sales invoices. The original
   booking shows approved, committed to drafts, posted, closed and uninvoiced
   units, including bonus quantities. A draft conversion holds booking capacity
   only; it does not move inventory. Cancelling the split draft releases its
   booking capacity and any stock reservations from later draft saves.
2. Post the invoice to deduct stock and create the receivable. Posting records
   actual FIFO/selected batches and schedules the Salesman from an active invoice
   override or the customer’s default. It picks the next configured delivery
   weekday (today if none are set). Saving a default also assigns eligible pending
   invoices. The planner never replaces an explicit assignment. Historical
   untracked invoices stay untracked until an Admin explicitly starts them.
3. Salesman opens **My Workday → Assigned deliveries**. A combined Booker and
   Salesman login still sees its assigned-customer booking section. In Dispatch,
   record actual batch pickups, confirm the complete pickup, then dispatch and
   record customer acceptance. Partial delivery is permitted after full pickup.
   Changing a custodian requires a Manager request and incoming Salesman
   acceptance. Requested handovers and put-backs do not move ERP stock.
   The Admin delivery detail shows assignment, shipment totals, item and batch
   progress, and history alongside the actions they can take. The Salesman's
   mobile detail uses batch pickup cards and a bottom action bar. Recording a
   partial delivery leaves undelivered units open; it does not create a return.
   On the Admin board, drag an invoice or use its **Move** button. The move
   form enforces the same sequence and asks for actual quantities, the recipient,
   or a reason when required. Admins who verify an assigned Salesman's activity
   are recorded as the actor, and the Salesman keeps custody and delivery credit.
   The Salesman still reports their own collections.
4. Report cash, online transfer, both, or no payment during delivery. My Workday
   and Dispatch allow collection only up to the open invoice balance minus any
   unverified amounts already reported for that invoice, across all days. When
   reports cover the balance, the collection controls disappear without marking
   the invoice paid. If Finance verifies less, the remaining balance can be
   collected. Submit the date's
   **Daily Collection Summary**; later reports create supplements. In **Daily
   Payment Reconciliation**, Finance can save a denomination breakdown or an
   overall cash total. Saving the count does not post a payment. If the count
   matches all cash reports and the invoice balances still cover them, **Post
   cash receipts** records a separate allocated receipt for each pending cash
   report in one transaction. Verify bank transfers and any discrepancies by
   invoice instead. The collection shows its receipt number and reviewer. Posting
   checks the live invoice balance and the unposted portion of the cash count.
   Amount changes and day variances have separate reasons and approval history.
5. Example: if PKR 20,000 was reported but 19,500 counted, post 19,500 by default.
   Finance may request a proof-backed 500 employee shortage. A distinct reviewer
   approves; Finance applies that approval on the collection row. The invoice is
   credited 20,000 but the till receives only 19,500. The difference appears as
   employee shortage receivable and can be repaid through an approved Treasury
   receipt. It is not a salary deduction. Final daily closure requires review of
   any remaining variance. Daily collection and account ledger CSVs are available.

## Cash & Bank and credits

- Create named tills, petty cash, bank or custody accounts in **Cash & Bank**;
  assign account operators. Opening amounts are prepared before go-live. In
  **Finance Approvals**, submit the cutover date, reconciled account snapshot and
  supporting document. A different authorized login approves, then Finance locks
  the opening. New accounts after lock start at zero; balance changes are approved
  entries. Pending reports and approvals never affect real funds.
- The Cash & Bank account panel has separate **Ledger** and **Settings &
  operators** tabs. Filters change which posted movements appear, not their
  running balances. The approvals drawer previews accessible requests; use the
  request screen for independent review and posting. Delegated limits govern
  reviewer authority, not automatic posting.
- **Finance Approvals** shows status totals and a searchable request queue
  scoped to the signed-in user. Select a request to inspect its status, review
  notes and private evidence. The New Request dialog uses the same approval,
  posting and withdrawal rules as the underlying workflow.
- A transfer posts one debit and one credit in the same transaction and changes
  no company-wide cash flow. Account counts and bank statements record expected,
  actual and variance; these do not automatically create a cash adjustment.
  After go-live, customer and supplier payments, HR finance, customer refunds and
  commission cash flows require a valid account. A distribution sale marked cash
  means cash expected, not cash received, after go-live. Existing historical
  cash settlements are not restated.
- An optional cutover obligations CSV has the exact header:

  ```csv
  type,reference,date,invoice_id,salesman_id,method,amount,payment_id,included_in_opening,employee_id,role,opening_account_id
  ```

  Supported types are `collection`, `refund`, `supplier_outstanding`,
  `commission_due`, and `cash_shortage`. Use a unique supporting reference and
  pre-cutover date and invoice. `collection` requires a Salesman and `cash` or
  `online`; provide the existing completed receipt ID if already posted and
  `yes` in `included_in_opening` only if the funds are in the identified
  `opening_account_id` balance. A
  `cash_shortage` requires an existing linked posted receipt and Salesman;
  `commission_due` requires employee and `booker` or `salesman`, with a
  fully settled historical invoice. Supplier amounts match existing invoice
  balances; refunds are reviewed before payout. Unmatched or duplicate items
  stop the opening transaction. Imports never recreate historical customer or
  supplier posting or invent completed deliveries.
- From Sales Invoice Summary, request **Process refund** or **Apply credit** only
  when unused return/cancellation credit is backed by received funds. A refund
  requires independent approval, a selected account, and confirmation of actual
  payment. Applying credit moves no cash and settles another open invoice of
  the same customer. The original refund stays visible permanently. Use
  **Reversal impact** before reversing a receipt or posted return. Withdraw
  pending dependent requests, release applied credits, or approve and record a
  refund recovery/financial correction before undoing a funding transaction.

## Commission policies and accounting

- Configure rules in **Employee Commissions** by source, role, effective date,
  optional employee or booking override. Booker attribution stays linked to the
  original booking; direct sales require explicit originator and an applicable
  rule. Percentage rates use net eligible goods after discounts and returns,
  excluding tax. Approved-order basis is also capped by the retained invoiced
  value of the same goods. Salesman attribution uses actual retained deliveries;
  a snapshot or independently approved split can give the original assignee a
  defined share. An employee can earn both roles on the same invoice.
- One fixed booking cap per role is snapshotted on first conversion. Fixed
  Salesman precedence is booking-specific, then original Salesman, then default.
  **Proportional** releases eligible slices up to the cap. **Full fixed** waits
  until every retained invoice is fulfilled and settled and the booking has no
  open quantities. Fully returned or cancelled orders earn zero. Direct orders
  use an invoice-scoped cap. A cap or post-settlement allocation change requires
  independent approval. For multiple delivery events on a line, returns reduce
  the latest delivered units first if their receiving Salesman is not specified.
- Verified receipts, posted returns, and assigned receipt-backed credit all
  contribute to settlement. Payment alone or delivery alone is insufficient.
  Dashboard **Accrued** is an estimate, not a payable. Payouts use Treasury and
  record cash out; corrections preserve historical payouts. Reductions below
  paid amounts create a recoverable; future commissions offset it unless held.
  Repayments and waivers require authorization. Offsets and waivers are not
  cash movements and never modify base salary. Do not enter the same automatic
  commission manually in payroll. The monthly profitability and executive
  reports show commission expense separately from payroll and product COGS.
- Cash shortage receivables and commission recovery/payable affect Financial
  Position but do not change customer sales revenue or stock. A shortage-backed
  receipt requires Finance's **Request receipt correction** and cannot be
  reversed through that action after the employee repays any amount. Historical
  receipts included in a locked opening also cannot use ordinary cancellation.

## Deployment and permission checklist

1. Back up the database and use a maintenance window. The application now reads
   the new workflow tables from existing invoice and finance pages. Use either
   `php artisan migrate --force` and `php artisan db:seed --class=DistributionPermissionSeeder --force`,
   or import the following files **in order** (schema imports register migrations;
   do not also run those same migrations):

   - [Distribution fulfilment](../database/manual/2026_11_24_add_distribution_fulfilment.sql)
   - [Distribution finance and Treasury](../database/manual/2026_11_24_create_distribution_finance.sql)
   - [Distribution commissions](../database/manual/2026_11_24_create_distribution_commissions.sql)
   - [Additive permissions](../database/manual/2026_11_24_seed_distribution_finance.sql)

2. Deploy the compiled frontend and run `php artisan permission:cache-reset`,
   `php artisan optimize:clear`, and `php artisan whmis:doctor`. MySQL connections
   use READ COMMITTED so a read performed after an invoice lock sees a receipt
   that posted while it waited. Keep the existing schedule runner active.
3. Verify employee-to-login links, salesmen, booking/dispatch schedules, and
   approval limits before Treasury opening. `finance.approve` defaults to Super
   Admin; delegated approvers need the permission and a Super Admin-configured
   limit for each action. Commission waivers additionally require
   `commission.waive`. Makers and financial beneficiaries cannot approve their
   own requests. Admin and Finance staff perform reconciliation and posting
   according to their grants and account access. Field staff see only their own
   work, collection submissions, and linked employee commission dashboard.
4. Pilot split invoicing and custody before cutover. Reconcile imported
   balances to counts, bank statements and customer/supplier balances before
   opening lock. Pilot one route and one commission payout before expanding.
   Treasury is a cash/account subledger, not a full chart of accounts or
   automatic bank integration. Store support evidence privately.
