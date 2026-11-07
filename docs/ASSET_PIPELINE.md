# Wafers Please — Asset Pipeline

## GLB Model Pipeline

### Source Files
All source models are in `Assets/Models/` as GLB files:
- `Room.glb` (6.5 MB) — cleanroom environment shell
- `Workbench.glb` (7.4 MB) — inspection workbench
- `Foup.glb` (8.5 MB) — wafer carrier (FOUP)
- `Wafer.glb` (6.9 MB) — semiconductor wafer
- `Console.glb` (6.3 MB) — instrument control console
- `Inspection.glb` (6.0 MB) — microscope / inspection tool
- `DataSlate.glb` (5.3 MB) — glossary tablet
- `IncidentReport.glb` (7.3 MB) — incident printer / document

### Import Settings (per asset type)

#### Environment Models (Room, Workbench)
| Setting | Value |
|---------|-------|
| Scale Factor | 1 (if 1 unit = 1 meter in GLB) |
| Convert Units | True |
| Mesh Compression | High |
| Read/Write | Disabled |
| Optimize Mesh | True |
| Generate Colliders | Manual (add MeshCollider in prefab) |
| Materials | URP Lit (convert from GLB standard) |

#### Prop Models (Console, Foup, Inspection, DataSlate, IncidentReport)
| Setting | Value |
|---------|-------|
| Scale Factor | 1 |
| Convert Units | True |
| Mesh Compression | Medium |
| Read/Write | Disabled |
| Generate Colliders | True (on relevant parts) |
| Materials | URP Lit (convert from GLB standard) |

#### Wafer Model
| Setting | Value |
|---------|-------|
| Scale Factor | 1 |
| Convert Units | True |
| Mesh Compression | Low (high visual fidelity needed) |
| Read/Write | Drilling (for defect overlays) |
| Materials | URP Unlit + custom defect shader |

### Prefab Creation Workflow
1. Import GLB → Unity creates Model Prefab
2. Create Prefab Variant from imported model
3. Add interaction components (XRGrabInteractable, colliders, etc.)
4. Assign materials from URP Material Library
5. Set up LOD group if needed
6. Save to `Assets/Prefabs/`

### Material Strategy
| Asset | Material Type | Notes |
|-------|--------------|-------|
| Room | URP Lit | Cleanroom panels — metallic/roughness |
| Workbench | URP Lit | Metal surface + rubber mat areas |
| FOUP | URP Lit | Plastic with slight metallic sheen |
| Wafer | URP Unlit + Custom | Silicon base + defect overlay shader |
| Console | URP Lit | Screens use emission for readouts |
| Stamps | URP Lit | Rubber handle + metal body |

### Shader Needs
- **Wafer Defect Shader**: Unlit shader with parameterized decal overlays (UV-space)
- **Instrument Display Shader**: Unlit emission with texture-driven numeric readout
- **Cleanroom Glass**: Transparent URP Lit with subtle reflection

## Optimization

### VR Performance Targets
| Metric | Target |
|--------|--------|
| Draw calls | < 150 per frame |
| Triangles | < 200K visible |
| Materials | < 50 unique |
| Texture memory | < 256 MB |

### Desktop Performance Targets
| Metric | Target |
|--------|--------|
| Draw calls | < 500 per frame |
| Triangles | < 500K visible |
| Materials | < 100 unique |
| MSAA | 4x (HDR on) |

### Batching Strategy
- Enable SRP Batcher (already configured)
- Combine static environment into single mesh per room
- Atlas small prop textures
- Use LOD groups on workbench and console at 2 levels

## Texture Naming Convention
```
t_wf_<asset>_<type>_<resolution>.png
  t_wf_wafer_base_albedo_2k.png
  t_wf_console_screen_emissive_1k.png
  t_wf_room_panel_normals_2k.png
```
