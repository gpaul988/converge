/*
Node script to import local data/state.json into Supabase app_state (key='converge').
Usage (local):
  set SUPABASE_URL=your_url
  set SUPABASE_KEY=your_key
  node scripts/importState.js

Make sure the `app_state` table exists (run SUPABASE_SCHEMA.sql in Supabase SQL editor).
*/

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY env variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const DATA_PATH = path.join(process.cwd(), 'data', 'state.json');

(async () => {
  try {
    if (!fs.existsSync(DATA_PATH)) {
      console.error('Local data/state.json not found at', DATA_PATH);
      process.exit(1);
    }
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    const state = JSON.parse(raw);
    const payload = { key: 'converge', value: JSON.stringify(state) };
    const { error } = await supabase.from('app_state').upsert(payload, { onConflict: 'key' });
    if (error) {
      console.error('Supabase upsert error:', error);
      process.exit(1);
    }
    console.log('Imported local state to Supabase (key=converge)');
  } catch (e) {
    console.error('Error importing state:', e);
    process.exit(1);
  }
})();
