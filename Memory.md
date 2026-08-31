# Project Memory - TransitOps

> Concise handoff state for future work. Update after meaningful milestones, durable decisions, approved deviations, or blockers. Planning documents and code remain the source of truth for their respective concerns. Never store secrets.

## Current state

- Status: P0-A1 application foundation implemented on `seat-a/foundation` and awaiting Seat B review.
- Active phase: Phase 0 - Contract freeze and foundation.
- Last verified: 2026-08-31 Seat A application validation and responsive browser smoke test.
- Repository state: Git branch and locked Next.js/TypeScript application tooling are initialized; database tooling is not yet established.

## Next actions

1. Seat B reviews P0-A1 against its handoff and the public/protected shell acceptance criteria.
2. Run the 30-minute Phase 0 decision/freeze session and confirm the proposed stack, role label/matrix, formulas, `region`, and `revenue`.
3. Hitesh begins P0-C1 on `seat-c/data`; Sanket begins P0-B1 after the P0-C1 draft contracts are available.
4. Configure the Vercel project when an authorized workspace is available; until then use the verified local production fallback in `README.md`.

## Blockers

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

- Vercel authorization is unavailable in this workspace, so no hosted shell URL exists; the local production fallback is verified.
- Authentication is intentionally not wired in Phase 0. The login screen collects no credentials, and `/dashboard` is a composition preview until P1-A1 enforces sessions and roles.
- Database migrations, seed/reset commands, Supabase configuration, and demo accounts await P0-C1 and Phase 1.
- npm reports the ESLint 9 line as unsupported, but the current `eslint-config-next` plugin set does not yet accept ESLint 10. Keep the peer-compatible pin until the Next.js toolchain supports ESLint 10.

## Milestone log

### 2026-08-31 - P0-A1 application foundation completed

- Ownership: Amartya/Seat A implemented on `seat-a/foundation`; Sanket/Seat B is the required reviewer.
- Delivered: locked Next.js 16/React 19/strict TypeScript foundation, Tailwind design tokens, accessible public and protected route groups, responsive app shell, loading/error/not-found states, environment example, and local/deployment guidance.
- Validation: dependency audit reported zero vulnerabilities; formatting, ESLint, strict typecheck, 7 Vitest checks, and optimized production build passed; development and production servers returned HTTP 200 for their smoke routes.
- Visual QA: 1280 px and 360 px browser checks showed no page-level horizontal overflow; dashboard placeholders use N/A-style dashes rather than fabricated zero KPIs; login collects no credentials before managed auth exists; browser console contained no warnings or errors.
- Deployment: no Vercel CLI/auth context was present. The documented `npm run build` plus `npm start` production fallback was verified.
- Next: Seat B review, then integrate in the Phase 0 dependency order after P0-C1 contract work.

### 2026-08-31 - Planning scaffold completed

- Completed: PRD, architecture, repository instructions, phased plan, product design, three-person coordination, and durable memory.
- Validation: mandatory requirements and business rules were mapped to phases; writable paths are disjoint; integration order and release checks are documented.
- Next: assign team seats and complete Phase 0 contract freeze.
