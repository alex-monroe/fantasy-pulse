ALTER TABLE user_integrations
ADD COLUMN access_token TEXT,
ADD COLUMN refresh_token TEXT,
ADD COLUMN token_type TEXT;
