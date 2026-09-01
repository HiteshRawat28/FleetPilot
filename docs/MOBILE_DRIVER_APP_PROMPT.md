# FleetPilot Mobile App — Audited Implementation Prompt

Copy everything below into the mobile-development task.

---

You are the lead React Native architect building the production-quality FleetPilot mobile application. The existing FleetPilot backend and web admin are already implemented. Build the mobile client against the audited REST contract in `docs/MOBILE_DRIVER_HANDOFF.md`. Do not modify the web admin, duplicate accounting records, invent endpoints, or implement business rules that belong to the server.

## Product goal

Create a secure, professional fleet mobile application with three sign-in entry choices:

1. **Company Login** for `OWNER` and `ADMIN`.
2. **Employee Login** for `FLEET_MANAGER`, `DISPATCHER`, `SAFETY_OFFICER`, and `FINANCIAL_ANALYST`.
3. **Driver Login** for `DRIVER`.

All choices call `POST /api/auth/login`. The selected entry is UX routing only; never send it as a role claim. Compare the server-returned role with the selected entry and reject mismatches safely. The primary implementation scope is the complete Driver experience. For Company/Employee roles, create a clean authenticated role notice/navigation shell only for APIs explicitly supported by the backend; do not guess missing mobile admin features.

## Required stack

- React Native with Expo and TypeScript strict mode.
- Expo Router with protected route groups.
- TanStack Query for server state.
- React Hook Form + Zod.
- Axios.
- Expo SecureStore for JWT.
- Expo Camera for evidence.
- Expo ImageManipulator for readable compression/conversion.
- Expo Location for optional foreground coordinates.
- UUID generation for idempotency.
- Jest + React Native Testing Library.

Use a feature-first structure:

```text
app/
  (auth)/
  (company)/
  (employee)/
  (driver)/
src/
  api/
  components/
  features/auth/
  features/onboarding/
  features/trips/
  features/evidence/
  features/expenses/
  features/maintenance/
  hooks/
  lib/
  stores/
  types/
```

Keep server state out of global client stores. Store only the JWT and minimal session metadata in SecureStore. Never persist licence images, identity photographs, receipts, or odometer photographs in AsyncStorage.

## API foundation

Configure the base URL by environment. Development is `http://localhost:4000/api`; allow an Android-emulator override such as `http://10.0.2.2:4000/api`. Never hardcode a production URL.

The Axios client must:

- attach `Authorization: Bearer <JWT>`;
- avoid manually setting multipart boundaries;
- report upload progress and use a practical upload timeout;
- clear SecureStore/reset navigation on `401`;
- expose backend `{ message }` for `400`, `403`, `409`, `422`, and `503`;
- never retry non-idempotent mutations with a new key;
- cancel stale reads when screens unmount.

There is no refresh-token endpoint. Restore sessions with `GET /api/auth/me`.

## Authentication and first-login security

Build Welcome, Company Login, Employee Login, and Driver Login screens. Use email/password for Driver Login. Do not expose driver self-registration, company lookup, driver lookup, or client-authored role claims.

Drivers receive credentials from their company. `POST /api/driver/auth/register` is disabled.

After Driver Login:

1. Require `user.role === 'DRIVER'`.
2. Require `driverId`; otherwise show a linked-profile support error.
3. If `mustChangePassword === true`, route only to Change Temporary Password.
4. Call `POST /api/auth/change-password` with `currentPassword` and a new password of at least 10 characters containing an uppercase letter and number.
5. Do not allow operational tabs until change succeeds.

Never derive organization or driver identity from form input. JWT/server data is authoritative.

## Driver navigation and design

Build:

```text
Driver Home
My Trips
Trip Details
Onboarding / Approval Status
Start Trip
On-site Update
Add Fuel
Add Expense
Vehicle Health
Report Vehicle Issue
Profile / Sign Out
```

Match FleetPilot professionally: dark navy, warm white, orange action color, strong typography, clear cards/status chips, and large controls suitable for roadside use. Include loading, skeleton, empty, retry, offline, validation, upload-progress, success, and conflict states.

## Onboarding and controlled approval

Call `GET /api/driver/me` after login and on foreground. Render:

- `PENDING`: profile/licence evidence required.
- `NEEDS_REVIEW`: submitted, company review pending, operations locked.
- `VERIFIED`: approved, trip operations enabled.
- `REJECTED`: show `reviewNote`, allow replacement/resubmission.

Capture a camera profile photo, licence front, and optional licence back. Upload multipart to `POST /api/driver/me/onboarding` using `profilePhoto`, `licenseFront`, and optional `licenseBack`. Keep each image under 8 MB and text readable.

Show returned OCR candidates for name, licence number, category, expiry, and confidence. Require review, then send corrected/confirmed data to `POST /api/driver/me/onboarding/confirm`.

Use “Camera-captured profile photo,” not biometric liveness. Never show approval controls. After upload/confirmation, invalidate driver and trip queries.

## My Trips and trip details

Call `GET /api/driver/me/trips`. Each card shows trip number/status, source → destination, route label/via, distance, duration, **Estimated toll**, cargo, and assigned vehicle/registration.

Refetch on focus/foreground and poll every 10 seconds while visible. Never calculate route/toll or display another driver's trips.

Call `GET /api/driver/me/trips/:tripId` for detail. Show route/timeline, vehicle, evidence, fuel logs, expense receipts, trip maintenance, open vehicle maintenance, and server `costSummary`.

Treat `url`, `receiptUrl`, and `photoUrl` as expiring. Refetch before opening stale proof links.

## Start Trip

Enable only when `trip.status === 'DISPATCHED'`, onboarding is `VERIFIED`, and temporary password change is complete.

1. Display assigned registration.
2. Ask the driver to type/scan it.
3. Require fresh odometer photo.
4. Submit `vehicleRegistrationNo` + `odometerPhoto` to `POST /api/driver/me/trips/:tripId/start`.
5. Disable repeated taps.
6. On success refetch and display server `startOdometerKm`/`startedAt`.

On `422`, retain the photo only for confirmation, ask for actual reading, and retry the same image with `confirmedOdometerKm`. Never guess. On `409`, display the exact conflict and refetch.

## Active-trip command center

For `IN_PROGRESS`, show On-site Update, Add Fuel, Add Expense, and Report Vehicle Issue. Display spend from server data; never create company accounting totals locally.

### On-site Update

Collect note (2-500 chars), optional photo, and optional coordinates after foreground consent. Generate one UUID when the draft is created. Submit multipart to `POST /api/driver/me/trips/:tripId/updates` with `note`, `clientRequestId`, optional `photo`, `latitude`, and `longitude`.

Location denial must not block the update. Reuse the same key for retry.

### Fuel with OCR confirmation

Require `fuelPhoto`, `odometerKm`, and stable `clientRequestId`; allow optional `fuelStation`, `liters`, and `amount`. Submit to `POST /api/driver/me/trips/:tripId/fuel`.

On `422`, show the retained photo, confirm liters/total, and retry the same image/key with `confirmedLiters` and `confirmedAmount`. On success, remove the temporary image and refetch.

Never create a second local fuel expense. The server creates the canonical FuelLog and evidence visible in web Trip Details and Fuel & Expenses.

### Expense with OCR confirmation

Require a type: `FOOD`, `LODGING`, `PARKING`, `TOLL`, `REPAIR`, `INSURANCE`, or `OTHER`. Require `receiptPhoto` and stable `clientRequestId`; allow vendor, description, and amount.

Submit to `POST /api/driver/me/trips/:tripId/expenses`. On `422`, confirm total and retry the same image/key with `confirmedAmount`. Remove the temporary image after success and refetch.

Never send `driverId`, `vehicleId`, `tripId`, or `organizationId` in mutation bodies. The backend links every record so web accounting shows correct driver-wise and trip-wise totals.

If Trip Details reports an active vehicle FASTag connection, remove `TOLL` from
the driver expense choices and display that tolls synchronize automatically. A
`409` for a toll submission means FASTag protection prevented a duplicate; refetch
the trip instead of retrying or asking for a receipt photo.

### Vehicle Health and maintenance

Show assigned registration/status and open `REPORTED`/`ACTIVE` maintenance.

Submit vehicle issues to `POST /api/driver/me/trips/:tripId/maintenance` with `serviceType`, `description`, severity (`LOW`, `MEDIUM`, `HIGH`, `CRITICAL`), stable `clientRequestId`, optional `odometerKm`, and optional `photo`.

Allow for `DISPATCHED` or `IN_PROGRESS`. On success show `REPORTED` and refetch. Do not mark vehicle `IN_SHOP` locally. Web operations controls service start/close; trip completion promotes open reports server-side.

## Trip completion boundary

There is no driver-scoped completion endpoint. Do not call privileged `POST /api/trips/:tripId/complete` from Driver mobile and do not mark completion locally.

Render “Completion confirmation is handled by fleet operations.” Add a typed interface for a future `POST /api/driver/me/trips/:tripId/complete`, but do not invoke it until implemented.

Do not invent push, refresh-token, forgot-password, background/live-GPS, WebSocket, or SSE APIs.

## Query keys and invalidation

Use `['session']`, `['driver-profile']`, `['driver-trips']`, and `['driver-trip-detail', tripId]`.

After any driver mutation invalidate profile, list, and active detail. Refetch immediately. Poll active details every 10 seconds while focused; stop in background. Order events using server timestamps.

## Idempotency, offline, and errors

- One UUID per new update/fuel/expense/maintenance action.
- Preserve the same key and image until success/cancel.
- Never queue Start Trip or financial mutations as completed offline.
- Offline drafts require review before upload.
- Never retry ambiguous timeouts with a new key.
- `401`: clear session.
- `403`: show permission/suspension.
- `409`: show conflict and refetch.
- `422`: human confirmation with same photo/key.
- `503`: show secure backend infrastructure unavailable; never claim success.

## Privacy and security

- JWT only in SecureStore.
- No permanent sensitive-image cache.
- No R2 credentials/object keys/permanent public URLs.
- No document content in logs, analytics, crash breadcrumbs, or notifications.
- Redact auth headers and multipart bodies.
- Ask camera/location permission only at the relevant action.
- Clear query memory and local captures on sign out.

## Strict shared types

```ts
type Role = 'OWNER'|'ADMIN'|'FLEET_MANAGER'|'DISPATCHER'|'SAFETY_OFFICER'|'FINANCIAL_ANALYST'|'DRIVER';
type OnboardingStatus = 'PENDING'|'NEEDS_REVIEW'|'VERIFIED'|'REJECTED';
type TripStatus = 'DRAFT'|'DISPATCHED'|'IN_PROGRESS'|'COMPLETED'|'CANCELLED';
type MaintenanceStatus = 'REPORTED'|'ACTIVE'|'CLOSED';
type ExpenseType = 'FOOD'|'LODGING'|'PARKING'|'TOLL'|'REPAIR'|'INSURANCE'|'OTHER';
type EvidenceType = 'ODOMETER_START'|'ODOMETER_END'|'SITE_UPDATE'|'FUEL_RECEIPT'|'EXPENSE_RECEIPT'|'MAINTENANCE_REPORT';
```

Model nullable fields accurately; never fabricate values in API types.

## Required tests

Test role mismatch, temporary-password gate, all onboarding states, rejected resubmission, only assigned trips, registration conflict, odometer `422`, duplicate taps/same idempotency key, fuel and expense confirmation retries, absence of identity IDs in mutation bodies, location denial, maintenance remaining `REPORTED`, JWT cleanup, signed-URL refresh, sensitive-file deletion, and hidden driver completion.

## Definition of done

This exact scenario must pass:

1. Web creates Driver access and supplies temporary credentials.
2. Driver logs in and must change password.
3. Driver captures onboarding images, reviews OCR, and submits.
4. Web Drivers shows evidence and reviewer approves.
5. Mobile refetch shows `VERIFIED` without re-login.
6. Web dispatches a trip; mobile receives it through polling/focus refetch.
7. Driver confirms registration, uploads odometer, starts trip.
8. Web Trip Details shows `IN_PROGRESS`, start data, driver documents, and evidence.
9. Driver posts site update, fuel receipt, food receipt, and vehicle issue.
10. Web Trip Details shows all evidence/maintenance.
11. Web Fuel & Expenses shows canonical driver-wise/trip-wise totals and proofs.
12. Web Maintenance shows exact driver, trip, vehicle, severity, odometer, and photo.
13. Same-key retries never duplicate records.
14. Mobile never claims completion, push delivery, GPS tracking, or upload success without server confirmation.

Before delivery run type checks, unit tests, and Android/iOS device smoke tests. Produce an API-gap report instead of silently working around missing backend capability.

---
