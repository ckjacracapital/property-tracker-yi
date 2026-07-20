import type { Context, Config } from "@netlify/functions";
import { getStore } from "@netlify/blobs";

// The four stages a property moves through, in order, matching the
// Acquisitions & Legals Tracker sheet's tabs.
const STAGES = ["acquisitions_legals", "refurb_payment", "due_diligence", "handed_over"];

// Editable fields, matching the sheet's columns.
const FIELDS = [
  "portfolio", "propertyAddress", "status", "pictures", "floorplan", "refurbRequired",
  "agentName", "agentContact", "bedrooms", "propertyUsage",
  "targetedRent", "netYield", "valuationAt8", "totalCapitalLoan",
  "purchasePrice", "refurbCost", "utilities", "certs", "yiMargin",
  "stampDuty", "fees", "legals", "comms", "notes"
];

const KEY = "properties";

function propertiesStore() {
  return getStore("property-tracker");
}

async function loadProperties(): Promise<any[]> {
  const data = await propertiesStore().get(KEY, { type: "json" });
  return data || [];
}

async function saveProperties(properties: any[]) {
  await propertiesStore().setJSON(KEY, properties);
}

function applyFields(target: any, body: any) {
  for (const field of FIELDS) {
    if (body[field] !== undefined) target[field] = body[field];
  }
}

export default async (req: Request, context: Context) => {
  const url = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);

  if (parts[0] !== "properties") {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const id = parts[1];
  const action = parts[2];

  try {
    if (req.method === "GET" && !id) {
      const properties = await loadProperties();
      return Response.json(properties);
    }

    if (req.method === "POST" && !id) {
      const body = await req.json();
      if (!body.propertyAddress || !String(body.propertyAddress).trim()) {
        return Response.json({ error: "propertyAddress is required" }, { status: 400 });
      }
      const properties = await loadProperties();
      const now = new Date().toISOString();
      const property: any = {
        id: crypto.randomUUID(),
        stage: STAGES[0],
        stageHistory: {},
        createdAt: now,
        updatedAt: now
      };
      for (const field of FIELDS) property[field] = "";
      applyFields(property, body);
      properties.push(property);
      await saveProperties(properties);
      return Response.json(property, { status: 201 });
    }

    if (req.method === "PATCH" && id && !action) {
      const body = await req.json();
      const properties = await loadProperties();
      const property = properties.find((p) => p.id === id);
      if (!property) return Response.json({ error: "not found" }, { status: 404 });
      applyFields(property, body);
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
      if (idx < STAGES.length - 1) property.stage = STAGES[idx + 1];
      property.updatedAt = now;
      await saveProperties(properties);
      return Response.json(property);
    }

    if (req.method === "POST" && id && action === "reopen") {
      const properties = await loadProperties();
      const property = properties.find((p) => p.id === id);
      if (!property) return Response.json({ error: "not found" }, { status: 404 });
      if (property.stageHistory[property.stage]) {
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
  } catch (err: any) {
    return Response.json({ error: err?.message || "server error" }, { status: 500 });
  }
};

export const config: Config = {
  path: "/api/*"
};
