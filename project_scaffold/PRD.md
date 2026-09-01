# Product Context — FleetPilot

## What the product is

FleetPilot is a responsive command center for Indian transport and logistics teams. It centralizes fleet inventory, driver compliance, trip dispatch, maintenance, operating spend, and performance reporting in one browser application.

The repository currently represents a working prototype rather than a production-ready release.

## Users and permissions

| Role | Primary responsibility | Main write access |
|---|---|---|
| Fleet Manager | Fleet-wide operations and administration | Vehicles, drivers, trips, maintenance, fuel, expenses |
| Dispatcher | Plan and run trips | Trip create/dispatch/complete/cancel |
| Safety Officer | Driver compliance | Driver create/update |
| Financial Analyst | Operating-cost capture | Fuel and expenses |

Most read endpoints currently allow every authenticated role. Finance and analytics read scope should be confirmed before production use.

## Implemented capabilities

- Public editorial landing page and role-aware email/password sign-in.
- JWT session restoration and role-filtered navigation.
- Dashboard KPIs, recent trips, and vehicle-status summary.
- Vehicle search/filter/create/edit/delete, including required license category.
- Driver search/create/edit/delete with license expiry/category and safety score.
- Trip draft, dispatch, completion, and cancellation lifecycle.
- Assignment validation for vehicle/driver existence and status, active trip/maintenance conflicts, cargo capacity, license expiry, exact license-category match, and draft state.
- Maintenance open/close lifecycle with automatic vehicle status changes.
- Fuel and categorized expense capture.
- Fleet analytics, per-vehicle cost/ROI display, and CSV export.
- Responsive layouts for desktop, tablet, and mobile.
- Role-scoped FleetPilot Copilot with current-data evidence, assignment recommendations, operational-risk summaries, and explicitly confirmed draft-trip creation.

## Core product rules

- Only an available vehicle and available driver may be assigned.
- A vehicle in maintenance, on a trip, or retired cannot be assigned.
- A driver who is on a trip, off duty, suspended, or expired cannot be assigned.
- Driver license category must exactly equal the vehicle's required category.
- Cargo weight cannot exceed vehicle capacity.
- Only draft trips can dispatch; only dispatched trips can complete.
- Dispatch, completion, cancellation, and maintenance operations must keep related resource states consistent.
- Server authorization and validation remain authoritative even when the UI pre-validates a form.
- Copilot may create only a draft trip, and only for an organization `OWNER` or `ADMIN`, after showing an explicit confirmation preview; confirmation must revalidate authorization and assignment state and must be idempotent and auditable.

## Assignment failure contract

- A failed assignment must explain every currently detectable conflict instead of stopping at the first generic error.
- Each reason must have a stable machine-readable code, a user-facing message, the related field when applicable, and numeric/date/category details needed to explain the failure.
- Cargo failures must state the exact excess weight, for example: `Cargo exceeds Van-05's capacity by 120 kg.`
- License failures must distinguish expired licenses, suspended/off-duty drivers, and required-versus-held category mismatches.
- Vehicle failures must distinguish an active trip, active maintenance, and retirement; active trip and maintenance messages should include the trip number or service type when known.
- Trip creation and dispatch must use the same server-side evaluator. Dispatch must revalidate because fleet state may have changed since draft creation.
- The trip form must preserve entered values, display all reasons together, highlight affected fields, and prevent submission while locally detectable conflicts remain.
- Dispatch-time conflicts must appear in an application modal rather than a generic browser alert.

## Explicitly out of scope today

- Real GPS/telematics ingestion, live maps, route optimization, or push updates.
- Orders/customers, proof of delivery, invoicing, payroll, or a driver mobile app.
- User provisioning, multi-tenant organizations, editable RBAC, or persisted organization settings.
- Full audit history, financial ledger corrections, or production accounting.
- Copilot dispatch, completion, cancellation, maintenance actions, finance writes, record edits/deletes, autonomous execution, and proactive notifications.

## Important open decisions

- Product vs organization naming: FleetPilot and TransitOps are both present.
- Exact role access for finance and analytics reads.
- Definitions for fuel efficiency, utilization, operational cost, and ROI.
- Production hosting, secrets, migrations, backups, monitoring, and rollback.
- Whether tracked dependencies and compiled outputs should remain in Git.
