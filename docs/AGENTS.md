# WHMIS Agent Guide

This is the handoff guide for future Codex or AI coding agents working in this
repo. Treat it as the first file to read under `docs/`.

## Core rules

- This is a Laravel 12 + Inertia v2 + React 19/TypeScript + Tailwind 4 ERP for pharmaceutical distribution.
- Business rules belong in `app/Services/`; controllers should stay thin.
- Server calculations are authoritative. Never trust client totals for money, tax, margin, stock, or ledger posting.
- Do not change application code while doing documentation-only work.
- For every database-related change, create or update a matching manual SQL file
  under `database/manual/` so production can be patched through phpMyAdmin.
- Preserve dirty worktree changes that you did not make. At the time this guide was created, `scripts/__pycache__/` was untracked and must not be cleaned up without explicit approval.
- Do not run formatters that rewrite code unless the task is explicitly code-formatting work.
- Before changing money/stock behavior, read `CLAUDE.md`, `ARCHITECTURE.md`, `DATA_MODEL.md`, and `QUALITY_AND_RISKS.md`.

## Safe workflow

1. Start with `git status --short`.
2. Inspect existing patterns before editing: routes, services, models, React pages, tests, migrations, and seeders.
3. Keep edits scoped to the requested module.
4. Add or update tests when changing behavior.
5. Run verification proportional to risk:
   - `php artisan test` for backend/domain changes.
   - `npm run build` for frontend changes.
   - `php artisan route:list` when routes or permissions change.
6. End with `git status --short` and report exactly what changed and what was verified.

## Never-break invariants

- `MarginCalculator` and `resources/js/lib/invoice-math.ts` must stay logically aligned.
- `InventoryService` is the only place that should mutate stock quantities and create stock movements.
- `stock_movements` is the append-only stock truth.
- Posted invoices are cancelled by counter-entries, not edited or deleted.
- `LedgerService` owns ledger entries and financial position math.
- Payments and auto-settlements must reverse cleanly on cancellation.
- `NumberSeriesService` must keep row-locked document sequences.
- Morph maps in `AppServiceProvider` must include every morphed model used by ledger, audit, payments, or stock references.
- Booker users must only see and act on assigned customer/pharmacy scope unless the code explicitly grants broader permissions.
- Super Admin protections must prevent hidden access leaks, self-orphaning, deactivation, and deletion of the last Super Admin.
- License gating must never lock out Super Admin.

## Documentation expectations

When adding features, update the docs in the same pass:

- `FUNCTIONALITY.md` for user-facing capability and routes.
- `DATA_MODEL.md` for new tables, relationships, statuses, and posting side effects.
- `SECURITY_AND_PERMISSIONS.md` for permissions, roles, visibility, and gating.
- `QUALITY_AND_RISKS.md` for tests, gaps, and logic hotspots.
- `database/manual/*.sql` for any schema or seed change needed by production.

## Useful commands

```bash
git status --short
php artisan route:list
php artisan test
npm run build
npm run format:check
```

Do not use `npm run lint` unless the task allows rewrites, because this repo's lint script uses `eslint . --fix`.
