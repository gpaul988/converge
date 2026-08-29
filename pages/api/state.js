import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// If deployed on Netlify as serverless functions, the filesystem is ephemeral.
// Detect Netlify and refuse writes unless explicitly enabled via ALLOW_FILE_PERSIST.
const IS_NETLIFY = process.env.NETLIFY === 'true';
const ALLOW_FILE_PERSIST = process.env.ALLOW_FILE_PERSIST === 'true';

const DATA_PATH = path.join(process.cwd(), 'data', 'state.json');

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_KEY = process.env.SUPABASE_KEY || '';
const USE_SUPABASE = !!(SUPABASE_URL && SUPABASE_KEY);
let supabase = null;
if (USE_SUPABASE) supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

async function readState() {
  if (USE_SUPABASE) {
    try {
      const { data, error } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
      if (error) {
        // If table missing or no row, fallback to empty
        console.warn('Supabase readState warning', error.message || error);
        return { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] };
      }
      return typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
    } catch (e) {
      console.error('Supabase readState error', e);
      return { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] };
    }
  }

  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] };
  }
}

async function writeState(state) {
  if (IS_NETLIFY && !ALLOW_FILE_PERSIST && !USE_SUPABASE) {
    // don't attempt to write on Netlify by default
    console.warn('Attempted file write on Netlify; ALLOW_FILE_PERSIST not set.');
    return false;
  }

  if (USE_SUPABASE) {
    try {
      const payload = { key: 'converge', value: JSON.stringify(state) };
      const { error } = await supabase.from('app_state').upsert(payload, { onConflict: 'key' });
      if (error) {
        console.error('Supabase writeState error', error);
        return false;
      }
      return true;
    } catch (e) {
      console.error('Supabase writeState exception', e);
      return false;
    }
  }

  try {
    fs.writeFileSync(DATA_PATH, JSON.stringify(state, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('writeState error', e);
    return false;
  }
}

export default async function handler(req, res) {
  if (IS_NETLIFY && !ALLOW_FILE_PERSIST && !USE_SUPABASE) {
    // Informative responses to avoid silent failures when deployed serverless
    if (req.method === 'GET') {
      return res.status(200).json({ employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [], warning: 'Deployed on Netlify: file persistence is disabled. Configure Supabase and set SUPABASE_URL/SUPABASE_KEY, or set ALLOW_FILE_PERSIST=true for ephemeral writes.' });
    }
    if (req.method === 'POST') {
      return res.status(501).json({ ok: false, error: 'Persistence disabled in serverless environment. Configure Supabase or set ALLOW_FILE_PERSIST=true (not recommended for production).' });
    }
  }

  if (req.method === 'GET') {
    const state = await readState();
    return res.status(200).json(state);
  }
  if (req.method === 'POST') {
    // require admin password for snapshot writes
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
    const headerPass = req.headers['x-admin-password'] || '';
    if (ADMIN_PASSWORD && headerPass !== ADMIN_PASSWORD) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }
    try {
      const body = req.body;
      // Body expected to contain employers, registered, checkins
      const current = await readState();
      const next = {
        employers: Array.isArray(body.employers) ? body.employers : current.employers,
        registered: body.registered || current.registered,
        checkins: Array.isArray(body.checkins) ? body.checkins : current.checkins,
      };
      const ok = await writeState(next);
      if (!ok) throw new Error('Could not persist state');
      return res.status(200).json({ ok: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false, error: 'Could not persist state' });
    }
  }
  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}
