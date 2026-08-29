# WHMIS Engineering Docs

This folder is the engineering context map for WHMIS. Read it before changing
business logic, stock movement, ledger behavior, permissions, deployment, or
reports.

## Required reading order

1. `AGENTS.md` - future-agent operating rules and safe workflow.
2. `PROJECT_CONTEXT.md` - product, stack, deployment model, and domain language.
3. `ARCHITECTURE.md` - app boundaries, request flow, services, middleware, and deployment.
4. `FUNCTIONALITY.md` - feature/module inventory.
5. `DATA_MODEL.md` - entity relationships, lifecycle states, stock, ledger, and schema notes.
6. `SECURITY_AND_PERMISSIONS.md` - RBAC, license gating, Booker scoping, and audit.
7. `QUALITY_AND_RISKS.md` - verification commands, test coverage, and known risk areas.

## Existing docs

- `DEPLOYMENT.md` remains the production cPanel deployment guide.
- `commercial/` contains business/commercial documents.
- `presentation/` contains generated presentation docs and screenshots.

## Documentation rules

- Keep these docs factual and tied to code that exists now.
- Mark recommendations and uncertain items explicitly as risks or safe-next-work notes.
- Do not replace runtime tests with documentation claims. If a doc says a behavior works, keep a test or command reference nearby.
- When adding a new module, update the feature inventory, data model notes, permissions, routes, and quality/risk sections together.
