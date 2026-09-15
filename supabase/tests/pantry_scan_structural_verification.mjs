import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { stdout } from 'node:process';

const root = resolve(import.meta.dirname, '..', '..');
const migration = readFileSync(
  resolve(root, 'supabase/migrations/20260909120000_global_pantry_scan_budget.sql'),
  'utf8'
);
const functionSource = readFileSync(
  resolve(root, 'supabase/functions/analyze-pantry-photo/index.ts'),
  'utf8'
);
const clientSource = readFileSync(resolve(root, 'src/lib/pantry-photo.ts'), 'utf8');
const scanSource = readFileSync(resolve(root, 'app/scan.tsx'), 'utf8');

const assertions = [];

function assert(name, condition) {
  assertions.push({ name, condition });
}

assert(
  'global ledger is private and RLS-protected',
  migration.includes('create table private.pantry_scan_global_usage') &&
    migration.includes('alter table private.pantry_scan_global_usage enable row level security')
);
assert(
  'claim function has both limits and a pinned empty search path',
  migration.includes('p_global_daily_limit int') &&
    migration.includes("set search_path = ''") &&
    migration.includes('pg_catalog.pg_advisory_xact_lock')
);
assert(
  'claim function updates both ledgers',
  migration.includes('private.pantry_scan_global_usage') &&
    migration.includes('private.pantry_scan_usage') &&
    migration.includes('return false') &&
    migration.includes('return true')
);
assert(
  'only service_role can execute the two-limit claim',
  migration.includes('revoke execute on function private.claim_pantry_scan(int, int)') &&
    migration.includes(
      'grant execute on function private.claim_pantry_scan(int, int) to service_role'
    )
);
assert(
  'function reads configurable limits with conservative defaults',
  functionSource.includes('DEFAULT_GLOBAL_DAILY_SCAN_LIMIT = 1_000') &&
    functionSource.includes("'DAILY_SCAN_LIMIT'") &&
    functionSource.includes("'GLOBAL_DAILY_SCAN_LIMIT'") &&
    functionSource.includes('p_global_daily_limit: scanLimits.globalDaily')
);
assert(
  'unverified accounts are rejected before budget claim',
  functionSource.includes('user.email_confirmed_at') &&
    functionSource.includes('Verify your account to scan your pantry.')
);
assert(
  'provider and model output bodies are not logged',
  !functionSource.includes('console.error(`Gemini returned ${geminiResponse.status}`,') &&
    !functionSource.includes('text.slice(0, 500)')
);
assert(
  'client maps the verified-account response',
  clientSource.includes('status === 403') &&
    clientSource.includes('Verify your account to scan your pantry.')
);
assert(
  'photo screen discloses provider processing and review responsibility',
  scanSource.includes('third-party photo-recognition provider') &&
    scanSource.includes('not medical or allergy-safety advice')
);

const failed = assertions.filter(({ condition }) => !condition);
for (const { name, condition } of assertions) {
  stdout.write(`${condition ? 'PASS' : 'FAIL'} ${name}\n`);
}

if (failed.length > 0) {
  throw new Error(`${failed.length} pantry scan structural assertions failed`);
}
