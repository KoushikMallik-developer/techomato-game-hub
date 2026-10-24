// Change the site name here.
export const SITE_NAME = 'Techomato Game Hub';
export const TAGLINE = 'Play instantly. No downloads.';

// Online play (peer-to-peer). Players connect directly; the signalling server only introduces them.
// The default is the free public PeerJS server. To run your own: `npx peerjs --port 9000` and set
// signalUrl to 'wss://your-host:9000/peerjs?key=peerjs'.
// Some networks (strict mobile/office NATs) block direct connections; adding a TURN server fixes that,
// e.g. { urls: 'turn:your-turn-host:3478', username: '...', credential: '...' }.
export const NET = {
  signalUrl: 'wss://0.peerjs.com/peerjs?key=peerjs',
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:global.stun.twilio.com:3478' },
  ],
  maxPlayers: 10,
};

// Where public files (covers, models, textures) are served from.
export const assetBase = () => (typeof window !== 'undefined' && window.GAMEHUB_ASSETS) || (import.meta.env && import.meta.env.BASE_URL) || '/';
