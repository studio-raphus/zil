// Runtime configuration. Everything environment-specific comes from Vite env vars, so the
// same build works behind any gateway, CDN or inside the Capacitor Android shell.
export const config = {
  apiBase: (import.meta.env.VITE_API_BASE || '/api').replace(/\/$/, ''),
  // Phase 1 ships without these; the UI hides every entry point while a flag is false.
  features: {
    booking: import.meta.env.VITE_FEATURE_BOOKING === 'true',
    ar: import.meta.env.VITE_FEATURE_AR === 'true',
    assistant: import.meta.env.VITE_FEATURE_ASSISTANT === 'true'
  },
  // Where routes start when the device location is unknown, denied or outside Mauritius.
  fallbackStart: { lat: -20.4302, lon: 57.6836, label: 'the airport' },
  // Main island + nearby islets: a location outside this box counts as "not in Mauritius".
  islandBounds: { minLat: -20.6, maxLat: -19.85, minLon: 57.25, maxLon: 57.9 },
  // Street-level map (PMTiles + fonts from the tiles service, behind the gateway)
  // Google web client ID, used by native sign-in in the Android app (Credential Manager)
  googleWebClientId: import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID || '',
  tilesBase: (import.meta.env.VITE_TILES_BASE || '/tiles').replace(/\/$/, ''),
  requestTimeoutMs: 6000
};
