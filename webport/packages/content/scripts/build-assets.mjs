/**
 * Asset build pipeline — Phase 1.
 *
 * Source:  Assets/Models/*.glb  (Unity project, 53.8 MB, glTF 2.0 binary)
 * Output:  packages/content/public/models/*.glb  (budget: <= 4 MB total)
 *
 * What the source actually contains (verified 2026-10-04):
 *   8 props, ~76k triangles total, 2 textures per file (one 2048x2048 JPEG
 *   + one 2048x2048 PNG). ~99.9% of the payload is texture data, so texture
 *   re-encoding is where the win is; the geometry is already trivial and is
 *   left un-simplified so authoring can continue at full fidelity.
 *
 * WebXR constraint: WebGL2 is the mandatory production renderer (WebGPU-in-
 * WebXR is experimental in Quest Browser), so output stays WebGL2-safe.
 * Meshopt rather than Draco because it decodes ~10x faster, which matters
 * when every prop must be resident in a headset's VRAM.
 *
 * Textures go to WebP. Measured both:
 *
 *   WebP  1024px  388.7 KB/prop   3.16 MB total   <- shipped
 *   KTX2  1024px  1270.5 KB/prop  ~10.4 MB total   <- 3.3x the wire size
 *
 * KTX2/UASTC transcode to a native GPU format and so cost ~8x less VRAM
 * (the gltf-transform docs warn PNG/JPEG/WebP "may consume 4-8x more GPU
 * memory"). At this asset scale that warning does not bite: 16 textures at
 * 1024px is 64 MB of VRAM, i.e. 1-3% of any target's budget, against a 3.3x
 * transfer-size regression and a 23s-per-prop UASTC encode. WebP is the
 * right trade here. KTX2 earns its keep on large streaming environments, so
 * the path is kept and is selectable via CONTENT_TEXTURE_FORMAT=ktx2.
 * Requires KTX-Software's `ktx` on PATH (installed at ~/.local/bin/ktx).
 */

import { readdir, mkdir, stat, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../../..');

const SRC_DIR = path.join(REPO_ROOT, 'Assets/Models');
const OUT_DIR = path.join(PKG_ROOT, 'public/models');
const GLTF_TRANSFORM = path.join(PKG_ROOT, 'node_modules/.bin/gltf-transform');

const DEFAULTS = {
  maxTextureSize: 1024,
  /**
   * CPU effort for the WebP/UASTC encoders, 0-100. Only used when KTX2 is
   * available; `optimize`'s WebP pass exposes no quality knob (the separate
   * `webp` command has --effort, not --quality, and re-encoding an already
   * WebP texture lossily grows the file — verified 570KB -> 678KB).
   */
  effort: 7,
};

const budget = {
  total: 4 * 1024 * 1024,
  single: 1024 * 1024,
};

const mib = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;
const kib = (n) => `${(n / 1024).toFixed(1)} KB`;

/** True if KTX-Software's `ktx` CLI is reachable. Required only for KTX2 output. */
function haveKtx() {
  const dirs = (process.env.PATH || '').split(':').filter(Boolean);
  return dirs.some((d) => existsSync(path.join(d, 'ktx')));
}

/**
 * Texture target. Explicit rather than auto-detected: `ktx` being on PATH does
 * not make KTX2 the right answer (see header). Defaults to WebP; override with
 * CONTENT_TEXTURE_FORMAT=ktx2 for large streaming environments.
 */
function chooseFormat() {
  const requested = (process.env.CONTENT_TEXTURE_FORMAT || 'webp').toLowerCase();
  if (!['webp', 'ktx2', 'avif'].includes(requested)) {
    throw new Error(`CONTENT_TEXTURE_FORMAT must be webp|ktx2|avif, got "${requested}"`);
  }
  if (requested === 'ktx2' && !haveKtx()) {
    throw new Error(
      'CONTENT_TEXTURE_FORMAT=ktx2 requires KTX-Software on PATH (provides the `ktx` binary).'
    );
  }
  return requested;
}

async function dirSize(dir) {
  let total = 0;
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    total += entry.isDirectory() ? await dirSize(p) : (await stat(p)).size;
  }
  return total;
}

async function optimizeOne(src, dst, textureFormat) {
  // A single `optimize` pass. Do NOT chain a second `webp` pass: `optimize`
  // already encodes to WebP, and re-encoding an already-WebP texture is lossy
  // and grows the output (measured: 570KB -> 678KB on Foup).
  const args = [
    'optimize', src, dst,
    '--compress', 'meshopt',
    '--texture-compress', textureFormat,
    '--texture-size', String(DEFAULTS.maxTextureSize),
    // Keep authoring fidelity: 76k tris total across all props is already trivial.
    '--simplify', 'false',
  ];
  if (textureFormat === 'ktx2') {
    args.push('--texture-effort', String(DEFAULTS.effort));
  }

  await run(GLTF_TRANSFORM, args, { cwd: PKG_ROOT, maxBuffer: 32 * 1024 * 1024 });
}

async function main() {
  if (!existsSync(SRC_DIR)) throw new Error(`source model directory not found: ${SRC_DIR}`);
  if (!existsSync(GLTF_TRANSFORM)) {
    throw new Error(`gltf-transform not installed at ${GLTF_TRANSFORM} — run \`pnpm install\` in packages/content`);
  }

  const sources = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.glb')).sort();
  if (sources.length === 0) throw new Error(`no .glb files in ${SRC_DIR}`);

  const textureFormat = chooseFormat();
  await rm(OUT_DIR, { recursive: true, force: true });
  await mkdir(OUT_DIR, { recursive: true });

  const srcTotal = await dirSize(SRC_DIR);
  console.log(`source: ${SRC_DIR}`);
  console.log(`  ${sources.length} props, ${mib(srcTotal)}`);
  console.log(`  target: meshopt geometry + ${textureFormat.toUpperCase()} textures @ ${DEFAULTS.maxTextureSize}px\n`);

  const rows = [];
  for (const file of sources) {
    const name = path.basename(file, '.glb');
    const src = path.join(SRC_DIR, file);
    const dst = path.join(OUT_DIR, `${name}.glb`);
    const before = (await stat(src)).size;

    try {
      await optimizeOne(src, dst, textureFormat);
      const after = (await stat(dst)).size;
      console.log(`  ${name.padEnd(16)} ${mib(before).padStart(9)} -> ${kib(after).padStart(9)}  (-${((1 - after / before) * 100).toFixed(1)}%)`);
      rows.push({ name, before, after, error: null });
    } catch (err) {
      const detail = (err.stderr || err.message || '').toString().split('\n').filter(Boolean).slice(-2).join(' ');
      console.error(`  ${name.padEnd(16)} ${mib(before).padStart(9)} ->   FAILED  ${detail}`);
      rows.push({ name, before, after: null, error: detail });
    }
  }

  const ok = rows.filter((r) => r.after !== null);
  const failed = rows.filter((r) => r.after === null);
  const outTotal = ok.reduce((s, r) => s + r.after, 0);

  console.log(`\noutput: ${OUT_DIR}`);
  console.log(`  ${ok.length}/${sources.length} written${failed.length ? `, ${failed.length} FAILED` : ''}`);
  if (ok.length === 0) {
    console.error('\nNo props were written — this is a pipeline failure, not a budget pass.');
    process.exit(1);
  }
  console.log(`  total ${mib(srcTotal)} -> ${mib(outTotal)}  (-${((1 - outTotal / srcTotal) * 100).toFixed(1)}%)`);

  const oversized = ok.filter((r) => r.after > budget.single);
  const overTotal = outTotal > budget.total;
  const pass = failed.length === 0 && !overTotal && oversized.length === 0;

  console.log(`  budget total ${mib(budget.total)}: ${overTotal ? 'OVER' : 'ok'}`);
  for (const r of oversized) console.log(`  OVER single-prop budget: ${r.name} ${kib(r.after)}`);

  await writeManifest(rows, ok, outTotal, textureFormat);

  if (!pass) {
    console.error('\nFAIL — see above. Options: lower texture size/quality, or add LOD tiers.');
    process.exit(1);
  }
  console.log(`\nPASS — ${mib(outTotal)} of ${mib(budget.total)} used.`);
}

async function writeManifest(rows, ok, total, textureFormat) {
  const { writeFile } = await import('node:fs/promises');
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        generatedBy: 'packages/content/scripts/build-assets.mjs',
        source: 'Assets/Models',
        geometry: 'meshopt',
        textures: { format: textureFormat, maxSize: DEFAULTS.maxTextureSize, effort: DEFAULTS.effort },
        budget: { total: budget.total, single: budget.single },
        totalBytes: total,
        props: ok.map((r) => ({ name: r.name, bytes: r.after, sourceBytes: r.before })),
      },
      null,
      2
    )}\n`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});