export type GoogleTokenEnv = Pick<
  Env,
  "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REFRESH_TOKEN"
>;

let cachedToken: { accessToken: string; expiresAt: number } | null = null;

export function googleMetricsConfigured(env: GoogleTokenEnv): boolean {
  return Boolean(
    env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN,
  );
}

export async function getGoogleAccessToken(env: GoogleTokenEnv): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now + 60_000) {
    return cachedToken.accessToken;
  }

  if (!googleMetricsConfigured(env)) {
    throw new Error("Google OAuth secrets not configured");
  }

  const clientId = env.GOOGLE_CLIENT_ID!;
  const clientSecret = env.GOOGLE_CLIENT_SECRET!;
  const refreshToken = env.GOOGLE_REFRESH_TOKEN!;

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(
      data.error_description || data.error || `token refresh failed (${res.status})`,
    );
  }

  cachedToken = {
    accessToken: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.accessToken;
}

/** Clear in-memory cache (tests / forced refresh). */
export function clearGoogleTokenCache(): void {
  cachedToken = null;
}
