-- Create the friends table for the friend-list feature.
-- Each row represents a one-way friendship: user_id follows friend_id.
-- To make friendships mutual, insert a row in each direction.

CREATE TABLE IF NOT EXISTS friends (
    id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    friend_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    created_at  timestamptz DEFAULT now() NOT NULL,

    CONSTRAINT friends_no_self CHECK (user_id <> friend_id),
    CONSTRAINT friends_unique UNIQUE (user_id, friend_id)
);

-- Index for fast lookups: "who are my friends?"
CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);

-- Index for the feed query: "which of my friends analyzed a song recently?"
CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);

-- RLS: Only the owning user can read/write their own friend rows.
ALTER TABLE friends ENABLE ROW LEVEL SECURITY;

CREATE POLICY friends_select ON friends FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY friends_insert ON friends FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY friends_delete ON friends FOR DELETE USING (auth.uid() = user_id);
