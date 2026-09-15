# DecisionEats — Cloudflare Web Release

**Version:** 0.1.0 · **Date:** August 23, 2026

This publishes the existing Expo Router
web build as static assets on Cloudflare Pages. It does not replace Supabase,
move an API, or create a second backend.

## What is hosted where

| Service | Responsibility |
|---|---|
| Cloudflare Pages | The compiled HTML, JavaScript, CSS, and catalog assets in `dist/` |
| Supabase | Authentication, database, storage, and Edge Functions |
| PostHog | The approved product analytics events |

DecisionEats uses no Pages Functions for this release. Static asset requests on
Cloudflare Pages are free; the vendor's current limits still apply and should
be rechecked before a higher-traffic release.

## Local production check

Run from the repository root in Ubuntu/WSL:

```bash
npm install
npm run web:build
npm run web:serve
```

Open `http://localhost:8081`. The export command creates `dist/`; never edit
that directory by hand.

If an Expo development server was already running when a dependency changed,
stop it and restart with a clean Metro cache:

```bash
npx expo start --web --clear
```

## Create the Cloudflare Pages project

This section changes an external account and must be performed or explicitly
approved by the repository owner.

1. In Cloudflare, open **Workers & Pages** and choose **Create application**.
2. Choose **Pages** and **Import an existing Git repository**.
3. Select the DecisionEats repository.
4. Use these build settings:

   | Setting | Value |
   |---|---|
   | Production branch | `main` |
   | Framework preset | None |
   | Build command | `npm run web:build` |
   | Build output directory | `dist` |
   | Root directory | `/` |

5. Add these build-time environment variables for Production and Preview:

   ```text
   NODE_VERSION=22
   EXPO_PUBLIC_SUPABASE_URL=<public project URL>
   EXPO_PUBLIC_SUPABASE_ANON_KEY=<public anon or publishable key>
   EXPO_PUBLIC_POSTHOG_API_KEY=<public PostHog project token>
   EXPO_PUBLIC_POSTHOG_HOST=<US or EU ingestion host>
   ```

   These four `EXPO_PUBLIC_` values are deliberately compiled into the web
   bundle. Do not add a Supabase service-role key, Gemini key, Spoonacular key,
   PostHog personal API key, or messaging integration webhook.

6. Select **Save and Deploy**. Cloudflare assigns a `*.pages.dev` HTTPS URL.
7. Add a custom domain only after the `pages.dev` release passes the checklist.

PostHog is optional for rendering: if its project token is absent, DecisionEats
starts with analytics disabled. Supabase configuration is required for the
photo pipeline and future authentication.

## release checklist

- Complete onboarding and submit a pantry filter.
- Open a recipe and verify complete instructions. Verify Show more preserves earlier matches, then generate a weekly plan and review What to get.
- Refresh a recipe or cook-mode URL directly to check deep links.
- Upload a synthetic test photo; do not use a real pantry photo for an
  infrastructure check.
- Confirm the browser requests camera permission only after **Take a photo**.
- Confirm PostHog receives only the approved events in
  `src/lib/analytics.ts`, plus `$identify` after authentication.
- Confirm there are no `$autocapture`, `$screen`, lifecycle, error-tracking,
  or session-replay events.
- Inspect the deployed bundle or network requests for accidental secrets.
- Test at phone and desktop widths in Chrome, Safari, and Firefox.

When web authentication is enabled, add the final `https://*.pages.dev` and
custom-domain callback URLs to Supabase Auth's allowed redirect URLs. That is
an account change, not part of the static deployment, and should not be done
until the final hostname is known.
