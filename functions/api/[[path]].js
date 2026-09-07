// Cloudflare Pages Function: serves /api/* for SIGNAL//OS entirely on Cloudflare.
// The site-data + radio routes are thin proxies to WordPress (nairamusic.com) using
// a server-side signal key, so no Render backend / cold-start is involved.
//
// Env vars (set in Pages project → Settings → Variables and Secrets):
//   NMC_SIGNAL_KEY  (secret)  – the X-Signal-Key the WP nmcsignal endpoints expect
//   WP_BASE_URL     (plain)   – e.g. https://nairamusic.com  (optional; defaults below)

const DEFAULT_WP_BASE = "https://nairamusic.com";

// Map an incoming /api/... path to the WordPress REST endpoint it proxies.
function wpTarget(path) {
  switch (path) {
    case "site/submissions": return "/wp-json/nmcsignal/v1/submissions";
    case "site/artists":     return "/wp-json/nmcsignal/v1/artists";
    case "site/catalogue":   return "/wp-json/nmcsignal/v1/catalogue";
    case "site/shop":        return "/wp-json/nmcsignal/v1/shop-stats";
    case "site/artist-push": return "/wp-json/nmcsignal/v1/artist-push";
    case "radio/playlist":   return "/wp-json/nmc-radio/v1/playlist";
    case "radio/listeners":  return "/wp-json/nmc-radio/v1/listeners/count";
    default: return null;
  }
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

  const target = wpTarget(path);

  // Routes that need the stateful Render backend (state, jobs, campaigns, publish,
  // assets, suno) are not implemented here — return a clear, non-breaking stub.
  if (!target) {
    return json({ error: "Not served by Cloudflare Function", path: `/api/${path}` }, 404);
  }

  if (!key) {
    // Mirror the backend's dry-run shape so the UI degrades gracefully.
    return json({ dryRun: true, message: "NMC_SIGNAL_KEY not configured", submissions: [], artists: [], tracks: [], count: 0 });
  }

  const url = new URL(request.url);
  const wpUrl = base + target + (url.search || "");

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
