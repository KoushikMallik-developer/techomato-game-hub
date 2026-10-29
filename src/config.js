// Change the site name here.
export const SITE_NAME = 'Techomato Games';
export const TAGLINE = 'Free 3D games that run in your browser. No downloads.';

// Online play (peer-to-peer). Players connect directly; the signalling server only introduces them.
// The default is the free public PeerJS server. To run your own: `npx peerjs --port 9000` and set
// signalUrl to 'wss://your-host:9000/peerjs?key=peerjs'.
// Some networks (strict mobile/office NATs) block direct connections; adding a TURN server fixes that,
// e.g. { urls: 'turn:your-turn-host:3478', username: '...', credential: '...' }.
//
// To make rooms work from any network, set METERED_TURN_URL (server-only, no VITE_ prefix) in Vercel
// (Project Settings > Environment Variables, then redeploy) or in .env for `npm run dev`:
//   METERED_TURN_URL=https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
// api/turn.js (and a dev middleware in vite.config.js) fetch it server-side, so the key never reaches the browser.
// Or point VITE_TURN_API_URL at any URL returning an iceServers JSON array, or use a static server:
//   VITE_TURN_URLS (comma separated, e.g. turn:host:3478,turns:host:443?transport=tcp)
//      VITE_TURN_USERNAME, VITE_TURN_CREDENTIAL
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const turnUrls = (env.VITE_TURN_URLS || '').split(',').map((s) => s.trim()).filter(Boolean);

// The public PeerJS server is only a fallback: when accounts (Firebase) are on and the player is signed in, the
// handshake goes through Firestore instead (see src/games/shared/net.js). Setting VITE_SIGNAL_URL forces that server.
export const DEFAULT_SIGNAL = 'wss://0.peerjs.com/peerjs?key=peerjs';
export const NET = {
  signalUrl: env.VITE_SIGNAL_URL || DEFAULT_SIGNAL,
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
    ...(turnUrls.length ? [{ urls: turnUrls, username: env.VITE_TURN_USERNAME, credential: env.VITE_TURN_CREDENTIAL }] : []),
  ],
  turnApiUrl: env.VITE_TURN_API_URL || '/api/turn', // served by api/turn.js on Vercel, keeps the Metered key private
  maxPlayers: 10,
};

// Where public files (covers, models, textures) are served from.
export const assetBase = () => (typeof window !== 'undefined' && window.GAMEHUB_ASSETS) || (import.meta.env && import.meta.env.BASE_URL) || '/';
