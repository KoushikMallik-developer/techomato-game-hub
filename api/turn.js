// Vercel serverless function: returns TURN servers for WebRTC without exposing the Metered key to the browser.
// Set METERED_TURN_URL (server-only, no VITE_ prefix) to https://<app>.metered.live/api/v1/turn/credentials?apiKey=<key>
export default async function handler(req, res) {
  const url = process.env.METERED_TURN_URL;
  if (!url) return res.status(500).json({ error: 'METERED_TURN_URL is not set' });
  try {
    const r = await fetch(url);
    if (!r.ok) return res.status(502).json({ error: `TURN provider returned ${r.status}` });
    const list = await r.json();
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(list);
  } catch {
    return res.status(502).json({ error: 'Could not reach the TURN provider' });
  }
}
