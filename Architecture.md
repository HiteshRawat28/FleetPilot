# Architecture - TransitOps

## Architectural summary

TransitOps is proposed as one deployable Next.js application backed by Supabase Auth and PostgreSQL. Ordinary CRUD uses typed feature services; risk-bearing lifecycle transitions use named PostgreSQL RPC commands so trip, vehicle, driver, and maintenance changes commit atomically. This shape minimizes deployment and integration work during an eight-hour hackathon while preserving the business rules under concurrent requests.

Client-side eligibility filtering improves usability but is never authoritative. PostgreSQL constraints, row-level security, and transactional commands form the final integrity boundary.

## System flow

1. A browser sends an authenticated form or command through the Next.js application.
2. The page checks session/role for navigation; Zod validates payload shape.
3. Ordinary authorized CRUD reads/writes Supabase tables under row-level security.
4. Dispatch, completion, cancellation, and maintenance actions call named RPC commands.
5. The command locks affected rows, rechecks invariants, commits all state changes together, and returns a typed result or rule-specific error.
6. The UI refreshes affected read models and announces the confirmed result; dashboards and reports derive values from persisted state.

## Technology choices

| Area | Choice | Status | Rationale |
|---|---|---|---|
| Application | Next.js App Router with TypeScript | Proposed | One full-stack deployment, typed React UI, and clear route/feature boundaries. |
| Styling | Tailwind CSS plus a lightweight accessible component kit | Proposed | Fast responsive implementation without designing every primitive from scratch. |
| Validation | Zod | Proposed | Shared, explicit request and form validation close to TypeScript contracts. |
| Authentication | Supabase Auth | Proposed | Managed email/password sessions fit the time limit. |
| Data | Supabase PostgreSQL with Row-Level Security | Proposed | Relational constraints, transactions, RPC commands, and managed hosting. |
| Testing | Vitest plus Supabase integration tests and one Playwright journey | Proposed | Concentrates automation on rules, transactions, RBAC, and the demo path. |
| Deployment | Vercel plus Supabase | Proposed | Low-friction deployment for a single application and database. |

All choices become Decided only after Phase 0 validation. Do not pin package versions until the application is initialized and compatibility is verified.

## Components and responsibilities

- **App shell and auth:** login/logout, session loading, role-aware navigation, protected layouts, route composition, and global feedback.
- **Fleet feature:** vehicle registry forms, lists, normalized registration feedback, availability display, and retirement action.
- **Driver feature:** driver registry, compliance fields, licence/safety status, and eligibility display.
- **Trip feature:** draft form, eligible selectors, blocker summaries, lifecycle view, and transition actions.
- **Maintenance feature:** active work queue, history, and open/close actions.
- **Finance feature:** fuel and expense ledger, validation, and maintenance-expense linkage.
- **Dashboard feature:** KPI/filter read model and operational exception summary.
- **Report feature:** per-vehicle calculations, filtered tables, and CSV serialization.
- **Database commands:** authoritative RBAC, locks, validation, lifecycle transitions, and state restoration.

## Data model

All primary keys are UUIDs. Store timestamps in UTC. Mutable business tables include `created_at`, `updated_at`, and `created_by` where useful.

### `profiles`

- `user_id`: unique reference to the managed auth user.
- `display_name`: user-facing name.
- `role`: `fleet_manager | dispatcher | safety_officer | financial_analyst`.
- Invariant: role changes require Fleet Manager/admin authority and are never accepted from an untrusted browser claim.

### `vehicles`

- `registration_number`, `registration_number_normalized`, `name_model`, `type`, `max_load_kg`, `odometer_km`, `acquisition_cost`, `region`, nullable `archived_at`.
- `status`: `available | on_trip | in_shop | retired`.
- Invariants: normalized registration is unique; capacity is positive; odometer and cost are nonnegative; lifecycle status is not changed by generic CRUD; archived records preserve history and are never dispatch-eligible.

### `drivers`

- `name`, `license_number`, `license_category`, `license_expiry_date`, `contact_number`, `safety_score`, nullable `archived_at`.
- `status`: `available | on_trip | off_duty | suspended`.
- Invariants: safety score is 0-100; licence number is unique; lifecycle status follows authorized commands; archived records preserve history and are never dispatch-eligible.

### `trips`

- `source`, `destination`, `vehicle_id`, `driver_id`, `cargo_weight_kg`, `planned_distance_km`, `start_odometer_km`, `final_odometer_km`, `actual_distance_km`, `revenue`.
- `status`: `draft | dispatched | completed | cancelled` plus transition timestamps.
- Invariants: positive cargo and planned distance; revenue is nonnegative; final odometer never decreases; terminal trips are immutable.
- Guards: partial unique indexes on `vehicle_id` and `driver_id` where status is Dispatched prevent concurrent double-booking.

### `maintenance_logs`

- `vehicle_id`, `maintenance_type`, `description`, `status`, `opened_at`, `closed_at`.
- Invariant: at most one Active record per vehicle through a partial unique index.

### `fuel_logs`

- `vehicle_id`, nullable `trip_id`, `liters`, `cost`, `logged_date`.
- Invariants: litres are positive; cost is nonnegative.

### `expenses`

- `vehicle_id`, nullable `trip_id`, nullable unique `maintenance_log_id`, `category`, `amount`, `expense_date`, `description`.
- `category`: `maintenance | toll | other`.
- Invariant: amount is nonnegative. A linked Maintenance expense is the canonical maintenance cost; the same cost is not summed from `maintenance_logs`.

## Atomic lifecycle commands

### `dispatch_trip(trip_id)`

Lock the draft trip, vehicle, and driver; recheck all BR-002 through BR-005 and BR-011 conditions; store the starting odometer; then set the trip to Dispatched and both resources to On Trip in one transaction. Conditional updates and partial unique indexes ensure only one concurrent dispatch can win.

### `complete_trip(trip_id, final_odometer, optional_fuel)`

Allow only Dispatched to Completed. Lock all affected records; enforce BR-012; calculate actual distance; update odometer; optionally insert fuel; complete the trip; and restore both resources to Available in one transaction.

### `cancel_trip(trip_id)`

Allow Draft to Cancelled without resource updates. Allow Dispatched to Cancelled while atomically restoring both resources. Reject terminal transitions.

### `open_maintenance(vehicle_id, details)`

Lock the vehicle; reject On Trip, Retired, or a second active log; create the active log; and set the vehicle to In Shop in one transaction.

### `close_maintenance(log_id, optional_cost)`

Lock the log and vehicle; close the log; create/update its single linked Maintenance expense when supplied; keep a Retired vehicle Retired, otherwise restore Available.

Do not expose a generic endpoint that directly writes operational statuses.

## Read models and calculations

- Dashboard KPIs and filters use the definitions in `PRD.md`.
- Eligible vehicle and driver queries remove known blockers for usability; lifecycle RPCs repeat every check.
- The per-vehicle report aggregates completed-trip distance/revenue, linked fuel, and Maintenance-category expenses.
- CSV generation serializes the same filtered report model displayed to the Financial Analyst.
- Every ratio returns `null`/N/A when its denominator is zero; formatting happens in the UI, not in stored values.

## Interfaces

The exact transport mechanism may be server actions or route handlers, but contracts are named by intent and owned centrally.

| Interface | Authorization | Result and important errors |
|---|---|---|
| `signIn(email, password)` | Public | Session or generic invalid-credentials error. |
| `list/create/update/archiveVehicle` | Role matrix | Typed vehicle result; duplicate registration, invalid field, active-assignment archive, or forbidden error. |
| `list/create/update/archiveDriver` | Role matrix | Typed driver result; duplicate licence, invalid field, active-assignment archive, or forbidden error. |
| `listEligibleResources(draft)` | Trip Operator | Eligible items plus explainable blockers for excluded resources. |
| `dispatchTrip(tripId)` | Trip Operator | Confirmed statuses; stale assignment, expired licence, capacity, maintenance, or conflict error. |
| `completeTrip(tripId, finalOdometer, fuel?)` | Trip Operator | Completed trip and released resources; invalid transition/odometer error. |
| `cancelTrip(tripId)` | Trip Operator | Cancelled trip and, when relevant, released resources. |
| `open/closeMaintenance` | Fleet Manager | Updated log/vehicle; active-trip, retired, duplicate-log, or invalid-transition error. |
| `manageFuel/manageExpense` | Role matrix | Validated ledger entry or forbidden/invalid-value error. |
| `getDashboard(filters)` | Authenticated | Consistent KPI read model or partial-panel error handling at the UI. |
| `getReport/exportCsv(filters)` | Financial Analyst | Identical filtered report data or forbidden error. |

## Security and privacy

- Enable Row-Level Security on every application table and verify denial cases for each role.
- Middleware/layout guards improve navigation but are not the authorization boundary; policies and RPC checks are authoritative.
- Never place the Supabase service-role key in browser code or committed files.
- Validate every payload with Zod and database constraints; normalize registration server-side before uniqueness checks.
- Use managed password hashing and sessions. Seed demo users outside committed credentials, with setup documented separately.
- Return generic authentication errors and rule-specific operational errors without exposing SQL or internal identifiers unnecessarily.

## Reliability and observability

- Use transactions and row locks for state transitions; use idempotent/conditional updates where retries are plausible.
- Prevent duplicate client submissions and wait for server confirmation before changing critical status UI.
- Log command name, actor ID, affected business record, outcome, and safe error code; never log passwords or tokens.
- Preserve local form state after network failures and expose Retry.
- Maintain local migrations and deterministic seed/reset data so the demo can recover from hosted-environment issues.
- Deploy a skeleton early; keep screenshots or a short recorded fallback only after the working demo path exists.

## Proposed repository structure

```text
transitops/
|-- src/
|   |-- app/                         # Seat A: routes, auth/protected layouts, composition
|   |-- components/
|   |   |-- ui/                      # Seat A: accessible primitives
|   |   `-- layout/                  # Seat A: navigation and page shell
|   |-- features/
|   |   |-- fleet/                   # Seat B
|   |   |-- drivers/                 # Seat B
|   |   |-- trips/                   # Seat B
|   |   |-- maintenance/             # Seat B
|   |   |-- finance/                 # Seat C
|   |   |-- dashboard/               # Seat C
|   |   `-- reports/                 # Seat C
|   |-- lib/
|   |   |-- auth/                    # Seat A
|   |   |-- db/                      # Seat C
|   |   `-- validation/              # Feature owner; one writer per file
|   `-- contracts/                   # Seat C: frozen shared types and command contracts
|-- supabase/
|   |-- migrations/                  # Seat C: sole schema/migration writer
|   `-- seed.sql                     # Seat C
|-- tests/
|   |-- unit/                        # Seat C for calculations; feature owner otherwise
|   |-- integration/
|   |   |-- operations/              # Seat B
|   |   `-- database/                # Seat C
|   `-- e2e/                         # Seat A
|-- public/                          # Seat A unless explicitly assigned
|-- AGENTS.md
|-- PRD.md
|-- Architecture.md
|-- Phases.md
|-- Design.md
|-- Team.md
`-- Memory.md
```

Root manifests/configuration and planning documents have one writer at a time, assigned through `Team.md`.

## Decisions and tradeoffs

- **Single deployable application:** faster delivery and simpler hosting than separate frontend/API services; domain boundaries remain explicit inside the repository.
- **Database RPC lifecycle commands:** slightly more SQL work, but atomic state changes and concurrency safety are mandatory.
- **One schema/contract owner:** reduces migration and type conflicts; other seats consume frozen contracts and use mocks until integration.
- **Simple KPI cards and tables first:** charts add presentation value but are not required for correct analytics.
- **One organization:** avoids tenancy complexity and matches the hackathon scope.

## Risks

- **Auth/RLS consumes the schedule:** prove login plus one allowed and one denied protected query in Phase 0/1, and seed demo roles early.
- **Contract drift blocks parallel work:** freeze fields, enums, role matrix, calculation definitions, RPC signatures, and error codes before feature branches diverge.
- **Status corruption through CRUD:** forbid generic operational status writes and cover each RPC with integration tests.
- **Late deployment failure:** deploy the shell by Hour 2 and keep migrations/seed reproducible locally.
- **Revenue/region ambiguity:** use the explicit PRD assumptions unless changed during Phase 0.
- **Scope creep:** do not begin bonus work until all mandatory release checks pass.
