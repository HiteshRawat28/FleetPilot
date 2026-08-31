export const PUBLIC_ROUTES = ["/", "/login"] as const;
export const PROTECTED_ROUTE_PREFIXES = [
  "/dashboard",
  "/vehicles",
  "/drivers",
  "/trips",
  "/maintenance",
  "/finance",
  "/reports",
] as const;

export type RouteAccess = "public" | "protected" | "unknown";

export function getRouteAccess(pathname: string): RouteAccess {
  if (PUBLIC_ROUTES.includes(pathname as (typeof PUBLIC_ROUTES)[number])) {
    return "public";
  }

  const isProtected = PROTECTED_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  return isProtected ? "protected" : "unknown";
}
