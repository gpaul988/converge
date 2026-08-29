import { db } from '../../db/index.js';
import { checkins } from '../../db/schema.js';
import { desc } from 'drizzle-orm';

const LIMIT_WINDOW_MS = 60 * 1000;
const LIMIT_COUNT = 60;
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

export default async function handler(req, res) {
  if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Rate limit' });

  if (req.method === 'GET') {
    try {
      const rows = await db.select().from(checkins).orderBy(desc(checkins.id)).limit(2000);
      return res.status(200).json({ checkins: rows });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ checkins: [] });
    }
  }

  if (req.method === 'POST') {
    const record = req.body || {};
    const hasName = typeof record.name === 'string' && record.name.trim().length > 0;
    const hasCode = typeof record.code === 'string' && /^CF001/i.test(record.code.trim());
    const phoneDigits = (String(record.phone || record.name || '')).replace(/\D/g, '');
    const hasPhone = phoneDigits.length >= 7;
    if (!hasName && !hasCode && !hasPhone) return res.status(400).json({ ok: false, error: 'Provide a name, CF001... code, or phone number' });
    if (!['attendee', 'jobseeker', 'employer'].includes(record.type)) return res.status(400).json({ ok: false, error: 'Invalid type' });

    const rec = {
      name: hasName ? String(record.name).trim() : (hasPhone ? String(record.phone || record.name).trim() : String(record.code).trim()),
      code: hasCode ? String(record.code).trim() : null,
      phone: hasPhone ? String(record.phone || record.name).trim() : null,
      type: record.type,
      position: String(record.position || '').trim(),
      company: String(record.company || '').trim(),
      matchedEmployer: record.matchedEmployer || null,
      matchedPosition: record.matchedPosition || null,
      checkinTime: record.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    try {
      const [created] = await db.insert(checkins).values(rec).returning();
      const rows = await db.select().from(checkins).orderBy(desc(checkins.id)).limit(2000);
      return res.status(200).json({ ok: true, checkins: rows, created });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}
