# SIGNAL//OS

Naira Music's creative, release, distribution and broadcast operating system.

## Organisation

- **Naira Music** — label, ownership, strategy and final release authority
- **NMC / Naira Music Cartel** — the artist collective and roster
- **NMC Signal** — radio, rotation and audience broadcast channel

## Architecture (current)

SIGNAL//OS runs **entirely on Cloudflare Pages** — there is **no Node/Render/Docker
backend** (the old server was retired). It is a static single-page app:

- `index.html`, `app.js` and the `*.css` files — the dashboard UI (served as static assets).
- `functions/api/[[path]].js` — a **Cloudflare Pages Function** that serves `/api/*`.
  It is a thin proxy to WordPress (`nairamusic.com`) using a server-side signal key,
  plus a synthesized `/api/health`, the `/api/state` ↔ WP `os-state` sync, an
  `/api/ai/generate` proxy to Anthropic, and a composed `/api/radio/status`.

State persists in a WordPress option (`nmcsignal/v1/os-state`) and in the browser,
so it is shared across devices; the browser also keeps a local snapshot.

## Local preview

It is a static site, so any static server works, e.g.:

```powershell
npx serve .
```

Open the printed URL. The `/api/*` routes only work when deployed to Cloudflare Pages
(or via `npx wrangler pages dev .`), because they run as Pages Functions.

## Deployment

Deployment is **git push** — Cloudflare Pages auto-builds `main`:

```powershell
git push origin main
```

Set these in the Pages project → **Settings → Variables and Secrets** (never commit them;
`.env*` are git-ignored):

- `NMC_SIGNAL_KEY` (secret) — the `X-Signal-Key` the WP `nmcsignal` endpoints expect.
- `WP_BASE_URL` (plain) — e.g. `https://nairamusic.com`.
- `ANTHROPIC_API_KEY` (secret) — enables the Studio AI songwriter (`/api/ai/generate`).

## Modules

Command, Catalogue, Studio (Suno/Kling/DistroKid launcher + logger), NMC Signal (radio),
A&R, Artists and Settings.

## Security posture (honest state)

- Secrets (`NMC_SIGNAL_KEY`, `ANTHROPIC_API_KEY`) live only in the Pages environment and
  are never returned to the browser.
- **The `/api/*` proxy does not authenticate the caller** — it attaches the server key to
  every request. Because this is a static SPA, a client-side password cannot protect it.
  **Access control should be enforced with Cloudflare Access** (Zero Trust) in front of the
  Pages project, restricting `signal.nairamusic.com` to authorised accounts. Until that is
  configured, treat all `/api/*` data as reachable by anyone who knows the URL.
- Unconnected services remain in dry-run / handoff mode (responses carry `dryRun`/`stub`).
- Suno has no external API — the Studio is a prompt-builder + manual logger, not auto-generation.
- Live delivery remains subject to QC, rights, media, metadata and human approvals.

## Connectors

Live actions use the WordPress connector (via `NMC_SIGNAL_KEY`). Suno, YouTube, Meta and
TikTok are assisted/manual until an approved API integration exists. DistroKid remains a
controlled operator handoff. Test publishing with WordPress drafts and private/unlisted
social content first.
