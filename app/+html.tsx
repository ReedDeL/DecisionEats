import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { palette } from '@/theme/tokens';

/**
 * The web-only HTML shell. Native has no equivalent, and expo-router renders
 * this file at build time rather than shipping it to the client.
 *
 * It exists because the default Expo shell leaves `#root` unbounded. The web
 * shell now centers a responsive workspace for desktop browsers while the
 * screen-level compositions keep the phone layout for narrow viewports. Native
 * platforms remain unchanged.
 */
export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* viewport-fit=cover so env(safe-area-inset-*) resolves on iOS Safari. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        <meta name="description" content="Decide what to cook in under ten seconds." />
        {/* Paints the browser chrome to match the app instead of flashing white. */}
        <meta name="theme-color" content={palette.light.bg} media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content={palette.dark.bg} media="(prefers-color-scheme: dark)" />
        <link rel="icon" type="image/png" href="/favicon.png" />
        <title>DecisionEats</title>

        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: SHELL_CSS }} />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * Only what cannot be expressed in React Native styles belongs here: the page
 * background behind the responsive workspace and the centering context the
 * app column sits in. The column's own width lives in `MobileViewport` so it
 * stays token-driven and readable from the component tree.
 *
 * Colors are interpolated from the tokens rather than written as hex, so this
 * file cannot drift from src/theme/tokens.ts.
 */
const SHELL_CSS = `
html { height: 100%; }

body {
  /* Browser controls change the visible height while a mobile page is open. */
  height: 100%;
  height: -webkit-fill-available;
  height: 100dvh;
  overflow: hidden;
  background-color: ${palette.light.surfaceAlt};
  /* Matches the RN default so the workspace and the page agree. */
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
}

#root {
  display: flex;
  height: 100%;
  width: 100%;
  flex: 1;
}

@media (prefers-color-scheme: dark) {
  body { background-color: ${palette.dark.surfaceAlt}; }
}

/* A visible focus ring is the only keyboard affordance on web; Pressable
   gives none of its own. Mouse users never see it. */
:focus-visible {
  outline: 2px solid ${palette.light.accent};
  outline-offset: 2px;
}

@media (prefers-color-scheme: dark) {
  :focus-visible { outline-color: ${palette.dark.accent}; }
}
`;
