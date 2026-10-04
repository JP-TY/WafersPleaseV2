# Phase 1 — Asset Pipeline (complete 2026-10-04)

## Result

| Metric | Before | After | Change |
|---|---|---|---|
| Total payload | 53.78 MB | **3.16 MB** | **−94.1%** (17×) |
| Largest prop | 8.48 MB (Foup) | 557.5 KB | −93.6% |
| Geometry | 76,655 tris | 76,655 tris | **zero loss** |
| Texture size | 2048×2048 | 1024×1024 | −75% pixels |

Under the 4 MB budget with 0.84 MB headroom. Asserted by
`packages/content/scripts/check-asset-budget.mjs`, which fails CI on regression.

Per prop:

| Prop | Source | Output | Reduction |
|---|---|---|---|
| Console | 6.22 MB | 346.4 KB | −94.6% |
| DataSlate | 5.25 MB | 277.3 KB | −94.8% |
| Foup | 8.48 MB | 557.5 KB | −93.6% |
| IncidentReport | 7.26 MB | 463.5 KB | −93.8% |
| Inspection | 5.97 MB | 339.5 KB | −94.4% |
| Room | 6.41 MB | 388.7 KB | −94.1% |
| Wafer | 6.82 MB | 411.3 KB | −94.1% |
| Workbench | 7.37 MB | 450.8 KB | −94.0% |

## Why the win was available

Verified by parsing the GLB JSON chunks directly: each of the 8 props is **one mesh of
9k–14k verts**, carrying **two 2048×2048 textures** (one JPEG, one PNG). The geometry was
already trivial — ~99.9% of every file was texture data. Re-encoding textures was the entire
opportunity; no decimation was needed or wanted.

## Pipeline

`gltf-transform optimize`, one pass per prop:

```
gltf-transform optimize <src> <dst>
  --compress meshopt          geometry: ~10x faster decode than Draco, which matters
                              when every prop must be resident in headset VRAM
  --texture-compress webp     --texture-size 1024
  --simplify false            preserve authoring fidelity; geometry is already cheap
```

**Do not chain a second `webp` pass.** `optimize` already encodes to WebP and the separate
`webp` command has no `--quality` flag (only `--effort`). Re-encoding an already-WebP texture is
lossy *and* grows the file — measured 570 KB → 678 KB on Foup. This was the cause of an initial
4.04 MB (over-budget) result; removing the redundant pass is what brought it to 3.16 MB.

## WebP vs KTX2 — measured, not assumed

KTX-Software v4.4.0 was installed to `~/.local/bin/ktx` (needs `LD_LIBRARY_PATH` to the bundled
`libktx.so.4`; a wrapper script handles this) so the alternative could be measured rather than
argued about:

| | Wire size (Room) | Total projected | GPU VRAM |
|---|---|---|---|
| **WebP 1024** | **388.7 KB** | **3.16 MB** | ~64 MB (16 × 1024² RGBA) |
| KTX2/UASTC 1024 | 1270.5 KB | ~10.4 MB | ~16 MB |

gltf-transform warns that PNG/JPEG/WebP "may consume 4-8x more GPU memory" than GPU-native
compression. At *this* asset scale the warning does not bite: 64 MB is 1–3% of any target's VRAM
budget, against a **3.3× transfer-size regression** and a 23-second-per-prop UASTC encode.

**WebP ships. KTX2 is kept and selectable** via `CONTENT_TEXTURE_FORMAT=ktx2` for when a future
streaming environment makes VRAM the scarce resource. The choice is explicit rather than
auto-detected, precisely because `ktx` being on PATH does not make KTX2 correct here.

## Decode verification (not just byte counts)

Byte counts prove nothing about whether an engine can read the files. The shipped GLBs declare
three extensions in `extensionsRequired`, so a silent decoder miss would make them **unloadable**:

```
EXT_meshopt_compression    geometry
KHR_mesh_quantization      quantized attributes
EXT_texture_webp           texture format
```

Verified in a real browser (Chromium via Playwright) loading through Babylon.js 9.29.0 with ES6
tree-shaken imports:

**8/8 loaded, 0 failures, 76,655 triangles decoded — matching the source GLBs exactly.**
Each prop: 1 mesh, `Material_0` (PBRMaterial), 1024×1024 WebP base-colour + normal textures.

Two false passes were caught and fixed during this verification, both worth recording:

1. **`result.meshes[0]` is a `__root__` placeholder**, not the model. Reading stats from it
   reported `tris: 0, materials: none` while the models were in fact rendering correctly — a
   green result from an empty measurement. Now filters on `getTotalIndices() > 0`.
2. **`mesh.materials` is `undefined` in Babylon 9**; the property is `mesh.material` (singular).
   Reading the plural made every prop report "no textures decoded" even though `scene.textures`
   held both decoded WebP maps.

Both would have shipped as false confidence. The harness now asserts positively: non-zero
triangles, a material present, and at least one resolved texture with a real pixel size.

### Babylon 9 gotchas recorded for Phase 4

- **glTF moved out of `@babylonjs/core`** into a separate package:
  `import '@babylonjs/loaders/glTF/2.0/index.js'` (plus `@babylonjs/loaders` as a dependency).
- `SceneLoader.LoadAssetContainerAsync` needs `GLTFFileLoader` registered explicitly; doing so
  across the `@babylonjs/loaders` / `@babylonjs/core` boundary failed with
  `addPendingData is not a function`. `ImportMeshAsync` works and is what the harness uses.
- Bundle cost observed: 1.34 MB raw / 308 KB gzip for the scene + glTF loader **with PBR
  materials**. Budget imports carefully in Phase 4.

## Layout

```
webport/packages/content/
├── package.json
├── scripts/
│   ├── build-assets.mjs          # the pipeline; regenerates everything
│   └── check-asset-budget.mjs    # CI gate; also writes manifest.json
└── public/models/                # 3.16 MB, COMMITTED (not ignored)
    ├── *.glb  (8)
    └── manifest.json             # per-prop sizes + settings, for load budgeting
```

Run with `pnpm assets:build` / `pnpm assets:budget` from `webport/`. Note the source path is
resolved as `../../../Assets/Models` — the extra level is the `webport/` wrapper documented in
`docs/WEB_PORT_PLAN.md`.

Output is **committed, not gitignored**: at 3.16 MB it costs nothing, deploys then need no image
toolchain, and asset changes stay reviewable in diffs. Regenerate with `pnpm assets:build`.

## Not done / carried forward

- **No LOD tiers.** Not needed at 76k tris total, and the props are all single-mesh. Revisit only
  if a future asset is heavy enough to matter.
- **`ktx` wrapper depends on `/tmp` for `libktx.so.4`.** Only matters if KTX2 is ever selected;
  reinstall KTX-Software to a permanent prefix before relying on it.
- **Visual QA was a grid render**, not an in-game lighting pass. Material/normal-map correctness
  under the real cleanroom lighting is Phase 4 work.