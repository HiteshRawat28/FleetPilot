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
5. Define analytics formulas and production deployment/backup/monitoring.
6. Address async error states, false affordances, dialog accessibility, focus, reduced motion, and mobile/keyboard tests.

## Milestone log

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
