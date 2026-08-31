# Team and Multi-Agent Prompts

Use these prompts when the team wants explicit parallel delegation or a consistent handoff. Replace braces with project-specific facts. Keep the number of workers proportional to the independent work; do not fill every slot mechanically.

## Initial scaffold

```text
Use $project-scaffold to create the planning and teamwork scaffold for {project} from {requirements and source files}. Act as lead and use up to three subagents for independent read-only analysis of: product scope and acceptance criteria; architecture, security, and operations; experience, accessibility, delivery, and team risks. Give all workers the same confirmed constraints. Wait for them, verify and reconcile their findings, then have the lead create one consistent seven-file scaffold. Preserve existing work, identify assumptions, and validate cross-document coverage.
```

## Four-person allocation

```text
Turn {phase or backlog} into a four-person execution plan. Define small work items with stable IDs, outcomes, dependencies, acceptance criteria, one human owner, a different reviewer when appropriate, branch or worktree, and exclusive owned paths or contracts. Identify what can run in parallel and what must be serialized. Do not assign overlapping writable paths. Return the allocation, contract-settlement order, merge order, and combined verification plan; update the single coordination source only.
```

## Parallel implementation

```text
Implement {phase or work items} with one lead and up to three subagents only where the work is independent. First inspect the repository and create a shared brief covering scope, non-goals, fixed constraints, existing user changes, interfaces, file ownership, dependencies, and validation. Give each worker a bounded outcome and disjoint writable paths; reserve shared configuration, schemas, migrations, manifests, AGENTS.md, Team.md, and Memory.md for the lead unless explicitly assigned. Wait for all workers, inspect their actual changes, reconcile contracts centrally, run integrated checks, and provide one synthesized result.
```

## Worker brief

```text
You are Worker {number} in a lead-plus-workers Codex task.

Shared brief
- Objective and definition of done: {outcome}
- Scope: {included work}
- Non-goals: {excluded work}
- Fixed constraints and contracts: {constraints}
- Existing changes to preserve: {changes}
- Validation: {commands or acceptance checks}

Your workstream
- Task: {bounded task}
- Writable paths: {exclusive files or directories, or read-only}
- Read-only context: {files}
- Dependencies already satisfied: {facts}

Do not expand scope, change shared contracts, edit outside your ownership, or spawn more agents. Preserve user and teammate changes. If blocked, report the exact blocker instead of guessing. Return: result; files changed or findings; validation and results; assumptions or decisions; risks, blockers, and integration notes.
```

## Independent review

```text
Review {feature, branch, or change set} with up to three read-only subagents focused on: correctness and edge cases; security and privacy; maintainability, accessibility, and test coverage. Do not let reviewers modify files. Wait for all reviews, verify each claim against the repository, deduplicate findings, and synthesize one prioritized report with severity, evidence, file references, recommended fixes, and a pass or changes-requested conclusion. Agent review supports but does not replace the assigned human reviewer.
```

## Integration and stabilization

```text
Act as integration lead for {milestone}. Integrate {work item IDs} in dependency order. Confirm each human handoff and review, preserve unrelated changes, and ask the item owner when conflict semantics are unclear. Subagents may run independent read-only checks, but they must not edit overlapping or shared paths. Validate interfaces, schemas, migrations, configuration, dependency assumptions, and user-visible flows; then run the full test, build, lint, and other release checks that apply. Update Team.md, Phases.md, and Memory.md according to their distinct purposes and report remaining risks.
```

## Handoff and status

```text
Prepare a concise handoff for {person, reviewer, or next session}. Inspect the current repository state and use subagents only for independent status checks when they materially help. Wait for them and synthesize one source of truth: completed outcomes and requirement IDs; changed paths; validation evidence; interface, migration, or dependency impact; decisions and assumptions; open risks or blockers; exact next actions; suggested human owner and reviewer; and commands needed to continue. Distinguish verified facts from recommendations and keep routine chatter out of Memory.md.
```
