# FleetPilot Mobile Integration Contract

This document is the audited integration boundary between the existing FleetPilot web/backend platform and a future mobile client. The repository remains web + backend only; no mobile source code is included.

## Audited platform state

- Frontend: React 19 + Vite + TypeScript.
- Backend: Express 5 + TypeScript + Prisma 6 + PostgreSQL.
- Authentication: bearer JWT, valid for 8 hours.
- Private documents: Cloudflare R2 with short-lived signed read URLs.
- OCR: Tesseract for licences, odometers, fuel receipts, and expense receipts.
- Synchronization: canonical server records plus client refetch/polling. There is currently no WebSocket, push-notification, or live-GPS endpoint.
- Development API base URL: `http://localhost:4000/api`.

All authenticated requests use `Authorization: Bearer <JWT>`. Do not send JSON `Content-Type` for `FormData`; the native networking layer must add the multipart boundary.

## Roles and authentication

Supported roles are `OWNER`, `ADMIN`, `FLEET_MANAGER`, `DISPATCHER`, `SAFETY_OFFICER`, `FINANCIAL_ANALYST`, and `DRIVER`. `OWNER` and `ADMIN` are elevated roles. Employee permissions are enforced by the backend.

The login UI may present Company, Employee, and Driver choices, but the client must never send a selected role as authority. It authenticates through the same endpoint and validates the returned server role.

### Login

`POST /auth/login`

```json
{
  "email": "driver@company.com",
  "password": "CompanyIssued1"
}
```

The response contains a `token` and `user` with `role`, `organizationId`, `organizationName`, `mustChangePassword`, and, for a linked Driver, `driverId` and `onboardingStatus`.

Use `GET /auth/me` to restore and revalidate a session. There is no refresh-token endpoint. A `401` requires clearing SecureStore and returning to login.

### Company-issued driver access

Drivers cannot self-register. `POST /driver/auth/register` intentionally returns `410`.

An Owner, Administrator, or Fleet Manager creates the account from web User Access through protected `POST /users`:

```json
{
  "name": "Ravi Kumar",
  "contact": "+91 98765 43210",
  "email": "driver@company.com",
  "password": "CompanyIssued1",
  "role": "DRIVER"
}
```

The backend atomically creates the User and linked Driver with `mustChangePassword = true`, `onboardingStatus = PENDING`, and `driver.status = OFF_DUTY`.

### Change temporary password

`POST /auth/change-password`

```json
{
  "currentPassword": "CompanyIssued1",
  "newPassword": "DriverPrivate2"
}
```

The new password must contain at least 10 characters, one uppercase letter, and one number. The backend reports `mustChangePassword` but does not block every other endpoint, so the mobile client must gate operational navigation until the change succeeds.

## Driver onboarding and approval

### Driver profile

`GET /driver/me` returns the authenticated driver's canonical profile, onboarding status, review note, and uploaded document metadata. Never accept a driver ID from the UI.

### Upload evidence

`POST /driver/me/onboarding` as `multipart/form-data`:

- `profilePhoto`: required image.
- `licenseFront`: required image.
- `licenseBack`: optional image.

Accepted MIME types are JPEG, PNG, WebP, HEIC, and HEIF. Maximum upload size is 8 MB per file, with at most three files.

The response contains OCR candidates for name, licence number, category, expiry, and confidence. Review them before confirmation.

### Confirm reviewed OCR values

`POST /driver/me/onboarding/confirm`

```json
{
  "name": "Ravi Kumar",
  "licenseNo": "GJ0120241234567",
  "licenseCategory": "HMV",
  "licenseExpiry": "2029-09-30",
  "contact": "+91 98765 43210"
}
```

Confirmation keeps the driver `OFF_DUTY` and `NEEDS_REVIEW`. The driver cannot self-approve. Web reviewers use `POST /drivers/:driverId/approve` or `POST /drivers/:driverId/reject`; mobile must never call these endpoints.

Onboarding states:

```text
PENDING -> NEEDS_REVIEW -> VERIFIED
                       -> REJECTED -> resubmit -> NEEDS_REVIEW
```

Only a linked, `VERIFIED`, available driver with an unexpired licence is eligible for dispatch.

## Route and dispatch records

The web dispatcher searches Indian places through `GET /routing/places?q=<text>` and sends full `sourceLocation` and `destinationLocation` objects to `POST /routing/estimate`. The backend recalculates and saves the selected route when creating a trip.

The mobile client does not plan or overwrite routes. It displays the stored trip fields: `source`, `destination`, `sourceCityId`, `destinationCityId`, `plannedDistanceKm`, `estimatedDurationMinutes`, `estimatedToll`, `routeStrategy`, `routeLabel`, `routeVia`, and `routeProvider`.

Route strategies are `SHORTEST`, `FASTEST`, and `TOLL_SAVER`. Providers are `GOOGLE`, `VALHALLA`, and `ESTIMATED`. Always label toll as **Estimated toll**.

## Driver trip reads

### My Trips

`GET /driver/me/trips` returns only trips belonging to the authenticated driver and only with status `DISPATCHED`, `IN_PROGRESS`, or `COMPLETED`. Each item includes the assigned vehicle.

### Trip Details

`GET /driver/me/trips/:tripId` returns:

- route, cargo, status, and dispatch/start/completion timestamps;
- assigned vehicle and its open `REPORTED`/`ACTIVE` maintenance;
- `evidence` with temporary signed `url` values;
- `fuelLogs` with temporary signed `receiptUrl` values;
- `expenses` with temporary signed `receiptUrl` values;
- trip-linked `maintenance` with temporary signed `photoUrl` values;
- `costSummary.fuel`, `costSummary.expenses`, and `costSummary.maintenance`.

Signed URLs expire. Refetch details before opening an old proof URL.

## Driver trip mutations

### Start Trip

`POST /driver/me/trips/:tripId/start` as `multipart/form-data`:

- `vehicleRegistrationNo`: required.
- `odometerPhoto`: required.
- `confirmedOdometerKm`: optional; use only after OCR cannot produce a reading.

The server checks assignment, `DISPATCHED` status, verified onboarding, normalized vehicle registration, and a non-decreasing odometer. On success it stores private evidence, sets `status = IN_PROGRESS`, `startedAt`, and `startOdometerKm`.

If OCR cannot read the meter, the API returns `422`. Keep the same local capture temporarily, ask the driver to confirm the reading, and retry with `confirmedOdometerKm`.

### On-site Update

`POST /driver/me/trips/:tripId/updates` as `multipart/form-data`:

- `note`: required, 2-500 characters.
- `clientRequestId`: required stable 8-100 character UUID/idempotency key.
- `photo`: optional image.
- `latitude`, `longitude`: optional and only with foreground location consent.

Allowed only while `IN_PROGRESS`.

### Add Fuel

`POST /driver/me/trips/:tripId/fuel` as `multipart/form-data`:

- `fuelPhoto`: required.
- `odometerKm`: required and non-negative.
- `clientRequestId`: required stable idempotency key.
- `fuelStation`: optional.
- `liters` and `amount`: optional initial values.
- `confirmedLiters` and `confirmedAmount`: reviewed values for an OCR-confirmation retry.

Allowed only while `IN_PROGRESS`. The server creates one canonical FuelLog and one `FUEL_RECEIPT` evidence item linked to organization, driver, trip, and vehicle. If OCR cannot determine liters or total, it returns `422`; retry the same photo and key with both confirmed values.

### Add Expense

`POST /driver/me/trips/:tripId/expenses` as `multipart/form-data`:

- `receiptPhoto`: required.
- `type`: `FOOD`, `LODGING`, `PARKING`, `TOLL`, `REPAIR`, `INSURANCE`, or `OTHER`.
- `clientRequestId`: required stable idempotency key.
- `vendor`, `description`: optional.
- `amount`: optional initial value.
- `confirmedAmount`: reviewed value for an OCR-confirmation retry.

Allowed only while `IN_PROGRESS`. The server creates one canonical Expense and one `EXPENSE_RECEIPT` evidence item linked to organization, driver, trip, and vehicle. If OCR cannot determine the total, it returns `422`; retry the same photo and key with `confirmedAmount`.

### Report Vehicle Issue

`POST /driver/me/trips/:tripId/maintenance` as `multipart/form-data`:

- `serviceType`: required, 2-100 characters.
- `description`: required, 5-500 characters.
- `severity`: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`.
- `clientRequestId`: required stable idempotency key.
- `odometerKm`: optional.
- `photo`: optional.

Allowed while `DISPATCHED` or `IN_PROGRESS`. The server creates a `REPORTED` maintenance item linked to the driver, trip, and vehicle without changing an on-road vehicle to `IN_SHOP`.

When web operations complete the trip, any open `REPORTED` issue for that vehicle becomes `ACTIVE` and the vehicle becomes `IN_SHOP`. Without an open report, the vehicle becomes `AVAILABLE`.

## Known contract gaps

Do not invent client-only success states or undocumented endpoints for:

- Driver-side trip completion. Web operations currently complete trips through privileged `POST /trips/:tripId/complete`.
- Refresh tokens or forgot/reset password.
- Push-notification device registration.
- Background/live GPS tracking.
- WebSockets or server-sent events.
- Mobile-specific company/employee dashboards beyond existing role-protected APIs.

The mobile app must hide/disable these actions and record the precise backend dependency.

## Synchronization rules

- PostgreSQL records returned by the backend are the only source of truth.
- Never send `organizationId`, `driverId`, or `vehicleId` in driver mutation bodies. The backend derives them from the JWT and trip assignment.
- Never calculate route, toll, eligibility, approval, accounting totals, or maintenance transitions locally.
- Generate one UUID `clientRequestId` per capture/action and reuse it for every retry of that same action.
- After each mutation invalidate/refetch `driver-profile`, `driver-trips`, and `driver-trip-detail:<tripId>`.
- Refetch on foreground/focus. Poll My Trips and active Trip Details every 10 seconds while visible.
- On `401`, clear session. On `403`, show permission denial. On `409`, show conflict and refetch. On `422`, preserve capture temporarily for confirmation and retry. On `503`, show infrastructure unavailable.
- Remove temporary local photos after confirmed success or explicit cancellation.

## Web synchronization surfaces

| Mobile action | Canonical backend data | Web surface |
| --- | --- | --- |
| Onboarding upload/confirm | Driver + DriverDocument | Drivers detail and approval queue |
| Trip start | Trip + ODOMETER_START evidence | Trip Details timeline/evidence |
| On-site update | SITE_UPDATE evidence | Trip Details evidence |
| Fuel receipt | FuelLog + FUEL_RECEIPT evidence | Trip Details and Fuel & Expenses |
| Expense receipt | Expense + EXPENSE_RECEIPT evidence | Trip Details and Fuel & Expenses |
| Vehicle issue | Maintenance(REPORTED) | Trip Details and Maintenance |

Web Trip Details polls every 4 seconds. Web Maintenance and Fuel & Expenses poll every 5 seconds.

## Environment prerequisites

Private upload/OCR flows require `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`, and optional `R2_ENDPOINT`. Keep R2 private. Mobile must never receive storage credentials or construct direct object URLs.
