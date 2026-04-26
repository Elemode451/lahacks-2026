CREATE TABLE IF NOT EXISTS spotify_tokens (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    spotify_user_id TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE spotify_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY spotify_tokens_select ON spotify_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY spotify_tokens_service ON spotify_tokens FOR ALL USING (true);
