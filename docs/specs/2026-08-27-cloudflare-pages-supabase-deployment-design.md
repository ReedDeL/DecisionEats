# DecisionEats Cloudflare Pages and Supabase Deployment Design

**Date:** 2026-08-27
**Status:** Approved for implementation
**Scope:** Production web deployment and hosted-service configuration

## Goal

Publish the existing Expo Router static web build through a new Cloudflare
Pages project and connect that build to the existing hosted DecisionEats Supabase
project. Production deploys should run automatically from GitHub's `master`
branch. Branch previews remain disabled so non-production branches cannot write
to the production database.

The deployment keeps the existing service boundary: Cloudflare serves static
assets, while Supabase continues to own Auth, Postgres, Storage, and Edge
Functions. Cloudflare does not receive a database password, secret API key, or
service-role credential.

## Selected approach

Use Cloudflare Pages' native GitHub integration. Create a Pages project named
`homechef`, connect `ReedDeL/DecisionEats`, and make `master` the production branch.
This provides automatic production deploys without adding a repository
workflow or storing a Cloudflare API token in GitHub.

Two alternatives were considered:

- A GitHub Actions workflow using Wrangler would also deploy automatically,
  but it would add deployment code and require a Cloudflare API token in
  GitHub secrets.
- Wrangler direct upload would avoid the GitHub integration, but deployments
  would be manual and would not meet the automatic-deployment requirement.

If the `homechef` Pages project name is unavailable or GitHub access has not
been authorized for the Cloudflare account, implementation stops and asks the
repository owner to choose or authorize the missing resource. It does not
silently invent another project name or deployment path.

## Cloudflare Pages configuration

Configure the Pages project with:

| Setting | Value |
|---|---|
| Git repository | `ReedDeL/DecisionEats` |
| Production branch | `master` |
| Framework preset | None |
| Root directory | `/` |
| Build command | `npm run web:build` |
| Build output directory | `dist` |
| Node.js version | `22` |
| Branch preview deployments | Disabled |

Only the production environment receives application variables:

- `EXPO_PUBLIC_SUPABASE_URL`, copied from the existing ignored root `.env`;
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`, copied from the same file and currently
  containing a modern Supabase publishable key;
- `EXPO_PUBLIC_POSTHOG_API_KEY`, copied from the existing ignored `.env.local`;
- `EXPO_PUBLIC_POSTHOG_HOST`, copied from the same file.

These values are deliberately public client configuration and are compiled
into the Expo web bundle. Do not configure a Supabase secret key, legacy
service-role key, database connection string, Gemini key, Spoonacular key,
Google OAuth secret, PostHog personal key, or external-communication credential
in Cloudflare Pages.

The first successful production deployment establishes the canonical
Cloudflare-assigned `.pages.dev` origin. If Cloudflare returns an origin
different from `https://homechef.pages.dev`, all later configuration uses the
returned origin rather than assuming the hostname.

## Supabase and OAuth configuration

The repository is already linked to the hosted `DecisionEats` Supabase project.
The hosted database is healthy and contains all seven repository migrations,
all 20 public tables have RLS enabled, and `analyze-pantry-photo` is active.
This deployment makes no schema or RLS changes.

After the Pages origin is known:

1. Set the hosted Supabase Auth site URL to the production Pages origin.
2. Add the exact production Pages origin to the Auth redirect allowlist while
   preserving `http://localhost:8081` and `decisioneats://**`.
3. Add the production Pages origin to the Google Web OAuth client's authorized
   JavaScript origins. Keep the existing Supabase Auth callback as the Google
   authorized redirect URI.
4. Set the Edge Function `ALLOWED_ORIGINS` secret to the exact Pages origin and
   `http://localhost:8081`, preserving local web development. Native clients
   send no browser Origin header and remain unaffected.

The Pages application continues to call Supabase through the project URL and
publishable key. User JWTs and existing RLS policies authorize database access;
the public key is never treated as an authorization boundary.

## Deployment and data flow

```text
push to GitHub master
  -> Cloudflare Pages installs locked dependencies
  -> npm run web:build exports the Expo app to dist/
  -> Cloudflare publishes immutable static assets
  -> browser loads public Supabase configuration from the bundle
  -> Supabase Auth establishes the user's session
  -> supabase-js sends the session JWT to the Data API or Edge Function
  -> RLS or function authorization decides what that user may access
```

Cloudflare Pages has no server function in this design and never connects
directly to Postgres. Supabase remains the single backend for web and native
clients.

## Failure handling

- Cloudflare or GitHub authentication missing: ask the owner to sign in or
  authorize the repository, then resume the native Git integration flow.
- Pages project name unavailable: ask for a replacement name before creating
  any project.
- Build failure: inspect the Pages build log and correct the repository-owned
  build configuration; do not switch to direct upload as an unreviewed
  workaround.
- Missing production environment value: leave the deployment unpromoted and
  report the exact variable name without printing any value.
- Pages origin not yet deployed: defer Supabase Auth, Google OAuth, and CORS
  changes until the exact HTTPS origin exists.
- Supabase or Google dashboard access unavailable: identify the exact setting
  and ask the owner to provide access or complete that single account step.
- Live authentication or database check fails: inspect browser and Supabase
  logs, preserve RLS, and fix the underlying configuration rather than adding
  a service-role credential to the client.

## Verification

Repository verification:

1. Run the full project check suite.
2. Run `npm run web:build` with the existing local public environment values.
3. Confirm `dist/` contains the static security headers and no privileged key
   names or values.

Deployment verification:

1. Confirm the Pages production deployment was built from `master`, reports a
   successful build, and serves over HTTPS.
2. Confirm branch preview deployments are disabled.
3. Load the home route and directly refresh recipe and cook-mode routes.
4. Complete Google sign-in, reload, and confirm the session persists.
5. Exercise an authenticated DecisionEats read and write through the existing UI
   using an owner-approved test account, confirming RLS-backed persistence.
6. Invoke the pantry-photo flow with a synthetic image and confirm the browser
   receives the Edge Function response without a CORS error.
7. Inspect the deployed browser bundle and network requests for accidental
   privileged credentials.

Any check that needs the owner's interactive sign-in or an approved test
account is reported explicitly rather than simulated.

## Out of scope

- New tables, migrations, policies, indexes, database extensions, or seed data
- Cloudflare Pages Functions, Workers, D1, KV, R2, or Hyperdrive
- Supabase development branches for preview deployments
- Custom domains or redirects away from the initial `pages.dev` hostname
- Changes to Google OAuth application credentials
- Changes to existing database advisor findings unrelated to deployment
- Repository automation that posts to communication or project-management
  systems
