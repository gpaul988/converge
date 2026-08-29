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

// simple rate limiter
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
    return res.status(501).json({ ok: false, error: 'Writes disabled on Netlify without SUPABASE configured. Set SUPABASE_URL/SUPABASE_KEY or ALLOW_FILE_PERSIST=true.' });
  }
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).end('Method Not Allowed');
  }

  const { kind, delta } = req.body || {};
  if (!['attendee', 'jobseeker'].includes(kind)) return res.status(400).json({ ok: false, error: 'Invalid kind' });
  const d = Number(delta || 0);
  if (Number.isNaN(d) || d <= 0 || d > 1000000) return res.status(400).json({ ok: false, error: 'Invalid delta' });


  if (USE_SUPABASE) {
    try {
      const { data } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
      const state = (data && (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)) || { registered: { attendee: 0, jobseeker: 0 } };
      state.registered = state.registered || { attendee: 0, jobseeker: 0 };
      state.registered[kind] = (state.registered[kind] || 0) + d;
      const { error } = await supabase.from('app_state').upsert({ key: 'converge', value: JSON.stringify(state) }, { onConflict: 'key' });
      if (error) throw error;
      return res.status(200).json({ ok: true, registered: state.registered });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  try {
    const state = readState();
    state.registered = state.registered || { attendee: 0, jobseeker: 0 };
    state.registered[kind] = (state.registered[kind] || 0) + d;
    writeState(state);
    return res.status(200).json({ ok: true, registered: state.registered });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ ok: false });
  }
}
