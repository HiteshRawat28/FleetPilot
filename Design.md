# Product Design - TransitOps

## Experience principles

- **Exception first:** show conflicts, expired licences, maintenance, and blocked dispatches before routine metrics.
- **Status is unmistakable:** pair every state color with a text label and icon.
- **Prevent and explain:** remove ineligible choices where useful, revalidate on submit, and state the exact blocker and recovery.
- **Confirm critical transitions:** Dispatch, Complete, Cancel, Open Maintenance, and Close Maintenance show affected records and resulting statuses.
- **Preserve operational continuity:** retain entered values after validation or network failure and provide a clear retry.
- **Data over decoration:** prioritize readable tables, KPI context, and trustworthy calculations before charts or visual effects.

## Information architecture

- **Login:** email/password access and generic recovery-safe errors.
- **Dashboard:** KPI cards, exception panel, active/pending trips, fleet filters, and optional compact chart after mandatory completion.
- **Vehicles:** searchable/filterable registry, status, capacity, odometer, cost, region, and lifecycle actions.
- **Drivers:** searchable/filterable registry, licence/compliance details, safety score, and availability.
- **Trips:** draft creation, eligibility/blocker summary, lifecycle stepper, and allowed transition actions.
- **Maintenance:** active work first, history second, and open/close actions.
- **Fuel & Expenses:** entry form plus vehicle/date/category-filtered ledger.
- **Reports:** per-vehicle efficiency/cost/ROI table and CSV export.
- **Account menu:** current role and sign out.

Role permissions control both navigation visibility and actions. Direct access to a forbidden screen shows an explicit 403 state.

## Core interaction flows

1. Login -> session verification -> role-aware dashboard -> permitted navigation.
2. Create trip -> select eligible resources -> enter cargo/distance/revenue -> review blockers -> save Draft or Dispatch -> confirmed status refresh.
3. Complete trip -> enter final odometer and optional fuel -> review effects -> confirm -> trip Completed and resources Available.
4. Open maintenance -> review vehicle state -> confirm -> vehicle In Shop and removed from dispatch -> Close -> Available unless Retired.
5. Add fuel/expense -> validate -> confirm ledger update -> dashboard/report refresh -> export current report.

## Visual direction

- Tone: calm, precise, modern operations control tower.
- Density: compact enough for fleet staff but scan-friendly under time pressure.
- Surfaces: light background, white cards, border-led grouping, restrained shadows, and no decorative gradients in v1.
- Reference: the attached mockup informs information grouping, but this document's accessibility and responsive rules are authoritative for implementation.

## Design tokens

### Color

| Role | Token | Value | Usage |
|---|---|---|---|
| Primary | `--color-primary` | `#166534` | Main actions and selected navigation |
| Primary hover | `--color-primary-hover` | `#14532D` | Hover and pressed state |
| Background | `--color-bg` | `#F8FAFC` | Application background |
| Surface | `--color-surface` | `#FFFFFF` | Cards, forms, and tables |
| Text | `--color-text` | `#0F172A` | Primary text |
| Muted text | `--color-text-muted` | `#475569` | Secondary text |
| Border | `--color-border` | `#CBD5E1` | Inputs and separators |
| Info | `--color-info` | `#1D4ED8` | Informational states |
| Warning | `--color-warning` | `#B45309` | Expiry and attention |
| Danger | `--color-danger` | `#B91C1C` | Suspended, invalid, destructive |
| Success | `--color-success` | `#15803D` | Available, completed, saved |

Use tinted status backgrounds only after verifying WCAG AA foreground contrast. Never use color as the only state cue.

### Typography

- Heading/body: Inter when bundled; otherwise the system sans-serif stack.
- Page title: 28-32 px, weight 700.
- Body: 16 px with 1.5 line height.
- Labels/helper text: 14 px with adequate contrast.
- Numeric data: tabular numerals for money, distance, capacity, odometer, fuel, and KPI values.

### Spacing and shape

- Spacing scale: 4, 8, 12, 16, 24, 32 px.
- Controls: 8 px radius; cards/dialogs: 12 px radius.
- Prefer 1 px borders and restrained shadows.
- Primary/mobile interactive targets are at least 44 x 44 px.

## Component guidance

- **StatusBadge:** icon plus fixed domain label; never accept arbitrary colors or status text.
- **KpiCard:** label, value, optional context, and visible/accessible definition help; skeleton while loading, never a fake zero.
- **DataTable/RecordCard:** semantic sortable table on wide screens and task-focused card alternative on narrow screens.
- **EligibilitySelect:** display eligible records; list excluded records and reasons in a nearby blocker panel when useful.
- **ValidationSummary:** list all blockers, link/focus affected fields, and preserve inputs.
- **LifecycleStepper:** show Draft, Dispatched, Completed/Cancelled in text with the current state announced.
- **ConfirmationDialog:** identify the trip/vehicle/driver, resulting states, and irreversible effect; trap and restore focus.
- **FilterBar:** applied-filter chips, active count on mobile, and Clear filters.
- **Toast:** short secondary confirmation only; important errors remain inline or in a page alert.

Example messages:

- "Cargo is 550 kg; Van-05 supports up to 500 kg."
- "Alex's licence expired on 12 Aug 2026. Choose another driver."
- "Van-05 is in maintenance and cannot be dispatched."
- "This driver is already assigned to Trip T-104."

## States and feedback

- **Loading:** retain navigation/page shell and use skeletons shaped like final cards/lists.
- **Initial empty:** explain that no records exist and offer the permitted first action.
- **Filtered empty:** say no results match and offer Clear filters without implying the dataset is empty.
- **Field error:** associate text with the input; on submit, focus a linked error summary.
- **Page/panel error:** explain what failed and provide Retry. Dashboard panels fail independently.
- **Disabled:** remain readable and explain the reason in adjacent text or an accessible tooltip.
- **Submitting:** block duplicate submission, show progress in the action, and await server confirmation.
- **Success:** refresh visible statuses/data and announce the change; use toast only as reinforcement.
- **Permission denied:** clear 403 content with a safe navigation action; do not show a generic crash.
- **Network interruption:** keep unsent form state and allow retry; never imply success.

## Responsive behavior

- At 1024 px and above: persistent sidebar, multi-column KPI grid, full tables, and two-column details/forms where helpful.
- From 640-1023 px: collapsible sidebar, two-column KPI grid, and reduced table columns.
- Below 640 px: drawer navigation, single-column forms/KPIs, record cards instead of wide tables, and an easy-to-reach primary action.
- Preserve identifier, status, assignment, and primary action on narrow views.
- Move filters into a drawer/sheet on mobile and show an active-filter count.
- Avoid page-level horizontal scrolling; a table may scroll only if a usable card alternative is impractical.

## Accessibility

- Target WCAG 2.2 AA with at least 4.5:1 normal-text contrast and 3:1 large-text/UI boundary contrast.
- Complete all workflows by keyboard with logical focus order and visible `:focus-visible`.
- Use landmarks, correct heading order, labels, fieldsets, native buttons, and semantic tables.
- Associate errors programmatically; move focus to the error summary after failed submit.
- Trap/title dialog focus and restore it to the trigger after close.
- Announce important status changes with appropriate live regions.
- Respect `prefers-reduced-motion`; no essential animation.
- Provide visible date-format hints and meaningful button/link names.
- Pair charts with a text summary and accessible table/CSV equivalent.
- Support 200% zoom without losing core task functionality.

## Content voice

- Use concise operational language and consistent domain terms from `PRD.md`.
- State what happened, why an action is blocked, and how to recover.
- Format weight, distance, fuel, money, dates, and percentages with visible units.
- Avoid blame, vague "Something went wrong" messages, internal error codes without explanation, or safety claims not supported by data.
