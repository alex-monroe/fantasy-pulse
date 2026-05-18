-- Rename Roster Loom's tables with an fp_ prefix so the boundary
-- with the sibling repo sharing the OttoneuDB Supabase project is
-- explicit. Foreign keys auto-update to the new table identities;
-- existing constraint/index names (e.g. leagues_pkey) keep their
-- original names and remain valid.
ALTER TABLE public.user_integrations RENAME TO fp_user_integrations;
ALTER TABLE public.leagues RENAME TO fp_leagues;
ALTER TABLE public.teams RENAME TO fp_teams;
ALTER TABLE public.notes RENAME TO fp_notes;
