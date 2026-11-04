# Zil — Phase 1

A playful 3D map of Mauritius: curated places, live updates and community spots, with the same toon/comic interface as the prototype, responsive from phones to desktops.

**Phase 1 scope:** 3D map, places, events and categories, search and filters, live status and the "Live now" strip (pushed in real time), community spots with moderation, your real location with road routes, street-level maps (also offline), day/night mode, Google sign-in, the Zil Studio admin portal, and the Android app with push notifications.
**Not in Phase 1:** bookings, AR and the Dodo assistant. Their buttons are behind feature flags (`VITE_FEATURE_BOOKING`, `VITE_FEATURE_AR`, `VITE_FEATURE_ASSISTANT`), so they can be switched on later without touching the layout.

```
┌──────────────── clients ─────────────────┐
│ Web / PWA    Android app (Capacitor)     │   Zil Studio (/admin, the team's portal)
└───────────────────┬──────────────────────┘
                    │ HTTPS, one origin
            ┌───────▼────────┐
            │  API gateway   │  nginx (or Kong, Traefik, cloud gateway, k8s Ingress)
            └┬──┬──┬──┬──┬──┬┘
 /api/catalog │  │  │  │  │  └ /tiles ─────► tiles (nginx: Mauritius PMTiles + fonts)
   /api/spots ┘  │  │  │  └─── /api/routing ► routing ─► osrm (Mauritius road network)
     /api/live ──┘  │  └────── /             ► frontend (app + /admin Studio)
 /api/accounts ─────┘
┌────────┐ ┌──────┐ ┌──────┐ ┌──────────┐
│catalog │ │spots │ │ live │ │ accounts │   Node 22 + Fastify, one container each
└───┬────┘ └──┬───┘ └──┬───┘ └────┬─────┘   live: LISTEN/NOTIFY → SSE fan-out; FCM push
┌───▼─────────▼────────▼──────────▼───┐
│ PostgreSQL 16 + PostGIS             │   one database per service
└─────────────────────────────────────┘
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
psql -U postgres -f db/init/01-databases.sql -f db/init/02-accounts.sql
cd services/catalog && npm i && DATABASE_URL=postgres://catalog_svc:catalog_dev@localhost:5432/zil_catalog PORT=3001 npm run dev
cd services/spots   && npm i && DATABASE_URL=postgres://spots_svc:spots_dev@localhost:5432/zil_spots ADMIN_TOKEN=dev PORT=3002 npm run dev
cd services/live    && npm i && DATABASE_URL=postgres://live_svc:live_dev@localhost:5432/zil_live ADMIN_TOKEN=dev PORT=3003 npm run dev
cd services/accounts && npm i && DATABASE_URL=postgres://accounts_svc:accounts_dev@localhost:5432/zil_accounts GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... PORT=3004 npm run dev
cd frontend && npm i && npm run build && cd .. && node tools/dev-gateway.mjs   # http://localhost:8080
```

**Frontend only:** `cd frontend && npm i && npm run dev`. If no backend answers, the app uses the bundled seed (`public/seed/places.json`) and shows an OFFLINE badge.

**Android:** see [Android app](#android-app) below.

**First build:** `docker compose up --build` now also builds two map images, which download data once:
- `osrm`: the Mauritius road network from Geofabrik (OpenStreetMap), prepared for routing (1–3 min).
- `tiles`: Mauritius cut out of the latest Protomaps basemap (street level, zoom 15) plus label fonts (a few minutes; tens of MB).

Refresh either with `docker compose build --no-cache osrm` / `tiles` (monthly is plenty).

## Sign in with Google (accounts service)

Users can sign in (or sign up on their first visit) with Google from the profile button at the top right. Zil stores only their **name and email** (plus Google's account id as the login key). Sessions are server-side, held in an HttpOnly `zil_sid` cookie for 30 days.

One-time setup:

1. In [Google Cloud Console](https://console.cloud.google.com/apis/credentials) → *Create credentials* → *OAuth client ID* → **Web application**.
2. Authorised redirect URI: `http://localhost:8080/api/accounts/v1/auth/google/callback` (add your staging/production URLs too, e.g. `https://zil.mu/api/accounts/v1/auth/google/callback`).
3. OAuth consent screen: app name *Zil*, scopes `openid`, `email`, `profile`. While in *Testing* mode, add your testers' Google accounts.
4. Put the values in `.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PUBLIC_URL` (the public origin, e.g. `http://localhost:8080`).
5. Existing database volume only: `docker compose exec -T db psql -U postgres < db/init/02-accounts.sql`, then `docker compose up --build`.

Without the Google keys the service still runs; the sign-in card says Google sign-in isn't configured.

## Zil Studio (admin portal)

Open **http://localhost:8080/admin** and sign in with Google. Studio is where the team manages everything people see on the map:

| Section | What it does |
| --- | --- |
| Places | Create and edit places in English and French: category, pin (click the island or paste a Google Maps link), visit info, tips, draft/published |
| Events | One-off or weekly events (night markets, festivals) at a place or at their own pin; shown on the map for the next 7 days with an *Events* filter |
| Live updates | Post a place's one-line status (pushed to every open app within a second), mark it hot, clear it; send push notifications to the Android app |
| Moderation | Community spots waiting for review: approve, reject, or promote to a full place |
| Team (admins) | Give people the *editor* or *admin* role |

**The first admin:** put your Google email in `.env` as `ADMIN_EMAILS=you@example.com` (comma-separated for several), restart `accounts`, then sign in at `/admin`. That account becomes an admin and can promote others in *Team*. The `ADMIN_TOKEN` still works for scripts (`Authorization: Bearer …`).

## Location, road routes and the street map

- **Your location:** the locate button asks once; "You" then follows your phone's GPS and routes start there. Outside Mauritius (or with location off), routes start from the airport. The position is only sent to the routing service as a route's start point.
- **Road routes:** *Directions* asks the `routing` service, Zil's own API in front of a self-hosted OSRM engine with the Mauritius road network. Distances and drive times are by road; the route is drawn along the roads on the 3D island and on the street map.
- **Street map:** zoom all the way into the island (or tap the map button) and a MapLibre street map takes over at the same spot, drawn from Zil's own tiles in Zil colours. Zoom back out to fly back to the island. In the street map, the download button saves the whole island map (tiles + fonts) on the device for offline use; a small service worker (`public/sw.js`) serves it when there's no signal.

## Android app

The `frontend/android/` project is committed (Capacitor 8). It has native Google sign-in (Credential Manager), native GPS, push notifications (FCM), the Zil icon and splash screens, and the Android back button wired to the sheet and street map.

**One-time setup**

1. **Android Studio** (latest) with JDK 21.
2. **Google sign-in:** in Google Cloud Console → Credentials → *Create OAuth client ID* → **Android**: package `mu.zil.app`, SHA-1 from `cd frontend/android && ./gradlew signingReport` (debug), and later the Play App Signing key's SHA-1 (Play Console → App integrity). The app uses your existing **web** client ID (below); the Android client only proves the APK is yours.
3. **Firebase (push):** in the [Firebase console](https://console.firebase.google.com) add Firebase to the same Google Cloud project, add an Android app `mu.zil.app`, download `google-services.json` to `frontend/android/app/`. For the backend: *Project settings → Service accounts → Generate new private key*, save as `secrets/firebase-service-account.json`, restart `live`.
4. **API from the phone:** the app calls the backend at `VITE_API_BASE`. For local testing with a USB phone: `adb reverse tcp:8080 tcp:8080` and use `http://localhost:8080`. Add `https://localhost` to `CORS_ORIGINS` (or keep `*`).

**Build and run**

```bash
cd frontend
npm install
VITE_API_BASE=http://localhost:8080/api VITE_TILES_BASE=http://localhost:8080/tiles \
VITE_GOOGLE_WEB_CLIENT_ID=<your web client id> npm run android:sync
npm run android:open            # Android Studio: Run on a phone, or Build › Generate Signed App Bundle
npm run android:assets          # only if you change the icon/splash sources in frontend/assets/
```

For a release, point `VITE_API_BASE` / `VITE_TILES_BASE` at your HTTPS domain. Play listing text and graphics are in [`docs/play/`](docs/play/). Personal Play accounts must run a closed test (12+ testers for 14 days) before production.

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
  accounts/         sign in with Google (web: OAuth code flow + PKCE; app: verified ID token), users (name + email), roles, sessions
  routing/          road routes API (src/) + OSRM engine image with the Mauritius road network (osrm/)
  tiles/            street-map tiles: Mauritius PMTiles cut from Protomaps + label fonts, served by nginx
frontend/
  src/core/         utils, icons, event bus, state
  src/api/          API client with offline fallback
  src/map/          three.js engine, geography, world, live 3D layer, routes
  src/features/     overlay pins, sheet, search, filters, live strip, spots, events, location, street map, account, native (Android)
  src/studio/       Zil Studio admin portal (admin/index.html): places, events, live, moderation, team
  assets/           icon + splash sources for the Android app (npm run android:assets)
  android/          Capacitor Android project
secrets/            git-ignored: Firebase service account for push
  src/styles/       the prototype's comic/Material styles
tools/              dev gateway (no Docker needed), headless smoke test
docs/               phase plan, OpenAPI contracts, Play Store listing (play/)
```

## Design rules (modular and agnostic)

- **One service per capability.** Each owns its database, has its own Dockerfile, health (`/health`) and readiness (`/ready`) probes, migrations and versioned routes (`/v1`). No service reads another's tables.
- **Config only through environment variables** (`DATABASE_URL`, `PORT`, `ADMIN_TOKEN`, `CORS_ORIGINS`). The same images run on Docker Compose, Kubernetes, ECS, Azure Container Apps, Cloud Run or a plain VM.
- **Contracts first.** Services talk HTTP/JSON documented in OpenAPI. Any service can be rewritten in another language behind the same contract.
- **Frontend features talk through an event bus**, not through each other. A feature (booking, AR, assistant) is a new module plus a flag.
- **Fallbacks everywhere.** The frontend works offline from the seed; the live stream reconnects by itself; the gateway rate-limits writes.

See [`docs/PLAN.md`](docs/PLAN.md) for the sprint plan and what comes next.
