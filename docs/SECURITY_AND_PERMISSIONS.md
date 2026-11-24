# WHMIS Security and Permissions

Cash & Bank, collections and commission permissions and the delegated
maker-checker rules are documented in
[Integrated Distribution](INTEGRATED_DISTRIBUTION.md#deployment-and-permission-checklist).

Distribution operations add `dispatch.view/manage`, `collections.view/manage`,
and `system.health`. Default grants, scoped Booker workday, and safe assignee
selection are detailed in [DISTRIBUTION_OPERATIONS.md](DISTRIBUTION_OPERATIONS.md).
Employee profiles explicitly explain Booker setup requirements. Permission SQL
is additive and also restores the existing Admin/Super Admin `bookers.assign`
grant; field Bookers receive no organization-wide operations or health access.
The Salesman role can be combined with Booker and grants `dispatch.assigned`,
not organization-wide access. Assignment scope and allowed actions are checked
on the server; `dispatch.plan` gates schedule management and staff delivery sheets.

Employee Commissions and commission-specific finance actions require
`commission.manage`. Booker and Salesman accounts without an Admin or Super
Admin role are blocked even if they have a legacy or direct commission grant.
Daily Staff Activity is read-only and checks the Super Admin role on the server.
Its navigation flag is derived from that role; no database grant is required.
The workspace menu and Global Search follow the same restriction and refresh
stale commission permissions before hiding access. Deployments restore missing
standard finance and commission grants to Super Admin only. If using phpMyAdmin
instead, import [the Super Admin grant repair](../database/manual/2026_11_24_restore_super_admin_finance_grants.sql)
and run `php artisan permission:cache-reset`, then reload the workspace.

WHMIS uses Laravel session authentication with Spatie Laravel Permission. Routes
are permission-gated with `can:` middleware, and React receives roles and
permissions from `HandleInertiaRequests`.

## Seeded permissions

Permission names follow `<module>.<action>`.

Current modules include:

- `suppliers`
- `categories`
- `products`
- `customers`
- `bookers`
- `purchases`
- `sales`
- `bookings`
- `samples`
- `loans`
- `incentives`
- `returns`
- `inventory`
- `payments`
- `ledger`
- `reports`
- `dashboard`
- `global-search`
- `users`
- `roles`
- `audit`
- `settings`
- `license`

## Seeded roles

- Super Admin: all permissions.
- Admin: broad operational and administration access, excluding vendor-only license management permissions in the current seed set.
- Booker: assigned-customer/customer visibility, products, bookings, and own dashboard.
- Accountant: ledger, payments, reports, dashboard, transaction visibility, and cost visibility.
- Warehouse Staff: inventory, products/cost visibility, transaction visibility, samples, loans, and dashboard.

Always confirm exact role contents in `RolePermissionSeeder` before changing
access decisions.

## Frontend permission flow

- `HandleInertiaRequests` shares `auth.permissions` and `auth.roles`.
- `usePermissions()` exposes `can()` and `canAny()` in React.
- `nav-config.ts` defines the workspace top bar's groups and page permission keys.
- Server-side route middleware remains the real authorization boundary.

Cash & Bank, Daily Reconciliation and Finance Approvals use the same
cache-aware permission check as Dispatch. If a saved grant was added via
phpMyAdmin but the cached permission check denies access, these routes refresh
the permission cache and check again. Missing grants still return 403.
Posting reconciliation receipts still requires both `distribution.reconcile`
and `payments.manage`.

**Global Search** (`global-search.use`) enables the workspace search button and
keyboard shortcut. Admin and Super Admin have it by default; grant it to other
roles in **Roles & Permissions → Global Search**. Results reuse the signed-in
user's permitted navigation and exclude supplier pages for field Bookers. The
server shares individual report names only when the user has access to the
reports module and any permissions required by that report. Search adds no page
or record privileges. Existing installations can import
[`2026_11_24_seed_global_search_permission.sql`](../database/manual/2026_11_24_seed_global_search_permission.sql),
reset the permission cache and reload the workspace.

## Super Admin protections

User management protects Super Admin accounts:

- Non-Super-Admin users cannot view or act on Super Admin accounts.
- Only Super Admin can assign the Super Admin role.
- The last Super Admin cannot lose the role, be deactivated, or be deleted.
- Super Admin is never license-gated.

## Booker scoping

Bookers are scoped to assigned pharmacies/customers. Customer and booking flows
must respect primary and assigned Booker relationships. Assignment changes are
logged in `booker_assignment_logs`.
Employee-profile bulk assignment requires both `employees.view` and
`bookers.assign`. Only active Booker logins may receive assignments. Booking
create/update validates assigned active customer access on the server; the
booking list's customer filter is scoped with the same customer options.

Field Booker accounts (Booker without Admin or Super Admin) cannot access
supplier identities or purchase costs. The Products catalogue, product search,
and booking details/repeats omit supplier data on the server. Supplier filters
are ignored for these accounts. The `view-supplier-details` gate also protects
supplier-bearing operations and exports if a field Booker has extra grants.

Field Bookers cannot edit their name or email, change their password from
Settings, or delete their login. The `manage-own-account` gate also blocks
self-edits through User Management if a field Booker has an extra
`users.manage` grant. The account menu keeps Appearance and Log out. Authorized
administrators can still manage Booker accounts.

Products hidden through **Show to Bookers** are excluded from field Booker
catalogue, product/batch and incentive lookups, and repeat bookings. The server
rejects hidden products when a field Booker saves or submits a draft. Previously
saved order lines are retained for history. Admins can still process them.

## License gating

`EnsureLicensed` wraps authenticated app routes. If the system has no valid
license or the license is expired, non-Super-Admin users are redirected to
`license/locked`. The license screen and activation are permission-gated.

## Audit

Auditable models use OwenIt auditing, and custom events are written through
`AuditLogger` for events such as permission syncing. Audit reference formatting
is supported by backend reference resolution and frontend audit formatting.

## HR access

HR permission families: `employees.view/manage`, `hr.settings.manage`,
`hr.attendance.view/manage`, `hr.leave.view/manage/approve`,
`hr.payroll.view/manage/approve/post/pay/cancel`, `hr.reports.view`, `hr.self.view`.
The additive `HrPermissionSeeder` adds HR Manager and grants HR rights to existing
roles without resetting them; see [HR_MODULE.md](HR_MODULE.md) for exact policy.

Self-service verifies the user/employee link and scopes payslips and leave
requests. Salary payloads are hidden without payroll-view access (except own
profile). Audit HR records require the corresponding HR view permission, including
salary audits. HR reports enforce permission before PDF/Excel export. Existing
dashboard/ledger/general report permissions expose aggregate HR financial totals.

## Sensitive deployment rules

- Real `.env` files and secrets must not be committed.
- Production `.env` should be created from `.env.production.example`.
- The seeded admin password must be changed immediately on real deployments.
- `public/ping.php`, if present on production for diagnostics, must be removed after verification.
