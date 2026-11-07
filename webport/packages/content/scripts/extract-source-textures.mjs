/**
 * Extract baseColor + normal from Unity source GLBs into a working directory
 * for reauthor-textures.py.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = path.resolve(HERE, '..');
const REPO_ROOT = path.resolve(PKG_ROOT, '../../..');
const SRC_DIR = path.join(REPO_ROOT, 'Assets/Models');
const OUT = process.argv[2] || path.join(PKG_ROOT, '.tmp-src-tex');

const PROPS = ['Foup', 'Console', 'Inspection', 'DataSlate'];

async function main() {
  await mkdir(OUT, { recursive: true });
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
  for (const name of PROPS) {
    const src = path.join(SRC_DIR, `${name}.glb`);
    if (!existsSync(src)) throw new Error(`missing ${src}`);
    const doc = await io.read(src);
    for (const mat of doc.getRoot().listMaterials()) {
      const bc = mat.getBaseColorTexture();
      const nrm = mat.getNormalTexture();
      if (bc) {
        const ext = bc.getMimeType() === 'image/png' ? 'png' : 'jpg';
        await writeFile(path.join(OUT, `${name}_albedo.${ext}`), bc.getImage());
      }
      if (nrm) {
        await writeFile(path.join(OUT, `${name}_normal.png`), nrm.getImage());
      }
    }
    console.log(`extracted ${name}`);
  }
  console.log(`-> ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
