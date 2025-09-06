# AGENTS

## Test Credentials
Use the following credentials for any login steps during automated tests:

- Email: test@test.com
- Password: test

## Database Schema

```sql
-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.leagues (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  league_id text,
  name character varying,
  user_integration_id bigint,
  season text,
  total_rosters bigint,
  status text,
  user_id uuid DEFAULT auth.uid(),
  CONSTRAINT leagues_pkey PRIMARY KEY (id),
  CONSTRAINT leagues_user_integrations_id_fkey FOREIGN KEY (user_integration_id) REFERENCES public.user_integrations(id)
);
CREATE TABLE public.notes (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  text text,
  user_id uuid,
  CONSTRAINT notes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_integrations (
  id bigint GENERATED ALWAYS AS IDENTITY NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid DEFAULT auth.uid(),
  provider character varying,
  provider_user_id text,
  CONSTRAINT user_integrations_pkey PRIMARY KEY (id)
);
```

