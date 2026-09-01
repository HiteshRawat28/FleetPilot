# Project Memory — FleetPilot

## Current state

- Full-stack prototype with React/Vite frontend, Express/TypeScript API, Prisma, and PostgreSQL.
- Main branch is `main`; the workspace contains uncommitted implementation and generated-file changes. Preserve them.
- Local Docker Compose PostgreSQL was healthy when inspected on 2026-08-31.
- Product surfaces include landing/login, role-filtered dashboard, vehicles, drivers, trips, maintenance, finance, analytics/CSV, and static settings.
- Assignment failure diagnostics are implemented across schema, seed data, shared eligibility rules, create/dispatch APIs, frontend field feedback, dispatch failure modal, and evaluator tests.

## Assignment contract currently present

- Categories: `LMV`, `HMV`, `MCWG`; compatibility is exact match.
- Checked conditions: resource existence, vehicle/driver status, active trip/maintenance context, license expiry/category, cargo capacity, and draft status.
- Backend: `backend/src/services/assignmentEligibility.ts` and `backend/src/server.ts`.
- Tests: `backend/src/services/assignmentEligibility.test.ts`.
- Frontend: `frontend/src/api.ts`, `frontend/src/types.ts`, and trip/vehicle UI in `frontend/src/App.tsx`.
- Schema/seed: `backend/prisma/schema.prisma` and `backend/prisma/seed.ts`.

## Validation snapshot

- Docker Compose configuration validated successfully on 2026-08-31.
- PostgreSQL schema was synchronized without resetting data. Existing vehicles received the safe `LMV` default and demo `Truck-11` was explicitly updated to `HMV`.
- Backend `npm test` passed: 1 test file and 5 assignment evaluator tests.
- Backend `npm run build` passed after the final schema/API changes.
- Frontend `npm run build` passed after the final UI changes; Vite reports only the existing large-chunk advisory.
- API smoke testing confirmed HTTP `409`, `code: ASSIGNMENT_FAILED`, and three simultaneous reasons: active trip, cargo over capacity by exactly 120 kg, and license-category mismatch.
- Authenticated browser testing confirmed the failure panel renders, cargo field receives `field-error`, invalid draft creation is disabled, and no browser console errors were reported.
- Frontend lint previously failed because ESLint 9 has no `eslint.config.*`.

## High-priority follow-up

1. Review required license categories for any non-demo vehicles migrated with the `LMV` default.
2. Stop tracking dependencies/cache/build outputs or define an explicit artifact policy.
3. Restore the frontend lint command and add CI for backend tests plus both builds.
4. Harden remaining lifecycle concurrency, direct status updates, authentication, and role read permissions.
5. Obtain business approval for the implemented realized-performance analytics formulas and define production deployment/backup/monitoring.
6. Address async error states, false affordances, dialog accessibility, focus, reduced motion, and mobile/keyboard tests.

## Milestone log

### 2026-09-01 — Professional realized-performance reports

- Rebuilt Reports & analytics as a decision dashboard with six auditable KPIs, a six-month revenue/cost/profit trajectory, cost composition, vehicle-status distribution, derived operational signals, and a sortable asset profitability scorecard.
- Added a typed `fleetAnalytics` service. Realized revenue now uses completed trips only; recorded fuel, maintenance, toll, driver-payment, and other costs remain separately visible. Per-vehicle output includes revenue, cost, profit, margin, cost per km, distance, trip counts, and ROI.
- Expanded the CSV export to the same asset-level financial fields and added three deterministic analytics tests, bringing the backend suite to 75 passing tests across 12 files.
- Verified the AMartya Transport report in the browser at desktop and 390 px mobile widths with no horizontal page overflow. Also fixed the existing navigation key warning and added accessible names to mobile navigation controls.

### 2026-09-01 — Guarded Copilot operations workflows

- Added deterministic guided routing for assignment review, replacement recommendations, safe cargo matching, maintenance candidates, licence renewals, weekly reports, utilization diagnostics, and fuel-entry preparation so these workflows do not depend on Groq correctly selecting an intent.
- Assignment workflows remain read-only and respect the schema invariant that every saved trip already has a vehicle and driver; draft or active trips can be selected for eligibility review and compatible replacement suggestions.
- Maintenance and fuel workflows return one-time browser handoffs to the existing protected forms. They never execute a write, their payloads are excluded from session history and Groq-visible tool data, and the normal API revalidates role, organization, and record state on save.
- Weekly reporting uses a fixed seven-day window. Utilization diagnostics label seven-day dispatch comparisons as an activity proxy because historical vehicle-status snapshots are not stored.
- Added clickable evidence follow-ups, role-scoped workflow starters, and 8 guided-intent/security assertions; the backend suite now has 62 passing tests across 9 files.

### 2026-09-01 — Dashboard manual trip shortcut

- Connected the dashboard `New trip` action to the existing Trip dispatch workflow, where it opens the full manual trip planner immediately after navigation.
- Reused the current trip form and API path so route estimates, resource availability, assignment validation, profitability, and draft creation remain consistent with trips created from Trip dispatch.
- Limited the shortcut to Owner, Administrator, Fleet Manager, and Dispatcher roles; Safety Officer and Financial Analyst dashboards do not render it.

### 2026-09-01 — Organization-admin conversational trip creation

- Added an organization-administrator guided planner inside Copilot for `OWNER` and `ADMIN`, with organization-scoped clickable vehicle and compatible-driver choices. Remaining route, cargo, distance, and revenue details are collected conversationally, one missing value at a time.
- Selected internal vehicle/driver IDs go directly to the backend rather than through Groq; the conversation and confirmation card display only business-facing details.
- Restricted both preparation and confirmation to `OWNER` and `ADMIN`. Fleet Manager, Dispatcher, Safety Officer, and Financial Analyst cannot access the workflow.
- Preparation remains write-free. Explicit confirmation revalidates organization membership, role, assignment eligibility, token expiry, and idempotency before creating one `DRAFT` trip.
- Admin trip-creation phrases now open the real guided planner deterministically. Model-generated text that imitates a confirmation button without a signed action is replaced with a safe recovery message.
- Assignment failures now show every structured eligibility reason in the chat and automatically reopen current vehicle/driver choices while preserving the already collected route, cargo, distance, and revenue.

### 2026-09-01 — Copilot field-level and session hardening

- Added one server-side disclosure policy for role-specific recent-trip identities, driver licence numbers, trip revenue, and financial analytics.
- Projected tool results before Groq so internal IDs and unnecessary database fields are absent; restricted analytics in both Copilot and direct JSON/CSV APIs.
- Added deterministic final-answer filtering for known identifiers, CUIDs, UUIDs, and JWT-shaped tokens, including ambiguity-path disclosure tests.
- Added organization-scope and per-field tests at the tool boundary; the current backend validation suite has 54 tests across 8 files.
- Replaced browser local-storage JWTs with an 8-hour HttpOnly cookie, moved Copilot history to user/organization-scoped session storage, added origin checks and API security headers, and clear both session and history on logout.

### 2026-09-01 — Global floating Copilot launcher

- Moved Copilot out of the application header into a fixed, circular FleetPilot-branded launcher available across authenticated modules.
- Added keyboard focus treatment, mobile positioning, and reduced-motion behavior while preserving the existing drawer and page context.

### 2026-09-01 — Isolated Copilot edge-case fixture

- Added an organization-targeted, idempotent chatbot fixture and cleanup command; it never invokes the destructive primary seed.
- The fixture covers recommendations, expiring/expired licences, active maintenance, stale drafts, capacity and category conflicts, ambiguous lookups, all trip states, and recent versus older costs.
- Added a prompt checklist covering guarded confirmation, idempotency, stale/expired proposals, role boundaries, prompt injection, rate limiting, and offline API behavior.

### 2026-09-01 — Phase 2 recommendations and guarded Phase 3 draft actions

- Added role-scoped eligible vehicle/driver recommendations and operational-risk summaries for expiring licences, active maintenance, and stale drafts.
- Added draft-trip proposal cards with short-lived signed confirmation tokens that are never persisted in browser history.
- Confirmation is bound to the user, organization, role, action type, and idempotency key; it revalidates assignment state in a serializable transaction before creating a `DRAFT` trip.
- Added `CopilotAction` audit/idempotency storage, an additive migration and upgrade path, token integrity/expiry tests, and expanded role-matrix tests.
- Copilot still cannot dispatch, complete, cancel, edit, delete, operate maintenance, record finance data, or run autonomously. Those later phases require separately approved workflows and notification design.

### 2026-08-31 — Phase 1 read-only FleetPilot Copilot

- Added an authenticated Copilot drawer with page-aware prompts, session-local conversation history, configuration/error states, and structured evidence cards.
- Added a stateless Groq Responses API tool loop, a four-round cap, a per-user request limit, and a configurable `GROQ_MODEL` defaulting to `openai/gpt-oss-20b`.
- Added role-specific, organization-scoped read tools for fleet status, vehicles, drivers, trips, maintenance, finance, analytics, and assignment validation.
- Kept the model outside Prisma and all write workflows. Assignment answers reuse the centralized eligibility evaluator and Phase 1 refuses mutations.
- Added role-matrix tests and server-only environment documentation. Browser history is intentionally local and capped; durable conversation/audit storage remains future work.

### 2026-08-31 — Exact assignment failure diagnostics

- Completed centralized multi-reason eligibility checks for trip creation and dispatch.
- Added vehicle license requirements, structured API errors, local form prechecks, field highlighting, and a dispatch failure modal.
- Validated with 5 unit tests, backend/frontend builds, a live API smoke test, and authenticated browser UI inspection.
- Kept driver license storage backward compatible as text while enforcing allowed categories at the API boundary; no database reset was used.

## Durable cautions

- Never run `backend/prisma/seed.ts` against valued data; it deletes existing application rows.
- Do not treat tracked `node_modules`, `dist`, generated Prisma client, or Vite cache as authoritative source.
- Do not store secrets or real credentials in this file.
- Do not present static demo values as real live telemetry.
- The API, not the client, owns authorization and assignment validity.
