# TransitOps Flutter App

The TransitOps mobile client is built with Flutter and uses the FleetPilot API
and PostgreSQL database through the existing backend.

## Run

```bash
cd /Users/sanketmistry/Desktop/TransiOps_app
flutter pub get
flutter run
```

The local API defaults to `http://localhost:4000/api` for iOS Simulator and
macOS. Start the backend before signing in.

## Verify

```bash
flutter analyze
flutter test
```
