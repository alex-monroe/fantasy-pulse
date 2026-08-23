-- ESPN has no OAuth flow for fantasy data; access is gated by two cookies
-- (espn_s2, swid) copied out of a logged-in browser session. Store them
-- alongside the existing OAuth token columns on fp_user_integrations rather
-- than adding an espn-specific table, since only one credential pair exists
-- per integration row, same as access_token/refresh_token for Yahoo.
ALTER TABLE fp_user_integrations
ADD COLUMN espn_s2 TEXT,
ADD COLUMN swid TEXT;
