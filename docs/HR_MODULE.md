# Employees and HR

Implemented October 2026. Source of truth: `HrController`, `HrService`,
`HrReportService`, the HR migration, and `HrModuleTest`. No existing employee,
salary, leave allowance, commission percentage, or opening balance is guessed.

## Setup and daily workflow

Use **People & Payroll** in the workspace top bar's **More** or **Pages** menu
to reach HR sections, and **Reports** to open HR reports. HR pages do not repeat
these links as an in-page button bar; page-specific actions remain in the header.

1. Open People & Payroll → HR Settings. Configure departments, designations, and
   paid/unpaid leave types with annual working-day allowances.
2. Create employees with joining dates, optional last employment dates, weekly
   days off, contact information, and optional existing WHMIS logins. Sunday is
   the initial weekly day off. Employees do not need a login to be paid.
3. Open each employee and add a salary version, effective on the first of a
   month: basic salary, fixed allowances, overtime hourly rate, and sales target.
   Reusing an effective date updates an unlocked version; locked versions cannot
   be changed. Later versions preserve prior months' calculations.
4. Record daily attendance (present, absent, half-day, holiday, weekly off),
   optional same-day clock times, and explicitly approved overtime hours.
5. Submit and approve/reject leave. Approval checks annual allowance, overlapping
   requests, attendance conflicts, employment dates, and payroll locks.
6. Generate monthly payroll, inspect missing attendance and calculations, enter
   justified bonus/commission/deductions/advance recovery, then approve and post.
7. Record full or partial salary payments against posted payslips in Employee
   Finance. Advances and repayments use the same screen but no payslip.

Leaving an employee does **not** deactivate the login automatically. Deactivate
access through Users when required. Employees are not hard-deleted, and linked
logins cannot be deleted or replaced, preserving historical attribution.

## Booker employees

Link the existing Booker login to the employee and enable Sales Booker. The
login must already have the Booker role. Existing customer assignments, booking
ownership, and invoice `booker_id` remain unchanged. The profile lists assigned
customers. My HR shows the linked employee's attendance, leave, salary history,
and posted/cancelled payslip PDFs, and allows own leave requests. Field Bookers
do not see the employee-details card in My HR; it remains on the HR staff view.

To assign customers, open **Employees → employee profile → Assign Customers**.
Search by customer/city, tick customers (or Select all shown), and Save Assignments.
This requires `employees.view` and the existing `bookers.assign` permission.
The employee must be marked Sales Booker and linked to an active Booker login.
Then reopen New Booking in the Booker session to load the updated list.
No assignment is inferred from creating an employee or linking a login.

This uses the existing `booker_customer` table and writes assignment audit logs.
Other Bookers' access is preserved; primary assignments stay selected and are
changed through Customers. Inactive customers cannot be newly assigned and never
appear in new booking options. No schema or permission-grant changes are required.

Booker Performance uses explicitly attributed posted invoices, linked posted
returns by return date, and completed payment allocations by payment date.
Unallocated receipts are not credited to a Booker. Targets sum the full monthly
target for every intersecting employed month; they are not prorated to filter
days. This report does **not** automatically calculate commissions.

## Payroll calculation policy

- Monthly salary = basic + fixed allowances.
- Prorated base = monthly salary × (eligible calendar days − unpaid days) /
  calendar days in the month, rounded to two decimals.
- Joining and last employment dates are inclusive. Employment dates determine
  payroll inclusion; the profile status is descriptive, not an unpaid-leave rule.
- Absence deducts one day, half-day deducts half a day. Approved unpaid leave
  deducts working days only. Weekly days off and paid leave remain paid.
- Missing working-day attendance is flagged and blocks approval; it is never
  silently treated as an absence or confirmed attendance.
- Overtime = recorded hours × configured hourly rate. Clock duration does not
  automatically generate overtime, lateness deductions, or shift premiums.
- Salary expense = prorated base + overtime + bonus + commission − other
  earnings deductions. Net salary payable = salary expense − advance recovery.
- Other deductions reduce earnings, **not** statutory withholding liabilities.
  Do not use them for tax/EOBI/provident-fund withholding.
- All adjustments need explanatory notes. Negative net salary and recovery
  beyond the employee advance balance are rejected.

These are explicit application policies, not a claim of statutory payroll
compliance. Automated tax, EOBI, provident fund, gratuity, leave accrual/carryover,
biometric imports, shifts, and automatic commission schemes are not implemented.
Leave allowance is a configured flat annual limit, with no joining-date accrual.
Split leave across calendar years into separate requests.

## Lifecycle and safeguards

Payroll: draft → approved → posted. Approved unposted payroll can reopen to
draft. Draft/approved payroll can cancel; posted payroll cancels by journal
counter-entries. Only one non-cancelled payroll exists per month.

Regeneration clears draft adjustments and rebuilds snapshots. Approval requires
the current employee roster and salary/attendance calculations to match the
draft, all working-day attendance to be resolved, and month end to have started.
Approved and posted months lock affected salary, attendance, leave, and employment
changes. Posting cannot precede month end or be in the future.

Salary payment is capped at that payslip's current payable. Reverse salary
payments before cancelling payroll; reverse advance recoveries before reversing
the original recovered advance. Reversals require reasons and are append-only,
with unique links preventing duplicate reversal. Employee finance entries must
be chronological (same date allowed), preserving historical balances.

## Accounting integration

`hr_transactions` is the dedicated employee subledger. Trade customer/supplier
`ledger_entries`, payments, invoice totals, COGS, stock, and credit limits are
unchanged. HR does not represent employees as customers or suppliers.

| Event | Expense | Salary payable | Employee advance | Cash out |
| --- | ---: | ---: | ---: | ---: |
| Payroll, earnings E and recovery R | +E | +(E−R) | −R | 0 |
| Salary payment P | 0 | −P | 0 | +P |
| Advance A | 0 | 0 | +A | +A |
| Advance repayment A | 0 | 0 | −A | −A |
| Reversal | Negates original | Negates original | Negates original | Negates original |

The financial position's net is customer receivables + employee advances −
supplier payables − employee salary payables. Net period cash flow is trade
receipts − trade payments − net HR cash out. The existing payments log is still
trade-only; employee cash detail is in Employee Finance and Employee Ledger.

Dashboard cards, executive PDF, financial-position PDF, monthly profit report,
and Profit after Payroll include HR effects. Payroll expense follows journal
accounting dates, not payment dates. Product/customer profit remains sales
contribution; payroll is not arbitrarily allocated to products or customers.
Profit after Payroll excludes other operating expenses and is not a full general
ledger profit-and-loss statement.

## Reports

The Reports centre has a Human Resources group with Excel/PDF exports and totals:

| Key | Meaning |
| --- | --- |
| `hr-employees` | Current employee directory |
| `hr-attendance` | Recorded daily attendance within dates |
| `hr-leave` | Annual allowances/approved days for year of From date |
| `hr-payroll` | Currently posted payroll in selected payroll months; current unpaid balance |
| `hr-balances` | Current salary payable and advance recoverable |
| `hr-ledger` | Signed accounting movements in selected dates, including reversals |
| `hr-bookers` | Attributed sales, returns, allocated collections, and targets |
| `hr-operating-profit` | Sales contribution less posted payroll expense by accounting date |

Payroll, balances, and Booker reports include ranked charts shared with PDF
exports. Cancelled payroll is excluded from the current Payroll Register; its
original and reversing accounting entries remain visible in Employee Ledger.

## Permissions and privacy

`HrPermissionSeeder` adds permissions without resetting existing grants.
Admin/Super Admin and HR Manager receive all HR capabilities. HR Manager also
receives `reports.view` (which exposes existing general reports). Accountant
receives employee view, payroll view/manage/post/pay, HR reports, and self view;
approval and reversal are not granted by this HR seeder. Booker/Warehouse Staff
receive self view only. Configure custom roles if approval duties must be split;
the application permits one authorized person to both prepare and approve.
HR-only logins land on Employees (or My HR for self-service-only accounts), not
an inaccessible dashboard. Closing all workspace tabs uses the same home page.

Reports require both `reports.view` and `hr.reports.view`. Salary details require
`hr.payroll.view` or verified own-profile access. `employees.view` exposes employee
personal/contact data, attendance, and leave history, but not salary details.
Dashboard/ledger/general-report permissions continue to expose aggregate payroll
totals, not employee-level salary records. Audit entries also respect HR view
permissions so general audit access cannot reveal hidden salary/employee records.

## Production installation

Back up the database and deploy during maintenance. Schema must exist before
serving the new dashboard/accounting code. Choose **one** schema installation path:

- CLI: deploy code, run `php artisan migrate --force`, then
  `php artisan db:seed --class=HrPermissionSeeder --force`.
- phpMyAdmin: import [HR schema SQL](../database/manual/2026_10_31_create_hr_tables.sql)
  once, then [additive permission SQL](../database/manual/2026_10_31_seed_hr_permissions.sql).
  The schema SQL records its migration after successful creation. Do not import
  it if Laravel already applied the migration. MySQL DDL is not transactional;
  inspect and resolve any partial failure before rerunning.

Clear permission/application caches after deployment (`php artisan
permission:cache-reset`, `php artisan optimize:clear`). Deploy the compiled
`public/build` assets. Do not run the full base role seeder as an upgrade shortcut:
it synchronizes existing role grants. Existing cPanel automation also runs seeders;
review custom role grants after deployment.

Verify HR navigation and reports, then configure real employees and policies.
The upgrade adds no sample employees or financial entries. Do not roll back the
HR schema once live payroll exists; use forward fixes and financial reversals.

## Verification

`php artisan test --filter=HrModuleTest` covers accounting reconciliation,
proration/leave/overtime, stale drafts, month-end boundaries, payroll locks,
payment caps, reversals, exports, ownership, audit privacy, and morph aliases.
Use `php -d memory_limit=512M vendor/bin/phpunit` if the full-suite Excel export checks
exceed the local default 128 MB memory limit. Run `npm run build` for UI changes.

Implementation verification: 243 tests / 1,995 assertions passed, including
14 HR tests / 170 assertions. Production Vite build passed. Chrome walkthrough
on an isolated SQLite database verified employee creation, salary setup, draft
payroll generation, section navigation, mobile employee form, and HR-only
workspace landing/close-all. `tsc --noEmit` still reports the three unrelated
existing login/reset-password/welcome errors noted in `QUALITY_AND_RISKS.md`.
Local schema and additive HR permissions were applied without seeding employees
or financial transactions. Production deployment/import remains a separate step.
