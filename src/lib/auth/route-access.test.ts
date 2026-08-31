import { describe, expect, it } from "vitest";

import { getRouteAccess } from "./route-access";

describe("getRouteAccess", () => {
  it.each(["/", "/login"])("classifies %s as public", (pathname) => {
    expect(getRouteAccess(pathname)).toBe("public");
  });

  it.each([
    "/dashboard",
    "/vehicles/vehicle-1",
    "/maintenance/active",
    "/reports",
  ])("classifies %s as protected", (pathname) => {
    expect(getRouteAccess(pathname)).toBe("protected");
  });

  it("does not grant access to a route with a matching partial word", () => {
    expect(getRouteAccess("/dashboard-preview")).toBe("unknown");
  });
});
