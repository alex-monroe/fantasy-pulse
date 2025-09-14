# AGENTS

This document provides instructions for agents on how to set up and run this project.

## Running the E2E Tests

To run the end-to-end tests, follow these steps:

1.  **Install dependencies:**
    ```bash
    npm install
    ```

2.  **Create the environment file:**
    Create a `.env.local` file in the root of the project and add the necessary environment variables. You can use the `.env.example` file as a template.

3.  **Install Playwright browsers:**
    ```bash
    npx playwright install
    ```

4.  **Install Playwright dependencies:**
    ```bash
    npx playwright install-deps
    ```

5.  **Run the tests:**
    ```bash
    npm run test:e2e
    ```

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

## Development

### `package-lock.json` Synchronization

When making changes to dependencies in `package.json`, you must regenerate the `package-lock.json` file. This is crucial because our continuous integration (CI) pipeline uses the `npm ci` command, which requires `package.json` and `package-lock.json` to be perfectly in sync.

If they are not in sync, the CI pipeline will fail with an error similar to this:
`npm ERR! clean install a project with an out-of-sync lockfile`

To prevent this, after any change in `package.json`, run the following command to update `package-lock.json`:

```bash
npm install
```

After running the command, be sure to commit the updated `package-lock.json` file along with your other changes. If you forget to do this, you will need to pull the latest changes, run `npm install`, and then push the updated `package-lock.json` file.

## Yahoo Player Scores Example

Use `src/app/integrations/yahoo/player-scores.example.json` as a reference when developing against the Yahoo player scores API.
