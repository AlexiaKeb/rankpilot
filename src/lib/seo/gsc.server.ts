import type { GscRow } from "./gsc";

export function googleEnv() {
  const id = process.env.GOOGLE_CLIENT_ID;
  const secret = process.env.GOOGLE_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

export async function exchangeCode(code: string, redirectUri: string) {
  const env = googleEnv();
  if (!env) throw new Error("Google non configuré");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.id,
      client_secret: env.secret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error("Échange du code Google refusé");
  return (await res.json()) as { access_token: string; refresh_token?: string };
}

export async function accessTokenFrom(refreshToken: string): Promise<string> {
  const env = googleEnv();
  if (!env) throw new Error("Google non configuré");
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: env.id,
      client_secret: env.secret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error("Connexion Google expirée : reconnectez la Search Console.");
  return ((await res.json()) as { access_token: string }).access_token;
}

export async function listSites(
  token: string,
): Promise<{ siteUrl: string; permissionLevel: string }[]> {
  const res = await fetch("https://www.googleapis.com/webmasters/v3/sites", {
    headers: { authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Impossible de lister vos sites Search Console.");
  const json = (await res.json()) as { siteEntry?: { siteUrl: string; permissionLevel: string }[] };
  return (json.siteEntry ?? []).filter((s) => s.permissionLevel !== "siteUnverifiedUser");
}

export async function query(
  token: string,
  site: string,
  body: { startDate: string; endDate: string; dimensions?: string[]; rowLimit?: number },
): Promise<GscRow[]> {
  const res = await fetch(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ ...body, dimensions: body.dimensions ?? [] }),
    },
  );
  if (!res.ok)
    throw new Error(
      res.status === 403
        ? "Accès refusé à cette propriété Search Console."
        : "La Search Console a refusé la requête.",
    );
  const json = (await res.json()) as { rows?: GscRow[] };
  return json.rows ?? [];
}
