# Team Coordination - TransitOps

> Coordination for a three-person team. `Phases.md` defines the roadmap; `Memory.md` records durable state and decisions. No implementation begins until each real teammate is mapped to exactly one seat below.

## Coordination source

- Live board: `Team.md` until the team adopts an external tracker.
- Update owner: Seat A (Amartya).
- Rule: only the update owner edits live assignments/status on the shared branch. If a tracker is adopted, add its link here and stop duplicating status.

## Team seats

Seats describe path ownership, not invented identities or expertise. Replace only the Handle and Availability cells when the team assigns people; keep responsibilities stable for the hackathon unless all three agree to a recorded change.

| Seat | Handle | Best fit | Availability/constraint |
|---|---|---|---|
| Seat A - App/Integration | Amartya | Frontend integration, auth shell, accessible components, deployment, E2E | Not stated |
| Seat B - Operations | Sanket | Vehicle/driver/trip/maintenance feature implementation and rule UX | Not stated |
| Seat C - Data/Insights | Hitesh | PostgreSQL, RLS/RPCs, shared contracts, finance, dashboard, calculations | Not stated |

## Exclusive path ownership

| Seat | Writable paths/contracts | Default reviewer |
|---|---|---|
| A | Root manifests/config while assigned; `src/app/**`; `src/components/**`; `src/lib/auth/**`; `public/**`; `tests/e2e/**` | Seat B |
| B | `src/features/fleet/**`; `src/features/drivers/**`; `src/features/trips/**`; `src/features/maintenance/**`; `tests/integration/operations/**` | Seat C |
| C | `supabase/**`; `src/contracts/**`; `src/lib/db/**`; `src/features/finance/**`; `src/features/dashboard/**`; `src/features/reports/**`; `tests/integration/database/**`; calculation tests under `tests/unit/**` | Seat A |

- `src/lib/validation/**` is split by feature only after Seat C defines contract ownership; one writer per file.
- Planning files are lead/integration-owner writable only. Other seats propose changes in handoff notes.
- If a path does not exist yet, its intended owner is unchanged.
- Any exception requires a Team.md ownership transfer before editing, never an informal overlap.

## Active work

Statuses: `Ready`, `Active`, `Blocked`, `In review`, `Done`.

| ID | Outcome / requirement | Owner seat | Human owner | Reviewer | Status | Depends on | Branch/worktree | Owned paths or contract |
|---|---|---|---|---|---|---|---|---|
| P0-A1 | Runnable app shell and verified commands | A | Amartya | B | In review | Team seat mapping | `seat-a/foundation` | Root config, `src/app/**`, `src/components/**`, `src/lib/auth/**` |
| P0-B1 | Operations feature contracts/mocks | B | Sanket | C | Ready | P0-C1 draft contracts | `seat-b/operations` | Seat B feature paths only |
| P0-C1 | Schema, RLS/RPC contracts, seed outline | C | Hitesh | A | Ready | Team seat mapping | `seat-c/data` | `supabase/**`, `src/contracts/**`, `src/lib/db/**` |
| P0-ALL | Freeze stack, roles, formulas, contracts, paths | A coordinates | All three | All three | Ready | Real people mapped to seats | Shared session | Decisions only; update owner writes planning changes |

## Parallel execution map

| Phase | Seat A | Seat B | Seat C | Integration owner | Merge order |
|---|---|---|---|---|---|
| 0 | Bootstrap/shell/deploy | Feature-local mocks | Schema/contracts/RPC signatures | A | C contracts -> A baseline -> B mocks |
| 1 | Auth/routes/design system | Vehicle/driver UI | Registry DB/RLS/tests | A | C -> A -> B |
| 2 | Route composition/feedback | Trip/maintenance UI | Atomic lifecycle RPCs/tests | B | C -> B -> A |
| 3 | Finance/dashboard route composition | Trip-to-fuel integration | Finance/dashboard/report/CSV | C | C -> B -> A |
| 4 | Full integration/E2E/deploy | Operations rule QA/fixes | Security/data/accessibility QA/fixes | A | Contract/schema -> auth/shell -> features -> E2E |
| 5 | Demo lead/freeze | Invalid-rule and lifecycle demo | KPI/CSV verification/fallback | A | No feature merges; fixes by path owner only |

Work may run concurrently within a phase only after the named contracts it consumes are frozen. Phase 3 data work may overlap late Phase 2, but it must not change Phase 2 command signatures.

## Contract-settlement order

1. Entity fields, enums, normalized values, and required constraints.
2. Role names and permission matrix.
3. Calculation definitions and N/A behavior.
4. RPC signatures, stable domain error codes, and authorization rules.
5. Feature export interfaces and route map.
6. Shared component API and responsive conventions.

Seat C is the sole schema/contract writer. Seat A and B review before freeze. After freeze, a proposed contract change pauses affected dependents until all three accept it and `Architecture.md` is updated by the integration owner.

## Working agreements

- Map one real person to each seat before implementation; do not leave an active item without a human owner.
- Claim an item in the coordination source before editing and keep one active implementation item per person.
- Use a separate branch or worktree per seat when Git is initialized.
- Synchronize on the contract baseline before parallel feature work and before handoff.
- One writer owns each file, migration, schema, interface, root config, and planning document at a time.
- Keep changes scoped; preserve unrelated teammate changes.
- Owners run item-level checks. Reviewers check acceptance criteria and risk without expanding scope.
- Integration follows the listed dependency order; the integration owner runs full validation after merges.
- Do not begin bonus features until the Phase 4 release checklist is green and all three agree.

## Current integration

- Integration owner: Seat A (Amartya).
- Target: Phase 0 contract freeze.
- Merge order: P0-C1 -> P0-A1 -> P0-B1.
- Full validation: Seat A application commands are verified; Seat C database commands remain pending P0-C1.

## Handoff contract

Every completed item reports:

- outcome and linked requirement/business-rule IDs;
- changed paths and any contract, migration, or dependency impact;
- commands run and concise evidence/results;
- decisions, assumptions, known limitations, and risks;
- exact review or integration action required.

## Coordination blockers

- **DEC-001:** proposed stack, Trip Operator label, role matrix, `region`, `revenue`, and calculation definitions await the Phase 0 freeze. They are safe defaults, not permission to drift during implementation.

## Codex subagent boundary

- Human teammates remain accountable for ownership, review, and merge decisions.
- Temporary subagents may assist with bounded analysis, tests, or disjoint implementation when explicitly authorized.
- Do not record transient agent IDs as team members or treat agent output as independent human review.
