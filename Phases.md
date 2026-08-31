# Build Phases - TransitOps

## Delivery strategy

The schedule uses a short serialized contract freeze followed by three parallel, path-isolated workstreams. Each phase leaves a demonstrable vertical slice, includes an integration checkpoint, and protects the final hour for a stable demo rather than new scope.

Seat assignments refer to `Team.md`; real names must be mapped before coding begins.

## Status

| Phase | Timebox | Outcome | Status | Depends on |
|---|---|---|---|---|
| 0 | 0:00-0:30 | Contracts, ownership, and runnable shell are frozen | Not started | - |
| 1 | 0:30-2:15 | Authenticated vehicle/driver registry slice | Not started | Phase 0 |
| 2 | 2:15-4:15 | Rule-safe dispatch and maintenance lifecycle | Not started | Phase 1 |
| 3 | 4:15-5:45 | Fuel, expenses, dashboard, analytics, and CSV | Not started | Phase 2 contracts; implementation may overlap late Phase 2 |
| 4 | 5:45-7:00 | Integrated, responsive, permission-safe release candidate | Not started | Phases 1-3 |
| 5 | 7:00-8:00 | Seeded deployment and rehearsed demo | Not started | Phase 4 |

## Phase 0 - Contract freeze and foundation

**Outcome:** All three people can work in parallel against agreed fields, permissions, commands, paths, and a runnable/deployed shell.

**Requirements:** Supports every v1 requirement; resolves prerequisites rather than delivering one requirement alone.

### Parallel work

- [ ] **P0-A1 (Seat A):** Initialize the Next.js/TypeScript application, protected/public route skeletons, root commands, environment example, and first deployment. Own root config and `src/app/**`.
- [ ] **P0-B1 (Seat B):** Turn the approved contracts into feature-local interfaces/mocks for fleet, drivers, trips, and maintenance without editing shared contract files.
- [ ] **P0-C1 (Seat C):** Define Supabase schema, enums, normalized fields, RPC signatures, error codes, seed outline, and generated/shared contract types. Solely own `supabase/**` and `src/contracts/**`.
- [ ] **P0-ALL:** Map real teammates to seats; confirm role label, role matrix, stack, formulas, `region`, `revenue`, and repository path ownership.

### Done when

- [ ] Setup, development, test/build, and database commands that exist are run successfully and recorded in `AGENTS.md`.
- [ ] The shell is deployed or a documented local fallback works.
- [ ] Schema fields, enums, role matrix, calculation definitions, RPC signatures, and error codes are approved by all three teammates.
- [ ] Each person has one seat, one branch/worktree, and disjoint writable paths.
- [ ] `Memory.md` records the frozen decisions and verified commands.

## Phase 1 - Secure registries

**Outcome:** A user can authenticate with a seeded role and perform permitted vehicle/driver registry work through responsive screens.

**Requirements:** V1-AUTH-001, V1-AUTH-002, V1-UI-001, V1-VEH-001, V1-DRV-001; BR-001.

### Parallel work

- [ ] **P1-A1 (Seat A):** Implement login/logout, session loading, protected layout, role-aware navigation, route composition, global loading/error/403 states, and accessible primitives.
- [ ] **P1-B1 (Seat B):** Implement vehicle and driver list/create/view/edit/archive feature modules with validation, search/filter states, normalized duplicate feedback, history-safe archive confirmation, and responsive record views.
- [ ] **P1-C1 (Seat C):** Implement registry migrations, constraints, seed data, RLS policies, typed queries, and allowed/denied integration tests.

### Integration order

1. P0-C1 contracts/schema, then P1-C1 database behavior.
2. P1-A1 auth shell and route composition.
3. P1-B1 feature screens against real contracts.

### Done when

- [ ] Anonymous users cannot access protected pages or data.
- [ ] Each seeded role has at least one verified allowed and denied operation.
- [ ] Duplicate normalized registrations are rejected by UI feedback and the database.
- [ ] Archiving a vehicle or driver preserves historical references and removes the record from active selectors and lists.
- [ ] Vehicle and driver workflows pass at 360 px and desktop widths with loading, empty, validation, error, disabled, and success states.
- [ ] Tests/build for the integrated slice pass and `Memory.md` is updated.

## Phase 2 - Dispatch and maintenance control

**Outcome:** The mandatory example workflow runs end to end, and every invalid dispatch or maintenance transition is rejected without partial state changes.

**Requirements:** V1-TRIP-001, V1-TRIP-002, V1-TRIP-003, V1-MNT-001; BR-002, BR-003, BR-004, BR-005, BR-006, BR-007, BR-008, BR-009, BR-010, BR-011, BR-012.

### Parallel work

- [ ] **P2-A1 (Seat A):** Compose Trip and Maintenance routes, confirmation dialogs, global command feedback, permission boundaries, and lifecycle refresh behavior.
- [ ] **P2-B1 (Seat B):** Implement draft trip, eligibility selectors, validation summary, trip detail/stepper, transition actions, and maintenance open/close feature modules.
- [ ] **P2-C1 (Seat C):** Implement eligibility queries plus transactional dispatch, completion, cancellation, maintenance-open, and maintenance-close RPCs with row locks, constraints, RLS checks, and integration tests.

### Integration order

1. P2-C1 command contracts and error codes.
2. P2-B1 feature modules against those contracts.
3. P2-A1 route composition and permission/error integration.

### Done when

- [ ] The 500 kg vehicle / 450 kg trip scenario dispatches, completes, enters maintenance, and disappears from eligibility as described in the brief.
- [ ] Retired, In Shop, and On Trip vehicles; expired, Suspended, and On Trip drivers; excessive cargo; duplicate active maintenance; invalid transitions; and decreasing odometers are blocked.
- [ ] A concurrency test proves two dispatch attempts for the same resource cannot both succeed.
- [ ] No failed command leaves a partial trip/vehicle/driver/maintenance state.
- [ ] Keyboard and mobile smoke checks pass; tests/build pass; `Memory.md` is updated.

## Phase 3 - Cost and operational visibility

**Outcome:** Fuel and expenses drive reconcilable KPIs, efficiency, cost, ROI, filters, and CSV output.

**Requirements:** V1-COST-001, V1-DASH-001, V1-AN-001, V1-EXP-001.

### Parallel work

- [ ] **P3-A1 (Seat A):** Compose dashboard, finance, and report routes; add responsive filter presentation, panel-level retry, navigation, and export feedback.
- [ ] **P3-B1 (Seat B):** Finish trip-completion fuel integration and verify operational status/list refreshes; assist with operations integration tests only inside Seat B paths.
- [ ] **P3-C1 (Seat C):** Implement fuel/expense features, maintenance-expense linkage, KPI/report queries, calculation tests, filtered dashboard/report components, and server-side CSV serialization.

### Integration order

1. P3-C1 data/calculation contracts and feature exports.
2. P3-B1 trip-to-fuel integration.
3. P3-A1 route composition and full navigation.

### Done when

- [ ] Negative litres/cost/expense values are rejected and maintenance cost is counted once.
- [ ] Seeded KPIs match the definitions in `PRD.md` under type, status, and region filters.
- [ ] Fuel efficiency, operational cost, and ROI match hand-calculated fixtures; zero denominators display N/A.
- [ ] Exported CSV headers, rows, and filters match the visible report.
- [ ] Partial dashboard errors do not erase successful panels; tests/build pass; `Memory.md` is updated.

## Phase 4 - Integration and resilience

**Outcome:** One deployable release candidate passes rule, role, accessibility, responsive, and recovery checks.

**Requirements:** All v1 IDs.

### Parallel work

- [ ] **P4-A1 (Seat A, integration owner):** Integrate in dependency order, run production build and Playwright demo path, verify routing/session/deployment, and coordinate fixes by path owner.
- [ ] **P4-B1 (Seat B):** Run the complete operations rule matrix and fix fleet/driver/trip/maintenance defects only inside Seat B paths.
- [ ] **P4-C1 (Seat C):** Run RLS, transaction, calculation, CSV, keyboard, contrast, responsive, and state QA; fix only Seat C paths and return other defects to owners.

### Done when

- [ ] All mandatory acceptance criteria have recorded evidence.
- [ ] Production build, unit, integration, concurrency, RBAC-negative, and critical end-to-end checks pass.
- [ ] Loading, initial-empty, filtered-empty, error, disabled, submitting, success, permission-denied, and retry states are verified.
- [ ] Core tasks work by keyboard and at 360 px, 768 px, and 1280 px.
- [ ] Deployment, migrations, seed/reset, known limitations, and recovery steps are documented.

## Phase 5 - Demo lock

**Outcome:** Judges can see a stable, timed, explainable demonstration with a recovery path.

**Requirements:** Demonstrates all v1 outcomes; no new product scope.

### Parallel work

- [ ] **P5-A1 (Seat A):** Freeze deployments, verify demo URLs/accounts/setup, and own the timed walkthrough.
- [ ] **P5-B1 (Seat B):** Prepare the invalid-dispatch examples and verify the full operational lifecycle against reset data.
- [ ] **P5-C1 (Seat C):** Verify KPI/ROI/CSV expected values and prepare fallback screenshots or recording after the live path is stable.

### Done when

- [ ] One clean timed rehearsal and one reset/recovery rehearsal succeed.
- [ ] The demo shows authentication/RBAC, registries, blocked invalid dispatch, valid dispatch, completion, maintenance, fuel/expenses, dashboard, analytics, and CSV.
- [ ] No bonus work is merged after the freeze.
- [ ] `Memory.md` records final state, validation, known limitations, and next action.

## Release readiness

- [ ] Every v1 requirement has acceptance evidence.
- [ ] BR-001 through BR-012 pass.
- [ ] Security, accessibility, failure-state, responsive, build, deployment, and recovery checks pass.
- [ ] Known limitations and rollback/reset steps are documented.
- [ ] Bonuses begin only after this checklist is complete and all three teammates agree.
