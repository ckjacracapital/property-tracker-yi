# Supabase setup

The portal's data (properties, portfolios, staff logins, activity, stage timing)
and property photos now live in Supabase instead of Netlify Blobs.
The API (`netlify/functions/api.mts`) talks to it through `netlify/functions/lib/db.mts`
using the **service-role key, server-side only** — the browser never sees a Supabase key.

## One-time setup

1. **Create a project** at https://supabase.com/dashboard (free tier is fine).
   Pick the region closest to your users (London for UK). Save the database password somewhere safe.
2. **Create the tables + photo bucket:** Dashboard → *SQL Editor* → *New query* →
   paste the contents of `supabase/schema.sql` → *Run*. (Safe to re-run.)
3. **Copy two values** from Dashboard → *Project Settings* → *API*:
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **`service_role` secret key** (NOT the `anon` key). Treat it like a password.
4. **Add them in Netlify** → Site configuration → Environment variables:

   | Name | Value | Secret? |
   |---|---|---|
   | `SUPABASE_URL` | the Project URL | no |
   | `SUPABASE_SERVICE_ROLE_KEY` | the `service_role` key | **yes** |
   | `SITE_USER` | `jacra` (or your admin username) | no |
   | `SITE_PASSWORD` | your admin password | yes |

   `SITE_USER`/`SITE_PASSWORD` are only used to create the first admin login when the
   `staff_users` table is empty (i.e. the first time you log in after the switch).
   Once you've logged in, you can delete `SITE_PASSWORD`.
5. **Merge the `supabase-integration` branch into `main`** (or trigger a deploy of it).
   Log in with the admin credentials, then re-create any other staff logins from *Manage staff*.

## Notes

- Data starts **empty** — nothing was migrated from Netlify Blobs.
- Row Level Security is on for every table with no policies, so the public `anon` key can't read or write anything.
- Photos are stored in the private `property-images` bucket and served back through the
  portal's own authenticated `/api/images/:id` route, so they are not publicly reachable.
- Each property is its own row, so simultaneous edits to *different* properties no longer overwrite each other.
