# Implementation Plan — Manual Trip-Combination Suggestions

## Outcome

After a dispatcher successfully creates a trip draft or dispatches a trip, FleetPilot checks other draft trips in the same organization and surfaces likely follow-on candidates whose stored origin text resembles the current trip's stored destination text.

The result is advisory only. It does not merge trips, change assignments, calculate routes, call a map provider, or claim that two locations are geographically close.

## Product boundary

### In scope

- Run the suggestion check after a successful trip creation or dispatch.
- Compare the current trip's `destination` with other trips' `source` values.
- Limit candidates to other `DRAFT` trips in the authenticated organization.
- Rank a small result set using deterministic string normalization and token/region overlap.
- Explain why each candidate matched and let the dispatcher manually review it.
- State clearly that suggestions use stored address text, not live maps or route optimization.

### Explicitly out of scope

- Geocoding, coordinates, distance matrices, live maps, GPS, traffic, ETAs, or route optimization.
- Automatically merging trips, reordering stops, changing a trip, or assigning a vehicle/driver.
- Claiming a distance in kilometres or using words such as "nearest" or "optimal."
- Persisting, accepting, dismissing, or auditing suggestions in the first version.
- Changing trip lifecycle or assignment-eligibility rules.

## Current-model assumption

The current `Trip` schema requires both `vehicleId` and `driverId`, and it has no `UNASSIGNED` status. For this MVP, "draft/unassigned" means trips with `status = DRAFT`, because those are the only trips that have not entered the live dispatch lifecycle.

Making vehicle and driver assignments nullable would be a separate product and migration decision. It is not required for this feature and should not be bundled into the implementation.

## Requirements and acceptance criteria

| ID | Requirement | Acceptance criteria |
|---|---|---|
| COMB-1 | Check for candidates after creation | After `POST /api/trips` succeeds, the trip page requests suggestions for the created trip without delaying or rolling back creation. |
| COMB-2 | Check for candidates after dispatch | After `POST /api/trips/:id/dispatch` succeeds, the trip page requests suggestions for the dispatched trip without changing dispatch semantics. |
| COMB-3 | Keep candidates safe and relevant | Results include only other trips in the same organization whose status is currently `DRAFT`; the current trip, cancelled/completed/dispatched trips, and cross-organization trips never appear. |
| COMB-4 | Use stored-text matching only | Matching is deterministic over persisted `destination` and `source` strings and makes no external network or map request. |
| COMB-5 | Frame the result as manual advice | The UI headline says "Consider combining" and includes: "Based on stored origin and destination text—not a live map or route optimization." |
| COMB-6 | Preserve manual control | A suggestion can only be reviewed or dismissed. It cannot mutate either trip, assignments, or routing. |
| COMB-7 | Explain matches | Every result shows trip number, source, destination, status, and a short basis such as "Same stored address" or `Shared region term: Surat`. |
| COMB-8 | Degrade independently | Suggestion loading or failure never changes the successful create/dispatch outcome. A failed check offers retry and does not show stale results as current. |
| COMB-9 | Remain accessible and responsive | The callout is keyboard reachable, announced appropriately, does not steal focus, and remains usable at 320 px width. |

## Proposed matching rule

Implement the matcher as a pure backend service so its behavior is testable and is not duplicated in React.

1. Normalize both strings with Unicode normalization, lowercase conversion, punctuation removal, and collapsed whitespace.
2. Build significant tokens by removing common address/facility words such as `depot`, `warehouse`, `hub`, `yard`, `terminal`, `road`, and `street`, plus tokens shorter than four characters.
3. Assign one of two match levels:
   - `EXACT_STORED_ADDRESS`: normalized strings are identical.
   - `SHARED_REGION_TERM`: at least one remaining token is identical; return the longest shared token as the reason.
4. Reject a candidate when no rule matches. Do not use fuzzy edit distance in v1; it creates hard-to-explain false positives.
5. Sort exact matches first, then region-term matches, then newest `createdAt`; cap the response at five suggestions.

The generic-word list should be short, code-owned, and covered by tests. It must not be presented as a geographic database. If free-text quality proves too inconsistent, the next step is a structured locality/region field—not hidden geocoding.

## Backend design

### Service

Add `backend/src/services/tripCombinationSuggestions.ts` with:

- `normalizeStoredAddress(value)`;
- `matchStoredLocations(destination, candidateOrigin)`;
- a typed match result containing `matchType`, `matchedTerm`, and display-safe `reason`;
- no Prisma or network dependency in the pure matcher.

Add unit tests beside the service for casing, punctuation, whitespace, facility-word removal, exact matches, shared region terms, generic-only overlap, unrelated locations, deterministic ordering, and result limits.

### Endpoint

Add an authenticated, role-protected endpoint:

`GET /api/trips/:id/combination-suggestions`

Behavior:

1. Resolve the current trip by both `id` and `organizationId`; return `404` if it is outside the tenant or absent.
2. Query only `DRAFT` candidates with the same `organizationId` and `id != currentTrip.id`.
3. Select only fields needed by the UI; run the pure matcher and ranking in memory.
4. Return a stable envelope:

```json
{
  "basis": "STORED_ADDRESS_TEXT",
  "disclaimer": "Based on stored origin and destination text—not a live map or route optimization.",
  "suggestions": [
    {
      "tripId": "candidate-id",
      "tripNo": "TRP0042",
      "source": "Surat Depot",
      "destination": "Vadodara Hub",
      "status": "DRAFT",
      "matchType": "SHARED_REGION_TERM",
      "matchedTerm": "surat",
      "reason": "Shared region term: Surat"
    }
  ]
}
```

Keep the endpoint separate from create/dispatch responses. This preserves the existing mutation contract and ensures a suggestion failure cannot fail or roll back the primary action.

### Authorization and data safety

- Use the same dispatcher/fleet-manager role guard as the trip list and lifecycle endpoints.
- Scope both the current-trip lookup and candidate query by `organizationId`.
- Return no vehicle, driver, revenue, or cargo data because the callout does not need it.
- Never send destination/source text to an external provider.

## Frontend interaction

### Trigger and state

In `Trips`:

- capture the created or dispatched trip returned by the existing mutation;
- refresh the trip table as today;
- request `/trips/:id/combination-suggestions`;
- keep suggestion state separate from create/dispatch success state: `idle | loading | ready | empty | error`;
- replace results when a newer action starts, preventing a slow earlier response from overwriting the latest check.

Change `TripForm.onSaved` to pass the created `Trip` back to `Trips`. Dispatch already has the trip ID and should use the updated trip returned by the mutation.

### Presentation

Render a dismissible inline callout below the trip page title rather than a blocking modal:

- Headline: `Consider combining`
- Disclaimer: `Based on stored origin and destination text—not a live map or route optimization.`
- Context: `After TRP0041 ends at Surat Warehouse, these draft trips start from stored locations with matching address text.`
- Up to five candidate rows showing trip number, route, `DRAFT` status, and match reason.
- Actions: `Review draft trips` and `Dismiss` only. `Review draft trips` scrolls/focuses the existing table and visually identifies candidate rows; it performs no mutation.

State behavior:

- Loading: a compact `Checking stored draft-trip addresses…` status that does not block the table.
- Empty: no promotional callout; optionally announce `No matching draft origins found` in a polite live region.
- Error: `Trip saved, but combination suggestions could not be checked.` with `Retry`; do not imply the trip action failed.
- Dismissed: hide the current result for the rest of the page session.
- A subsequent create/dispatch starts a fresh check and may show a new callout.

Add typed response definitions in `frontend/src/types.ts` and use the existing `api` helper. Add focused styles in `frontend/src/styles.css`, preserving visible focus, non-colour status cues, and single-column mobile layout.

## Delivery plan

### Phase 1 — Lock the contract and matcher

- [ ] Add COMB-1 through COMB-9 to `project_scaffold/PRD.md`; retain the live-map/route-optimization exclusion.
- [ ] Document the endpoint and stored-text-only tradeoff in `project_scaffold/Architecture.md`.
- [ ] Document callout copy and states in `project_scaffold/Design.md`.
- [ ] Implement the pure normalizer/matcher and unit tests.

Done when the matcher produces explainable results for representative address strings and makes no I/O calls.

### Phase 2 — Tenant-safe suggestion API

- [ ] Add the endpoint and response types.
- [ ] Add endpoint tests for current-trip lookup, status filtering, self-exclusion, tenant isolation, ordering, cap, empty results, and role authorization.
- [ ] Confirm no create/dispatch transaction or response contract changed.

Done when API tests prove that only eligible same-organization drafts can be returned.

### Phase 3 — Post-action UI

- [ ] Wire create and dispatch success paths to request suggestions.
- [ ] Add the inline callout, disclaimer, candidate review affordance, dismissal, retry, and race protection.
- [ ] Add component or browser tests for create, dispatch, empty, error, dismissal, and consecutive-action behavior.
- [ ] Check keyboard behavior, live-region announcements, focus visibility, and 320 px layout.

Done when both successful actions surface the same non-blocking advisory experience and neither path gains an automatic mutation.

### Phase 4 — Integrated verification and documentation

- [ ] Run `npm test` and `npm run build` in `backend`.
- [ ] Run `npm run build` in `frontend`; run `npm run lint` only after the existing ESLint configuration blocker is resolved or record that blocker explicitly.
- [ ] Manually verify exact match, shared-region match, no match, suggestion-service failure, and tenant isolation.
- [ ] Search the implementation and UI for prohibited map/optimization claims and external calls.
- [ ] Update `project_scaffold/Memory.md` with the delivered behavior, validation evidence, limitations, and any change to the matching rules.

Done when COMB-1 through COMB-9 have automated or recorded manual evidence.

## Test matrix

| Scenario | Expected result |
|---|---|
| Current destination `Surat Warehouse`; draft origin `surat warehouse` | Exact stored-address suggestion. |
| Current destination `Surat Warehouse`; draft origin `Surat Depot` | Shared-region-term suggestion with `Surat` as the basis. |
| Current destination `Surat Warehouse`; draft origin `Pune Warehouse` | No suggestion; `warehouse` alone is generic. |
| Matching candidate is dispatched, completed, or cancelled | Excluded. |
| Matching candidate belongs to another organization | Excluded, including under a guessed trip ID. |
| Current trip is itself a draft and matches its own destination/source | Current trip excluded. |
| Create/dispatch succeeds and suggestion request fails | Primary success remains; non-blocking retry state appears. |
| Two post-action checks overlap | Only the newest action's results render. |
| More than five candidates match | Five deterministic top-ranked results return. |
| Keyboard/screen-reader/mobile review | Callout is understandable, dismissible, and usable without relying on colour or pointer input. |

## Risks and mitigations

- **False positives from free text:** keep the rule conservative, show the match basis, and frame every result as something to consider manually.
- **False negatives from spelling/address variation:** accept this MVP limitation; do not quietly introduce fuzzy matching or geocoding.
- **Stale candidates:** query after each action and display the candidate's current `DRAFT` status; any future manual operation must still revalidate server state.
- **User interprets “near” literally:** avoid distance language and repeat the stored-text disclaimer in the callout, not only in documentation.
- **Feature becomes an implicit merge workflow:** offer review/dismiss only and add no combined-trip state or mutation endpoint.
- **Large draft pool:** start with the simple organization-scoped query. If measurement shows a problem, add a normalized locality field and index through a reviewed migration rather than adding a map dependency.

## Open decisions before implementation

1. Confirm that `DRAFT` is the intended operational meaning of “unassigned” for this release. If not, nullable trip assignments require a separate PRD/schema plan.
2. Approve the initial generic-word list using representative stored addresses from non-sensitive demo/test data.
3. Decide whether `Review draft trips` should filter the table to candidates or only scroll/highlight them. Filtering is clearer with many rows; highlighting is less disruptive.
