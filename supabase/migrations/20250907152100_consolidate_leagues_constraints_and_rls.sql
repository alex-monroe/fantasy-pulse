-- Add a composite unique constraint to the leagues table
ALTER TABLE "leagues" ADD CONSTRAINT "leagues_league_id_user_integration_id_unique" UNIQUE ("league_id", "user_integration_id");

-- Add a comprehensive RLS policy for the leagues table
CREATE POLICY "Users can manage their own leagues"
ON public.leagues FOR ALL
USING ( (SELECT user_id FROM public.user_integrations WHERE id = leagues.user_integration_id) = auth.uid() )
WITH CHECK ( (SELECT user_id FROM public.user_integrations WHERE id = leagues.user_integration_id) = auth.uid() );
