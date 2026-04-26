-- Migration: Add user_recommendations table for tracking shown recommendations
-- and enabling collaborative filtering ("users like you also like").
-- Run this in the Supabase SQL Editor.

-- Tracks which songs have been recommended to each user (for de-duplication).
CREATE TABLE IF NOT EXISTS user_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    song_key TEXT NOT NULL,          -- lookup_key from song_cache
    source TEXT NOT NULL DEFAULT 'brain_similarity',  -- 'brain_similarity' | 'collaborative'
    similarity_score FLOAT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_recs_user ON user_recommendations(user_id);
CREATE INDEX IF NOT EXISTS idx_user_recs_song ON user_recommendations(song_key);
CREATE INDEX IF NOT EXISTS idx_user_recs_user_song ON user_recommendations(user_id, song_key);

-- Tracks which songs each user has analyzed (for collaborative filtering).
-- The analyses table already stores full payloads, but this is a lightweight
-- join table optimized for the "users who analyzed song X also analyzed song Y" query.
CREATE TABLE IF NOT EXISTS user_song_interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    song_key TEXT NOT NULL,          -- lookup_key from song_cache
    interaction_type TEXT NOT NULL DEFAULT 'analyzed',  -- 'analyzed' | 'saved'
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, song_key, interaction_type)
);

CREATE INDEX IF NOT EXISTS idx_user_songs_user ON user_song_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_songs_song ON user_song_interactions(song_key);

-- RLS
ALTER TABLE user_recommendations ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_interactions ENABLE ROW LEVEL SECURITY;

-- Users can read their own recommendations
-- Backend filters by user_id in queries; RLS is permissive to allow
-- the anon/service client to read without user-scoped auth context.
CREATE POLICY user_recs_select ON user_recommendations FOR SELECT USING (true);
CREATE POLICY user_recs_insert ON user_recommendations FOR INSERT WITH CHECK (true);

-- User song interactions: public read (needed for collaborative filtering), service-key write
CREATE POLICY user_songs_select ON user_song_interactions FOR SELECT USING (true);
CREATE POLICY user_songs_insert ON user_song_interactions FOR INSERT WITH CHECK (true);
