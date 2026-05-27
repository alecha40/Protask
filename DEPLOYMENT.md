# Deployment

## Recommended: Cloudflare Pages

1. Create a GitHub repository and push this folder.
2. Open Cloudflare Dashboard -> Workers & Pages -> Create -> Pages.
3. Connect the GitHub repository.
4. Use these settings:

```text
Framework preset: None
Build command: empty
Build output directory: /
Root directory: /
```

5. Deploy.
6. Open the production URL and test login + sync.
7. In Supabase, set:

```text
Authentication -> URL Configuration
Site URL = https://your-project.pages.dev
Redirect URLs = https://your-project.pages.dev/**
```

## Alternative: Netlify

1. Create a GitHub repository and push this folder.
2. In Netlify, create a new site from Git.
3. Use these settings:

```text
Build command: empty
Publish directory: /
```

4. Deploy.
5. In Supabase, set:

```text
Authentication -> URL Configuration
Site URL = https://your-site.netlify.app
Redirect URLs = https://your-site.netlify.app/**
```

## After Custom Domain

When you connect a custom domain, update Supabase again:

```text
Site URL = https://your-domain.com
Redirect URLs = https://your-domain.com/**
```

## Smoke Test

Use two separate browsers or devices:

1. Sign in with the same login and password.
2. Create a text note on device A.
3. Press "Синхронизировать" or wait a moment.
4. Refresh device B.
5. Repeat for checklist and planner.
6. Test offline edit by disconnecting the internet, editing, reconnecting, and syncing.

