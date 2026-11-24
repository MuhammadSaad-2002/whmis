# Distribution operations release — November 2026

For the latest pickup, collection, reconciliation and commission flows, see
[Integrated Distribution](INTEGRATED_DISTRIBUTION.md). The notes below describe
the first release and remain relevant to legacy dispatch history.

This is the first market-fit delivery: an online Booker workday, repeat booking,
dispatch tracking, a collections worklist, and deployment readiness checks.

## Booker workday

Open **My Workday** from the workspace top bar (`/booker/workday`). Only the current login's
active assigned customers appear, including primary and additional assignments.
Use the date arrows or date picker to browse the route without changing the
customer filter. **My customers** supports customer/city search, route and
balance filters, and name, balance, or recent-order sorting. The summary counts
cover all assigned customers, not only the visible page.
The customer cards put order and visit actions together, with a bottom-sheet
visit editor on phones. A visit can be planned, visited, no order, or closed
(outlet closed). Future visits can only
be planned. One record exists per Booker/customer/day; updates are audited.
Salesmen also see assigned deliveries and their own reported collections.
Collection reporting on Workday uses the same delivery and Finance verification
rules as Dispatch & Delivery; it never posts a payment directly.

The customer account balance comes from the existing customer ledger, including
unallocated receipts. A negative balance is customer credit, not a loss.
New Order preselects the customer; Repeat Last Order uses that Booker's latest
non-rejected/non-cancelled booking for the assigned customer. Repeating creates
an unsaved form, never an automatic order. Customer and repeat shortcuts use
separate draft tabs when their prefill differs. Current product prices, default
discounts, tax and stock are loaded; old bonus quantities and incentive selections
are cleared for review. Unavailable products are flagged as omitted. Products
hidden from Bookers are counted without displaying their names.
Neither another Booker's booking nor an unassigned customer can be used as a
repeat source by a field Booker.

Employee profiles now explain missing Sales Booker configuration, absent/inactive
login links, wrong login roles, or assignment permission instead of silently
hiding setup. A designation alone does not confer Booker access.

## Dispatch and delivery

Open **Transactions → Dispatch & Delivery** (`/dispatch`). Only posted invoices
appear in the worklist. An invoice without history is **untracked**, including
old invoices: no historic delivery is invented. Opening a record does not start
tracking. Assigning responsibility or starting picking creates the tracker.

Normal lifecycle: pending → picking → packed → dispatched → partial/delivered.
Failed attempts require a reason and can be dispatched again. A delivery records
the receiver, server timestamp, actor, notes, and positive per-line quantities.
These quantities include bonus units. Repeated partial deliveries accumulate;
each is capped to invoice units minus posted return quantities minus already
delivered units. Cancelled returns do not reduce capacity.

If posted returns cover all remaining goods, **close returned** records closure
without pretending the customer received them. **Correct delivery** subtracts
erroneously recorded quantities with a mandatory reason; it is not a physical
return. Original events remain in history. Request UUIDs make successful event
retries idempotent; the invoice is row-locked while checking capacities.

**Accounting policy approved by the user:** invoice posting continues to deduct
stock and create receivables. Dispatch actions do not change batches, stock
movements, COGS, ledger entries, or receipts. Physical returns use Returns; actual
collections use Payments. Cancelled invoices retain history but cannot receive
new dispatch actions. The detail can print its basic item/batch picking list.

### Salesman and weekly schedules

In **Users**, add the **Salesman** role to an active login. Keep **Booker** on the
same login when that person also takes bookings. Salesman access opens **My
Deliveries** and exposes only dispatches assigned to that login; it does not grant
invoice, purchasing, collections, or customer-directory permissions.

In **Dispatch & Delivery → Booking & Delivery Schedules**, set each customer's
booking days, delivery days, and default Salesman. Booking days create today's
planned visits for active primary and additional Bookers. Find them in **My
Workday → Planned**. They do not create booking orders. For delivery, only
new invoices posted after delivery scheduling was enabled are eligible. The
schedule uses the first allowed weekday on or after posting or the day the
planner runs, whichever is later, in Pakistan time. Drafts and historic invoices
are not picked up, and existing assignments, visits, and outcomes are never
overwritten. Existing invoices can be planned manually via **Assign / reschedule**.

The application scheduler runs the planner every 30 minutes. If needed, run
**Generate plan now** or `php artisan whmis:generate-delivery-plan`. Enable the
existing Laravel cron (`php artisan schedule:run` every minute) for automation.

In **Dispatch & Delivery → Daily delivery sheet**, choose a date and staff
member. The A4 PDF uses one row per posted invoice, grouped by customer stop,
with the delivery address, invoice total, and space for receiver, remarks, and
payment. For authorized payment viewers it shows verified collections for that
salesman and business date; pending reports are not printed as received.
Long routes continue onto extra pages with repeated column headings.

## Collections and recovery

Open **Finance → Collections & Recovery** (`/collections`). The positive balance
worklist uses the same `InvoiceBalanceService` as the customer payment allocation
lookup:

`invoice balance = invoice amount − completed allocated receipts − posted return credits`

Cancelled payments/returns do not reduce the balance. Fully settled invoices
disappear automatically; history remains accessible from the invoice URL.
Original amount, paid allocations and return credits explain each balance.
Overdue uses due date, falling back to invoice date when none was supplied.
The follow-up filter uses only the most recent follow-up for each invoice.

Follow-ups record responsible staff, contacted/promised/unreachable/disputed,
next follow-up date and notes. Promises require a date and positive amount no
greater than the current invoice balance. They never count as payments or profit.
Only actual payments and returns change the live balance. Customer statements
must be checked for unallocated credit before requesting payment.

This first release does not implement physical cash handover, cash reconciliation,
automatic customer reminders, or a payment-promise settlement engine.

## Permissions

| Permission | Default roles |
| --- | --- |
| `dispatch.view` | Super Admin, Admin, Accountant, Warehouse Staff |
| `dispatch.manage` | Super Admin, Admin, Warehouse Staff |
| `dispatch.assigned` | Salesman (personal dispatches only without broader grants) |
| `dispatch.plan` | Super Admin, Admin |
| `collections.view`, `collections.manage` | Super Admin, Admin, Accountant |
| `system.health` | Super Admin, Admin |

Booker Workday requires existing `bookings.create` and remains customer-scoped.
Bookers receive no organization-wide collections or dispatch permission. A
combined Booker/Salesman can prepare, dispatch, and record delivery outcomes for
their own assigned dispatches, but cannot reassign, reschedule, or correct them.
Assignment choices include active users who can view the relevant workflow;
Super Admin accounts stay hidden from non-Super-Admin assignment lists.

## Production installation

Back up the production database. For an existing up-to-date WHMIS installation,
import these in phpMyAdmin in order, before deploying the corresponding code:

1. `database/manual/2026_11_16_create_distribution_operations_tables.sql` — once;
   skip if its Laravel migration is already applied.
2. `database/manual/2026_11_16_seed_distribution_permissions.sql` — rerunnable.
3. `database/manual/2026_11_23_create_delivery_schedules.sql` — of the two new
   imports, apply this first; skip if its Laravel migration already ran.
4. `database/manual/2026_11_23_seed_salesman_permissions.sql` — rerunnable.

Alternatively run `php artisan migrate --force` and
`php artisan db:seed --class=DistributionPermissionSeeder --force`.
Do not run the schema SQL and the same migration twice. The SQL registers the
migration. Clear permissions with `php artisan permission:cache-reset` and clear
application caches with `php artisan optimize:clear`.

On Dispatch, Collections and System Readiness, a denied request with a matching
web permission in the database refreshes the Spatie cache and retries Laravel
authorization once. This also handles grants imported through phpMyAdmin while
the application was running.

`php artisan whmis:doctor` checks connection, migration registration, essential
columns, new permissions/Super Admin grants, compiled assets, and writable paths.
`--json` is available for deployment automation. System Readiness shows the same
checks. Neither tool repairs data, checks all ledger balances, verifies backups,
or certifies that every business calculation is correct.

The cPanel task now chains migrations, `whmis:provision`, cache clearing, and the
doctor so failures are visible. Provisioning uses baseline seeds on an empty
role installation, and additive seeds on established installations. It does not
reset established role permissions or replace existing user passwords.
Legacy fresh-install migrations now use short incentive index names matching
their existing manual SQL, and explicit license timestamp defaults compatible
with strict MariaDB. Already-applied legacy migrations need no reimport.

## Verification and remaining roadmap

`DistributionOperationsTest` exercises permission boundaries, assigned-customer
scope, current-price repeat orders, visits, partial delivery/correction/retries,
return-adjusted quantities, return-settled closure, payment/return balance parity,
promises, latest follow-ups, setup messages, and additive provisioning.

The remaining market-fit work is not represented as completed: offline booking
and synchronization, route optimization, driver app/GPS/proof attachments,
barcode/recall/quarantine workflows, supplier claims, opening-balance import,
backup/restore automation, and a fuller financial reconciliation diagnostic.
Pilot with 3–5 distributors before choosing the next investment. Measure order
entry time, delivery completeness, discrepancy counts, collection follow-up
completion, weekly active users, and support requests against a recorded baseline.
