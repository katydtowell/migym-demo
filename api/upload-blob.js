// Returns the Blob storage token so the client can upload directly
// to Vercel Blob's API (bypasses serverless function payload limits)

// ── Allowed origin for CORS ──
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '*';

// ── Simple in-memory rate limiter (per serverless instance) ──
const rateMap = new Map();
const RATE_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_MAX = 10;              // max 10 token requests per minute per IP

function isRateLimited(ip) {
  const now = Date.now();
  const entry = rateMap.get(ip);
  if (!entry || now - entry.windowStart > RATE_WINDOW_MS) {
    rateMap.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count++;
  if (entry.count > RATE_MAX) return true;
  return false;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Rate limiting
  const ip = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
  if (isRateLimited(ip)) {
    return res.status(429).json({ error: 'Too many requests. Please wait and try again.' });
  }

  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) {
    return res.status(500).json({ error: 'Blob storage not configured' });
  }

  return res.status(200).json({ token });
};
