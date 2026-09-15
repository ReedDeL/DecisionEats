# DecisionEats Google OAuth for Android and Web Design

**Date:** 2026-08-12
**Status:** Approved for implementation

## Goal

Let users create and resume DecisionEats accounts with Google on Android and web.
The implementation uses Supabase Auth as the OAuth broker, so Google secrets
never reach the Expo bundle and all application data continues to be protected
by Supabase Row Level Security.

## Approach

Use Supabase-hosted Google OAuth, rather than a platform-specific Google Sign-In
SDK. Web lets Supabase perform the browser redirect and relies on the existing
web client configuration to detect and persist the returned session. Android
requests the authorization URL without redirecting, opens it in Expo's auth
browser, receives the `decisioneats://` redirect, and explicitly stores the returned
Supabase access and refresh tokens.

This has one provider configuration, one public client boundary, and no Google
credential in the app. It also leaves iOS separate so its Google OAuth work can
be completed alongside the required Apple Sign-In flow.

## Provider and redirect configuration

Google Cloud will contain one **Web application** OAuth client. Its authorized
redirect URI is the Supabase Auth callback shown in the Supabase Google provider
configuration. Its JavaScript origins include only the deployed web origin and
the explicit local development origin.

Supabase Auth will enable the Google provider with that client ID and client
secret. The secret is configured in the Supabase dashboard or local Supabase
environment; it is never copied into `.env`, `.env.example`, `app.json`, or
source code. Supabase Auth redirect URLs will allow the deployed web origin,
the local web origin, and `decisioneats://**` for the Android development build and
production app.

The existing `homechef` scheme in `app.json` is retained. Provider credentials
and the redirect allow list require a rebuild/deployment configuration step, not
a database migration.

## Components and responsibilities

### Authentication module

`src/lib/auth/google.ts` will expose named, platform-neutral functions:

- `signInWithGoogle()` starts the correct platform flow and resolves only after
  a Supabase session is available.
- `signOut()` clears the Supabase session.

The module owns platform selection and parses the Android callback. It returns
typed errors that UI code can show as a brief, non-sensitive message. It does
not expose raw OAuth URLs, Google tokens, refresh tokens, or provider metadata
to screen components.

Android uses `expo-auth-session` to create the `decisioneats://` redirect URI and
`expo-web-browser` to isolate the Google flow. It requests the Supabase OAuth
URL with `skipBrowserRedirect`, then validates the callback before calling
`supabase.auth.setSession`. Web calls `supabase.auth.signInWithOAuth` with the
current allowed origin and lets Supabase handle the browser navigation.

### Session state and routing

An auth provider or hook in the app shell subscribes to Supabase auth state,
hydrates the initial session once, and makes only the authenticated/unauthenticated
state available to route gates. It must unsubscribe on unmount.

The root gate will first wait for both the persisted app store and the initial
auth session. An unauthenticated user goes to the auth screen. An authenticated
user without completed kitchen setup goes to equipment onboarding; a returning
authenticated user goes to the meal-decision experience. Sign-out returns to
the auth screen and does not fabricate a local session.

### Authentication screen

`app/(auth)/sign-in.tsx` will provide a Google sign-in button and an in-progress
state. The button has an accessible label and explains that it continues to
DecisionEats. Errors are intentionally generic: OAuth cancellation is silent, while
configuration or network failures offer a retry without disclosing tokens,
provider URLs, or account information.

The control uses existing color, type, spacing, and touch-target tokens. It
does not show an email/password alternative in this change.

## Data flow

```text
user selects Continue with Google
  -> auth module chooses current platform
  -> Supabase Auth starts Google OAuth
  -> Google consent and account selection
  -> Supabase creates or resumes the Auth user
  -> web: SDK detects redirect session
     Android: auth browser returns decisioneats:// callback -> setSession
  -> auth-state subscription updates route gate
  -> authenticated user reaches onboarding or home
```

Google identity values are used only by Supabase Auth to establish the session.
RLS policies continue to authorize user and household data using `auth.uid()`;
no user-editable provider metadata is used for authorization.

## Failure handling

- User cancellation: return to the sign-in screen without an error alert.
- Missing OAuth URL, malformed callback, missing token pair, or Supabase error:
  retain the signed-out state and show a retryable generic sign-in message.
- Offline/network failure: retain the signed-out state and show the same
  retryable message.
- Redirect not on the Supabase allow list: treat it as configuration failure;
  do not attempt to substitute a redirect URL in the client.
- Auth state hydration: route nothing until it completes, preventing an
  authenticated user from flashing the sign-in screen.

## Testing and verification

Unit tests will prove that:

1. Android requests an OAuth URL with the custom redirect and completes a
   session only for a successful callback containing both token values.
2. Web starts a Google OAuth redirect without attempting native browser APIs.
3. Cancellation and malformed callbacks do not create a session.
4. The root gate routes signed-out, new signed-in, and returning signed-in
   states correctly after hydration.
5. Interactive controls include the required accessibility props.

Verification will include the project check suite, a web OAuth round trip against
the configured Supabase project, and an Android development-build round trip.
The final handoff will distinguish local tests from tests that require the user
to complete Google Cloud and Supabase dashboard configuration.

## Out of scope

- iOS Google OAuth and Apple Sign-In implementation (tracked separately for
  Harshal)
- Email/password, magic link, MFA, account linking, or account deletion UX
- New database tables, RLS policy changes, or Edge Functions
- Persisting Google access or refresh tokens for use with Google APIs
