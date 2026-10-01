// How calls reach Agora.
//
// Direct (UDP) gives the best quality, but some networks (certain ISPs, mobile
// carriers, VPNs, office firewalls) drop large UDP packets: audio gets through,
// video never arrives. Agora's cloud proxy relays media over TCP/TLS port 443,
// which works on those networks. In "auto" mode a call starts direct and both
// sides switch to the relay if media doesn't arrive; the device then remembers
// its network needed it for a few days.
//
// VITE_CALL_RELAY: 'auto' (default) | 'always' | 'never'

export const RELAY_PROXY_MODE = 5; // Agora: force TCP (TLS 443) cloud proxy
// Time the other side's media gets to arrive. Healthy connections deliver it within 1–2 s.
export const MEDIA_CHECK_MS = 5000;

const MODE = String(import.meta.env.VITE_CALL_RELAY || 'auto').toLowerCase();
const KEY = 'chatCallRelayAt';
const REMEMBER_MS = 3 * 24 * 60 * 60 * 1000;

const remembered = () => {
  try {
    const at = Number(localStorage.getItem(KEY));
    return at > 0 && Date.now() - at < REMEMBER_MS;
  } catch {
    return false;
  }
};

export const relayAllowed = () => MODE !== 'never';
export const startWithRelay = () => MODE === 'always' || (MODE === 'auto' && remembered());
export const rememberRelay = () => {
  try { localStorage.setItem(KEY, String(Date.now())); } catch { /* storage unavailable */ }
};
