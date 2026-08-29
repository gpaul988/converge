import { db } from '../../db/index.js';
import { employers, employerOpenings } from '../../db/schema.js';
import { eq } from 'drizzle-orm';

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

async function loadEmployers() {
  const employerRows = await db.select().from(employers);
  const openingRows = await db.select().from(employerOpenings);
  return employerRows.map((e) => ({
    id: e.id,
    name: e.name,
    openings: openingRows.filter((o) => o.employerId === e.id).map((o) => o.position),
  }));
}

export default async function handler(req, res) {
  if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Rate limit' });

  if (req.method === 'GET') {
    try {
      return res.status(200).json({ employers: await loadEmployers() });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ employers: [] });
    }
  }

  if (req.method === 'POST') {
    const { pairs } = req.body || {};
    if (!Array.isArray(pairs) || pairs.length === 0) return res.status(400).json({ ok: false, error: 'No pairs' });
    if (pairs.length > 2000) return res.status(400).json({ ok: false, error: 'Too many rows' });

    try {
      const addedCompanies = new Set();
      for (const { company, position } of pairs) {
        if (!company) continue;
        const name = String(company).trim();
        if (!name) continue;
        addedCompanies.add(name.toLowerCase());

        let [existing] = await db.select().from(employers).where(eq(employers.name, name));
        if (!existing) {
          [existing] = await db.insert(employers).values({ name }).onConflictDoNothing().returning();
          if (!existing) [existing] = await db.select().from(employers).where(eq(employers.name, name));
        }

        const pos = String(position || '').trim();
        if (pos) {
          const existingOpenings = await db.select().from(employerOpenings).where(eq(employerOpenings.employerId, existing.id));
          const already = existingOpenings.some((o) => o.position.toLowerCase() === pos.toLowerCase());
          if (!already) await db.insert(employerOpenings).values({ employerId: existing.id, position: pos });
        }
      }

      return res.status(200).json({ ok: true, employers: await loadEmployers(), result: { addedCompanies: addedCompanies.size } });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}
