export const SUPABASE_ENV = {
  url: "NEXT_PUBLIC_SUPABASE_URL",
  publishableKey: "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  serviceRoleKey: "SUPABASE_SERVICE_ROLE_KEY",
} as const;

export type PublicSupabaseConfig = {
  url: string;
  publishableKey: string;
};

export type ServiceRoleConfig = PublicSupabaseConfig & {
  serviceRoleKey: string;
};

type Environment = Record<string, string | undefined>;

function requireEnvironmentValue(env: Environment, name: string): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function requireHttpUrl(value: string, name: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid URL.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${name} must use http or https.`);
  }

  return url.toString().replace(/\/$/, "");
}

export function getPublicSupabaseConfig(
  env: Environment,
): PublicSupabaseConfig {
  const url = requireHttpUrl(
    requireEnvironmentValue(env, SUPABASE_ENV.url),
    SUPABASE_ENV.url,
  );

  return {
    url,
    publishableKey: requireEnvironmentValue(env, SUPABASE_ENV.publishableKey),
  };
}

export function getServiceRoleConfig(env: Environment): ServiceRoleConfig {
  return {
    ...getPublicSupabaseConfig(env),
    serviceRoleKey: requireEnvironmentValue(env, SUPABASE_ENV.serviceRoleKey),
  };
}
