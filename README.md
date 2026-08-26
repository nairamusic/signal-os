# SIGNAL//OS

Naira Music's creative, release, distribution and broadcast operating system.

## Organisation

- **Naira Music** — label, ownership, strategy and final release authority
- **NMC / Naira Music Cartel** — the artist collective and roster
- **NMC Signal** — radio, rotation and audience broadcast channel

## Local operation

Requires Node.js 22 or newer.

```powershell
npm start
```

Open `http://127.0.0.1:4173`. Local mode binds only to loopback and does not require a password.

## Production container

1. Copy `.env.production.example` into the secure deployment environment.
2. Replace `SIGNAL_ADMIN_PASSWORD` with a long unique secret.
3. Keep provider tokens in the hosting platform's secret manager.
4. Start with `docker compose up --build -d`.

Compose publishes only to host loopback. Place an HTTPS reverse proxy or private access gateway in front for remote access.

Persistent state and uploaded media use the `signal_os_data` volume. Back up that volume alongside SIGNAL//OS recovery exports.

## Modules

Command, Artist Bible, Track DNA, Suno Engine, BLACK SIGNAL QC, Rights Ledger, Release Pipeline, NMC Signal, Automation, Distribution, Insights, Governance, Asset Vault, Splits, DSP Metadata, Integrations, Release Preflight and Operator Manual.

## Security

- Secure HTTP headers and a restrictive Content Security Policy are enabled.
- Password protection activates whenever `SIGNAL_ADMIN_PASSWORD` is set.
- Non-local startup is refused without an administrator password.
- Secrets remain server-side and are omitted from exports and browser storage.
- Unconnected services remain in dry-run or handoff mode.
- Live delivery remains subject to QC, rights, media, metadata and human approvals.

## Connectors

Live actions require credentials for Suno, NairaMusic.com/WordPress, YouTube, Meta and TikTok. DistroKid remains a controlled operator handoff unless Naira Music obtains an approved partner integration.

## Adding credentials later

Put credentials in `.env` for local operation or `.env.production` for deployment, then restart SIGNAL//OS. `npm start` loads `.env` and an optional `.env.local` automatically. The Integrations Console reports only whether each required value exists; it never returns secret values to the browser. Spotify audio delivery remains routed through DistroKid.

Test publishing with WordPress drafts and private or unlisted social/video content first.
