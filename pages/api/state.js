import { db } from '../../db/index.js';
import { checkins, employers, employerOpenings, registrationCounts } from '../../db/schema.js';
import { desc } from 'drizzle-orm';

async function readState() {
  const [checkinRows, employerRows, openingRows, registeredRows] = await Promise.all([
    db.select().from(checkins).orderBy(desc(checkins.id)).limit(2000),
    db.select().from(employers),
    db.select().from(employerOpenings),
    db.select().from(registrationCounts),
  ]);

  const registered = { attendee: 0, jobseeker: 0 };
  registeredRows.forEach((r) => { registered[r.kind] = r.count; });

  return {
    checkins: checkinRows,
    employers: employerRows.map((e) => ({
      id: e.id,
      name: e.name,
      openings: openingRows.filter((o) => o.employerId === e.id).map((o) => o.position),
    })),
    registered,
  };
}

async function writeState(next) {
  await db.transaction(async (tx) => {
    if (Array.isArray(next.employers)) {
      await tx.delete(employerOpenings);
      await tx.delete(employers);
      for (const e of next.employers) {
        const name = String(e.name || '').trim();
        if (!name) continue;
        const [inserted] = await tx.insert(employers).values({ name }).returning();
        const openings = Array.isArray(e.openings) ? e.openings : [];
        for (const position of openings) {
          const pos = String(position || '').trim();
          if (pos) await tx.insert(employerOpenings).values({ employerId: inserted.id, position: pos });
        }
      }
    }

    if (next.registered && typeof next.registered === 'object') {
      for (const kind of ['attendee', 'jobseeker']) {
        const count = Number(next.registered[kind] || 0);
        await tx.insert(registrationCounts)
          .values({ kind, count })
          .onConflictDoUpdate({ target: registrationCounts.kind, set: { count } });
      }
    }

    if (Array.isArray(next.checkins)) {
      await tx.delete(checkins);
      for (const c of next.checkins) {
        if (!c || !c.type) continue;
        await tx.insert(checkins).values({
          name: String(c.name || '').trim() || 'Unknown',
          code: c.code || null,
          phone: c.phone || null,
          type: c.type,
          position: String(c.position || ''),
          company: String(c.company || ''),
          matchedEmployer: c.matchedEmployer || null,
          matchedPosition: c.matchedPosition || null,
          checkinTime: c.time || null,
        });
      }
    }
  });
}

export default async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      return res.status(200).json(await readState());
    } catch (e) {
      console.error(e);
      return res.status(500).json({ employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] });
    }
  }

  if (req.method === 'POST') {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
    const headerPass = req.headers['x-admin-password'] || '';
    if (ADMIN_PASSWORD && headerPass !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    try {
      await writeState(req.body || {});
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not persist state' });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}
