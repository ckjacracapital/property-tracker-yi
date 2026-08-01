import type { Context, Config } from "@netlify/edge-functions";

// Independent re-implementation of the session verification in
// netlify/functions/api.mts — same HMAC scheme, same SESSION_SECRET, but
// kept as two separate implementations (edge runtime vs. function runtime)
// so a bug in one layer can't silently disable the other. This layer only
// gates which PAGES a browser can navigate to; the function layer is what
// actually stops a technical user from reading data via the API directly.

const SESSION_COOKIE = "jacra_session";

const PUBLIC_PATHS = new Set([
  "/login.html",
  "/login.js",
  "/style.css",
  "/jacra-logo.png",
  "/paper-texture.jpg"
]);

const PAGE_STAGE: Record<string, string> = {
  "/acquisitions.html": "acquisitions",
  "/refurb.html": "refurb",
  "/due-diligence.html": "due_diligence",
  "/due-diligence-detail.html": "due_diligence",
  "/handed-over.html": "handed_over",
  "/inventory.html": "inventory"
};

const STAGE_ORDER = ["acquisitions", "refurb", "due_diligence", "handed_over", "inventory"];
const STAGE_HREF: Record<string, string> = {
  acquisitions: "/acquisitions.html",
  refurb: "/refurb.html",
  due_diligence: "/due-diligence.html",
  handed_over: "/handed-over.html",
  inventory: "/inventory.html"
};

function firstAllowedHref(allowedStages: string | string[]): string {
  if (allowedStages === "all") return "/acquisitions.html";
  for (const s of STAGE_ORDER) {
    if (Array.isArray(allowedStages) && allowedStages.includes(s)) return STAGE_HREF[s];
  }
  return "/login.html";
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

async function hmacKey() {
  const secret = Netlify.env.get("SESSION_SECRET") || "";
  return crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
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

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const pathname = url.pathname;

  if (pathname.startsWith("/api/")) {
    return context.next();
  }
  if (PUBLIC_PATHS.has(pathname)) {
    return context.next();
  }

  const token = getCookie(req, SESSION_COOKIE);
  const session = token ? await verifySessionToken(token) : null;

  if (!session) {
    return Response.redirect(new URL("/login.html", req.url).toString(), 302);
  }

  const requiredStage = PAGE_STAGE[pathname];
  if (requiredStage) {
    const allowed = session.allowedStages === "all" || (Array.isArray(session.allowedStages) && session.allowedStages.includes(requiredStage));
    if (!allowed) {
      return Response.redirect(new URL(firstAllowedHref(session.allowedStages), req.url).toString(), 302);
    }
  }

  if (pathname === "/staff.html" && session.allowedStages !== "all") {
    return Response.redirect(new URL(firstAllowedHref(session.allowedStages), req.url).toString(), 302);
  }

  return context.next();
};

export const config: Config = {
  path: "/*"
};
