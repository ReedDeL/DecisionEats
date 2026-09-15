# DecisionEats — API Keys & Environment Setup

**Version:** 0.2.0 · **Date:** September 9, 2026
**Read this before writing any code that touches a third-party service.**

---

## 0. The one rule

> **A key shipped in a mobile app is a public key.**

React Native bundles are trivially extractable — `.ipa` and `.apk` files are ZIP archives, and anyone can unzip yours and read every string in it. `EXPO_PUBLIC_` variables, `.env` files bundled at build time, and hardcoded constants are all equally exposed.

**Therefore: every runtime vendor secret lives in Supabase, and only Edge
Functions read it.** The client contains only deliberately public project
configuration: the Supabase URL and anon key, plus the PostHog project token
and ingestion host. Personal API keys and service credentials never enter the
repository or client bundle.

```
   ❌ WRONG                              ✅ RIGHT

   App ──[Gemini key]──▶ Google         App ──▶ Edge Function ──[key]──▶ Google
   App ──[Spoon key]───▶ Spoonacular    App ──▶ Edge Function ──[key]──▶ Spoonacular
        key is in the bundle,                  key lives in Supabase secrets,
        anyone can extract it                  never leaves the server
```

---

## 1. Every key, and where it goes

| Key | Get it from | Where it lives | Client-safe? |
|---|---|---|---|
| **Gemini API key** | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) | Supabase secret | ❌ **Never** |
| **Spoonacular API key** | [spoonacular.com/food-api/console](https://spoonacular.com/food-api/console) | Supabase secret | ❌ **Never** |
| **Supabase URL** | Supabase dashboard → Settings → API | Client `.env` | ✅ Yes — public by design |
| **Supabase anon key** | Supabase dashboard → Settings → API | Client `.env` | ✅ Yes — RLS protects the data |
| **Google OAuth client ID** | Google Cloud → Google Auth Platform → Clients | Supabase Dashboard; local `supabase/.env.local` | ❌ Not needed by the app bundle |
| **Google OAuth client secret** | Google Cloud → Google Auth Platform → Clients | Supabase Dashboard; local `supabase/.env.local` | ❌ **Never** |
| **PostHog project token** | EAS PostHog integration | Client `.env.local` + EAS environment | ✅ Yes — ingestion only |
| **PostHog ingestion host** | EAS PostHog integration | Client `.env.local` + EAS environment | ✅ Yes — public endpoint |
| **PostHog personal API key** | Not used for product analytics | **Nowhere** | ❌ **Never** — account access |
| **Supabase service_role key** | Supabase dashboard → Settings → API | Supabase Edge Function secret / local ignored env | ❌ **Never** — bypasses all RLS |

### On the two Supabase keys

They are not interchangeable, and confusing them is the single most common way a Supabase project leaks.

- **`anon` key** — meant to be public. It identifies your project, and Row Level Security decides what the caller may actually read. Safe in the app bundle.
- **`service_role` key** — bypasses RLS entirely. It can read every user's allergens and every household's pantry. **If this key ever reaches the client, your database is fully open.** The photo Edge Function uses it only server-side to call the private scan-budget RPC while forwarding the caller's bearer token. No client screen or client module may use it directly.

---

## 2. Setup — do this once

### Step 1 — Get the keys

**Gemini** — [aistudio.google.com/apikey](https://aistudio.google.com/apikey) → *Create API key*. Use the free tier only for local testing; production photo processing requires a provider data-use review and should use the paid service terms.

**Spoonacular** — [spoonacular.com/food-api/console](https://spoonacular.com/food-api/console) → sign up → Profile → API key. Choose the **Free** plan on their own site, *not* through RapidAPI — RapidAPI's free tier requires a credit card and bills overages. Signing up directly means you hit a hard stop at 50 points instead of a surprise charge.

**Supabase** — dashboard → Settings → API. Copy the Project URL and the `anon` key.

**PostHog** — use the EAS integration in Step 6. The project region is a
data-residency decision and cannot be changed after connection.

### Step 2 — Put the secrets in Supabase

```bash
supabase secrets set GEMINI_API_KEY=your_key_here
supabase secrets set SPOONACULAR_API_KEY=your_key_here

# Confirm — prints names and digests, never values
supabase secrets list
```

Or via dashboard: **Project Settings → Edge Functions → Secrets**.

These are readable only from inside Edge Functions, via `Deno.env.get()`. They are not in your repo, not in your bundle, and not visible to the client.

### Step 3 — Client environment

Create `.env` at the repo root:

```bash
# .env or .env.local — these four values are public by design
EXPO_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
EXPO_PUBLIC_POSTHOG_API_KEY=phc_xxxxx
EXPO_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Only these four names belong behind `EXPO_PUBLIC_`. That prefix means
"compile this into the app bundle." A PostHog project token is intentionally
public and only accepts analytics ingestion; it is not a PostHog personal API
key.

### Step 4 — Local Edge Function development

```bash
# supabase/.env.local  — MUST be gitignored
GEMINI_API_KEY=your_key_here
SPOONACULAR_API_KEY=your_key_here
```

```bash
supabase functions serve --env-file supabase/.env.local
```

### Step 4a — Google OAuth (web and Android)

Google OAuth is brokered by Supabase Auth. Create **one Web application** OAuth
client in Google Cloud → **Google Auth Platform → Clients**. Do not create an
Android OAuth client for this flow.

1. In Supabase Dashboard → **Authentication → Providers → Google**, copy the
   displayed callback URL. In the Google Web client, add that exact value under
   **Authorized redirect URIs**.
2. Under **Authorized JavaScript origins**, add only the deployed DecisionEats web
   origin and `http://localhost:8081`. Do not add an Android scheme here.
3. Back in Supabase Dashboard → **Authentication → Providers → Google**, enable
   Google and enter the Web client ID and client secret. Those values belong in
   the Dashboard, never in `app.json`, client `.env`, `.env.example`, or source
   code.
4. In Supabase Dashboard → **Authentication → URL Configuration → Redirect
   URLs**, add the deployed DecisionEats web origin, `http://localhost:8081`, and
   `decisioneats://**`. Keep the deployed origin exact; do not use a broad web
   wildcard.

For local Supabase Auth only, put the credentials in the ignored
`supabase/.env.local` file:

```bash
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET=
```

`supabase/config.toml` reads those names with `env(...)`; values must never be
committed. The Google client secret is not an Edge Function secret, but it is
still server-side configuration managed by Supabase Auth.

#### Live OAuth verification

After the Google Cloud and hosted Supabase Dashboard settings above are in
place, verify both round trips:

1. Run `npm run web`, sign in at `http://localhost:8081`, confirm a new account
   reaches equipment onboarding, then reload and confirm the session remains.
2. Run `npm run android:dev`, complete sign-in in the Android auth browser,
   confirm the `decisioneats://` return opens DecisionEats, then relaunch and confirm
   the session remains.

Repository configuration cannot perform those sign-ins: they require a real
Google Cloud OAuth client and access to the hosted Supabase Dashboard. Record
the result after that external setup is available; until then, treat live OAuth
verification as blocked rather than simulated.

### Step 5 — verify repository-owned environment files

Use [`.gitignore`](../.gitignore) and [`.env.example`](../.env.example)
as the live source of truth. The example contains names only; real values never
enter Git.

---

### Step 6 — connect PostHog through EAS

From the repository root, run:

```bash
eas integrations:posthog:connect --no-session-replay --no-error-tracking
```

Choose the intended US or EU region when prompted. The integration reuses or
creates the PostHog project, keeps Session Replay and error tracking disabled,
and writes `EXPO_PUBLIC_POSTHOG_API_KEY` and
`EXPO_PUBLIC_POSTHOG_HOST` to gitignored `.env.local` plus the EAS
Development, Preview, and Production environments. Product analytics does not
require a PostHog personal API key.

The app also disables screen, touch, lifecycle, Session Replay, error-tracking,
and feature-flag autocapture in code. Do not enable those features without a
separate privacy review.

---

## 3. Reading keys in an Edge Function

Read secrets with `Deno.env.get` inside the function, handle CORS preflight
before authentication, and include CORS headers on every response. The current
implementation in `supabase/functions/analyze-pantry-photo/` is the source of
truth. Never log a secret, return it in an error, or put it into client-visible
configuration.

### Photo data, provider terms, and scan limits

`store: false` asks Gemini not to store the Interaction as an application
conversation. It does not override the provider's service-tier terms,
retention, abuse-monitoring, or data-use rules. Do not send faces, identity
documents, or other sensitive personal information. Production photo scanning
must use a reviewed provider tier and the user-facing disclosure in
`app/scan.tsx` must remain accurate.

The Edge Function rejects unverified accounts, applies a per-user UTC-day
budget, and applies a global UTC-day budget before any Gemini request. The
defaults are `DAILY_SCAN_LIMIT=20` and `GLOBAL_DAILY_SCAN_LIMIT=1000`; both are
operator configuration, and the private database function validates their
safe range again. Set `ALLOWED_ORIGINS` to the exact deployed web origin before
enabling browser photo scanning in production.

The verified-account check is an abuse control, not age verification. A formal
adult-use policy, age gate decision, privacy notice, deletion/export process,
and legal review remain launch requirements.

---

## 4. Who holds what

| | RJ | Harshal | Third seat |
|---|---|---|---|
| Supabase project owner | ✅ | Member | Member |
| Gemini API key | ✅ Creates | Uses via Supabase | — |
| Spoonacular account | ✅ Creates | Uses via Supabase | — |
| Can read raw secret values | ✅ | ✅ (dashboard) | ❌ |

**Nobody needs a key on their laptop except for local Edge Function development.** If you are building a screen, you need the Supabase URL and anon key — nothing more.

---

## 5. If a key leaks

Assume compromise the moment a key touches a public repo, a screenshot, a Slack message, or a pasted stack trace. Rotating is cheap; not rotating is not.

1. **Revoke immediately** in the vendor console. Do not wait to assess impact.
2. **Generate a replacement.**
3. `supabase secrets set KEY=new_value`
4. **Purge from git history** if it was ever committed — `git rm --cached` is not enough, the value stays in history. Use `git filter-repo` or BFG.
5. **Record it in the project change log.** No blame; the point is that the other founders know the key changed and why a build might break.

GitHub push protection is enabled on the repo and will block most accidental commits — but it is a backstop, not the plan.

---

## 6. Pre-launch checklist

Before the App Store submission on **Aug 17**:

- [ ] `EXPO_PUBLIC_` contains only Supabase URL/anon and PostHog project token/host
- [ ] `grep -ri "AIza\|sk-\|service_role" src/ app/` returns nothing
- [ ] `.env` and `supabase/.env.local` are gitignored and were never committed
- [ ] `.env.example` is committed and current
- [ ] Production `ALLOWED_ORIGINS` contains only the exact deployed web origin
- [ ] Production scan limits and a global Gemini budget are configured
- [ ] Gemini production data-use terms and the photo/privacy disclosure have
      received legal/privacy review
- [ ] Adult-use policy and age-gate decision are approved
- [ ] GitHub secret scanning + push protection on
- [ ] TheMealDB supporter payment made (R4)
- [ ] Spoonacular attribution and backlink shipped in the UI (R11)
- [ ] A test build has been unzipped and string-searched for key patterns

That last one takes two minutes and is the only check that tests what actually ships:

```bash
unzip -p build.ipa | strings | grep -i "AIza\|spoonacular.*key"
```

---

---

*Application42 · DecisionEats · API Keys & Environment Setup v0.1.0 · August 3, 2026*
