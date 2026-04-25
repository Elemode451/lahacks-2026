-- SeraTune Supabase Schema
-- Run this in the Supabase SQL Editor to set up the database.

-- ── Profiles ────────────────────────────────────────────────────────────────
-- Extends Supabase auth.users with app-specific fields.

CREATE TABLE IF NOT EXISTS profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id, display_name)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', ''));
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Songs (catalog) ────────────────────────────────────────────────────────
-- Stores metadata + fingerprints for songs in the recommendation catalog.
-- Creator-uploaded songs do NOT go here.

CREATE TABLE IF NOT EXISTS songs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spotify_id TEXT UNIQUE,
    youtube_url TEXT,
    title TEXT NOT NULL,
    artist TEXT NOT NULL DEFAULT 'Unknown',
    album TEXT,
    album_art_url TEXT,
    fingerprint FLOAT8[],       -- cortical fingerprint vector (~20484 floats)
    region_scores JSONB,         -- per-region summary scores
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_songs_spotify_id ON songs(spotify_id);

-- ── Analyses ───────────────────────────────────────────────────────────────
-- Stores both creator analyses and listener cluster analyses.

CREATE TABLE IF NOT EXISTS analyses (
    id TEXT PRIMARY KEY,
    owner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    kind TEXT NOT NULL CHECK (kind IN ('creator', 'listener_cluster')),
    title TEXT NOT NULL DEFAULT 'Untitled',
    payload JSONB NOT NULL DEFAULT '{}',
    share_slug TEXT UNIQUE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analyses_owner ON analyses(owner_id);
CREATE INDEX IF NOT EXISTS idx_analyses_share_slug ON analyses(share_slug);

-- ── Row Level Security ─────────────────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE songs ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own
CREATE POLICY profiles_select ON profiles FOR SELECT USING (true);
CREATE POLICY profiles_update ON profiles FOR UPDATE USING (auth.uid() = user_id);

-- Songs: public read, service-key write
CREATE POLICY songs_select ON songs FOR SELECT USING (true);
CREATE POLICY songs_insert ON songs FOR INSERT WITH CHECK (true);

-- Analyses: owner can CRUD, shared analyses are public-read
CREATE POLICY analyses_select ON analyses FOR SELECT
    USING (owner_id = auth.uid() OR share_slug IS NOT NULL);
CREATE POLICY analyses_insert ON analyses FOR INSERT
    WITH CHECK (owner_id = auth.uid());
CREATE POLICY analyses_update ON analyses FOR UPDATE
    USING (owner_id = auth.uid());
CREATE POLICY analyses_delete ON analyses FOR DELETE
    USING (owner_id = auth.uid());
