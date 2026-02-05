-- Lobbies table
CREATE TABLE IF NOT EXISTS lobbies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(6) NOT NULL UNIQUE,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_game', 'finished')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Lobby members table
CREATE TABLE IF NOT EXISTS lobby_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id UUID NOT NULL REFERENCES lobbies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(lobby_id, user_id)
);

-- Games table
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    lobby_id UUID NOT NULL REFERENCES lobbies(id),
    state JSONB NOT NULL,
    state_version INTEGER NOT NULL DEFAULT 0,
    current_turn_user_id UUID REFERENCES auth.users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'finished')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE lobbies ENABLE ROW LEVEL SECURITY;
ALTER TABLE lobby_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Lobbies policies
CREATE POLICY "Users can view lobbies they are members of" ON lobbies
    FOR SELECT USING (
        id IN (SELECT lobby_id FROM lobby_members WHERE user_id = auth.uid())
        OR owner_id = auth.uid()
    );

CREATE POLICY "Authenticated users can create lobbies" ON lobbies
    FOR INSERT WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Lobby owners can update their lobbies" ON lobbies
    FOR UPDATE USING (auth.uid() = owner_id);

-- Lobby members policies
CREATE POLICY "Users can view lobby members" ON lobby_members
    FOR SELECT USING (
        lobby_id IN (SELECT lobby_id FROM lobby_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Users can join lobbies" ON lobby_members
    FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can leave lobbies" ON lobby_members
    FOR DELETE USING (auth.uid() = user_id);

-- Games policies
CREATE POLICY "Users can view games they are part of" ON games
    FOR SELECT USING (
        lobby_id IN (SELECT lobby_id FROM lobby_members WHERE user_id = auth.uid())
    );

CREATE POLICY "Lobby owners can create games" ON games
    FOR INSERT WITH CHECK (
        lobby_id IN (SELECT id FROM lobbies WHERE owner_id = auth.uid())
    );

CREATE POLICY "Current turn player can update game" ON games
    FOR UPDATE USING (
        current_turn_user_id = auth.uid() OR
        lobby_id IN (SELECT id FROM lobbies WHERE owner_id = auth.uid())
    );

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE lobbies;
ALTER PUBLICATION supabase_realtime ADD TABLE lobby_members;
ALTER PUBLICATION supabase_realtime ADD TABLE games;

