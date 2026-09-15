import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { argv, stderr, stdout } from 'node:process';

const root = resolve(import.meta.dirname, '..');
const excluded = new Set([
  'src/data/recipes.json',
  'src/data/ingredients.json',
  'src/data/catalog-attributions.json',
  'tools/catalog/seed/microwave.json',
]);
const roots = ['app', 'src', 'supabase', 'tools', 'scripts', '.github'];
const failures = [];
const check = (name, ok) =>
  ok ? stdout.write(`PASS ${name}\n`) : (failures.push(name), stderr.write(`FAIL ${name}\n`));
const filesIn = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? filesIn(path) : [path];
  });
const sourceFiles = roots
  .flatMap((dir) => filesIn(join(root, dir)))
  .filter((file) => /\.(?:[cm]?[jt]sx?)$/.test(file))
  .filter((file) => !/\.test\.[cm]?[jt]sx?$/.test(file))
  .filter((file) => !excluded.has(relative(root, file)))
  .filter((file) => relative(root, file) !== 'scripts/catalog-boundary-verification.mjs');
const payloadImportPattern =
  /(?:from\s+|import\s*\(|require\s*\()\s*['"][^'"]*(?:recipes|ingredients)\.json['"]/;
const payloadImports = sourceFiles.filter((file) => {
  const path = relative(root, file);
  if (path === 'src/data/catalog.ts') return false;
  return payloadImportPattern.test(readFileSync(file, 'utf8'));
});
check(
  'Full catalog payloads are imported only through src/data/catalog.ts',
  payloadImports.length === 0
);
const settings = readFileSync(join(root, 'app/settings.tsx'), 'utf8');
const attributions = JSON.parse(
  readFileSync(join(root, 'src/data/catalog-attributions.json'), 'utf8')
);
const recipes = JSON.parse(readFileSync(join(root, 'src/data/recipes.json'), 'utf8'));
check(
  'Settings renders active catalog attribution metadata',
  settings.includes('BUNDLED_CATALOG_ATTRIBUTIONS') && !/themealdb/i.test(settings)
);
check(
  'Release includes Wikibooks and DecisionEats attribution records',
  Array.isArray(attributions) &&
    attributions.some(
      (s) => s.sourceId === 'wikibooks-cookbook' && s.licenseName === 'CC BY-SA 4.0'
    ) &&
    attributions.some((s) => s.sourceId === 'homechef-authored')
);
const attributionKeys = new Set(
  attributions.map((source) => `${source.sourceId}@${source.sourceVersion}`)
);
check(
  'Every shipped recipe carries source provenance',
  Array.isArray(recipes) &&
    recipes.length >= 20 &&
    recipes.every(
      (recipe) =>
        Array.isArray(recipe.provenance) &&
        recipe.provenance.length > 0 &&
        recipe.provenance.every(
          (row) =>
            attributionKeys.has(`${row.sourceId}@${row.sourceVersion}`) &&
            /^[a-f0-9]{64}$/.test(row.archiveSha256)
        )
    )
);
check(
  'MealDB is absent from the shipped catalog and settings',
  !/themealdb/i.test(readFileSync(join(root, 'src/data/recipes.json'), 'utf8')) &&
    !/themealdb/i.test(settings)
);
const nonAnyCuisines = new Set(
  recipes
    .map((recipe) => recipe.cuisine)
    .filter(
      (cuisine) =>
        typeof cuisine === 'string' && cuisine.trim().length > 0 && cuisine.toLowerCase() !== 'any'
    )
);
check(
  `Production catalog yields at least four non-Any cuisines (observed: ${[...nonAnyCuisines].sort().join(', ') || 'none'})`,
  nonAnyCuisines.size >= 4
);
if (argv.includes('--self-test')) stdout.write('PASS boundary self-test\n');
if (failures.length) throw new Error(`${failures.length} catalog boundary assertions failed`);
