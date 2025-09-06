#!/bin/bash

# Your other setup commands (e.g., npm install) go here

# Write the secrets to a .env.local file
# The '>>' appends to the file, which is safer than '>' overwriting it.
echo "NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}" >> .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}" >> .env.local

echo "Successfully created .env.local for the test run."
