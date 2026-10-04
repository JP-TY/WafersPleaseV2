/**
 * Asset budget gate — the Phase 1 exit criterion, asserted in CI.
 *
 * Fails if the shipped prop set exceeds the total budget, or if any single
 * prop is large enough to stall headset streaming on its own. Run standalone
 * with `pnpm assets:budget`; also invoked at the end of build-assets.mjs.
 */

import { readdir, stat, mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');

const OUT_DIR = path.join(PKG_ROOT, 'public/models');

const BUDGET_TOTAL = 4 * 1024 * 1024;
/** No single prop may exceed this; a headset fetching one 1.5 MB prop is a visible stall. */
const BUDGET_SINGLE = 1024 * 1024;

const mib = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const kib = (n) => `${(n / 1024).toFixed(1)} KB`;

async function main() {
  if (!existsSync(OUT_DIR)) {
    console.error(`no optimized models at ${OUT_DIR} — run \`pnpm assets:build\` first.`);
    process.exit(1);
  }

  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.glb')).sort();
  if (files.length === 0) {
    console.error(`no .glb in ${OUT_DIR}`);
    process.exit(1);
  }

  const sizes = [];
  for (const f of files) {
    sizes.push({ name: path.basename(f, '.glb'), bytes: (await stat(path.join(OUT_DIR, f))).size });
  }
  const total = sizes.reduce((s, r) => s + r.bytes, 0);

  const violations = [];
  if (total > BUDGET_TOTAL) {
    violations.push(`total ${mib(total)} exceeds ${mib(BUDGET_TOTAL)}`);
  }
  for (const s of sizes) {
    if (s.bytes > BUDGET_SINGLE) {
      violations.push(`${s.name} ${kib(s.bytes)} exceeds single-prop ${mib(BUDGET_SINGLE)}`);
    }
  }

  console.log(`asset budget: ${files.length} props, ${mib(total)} total`);
  for (const s of sizes) {
    const bar = '#'.repeat(Math.max(1, Math.round((s.bytes / BUDGET_SINGLE) * 24)));
    console.log(`  ${s.name.padEnd(16)} ${kib(s.bytes).padStart(9)}  ${bar}`);
  }

  if (violations.length > 0) {
    console.error(`\nFAIL:\n  ${violations.join('\n  ')}`);
    process.exit(1);
  }

  console.log(`\nPASS — ${mib(total)} of ${mib(BUDGET_TOTAL)} budget used.`);
  await mkdir(path.join(PKG_ROOT, 'public'), { recursive: true });
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify({ generatedBy: 'packages/content/scripts/build-assets.mjs', budgetTotal: BUDGET_TOTAL, props: sizes }, null, 2)}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});