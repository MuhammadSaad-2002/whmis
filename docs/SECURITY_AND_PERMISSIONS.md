# WHMIS Security and Permissions

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
- `nav-config.ts` is the shared navigation source for sidebar and workspace shell.
- Server-side route middleware remains the real authorization boundary.

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

## License gating

`EnsureLicensed` wraps authenticated app routes. If the system has no valid
license or the license is expired, non-Super-Admin users are redirected to
`license/locked`. The license screen and activation are permission-gated.

## Audit

Auditable models use OwenIt auditing, and custom events are written through
`AuditLogger` for events such as permission syncing. Audit reference formatting
is supported by backend reference resolution and frontend audit formatting.

## Sensitive deployment rules

- Real `.env` files and secrets must not be committed.
- Production `.env` should be created from `.env.production.example`.
- The seeded admin password must be changed immediately on real deployments.
- `public/ping.php`, if present on production for diagnostics, must be removed after verification.
