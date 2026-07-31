import type { Context, Config } from "@netlify/edge-functions";

export default async (req: Request, context: Context) => {
  const expectedUser = Netlify.env.get("SITE_USER") || "jacra";
  const expectedPassword = Netlify.env.get("SITE_PASSWORD");

  if (!expectedPassword) {
    return context.next();
  }

  const auth = req.headers.get("authorization");
  if (auth) {
    const [scheme, encoded] = auth.split(" ");
    if (scheme === "Basic" && encoded) {
      const [user, password] = atob(encoded).split(":");
      if (user === expectedUser && password === expectedPassword) {
        return context.next();
      }
    }
  }

  return new Response("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Jacra Property Tracker"' }
  });
};

export const config: Config = {
  path: "/*"
};
