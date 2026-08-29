/*
Initialize an empty converge state row in Supabase if missing.
Usage:
  set SUPABASE_URL=your_url
  set SUPABASE_KEY=your_key
  node scripts/initState.js
*/

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_KEY env variables.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

(async () => {
  try {
    const initial = { employers: [], registered: { attendee: 0, jobseeker: 0 }, checkins: [] };
    const payload = { key: 'converge', value: JSON.stringify(initial) };
    const { error } = await supabase.from('app_state').upsert(payload, { onConflict: 'key' });
    if (error) {
      console.error('Supabase upsert error:', error);
      process.exit(1);
    }
    console.log('Initialized app_state converge row in Supabase');
  } catch (e) {
    console.error('Error initializing state:', e);
    process.exit(1);
  }
})();
