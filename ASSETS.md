# Wafers Please — Asset Manifest

Every art and audio asset in this project sits behind a stable string key. Nothing in the
presentation code names a file path. This document is the list of those keys and the exact
path each authored file must occupy.

## How to supply an asset

1. Find the row for the key you want to replace.
2. Author the file in the declared format, at or below the declared dimension or triangle budget.
3. Save it at the declared **drop-in path**, creating the directories if they do not exist.
4. Run the game. The `Asset_Provider` finds the file, uses it, and stops emitting the
   `PlaceholderUsed` analytics event for that key.

There is no code change, no inspector wiring, and no prefab to update. Assets are resolved by
key at load time. That holds for meshes, textures, shape glyphs, materials, audio, and text. The
nine animation keys are the one exception and the Animation section says exactly why.

Three properties of this contract are worth knowing before you start:

- **A key absent from this file fails the build.** `Asset_Manifest_Validator` compares the key
  set in this document against `AssetKeyRegistry.All` in both directions and fails on any
  difference. A programmer who adds a constant without a row here breaks the build, and so does
  a designer who adds a row here without a constant. That is deliberate: it is the only thing
  keeping this document honest.
- **A key nobody declared renders magenta.** Request a string the registry does not declare and
  you get a magenta error material plus an `UnknownAssetKey` analytics event. Loud, and
  non-fatal.
- **Placeholders are crude on purpose.** Primitive meshes, `Texture2D` pixel writes, URP
  `Lit`/`Unlit` presets, and synthesized audio clips. They are readable enough to test gameplay
  and ugly enough that nobody mistakes them for finished work.

## Key naming and path derivation

Keys are lowercase ASCII, dot-separated, of the form `<kind>.<domain>.<specifier>`. The first
segment is the kind. Where the specifier names a `Defect_Class` or a `Metrology_Tool`, it is the
enum name lowercased, so `StiVoidSeam` becomes `stivoidseam`. This rule is mechanical, which is
what lets the registry, the authored configuration, and this manifest be checked against each
other rather than merely maintained side by side.

For every kind except `text`, the drop-in path is derived from the key: drop the kind segment,
join the remaining segments with `/`, place the result under the kind root, and append the
extension.

| Kind | Root | Extension | Provider accessor |
| :---- | :---- | :---- | :---- |
| `mesh` | `Assets/Art/Meshes/` | `.fbx` | `IAssetProvider.Mesh` |
| `texture` | `Assets/Art/Textures/` | `.png` | `IAssetProvider.Texture` |
| `shape` | `Assets/Art/Shapes/` | `.png` | `IAssetProvider.Texture` |
| `material` | `Assets/Art/Materials/` | `.mat` | `IAssetProvider.Material` |
| `audio` | `Assets/Audio/` | `.wav` | `IAssetProvider.Audio` |
| `anim` | `Assets/Animation/` | `.anim` | `IAssetProvider.Animation`, pending |
| `text` | explicit per row | `.json` / `.md` | `IAssetProvider.Text` |

So `mesh.reworkconsole.tank.sc1` resolves to `Assets/Art/Meshes/reworkconsole/tank/sc1.fbx`,
and `audio.sfx.stamp.press` resolves to `Assets/Audio/sfx/stamp/press.wav`. Path matching is
case-insensitive; the tables below spell every path out anyway.

`text` keys are the exception because most of those files are already authored under
`Assets/Configuration/` with names that predate this convention. Their paths are listed
explicitly and are not derived.

`shape` keys carry no `texture.` prefix because the key strings are authored verbatim in
`Assets/Configuration/HighContrastPalette.json` as `shapeKey` values. The configuration is the
older contract and it wins. They are texture assets and resolve through the texture accessor.

## What the priority column means

Priority is the urgency of replacing the placeholder with an authored asset, not the importance
of the prop. Where the game design document assigns a priority to the inventory row a key
belongs to, that priority is carried through unchanged.

- **P0** — the placeholder is a real obstacle to the training goal. Author these first.
- **P1** — the placeholder works but reads as unfinished.
- **P2** — polish. The MVP is complete without these.

## Scope of the two tables

The **asset key table** below is normative: one row per `Asset_Key`, and the set of keys in it
must equal `AssetKeyRegistry.All` exactly. Every key in it is something the presentation layer
requests at runtime through the `Asset_Provider`.

The **committed artifact table** near the end is informative. It covers the game design
document inventory rows that are code or test fixtures rather than runtime assets. Those have no
`Asset_Key`, are loaded by the editor and test assemblies rather than by the presentation layer,
and are not compared against the registry.

**Parse rule for `Asset_Manifest_Validator`.** A key row is any Markdown table row whose first
cell is a single backtick-quoted token containing at least one `.` character. The token between
the backticks is the key. Every such row in this file is a key row, and every key appears in
exactly one such row. Tables that index by kind rather than by key put an undotted token in the
first cell for exactly this reason, so the rule needs no section awareness and no heading
matching: one pass over the file, one regular expression, no state.

---

## Asset keys — meshes

Author in meters, Y up, origin at the mounting point, one UV set, no embedded materials, no
embedded lights or cameras. Triangle budgets are per instance; the rollup further down accounts
for instance counts. All 41 mesh keys currently resolve to a `Texture2D`-textured primitive
assembly generated at runtime.

| Key | Current placeholder | Pri | Format | Triangle budget | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `mesh.bay.cleanroom` | Six scaled cubes forming a room shell | P0 | `.fbx` | 12000 | `Assets/Art/Meshes/bay/cleanroom.fbx` |
| `mesh.workbench.module` | Scaled cube with four cylinder legs | P0 | `.fbx` | 6000 | `Assets/Art/Meshes/workbench/module.fbx` |
| `mesh.foup.cassette` | Cube shell with five slot planes | P0 | `.fbx` | 3000 | `Assets/Art/Meshes/foup/cassette.fbx` |
| `mesh.toolrack.frame` | Cube uprights with three shelf planes | P0 | `.fbx` | 4000 | `Assets/Art/Meshes/toolrack/frame.fbx` |
| `mesh.shiftboard.housing` | Flattened cube bezel | P0 | `.fbx` | 1500 | `Assets/Art/Meshes/shiftboard/housing.fbx` |
| `mesh.setdressing.panel` | Scaled plane | P1 | `.fbx` | 800 | `Assets/Art/Meshes/setdressing/panel.fbx` |
| `mesh.setdressing.duct` | Stretched cylinder | P1 | `.fbx` | 1200 | `Assets/Art/Meshes/setdressing/duct.fbx` |
| `mesh.setdressing.signage` | Quad | P1 | `.fbx` | 200 | `Assets/Art/Meshes/setdressing/signage.fbx` |
| `mesh.background.machinery` | Three extruded cube silhouettes | P2 | `.fbx` | 3000 | `Assets/Art/Meshes/background/machinery.fbx` |
| `mesh.microscope.body` | Stacked cylinder and cube column | P0 | `.fbx` | 8000 | `Assets/Art/Meshes/microscope/body.fbx` |
| `mesh.microscope.stage` | Flat cube with two cylinder rails | P0 | `.fbx` | 2500 | `Assets/Art/Meshes/microscope/stage.fbx` |
| `mesh.microscope.focusknob` | Ribbed cylinder | P0 | `.fbx` | 900 | `Assets/Art/Meshes/microscope/focusknob.fbx` |
| `mesh.illumination.dial` | Cylinder with an index notch cube | P0 | `.fbx` | 900 | `Assets/Art/Meshes/illumination/dial.fbx` |
| `mesh.illumination.lamphead` | Cone with an emissive disc cap | P0 | `.fbx` | 1500 | `Assets/Art/Meshes/illumination/lamphead.fbx` |
| `mesh.waferstage.mount` | Cylinder chuck on a gimbal cube | P0 | `.fbx` | 3000 | `Assets/Art/Meshes/waferstage/mount.fbx` |
| `mesh.metrologycluster.frame` | Cube spine with four mount arms | P0 | `.fbx` | 2500 | `Assets/Art/Meshes/metrologycluster/frame.fbx` |
| `mesh.metrologyscreen.slot1` | Flattened cube bezel plus quad | P0 | `.fbx` | 1200 | `Assets/Art/Meshes/metrologyscreen/slot1.fbx` |
| `mesh.metrologyscreen.slot2` | Flattened cube bezel plus quad | P0 | `.fbx` | 1200 | `Assets/Art/Meshes/metrologyscreen/slot2.fbx` |
| `mesh.metrologyscreen.slot3` | Flattened cube bezel plus quad | P0 | `.fbx` | 1200 | `Assets/Art/Meshes/metrologyscreen/slot3.fbx` |
| `mesh.metrologyscreen.slot4` | Flattened cube bezel plus quad | P0 | `.fbx` | 1200 | `Assets/Art/Meshes/metrologyscreen/slot4.fbx` |
| `mesh.clipboard.traveler` | Thin cube board with a clip cube | P0 | `.fbx` | 1200 | `Assets/Art/Meshes/clipboard/traveler.fbx` |
| `mesh.clipboard.bulletinpage` | Quad | P0 | `.fbx` | 100 | `Assets/Art/Meshes/clipboard/bulletinpage.fbx` |
| `mesh.stamp.accept` | Cylinder handle on a cube die | P0 | `.fbx` | 1000 | `Assets/Art/Meshes/stamp/accept.fbx` |
| `mesh.stamp.reject` | Cylinder handle on a cube die | P0 | `.fbx` | 1000 | `Assets/Art/Meshes/stamp/reject.fbx` |
| `mesh.stamp.rework` | Cylinder handle on a cube die | P0 | `.fbx` | 1000 | `Assets/Art/Meshes/stamp/rework.fbx` |
| `mesh.glossary.tablet` | Rounded flattened cube | P1 | `.fbx` | 1200 | `Assets/Art/Meshes/glossary/tablet.fbx` |
| `mesh.printer.incident` | Cube body with a slot cutout cube | P1 | `.fbx` | 4000 | `Assets/Art/Meshes/printer/incident.fbx` |
| `mesh.printer.papersheet` | Quad with a curl segment | P1 | `.fbx` | 150 | `Assets/Art/Meshes/printer/papersheet.fbx` |
| `mesh.reworkconsole.panel` | Angled cube deck with a cube surround | P1 | `.fbx` | 5000 | `Assets/Art/Meshes/reworkconsole/panel.fbx` |
| `mesh.reworkconsole.tank.sc1` | Open-top cube with an inner liquid quad | P1 | `.fbx` | 2000 | `Assets/Art/Meshes/reworkconsole/tank/sc1.fbx` |
| `mesh.reworkconsole.tank.sc2` | Open-top cube with an inner liquid quad | P1 | `.fbx` | 2000 | `Assets/Art/Meshes/reworkconsole/tank/sc2.fbx` |
| `mesh.reworkconsole.agitationhead` | Cylinder wand with a disc emitter | P1 | `.fbx` | 1500 | `Assets/Art/Meshes/reworkconsole/agitationhead.fbx` |
| `mesh.reworkconsole.knob.gain` | Cylinder with a pointer cube | P1 | `.fbx` | 700 | `Assets/Art/Meshes/reworkconsole/knob/gain.fbx` |
| `mesh.reworkconsole.knob.phase` | Cylinder with a pointer cube | P1 | `.fbx` | 700 | `Assets/Art/Meshes/reworkconsole/knob/phase.fbx` |
| `mesh.quizboard.surface` | Flattened cube with a quad face | P1 | `.fbx` | 800 | `Assets/Art/Meshes/quizboard/surface.fbx` |
| `mesh.scaffolding.calloutsurface` | Quad | P1 | `.fbx` | 100 | `Assets/Art/Meshes/scaffolding/calloutsurface.fbx` |
| `mesh.wafer.base` | 64-segment cylinder disc with a notch cut | P0 | `.fbx` | 2000 | `Assets/Art/Meshes/wafer/base.fbx` |
| `mesh.hand.left` | Palm cube with five capsule digits | P0 | `.fbx` | 4000 | `Assets/Art/Meshes/hand/left.fbx` |
| `mesh.hand.right` | Palm cube with five capsule digits | P0 | `.fbx` | 4000 | `Assets/Art/Meshes/hand/right.fbx` |
| `mesh.controller.proxy` | Capsule grip with a disc trigger face | P0 | `.fbx` | 2500 | `Assets/Art/Meshes/controller/proxy.fbx` |
| `mesh.supervisor.avatar` | Capsule torso with cube head | P2 | `.fbx` | 12000 | `Assets/Art/Meshes/supervisor/avatar.fbx` |

Notes on the mesh set:

- The four metrology screen meshes are separate keys because the instruments mounted in the four
  `Tool_Slots` differ by day and an artist may want each screen to read as a different
  instrument. They share one material, so four meshes cost no additional SetPass calls.
- `mesh.hand.*` and `mesh.controller.proxy` are mutually exclusive at runtime: the desktop and
  hand-tracking paths show hands, the controller path shows proxies. The rollup counts the
  larger of the two.
- No prefabs. `Station_Assembler` builds the station from these meshes at runtime, and an
  EditMode guard test fails the build if a prefab instance appears in `Bootstrap.unity`. Supply
  meshes, not prefabs.

## Asset keys — textures

Author sRGB, power-of-two, with straight alpha where alpha is declared. Nothing exceeds
2048 × 2048, which keeps WebGL texture memory inside a mid-tier budget. Overlay textures are
alpha-over-transparent, never baked against a wafer background, because the same overlay is
composited over three different wafer surface states.

| Key | Current placeholder | Pri | Format | Dimensions | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `texture.wafer.surface.clean` | `Texture2D` radial gradient, neutral grey | P0 | `.png` | 2048 × 2048 | `Assets/Art/Textures/wafer/surface/clean.png` |
| `texture.wafer.surface.used` | `Texture2D` gradient with die grid scribe lines | P0 | `.png` | 2048 × 2048 | `Assets/Art/Textures/wafer/surface/used.png` |
| `texture.wafer.surface.contaminated` | `Texture2D` gradient with mottled noise | P0 | `.png` | 2048 × 2048 | `Assets/Art/Textures/wafer/surface/contaminated.png` |
| `texture.defect.bowingwarping` | `Texture2D` concentric topographic rings, alpha | P0 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/bowingwarping.png` |
| `texture.defect.substratecontamination` | `Texture2D` stipple blotches, alpha | P0 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/substratecontamination.png` |
| `texture.defect.stivoidseam` | `Texture2D` center-line seam streaks, alpha | P0 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/stivoidseam.png` |
| `texture.defect.interfacetrapsroughness` | `Texture2D` fine high-frequency noise, alpha | P0 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/interfacetrapsroughness.png` |
| `texture.defect.silicidebridging` | `Texture2D` bright stringer strokes, alpha | P0 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/silicidebridging.png` |
| `texture.defect.tungstenplugvoid` | `Texture2D` dark keyhole dots, alpha | P0 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/tungstenplugvoid.png` |
| `texture.defect.severity.parametric` | `Texture2D` 1D ramp, shallow slope | P0 | `.png` | 256 × 32 | `Assets/Art/Textures/defect/severity/parametric.png` |
| `texture.defect.severity.catastrophic` | `Texture2D` 1D ramp, steep slope | P0 | `.png` | 256 × 32 | `Assets/Art/Textures/defect/severity/catastrophic.png` |
| `texture.defect.qa.edgecase` | `Texture2D` full-coverage checker, alpha | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/defect/qa/edgecase.png` |
| `texture.wafermap.grid` | `Texture2D` die grid lines, alpha | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/wafermap/grid.png` |
| `texture.wafermap.binheat` | `Texture2D` per-die flat colour cells | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/wafermap/binheat.png` |
| `texture.rework.state.before` | `Texture2D` contamination blotches at full alpha | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/rework/state/before.png` |
| `texture.rework.state.after` | `Texture2D` residual faint blotches | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/rework/state/after.png` |
| `texture.rework.state.scrap` | `Texture2D` diagonal scrap hatching | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/rework/state/scrap.png` |
| `texture.glossary.diagram.defect.clean` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/clean.png` |
| `texture.glossary.diagram.defect.bowingwarping` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/bowingwarping.png` |
| `texture.glossary.diagram.defect.stivoidseam` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/stivoidseam.png` |
| `texture.glossary.diagram.defect.interfacetrapsroughness` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/interfacetrapsroughness.png` |
| `texture.glossary.diagram.defect.silicidebridging` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/silicidebridging.png` |
| `texture.glossary.diagram.defect.tungstenplugvoid` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/tungstenplugvoid.png` |
| `texture.glossary.diagram.defect.substratecontamination` | `Texture2D` labelled stack cross-section | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/defect/substratecontamination.png` |
| `texture.glossary.diagram.tool.stylusprofilometer` | `Texture2D` labelled instrument schematic | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/tool/stylusprofilometer.png` |
| `texture.glossary.diagram.tool.fourpointprobesims` | `Texture2D` labelled instrument schematic | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/tool/fourpointprobesims.png` |
| `texture.glossary.diagram.tool.spectroscopicellipsometry` | `Texture2D` labelled instrument schematic | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/tool/spectroscopicellipsometry.png` |
| `texture.glossary.diagram.tool.xrayrefractometry` | `Texture2D` labelled instrument schematic | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/tool/xrayrefractometry.png` |
| `texture.glossary.diagram.tool.electronmicroscope` | `Texture2D` labelled instrument schematic | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/diagram/tool/electronmicroscope.png` |
| `texture.screen.readout.grid` | `Texture2D` graticule on dark ground | P0 | `.png` | 1024 × 512 | `Assets/Art/Textures/screen/readout/grid.png` |
| `texture.shiftboard.faceplate` | `Texture2D` field labels on dark ground | P0 | `.png` | 2048 × 512 | `Assets/Art/Textures/shiftboard/faceplate.png` |
| `texture.clipboard.travelerform` | `Texture2D` ruled form on cream ground | P0 | `.png` | 1024 × 1448 | `Assets/Art/Textures/clipboard/travelerform.png` |
| `texture.clipboard.bulletinpage` | `Texture2D` ruled page on cream ground | P0 | `.png` | 1024 × 1448 | `Assets/Art/Textures/clipboard/bulletinpage.png` |
| `texture.printer.debriefsheet` | `Texture2D` ruled thermal paper ground | P1 | `.png` | 1024 × 1448 | `Assets/Art/Textures/printer/debriefsheet.png` |
| `texture.glossary.tablet.faceplate` | `Texture2D` dark bezel with a screen well | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/glossary/tablet/faceplate.png` |
| `texture.quizboard.faceplate` | `Texture2D` dark board ground | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/quizboard/faceplate.png` |
| `texture.scaffolding.calloutpanel` | `Texture2D` translucent amber panel | P1 | `.png` | 1024 × 512 | `Assets/Art/Textures/scaffolding/calloutpanel.png` |
| `texture.reworkconsole.faceplate` | `Texture2D` labelled control deck | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/reworkconsole/faceplate.png` |
| `texture.stamp.legend.accept` | `Texture2D` ACCEPT legend, black on amber | P0 | `.png` | 512 × 256 | `Assets/Art/Textures/stamp/legend/accept.png` |
| `texture.stamp.legend.reject` | `Texture2D` REJECT legend, black on amber | P0 | `.png` | 512 × 256 | `Assets/Art/Textures/stamp/legend/reject.png` |
| `texture.stamp.legend.rework` | `Texture2D` REWORK legend, black on amber | P0 | `.png` | 512 × 256 | `Assets/Art/Textures/stamp/legend/rework.png` |
| `texture.stamp.inkmark.accept` | `Texture2D` ink impression, alpha | P1 | `.png` | 512 × 512 | `Assets/Art/Textures/stamp/inkmark/accept.png` |
| `texture.stamp.inkmark.reject` | `Texture2D` ink impression, alpha | P1 | `.png` | 512 × 512 | `Assets/Art/Textures/stamp/inkmark/reject.png` |
| `texture.stamp.inkmark.rework` | `Texture2D` ink impression, alpha | P1 | `.png` | 512 × 512 | `Assets/Art/Textures/stamp/inkmark/rework.png` |
| `texture.setdressing.panelwall` | `Texture2D` seamed panel tiling | P1 | `.png` | 1024 × 1024 | `Assets/Art/Textures/setdressing/panelwall.png` |
| `texture.setdressing.signage` | `Texture2D` cleanroom class placard | P1 | `.png` | 512 × 512 | `Assets/Art/Textures/setdressing/signage.png` |
| `texture.foup.label` | `Texture2D` lot identifier label | P1 | `.png` | 512 × 256 | `Assets/Art/Textures/foup/label.png` |

Notes on the texture set:

- **Six defect overlays, not thirty.** Each `Defect_Class` has one overlay, and severity is
  applied by modulating that overlay through one of the two `texture.defect.severity.*` ramps
  against `Signal_Magnitude`. That is what covers the design document's "severity variants per
  defect class" row without a combinatorial explosion of authored files, and it keeps a defect
  looking like itself across its whole intensity range.
- The six defect overlay keys and the twelve glossary diagram keys are **already referenced by
  authored configuration**: `overlayAssetKey` in `Assets/Configuration/DefectProfiles.json` and
  `diagramAssetKey` in `Assets/Configuration/Glossary.json`. Renaming either side breaks the
  other. Both files are the reason the key strings are lowercased enum names.
- `texture.defect.stivoidseam`, `texture.defect.interfacetrapsroughness`, and
  `texture.defect.tungstenplugvoid` belong to subsurface defect classes. They are never rendered
  until a revealing `Tool_Activation` completes, so author them as instrument-view imagery
  rather than as something the naked eye would catch under grazing light.
- The three paper textures are grounds, not content. The traveler text, the bulletin body, and
  the debrief report are drawn on top at runtime from localization strings.

## Asset keys — shape glyphs

Requirement 20.4 pairs every colour-coded state with a distinct shape so that colour is never
the only carrier of meaning. These fourteen key strings are authored verbatim as `shapeKey`
values in `Assets/Configuration/HighContrastPalette.json`. Author white-on-transparent; the
runtime tints them from the palette and composites them into the readout surface, so all
fourteen together cost zero additional SetPass calls.

| Key | Current placeholder | Pri | Format | Dimensions | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `shape.none` | 1 × 1 fully transparent `Texture2D` | P1 | `.png` | 1 × 1 | `Assets/Art/Shapes/none.png` |
| `shape.circle.solid` | `Texture2D` filled disc | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/circle/solid.png` |
| `shape.triangle.hollow` | `Texture2D` triangle outline | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/triangle/hollow.png` |
| `shape.square.crosshatch` | `Texture2D` crosshatched square | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/square/crosshatch.png` |
| `shape.check.glyph` | `Texture2D` check mark | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/check/glyph.png` |
| `shape.cross.diagonal` | `Texture2D` diagonal cross | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/cross/diagonal.png` |
| `shape.arrow.loop` | `Texture2D` looping arrow | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/arrow/loop.png` |
| `shape.dot.stipple` | `Texture2D` stipple field | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/dot/stipple.png` |
| `shape.line.hatch` | `Texture2D` parallel hatch lines | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/line/hatch.png` |
| `shape.bar.solid` | `Texture2D` filled bar | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/bar/solid.png` |
| `shape.bar.hatched` | `Texture2D` hatched bar | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/bar/hatched.png` |
| `shape.bracket.frame` | `Texture2D` corner bracket frame | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/bracket/frame.png` |
| `shape.diamond.hollow` | `Texture2D` diamond outline | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/diamond/hollow.png` |
| `shape.diamond.solid` | `Texture2D` filled diamond | P1 | `.png` | 128 × 128 | `Assets/Art/Shapes/diamond/solid.png` |

`shape.none` is the sentinel the palette uses for text pairs that need no shape. It is declared
so that a request for it resolves rather than falling through to the magenta error placeholder.

## Asset keys — materials and shaders

Material count is the lever on SetPass calls, so this list is deliberately short and props share
materials aggressively. If you author a replacement, keep it to one pass; a two-pass material
doubles its contribution to the SetPass rollup.

| Key | Current placeholder | Pri | Format | Shader and pass budget | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `material.wafer.readability.standard` | URP Lit preset, low smoothness, grey base | P0 | `.mat` | URP Lit, opaque, 1 pass | `Assets/Art/Materials/wafer/readability/standard.mat` |
| `material.wafer.readability.highcontrast` | URP Lit preset, flattened response | P0 | `.mat` | URP Lit, opaque, 1 pass | `Assets/Art/Materials/wafer/readability/highcontrast.mat` |
| `material.overlay.defect.standard` | URP Unlit preset, alpha blend | P0 | `.mat` | URP Unlit, transparent, 1 pass | `Assets/Art/Materials/overlay/defect/standard.mat` |
| `material.overlay.defect.highcontrast` | URP Unlit preset, palette-tinted alpha blend | P0 | `.mat` | URP Unlit, transparent, 1 pass | `Assets/Art/Materials/overlay/defect/highcontrast.mat` |
| `material.overlay.wafermap` | URP Unlit preset, alpha blend | P1 | `.mat` | URP Unlit, transparent, 1 pass | `Assets/Art/Materials/overlay/wafermap.mat` |
| `material.screen.readout` | URP Unlit preset, emissive dark ground | P0 | `.mat` | URP Unlit, opaque, 1 pass | `Assets/Art/Materials/screen/readout.mat` |
| `material.paper.printed` | URP Lit preset, high albedo, zero smoothness | P0 | `.mat` | URP Lit, opaque, 1 pass | `Assets/Art/Materials/paper/printed.mat` |
| `material.prop.cleanroom.matte` | URP Lit preset, off-white matte | P0 | `.mat` | URP Lit, opaque, 1 pass | `Assets/Art/Materials/prop/cleanroom/matte.mat` |
| `material.prop.metal.brushed` | URP Lit preset, metallic 0.8 | P0 | `.mat` | URP Lit, opaque, 1 pass | `Assets/Art/Materials/prop/metal/brushed.mat` |
| `material.prop.glass.window` | URP Lit preset, alpha blend | P1 | `.mat` | URP Lit, transparent, 1 pass | `Assets/Art/Materials/prop/glass/window.mat` |
| `material.prop.emissive.indicator` | URP Unlit preset, palette-tinted | P0 | `.mat` | URP Unlit, opaque, 1 pass | `Assets/Art/Materials/prop/emissive/indicator.mat` |
| `material.background.silhouette` | URP Unlit preset, flat dark | P2 | `.mat` | URP Unlit, opaque, 1 pass | `Assets/Art/Materials/background/silhouette.mat` |
| `material.error.unknownkey` | URP Unlit preset, flat magenta | P0 | `.mat` | URP Unlit, opaque, 1 pass | `Assets/Art/Materials/error/unknownkey.mat` |

`material.error.unknownkey` is the magenta placeholder returned for any key the registry does
not declare. Do not author a subtle replacement. Its whole job is to be impossible to miss in a
playtest.

## Asset keys — audio

48 kHz, 16-bit PCM. Mono for anything positional, stereo only for the ambient bed and the music
layers. Trim silence at the head so cue latency is the engine's fault and not the file's.

| Key | Current placeholder | Pri | Format | Length and channels | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `audio.sfx.ui.click` | Synthesized 12 ms click transient | P0 | `.wav` | ≤ 0.15 s, mono | `Assets/Audio/sfx/ui/click.wav` |
| `audio.sfx.stamp.press` | Synthesized thud with a spring tail | P0 | `.wav` | ≤ 0.5 s, mono | `Assets/Audio/sfx/stamp/press.wav` |
| `audio.sfx.tray.slide` | Synthesized filtered noise sweep | P0 | `.wav` | ≤ 1.0 s, mono | `Assets/Audio/sfx/tray/slide.wav` |
| `audio.sfx.alert.incident` | Synthesized two-tone alert | P0 | `.wav` | ≤ 1.2 s, mono | `Assets/Audio/sfx/alert/incident.wav` |
| `audio.sfx.tool.activate` | Synthesized rising servo tone | P0 | `.wav` | ≤ 0.6 s, mono | `Assets/Audio/sfx/tool/activate.wav` |
| `audio.sfx.tool.complete` | Synthesized settling chirp | P0 | `.wav` | ≤ 0.6 s, mono | `Assets/Audio/sfx/tool/complete.wav` |
| `audio.sfx.dial.tick` | Synthesized detent tick | P1 | `.wav` | ≤ 0.1 s, mono | `Assets/Audio/sfx/dial/tick.wav` |
| `audio.sfx.printer.print` | Synthesized stepper buzz | P1 | `.wav` | ≤ 2.0 s, mono | `Assets/Audio/sfx/printer/print.wav` |
| `audio.cue.reading.inspec` | Synthesized single mid tone | P1 | `.wav` | ≤ 0.4 s, mono | `Assets/Audio/cue/reading/inspec.wav` |
| `audio.cue.reading.marginal` | Synthesized wavering mid tone | P1 | `.wav` | ≤ 0.6 s, mono | `Assets/Audio/cue/reading/marginal.wav` |
| `audio.cue.reading.outofspec` | Synthesized falling low tone | P1 | `.wav` | ≤ 0.8 s, mono | `Assets/Audio/cue/reading/outofspec.wav` |
| `audio.cue.severity.parametric` | Synthesized soft double tone | P1 | `.wav` | ≤ 0.8 s, mono | `Assets/Audio/cue/severity/parametric.wav` |
| `audio.cue.severity.catastrophic` | Synthesized hard triple tone | P1 | `.wav` | ≤ 1.0 s, mono | `Assets/Audio/cue/severity/catastrophic.wav` |
| `audio.sfx.rework.submerge` | Synthesized liquid immersion swell | P1 | `.wav` | ≤ 1.2 s, mono | `Assets/Audio/sfx/rework/submerge.wav` |
| `audio.sfx.rework.raise` | Synthesized drain and drip | P1 | `.wav` | ≤ 1.5 s, mono | `Assets/Audio/sfx/rework/raise.wav` |
| `audio.sfx.rework.spray` | Synthesized filtered noise jet | P1 | `.wav` | ≤ 2.0 s, mono, loopable | `Assets/Audio/sfx/rework/spray.wav` |
| `audio.sfx.rework.purge` | Synthesized pressure release hiss | P1 | `.wav` | ≤ 2.0 s, mono | `Assets/Audio/sfx/rework/purge.wav` |
| `audio.sfx.rework.agitation` | Synthesized ultrasonic shimmer | P1 | `.wav` | ≤ 2.0 s, mono, loopable | `Assets/Audio/sfx/rework/agitation.wav` |
| `audio.sfx.rework.cyclecomplete` | Synthesized resolving two-note figure | P1 | `.wav` | ≤ 1.5 s, mono | `Assets/Audio/sfx/rework/cyclecomplete.wav` |
| `audio.ambient.cleanroom.loop` | Synthesized filtered pink noise bed | P0 | `.wav` | 30 s seamless, stereo | `Assets/Audio/ambient/cleanroom/loop.wav` |
| `audio.music.tension.layer1` | Synthesized sustained low pad | P1 | `.wav` | 32 s seamless, stereo | `Assets/Audio/music/tension/layer1.wav` |
| `audio.music.tension.layer2` | Synthesized pulse figure | P1 | `.wav` | 32 s seamless, stereo | `Assets/Audio/music/tension/layer2.wav` |
| `audio.music.tension.layer3` | Synthesized high tension line | P1 | `.wav` | 32 s seamless, stereo | `Assets/Audio/music/tension/layer3.wav` |
| `audio.voice.instructor.shiftbrief` | Synthesized placeholder tone bed | P2 | `.wav` | ≤ 30 s, mono | `Assets/Audio/voice/instructor/shiftbrief.wav` |
| `audio.voice.instructor.debrief` | Synthesized placeholder tone bed | P2 | `.wav` | ≤ 45 s, mono | `Assets/Audio/voice/instructor/debrief.wav` |

The three music layers are additive stems mixed against shift pressure, so they must share
tempo, key, and length exactly. Author them as one arrangement exported three times, not as
three independent pieces.

## Asset keys — animation

Nine keys, all currently code-driven tweens rather than authored clips. Every one of them is
gated by `Reduced_Motion`: when that accessibility flag is set, non-essential prop animation
duration goes to zero, so author clips that read correctly when cut to a single pose.

| Key | Current placeholder | Pri | Format | Length and rig | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `anim.hand.idle` | Code-driven rest pose, no motion | P0 | `.anim` | 2 s loop, hand rig | `Assets/Animation/hand/idle.anim` |
| `anim.hand.grip` | Code-driven digit curl tween | P0 | `.anim` | 0.25 s, hand rig | `Assets/Animation/hand/grip.anim` |
| `anim.hand.point` | Code-driven index extension tween | P0 | `.anim` | 0.25 s, hand rig | `Assets/Animation/hand/point.anim` |
| `anim.tool.stamp.press` | Code-driven vertical translate and return | P0 | `.anim` | 0.4 s, stamp transform | `Assets/Animation/tool/stamp/press.anim` |
| `anim.tool.wipe` | Code-driven lateral sweep | P0 | `.anim` | 0.8 s, tool transform | `Assets/Animation/tool/wipe.anim` |
| `anim.tool.panelpress` | Code-driven button depress and return | P0 | `.anim` | 0.2 s, control transform | `Assets/Animation/tool/panelpress.anim` |
| `anim.prop.paperprint` | Code-driven sheet extrusion tween | P1 | `.anim` | 2.0 s, paper transform | `Assets/Animation/prop/paperprint.anim` |
| `anim.prop.lightblink` | Code-driven emissive intensity pulse | P1 | `.anim` | 1.0 s loop, indicator material | `Assets/Animation/prop/lightblink.anim` |
| `anim.supervisor.idle` | Code-driven rest pose, no motion | P2 | `.anim` | 4 s loop, avatar rig | `Assets/Animation/supervisor/idle.anim` |

Animation is the one kind whose drop-in is not yet zero-cost. `IAssetProvider` exposes mesh,
texture, material, audio, and text accessors today. Authored clips at the paths above also
require the `AnimationClip Animation(AssetKey)` accessor listed in the kind table, which task
15.1 adds alongside the registry. Until that accessor exists, these nine keys reserve the
names and the paths; they do not yet load a file. This is called out rather than buried because
the rest of this document promises otherwise.

## Asset keys — text, copy, and configuration

These are the strings and authored data the presentation layer requests by key. Requirement 19.6
forbids path literals in presentation code, so configuration files are addressed by key too and
their paths appear here rather than in a loader.

Localization is the important one to understand: `text.localization.en` resolves the whole
baseline bundle, and the 185 string keys inside it — `callout.*`, `rule.*`, `bulletin.*`,
`debrief.*`, `outcome.*`, `remediation.*`, `quiz.*`, `station.*`, `tool.*`, `status.*`,
`phase.*`, `bench.*`, `accessibility.*`, `menu.*`, `analysis.*`, `layer.*`, `result.*` — are the
data layer's contract, not asset keys. Edit copy by editing that file. Adding a locale means
adding one key here, not 185.

| Key | Current placeholder | Pri | Format | Size | Drop-in path |
| :---- | :---- | :---- | :---- | :---- | :---- |
| `text.localization.en` | Authored, 185 entries | P0 | `.json` | 185 entries, `en` baseline | `Assets/Configuration/Localization/en.json` |
| `text.config.glossary` | Authored, 12 entries | P0 | `.json` | 7 defect plus 5 tool entries | `Assets/Configuration/Glossary.json` |
| `text.config.bulletins` | Authored, 9 pages | P0 | `.json` | 9 pages across days 1 to 3 | `Assets/Configuration/Bulletins.json` |
| `text.config.quizquestions` | Authored, 12 questions | P0 | `.json` | 12 questions, ≥ 3 per day | `Assets/Configuration/QuizQuestions.json` |
| `text.config.day1` | Authored `Day_Config` | P0 | `.json` | 1 day record | `Assets/Configuration/Days/Day1.json` |
| `text.config.day2` | Authored `Day_Config` | P0 | `.json` | 1 day record | `Assets/Configuration/Days/Day2.json` |
| `text.config.day3` | Authored `Day_Config` | P0 | `.json` | 1 day record | `Assets/Configuration/Days/Day3.json` |
| `text.config.defectprofiles` | Authored, 7 profiles | P0 | `.json` | 1 record per `Defect_Class` | `Assets/Configuration/DefectProfiles.json` |
| `text.config.scoringtable` | Authored `Scoring_Table` | P0 | `.json` | 1 table | `Assets/Configuration/ScoringTable.json` |
| `text.config.balancing` | Authored `Balancing_Config` | P0 | `.json` | 1 table | `Assets/Configuration/BalancingConfig.json` |
| `text.config.accessibilitydefaults` | Authored defaults | P1 | `.json` | 1 profile | `Assets/Configuration/AccessibilityDefaults.json` |
| `text.config.highcontrastpalette` | Authored, 21 colour pairs | P1 | `.json` | 21 pairs with contrast ratios | `Assets/Configuration/HighContrastPalette.json` |
| `text.template.debriefsheet` | Composed at runtime from `debrief.*` strings | P0 | `.md` | ≤ 1 printed page | `Assets/Configuration/Templates/DebriefSheet.md` |
| `text.template.instructorreport` | Composed at runtime from the debrief report | P2 | `.md` | ≤ 2 printed pages | `Assets/Configuration/Templates/InstructorReport.md` |

The twelve configuration files already exist and are already authored. They appear here because
they are requested by key, not because they need supplying. The two template files do not exist
yet; the runtime composes their output from localization strings until they do.

---

## Key count

| Kind | P0 | P1 | P2 | Total |
| :---- | ----: | ----: | ----: | ----: |
| `mesh` | 25 | 14 | 2 | 41 |
| `texture` | 18 | 29 | 0 | 47 |
| `shape` | 0 | 14 | 0 | 14 |
| `material` | 10 | 2 | 1 | 13 |
| `audio` | 7 | 16 | 2 | 25 |
| `anim` | 6 | 2 | 1 | 9 |
| `text` | 11 | 2 | 1 | 14 |
| **Total** | **77** | **79** | **7** | **163** |

`AssetKeyRegistry.All` must contain exactly these 163 keys.

## Triangle budget rollup

Requirement 22.3 caps visible triangles at 250,000. The worst case below assumes every prop
visible at once, including the P2 supervisor avatar and the background silhouettes, which is
more than any real camera frames.

| Group | Meshes | Instances | Triangles |
| :---- | ----: | ----: | ----: |
| Bay, workbench, FOUP, rack, shift board | 5 | 6 | 29500 |
| Ambient set dressing (panels, ducts, signage) | 3 | 13 | 9200 |
| Background machinery silhouettes | 1 | 3 | 9000 |
| Wafer and mount stage | 2 | 2 | 5000 |
| Microscope body, stage, focus knob | 3 | 3 | 11400 |
| Cross-illumination dial and two lamp heads | 2 | 3 | 3900 |
| Metrology cluster frame and four screens | 5 | 5 | 7300 |
| Traveler clipboard and three bulletin pages | 2 | 4 | 1500 |
| Three routing stamps | 3 | 3 | 3000 |
| Glossary tablet | 1 | 1 | 1200 |
| Incident printer and paper sheet | 2 | 2 | 4150 |
| Rework console, two tanks, agitation head, two knobs | 6 | 6 | 11900 |
| Quiz board and scaffolding callout surface | 2 | 2 | 900 |
| Player hands (or controller proxies, whichever is larger) | 2 | 2 | 8000 |
| Supervisor avatar | 1 | 1 | 12000 |
| **Worst-case visible total** | **40** | **56** | **117950** |

117,950 against a 250,000 ceiling leaves 132,050 triangles of headroom, 53 percent of the
budget. That headroom is the point: an authored mesh may exceed its per-row budget by up to
roughly 2× before the ceiling is at risk. Exceed it by 10× and the budget test fails, which is
the signal to decimate rather than to raise the ceiling.

The mesh column totals 40 of the 41 mesh keys, and `mesh.controller.proxy` is the omission.
At 2,500 triangles per hand it is smaller than `mesh.hand.left` and `mesh.hand.right` at 4,000
each, and the two paths are mutually exclusive, so the worst case counts the hands.

## SetPass call rollup

Requirement 22.2 caps steady-state SetPass calls at 150. SetPass count tracks distinct material
state changes, not draw calls or mesh count, so the lever is the 13-material list above plus the
per-surface texture variants that force separate material instances.

| Source | Material states | Passes each | SetPass |
| :---- | ----: | ----: | ----: |
| Shared opaque prop materials (matte, brushed metal, indicator) | 3 | 2 | 6 |
| Metrology screens, one dynamic readout texture per slot | 4 | 1 | 4 |
| Shift board readout | 1 | 1 | 1 |
| Paper surfaces: traveler, bulletin, debrief sheet | 3 | 2 | 6 |
| Glossary tablet, quiz board, rework console faceplate | 3 | 2 | 6 |
| Scaffolding callout surface | 1 | 1 | 1 |
| Stamp legends, three stamps | 3 | 2 | 6 |
| Wafer surface, one readability material at a time | 1 | 2 | 2 |
| Defect overlay, one class at a time | 1 | 1 | 1 |
| Wafer map overlay, optional training view | 1 | 1 | 1 |
| Glass: bay window and two tanks | 1 | 1 | 1 |
| Hands | 1 | 2 | 2 |
| Background silhouettes | 1 | 1 | 1 |
| Supervisor avatar | 1 | 2 | 2 |
| **Station subtotal** | **25** | | **40** |
| URP pipeline passes: shadow map, depth prepass, uber post | | | ≤ 8 |
| **Worst-case steady-state total** | | | **≤ 48** |

48 against a 150 ceiling leaves 102 calls of headroom. Two assumptions hold that number
together, and both are enforced elsewhere in the design:

- **One directional light, no additional realtime lights, no baked lighting.** Every extra
  realtime shadow-casting light multiplies the shadow-caster pass count. The scene guard test
  asserts zero baked lighting; realtime light count is a review matter.
- **Shape glyphs and screen content are composited into existing textures, not drawn as extra
  materials.** Fourteen shape keys and 47 texture keys collapse onto 13 materials because the
  runtime writes glyphs and readings into the surface texture rather than spawning a material
  per state. An authored replacement that ships its own material per glyph would add up to 14
  SetPass calls; still inside budget, but that is how the headroom gets spent.

The two-pass entries above are opaque materials that also render into the directional shadow
map. Transparent materials cast no shadows here and count once.

## Game design document inventory coverage

Requirement 19.9 requires this manifest to cover every row of the design document's MVP Asset
Inventory, sections A through H. All 47 rows are below. 41 map to at least one `Asset_Key`; the
6 that do not are code or test artifacts that the `Asset_Provider` has no business resolving,
and they are covered by the committed artifact table that follows.

| GDD row | Pri | Covered by |
| :---- | :---- | :---- |
| A1 Cleanroom inspection bay module | P0 | `mesh.bay.cleanroom`, `material.prop.cleanroom.matte` |
| A2 Inspection workbench (modular) | P0 | `mesh.workbench.module` |
| A3 Wafer cassette / FOUP containers | P0 | `mesh.foup.cassette`, `texture.foup.label`, `audio.sfx.tray.slide` |
| A4 Tool rack (cleaning / rework tools) | P0 | `mesh.toolrack.frame` |
| A5 Overhead shift board display | P0 | `mesh.shiftboard.housing`, `texture.shiftboard.faceplate`, `material.screen.readout` |
| A6 Ambient cleanroom set dressing | P1 | `mesh.setdressing.panel`, `mesh.setdressing.duct`, `mesh.setdressing.signage`, `texture.setdressing.panelwall`, `texture.setdressing.signage` |
| A7 Background machinery silhouettes | P2 | `mesh.background.machinery`, `material.background.silhouette` |
| B1 Microscope body, stage, focus knob | P0 | `mesh.microscope.body`, `mesh.microscope.stage`, `mesh.microscope.focusknob` |
| B2 Illumination control dial and switches | P0 | `mesh.illumination.dial`, `mesh.illumination.lamphead`, `audio.sfx.dial.tick` |
| B3 Physical stamp set (accept / reject / rework) | P0 | `mesh.stamp.accept`, `mesh.stamp.reject`, `mesh.stamp.rework`, the three `texture.stamp.legend.*`, the three `texture.stamp.inkmark.*`, `anim.tool.stamp.press`, `audio.sfx.stamp.press` |
| B4 Clipboard rulebook and daily bulletin pages | P0 | `mesh.clipboard.traveler`, `mesh.clipboard.bulletinpage`, `texture.clipboard.travelerform`, `texture.clipboard.bulletinpage`, `text.config.bulletins` |
| B5 In-world glossary tablet | P1 | `mesh.glossary.tablet`, `texture.glossary.tablet.faceplate`, the 12 `texture.glossary.diagram.*` keys |
| B6 Incident printer object and paper output | P1 | `mesh.printer.incident`, `mesh.printer.papersheet`, `texture.printer.debriefsheet`, `anim.prop.paperprint`, `audio.sfx.printer.print` |
| B7 Rework console panel | P1 | `mesh.reworkconsole.panel`, the two tank meshes, `mesh.reworkconsole.agitationhead`, the two knob meshes, `texture.reworkconsole.faceplate` |
| C1 Base wafer material set (clean, used, contaminated) | P0 | `texture.wafer.surface.clean`, `texture.wafer.surface.used`, `texture.wafer.surface.contaminated`, `mesh.wafer.base`, `material.wafer.readability.standard` |
| C2 Defect decal / overlay library | P0 | the six `texture.defect.<class>` keys, `material.overlay.defect.standard` |
| C3 Severity variants per defect class | P0 | `texture.defect.severity.parametric`, `texture.defect.severity.catastrophic` |
| C4 Wafer map overlay texture set | P1 | `texture.wafermap.grid`, `texture.wafermap.binheat`, `material.overlay.wafermap` |
| C5 Rework state transitions (before / after) | P1 | `texture.rework.state.before`, `texture.rework.state.after`, `texture.rework.state.scrap` |
| C6 Edge-case synthetic defects for QA | P1 | `texture.defect.qa.edgecase` |
| D1 Player hand / controller interaction rigs | P0 | `mesh.hand.left`, `mesh.hand.right`, `mesh.controller.proxy`, `anim.hand.idle`, `anim.hand.grip`, `anim.hand.point` |
| D2 Tool use animations (stamp, wipe, panel press) | P0 | `anim.tool.stamp.press`, `anim.tool.wipe`, `anim.tool.panelpress` |
| D3 UI prop micro-animations (paper print, light blink) | P1 | `anim.prop.paperprint`, `anim.prop.lightblink` |
| D4 NPC supervisor avatar and voice source | P2 | `mesh.supervisor.avatar`, `anim.supervisor.idle`, `audio.voice.instructor.shiftbrief`, `audio.voice.instructor.debrief` |
| E1 Interaction SFX pack (click, stamp, tray, alert) | P0 | `audio.sfx.ui.click`, `audio.sfx.stamp.press`, `audio.sfx.tray.slide`, `audio.sfx.alert.incident`, `audio.sfx.tool.activate`, `audio.sfx.tool.complete` |
| E2 Defect detection audio cues by severity | P1 | `audio.cue.severity.parametric`, `audio.cue.severity.catastrophic`, the three `audio.cue.reading.*` keys |
| E3 Rework process sounds (spray, purge, cycle complete) | P1 | the six `audio.sfx.rework.*` keys |
| E4 Ambient cleanroom loop | P0 | `audio.ambient.cleanroom.loop` |
| E5 Adaptive tension music layers | P1 | `audio.music.tension.layer1`, `audio.music.tension.layer2`, `audio.music.tension.layer3` |
| E6 Instructor / debrief voice lines | P2 | `audio.voice.instructor.shiftbrief`, `audio.voice.instructor.debrief` |
| F1 Defect glossary entries | P0 | `text.config.glossary`, the 12 `texture.glossary.diagram.*` keys |
| F2 Rulebook daily bulletins | P0 | `text.config.bulletins` |
| F3 Debrief templates and coaching copy | P0 | `text.template.debriefsheet`, `text.localization.en` |
| F4 Error and fine reason strings | P0 | `text.localization.en` |
| F5 Localization key file (en baseline) | P1 | `text.localization.en` |
| G1 Rule configuration data tables | P0 | `text.config.day1`, `text.config.day2`, `text.config.day3` |
| G2 Defect generation profiles and seeded scenarios | P0 | `text.config.defectprofiles`, plus the golden fixtures below |
| G3 Scoring and economy config tables | P0 | `text.config.scoringtable`, `text.config.balancing` |
| G4 Analytics event schema | P0 | no key: code, see committed artifacts below |
| G5 Material and shader presets for wafer readability | P0 | the two `material.wafer.readability.*` keys, the two `material.overlay.defect.*` keys, `material.error.unknownkey` |
| G6 Prefab library for interactive stations | P1 | no key: superseded by design, see committed artifacts below |
| G7 Accessibility profiles (contrast, audio, text size) | P1 | `text.config.accessibilitydefaults`, `text.config.highcontrastpalette`, the 14 `shape.*` keys, `material.wafer.readability.highcontrast`, `material.overlay.defect.highcontrast` |
| H1 Golden scenario set (known outcomes) | P0 | no key: test fixture, see committed artifacts below |
| H2 Automated scoring test cases | P0 | no key: code, see committed artifacts below |
| H3 Input parity test scripts (desktop vs VR) | P1 | no key: test fixture, see committed artifacts below |
| H4 Performance benchmark scenes | P1 | no key: test scene, see committed artifacts below |
| H5 Instructor report export template | P2 | `text.template.instructorreport` |

## Committed artifacts without an asset key

Informative. These are the inventory rows that live in code, in the editor assembly, or in test
fixtures. They are loaded by the editor and test assemblies rather than by the presentation
layer, so they carry no `Asset_Key` and `Asset_Manifest_Validator` ignores this table. Rows are
listed with the mechanism that owns them.

| GDD row | Pri | Repository path | Owned by |
| :---- | :---- | :---- | :---- |
| G4 Analytics event schema | P0 | `Assets/Scripts/Simulation/Analytics/AnalyticsEvent.cs` | `Analytics_Recorder`; a C# schema, not a replaceable asset |
| G6 Prefab library for interactive stations | P1 | none by design | `Station_Assembler` builds every prop at runtime; the scene guard test fails the build if a prefab instance appears in `Bootstrap.unity`, so prefabs are not merely unnecessary here, they are prohibited |
| H1 Golden scenario set | P0 | `Assets/Tests/Fixtures/Golden/Day1.golden.json`, `Day2.golden.json`, `Day3.golden.json` | EditMode golden scenario tests |
| H2 Automated scoring test cases | P0 | `Assets/Tests/EditMode/` | EditMode suite |
| H3 Input parity test scripts | P1 | `Assets/Tests/Fixtures/Parity/` | recorded command streams replayed by the parity property test |
| H4 Performance benchmark scenes | P1 | `Assets/Scenes/Bootstrap.unity` driven by `Performance_Budget_Monitor` | PlayMode graphics suite; the station is assembled at runtime, so the benchmark needs no separate scene |

## Notes for whoever supplies these

- **Do not rename a key.** Six defect overlay keys and twelve glossary diagram keys are
  referenced from authored JSON; the fourteen shape keys are authored in the palette file. A
  rename has to land in the registry, this manifest, and the configuration in one change or the
  build fails. That failure is the feature.
- **Author to the budget, not to the ceiling.** The per-row triangle and dimension figures are
  what the rollups above are built from. A 200,000-triangle bay mesh will pass a visual review
  and fail the performance budget test.
- **One material per authored prop, reusing the shared materials where possible.** Material
  count is the scarce resource, not mesh count.
- **Overlays are alpha over transparent.** Never bake an overlay against a wafer surface; the
  same overlay composites over three surface states and two contrast palettes.
- **Subsurface defects are instrument imagery.** The STI void seam, interface roughness, and
  tungsten plug void overlays are only ever shown after a tool reveals them, and rendering zero
  pixels before that is a tested requirement.
