// Cloudflare Pages Function: serves /api/* for SIGNAL//OS entirely on Cloudflare.
// The site-data + radio routes are thin proxies to WordPress (nairamusic.com) using
// a server-side signal key, so no Render backend / cold-start is involved.
//
// Env vars (set in Pages project → Settings → Variables and Secrets):
//   NMC_SIGNAL_KEY  (secret)  – the X-Signal-Key the WP nmcsignal endpoints expect
//   WP_BASE_URL     (plain)   – e.g. https://nairamusic.com  (optional; defaults below)

const DEFAULT_WP_BASE = "https://nairamusic.com";

// Static path → { wp: WordPress endpoint, methods: allowed }.
const ROUTES = {
  // Signal//OS saved state lives in a WordPress option (os-state) — no Render needed.
  "state":                 { wp: "/wp-json/nmcsignal/v1/os-state",         methods: ["GET", "POST"] },
  "site/submissions":      { wp: "/wp-json/nmcsignal/v1/submissions",      methods: ["GET"] },
  "site/submissions-full": { wp: "/wp-json/nmcsignal/v1/submissions-full", methods: ["GET"] },
  "site/artists":          { wp: "/wp-json/nmcsignal/v1/artists",          methods: ["GET"] },
  "site/artist-push":      { wp: "/wp-json/nmcsignal/v1/artist-push",      methods: ["POST"] },
  "site/catalogue":        { wp: "/wp-json/nmcsignal/v1/catalogue",        methods: ["GET"] },
  "site/shop":             { wp: "/wp-json/nmcsignal/v1/shop-stats",       methods: ["GET"] },
  "radio/status":          { wp: "/wp-json/nmcsignal/v1/status",           methods: ["GET"] },
  "radio/publish":         { wp: "/wp-json/nmcsignal/v1/publish",          methods: ["POST"] },
  "radio/playlist":        { wp: "/wp-json/nmc-radio/v1/playlist",         methods: ["GET"] },
  "radio/listeners":       { wp: "/wp-json/nmc-radio/v1/listeners/count",  methods: ["GET"] },
};

// Resolve a request path to a WordPress endpoint (handles the dynamic review route too).
function resolve(path) {
  const review = path.match(/^site\/submissions\/(\d+)\/review$/);
  if (review) return { wp: `/wp-json/nmcsignal/v1/submissions/${review[1]}/review`, methods: ["POST"] };
  return ROUTES[path] || null;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function onRequest(context) {
  const { request, env, params } = context;
  const path = Array.isArray(params.path) ? params.path.join("/") : String(params.path || "");
  const base = (env.WP_BASE_URL || DEFAULT_WP_BASE).replace(/\/+$/, "");
  const key = env.NMC_SIGNAL_KEY || "";

  // Synthesized health (no Node backend). WordPress connector is live (we proxy to it);
  // Suno is manual (no external API). Shape must match what the frontend reads:
  // health.connectors.suno / .wordpress → {configured, mode}.
  if (path === "health") {
    return json({
      ok: true,
      mode: "live",
      storage: { configured: true, backend: "wordpress-option" },
      connectors: {
        wordpress: { configured: true, mode: "live" },
        suno: { configured: false, mode: "manual" },
      },
    });
  }

  const url = new URL(request.url);
  const route = resolve(path);

  // Not a WP-proxy route. There is NO Render/Node backend — Signal//OS runs entirely
  // on Cloudflare. Return a graceful, non-throwing stub so client-only/manual modules
  // (jobs, assets, campaigns, Suno prompt-builder) degrade to "empty" instead of erroring.
  if (!route) {
    return json({ ok: true, stub: true, note: "Served by Cloudflare (stateless); no backend for this route", jobs: [], assets: [], items: [], count: 0 });
  }
  if (!route.methods.includes(request.method)) {
    return json({ error: "Method not allowed", path: `/api/${path}` }, 405);
  }
  if (!key) {
    return json({ dryRun: true, message: "NMC_SIGNAL_KEY not configured", submissions: [], artists: [], tracks: [], playlist: [], count: 0 });
  }

  const wpUrl = base + route.wp + (url.search || "");

  const init = {
    method: request.method,
    headers: { "X-Signal-Key": key, "Accept": "application/json" },
  };
  if (!["GET", "HEAD"].includes(request.method)) {
    init.headers["content-type"] = request.headers.get("content-type") || "application/json";
    init.body = await request.text();
  }

  try {
    const r = await fetch(wpUrl, init);
    const text = await r.text();
    if (!r.ok) return json({ error: `WP ${r.status}`, detail: text.slice(0, 300) }, 502);
    return new Response(text, {
      status: 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
    });
  } catch (e) {
    return json({ error: String(e && e.message || e) }, 502);
  }
}
