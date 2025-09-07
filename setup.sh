#!/bin/bash

# Your other setup commands (e.g., npm install) go here

# Write the secrets to a .env.local file
# The '>>' appends to the file, which is safer than '>' overwriting it.
echo "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}" >> .env.local
echo "SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}" >> .env.local
echo "YAHOO_CLIENT_SECRET=${YAHOO_CLIENT_SECRET}" >> .env.local
echo "YAHOO_CLIENT_ID=${YAHOO_CLIENT_ID}" >> .env.local

echo "Successfully created .env.local for the test run."
