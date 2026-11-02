# Zil — Phase 1

A playful 3D map of Mauritius: curated places, live updates and community spots, with the same toon/comic interface as the prototype, responsive from phones to desktops.

**Phase 1 scope:** 3D map, places and categories, search and filters, live status and the "Live now" strip (pushed in real time), community spots with moderation, routes from your hotel, and day/night mode.
**Not in Phase 1:** bookings, AR and the Dodo assistant. Their buttons are behind feature flags (`VITE_FEATURE_BOOKING`, `VITE_FEATURE_AR`, `VITE_FEATURE_ASSISTANT`), so they can be switched on later without touching the layout.

```
┌──────────── clients ────────────┐
│ Web / PWA      Android (Capacitor shell, same build)
└───────────────┬─────────────────┘
                │ HTTPS, one origin
        ┌───────▼────────┐
        │  API gateway   │  nginx (or Kong, Traefik, cloud gateway, k8s Ingress)
        └─┬─────┬─────┬──┘
 /api/catalog /api/spots /api/live          / (static frontend)
   │          │          │
┌──▼───┐  ┌───▼──┐  ┌────▼──┐
│catalog│  │spots │  │ live  │   Node 22 + Fastify, one container each
└──┬───┘  └───┬──┘  └───┬───┘
   │          │         │   LISTEN/NOTIFY → SSE fan-out across replicas
┌──▼──────────▼─────────▼───┐
│ PostgreSQL 16 + PostGIS   │   one database per service (zil_catalog, zil_spots, zil_live)
└───────────────────────────┘
```

## Prerequisites

### Hardware

| For | Minimum | Recommended |
| --- | --- | --- |
| Development laptop | 4-core CPU, 16 GB RAM, 30 GB free SSD | 8-core, 32 GB RAM (Docker + Android Studio emulator together are heavy) |
| GPU | Integrated graphics with WebGL 2 | Any recent integrated/discrete GPU |
| Android test phones | One low-end phone (Android 10, 3 GB RAM) | Plus one mid-range phone (Android 13+). The low-end one tells you about real performance |
| iPhone (for checking Safari/PWA now, iOS app in phase 2) | Any iPhone on iOS 16+ | — |
| Staging/production server (Phase 1) | 2 vCPU, 4 GB RAM, 40 GB SSD VM + managed Postgres | Any cloud or a Mauritian host; it's all containers |

### Software

| Tool | Version | Why |
| --- | --- | --- |
| Git | 2.40+ | Source control (GitHub/GitLab) |
| Node.js | 22 LTS (20 works) | Services and frontend build |
| Docker Desktop / Docker Engine + Compose | 24+ | Runs the whole stack locally |
| PostgreSQL client (`psql`) | 16 | Database work, optional |
| Android Studio + JDK 17 | Latest stable | Building the Android app with Capacitor |
| VS Code (or IntelliJ) | — | Editor; ESLint, Docker and REST Client extensions help |
| Chrome / Firefox / Safari | Current | Testing; Chrome DevTools for device emulation |
| Python 3 + Playwright (optional) | — | `tools/e2e-check.py` smoke test |

Accounts: Google Play Console (you have it), a GitHub/GitLab org, a cloud account, a MapTiler key (production map tiles), and an error-monitoring service (for example Sentry).

## Run it

**With Docker (whole stack):**

```bash
cp .env.example .env
docker compose up --build
# open http://localhost:8080
```

**Without Docker** (Postgres 16 + PostGIS installed locally):

```bash
psql -U postgres -f db/init/01-databases.sql
cd services/catalog && npm i && DATABASE_URL=postgres://catalog_svc:catalog_dev@localhost:5432/zil_catalog PORT=3001 npm run dev
cd services/spots   && npm i && DATABASE_URL=postgres://spots_svc:spots_dev@localhost:5432/zil_spots ADMIN_TOKEN=dev PORT=3002 npm run dev
cd services/live    && npm i && DATABASE_URL=postgres://live_svc:live_dev@localhost:5432/zil_live ADMIN_TOKEN=dev PORT=3003 npm run dev
cd frontend && npm i && npm run build && cd .. && node tools/dev-gateway.mjs   # http://localhost:8080
```

**Frontend only:** `cd frontend && npm i && npm run dev`. If no backend answers, the app uses the bundled seed (`public/seed/places.json`) and shows an OFFLINE badge.

**Android:**

```bash
cd frontend
VITE_API_BASE=https://api.your-domain.mu/api npm run android:setup   # first time: installs Capacitor, adds android/
npm run android:sync && npm run android:open                        # build in Android Studio, run on a phone
```

Personal Play accounts must run a closed test (12+ testers for 14 days) before production.

## Try the live and moderation APIs

```bash
# push a live update: every open app updates its pin, glow and strip within a second
curl -XPOST localhost:8080/api/live/v1/status -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' -d '{"place_id":"flic","text":"Sunset in 20 min","hot":true}'

# moderation queue and approval for community spots
curl localhost:8080/api/spots/v1/moderation/queue -H 'Authorization: Bearer change-me'
curl -XPATCH localhost:8080/api/spots/v1/spots/<id>/status -H 'Authorization: Bearer change-me' \
  -H 'Content-Type: application/json' -d '{"status":"approved"}'
```

Full contracts are in [`docs/openapi.yaml`](docs/openapi.yaml).

## Repository layout

```
gateway/            nginx gateway config (routing, rate limits, SSE)
db/init/            creates one database + login per service
services/
  catalog/          categories + places (PostGIS: bbox and "near me" queries), seeded from seed/places.json
  spots/            community spots: create, list, delete own, moderation queue, approve/reject
  live/             status lines, feed, Server-Sent Events stream, admin updates
frontend/
  src/core/         utils, icons, event bus, state
  src/api/          API client with offline fallback
  src/map/          three.js engine, geography, world, live 3D layer, routes
  src/features/     overlay pins, sheet, search, filters, live strip, spots, chrome
  src/styles/       the prototype's comic/Material styles
tools/              dev gateway (no Docker needed), headless smoke test
docs/               phase plan, OpenAPI contracts
```

## Design rules (modular and agnostic)

- **One service per capability.** Each owns its database, has its own Dockerfile, health (`/health`) and readiness (`/ready`) probes, migrations and versioned routes (`/v1`). No service reads another's tables.
- **Config only through environment variables** (`DATABASE_URL`, `PORT`, `ADMIN_TOKEN`, `CORS_ORIGINS`). The same images run on Docker Compose, Kubernetes, ECS, Azure Container Apps, Cloud Run or a plain VM.
- **Contracts first.** Services talk HTTP/JSON documented in OpenAPI. Any service can be rewritten in another language behind the same contract.
- **Frontend features talk through an event bus**, not through each other. A feature (booking, AR, assistant) is a new module plus a flag.
- **Fallbacks everywhere.** The frontend works offline from the seed; the live stream reconnects by itself; the gateway rate-limits writes.

See [`docs/PLAN.md`](docs/PLAN.md) for the sprint plan and what comes next.
