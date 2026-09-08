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
  "site/submissions":      { wp: "/wp-json/nmcsignal/v1/submissions",      methods: ["GET"] },
  "site/submissions-full": { wp: "/wp-json/nmcsignal/v1/submissions-full", methods: ["GET"] },
  "site/artists":          { wp: "/wp-json/nmcsignal/v1/artists",          methods: ["GET"] },
  "site/artist-push":      { wp: "/wp-json/nmcsignal/v1/artist-push",      methods: ["POST"] },
  "site/track-save":       { wp: "/wp-json/nmcsignal/v1/track-save",       methods: ["POST"] },
  "site/track-delete":     { wp: "/wp-json/nmcsignal/v1/track-delete",     methods: ["POST"] },
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

  // Signal//OS saved state <-> WordPress option (os-state). The app GETs to load and
  // PUTs to save; os-state serves GET/POST, so map any write (PUT/POST) to a POST.
  // Keeps state synced with the website (persisted in WP, shared across devices).
  if (path === "state") {
    const method = request.method === "GET" ? "GET" : "POST";
    const init = { method, headers: { Accept: "application/json" } };
    if (key) init.headers["X-Signal-Key"] = key;
    if (method !== "GET") { init.headers["Content-Type"] = "application/json"; init.body = await request.text(); }
    try {
      const r = await fetch(base + "/wp-json/nmcsignal/v1/os-state", init);
      const text = await r.text();
      return new Response(text, { status: r.ok ? 200 : r.status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
    } catch (e) {
      return json({ error: String(e && (e.message || e)) }, 502);
    }
  }

  // Radio now-playing panel. The frontend reads d.radio.current_item / next_item /
  // playlist_length / current_show and d.track_count. WP's nmcsignal/v1/status only
  // returns A&R sync data, so compose the real radio state from the nmc-radio endpoints.
  if (path === "radio/status") {
    const wp = (p, hdr) => fetch(base + p, { headers: hdr || { Accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null);
    const [now, playlistRaw, sched, statusData] = await Promise.all([
      wp("/wp-json/nmc-radio/v1/now"),
      wp("/wp-json/nmc-radio/v1/playlist"),
      wp("/wp-json/nmc-radio/v1/schedule/current"),
      key ? wp("/wp-json/nmcsignal/v1/status", { "X-Signal-Key": key, Accept: "application/json" }) : Promise.resolve(null),
    ]);
    const list = Array.isArray(playlistRaw) ? playlistRaw : (playlistRaw && playlistRaw.playlist) || [];
    const cur = now || {};
    const norm = (s) => (s || "").toString().trim().toLowerCase();
    let idx = list.findIndex((t) => norm(t.title) === norm(cur.title));
    const en = idx >= 0 ? list[idx] : {};
    const current_item = cur.title ? {
      title: cur.title,
      artist_name: cur.artist || en.artist || "",
      genre: en.genre && en.genre !== "track" ? en.genre : (cur.genre && cur.genre !== "track" ? cur.genre : ""),
      bpm: en.bpm || null,
      duration: en.duration || null,
      cover: cur.cover || en.cover || "",
    } : null;
    const nx = idx >= 0 && list.length ? list[(idx + 1) % list.length] : (list[0] || null);
    const next_item = nx ? { title: nx.title || "", artist_name: nx.artist || "" } : {};
    let remaining = 0;
    if (current_item && en.duration && cur.started_at) {
      const startMs = Date.parse(String(cur.started_at).replace(" ", "T") + "Z");
      if (!isNaN(startMs)) {
        const elapsed = (Date.now() - startMs) / 1000;
        remaining = Math.max(0, Math.round(en.duration - (((elapsed % en.duration) + en.duration) % en.duration)));
      } else remaining = en.duration;
    }
    const radio = {
      current_item,
      next_item,
      remaining,
      playlist_length: list.length,
      current_show: sched && sched.current ? { name: sched.current.name } : null,
    };
    const pending = statusData && Array.isArray(statusData.pending) ? statusData.pending : [];
    return json({ radio, track_count: list.length, pending });
  }

  // Automation "Record & Push" → create a DRAFT nmc_track on WordPress from the
  // Suno output (title/artist/genre/bpm + audio URL). Reuses the track-save endpoint.
  if (path === "publish" && request.method === "POST") {
    if (!key) return json({ ok: true, result: null, dryRun: true, message: "NMC_SIGNAL_KEY not configured" });
    const body = await request.json().catch(() => ({}));
    const wpBody = {
      title: body.title || "Untitled",
      artist_name: body.artist || "",
      genre: body.genre || "",
      bpm: body.bpm || "",
      audio_url: body.suno_url || "",
      status: "draft",
    };
    try {
      const r = await fetch(base + "/wp-json/nmcsignal/v1/track-save", {
        method: "POST",
        headers: { "X-Signal-Key": key, "Content-Type": "application/json" },
        body: JSON.stringify(wpBody),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) return json({ ok: false, error: "WP " + r.status }, 502);
      return json({ ok: true, result: { id: j.id, editUrl: base + "/wp-admin/post.php?post=" + j.id + "&action=edit" } });
    } catch (e) {
      return json({ ok: false, error: String(e && (e.message || e)) }, 502);
    }
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
