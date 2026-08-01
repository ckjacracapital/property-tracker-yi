import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// Only Acquisitions and Refurb are a strict "one active stage at a time"
// pipeline with an open/complete gate. Completing Refurb fans a property out
// to Due Diligence and Inventory simultaneously (both just become visible,
// no gate); Handed Over is reached only by an explicit manual action, never
// automatically. None of the last three stages have an open/complete split.
const STAGES = ["acquisitions", "refurb"];

// Each stage keeps its own nested field group so a property's history from
// earlier stages is preserved as it moves forward.
const STAGE_GROUPS = ["acquisitions", "refurb", "dueDiligence", "handedOver", "inventory"];
const CORE_FIELDS = [
  "propertyAddress", "bedrooms", "portfolioId",
  "reachedDueDiligence", "reachedInventory", "reachedHandedOver"
];

const PROPERTIES_KEY = "properties";
const PORTFOLIOS_KEY = "portfolios";

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

function newProperty(body: any) {
  const now = new Date().toISOString();
  const property: any = {
    id: crypto.randomUUID(),
    stage: STAGES[0],
    stageHistory: {},
    createdAt: now,
    updatedAt: now,
    propertyAddress: "",
    bedrooms: "",
    portfolioId: null,
    reachedDueDiligence: false,
    reachedInventory: false,
    reachedHandedOver: false,
    acquisitions: {},
    refurb: {},
    dueDiligence: {},
    handedOver: {},
    inventory: {}
  };
  applyUpdate(property, body);
  return property;
}

async function handleProperties(req: Request, id: string, action: string) {
  if (req.method === "GET" && !id) {
    return Response.json(await loadProperties());
  }

  if (req.method === "POST" && !id) {
    const body = await req.json();
    if (!body.propertyAddress || !String(body.propertyAddress).trim()) {
      return Response.json({ error: "propertyAddress is required" }, { status: 400 });
    }
    const properties = await loadProperties();
    const property = newProperty(body);
    properties.push(property);
    await saveProperties(properties);
    return Response.json(property, { status: 201 });
  }

  if (req.method === "PATCH" && id && !action) {
    const body = await req.json();
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
    const properties = await loadProperties();
    const next = properties.filter((p) => p.id !== id);
    if (next.length === properties.length) return Response.json({ error: "not found" }, { status: 404 });
    await saveProperties(next);
    return new Response(null, { status: 204 });
  }

  return Response.json({ error: "not found" }, { status: 404 });
}

async function handlePortfolios(req: Request, id: string) {
  if (req.method === "GET" && !id) {
    return Response.json(await loadPortfolios());
  }

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

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
  const resource = parts[0];

  try {
    if (resource === "properties") {
      return await handleProperties(req, parts[1], parts[2]);
    }
    if (resource === "portfolios") {
      return await handlePortfolios(req, parts[1]);
    }
    return Response.json({ error: "not found" }, { status: 404 });
  } catch (err: any) {
    return Response.json({ error: err?.message || "server error" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/*"
};
