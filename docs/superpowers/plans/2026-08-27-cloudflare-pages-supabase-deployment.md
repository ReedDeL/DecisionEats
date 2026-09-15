# Cloudflare Pages and Supabase Production Deployment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Publish DecisionEats's Expo web build from GitHub master through a new Cloudflare Pages project connected to the existing hosted Supabase backend.

**Architecture:** Cloudflare Pages builds and serves the static dist export; the browser connects directly to Supabase with the existing public project URL and publishable key. Supabase remains responsible for Auth, RLS-protected Postgres access, Storage, and the pantry-photo Edge Function. Pages Functions, Workers, and direct Postgres connections are not part of this deployment.

**Tech Stack:** Expo Router static export, Cloudflare Pages GitHub integration, Supabase Auth/PostgREST/Edge Functions, Supabase JavaScript client, Node.js 22.

## Global Constraints

- Create a Cloudflare Pages project named homechef only; if unavailable, stop and ask the owner for a replacement name.
- Connect ReedDeL/DecisionEats; production deploys follow master; branch preview deployments stay disabled.
- Use npm run web:build, output dist, root /, framework preset None, and Node.js 22.
- Configure only EXPO_PUBLIC_SUPABASE_URL, EXPO_PUBLIC_SUPABASE_ANON_KEY, EXPO_PUBLIC_POSTHOG_API_KEY, and EXPO_PUBLIC_POSTHOG_HOST in the Pages production environment.
- Never copy a database password, service-role/secret key, Gemini key, Spoonacular key, Google OAuth secret, or communication credential into Cloudflare, browser code, build output, or tracked files.
- Make no database schema, RLS, table-privilege, migration, or Edge Function source change.
- Preserve every pre-existing working-tree change and stage only task-owned files. This configuration-only plan should not create an empty commit.
- Use Cloudflare's actual assigned .pages.dev origin exactly in all hosted Supabase Auth, Google OAuth, and CORS configuration.

---

## File and service map

| Resource | Responsibility |
|---|---|
| .env (ignored, existing) | Local source for the public Supabase URL and publishable key; never print values. |
| .env.local (ignored, existing) | Local source for the public PostHog token and host; never print values. |
| package.json | Defines the Pages build command npm run web:build. No change required. |
| public/_headers | Static response headers copied into dist by Expo export. No change required. |
| supabase/functions/_shared/cors.ts | Enforces the ALLOWED_ORIGINS Edge Function secret. No source change required. |
| Cloudflare Pages homechef | New Git-integrated static-hosting project and production build environment. |
| Hosted Supabase project gcklupjsnfchyihncxov | Existing database, Auth redirect configuration, and Edge Function secrets. |
| Google Web OAuth client | Existing provider configuration to receive the Pages origin as an authorized JavaScript origin. |

### Task 1: Validate the production web artifact before account changes

**Files:**

- Generated: dist (gitignored; rebuilt locally)
- Read: package.json, public/_headers, .env, .env.local
- Modify: none
- Test: existing npm check suite

**Interfaces:**

- Consumes: the four existing public client variables from ignored local files.
- Produces: a static dist artifact that Cloudflare Pages can publish without privileged credentials.

- [ ] **Step 1: Confirm the local build inputs are available without printing them**

Run:

~~~bash
awk -F= '$1 == "EXPO_PUBLIC_SUPABASE_URL" || $1 == "EXPO_PUBLIC_SUPABASE_ANON_KEY" { found[$1] = length($2) > 0 } END { exit !(found["EXPO_PUBLIC_SUPABASE_URL"] && found["EXPO_PUBLIC_SUPABASE_ANON_KEY"]) }' .env
awk -F= '$1 == "EXPO_PUBLIC_POSTHOG_API_KEY" || $1 == "EXPO_PUBLIC_POSTHOG_HOST" { found[$1] = length($2) > 0 } END { exit !(found["EXPO_PUBLIC_POSTHOG_API_KEY"] && found["EXPO_PUBLIC_POSTHOG_HOST"]) }' .env.local
~~~

Expected: both commands exit 0 and print no credential value.

- [ ] **Step 2: Run the repository verification suite**

Run:

~~~bash
npm run check
~~~

Expected: lint, TypeScript, Vitest, and formatting all pass. If a failure is caused by a pre-existing working-tree change, record that file and failure separately; do not revert or stage it.

- [ ] **Step 3: Build the static production artifact**

Run:

~~~bash
npm run web:build
test -f dist/_headers
~~~

Expected: Expo exits successfully, dist exists, and the static header file is included for Cloudflare Pages.

- [ ] **Step 4: Fail closed if privileged credential markers enter the artifact**

Run:

~~~bash
if rg -n -i 'SUPABASE_SERVICE_ROLE_KEY|sb_secret_|service_role|GEMINI_API_KEY|SPOONACULAR_API_KEY' dist; then
  exit 1
fi
~~~

Expected: no matches. Public Supabase and PostHog client configuration is expected in the browser bundle and is not a failure.

### Task 2: Create and configure the Git-integrated Cloudflare Pages project

**Files:**

- Modify: none
- Configure: Cloudflare Pages project homechef
- Test: Cloudflare deployment build log

**Interfaces:**

- Consumes: the static build contract from Task 1 and the four public values verified there.
- Produces: a Pages production deployment URL and an automatic deploy rule for future GitHub master commits.

- [ ] **Step 1: Authenticate the owner in Cloudflare and authorize GitHub access**

Open Cloudflare Dashboard → Workers & Pages → Create application → Pages → Import an existing Git repository. Sign in with the account that owns the intended Pages project. If ReedDeL/DecisionEats is not selectable, authorize the Cloudflare GitHub App for that repository, then restart this step.

Expected: the repository selection screen shows ReedDeL/DecisionEats.

- [ ] **Step 2: Create the project with the approved build configuration**

Enter exactly:

| Field | Value |
|---|---|
| Project name | homechef |
| Production branch | master |
| Framework preset | None |
| Root directory | / |
| Build command | npm run web:build |
| Build output directory | dist |

Save the project. If Cloudflare rejects homechef as unavailable, stop before creating a differently named project and ask the owner for the new name.

Expected: Cloudflare starts a first deployment sourced from GitHub master.

- [ ] **Step 3: Add only production build environment variables**

In Settings → Environment variables, select the production environment. Copy the existing local value for each of these names directly from the ignored file named below, without displaying values in terminal output or tracked files:

| Name | Source |
|---|---|
| NODE_VERSION | literal value 22 |
| EXPO_PUBLIC_SUPABASE_URL | .env |
| EXPO_PUBLIC_SUPABASE_ANON_KEY | .env |
| EXPO_PUBLIC_POSTHOG_API_KEY | .env.local |
| EXPO_PUBLIC_POSTHOG_HOST | .env.local |

Do not add a variable for any secret or database connection credential.

Expected: production variable names match this table exactly; their values are not displayed in review output.

- [ ] **Step 4: Disable branch preview deployments and trigger a fresh production build**

In the Pages project branch deployment controls, disable preview deployments for non-production branches. Redeploy the current master production commit after saving the environment variables.

Expected: the deployment log runs npm run web:build, finishes successfully, and Cloudflare displays the exact HTTPS .pages.dev production URL. Record that returned URL as PAGES_ORIGIN for every later task.

### Task 3: Bind the deployed Pages origin to Supabase Auth, Google OAuth, and Edge Function CORS

**Files:**

- Modify: none
- Configure: hosted Supabase project gcklupjsnfchyihncxov and existing Google Web OAuth client
- Test: hosted configuration screens and browser-origin preflight

**Interfaces:**

- Consumes: PAGES_ORIGIN, the exact production Pages origin recorded in Task 2.
- Produces: an OAuth return path and browser CORS policy that admit production Pages, local web development, and the existing Android URI scheme.

- [ ] **Step 1: Set the production site and redirect origins in Supabase Auth**

In Supabase Dashboard → project DecisionEats → Authentication → URL Configuration, set Site URL to PAGES_ORIGIN. Add PAGES_ORIGIN to Redirect URLs while retaining these existing entries:

~~~text
http://localhost:8081
decisioneats://**
~~~

Expected: the web OAuth code's current browser origin redirect is on the Supabase allowlist; local web and Android redirects still remain allowed.

- [ ] **Step 2: Authorize PAGES_ORIGIN in the existing Google Web OAuth client**

In Google Cloud → Google Auth Platform → Clients, open the Web OAuth client configured for DecisionEats. Add PAGES_ORIGIN to Authorized JavaScript origins. Leave the Supabase Auth callback in Authorized redirect URIs unchanged.

Expected: Google accepts the browser origin while Supabase remains the OAuth broker and keeps the Google client secret server-side.

- [ ] **Step 3: Restrict Edge Function browser CORS to the deployed and local web origins**

In Supabase Dashboard → project DecisionEats → Edge Functions → Secrets, set ALLOWED_ORIGINS to one comma-separated line formed from PAGES_ORIGIN followed immediately by http://localhost:8081. Do not add an asterisk, Android URI scheme, database credential, or Edge Function service-role key.

Expected: the analyze-pantry-photo preflight returns a matching Access-Control-Allow-Origin header to Pages and localhost requests. Native clients remain unaffected because they do not send a browser Origin header.

### Task 4: Verify the live connection and automatic production delivery

**Files:**

- Generated: dist (gitignored, from Task 1)
- Modify: none
- Test: live HTTPS, browser authentication, RLS-backed UI, Edge Function CORS

**Interfaces:**

- Consumes: the configured Pages deployment, Auth allowlist, Google OAuth origin, and Edge Function CORS secret.
- Produces: evidence that the static Pages client reaches Supabase only through public configuration and authenticated RLS boundaries.

- [ ] **Step 1: Verify the Pages production response and deployment source**

Set a task-local shell variable PAGES_ORIGIN to the exact URL recorded in Task 2, then run:

~~~bash
curl -fsSI "$PAGES_ORIGIN"
~~~

Expected: an HTTPS 200 or static-page 304 response. In Cloudflare, the deployment details name master as the source branch and the branch deployment controls show previews disabled.

- [ ] **Step 2: Verify static routing and client configuration in a browser**

Open PAGES_ORIGIN, then load and refresh a recipe URL and a cook-mode URL from the running app. Inspect the browser Network panel to confirm requests go to https://gcklupjsnfchyihncxov.supabase.co, never to a direct Postgres host or a Cloudflare Pages Function.

Expected: each route loads after refresh, and no request exposes a secret or service-role credential.

- [ ] **Step 3: Verify authenticated Supabase behavior with an owner-approved test account**

Sign in through the deployed Google flow, reload the page, and confirm the session persists. Use one existing UI action that reads and saves an authenticated preference or pantry item; verify the resulting UI state after a reload.

Expected: the action succeeds through the Supabase client, and the test uses the signed-in user's RLS permissions rather than a privileged key. Do not create a new production test account or delete account data without a separate owner instruction.

- [ ] **Step 4: Verify the pantry-photo Edge Function CORS path with a synthetic photo**

While signed in through Pages, submit one synthetic test photo through the existing pantry scan UI and inspect the function response in Network.

Expected: the browser receives a non-CORS response from analyze-pantry-photo. A visible authentication, quota, or model error is reported with its HTTP status; a browser CORS block is a configuration failure.

- [ ] **Step 5: Hand off the verified deployment state without changing unrelated docs**

Report the exact Pages URL, source branch, preview setting, and which live checks required the owner's interactive account. Do not edit or stage the already-modified docs/06_API_KEYS_AND_ENV.md or docs/07_WEB_LAUNCH.md as part of this task; their unrelated uncommitted edits must remain untouched.

Expected: the handoff distinguishes completed checks from account steps that the owner must perform, without leaking credential values.

## Plan self-review

| Specification requirement | Covered by |
|---|---|
| Git-integrated homechef project on master | Task 2, Steps 1-2 |
| dist export, Node 22, production-only environment | Task 1 and Task 2, Step 3 |
| Previews disabled | Task 2, Step 4 and Task 4, Step 1 |
| No privileged Cloudflare credential | Global Constraints, Task 1, Step 4, and Task 2, Step 3 |
| Supabase Auth redirects, Google origin, and Edge CORS | Task 3 |
| Static Pages-to-Supabase boundary and RLS verification | Task 4, Steps 2-3 |
| Pantry photo and CORS verification | Task 4, Step 4 |
| Preserve unrelated workspace changes | Global Constraints and Task 4, Step 5 |

The plan has no application-code changes, so it intentionally contains no unit-test creation task. It instead requires local build checks, deployment-log validation, browser behavior checks, and verified hosted-service settings.

