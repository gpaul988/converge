-- Run this SQL in your Supabase SQL editor to create the app_state table.

CREATE TABLE IF NOT EXISTS app_state (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Insert an initial empty value if desired
INSERT INTO app_state (key, value) VALUES ('converge', '{"employers": [], "registered": {"attendee": 0, "jobseeker": 0}, "checkins": []}')
ON CONFLICT (key) DO NOTHING;
