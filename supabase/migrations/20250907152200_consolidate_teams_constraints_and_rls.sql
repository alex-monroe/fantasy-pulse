-- Add the composite unique constraint to the teams table
ALTER TABLE "teams" ADD CONSTRAINT "teams_team_key_user_integration_id_unique" UNIQUE ("team_key", "user_integration_id");

-- Add a comprehensive RLS policy for the teams table
CREATE POLICY "Users can manage their own teams"
ON public.teams FOR ALL
USING ( (SELECT user_id FROM public.user_integrations WHERE id = teams.user_integration_id) = auth.uid() )
WITH CHECK ( (SELECT user_id FROM public.user_integrations WHERE id = teams.user_integration_id) = auth.uid() );
