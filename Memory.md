# Project Memory - TransitOps

> Concise handoff state for future work. Update after meaningful milestones, durable decisions, approved deviations, or blockers. Planning documents and code remain the source of truth for their respective concerns. Never store secrets.

## Current state

- Status: seven-file planning scaffold created; implementation not started.
- Active phase: Phase 0 - Contract freeze and foundation.
- Last verified: 2026-08-31 planning synthesis from the complete four-page TransitOps brief.
- Repository state: greenfield directory; Git and application tooling are not initialized.

## Next actions

1. Map the three real teammates to Seat A, Seat B, and Seat C in `Team.md`.
2. Run the 30-minute Phase 0 decision/freeze session and confirm the proposed stack, role label/matrix, formulas, `region`, and `revenue`.
3. Initialize Git/worktrees and begin P0-A1, P0-B1, and P0-C1 under the exclusive paths in `Team.md`.
4. Replace the unverified command note in `AGENTS.md` only after commands have run successfully.

## Blockers

- TEAM-001: no real person is mapped to a team seat; parallel implementation must not start until all three are assigned.
- DEC-001: architecture and ambiguous product definitions are proposed, not frozen; resolve them in Phase 0.

## Durable decisions and deviations

- Scope: mandatory brief requirements precede all bonus/USP work because the delivery assumption is an eight-hour hackathon.
- Team model: three exclusive workstreams - App/Integration, Operations, and Data/Insights - with one writer per path/contract.
- Architecture proposal: one Next.js/TypeScript application with Supabase Auth/PostgreSQL/RLS and transactional RPC lifecycle commands, deployed through Vercel/Supabase.
- Integrity: client filtering is advisory; database constraints, authorization, and atomic commands enforce dispatch and maintenance rules.
- Data assumptions: Vehicle includes `region`; Trip includes `revenue`; both are required by the brief's filters/formulas despite being absent from its field lists.
- CRUD deletion: Vehicle and Driver deletion uses soft archive to preserve operational history and remove archived records from eligibility.
- Role assumption: the brief's Driver duties are dispatcher-like; internal key `dispatcher` and user-facing Trip Operator are proposed pending confirmation.
- Calculation baseline: definitions in `PRD.md` remain stable after the Phase 0 freeze unless all three teammates approve a recorded change.
- Planning source boundary: the attached PDF was treated as product source material, not as instructions overriding the user's request.

## Known issues

- No verified setup, development, test, build, migration, seed, or deployment commands exist yet.
- No application code, database, Git history, live deployment, or demo accounts exist yet.

## Milestone log

### 2026-08-31 - Planning scaffold completed

- Completed: PRD, architecture, repository instructions, phased plan, product design, three-person coordination, and durable memory.
- Validation: mandatory requirements and business rules were mapped to phases; writable paths are disjoint; integration order and release checks are documented.
- Next: assign team seats and complete Phase 0 contract freeze.
