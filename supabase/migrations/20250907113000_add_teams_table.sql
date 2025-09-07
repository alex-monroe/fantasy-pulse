CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    team_key TEXT NOT NULL,
    team_id TEXT NOT NULL,
    name TEXT NOT NULL,
    logo_url TEXT,
    user_integration_id INTEGER NOT NULL REFERENCES user_integrations(id) ON DELETE CASCADE,
    league_id TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE teams
ADD CONSTRAINT unique_team_key UNIQUE (team_key);
