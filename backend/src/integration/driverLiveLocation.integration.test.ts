import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

const baseUrl = process.env.INTEGRATION_BASE_URL;
const run = baseUrl ? describe : describe.skip;
const password = "Integration@123";

type Json = Record<string, any>;

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      "x-transitops-client": "mobile",
      ...init.headers,
    },
  });
  const body =
    response.status === 204 ? null : ((await response.json()) as Json);
  return { response, body };
}

function jsonBody(result: Awaited<ReturnType<typeof request>>) {
  if (!result.body) throw new Error("Expected JSON response body");
  return result.body;
}

async function login(email: string, driver = true) {
  const result = await request(driver ? "/driver/auth/login" : "/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return result;
}

run.sequential("driver mobile to web live-location integration", () => {
  let driverToken = "";
  let managerToken = "";

  it("serves health and rejects invalid or non-driver mobile login", async () => {
    expect(jsonBody(await request("/health")).status).toBe("ok");
    const invalid = await request("/driver/auth/login", {
      method: "POST",
      body: JSON.stringify({
        email: "verified.driver.integration@transitops.test",
        password: "WrongPassword@123",
      }),
    });
    expect(invalid.response.status).toBe(401);
    const nonDriver = await login("dispatcher.integration@transitops.test");
    expect(nonDriver.response.status).toBe(403);
  });

  it("logs in the linked driver and restores the same server identity", async () => {
    const result = await login("verified.driver.integration@transitops.test");
    expect(result.response.status).toBe(200);
    const body = jsonBody(result);
    expect(body.user).toMatchObject({
      role: "DRIVER",
      driverId: "integration-driver",
      organizationId: "integration-org",
      mustChangePassword: false,
    });
    driverToken = body.token;
    const restored = await request("/auth/me", {
      headers: { authorization: `Bearer ${driverToken}` },
    });
    expect(jsonBody(restored).user.id).toBe("integration-driver-user");
  });

  it("returns only assigned organization trips and starts at WAITING_FOR_GPS", async () => {
    const headers = { authorization: `Bearer ${driverToken}` };
    const assignments = await request("/driver/me/trips", { headers });
    expect(assignments.response.status).toBe(200);
    expect(jsonBody(assignments).map((trip: Json) => trip.id)).toEqual([
      "integration-trip-dispatched",
      "integration-trip-completed",
    ]);
    const detail = await request(
      "/driver/me/trips/integration-trip-dispatched",
      {
        headers,
      },
    );
    expect(jsonBody(detail).tracking).toEqual({
      status: "WAITING_FOR_GPS",
      latestLocation: null,
    });
    const hidden = await request("/driver/me/trips/integration-other-trip", {
      headers,
    });
    expect(hidden.response.status).toBe(404);
  });

  it("validates location batches and rejects invalid device timestamps", async () => {
    const headers = { authorization: `Bearer ${driverToken}` };
    const point = {
      clientRequestId: randomUUID(),
      latitude: 23.259933,
      longitude: 77.412615,
      accuracyM: 11.4,
      capturedAt: new Date().toISOString(),
    };
    const oversized = await request(
      "/driver/me/trips/integration-trip-dispatched/locations",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          points: Array.from({ length: 51 }, () => point),
        }),
      },
    );
    expect(oversized.response.status).toBe(400);
    const future = await request(
      "/driver/me/trips/integration-trip-dispatched/locations",
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          points: [
            {
              ...point,
              clientRequestId: randomUUID(),
              capturedAt: new Date(Date.now() + 301_000).toISOString(),
            },
          ],
        }),
      },
    );
    expect(future.response.status).toBe(422);
  });

  it("accepts the first GPS point once and exposes it to web tracking", async () => {
    const point = {
      clientRequestId: randomUUID(),
      latitude: 23.259933,
      longitude: 77.412615,
      accuracyM: 11.4,
      speedKph: 42.7,
      headingDeg: 118,
      altitudeM: 523.2,
      batteryPct: 71,
      isMocked: false,
      capturedAt: new Date().toISOString(),
    };
    const path = "/driver/me/trips/integration-trip-dispatched/locations";
    const headers = { authorization: `Bearer ${driverToken}` };
    const accepted = await request(path, {
      method: "POST",
      headers,
      body: JSON.stringify({ points: [point] }),
    });
    expect(accepted.response.status).toBe(201);
    expect(jsonBody(accepted)).toMatchObject({
      accepted: 1,
      duplicates: 0,
      tripStatus: "IN_PROGRESS",
    });
    const duplicate = await request(path, {
      method: "POST",
      headers,
      body: JSON.stringify({ points: [point] }),
    });
    expect(jsonBody(duplicate)).toMatchObject({
      accepted: 0,
      duplicates: 1,
      tripStatus: "IN_PROGRESS",
    });

    const manager = await login("manager.integration@transitops.test", false);
    managerToken = jsonBody(manager).token;
    const webTracking = await request(
      "/trips/integration-trip-dispatched/location",
      {
        headers: { authorization: `Bearer ${managerToken}` },
      },
    );
    expect(webTracking.response.status).toBe(200);
    const webTrackingBody = jsonBody(webTracking);
    expect(webTrackingBody).toMatchObject({
      trackingStatus: "LIVE",
      latestLocation: {
        latitude: point.latitude,
        longitude: point.longitude,
        batteryPct: 71,
      },
    });
    expect(webTrackingBody.history).toHaveLength(1);
  });

  it("stops accepting driver locations after web operations completes the trip", async () => {
    const completed = await request(
      "/trips/integration-trip-dispatched/complete",
      {
        method: "POST",
        headers: { authorization: `Bearer ${managerToken}` },
        body: JSON.stringify({ finalOdometerKm: 42200, fuelConsumedL: 55 }),
      },
    );
    expect(completed.response.status).toBe(200);
    expect(jsonBody(completed).status).toBe("COMPLETED");
    const rejected = await request(
      "/driver/me/trips/integration-trip-dispatched/locations",
      {
        method: "POST",
        headers: { authorization: `Bearer ${driverToken}` },
        body: JSON.stringify({
          points: [
            {
              clientRequestId: randomUUID(),
              latitude: 23.26,
              longitude: 77.41,
              accuracyM: 10,
              capturedAt: new Date().toISOString(),
            },
          ],
        }),
      },
    );
    expect(rejected.response.status).toBe(409);
  });
});
