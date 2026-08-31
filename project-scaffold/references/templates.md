# Project Scaffold Templates

Use these as adaptable skeletons, not mandatory forms. Omit sections that add no value for a small project and expand sections only when the project's risk or complexity warrants it. Replace all braces and instructional comments with project-specific content.

## Contents

- `PRD.md`
- `Architecture.md`
- `AGENTS.md`
- `Phases.md`
- `Design.md`
- `Team.md`
- `Memory.md`

## `PRD.md`

```markdown
# Product Requirements — {Project name}

## Overview
{What the product is, who it helps, and why it should exist.}

## Goals
- {Measurable product or user outcome}

## Non-goals
- {Explicit exclusion that prevents scope creep}

## Target users
### {User group}
- Need: {problem or job to be done}
- Context: {important environment, skill, or access constraint}

## v1 requirements

| ID | Requirement | Acceptance criteria |
|---|---|---|
| R1 | {User-visible capability} | {Concrete, observable definition of done} |

## Key user flows
1. {Trigger} -> {steps} -> {successful outcome}

## Non-functional requirements
- Performance: {only if relevant}
- Security and privacy: {data sensitivity, authorization, retention}
- Accessibility: {target and important accommodations}
- Reliability: {failure tolerance or recovery expectations}

## Constraints and assumptions
- Constraint: {fixed boundary}
- Assumption: {provisional belief and how/when to validate it}

## Success measures
- {Metric or check that indicates v1 is useful and complete}

## Later scope
- {Useful idea explicitly deferred beyond v1}

## Open decisions
- {Decision} — resolve before {phase or milestone}
```

## `Architecture.md`

````markdown
# Architecture — {Project name}

## Architectural summary
{A short description of the system shape and its main tradeoff.}

## System flow
1. {Actor or system} sends {input}.
2. {Component} validates or transforms it.
3. {Component} persists or returns {result}.

## Technology choices

| Area | Choice | Status | Rationale |
|---|---|---|---|
| Client | {choice} | Decided/Proposed | {why it fits the constraints} |
| Server | {choice} | Decided/Proposed | {why} |
| Data | {choice} | Decided/Proposed | {why} |
| Deployment | {choice} | Decided/Proposed | {why} |

## Components and responsibilities
- **{Component}:** {single clear responsibility and important boundary}

## Data model
### {Entity}
- `{field}`: {type and meaning}
- Invariants: {rules that must always hold}

## Interfaces and integrations
- `{method/path/event}` — {request, response, authorization, and important errors}

## Security and privacy
- {Trust boundaries, permissions, secret handling, sensitive-data rules}

## Reliability and observability
- {Error handling, retries, idempotency, logging, metrics, backup/recovery as relevant}

## Proposed repository structure

```text
{project-root}/
|-- {directory}/        # {responsibility}
|-- {file}              # {responsibility}
`-- ...
```

## Decisions and tradeoffs
- **{Decision}:** {choice, alternatives considered, and consequence}

## Risks
- **{Risk}:** {impact and mitigation or validation step}
````

## `AGENTS.md`

Keep this file operational and stable. Do not duplicate the PRD or temporary progress.

```markdown
# Repository Instructions

## Project context
- Purpose: {one-sentence product purpose}
- Current scope: {v1 boundary}
- Planning docs: `PRD.md`, `Architecture.md`, `Phases.md`, `Design.md`, `Team.md`, `Memory.md`

## Before changing code
- Read the relevant planning documents plus the current `Team.md` allocation and latest `Memory.md` state.
- Inspect existing code and tests before modifying behavior.
- Keep work within the active phase unless the user explicitly changes scope.
- Respect the owned paths and shared contracts recorded in `Team.md`; do not overwrite another teammate's in-progress changes.

## Commands
- Setup: `{verified command, or state that it is not established yet}`
- Develop: `{verified command, or state that it is not established yet}`
- Test: `{verified command, or state that it is not established yet}`
- Lint/format: `{verified command, or state that it is not established yet}`
- Build: `{verified command, or state that it is not established yet}`

## Engineering conventions
- {Project-specific architecture, naming, typing, error, and dependency rules}
- {Where tests belong and what changes require them}

## Collaboration
- One writer owns a file, migration, schema, or shared interface at a time.
- Keep changes scoped to the claimed work item and preserve unrelated teammate changes.
- The owner runs item-level validation and provides a structured handoff; a different teammate reviews risk-bearing changes.
- The milestone integration owner merges in dependency order and runs the combined validation.
- If an external tracker is the coordination source, do not duplicate live status in `Team.md`.

## Product and design constraints
- {Stable accessibility, privacy, performance, or UX invariant}

## Boundaries
- Always: {required validation, migration care, compatibility rule, or documentation update}
- Ask first: {high-impact choice for which standing authorization is absent}
- Never: {specific unsafe or out-of-scope action}

## Memory protocol
- Update `Memory.md` after a meaningful milestone, durable decision, deviation, or blocker.
- Keep current state concise, retain useful history, and never write secrets or credentials.
```

## `Phases.md`

```markdown
# Build Phases — {Project name}

## Delivery strategy
{How the phases reduce risk and produce testable increments.}

## Status

| Phase | Outcome | Status | Depends on |
|---|---|---|---|
| 1 | {outcome} | Not started | — |

## Phase 1 — {Name}

**Outcome:** {User-visible or technically demonstrable result}

**Requirements:** R1, {other PRD IDs}

### Work
- [ ] **P1-T1:** {Coherent implementation task with a small, testable outcome}

### Done when
- [ ] {Observable acceptance check}
- [ ] {Relevant automated or manual validation}
- [ ] `Memory.md` reflects the resulting state and decisions

## Phase 2 — {Name}
{Repeat only for as many phases as the project needs.}

## Release readiness
- [ ] All v1 requirements have acceptance evidence.
- [ ] Security, accessibility, failure states, and deployment checks relevant to this project pass.
- [ ] Known limitations and rollback or recovery steps are documented where needed.
```

## `Design.md`

```markdown
# Product Design — {Project name}

## Experience principles
- {Principle tied to target-user needs}

## Information architecture
- {Screen or area}: {purpose and primary actions}

## Core interaction flows
1. {Entry} -> {action} -> {feedback} -> {completion or recovery}

## Visual direction
- Tone: {for example calm, precise, playful, or utilitarian}
- References: {user-provided reference or clearly labeled proposal}

## Design tokens

### Color
| Role | Token | Value | Usage |
|---|---|---|---|
| Primary | `--color-primary` | {hex or other value} | {usage} |

### Typography
- Heading: {family, weight, scale}
- Body: {family, size, line height}
- Code/data: {if relevant}

### Spacing and shape
- Spacing scale: {for example 4, 8, 12, 16, 24, 32}
- Radius: {values and usage}
- Elevation/borders: {convention}

## Component guidance
- **{Component}:** {variants, behavior, and constraints}

## States and feedback
- Loading: {pattern}
- Empty: {pattern and next action}
- Error: {message and recovery action}
- Disabled: {appearance and explanation}
- Success: {confirmation behavior}

## Responsive behavior
- {Breakpoint-independent rule or specific layout transition}

## Accessibility
- {Keyboard, focus, contrast, semantics, motion, and target-size requirements as applicable}

## Content voice
- {Tone, terminology, formatting, and error-message guidance}
```

## `Team.md`

Keep live ownership separate from roadmap scope and durable project history. If the team uses a tracker, make it the single source of live status and keep only stable working agreements plus tracker links here. If this file is the coordination source, one rotating coordination owner should update it on the shared branch rather than four feature branches editing it independently.

```markdown
# Team Coordination — {Project name}

> Coordination for the four-person team. `Phases.md` defines the roadmap; `Memory.md` records durable state and decisions. Keep one source of truth for live status and never store secrets here.

## Coordination source
- Live board: `Team.md` / {tracker URL or location}
- Update owner: {team handle or Unassigned}
- Rule: {If a tracker is used, do not duplicate status here. If this file is used, only the update owner changes live assignments on the shared branch.}

## Team

Use each teammate's chosen handle. Responsibilities are assigned per work item and may rotate.

| Member | Strengths or preferences | Availability or constraint |
|---|---|---|
| {handle or Unassigned} | {relevant strengths} | {only when useful} |

## Active work

Statuses: `Ready`, `Active`, `Blocked`, `In review`, `Done`.

| ID | Outcome / requirement | Owner | Reviewer | Status | Depends on | Branch / worktree | Owned paths or contract |
|---|---|---|---|---|---|---|---|
| P1-T1 | {small testable outcome / R1} | {handle} | {different handle} | Ready | — | {branch} | {files, API, schema, or UI surface} |

## Working agreements
- Claim an item in the coordination source before editing; use one accountable human owner and a different reviewer when risk warrants it.
- Keep one active implementation item per person unless the team deliberately changes that limit.
- Start parallel work only after dependencies and shared interfaces are settled.
- Use a separate branch or worktree for each active item when the repository uses Git.
- One writer owns a file, migration, schema, or interface at a time.
- Propose changes to shared contracts before dependent work continues; record durable contract decisions in `Architecture.md`.
- Owners synchronize before handoff, run item-level checks, and keep changes scoped.
- Reviewers check acceptance criteria and risks without silently expanding scope.
- Assign one rotating integration owner per milestone. Integrate in dependency order and run project-level validation after merges.

## Current integration
- Integration owner: {handle or Unassigned}
- Target: {phase or milestone}
- Merge order: {work item IDs in dependency order}
- Full validation: {verified command or Not established}

## Handoff contract
Each completed item must report:

- outcome and linked requirement IDs;
- changed paths and interface, migration, or dependency impact;
- validation commands and evidence;
- decisions, assumptions, known limitations, and risks;
- exact review or integration action needed.

## Coordination blockers
- {work item ID}: {blocker, owner, decision needed, and next check}

## Codex subagent boundary
- Human teammates remain accountable for ownership, review, and merge decisions.
- Use temporary subagents for bounded independent analysis, tests, or disjoint implementation when useful.
- Do not record transient subagent IDs as team members or treat agent output as independent human review.
```

## `Memory.md`

This is a maintained handoff document, not a transcript. Initialize it with the known starting state; keep it concise during implementation.

```markdown
# Project Memory — {Project name}

> This file is the concise handoff state for future work. Update it after meaningful milestones, durable decisions, deviations, or blockers. Do not store secrets. The planning documents and code remain the source of truth for their respective concerns.

## Current state
- Status: {for example, planning complete; implementation not started}
- Active phase: {phase or none}
- Last verified: {date or milestone, if useful}

## Next actions
1. {Most useful next action}

## Blockers
- None.

## Durable decisions and deviations
- {Decision or deviation}: {reason and consequence}

## Known issues
- None.

## Milestone log

<!-- Append only durable entries; omit routine session chatter.
### YYYY-MM-DD — {milestone}
- Completed: {result}
- Validation: {tests or evidence}
- Next: {handoff action}
-->
```
