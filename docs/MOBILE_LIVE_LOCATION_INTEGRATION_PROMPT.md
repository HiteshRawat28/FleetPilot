# FleetPilot Driver Mobile — Live Location Integration Prompt

Copy the implementation brief below into the Flutter mobile-development task. The FleetPilot backend and web Trip Dispatch integration already implement the server contract described here. Do not invent alternate endpoints or duplicate server-owned state.

---

You are the lead Flutter engineer integrating production-grade trip synchronization and live driver location into the FleetPilot Driver mobile application. Implement the feature against the existing REST API exactly as specified. Treat PostgreSQL/backend responses as the source of truth. The phone supplies GPS observations; it never decides organization identity, driver identity, assignment, trip eligibility, or final trip status.

## Product outcome

The complete workflow must be:

1. Company operations creates a linked Driver account in the web application's User Access module.
2. The driver signs in using the issued email and temporary password.
3. The driver completes password change and onboarding; company operations verifies the profile.
4. Web operations assigns and dispatches a trip. The backend changes the vehicle and driver to `ON_TRIP` and the trip to `DISPATCHED`.
5. The Driver app discovers the assignment through foreground refetch/polling and presents a clear consent-based “Start live trip tracking” action.
6. After OS permission and service startup, the app captures GPS points and uploads them in idempotent batches.
7. The first accepted location changes the canonical trip status from `DISPATCHED` to `IN_PROGRESS` and sets `startedAt` server-side.
8. The web Trip Dispatch row changes to `IN_PROGRESS`; authorized operations users can open **Track live** and see the latest map position, speed, accuracy, battery, recent movement trail, freshness, and connectivity state.
9. When the trip becomes `COMPLETED` or `CANCELLED`, the mobile app stops location collection immediately, clears queued points for that trip after server reconciliation, and the backend rejects further points.

Dispatch makes a trip eligible for tracking; it cannot bypass Android/iOS permission and background-execution rules. Before the first GPS point, web must correctly show `WAITING_FOR_GPS`, never a fabricated position.

## Required Flutter stack

Use the repository's existing Flutter/Dart architecture and add:

- `geolocator` for permission state and GPS streams;
- `flutter_secure_storage` for the Bearer token;
- `sqflite_sqlcipher` (or an equivalently encrypted SQLite implementation) for the short-lived offline location queue;
- `uuid` for stable `clientRequestId` values;
- `connectivity_plus` only as a hint—actual upload success determines network availability;
- Provider/ChangeNotifier if retaining the current app architecture, with a dedicated `TripTrackingController` and repository boundary.

Do not store JWTs in SharedPreferences. Do not store continuous location history in plain-text preferences. Do not add a second mobile-authored trip status store.

Recommended structure:

```text
lib/
  core/auth/driver_session_store.dart
  core/network/api_client.dart
  features/driver_trips/data/driver_trip_repository.dart
  features/driver_trips/models/driver_trip.dart
  features/live_tracking/data/location_queue.dart
  features/live_tracking/data/location_repository.dart
  features/live_tracking/domain/location_sample.dart
  features/live_tracking/services/trip_location_service.dart
  features/live_tracking/controllers/trip_tracking_controller.dart
  features/live_tracking/presentation/live_trip_screen.dart
```

## Environment and API base URL

All paths below are relative to `/api`.

- Android emulator development: `http://10.0.2.2:4000/api`
- iOS simulator development: `http://localhost:4000/api`
- Physical device: use the development machine's LAN address over an approved development transport configuration.
- Production: HTTPS only, configured at build time. Never hardcode localhost or a production hostname in source.

## Driver authentication contract

Call:

```http
POST /driver/auth/login
Content-Type: application/json

{"email":"driver@example.com","password":"..."}
```

Success:

```json
{
  "token": "signed-jwt",
  "user": {
    "id": "...",
    "role": "DRIVER",
    "driverId": "...",
    "organizationId": "...",
    "mustChangePassword": false
  }
}
```

Requirements:

- Store `token` only in `flutter_secure_storage` and attach `Authorization: Bearer <token>` to all subsequent calls.
- Require `role === DRIVER` and a non-null `driverId` from the server response.
- Never send a role, `organizationId`, `driverId`, or `vehicleId` as an authority claim.
- Restore with `GET /auth/me`.
- The current access token expires after 24 hours and there is no refresh-token contract. Before a long trip, warn if reauthentication will be required; on `401`, stop uploading, retain the encrypted queue, clear the invalid token, and route to Driver Login. Resume only after successful reauthentication and server assignment reconciliation.
- Use `POST /auth/change-password` when `mustChangePassword` is true. Block assignment/tracking screens until it succeeds. The Driver response includes a replacement `{ token, user }`; atomically replace the old SecureStore token because its signed `mustChangePassword` claim is intentionally stale.

## Assignment synchronization

Fetch `GET /driver/me/trips`:

- immediately after verified login;
- whenever the app returns to foreground;
- every 10 seconds while the My Trips screen is visible;
- every 30 seconds while a tracking service is active, so terminal server status stops GPS promptly.

The endpoint returns only trips assigned to the authenticated driver with `DISPATCHED`, `IN_PROGRESS`, or `COMPLETED` status. Never use privileged `/trips` endpoints from the Driver app.

Fetch `GET /driver/me/trips/:tripId` before starting or resuming tracking. It returns the assigned trip plus:

```json
{
  "tracking": {
    "status": "WAITING_FOR_GPS | LIVE | DELAYED | OFFLINE | ENDED",
    "latestLocation": {
      "latitude": 23.2599,
      "longitude": 77.4126,
      "accuracyM": 12,
      "capturedAt": "2026-09-01T12:00:00.000Z"
    }
  }
}
```

Only enable tracking for `DISPATCHED` or `IN_PROGRESS`. If another status is returned, stop and reconcile local state.

## Permission and consent UX

Build a dedicated pre-tracking screen showing:

- trip number, origin/destination, assigned vehicle and registration;
- why location is used: live dispatch visibility, safety, ETA coordination, and trip audit;
- when tracking runs: only for this active assigned trip;
- a prominent **Start live trip tracking** button;
- permission state and a link to OS Settings when permanently denied;
- a statement that tracking stops when operations completes/cancels the trip.

Permission sequence:

1. Request foreground precise location when the driver taps Start.
2. Obtain one high-accuracy fix and show accuracy before activating background tracking.
3. Request background/Always access only after the foreground explanation and only if required for continuous tracking.
4. Never block login, onboarding, or viewing assignments because location was denied.
5. If precise location is unavailable, show a degraded-mode warning and do not label coarse data as precise/live.

Do not silently start GPS immediately after login. Android and iOS require explicit, contextual permission and may require visible foreground-service indicators.

## Platform configuration

### Android

- Declare `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, and `ACCESS_BACKGROUND_LOCATION` where supported.
- Run active-trip tracking as a foreground location service with a persistent notification such as “FleetPilot is sharing location for trip AT-2026-023.”
- Declare the location foreground-service type and the required modern Android foreground-service permission.
- Start the foreground service from a visible user action. Do not attempt prohibited background service starts.
- Provide notification tap navigation back to the active trip.
- Handle OEM battery optimization without claiming it can be bypassed; show actionable instructions only when tracking reliability is affected.

### iOS

- Add accurate `NSLocationWhenInUseUsageDescription` and `NSLocationAlwaysAndWhenInUseUsageDescription` copy.
- Enable the `location` background mode only for active-trip tracking.
- Show the system background-location indicator.
- Use significant-change recovery only as a fallback; do not claim 10-second delivery while iOS suspends the app.
- Explain the operational need during App Store review and avoid collecting location outside an active assigned trip.

## Capture policy

Use `LocationAccuracy.bestForNavigation` while moving. Start with these server-independent capture rules, exposed through configuration:

- emit when 10 seconds elapsed **or** the driver moved at least 25 metres;
- do not enqueue a point with invalid coordinates;
- keep points with poor accuracy but label them; skip accuracy worse than 1,000 m unless no better fix has been available for 2 minutes;
- include speed only when non-negative and convert m/s to km/h;
- normalize heading to `0...360`;
- include `batteryPct` when available;
- include platform mock-location detection as `isMocked` where supported, but never implement client-side punishment or assignment cancellation;
- use UTC ISO-8601 device capture time.

The backend validates ranges, assignment, organization, driver identity, status, and timestamp window. Client validation improves UX but never replaces server validation.

## Upload contract

Send one to 50 points per request:

```http
POST /driver/me/trips/:tripId/locations
Authorization: Bearer <token>
Content-Type: application/json

{
  "points": [
    {
      "clientRequestId": "uuid-created-once-for-this-sample",
      "latitude": 23.259933,
      "longitude": 77.412615,
      "accuracyM": 11.4,
      "speedKph": 42.7,
      "headingDeg": 118.0,
      "altitudeM": 523.2,
      "batteryPct": 71,
      "isMocked": false,
      "capturedAt": "2026-09-01T12:00:00.000Z"
    }
  ]
}
```

Success `201`:

```json
{
  "accepted": 1,
  "duplicates": 0,
  "tripStatus": "IN_PROGRESS",
  "latestLocation": {"id":"...","latitude":23.259933,"longitude":77.412615,"capturedAt":"...","receivedAt":"..."}
}
```

The first accepted point can transition `DISPATCHED` to `IN_PROGRESS`. Always replace local trip status with `tripStatus` from the response.

## Idempotency and offline queue

- Generate `clientRequestId` once when a GPS observation is created; persist it with the observation and reuse it forever for retries.
- The server uniqueness boundary is `(tripId, clientRequestId)` and returns duplicate counts instead of creating duplicate history.
- Queue points in encrypted SQLite before attempting upload.
- Flush oldest-first in batches of at most 50; only delete the exact acknowledged batch after a successful response.
- Serialize flush operations per trip. Do not have the UI and background service upload the same queue concurrently.
- Use exponential backoff with jitter: 2s, 5s, 15s, 30s, then maximum 60s while the trip remains eligible.
- Keep at most 1,000 queued points or 24 hours, whichever is smaller. Apply deterministic downsampling before deletion and surface a diagnostic counter; never silently claim all points synchronized.
- Connectivity callbacks trigger a flush but are not proof of connectivity.

Error handling:

- `400`: client/schema defect; stop the batch and log only non-sensitive metadata.
- `401`: stop uploads, preserve encrypted queue, clear token, require login.
- `403`: stop tracking; account, password, or onboarding is not eligible.
- `404`: stop tracking and refetch assignments; never retry against guessed IDs.
- `409`: stop GPS, refetch trip, and reconcile terminal/non-active status.
- `422`: quarantine the rejected timestamp batch, refetch server trip state/time, and show a device-clock diagnostic. Never rewrite capture times to fake acceptance.
- `5xx` or timeout: keep the same IDs and retry with backoff.

## Tracking service state machine

Implement explicit states:

```text
idle
  -> permissionRequired
  -> acquiringFix
  -> activeOnline | activeOffline
  -> stopping
  -> stopped

Any active state -> authRequired | assignmentEnded | permissionRevoked | fatalError
```

State transitions must be serialized. A second Start tap must not create a second position stream. Persist only the minimum resume marker (`activeTripId`, consent version, service state) and revalidate it with `GET /driver/me/trips/:tripId` after process restart.

Stop and dispose GPS subscriptions when:

- server status is `COMPLETED` or `CANCELLED`;
- location upload returns terminal `409`, assignment `404`, eligibility `403`, or the driver signs out;
- the driver explicitly stops sharing, after a warning that dispatch will see the device offline;
- location permission is revoked.

Never mark the trip completed locally. Fleet operations owns completion.

## Driver UI during an active trip

Show:

- `LIVE`, `SYNCING`, `OFFLINE—QUEUED`, `GPS PAUSED`, or `ACTION REQUIRED` state;
- last captured and last server-acknowledged times separately;
- GPS accuracy and current speed;
- queued point count;
- persistent notification/background status;
- destination and assigned vehicle;
- retry/re-auth/settings actions appropriate to the state.

Do not show a green “Live” state merely because GPS is running. `Live` requires a recent server acknowledgement. If capture continues offline, display `OFFLINE—QUEUED`.

## Privacy, security, and observability

- Collect only during an active assigned trip and document the retention policy.
- Never include coordinates, tokens, contact details, or full request bodies in logs/crash breadcrumbs/analytics.
- Log safe diagnostics: trip correlation hash, batch size, oldest point age, HTTP class, queue depth, permission state, and service transition.
- Clear in-memory route history and encrypted queued points after terminal reconciliation. Do not clear unsent points merely because the app UI closed.
- Pinning TLS certificates is optional only if the organization has an operational rotation plan; never ship brittle hardcoded development pins.
- The backend is tenant-scoped and derives organization/driver from JWT. Do not expose or accept cross-driver selection in mobile UI.
- Mock-location flags are operational evidence, not automatic proof of fraud.

## Performance and battery budget

- Use one location subscription and one serialized uploader.
- Batch uploads approximately every 15 seconds while online; flush immediately for the first point and important lifecycle transitions.
- Reduce accuracy/frequency when stationary for 5 minutes, but retain a heartbeat no slower than 2 minutes so web can distinguish stationary from offline.
- Return to navigation accuracy after meaningful movement.
- Do not wake the radio for every individual point when batching is possible.

## Web synchronization contract

No mobile WebSocket/SSE client is required. Mobile uploads REST batches. The backend publishes accepted latest points to authorized web users at:

- `GET /trips/:tripId/location` for initial state and up to 100 recent points;
- `GET /trips/:tripId/location/stream` for Server-Sent Events;
- web polling every 10 seconds as a fallback.

Web status freshness rules are server-owned:

- no point: `WAITING_FOR_GPS`;
- age ≤ 30 seconds: `LIVE`;
- age ≤ 120 seconds: `DELAYED`;
- older: `OFFLINE`;
- terminal trip: `ENDED`.

Do not reproduce these labels with different thresholds in mobile. Mobile should communicate capture/upload state, not impersonate web's server freshness calculation.

For horizontally scaled backend deployment, document that SSE fan-out must move from the current process-local subscriber registry to Redis Pub/Sub, NATS, or another shared event bus. REST/database correctness must not depend on SSE delivery.

## Required tests

Unit tests:

- location range/normalization and m/s → km/h;
- one stable UUID per captured point across retries;
- queue ordering, batch limit, acknowledgement deletion, deduplication, cap/downsampling;
- state-machine double-start protection and complete disposal;
- status-specific error handling;
- token storage never touches SharedPreferences;
- log redaction.

Integration tests with a fake API and fake location stream:

- assignment appears after polling/foreground;
- permission denial leaves assignment view usable;
- first accepted point changes local trip to server-returned `IN_PROGRESS`;
- network loss queues points and recovery uploads the same IDs oldest-first;
- app restart resumes only after server revalidation;
- `401` retains queue and requires login;
- `403`, `404`, terminal `409`, completion, and cancellation stop the stream;
- simultaneous UI/background flush cannot duplicate or delete unacknowledged points;
- terminal reconciliation clears trip-scoped sensitive location data.

Device smoke tests:

- Android 13/14/15 foreground service, notification, background permission, process recreation, Doze, and network switching;
- iOS current and previous major version with When In Use → Always flow, background indicator, app termination limitations, network switching, and permission revocation;
- physical-device trip of at least 30 minutes with screen locked;
- battery/thermal review and web freshness verification.

## Definition of done

The feature is complete only when:

1. A web-dispatched assignment appears only for its linked Driver account.
2. Tracking never starts before contextual consent and OS permission.
3. First upload produces `accepted: 1`, returns `IN_PROGRESS`, and appears on web without manual refresh.
4. Repeated upload with the same ID produces no duplicate point.
5. Screen lock/background operation remains visible and policy-compliant.
6. Offline points recover oldest-first without false Live state.
7. Web correctly distinguishes waiting, live, delayed, and offline.
8. Complete/cancel stops capture and future uploads are rejected.
9. No cross-driver/cross-organization access is possible.
10. Tokens and queued coordinates are encrypted/redacted appropriately.
11. Unit, integration, Android, and iOS smoke tests pass.
12. Any platform limitation is reported honestly; the app never claims impossible continuous tracking.

Deliver the Flutter implementation, platform manifest/configuration changes, automated tests, a short privacy/data-flow note, and a release checklist. Do not modify the FleetPilot web UI or backend contract from the mobile task.

---
