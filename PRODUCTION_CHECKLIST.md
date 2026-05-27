# Production Checklist

## Supabase

- [ ] `supabase-schema.sql` has been executed.
- [ ] RLS is enabled on `public.notes`.
- [ ] Policies exist for select, insert, update, and delete.
- [ ] Email confirmation setting is intentional.
- [ ] Production Site URL is configured.
- [ ] Production Redirect URLs are configured.
- [ ] Service-role key is not exposed anywhere in frontend files.

## App QA

- [ ] New user can register.
- [ ] Existing user can sign in.
- [ ] User can sign out.
- [ ] Notes sync across two browsers or devices.
- [ ] Checklist syncs across devices.
- [ ] Planner syncs across devices.
- [ ] Drag-and-drop planner changes sync.
- [ ] Offline edits remain visible locally.
- [ ] Offline edits sync after reconnect.
- [ ] Another account cannot see the first account's notes.

## Deployment

- [ ] Static host is connected.
- [ ] HTTPS is enabled.
- [ ] `_headers` is applied by the host.
- [ ] `_redirects` or equivalent fallback is applied.
- [ ] PWA install prompt appears on supported browsers.
- [ ] Hard refresh shows the newest service worker version.

## Legal / Trust

- [ ] Add privacy policy before inviting real users.
- [ ] Add terms if this becomes a public product.
- [ ] Decide data retention and account deletion process.

