-- This migration adds a composite unique constraint to the leagues table
-- to ensure that a league is unique per user integration.
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_league_id_user_integration_id_unique" UNIQUE ("league_id", "user_integration_id");
