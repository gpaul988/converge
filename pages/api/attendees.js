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

function readState() {
  try {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [], attendees: [] };
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
  if (IS_NETLIFY && !ALLOW_FILE_PERSIST && !USE_SUPABASE) {
    if (req.method === 'GET') return res.status(200).json({ attendees: [], warning: 'Deployed on Netlify: file persistence disabled. Configure Supabase.' });
    if (req.method === 'POST') return res.status(501).json({ ok: false, error: 'Writes disabled in serverless environment. Configure Supabase or set ALLOW_FILE_PERSIST=true.' });
  }

  if (req.method === 'GET') {
    if (USE_SUPABASE) {
      try {
        const { data } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
        const state = (data && (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)) || {};
        return res.status(200).json({ attendees: state.attendees || [] });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ attendees: [] });
      }
    }
    const state = readState();
    return res.status(200).json({ attendees: state.attendees || [] });
  }

  if (req.method === 'POST') {
    const { attendees } = req.body || {};
    if (!Array.isArray(attendees)) return res.status(400).json({ ok: false, error: 'Invalid attendees' });

    if (USE_SUPABASE) {
      try {
        const { data } = await supabase.from('app_state').select('value').eq('key', 'converge').single();
        const state = (data && (typeof data.value === 'string' ? JSON.parse(data.value) : data.value)) || {};
        state.attendees = attendees;
        const { error } = await supabase.from('app_state').upsert({ key: 'converge', value: JSON.stringify(state) }, { onConflict: 'key' });
        if (error) throw error;
        return res.status(200).json({ ok: true, attendees: state.attendees });
      } catch (e) {
        console.error(e);
        return res.status(500).json({ ok: false });
      }
    }

    try {
      const state = readState();
      state.attendees = attendees;
      writeState(state);
      return res.status(200).json({ ok: true, attendees: state.attendees });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ ok: false });
    }
  }

  res.setHeader('Allow', ['GET', 'POST']);
  res.status(405).end('Method Not Allowed');
}
