import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

const DATA_PATH = path.join(process.cwd(), 'data', 'state.json');
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);
let supabase = null;
if (USE_SUPABASE) supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const IS_NETLIFY = process.env.NETLIFY === 'true';
const ALLOW_FILE_PERSIST = process.env.ALLOW_FILE_PERSIST === 'true';

// basic in-memory rate limiter (IP -> {count, expires})
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

function readState() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] };
  }
}

function writeState(state) {
  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('writeState error', e);
    return false;
  }
}

export default async function handler(req, res) {
  if (!rateLimit(req)) return res.status(429).json({ ok: false, error: 'Rate limit' });

  if (IS_NETLIFY && !ALLOW_FILE_PERSIST && !USE_SUPABASE) {
    if (req.method === 'GET') {
      return res.status(200).json({ employers: [], warning: 'Deployed on Netlify: file persistence disabled. Configure SUPABASE_URL/SUPABASE_KEY or set ALLOW_FILE_PERSIST=true for ephemeral writes.' });
    }
    if (req.method === 'POST') {
      return res.status(501).json({ ok: false, error: 'Persistence disabled in serverless environment. Configure Supabase or set ALLOW_FILE_PERSIST=true (not recommended).' });
    }
  }

  if (req.method === 'GET') {    if (USE_SUPABASE) {
      try {
        const { data, error } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
        if (error || !data) return res.status(200).json({ employers: [] });
        const state = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
        return res.status(200).json({ employers: state.employers || [] });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ employers: [] });
      }
    }
    const state = readState();
    return res.status(200).json({ employers: state.employers || [] });
  }

  if (req.method === 'POST') {

    const { pairs } = req.body || {};
    if (!Array.isArray(pairs) || pairs.length === 0) return res.status(400).json({ ok: false, error: 'No pairs' });
    // sanitize and limit
    if (pairs.length > 2000) return res.status(400).json({ ok: false, error: 'Too many rows' });

    if (USE_SUPABASE) {
      try {
        const current = await (async () => {
          const { data } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
          return (data && (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)) || { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] };
        })();
        const next = { ...current };
        next.employers = next.employers ? [...next.employers] : [];
        pairs.forEach(({ company, position }) => {
          if (!company) return;
          const name = String(company).trim();
          let existing = next.employers.find((e) => e.name.toLowerCase() === name.toLowerCase());
          if (!existing) {
            existing = { id: Date.now() + Math.floor(Math.random()*1000), name, openings: [] };
            next.employers.push(existing);
          }
          const pos = String(position || '').trim();
          if (pos && !existing.openings.some((o) => o.toLowerCase() === pos.toLowerCase())) existing.openings.push(pos);
        });
        const { error } = await supabase.from('app_state').upsert({ key: 'converge', value: JSON.stringify(next) }, { onConflict: 'key' });
        if (error) throw error;
        return res.status(200).json({ ok: true, employers: next.employers, result: { addedCompanies: new Set(pairs.map(p=>String(p.company||'').toLowerCase())).size } });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ ok: false });
      }
    }

    // file fallback
    try {
      const state = readState();
      const next = { ...state };
      next.employers = next.employers ? [...next.employers] : [];
      pairs.forEach(({ company, position }) => {
        if (!company) return;
        const name = String(company).trim();
        let existing = next.employers.find((e) => e.name.toLowerCase() === name.toLowerCase());
        if (!existing) {
          existing = { id: Date.now() + Math.floor(Math.random()*1000), name, openings: [] };
          next.employers.push(existing);
        }
        const pos = String(position || '').trim();
        if (pos && !existing.openings.some((o) => o.toLowerCase() === pos.toLowerCase())) existing.openings.push(pos);
      });
      writeState(next);
      return res.status(200).json({ ok: true, employers: next.employers, result: { addedCompanies: new Set(pairs.map(p=>String(p.company||'').toLowerCase())).size } });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}