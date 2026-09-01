import type { TripLocationPoint, TripTracking } from "./types";

export type TrackingSnapshotEvent = {
  type: "TRACKING_SNAPSHOT";
  trip: TripTracking["trip"];
  trackingStatus: TripTracking["trackingStatus"];
  latestLocation: TripLocationPoint | null;
  history: TripLocationPoint[];
  serverTime: string;
};

export type LocationUpdateEvent = {
  type: "LOCATION_UPDATE";
  trackingStatus: TripTracking["trackingStatus"];
  location: TripLocationPoint;
  serverTime: string;
};

export function trackingPath(tripId: string) {
  return `/trips/${encodeURIComponent(tripId)}/location`;
}

export function trackingStreamUrl(apiUrl: string, tripId: string) {
  return `${apiUrl}${trackingPath(tripId)}/stream`;
}

export function applyTrackingEvent(
  current: TripTracking | null,
  event: TrackingSnapshotEvent | LocationUpdateEvent,
): TripTracking | null {
  if (event.type === "TRACKING_SNAPSHOT") {
    return {
      trip: event.trip,
      trackingStatus: event.trackingStatus,
      latestLocation: event.latestLocation,
      history: event.history.slice(-100),
      serverTime: event.serverTime,
    };
  }
  if (!current) return null;
  return {
    ...current,
    trackingStatus: event.trackingStatus,
    latestLocation: event.location,
    history: [
      ...current.history.filter((point) => point.id !== event.location.id),
      event.location,
    ].slice(-100),
    serverTime: event.serverTime,
  };
}
