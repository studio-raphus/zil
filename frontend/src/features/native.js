// Android/iOS app integration (Capacitor). Plugins are imported on demand, so the web build
// never loads them; on the web every function here is a no-op or returns false.
import { Capacitor } from '@capacitor/core';
import { bus } from '../core/bus.js';
import { store } from '../core/util.js';
import { config } from '../config.js';
import { api } from '../api/client.js';

export const isNative = () => Capacitor.isNativePlatform();
export const platform = () => Capacitor.getPlatform(); // 'android' | 'ios' | 'web'

/** Splash screen off once the map is up; Android back button closes things before leaving. */
export async function initNative({ onBack }) {
  if (!isNative()) return;
  const [{ SplashScreen }, { App }] = await Promise.all([import('@capacitor/splash-screen'), import('@capacitor/app')]);
  SplashScreen.hide({ fadeOutDuration: 250 }).catch(() => {});
  App.addListener('backButton', () => { if (!onBack()) App.minimizeApp(); });
  initPush({ ask: false }); // re-register silently if alerts were allowed before
}

// ---------- Google sign-in (Credential Manager on Android) ----------
let socialReady = null;
export async function nativeGoogleSignIn() {
  const { SocialLogin } = await import('@capgo/capacitor-social-login');
  if (!config.googleWebClientId) throw new Error('VITE_GOOGLE_WEB_CLIENT_ID is not set for this build');
  socialReady ??= SocialLogin.initialize({ google: { webClientId: config.googleWebClientId } });
  await socialReady;
  const res = await SocialLogin.login({ provider: 'google', options: { scopes: ['email', 'profile'] } });
  const idToken = res?.result?.idToken;
  if (!idToken) throw new Error('Google didn’t return an ID token');
  return api.nativeSignIn(idToken); // { user, created }
}
export async function nativeGoogleSignOut() {
  try { const { SocialLogin } = await import('@capgo/capacitor-social-login'); await SocialLogin.logout({ provider: 'google' }); } catch { /* not signed in natively */ }
}

// ---------- GPS ----------
export async function nativeGeolocation() {
  const { Geolocation } = await import('@capacitor/geolocation');
  return Geolocation;
}

// ---------- push notifications (FCM) ----------
export const alertsOn = () => !!store.get('zil.alerts', false);
export async function initPush({ ask }) {
  if (!isNative()) return false;
  const { PushNotifications } = await import('@capacitor/push-notifications');
  let perm = await PushNotifications.checkPermissions();
  if (perm.receive === 'prompt' && ask) perm = await PushNotifications.requestPermissions();
  if (perm.receive !== 'granted') { store.set('zil.alerts', false); return false; }
  if (!initPush.wired) {
    initPush.wired = true;
    if (platform() === 'android') await PushNotifications.createChannel({ id: 'live', name: 'Live on the island', description: 'Big events, weather and closures', importance: 4, visibility: 1 }).catch(() => {});
    PushNotifications.addListener('registration', t => api.registerPush(t.value, platform()).then(() => store.set('zil.pushToken', t.value)).catch(e => console.warn('[zil] push registration not saved', e.message)));
    PushNotifications.addListener('registrationError', e => console.warn('[zil] push registration failed', e.error));
    PushNotifications.addListener('pushNotificationReceived', n => bus.emit('snack', `${n.title}: ${n.body}`, 5000));
    PushNotifications.addListener('pushNotificationActionPerformed', a => { const id = a.notification?.data?.place_id; if (id) setTimeout(() => bus.emit('select', id), 600); });
  }
  await PushNotifications.register();
  store.set('zil.alerts', true);
  return true;
}
export async function stopPush() {
  const token = store.get('zil.pushToken', null);
  if (token) await api.unregisterPush(token).catch(() => {});
  try { const { PushNotifications } = await import('@capacitor/push-notifications'); await PushNotifications.unregister(); } catch { /* ignore */ }
  store.set('zil.alerts', false); store.set('zil.pushToken', null);
}
