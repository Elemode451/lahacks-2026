-- Migration: Add song_cache table for TRIBE inference caching.
-- Run this in the Supabase SQL Editor.
--
-- If you already created the old version of this table, drop it first:
--   DROP TABLE IF EXISTS song_cache;

CREATE TABLE IF NOT EXISTS song_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lookup_key TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL DEFAULT 'Unknown',
    artist TEXT NOT NULL DEFAULT 'Unknown',
    fingerprints_b64gz TEXT NOT NULL,
    fingerprint_id TEXT,
    preds_shape INT[] NOT NULL,
    region_scores JSONB NOT NULL,
    peak_index INT DEFAULT 0,
    inference_time_s FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_song_cache_lookup ON song_cache(lookup_key);

ALTER TABLE song_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY song_cache_select ON song_cache FOR SELECT USING (true);
CREATE POLICY song_cache_insert ON song_cache FOR INSERT WITH CHECK (true);
CREATE POLICY song_cache_update ON song_cache FOR UPDATE USING (true);
