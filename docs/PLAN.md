# Zil development plan

## Phase 1: the map (this repository)

Goal: a public beta on Google Play and the web with the full prototype interface, real data from services, live updates and community spots. Target: about 16 weeks with you plus one front-end/3D contractor.

| Sprint (2 weeks) | Deliverable | Done when |
| --- | --- | --- |
| 0 | Setup: repo, CI (lint, build, container images), staging environment, Play Console app entry | `docker compose up` works for everyone; staging deploys on every merge |
| 1 | Catalog service + content model; first 50 places in English and French | `/v1/places` serves real content; content editor workflow agreed |
| 2 | Frontend port of the prototype (done in this repo), performance pass on a low-end Android phone | 30+ fps on the low-end test phone; first load under 3 s on 4G |
| 3 | Live service + ops tool for posting updates; partner onboarding for 10 places | Updates reach phones in under 2 s |
| 4 | Spots service + moderation tool (small internal web page on top of the moderation API) | A new spot is reviewed within 24 h |
| 5 | Production map tiles (MapLibre + MapTiler/PMTiles) under the toon layer, offline caching | Street-level zoom on top of the toon island |
| 6 | Android app: Capacitor shell, splash screen, push notifications, Play listing | Internal test track live |
| 7 | Closed test (20 testers, 14+ days), fixes, privacy policy, Data Protection Office registration | Production access granted |
| 8 | Launch | Public on Play Store and web |

### Phase 1 definition of done

- The same UI on phone, tablet and desktop (checked by `tools/e2e-check.py` and on real devices).
- p95 API latency under 200 ms; app crash-free sessions above 99.5%.
- Accessibility: keyboard navigation, screen-reader labels on pins and buttons, reduced-motion support (already wired).
- Security: admin token in a secret store, HTTPS only, rate limits on the gateway, dependency scanning in CI.

## Phase 2: earn

- **booking-service:** Viator affiliate API first, then direct operators with Peach Payments; webhooks; operator licence records.
- **assistant-service (Dodo):** LLM with retrieval over catalog + live data; tool calls for routes and availability; per-user caps.
- **ar-service + assets:** model-viewer/WebXR scenes for 3–5 landmarks; scenes stored as assets in the catalog `extras` field.
- **accounts-service:** sign-in (email/Google/Apple) to replace the anonymous device id; spots and plans follow the user.
- iOS app from the same Capacitor project.

Each arrives as a new service behind the gateway plus a frontend module behind its feature flag, without changes to Phase 1 services.

## Phase 3: scale

Hotel concierge white-label (tenant config on the frontend), sponsored pins (catalog `extras` + a billing service), aggregated insights, German and more languages, residents' features.
