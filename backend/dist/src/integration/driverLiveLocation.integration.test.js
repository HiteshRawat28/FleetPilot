"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const node_crypto_1 = require("node:crypto");
const vitest_1 = require("vitest");
const baseUrl = process.env.INTEGRATION_BASE_URL;
const run = baseUrl ? vitest_1.describe : vitest_1.describe.skip;
const password = "Integration@123";
async function request(path, init = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers: {
            "content-type": "application/json",
            "x-transitops-client": "mobile",
            ...init.headers,
        },
    });
    const body = response.status === 204 ? null : (await response.json());
    return { response, body };
}
function jsonBody(result) {
    if (!result.body)
        throw new Error("Expected JSON response body");
    return result.body;
}
async function login(email, driver = true) {
    const result = await request(driver ? "/driver/auth/login" : "/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
    return result;
}
run.sequential("driver mobile to web live-location integration", () => {
    let driverToken = "";
    let managerToken = "";
    (0, vitest_1.it)("serves health and rejects invalid or non-driver mobile login", async () => {
        (0, vitest_1.expect)(jsonBody(await request("/health")).status).toBe("ok");
        const invalid = await request("/driver/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email: "verified.driver.integration@transitops.test",
                password: "WrongPassword@123",
            }),
        });
        (0, vitest_1.expect)(invalid.response.status).toBe(401);
        const nonDriver = await login("dispatcher.integration@transitops.test");
        (0, vitest_1.expect)(nonDriver.response.status).toBe(403);
    });
    (0, vitest_1.it)("logs in the linked driver and restores the same server identity", async () => {
        const result = await login("verified.driver.integration@transitops.test");
        (0, vitest_1.expect)(result.response.status).toBe(200);
        const body = jsonBody(result);
        (0, vitest_1.expect)(body.user).toMatchObject({
            role: "DRIVER",
            driverId: "integration-driver",
            organizationId: "integration-org",
            mustChangePassword: false,
        });
        driverToken = body.token;
        const restored = await request("/auth/me", {
            headers: { authorization: `Bearer ${driverToken}` },
        });
        (0, vitest_1.expect)(jsonBody(restored).user.id).toBe("integration-driver-user");
    });
    (0, vitest_1.it)("returns only assigned organization trips and starts at WAITING_FOR_GPS", async () => {
        const headers = { authorization: `Bearer ${driverToken}` };
        const assignments = await request("/driver/me/trips", { headers });
        (0, vitest_1.expect)(assignments.response.status).toBe(200);
        (0, vitest_1.expect)(jsonBody(assignments).map((trip) => trip.id)).toEqual([
            "integration-trip-dispatched",
            "integration-trip-completed",
        ]);
        const detail = await request("/driver/me/trips/integration-trip-dispatched", {
            headers,
        });
        (0, vitest_1.expect)(jsonBody(detail).tracking).toEqual({
            status: "WAITING_FOR_GPS",
            latestLocation: null,
        });
        const hidden = await request("/driver/me/trips/integration-other-trip", {
            headers,
        });
        (0, vitest_1.expect)(hidden.response.status).toBe(404);
    });
    (0, vitest_1.it)("validates location batches and rejects invalid device timestamps", async () => {
        const headers = { authorization: `Bearer ${driverToken}` };
        const point = {
            clientRequestId: (0, node_crypto_1.randomUUID)(),
            latitude: 23.259933,
            longitude: 77.412615,
            accuracyM: 11.4,
            capturedAt: new Date().toISOString(),
        };
        const oversized = await request("/driver/me/trips/integration-trip-dispatched/locations", {
            method: "POST",
            headers,
            body: JSON.stringify({
                points: Array.from({ length: 51 }, () => point),
            }),
        });
        (0, vitest_1.expect)(oversized.response.status).toBe(400);
        const future = await request("/driver/me/trips/integration-trip-dispatched/locations", {
            method: "POST",
            headers,
            body: JSON.stringify({
                points: [
                    {
                        ...point,
                        clientRequestId: (0, node_crypto_1.randomUUID)(),
                        capturedAt: new Date(Date.now() + 301_000).toISOString(),
                    },
                ],
            }),
        });
        (0, vitest_1.expect)(future.response.status).toBe(422);
    });
    (0, vitest_1.it)("accepts the first GPS point once and exposes it to web tracking", async () => {
        const point = {
            clientRequestId: (0, node_crypto_1.randomUUID)(),
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
        (0, vitest_1.expect)(accepted.response.status).toBe(201);
        (0, vitest_1.expect)(jsonBody(accepted)).toMatchObject({
            accepted: 1,
            duplicates: 0,
            tripStatus: "IN_PROGRESS",
        });
        const duplicate = await request(path, {
            method: "POST",
            headers,
            body: JSON.stringify({ points: [point] }),
        });
        (0, vitest_1.expect)(jsonBody(duplicate)).toMatchObject({
            accepted: 0,
            duplicates: 1,
            tripStatus: "IN_PROGRESS",
        });
        const manager = await login("manager.integration@transitops.test", false);
        managerToken = jsonBody(manager).token;
        const webTracking = await request("/trips/integration-trip-dispatched/location", {
            headers: { authorization: `Bearer ${managerToken}` },
        });
        (0, vitest_1.expect)(webTracking.response.status).toBe(200);
        const webTrackingBody = jsonBody(webTracking);
        (0, vitest_1.expect)(webTrackingBody).toMatchObject({
            trackingStatus: "LIVE",
            latestLocation: {
                latitude: point.latitude,
                longitude: point.longitude,
                batteryPct: 71,
            },
        });
        (0, vitest_1.expect)(webTrackingBody.history).toHaveLength(1);
    });
    (0, vitest_1.it)("stops accepting driver locations after web operations completes the trip", async () => {
        const completed = await request("/trips/integration-trip-dispatched/complete", {
            method: "POST",
            headers: { authorization: `Bearer ${managerToken}` },
            body: JSON.stringify({ finalOdometerKm: 42200, fuelConsumedL: 55 }),
        });
        (0, vitest_1.expect)(completed.response.status).toBe(200);
        (0, vitest_1.expect)(jsonBody(completed).status).toBe("COMPLETED");
        const rejected = await request("/driver/me/trips/integration-trip-dispatched/locations", {
            method: "POST",
            headers: { authorization: `Bearer ${driverToken}` },
            body: JSON.stringify({
                points: [
                    {
                        clientRequestId: (0, node_crypto_1.randomUUID)(),
                        latitude: 23.26,
                        longitude: 77.41,
                        accuracyM: 10,
                        capturedAt: new Date().toISOString(),
                    },
                ],
            }),
        });
        (0, vitest_1.expect)(rejected.response.status).toBe(409);
    });
});
