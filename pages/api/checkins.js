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
      return res.status(200).json({ checkins: [], warning: 'Deployed on Netlify: file persistence disabled. Configure SUPABASE_URL/SUPABASE_KEY or set ALLOW_FILE_PERSIST=true for ephemeral writes.' });
    }
    if (req.method === 'POST') {
      return res.status(501).json({ ok: false, error: 'Persistence disabled in serverless environment. Configure Supabase or set ALLOW_FILE_PERSIST=true (not recommended).' });
    }
  }

  if (req.method === 'GET') {    if (USE_SUPABASE) {
      try {
        const { data } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
        const state = (data && (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)) || { checkins: [] };
        return res.status(200).json({ checkins: state.checkins || [] });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ checkins: [] });
      }
    }
    const state = readState();
    return res.status(200).json({ checkins: state.checkins || [] });
  }

  if (req.method === 'POST') {
      const record = req.body || {};
      // validation: allow name OR code (CF001...) OR phone
      const hasName = typeof record.name === 'string' && record.name.trim().length > 0;
      const hasCode = typeof record.code === 'string' && /^CF001/i.test(record.code.trim());
      const phoneDigits = (String(record.phone || record.name || '')).replace(/\D/g, '');
      const hasPhone = phoneDigits.length >= 7;
      if (!hasName && !hasCode && !hasPhone) return res.status(400).json({ ok: false, error: 'Provide a name, CF001... code, or phone number' });
      if (!['attendee', 'jobseeker', 'employer'].includes(record.type)) return res.status(400).json({ ok: false, error: 'Invalid type' });
      // sanitize - prefer explicit name, fallback to phone/code for display
      const rec = {
        id: record.id || Date.now(),
        time: record.time || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        name: hasName ? String(record.name).trim() : (hasPhone ? String(record.phone || record.name).trim() : String(record.code).trim()),
        code: hasCode ? String(record.code).trim() : null,
        phone: hasPhone ? String(record.phone || record.name).trim() : null,
        type: record.type,
        position: String(record.position || '').trim(),
        company: String(record.company || '').trim(),
        matchedEmployer: record.matchedEmployer || null,
        matchedPosition: record.matchedPosition || null,
      };

      if (USE_SUPABASE) {
      try {
        const { data } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
        const state = (data && (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)) || { checkins: [] };
        state.checkins = state.checkins || [];
        state.checkins.unshift(rec);
        // cap history to reasonable size
        if (state.checkins.length > 2000) state.checkins = state.checkins.slice(0, 2000);
        const { error } = await supabase.from('app_state').upsert({ key: 'converge', value: JSON.stringify(state) }, { onConflict: 'key' });
        if (error) throw error;
        return res.status(200).json({ ok: true, checkins: state.checkins, created: rec });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ ok: false });
      }
    }

    try {
      const state = readState();
      state.checkins = state.checkins || [];
      state.checkins.unshift(rec);
      if (state.checkins.length > 2000) state.checkins = state.checkins.slice(0, 2000);
      writeState(state);
      return res.status(200).json({ ok: true, checkins: state.checkins, created: rec });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}
