/**
 * Embed re-authored albedo + ORM into source dress GLBs, then meshopt+webp optimize.
 *
 * Reads packages/content/textures/<Prop>/{albedo.png,orm.png} produced by
 * reauthor-textures.py. Writes packages/content/public/models/<Prop>.glb.
 * Non-dress props are left untouched (caller may copy them through build-assets).
 *
 * Keeps EXT_meshopt_compression + EXT_texture_webp — same decode path as before.
 */

import { readdir, mkdir, stat, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const run = promisify(execFile);

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../../..');
const SRC_DIR = path.join(REPO_ROOT, 'Assets/Models');
const TEX_DIR = path.join(PKG_ROOT, 'textures');
const OUT_DIR = path.join(PKG_ROOT, 'public/models');
const TMP_DIR = path.join(PKG_ROOT, '.tmp-reauthor');
const GLTF_TRANSFORM = path.join(PKG_ROOT, 'node_modules/.bin/gltf-transform');

const DRESS = ['Foup', 'Console', 'Inspection', 'DataSlate'];

/** Optional override: --mesh-src=path/to/Foup.glb (reauthored silhouette). */
function meshSrcFor(name, meshSrcArg) {
  if (meshSrcArg) {
    const p = path.resolve(PKG_ROOT, meshSrcArg);
    if (path.basename(p, '.glb') !== name && !p.endsWith(`${name}.glb`)) {
      // Allow a dedicated Foup mesh file even if basename differs.
      if (name === 'Foup') return p;
    }
    return p;
  }
  return path.join(SRC_DIR, `${name}.glb`);
}

const DEFAULTS = {
  maxTextureSize: 1024,
};

const budget = {
  total: 4 * 1024 * 1024,
  single: 1024 * 1024,
};

const kib = (n) => `${(n / 1024).toFixed(1)} KB`;
const mib = (n) => `${(n / 1024 / 1024).toFixed(2)} MB`;

function makeIo() {
  // Source Unity GLBs are uncompressed — no meshopt dependency needed to read.
  return new NodeIO().registerExtensions(ALL_EXTENSIONS);
}

async function embedOne(name, meshSrcArg) {
  const albedoPath = path.join(TEX_DIR, name, 'albedo.png');
  const ormPath = path.join(TEX_DIR, name, 'orm.png');
  if (!existsSync(albedoPath) || !existsSync(ormPath)) {
    throw new Error(`missing textures for ${name} — run reauthor-textures.py first`);
  }
  const src = meshSrcFor(name, meshSrcArg);
  if (!existsSync(src)) throw new Error(`missing source ${src}`);
  console.log(`  mesh ${src}`);

  const io = makeIo();
  const doc = await io.read(src);
  const root = doc.getRoot();
  const mats = root.listMaterials();
  if (mats.length === 0) throw new Error(`${name}: no materials`);

  const albedoBytes = await readFile(albedoPath);
  const ormBytes = await readFile(ormPath);

  const albedoTex = doc.createTexture(`${name}_albedo`).setMimeType('image/png').setImage(albedoBytes);
  const ormTex = doc.createTexture(`${name}_orm`).setMimeType('image/png').setImage(ormBytes);

  for (const mat of mats) {
    const matName = (mat.getName() || '').toLowerCase();
    const base = mat.getBaseColorFactor() || [1, 1, 1, 1];
    const isGlass =
      matName.includes('glass') ||
      matName.includes('polycarb') ||
      (typeof base[3] === 'number' && base[3] < 0.99);
    if (isGlass) {
      // Preserve separate FOUP polycarb pane — do not stamp opaque bake atlases on it.
      const alpha = typeof base[3] === 'number' ? Math.min(0.55, Math.max(0.32, base[3])) : 0.42;
      mat.setBaseColorTexture(null);
      mat.setMetallicRoughnessTexture(null);
      mat.setBaseColorFactor([0.62, 0.84, 0.92, alpha]);
      mat.setMetallicFactor(0);
      mat.setRoughnessFactor(0.06);
      mat.setAlpha(alpha);
      if (typeof mat.setAlphaMode === 'function') mat.setAlphaMode('BLEND');
      console.log(`  preserve glass mat "${mat.getName()}" alpha=${alpha.toFixed(2)}`);
      continue;
    }
    // Keep existing normal map; replace baseColor; add metal/rough.
    mat.setBaseColorTexture(albedoTex);
    mat.setMetallicRoughnessTexture(ormTex);
    // Absolute ORM values (factors = 1).
    mat.setMetallicFactor(1);
    mat.setRoughnessFactor(1);
    mat.setBaseColorFactor([1, 1, 1, 1]);
  }

  // Drop orphaned original baseColor JPEG (normals stay referenced).
  for (const tex of root.listTextures()) {
    let used = false;
    for (const mat of root.listMaterials()) {
      if (
        mat.getBaseColorTexture() === tex ||
        mat.getNormalTexture() === tex ||
        mat.getMetallicRoughnessTexture() === tex ||
        mat.getOcclusionTexture() === tex ||
        mat.getEmissiveTexture() === tex
      ) {
        used = true;
        break;
      }
    }
    if (!used) tex.dispose();
  }

  await mkdir(TMP_DIR, { recursive: true });
  const staged = path.join(TMP_DIR, `${name}.glb`);
  await io.write(staged, doc);
  return staged;
}

async function optimizeOne(src, dst) {
  const args = [
    'optimize',
    src,
    dst,
    '--compress',
    'meshopt',
    '--texture-compress',
    'webp',
    '--texture-size',
    String(DEFAULTS.maxTextureSize),
    '--simplify',
    'false',
  ];
  await run(GLTF_TRANSFORM, args, { cwd: PKG_ROOT, maxBuffer: 64 * 1024 * 1024 });
}

async function main() {
  if (!existsSync(GLTF_TRANSFORM)) {
    throw new Error(`gltf-transform missing at ${GLTF_TRANSFORM}`);
  }
  await mkdir(OUT_DIR, { recursive: true });

  const propArg = process.argv.find((a) => a.startsWith('--props='));
  const meshSrcArg = (process.argv.find((a) => a.startsWith('--mesh-src=')) || '').slice('--mesh-src='.length) || null;
  const propList = propArg
    ? propArg
        .slice('--props='.length)
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : process.argv.includes('--props')
      ? process.argv.slice(process.argv.indexOf('--props') + 1).filter((a) => !a.startsWith('-'))
      : DRESS;
  const targets = propList.length ? propList : DRESS;
  for (const name of targets) {
    if (!DRESS.includes(name)) throw new Error(`unknown dress prop ${name}`);
  }

  const rows = [];
  for (const name of targets) {
    const before = existsSync(path.join(OUT_DIR, `${name}.glb`))
      ? (await stat(path.join(OUT_DIR, `${name}.glb`))).size
      : 0;
    console.log(`embed ${name}…`);
    const staged = await embedOne(name, name === 'Foup' ? meshSrcArg : null);
    const dst = path.join(OUT_DIR, `${name}.glb`);
    console.log(`optimize ${name}…`);
    await optimizeOne(staged, dst);
    const after = (await stat(dst)).size;
    console.log(`  ${name.padEnd(12)} ${kib(before).padStart(9)} -> ${kib(after).padStart(9)}`);
    rows.push({ name, before, after });

    // Verify meshopt + webp + metallicRoughness survived.
    const { stdout } = await run(GLTF_TRANSFORM, ['inspect', dst], {
      cwd: PKG_ROOT,
      maxBuffer: 16 * 1024 * 1024,
    });
    const okMeshopt = stdout.includes('EXT_meshopt_compression');
    const okWebp = stdout.includes('EXT_texture_webp') || stdout.includes('image/webp');
    const okMr = /metallicRoughnessTexture|metalRough/i.test(stdout) || stdout.includes('metallicRoughness');
    // inspect table lists texture slots — look for metallicRoughnessTexture
    const slotOk = stdout.includes('metallicRoughnessTexture') || stdout.includes('metalRoughness');
    console.log(`  verify meshopt=${okMeshopt} webp=${okWebp} mrSlot=${slotOk || okMr}`);
    if (!okMeshopt) throw new Error(`${name}: meshopt missing after optimize`);
    if (!okWebp) throw new Error(`${name}: webp missing after optimize`);
  }

  // Refresh manifest total across all props in OUT_DIR.
  const files = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.glb'));
  let total = 0;
  const props = [];
  for (const f of files) {
    const bytes = (await stat(path.join(OUT_DIR, f))).size;
    total += bytes;
    props.push({ name: path.basename(f, '.glb'), bytes });
  }
  await writeFile(
    path.join(OUT_DIR, 'manifest.json'),
    `${JSON.stringify(
      {
        generatedBy: 'packages/content/scripts/embed-reauthored.mjs',
        source: 'Assets/Models + textures/* reauthor',
        geometry: 'meshopt',
        textures: {
          format: 'webp',
          maxSize: DEFAULTS.maxTextureSize,
          albedo: meshSrcArg ? 'mesh-bake(Foup-silhouette)' : 'contrast-stretched+form-bake(Foup)',
          orm: 'authored',
          meshSrc: meshSrcArg || 'Assets/Models',
        },
        budget: { total: budget.total, single: budget.single },
        totalBytes: total,
        props,
        reauthored: rows,
      },
      null,
      2,
    )}\n`,
  );

  console.log(`\ntotal ${mib(total)} / ${mib(budget.total)}`);
  if (total > budget.total) {
    console.error('FAIL — over total budget');
    process.exit(1);
  }
  for (const r of rows) {
    if (r.after > budget.single) {
      console.error(`FAIL — ${r.name} over single-prop budget`);
      process.exit(1);
    }
  }
  console.log('PASS');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
