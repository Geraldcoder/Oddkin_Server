# Oddkin server

This folder is an independent JavaScript Express API. It stores explicit waitlist opt-ins in MongoDB and sends one daily CSV digest to the project inbox after SMTP is configured. It does not send bulk newsletter campaigns to subscribers.

## Run locally

Use Node.js 20.19 or newer. From this folder:

```sh
npm install
```

Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell; `cp .env.example .env` in macOS/Linux shells) and set `MONGODB_URI`. A local MongoDB service or a MongoDB Atlas URI is required for signup persistence. Then run:

```sh
npm run dev
```

The API listens on port `4000` by default. `GET /api/health` reports process/database state. `POST /api/waitlist` accepts `{ "email": "person@example.com", "consent": true }`; addresses are normalized, deduplicated by a unique MongoDB index, and limited to 100 attempts per IP per 15 minutes. The API returns a service-unavailable response when MongoDB is not connected; it never reports an unsaved signup as successful.

The IP rate limit uses an in-memory store for a single server instance. If the Node host sits behind a reverse proxy, set `TRUST_PROXY=true` so it sees the originating address; leave it false for a direct local process. Before running multiple API instances, use a shared rate-limit store.

## Daily digest

The digest job runs once a day using `DIGEST_CRON` and `DIGEST_TIMEZONE` (default: 08:00 UTC). `ADMIN_NOTIFICATION_EMAIL` defaults in the example to `geradug99@gmail.com`. The address is read only by the server and is never included in the frontend bundle. Fill in `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, and `SMTP_FROM` with credentials from an SMTP provider; without them, signups remain stored and no digest is marked as sent. Keep SMTP credentials and `MONGODB_URI` in this server's ignored `.env` file, never in `client/.env`.

Run one server instance with the built-in cron scheduler. If deploying multiple API instances, move the digest to a single scheduler/worker before enabling it, to avoid duplicate digests.

To create a CSV of all consented addresses for importing into a newsletter provider, run:

```sh
npm run export:subscribers
```

The export is written under the ignored `exports/` directory. Subscriber newsletter broadcasts and unsubscribe management are intentionally deferred until a provider is selected; the frontend states that no campaign will be sent before unsubscribe controls are ready. Do not send bulk campaigns directly through the owner inbox.
