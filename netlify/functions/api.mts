import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Only Acquisitions and Refurb are a strict "one active stage at a time"
// pipeline with an open/complete gate. Completing Refurb fans a property out
// to Due Diligence and Inventory simultaneously (both just become visible,
// no gate); Handed Over is reached only by an explicit manual action, never
// automatically. None of the last three stages have an open/complete split.
const STAGES = ["acquisitions", "refurb"];

// All five pages, in canonical order (used to pick a restricted user's
// landing page and to validate `allowedStages`).
const ALL_STAGE_IDS = ["acquisitions", "refurb", "due_diligence", "handed_over", "inventory"];

// Each stage keeps its own nested field group so a property's history from
// earlier stages is preserved as it moves forward.
const STAGE_GROUPS = ["acquisitions", "refurb", "dueDiligence", "handedOver", "inventory"];
const CORE_FIELDS = [
  "propertyAddress", "bedrooms", "portfolioId",
  "reachedDueDiligence", "reachedInventory", "reachedHandedOver"
];

// Maps a stage-group's storage key to the page/stage id it belongs to, so a
// write touching that group can be checked against a session's allowedStages.
const GROUP_TO_STAGE: Record<string, string> = {
  acquisitions: "acquisitions",
  refurb: "refurb",
  dueDiligence: "due_diligence",
  handedOver: "handed_over",
  inventory: "inventory"
};
const FLAG_TO_STAGE: Record<string, string> = {
  reachedDueDiligence: "due_diligence",
  reachedInventory: "inventory",
  reachedHandedOver: "handed_over"
};

const PROPERTIES_KEY = "properties";
const PORTFOLIOS_KEY = "portfolios";
const STAFF_KEY = "staffUsers";
const SESSION_COOKIE = "jacra_session";
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

function propertiesStore() {
  return getStore("property-tracker");
}

async function loadProperties(): Promise<any[]> {
  const data = await propertiesStore().get(PROPERTIES_KEY, { type: "json" });
  return data || [];
}

async function saveProperties(properties: any[]) {
  await propertiesStore().setJSON(PROPERTIES_KEY, properties);
}

async function loadPortfolios(): Promise<any[]> {
  const data = await propertiesStore().get(PORTFOLIOS_KEY, { type: "json" });
  return data || [];
}

async function savePortfolios(portfolios: any[]) {
  await propertiesStore().setJSON(PORTFOLIOS_KEY, portfolios);
}

async function loadStaff(): Promise<any[]> {
  const data = await propertiesStore().get(STAFF_KEY, { type: "json" });
  return data || [];
}

async function saveStaff(staff: any[]) {
  await propertiesStore().setJSON(STAFF_KEY, staff);
}

// --- Crypto helpers (Web Crypto, available in both this Node function
// runtime and the Deno edge runtime that independently re-implements the
// same session verification) ---

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  return bytes;
}
function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function base64UrlToBytes(b64url: string): Uint8Array {
  let b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  while (b64.length % 4) b64 += "=";
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hashPassword(password: string, saltHex?: string): Promise<{ hash: string; salt: string }> {
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", salt, iterations: 100000, hash: "SHA-256" }, keyMaterial, 256);
  return { hash: bytesToHex(new Uint8Array(bits)), salt: bytesToHex(salt) };
}

async function verifyPassword(password: string, saltHex: string, expectedHash: string): Promise<boolean> {
  const { hash } = await hashPassword(password, saltHex);
  return hash === expectedHash;
}

async function hmacKey() {
  const secret = process.env.SESSION_SECRET || "";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signSession(payload: { username: string; allowedStages: string | string[] }): Promise<string> {
  const exp = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  const body = JSON.stringify({ ...payload, exp });
  const bodyB64 = bytesToBase64Url(new TextEncoder().encode(body));
  const key = await hmacKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyB64));
  return `${bodyB64}.${bytesToBase64Url(new Uint8Array(sig))}`;
}

async function verifySessionToken(token: string): Promise<{ username: string; allowedStages: string | string[] } | null> {
  if (!token) return null;
  const [bodyB64, sigB64] = token.split(".");
  if (!bodyB64 || !sigB64) return null;
  const key = await hmacKey();
  const expectedSig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyB64));
  if (bytesToBase64Url(new Uint8Array(expectedSig)) !== sigB64) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToBytes(bodyB64)));
    if (!payload.exp || Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function getCookie(req: Request, name: string): string | null {
  const cookieHeader = req.headers.get("cookie") || "";
  const match = cookieHeader.split(";").map((s) => s.trim()).find((c) => c.startsWith(name + "="));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

async function getSession(req: Request) {
  const token = getCookie(req, SESSION_COOKIE);
  if (!token) return null;
  return await verifySessionToken(token);
}

function isAdmin(session: any) {
  return Boolean(session) && session.allowedStages === "all";
}

function stageAllowed(session: any, stageId: string) {
  if (!session) return false;
  if (session.allowedStages === "all") return true;
  return Array.isArray(session.allowedStages) && session.allowedStages.includes(stageId);
}

// Does this write touch any stage-group or reach-flag the session isn't
// permitted to see? Core fields (address/portfolio/bedrooms) aren't gated —
// they're shared organizational metadata, not stage-specific sensitive data.
function checkWritePermission(session: any, body: any): boolean {
  if (isAdmin(session)) return true;
  for (const [groupKey, stageId] of Object.entries(GROUP_TO_STAGE)) {
    if (body[groupKey] !== undefined && !stageAllowed(session, stageId)) return false;
  }
  for (const [flagKey, stageId] of Object.entries(FLAG_TO_STAGE)) {
    if (body[flagKey] !== undefined && !stageAllowed(session, stageId)) return false;
  }
  return true;
}

function isRelevantToStage(property: any, stageId: string): boolean {
  if (stageId === "acquisitions") return property.stage === "acquisitions" || Boolean(property.stageHistory?.acquisitions);
  if (stageId === "refurb") return property.stage === "refurb";
  if (stageId === "due_diligence") return Boolean(property.reachedDueDiligence);
  if (stageId === "handed_over") return Boolean(property.reachedHandedOver);
  if (stageId === "inventory") return Boolean(property.reachedInventory);
  return false;
}

// The real enforcement point: a restricted session only ever sees properties
// relevant to a stage it's allowed, and every stage-group object it isn't
// allowed to see is stripped from each record before it leaves the server —
// not just hidden client-side.
function filterPropertiesForSession(properties: any[], session: any): any[] {
  if (isAdmin(session)) return properties;
  const allowed = Array.isArray(session.allowedStages) ? session.allowedStages : [];
  return properties
    .filter((p) => allowed.some((stageId: string) => isRelevantToStage(p, stageId)))
    .map((p) => {
      const copy = { ...p };
      for (const [groupKey, stageId] of Object.entries(GROUP_TO_STAGE)) {
        if (!allowed.includes(stageId)) delete copy[groupKey];
      }
      return copy;
    });
}

function applyUpdate(property: any, body: any) {
  for (const field of CORE_FIELDS) {
    if (body[field] !== undefined) property[field] = body[field];
  }
  for (const group of STAGE_GROUPS) {
    if (body[group] && typeof body[group] === "object") {
      property[group] = { ...property[group], ...body[group] };
    }
  }
}

// Lets a property be added directly at any page instead of only ever
// starting at Acquisitions. Earlier gates it skips are treated as already
// done (rather than "pending"), so it doesn't show up as needing work on a
// stage it was never meant to pass through in this tool.
function startingState(startStage: string) {
  const now = new Date().toISOString();
  const state: any = {
    stage: "acquisitions",
    stageHistory: {},
    reachedDueDiligence: false,
    reachedInventory: false,
    reachedHandedOver: false
  };
  if (startStage === "refurb" || startStage === "due_diligence" || startStage === "handed_over" || startStage === "inventory") {
    state.stage = "refurb";
  }
  if (startStage === "due_diligence" || startStage === "handed_over" || startStage === "inventory") {
    state.stageHistory.refurb = now;
    state.reachedDueDiligence = true;
    state.reachedInventory = true;
  }
  if (startStage === "handed_over") {
    state.reachedHandedOver = true;
  }
  return state;
}

function newProperty(body: any) {
  const now = new Date().toISOString();
  const property: any = {
    id: crypto.randomUUID(),
    ...startingState(body.startStage),
    createdAt: now,
    updatedAt: now,
    propertyAddress: "",
    bedrooms: "",
    portfolioId: null,
    acquisitions: {},
    refurb: {},
    dueDiligence: {},
    handedOver: {},
    inventory: {}
  };
  applyUpdate(property, body);
  return property;
}

async function handleProperties(req: Request, id: string, action: string, session: any) {
  if (req.method === "GET" && !id) {
    const properties = await loadProperties();
    return Response.json(filterPropertiesForSession(properties, session));
  }

  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.propertyAddress || !String(body.propertyAddress).trim()) {
      return Response.json({ error: "propertyAddress is required" }, { status: 400 });
    }
    const startStage = body.startStage || "acquisitions";
    if (!stageAllowed(session, startStage)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const properties = await loadProperties();
    const property = newProperty(body);
    properties.push(property);
    await saveProperties(properties);
    return Response.json(property, { status: 201 });
  }

  if (req.method === "PATCH" && id && !action) {
    const body = await req.json();
    if (!checkWritePermission(session, body)) {
      return Response.json({ error: "forbidden" }, { status: 403 });
    }
    const properties = await loadProperties();
    const property = properties.find((p) => p.id === id);
    if (!property) return Response.json({ error: "not found" }, { status: 404 });
    applyUpdate(property, body);
    property.updatedAt = new Date().toISOString();
    await saveProperties(properties);
    return Response.json(property);
  }

  if (req.method === "POST" && id && action === "complete") {
    const properties = await loadProperties();
    const property = properties.find((p) => p.id === id);
    if (!property) return Response.json({ error: "not found" }, { status: 404 });
    if (!stageAllowed(session, property.stage)) return Response.json({ error: "forbidden" }, { status: 403 });
    const idx = STAGES.indexOf(property.stage);
    const now = new Date().toISOString();
    property.stageHistory[property.stage] = now;
    if (property.stage === "refurb") {
      // Refurb fans out to both Due Diligence and Inventory at once; neither
      // has its own open/complete gate, so there's no further "stage" to move to.
      property.reachedDueDiligence = true;
      property.reachedInventory = true;
    } else if (idx < STAGES.length - 1) {
      property.stage = STAGES[idx + 1];
    }
    property.updatedAt = now;
    await saveProperties(properties);
    return Response.json(property);
  }

  if (req.method === "POST" && id && action === "reopen") {
    const properties = await loadProperties();
    const property = properties.find((p) => p.id === id);
    if (!property) return Response.json({ error: "not found" }, { status: 404 });
    if (!stageAllowed(session, property.stage)) return Response.json({ error: "forbidden" }, { status: 403 });
    if (property.stageHistory[property.stage]) {
      if (property.stage === "refurb") {
        property.reachedDueDiligence = false;
        property.reachedInventory = false;
      }
      delete property.stageHistory[property.stage];
    } else {
      const idx = STAGES.indexOf(property.stage);
      if (idx > 0) {
        const prev = STAGES[idx - 1];
        delete property.stageHistory[prev];
        property.stage = prev;
      }
    }
    property.updatedAt = new Date().toISOString();
    await saveProperties(properties);
    return Response.json(property);
  }

  if (req.method === "DELETE" && id && !action) {
    if (!isAdmin(session)) return Response.json({ error: "forbidden" }, { status: 403 });
    const properties = await loadProperties();
    const next = properties.filter((p) => p.id !== id);
    if (next.length === properties.length) return Response.json({ error: "not found" }, { status: 404 });
    await saveProperties(next);
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

async function handlePortfolios(req: Request, id: string, session: any) {
  if (req.method === "GET" && !id) {
    return Response.json(await loadPortfolios());
  }

  if (!isAdmin(session)) return Response.json({ error: "forbidden" }, { status: 403 });

  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.name || !String(body.name).trim()) {
      return Response.json({ error: "name is required" }, { status: 400 });
    }
    const portfolios = await loadPortfolios();
    const portfolio = { id: crypto.randomUUID(), name: String(body.name).trim() };
    portfolios.push(portfolio);
    await savePortfolios(portfolios);
    return Response.json(portfolio, { status: 201 });
  }

  if (req.method === "PATCH" && id) {
    const body = await req.json();
    const portfolios = await loadPortfolios();
    const portfolio = portfolios.find((p) => p.id === id);
    if (!portfolio) return Response.json({ error: "not found" }, { status: 404 });
    if (body.name !== undefined) portfolio.name = String(body.name).trim();
    await savePortfolios(portfolios);
    return Response.json(portfolio);
  }

  if (req.method === "DELETE" && id) {
    const portfolios = await loadPortfolios();
    const next = portfolios.filter((p) => p.id !== id);
    if (next.length === portfolios.length) return Response.json({ error: "not found" }, { status: 404 });
    await savePortfolios(next);

    const properties = await loadProperties();
    let changed = false;
    for (const property of properties) {
      if (property.portfolioId === id) {
        property.portfolioId = null;
        changed = true;
      }
    }
    if (changed) await saveProperties(properties);

    return new Response(null, { status: 204 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

function normalizeAllowedStages(value: any): string | string[] {
  if (value === "all") return "all";
  if (Array.isArray(value)) return value.filter((s) => ALL_STAGE_IDS.includes(s));
  return [];
}

function sessionCookieHeader(token: string): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}`;
}

function clearCookieHeader(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

async function handleAuth(req: Request, action: string) {
  if (action === "login" && req.method === "POST") {
    const body = await req.json();
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    let staff = await loadStaff();
    if (staff.length === 0) {
      // Bootstrap: seed one admin from the site's existing shared credentials
      // so Charley keeps the login already in use and is never locked out.
      const seedUsername = process.env.SITE_USER || "jacra";
      const seedPassword = process.env.SITE_PASSWORD || "";
      if (seedPassword) {
        const { hash, salt } = await hashPassword(seedPassword);
        staff = [{ id: crypto.randomUUID(), username: seedUsername, passwordHash: hash, passwordSalt: salt, allowedStages: "all" }];
        await saveStaff(staff);
      }
    }

    const user = staff.find((u) => u.username === username);
    if (!user || !(await verifyPassword(password, user.passwordSalt, user.passwordHash))) {
      return Response.json({ error: "Invalid username or password" }, { status: 401 });
    }

    const token = await signSession({ username: user.username, allowedStages: user.allowedStages });
    return Response.json(
      { username: user.username, allowedStages: user.allowedStages },
      { headers: { "Set-Cookie": sessionCookieHeader(token) } }
    );
  }

  if (action === "logout" && req.method === "POST") {
    return new Response(null, { status: 204, headers: { "Set-Cookie": clearCookieHeader() } });
  }

  if (action === "me" && req.method === "GET") {
    const session = await getSession(req);
    if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });
    return Response.json({ username: session.username, allowedStages: session.allowedStages });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

async function handleStaff(req: Request, id: string, session: any) {
  if (!isAdmin(session)) return Response.json({ error: "forbidden" }, { status: 403 });

  const publicShape = (u: any) => ({ id: u.id, username: u.username, allowedStages: u.allowedStages });

  if (req.method === "GET" && !id) {
    return Response.json((await loadStaff()).map(publicShape));
  }

  if (req.method === "POST" && !id) {
    const body = await req.json();
    const username = String(body.username || "").trim();
    if (!username) return Response.json({ error: "username is required" }, { status: 400 });
    if (!body.password) return Response.json({ error: "password is required" }, { status: 400 });
    const staff = await loadStaff();
    if (staff.some((u) => u.username === username)) {
      return Response.json({ error: "That username is already taken" }, { status: 409 });
    }
    const { hash, salt } = await hashPassword(String(body.password));
    const user = {
      id: crypto.randomUUID(),
      username,
      passwordHash: hash,
      passwordSalt: salt,
      allowedStages: normalizeAllowedStages(body.allowedStages)
    };
    staff.push(user);
    await saveStaff(staff);
    return Response.json(publicShape(user), { status: 201 });
  }

  if (req.method === "PATCH" && id) {
    const body = await req.json();
    const staff = await loadStaff();
    const user = staff.find((u) => u.id === id);
    if (!user) return Response.json({ error: "not found" }, { status: 404 });
    if (body.allowedStages !== undefined) user.allowedStages = normalizeAllowedStages(body.allowedStages);
    if (body.password) {
      const { hash, salt } = await hashPassword(String(body.password));
      user.passwordHash = hash;
      user.passwordSalt = salt;
    }
    await saveStaff(staff);
    return Response.json(publicShape(user));
  }

  if (req.method === "DELETE" && id) {
    const staff = await loadStaff();
    const next = staff.filter((u) => u.id !== id);
    if (next.length === staff.length) return Response.json({ error: "not found" }, { status: 404 });
    await saveStaff(next);
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const resource = parts[0];

  try {
    if (resource === "auth") {
      return await handleAuth(req, parts[1]);
    }

    // Everything below requires a valid session.
    const session = await getSession(req);
    if (!session) return Response.json({ error: "not authenticated" }, { status: 401 });

    if (resource === "staff") {
      return await handleStaff(req, parts[1], session);
    }
    if (resource === "properties") {
      return await handleProperties(req, parts[1], parts[2], session);
    }
    if (resource === "portfolios") {
      return await handlePortfolios(req, parts[1], session);
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (err: any) {
    return Response.json({ error: err?.message || "server error" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/*"
};
