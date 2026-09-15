import { createClient, type User } from 'https://esm.sh/@supabase/supabase-js@2.110.8';
import { z } from 'https://esm.sh/zod@4.1.11';

import { errorResponse, jsonResponse, preflight } from '../_shared/cors.ts';

/**
 * Photo → pantry candidates (Technical Spec §5.1).
 *
 * The function does vision and validation only. It deliberately does not write
 * to `inventory`: every detected item goes back to the client for confirmation
 * first, because the user has to be able to correct a misread before it
 * reaches the pantry. A wrong ingredient written silently is the capture-time
 * origin of the inventory drift (risk R3) that makes recommendations rot.
 *
 * Normalization to canonical ids happens on the client, against the same
 * bundled vocabulary the engine matches against. See NORMALIZATION below.
 *
 * Every caller must present a valid, verified user session (401/403 otherwise)
 * and spend one unit of both the per-user and global daily budgets (429 once
 * spent) BEFORE any Gemini traffic. An unauthenticated, unverified, or
 * over-budget request costs nothing but a database round trip. Without both
 * gates, the public anon key alone would be enough to invoke this function in
 * a loop and drain the Gemini quota: a cost attack with no data at stake.
 */

/**
 * Stable pinned model (§2.4).
 *
 * NOT `gemini-flash-latest`: the alias hot-swaps on release with two weeks'
 * notice, which would let the prompt and schema start behaving differently
 * mid-launch. NOT `gemini-2.0-flash`, which is shut down.
 */
const MODEL = 'gemini-3.6-flash';

/** Interactions API (GA June 2026) — §2.4 directs new builds here, not generateContent. */
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';

/**
 * Pins the wire revision the request was written against, so a future default
 * revision cannot silently change response shapes mid-launch.
 */
const API_REVISION = '2026-05-20';

/** One fridge, one freezer, a couple of shelves. More is a client bug. */
const MAX_IMAGES = 10;

/**
 * Roughly 1.5 MB of base64 per image. The client resizes to 640×640 at ~0.7
 * JPEG quality (§5.1), which lands two orders of magnitude below this — the
 * cap exists to reject an uncompressed upload, not to trim a legitimate one.
 */
const MAX_IMAGE_CHARS = 2_000_000;

/**
 * A real 10-photo scan is ~1.5 MB of base64 in total; six times that still
 * leaves no honest request behind while bounding worst-case upstream cost per
 * call even when every individual image passes its own cap.
 */
const MAX_TOTAL_IMAGE_CHARS = 6_000_000;

/**
 * Conservative defaults. Both limits are server configuration so operators
 * can lower them during an incident or raise them only after reviewing real
 * usage and provider cost. The database function validates the same bounds as
 * a second line of defense against a bad secret value.
 */
const DEFAULT_DAILY_SCAN_LIMIT = 20;
const DEFAULT_GLOBAL_DAILY_SCAN_LIMIT = 1_000;
const MAX_CONFIGURED_DAILY_SCAN_LIMIT = 100;
const MAX_CONFIGURED_GLOBAL_DAILY_SCAN_LIMIT = 100_000;

type ScanLimits = {
  daily: number;
  globalDaily: number;
};

/**
 * The response contract from §2.4, as a plain JSON Schema for the Interactions
 * API's `response_format.schema`. Standard lowercase types: the old
 * generateContent `responseSchema` needed UPPERCASE proto enum names, but this
 * surface takes regular JSON Schema and every vendor example is lowercase.
 */
const INGREDIENT_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Generic ingredient type, never a brand' },
      quantity: { type: 'number' },
      unit: { type: 'string', enum: ['grams', 'milliliters', 'pieces', 'cups', 'unknown'] },
      confidence: { type: 'number', description: '0.0 to 1.0' },
    },
    required: ['name', 'quantity', 'unit', 'confidence'],
  },
} as const;

/**
 * Structured output is a strong guarantee, not a total one, and it says
 * nothing about whether the values are sane. Zod is the boundary check: it is
 * where a negative quantity or an out-of-range confidence stops.
 */
const DetectedItem = z.object({
  name: z.string().min(1).max(120),
  quantity: z.number().nonnegative().max(10_000),
  unit: z.enum(['grams', 'milliliters', 'pieces', 'cups', 'unknown']),
  confidence: z.number().min(0).max(1),
});

const DetectedItems = z.array(DetectedItem).max(100);

const RequestBody = z
  .object({
    images: z.array(z.string().min(1).max(MAX_IMAGE_CHARS)).min(1).max(MAX_IMAGES),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
  })
  .refine(
    (body) =>
      body.images.reduce((total, image) => total + image.length, 0) <= MAX_TOTAL_IMAGE_CHARS,
    {
      message: 'Total image payload exceeds the per-request limit.',
    }
  );

const PROMPT = `You are cataloguing the contents of someone's kitchen from photographs.

List every distinct food ingredient you can actually see. Follow these rules exactly:

1. Name the generic ingredient TYPE, never a brand and never packaging text.
   Write "chicken breast", not "Tyson Chicken Breast 3lb". Write "milk", not
   "Horizon Organic Whole Milk".
2. Use the plain everyday name for the ingredient, with no size, colour, or
   preparation words unless they change what the ingredient is. Write "onion",
   not "large red onion". But "oat milk" and "milk" are different ingredients,
   so keep the word that distinguishes them.
3. One entry per ingredient type. If you see three onions, that is one entry
   with quantity 3 and unit "pieces".
4. Only list what is visibly identifiable. Do not infer that a kitchen probably
   contains salt. Do not guess at the contents of an opaque container.
5. confidence is your genuine certainty that this specific ingredient is
   present and correctly named, from 0.0 to 1.0. Be honest and calibrated:
   a partly hidden item behind other items is not 0.9. Anything you are
   guessing at belongs below 0.5.
6. Use unit "unknown" when the amount is not determinable, with quantity 1.

Return only the structured list.`;

Deno.serve(async (request: Request): Promise<Response> => {
  // Preflight first, before auth, parsing, or anything that can throw.
  const preflightResponse = preflight(request);
  if (preflightResponse) return preflightResponse;

  if (request.method !== 'POST') {
    return errorResponse(request, 'Method not allowed', 405);
  }

  const apiKey = Deno.env.get('GEMINI_API_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!apiKey || !supabaseUrl || !serviceRoleKey) {
    // Loud in the logs, vague to the caller: the client must never learn
    // whether a key exists, and the operator needs to know immediately.
    console.error(
      'Edge Function secrets missing:',
      ['GEMINI_API_KEY', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']
        .filter((name) => !Deno.env.get(name))
        .join(', ')
    );
    return errorResponse(request, 'Photo recognition is unavailable.', 503);
  }

  const authorization = request.headers.get('Authorization');
  if (!authorization) {
    return errorResponse(request, 'Sign in to scan your pantry.', 401);
  }

  /**
   * Service-role client carrying the CALLER's bearer token. Two jobs, both
   * server-verified rather than decoded-and-trusted:
   *  - auth.getUser() has Auth verify the JWT signature and return the user;
   *  - rpc() forwards the same header, so PostgREST sets request.jwt.claims
   *    and claim_pantry_scan's auth.uid() resolves to this caller — the
   *    service role key never becomes the identity being billed a scan.
   */
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    global: { headers: { Authorization: authorization } },
  });

  let user: User;
  try {
    const { data, error } = await supabaseAdmin.auth.getUser();
    if (error || !data.user) {
      return errorResponse(request, 'Sign in to scan your pantry.', 401);
    }
    user = data.user;
  } catch {
    console.error('Auth verification failed');
    return errorResponse(request, 'Photo recognition is unavailable.', 503);
  }

  // Gemini's API terms require an adult-oriented client. Google OAuth users
  // have a verified provider email; do not spend paid/free AI quota on
  // disposable unverified accounts. This is an abuse control, not proof of
  // age, so the product's age-policy decision remains documented separately.
  if (!user.email_confirmed_at) {
    return errorResponse(request, 'Verify your account to scan your pantry.', 403);
  }

  const scanLimits = readScanLimits();
  if (!scanLimits) {
    console.error('Invalid pantry scan limit configuration');
    return errorResponse(request, 'Photo recognition is unavailable.', 503);
  }

  let payload: z.infer<typeof RequestBody>;
  try {
    payload = RequestBody.parse(await request.json());
  } catch (error) {
    console.warn('Rejected malformed request', error);
    return errorResponse(request, 'Send 1 to 10 base64-encoded images.', 400);
  }

  const { data: granted, error: claimError } = await supabaseAdmin.rpc('claim_pantry_scan', {
    p_daily_limit: scanLimits.daily,
    p_global_daily_limit: scanLimits.globalDaily,
  });
  if (claimError) {
    // Budget check failing is an outage, not a denial: fail closed anyway.
    // Spending Gemini quota we cannot account for is how the attack from the
    // header comment gets back in through the side door.
    console.error('Budget claim failed', claimError);
    return errorResponse(request, 'Photo recognition is unavailable.', 503);
  }
  if (!granted) {
    return errorResponse(request, 'Daily photo limit reached. Try again tomorrow.', 429, {
      'Retry-After': String(secondsUntilUtcMidnight()),
    });
  }

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Key in a header rather than the query string: URLs end up in logs.
        'x-goog-api-key': apiKey,
        'Api-Revision': API_REVISION,
      },
      body: JSON.stringify({
        model: MODEL,
        input: [
          { type: 'text', text: PROMPT },
          ...payload.images.map((data) => ({
            type: 'image' as const,
            data,
            mime_type: payload.mimeType,
          })),
        ],
        response_format: {
          type: 'text',
          mime_type: 'application/json',
          schema: INGREDIENT_SCHEMA,
        },
        generation_config: {
          // Cataloguing is a perception task, not a creative one.
          temperature: 0,
        },
        // Do not retain this interaction as a stored conversation. HomeChef
        // does not persist the submitted images, but the provider's service
        // tier and abuse-monitoring terms still apply.
        store: false,
      }),
    });
  } catch (error) {
    console.error('Gemini request failed', error);
    return errorResponse(request, 'Could not reach photo recognition.', 502);
  }

  if (!geminiResponse.ok) {
    // The upstream body can carry prompt-derived content, key material, or
    // quota detail. Consume it so the response can be released, but never log
    // or forward the body.
    await geminiResponse.text();
    console.error(`Gemini returned ${geminiResponse.status}`);
    return errorResponse(request, 'Photo recognition failed.', 502);
  }

  const text = extractText(await geminiResponse.json());
  if (text === null) {
    console.error('Gemini response carried no text part.');
    return errorResponse(request, 'Photo recognition returned nothing usable.', 502);
  }

  let items: z.infer<typeof DetectedItems>;
  try {
    items = DetectedItems.parse(JSON.parse(text));
  } catch (error) {
    // The model output is derived from a user's photo. Keep it out of logs.
    console.error('Gemini output failed validation', error);
    return errorResponse(request, 'Photo recognition returned an unexpected shape.', 502);
  }

  return jsonResponse(request, { items });
});

function readScanLimits(): ScanLimits | null {
  const daily = readPositiveIntegerEnv(
    'DAILY_SCAN_LIMIT',
    DEFAULT_DAILY_SCAN_LIMIT,
    MAX_CONFIGURED_DAILY_SCAN_LIMIT
  );
  const globalDaily = readPositiveIntegerEnv(
    'GLOBAL_DAILY_SCAN_LIMIT',
    DEFAULT_GLOBAL_DAILY_SCAN_LIMIT,
    MAX_CONFIGURED_GLOBAL_DAILY_SCAN_LIMIT
  );

  if (daily === null || globalDaily === null) return null;
  return { daily, globalDaily };
}

function readPositiveIntegerEnv(name: string, fallback: number, maximum: number): number | null {
  const raw = Deno.env.get(name)?.trim();
  if (!raw) return fallback;

  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 && value <= maximum ? value : null;
}

/** Whole seconds until the next UTC midnight — when the daily budget resets. */
function secondsUntilUtcMidnight(): number {
  const now = new Date();
  const nextMidnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((nextMidnight - now.getTime()) / 1000));
}

/**
 * Pulls the JSON string out of the Interaction resource. The answer lives in
 * the final `model_output` step's text blocks; earlier steps can carry
 * thoughts or tool calls, so filter by step type rather than taking steps[0].
 * `unknown` in, narrowed by hand — the envelope is a third-party contract and
 * shape-checking it is cheaper than debugging a destructuring crash in a
 * deployed function.
 */
function extractText(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;

  const steps = (body as { steps?: unknown }).steps;
  if (!Array.isArray(steps)) return null;

  for (const step of steps) {
    const record = step as { type?: unknown; content?: unknown };
    if (record.type !== 'model_output') continue;

    const content = record.content;
    if (!Array.isArray(content)) continue;

    for (const block of content) {
      const value = block as { type?: unknown; text?: unknown };
      if (
        value?.type === 'text' &&
        typeof value.text === 'string' &&
        value.text.trim().length > 0
      ) {
        return value.text;
      }
    }
  }

  return null;
}
