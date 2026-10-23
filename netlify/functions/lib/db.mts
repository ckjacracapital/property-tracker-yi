// Supabase storage layer for the portal API. Everything the API persists goes
// through here, so api.mts never talks to the database directly.
//
// Uses the service-role key, which bypasses Row Level Security — it must only
// ever run server-side (this file is bundled into the Netlify function, never
// shipped to the browser). Configure in Netlify: SUPABASE_URL and
// SUPABASE_SERVICE_ROLE_KEY (mark the key as a secret).

import { createClient } from "@supabase/supabase-js";

const IMAGE_BUCKET = "property-images";
const PAGE_SIZE = 1000;

let client: any = null;

function sb(): any {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase is not configured — set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the Netlify environment");
  }
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

// ids are uuid columns — querying one with a malformed value (e.g. a mistyped
// URL) would be a Postgres syntax error, so treat those as simply "not found".
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

// Unwraps a supabase-js response: returns .data, or throws the DB error.
function unwrap(res: { data: any; error: any }): any {
  if (res.error) throw new Error(res.error.message || "database error");
  return res.data;
}

// --- Properties (one row each; the full record lives in `data`) ---

export async function listProperties(): Promise<any[]> {
  const all: any[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const rows = unwrap(
      await sb().from("properties").select("data").order("created_at", { ascending: true }).range(from, from + PAGE_SIZE - 1)
    );
    all.push(...rows.map((r: any) => r.data));
    if (rows.length < PAGE_SIZE) break;
  }
  return all;
}

export async function getProperty(id: string): Promise<any | null> {
  if (!isUuid(id)) return null;
  const row = unwrap(await sb().from("properties").select("data").eq("id", id).maybeSingle());
  return row ? row.data : null;
}

export async function saveProperty(property: any): Promise<void> {
  unwrap(await sb().from("properties").upsert({ id: property.id, data: property, updated_at: new Date().toISOString() }));
}

export async function insertProperties(properties: any[]): Promise<void> {
  if (properties.length === 0) return;
  unwrap(await sb().from("properties").insert(properties.map((p) => ({ id: p.id, data: p }))));
}

// Returns the records that were actually deleted (so callers can 404 / log them).
export async function deleteProperties(ids: string[]): Promise<any[]> {
  ids = ids.filter(isUuid);
  if (ids.length === 0) return [];
  const rows = unwrap(await sb().from("properties").delete().in("id", ids).select("data"));
  return rows.map((r: any) => r.data);
}

// --- Portfolios ---

export async function listPortfolios(): Promise<any[]> {
  const rows = unwrap(await sb().from("portfolios").select("id, name").order("created_at", { ascending: true }));
  return rows;
}

export async function insertPortfolio(portfolio: { id: string; name: string }): Promise<void> {
  unwrap(await sb().from("portfolios").insert(portfolio));
}

export async function renamePortfolio(id: string, name: string): Promise<any | null> {
  if (!isUuid(id)) return null;
  const row = unwrap(await sb().from("portfolios").update({ name }).eq("id", id).select("id, name").maybeSingle());
  return row || null;
}

export async function deletePortfolio(id: string): Promise<any | null> {
  if (!isUuid(id)) return null;
  const row = unwrap(await sb().from("portfolios").delete().eq("id", id).select("id, name").maybeSingle());
  return row || null;
}

// --- Staff logins ---

function staffFromRow(r: any) {
  return {
    id: r.id,
    username: r.username,
    passwordHash: r.password_hash,
    passwordSalt: r.password_salt,
    allowedStages: r.allowed_stages
  };
}

export async function listStaff(): Promise<any[]> {
  const rows = unwrap(await sb().from("staff_users").select("*").order("created_at", { ascending: true }));
  return rows.map(staffFromRow);
}

export async function getStaffByUsername(username: string): Promise<any | null> {
  const row = unwrap(await sb().from("staff_users").select("*").eq("username", username).maybeSingle());
  return row ? staffFromRow(row) : null;
}

export async function countStaff(): Promise<number> {
  const res = await sb().from("staff_users").select("id", { count: "exact", head: true });
  if (res.error) throw new Error(res.error.message);
  return res.count || 0;
}

export async function insertStaff(user: any): Promise<void> {
  unwrap(
    await sb().from("staff_users").insert({
      id: user.id,
      username: user.username,
      password_hash: user.passwordHash,
      password_salt: user.passwordSalt,
      allowed_stages: user.allowedStages
    })
  );
}

export async function updateStaff(
  id: string,
  patch: { allowedStages?: any; passwordHash?: string; passwordSalt?: string }
): Promise<any | null> {
  if (!isUuid(id)) return null;
  const update: any = {};
  if (patch.allowedStages !== undefined) update.allowed_stages = patch.allowedStages;
  if (patch.passwordHash !== undefined) update.password_hash = patch.passwordHash;
  if (patch.passwordSalt !== undefined) update.password_salt = patch.passwordSalt;
  const row = unwrap(await sb().from("staff_users").update(update).eq("id", id).select("*").maybeSingle());
  return row ? staffFromRow(row) : null;
}

export async function deleteStaff(id: string): Promise<any | null> {
  if (!isUuid(id)) return null;
  const row = unwrap(await sb().from("staff_users").delete().eq("id", id).select("*").maybeSingle());
  return row ? staffFromRow(row) : null;
}

// --- Presence, time spent, activity log ---

export async function upsertPresence(username: string, path: string): Promise<void> {
  unwrap(await sb().from("presence").upsert({ username, path, last_seen: new Date().toISOString() }));
}

export async function listPresence(): Promise<{ username: string; path: string; lastSeen: string }[]> {
  const rows = unwrap(await sb().from("presence").select("username, path, last_seen"));
  return rows.map((r: any) => ({ username: r.username, path: r.path, lastSeen: r.last_seen }));
}

export async function incrementTimeSpent(username: string, stage: string, seconds: number): Promise<void> {
  unwrap(await sb().rpc("increment_time_spent", { p_username: username, p_stage: stage, p_seconds: seconds }));
}

export async function listTimeSpent(): Promise<{ username: string; stage: string; seconds: number }[]> {
  return unwrap(await sb().from("time_spent").select("username, stage, seconds"));
}

export async function appendActivity(username: string, type: string, detail: any): Promise<void> {
  unwrap(await sb().from("activity_log").insert({ username, type, detail: detail || {} }));
}

// Newest first.
export async function recentActivity(limit: number): Promise<any[]> {
  const rows = unwrap(
    await sb().from("activity_log").select("id, ts, username, type, detail").order("ts", { ascending: false }).limit(limit)
  );
  return rows;
}

// --- Property photos (private Storage bucket, served via the API) ---

export async function putImage(id: string, bytes: ArrayBuffer, contentType: string): Promise<void> {
  unwrap(await sb().storage.from(IMAGE_BUCKET).upload(id, bytes, { contentType, upsert: false }));
}

export async function getImage(id: string): Promise<{ bytes: ArrayBuffer; contentType: string } | null> {
  if (!isUuid(id)) return null;
  const res = await sb().storage.from(IMAGE_BUCKET).download(id);
  if (res.error) {
    const msg = String(res.error.message || "");
    if (/not found|does not exist|404/i.test(msg) || String(res.error.statusCode) === "404") return null;
    throw new Error(msg || "storage error");
  }
  const blob: Blob = res.data;
  return { bytes: await blob.arrayBuffer(), contentType: blob.type || "application/octet-stream" };
}
