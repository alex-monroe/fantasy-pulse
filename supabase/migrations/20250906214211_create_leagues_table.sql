CREATE TABLE leagues (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  league_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  user_integration_id BIGINT NOT NULL REFERENCES user_integrations(id),
  season TEXT NOT NULL,
  total_rosters INT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
