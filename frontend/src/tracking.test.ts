import { describe, expect, it } from "vitest";
import type { TripLocationPoint, TripTracking } from "./types";
import {
  applyTrackingEvent,
  trackingPath,
  trackingStreamUrl,
} from "./tracking";

const trip = {
  id: "trip/with space",
  tripNo: "IT-LIVE-001",
  status: "DISPATCHED" as const,
  source: "Bhopal",
  destination: "Indore",
  driver: { id: "driver-1", name: "Driver", contact: "9000000000" },
  vehicle: { id: "vehicle-1", name: "Truck", registrationNo: "MP04IT0001" },
};

const point = (id: string, offset = 0): TripLocationPoint => ({
  id,
  latitude: 23.2599 + offset,
  longitude: 77.4126 + offset,
  accuracyM: 12,
  speedKph: 40,
  headingDeg: 118,
  batteryPct: 71,
  isMocked: false,
  capturedAt: "2026-09-01T12:00:00.000Z",
  receivedAt: "2026-09-01T12:00:01.000Z",
});

describe("web live tracking integration", () => {
  it("builds encoded polling and SSE URLs from the same endpoint", () => {
    expect(trackingPath(trip.id)).toBe("/trips/trip%2Fwith%20space/location");
    expect(trackingStreamUrl("https://api.test/api", trip.id)).toBe(
      "https://api.test/api/trips/trip%2Fwith%20space/location/stream",
    );
  });

  it("keeps WAITING_FOR_GPS when the snapshot has no fabricated position", () => {
    const result = applyTrackingEvent(null, {
      type: "TRACKING_SNAPSHOT",
      trip,
      trackingStatus: "WAITING_FOR_GPS",
      latestLocation: null,
      history: [],
      trustWarning: null,
      serverTime: "2026-09-01T12:00:00.000Z",
    });
    expect(result?.trackingStatus).toBe("WAITING_FOR_GPS");
    expect(result?.latestLocation).toBeNull();
    expect(result?.history).toEqual([]);
  });

  it("keeps an exact off-route point visible with its trust warning", () => {
    const warning = "Location is 640 km away from the planned trip corridor";
    const result = applyTrackingEvent(null, {
      type: "TRACKING_SNAPSHOT",
      trip,
      trackingStatus: "LIVE",
      latestLocation: point("off-route"),
      history: [point("off-route")],
      trustWarning: warning,
      serverTime: "2026-09-01T12:00:00.000Z",
    });
    expect(result?.latestLocation?.id).toBe("off-route");
    expect(result?.trustWarning).toBe(warning);
  });

  it("deduplicates SSE updates and retains only the newest 100 points", () => {
    const current: TripTracking = {
      trip,
      trackingStatus: "LIVE",
      latestLocation: point("point-100"),
      history: Array.from({ length: 100 }, (_, index) =>
        point(`point-${index + 1}`, index / 10000),
      ),
      serverTime: "2026-09-01T12:00:00.000Z",
    };
    const updated = applyTrackingEvent(current, {
      type: "LOCATION_UPDATE",
      trackingStatus: "LIVE",
      location: point("point-50", 1),
      serverTime: "2026-09-01T12:00:10.000Z",
    });
    expect(updated?.history).toHaveLength(100);
    expect(
      updated?.history.filter((item) => item.id === "point-50"),
    ).toHaveLength(1);
    expect(updated?.history.at(-1)?.latitude).toBe(
      point("point-50", 1).latitude,
    );
  });

  it("does not invent state from a location update before a snapshot", () => {
    expect(
      applyTrackingEvent(null, {
        type: "LOCATION_UPDATE",
        trackingStatus: "LIVE",
        location: point("point-1"),
        serverTime: "2026-09-01T12:00:10.000Z",
      }),
    ).toBeNull();
  });
});
