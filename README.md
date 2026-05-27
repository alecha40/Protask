# ProTask

ProTask is a static PWA for notes, checklists, and GTD-style planning with Supabase Auth, Row Level Security, local IndexedDB storage, and cloud sync.

## Current Stack

- Static HTML/CSS/JavaScript
- IndexedDB for local offline storage
- Supabase Auth for user accounts
- Supabase Postgres + RLS for protected cloud data
- Service Worker + Web App Manifest for PWA installability

## Local Run

```bash
python3 -m http.server 4173 --bind 127.0.0.1
```

Open:

```text
http://127.0.0.1:4173/
```

If the UI looks stale, hard-refresh because the PWA service worker caches assets.

## Supabase Setup

1. Create a Supabase project.
2. In SQL Editor, run `supabase-schema.sql`.
3. In Authentication -> Providers -> Email, turn off email confirmation if you want login-only registration during MVP.
4. In Authentication -> URL Configuration, set the production URL after deploy.

The frontend uses a publishable key. Do not put service-role keys or database passwords in this repo.

## Deploy

This is a static site. Use Cloudflare Pages, Netlify, or Vercel.

Recommended settings:

```text
Build command: empty
Publish directory: /
```

After deploy, add the public URL in Supabase:

```text
Authentication -> URL Configuration
Site URL = https://your-domain
Redirect URLs = https://your-domain/**
```

See `DEPLOYMENT.md` for step-by-step Cloudflare Pages and Netlify instructions.

## Important Files

- `index.html` - app shell
- `styles.css` - UI styles
- `app.js` - auth, local storage, sync, editor logic
- `sw.js` - service worker
- `manifest.webmanifest` - PWA manifest
- `supabase-schema.sql` - database schema and RLS policies
- `_headers` - production security/cache headers
- `_redirects` - static hosting fallback
- `DEPLOYMENT.md` - deploy instructions
- `PRODUCTION_CHECKLIST.md` - release checklist
- `SECURITY.md` - security notes and limits
