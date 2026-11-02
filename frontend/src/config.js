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
  // Demo traveller position (Pereybère) until device location is added in phase 2.
  youLatLon: [-20.003, 57.598],
  requestTimeoutMs: 6000
};
