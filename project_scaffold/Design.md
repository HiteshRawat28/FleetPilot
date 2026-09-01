# Design Context — FleetPilot

## Experience direction

- Public experience: bold editorial logistics brand using oversized Anton typography, cream/coal/orange colors, fleet photography, and restrained motion.
- Authenticated experience: dense but calm operations dashboard using Manrope headings/data, DM Sans body text, a coal sidebar, cream workspace, and orange primary actions.
- Product tone: concise, specific, operational, and honest about data freshness.

## Main screens

- Landing and slide-in sign-in panel.
- Overview dashboard.
- Vehicle registry.
- Driver profiles.
- Trip operations and assignment validation.
- Maintenance control.
- Fuel and expenses.
- Reports and analytics.
- Static settings/RBAC view.

## Current visual tokens

- App ink `#17212d`, muted `#6d7785`, border `#e5e8ec`.
- Primary orange is `#ef8f24` in the base app and `#ff6a22` in the newer landing/shell layer.
- Coal `#171918`, cream `#f1eade`, light cream `#fffaf2`.
- Success green `#24a266`, informational blue `#3c7bd6`.
- Existing breakpoints: 1250, 1000, 900, 700, and 620px; minimum body width is 320px.

## Interaction rules

- Every request surface should distinguish loading, empty, error, conflict, disabled/submitting, and success states.
- Server assignment failures should remain structured and field-specific; the UI may pre-check but must display server reasons.
- Show all assignment conflicts in one panel with concise operational language; never reveal them one submission at a time when the server knows multiple reasons.
- Highlight each implicated vehicle, driver, cargo, or trip field and keep user-entered values intact after a failed request.
- Disable draft creation while local capacity or license-category checks fail, but always repeat validation on the server.
- Dispatch-time failures belong in an in-app modal with a clear review action, not `alert()`.
- Destructive actions need clear confirmation and recovery.
- Static or decorative controls must not look functional.
- “Live” or synchronized claims require measured data and a timestamp.

## Accessibility baseline

- Target WCAG 2.2 AA for primary flows.
- Dialogs need `role="dialog"`, accessible title, focus trap, Escape handling, and focus restoration.
- Icon-only controls and search inputs need accessible names.
- Navigation should expose `aria-current`; status/error/loading updates need appropriate live semantics.
- Tables need accessible names/header scopes; charts need a text or table alternative.
- All controls need visible `:focus-visible` styling and usable touch targets.
- GSAP and CSS motion must respect `prefers-reduced-motion`.

## Current UX debt

- Many request failures are unhandled or use blocking browser alerts.
- Some screens can show empty content before loading or spin indefinitely on failure.
- Dashboard shortcuts, notification, password recovery, remember-me, workspace switching, and settings save are currently nonfunctional.
- The global search only affects vehicles/drivers; the displayed keyboard shortcut is decorative.
- Modal focus/semantics and several icon labels are incomplete.
- `App.tsx` and `styles.css` are monolithic and contain legacy/dead styles.
