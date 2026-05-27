# Security Notes

## What Is Protected

- Supabase Auth manages user accounts and sessions.
- `public.notes` uses Row Level Security.
- Policies restrict reads and writes to rows where `auth.uid() = user_id`.
- The frontend only contains the Supabase publishable key.

## What Must Stay Secret

Never expose these in frontend code, GitHub, screenshots, or chat:

- Supabase service-role key
- Database password
- Direct database connection string
- JWT secret

## Current MVP Limits

- Login is converted to a technical email like `login@protask.local`.
- Local IndexedDB data is not encrypted at rest.
- Sync conflict handling is last-write-wins at the note level.
- Account deletion and data export are not implemented yet.

Before inviting real users, add a privacy policy and decide how account deletion should work.

