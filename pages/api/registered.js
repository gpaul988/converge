import { db } from '../../db/index.js';
import { registrationCounts } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';

const LIMIT_WINDOW_MS = 60 * 1000;
const LIMIT_COUNT = 30;
const rateMap = new Map();
function rateLimit(req) {
  const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'local';
  const now = Date.now();
  const entry = rateMap.get(ip) || { count: 0, expires: now + LIMIT_WINDOW_MS };
  if (now > entry.expires) entry.count = 0, entry.expires = now + LIMIT_WINDOW_MS;
  entry.count++;
  rateMap.set(ip, entry);
  return entry.count <= LIMIT_COUNT;
}

async function loadRegistered() {
  const rows = await db.select().from(registrationCounts);
  const registered = { attendee: 0, jobseeker: 0 };
  rows.forEach((r) => { registered[r.kind] = r.count; });
  return registered;
}

export default async function handler(req, res) {
  if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Rate limit' });
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const { kind, delta } = req.body || {};
  if (!['attendee', 'jobseeker'].includes(kind)) return res.status(400).json({ ok: false, error: 'Invalid kind' });
  const d = Number(delta || 0);
  if (Number.isNaN(d) || d <= 0 || d > 1000000) return res.status(400).json({ ok: false, error: 'Invalid delta' });

  try {
    await db.insert(registrationCounts)
      .values({ kind, count: d })
      .onConflictDoUpdate({ target: registrationCounts.kind, set: { count: sql`${registrationCounts.count} + ${d}` } });
    return res.status(200).json({ ok: true, registered: await loadRegistered() });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
}
