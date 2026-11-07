#!/usr/bin/env python3
"""
Reauthor FOUP as a classic CLOSED front-opening wafer pod.

Prior open-mouth / ajar-door builds read as a teal cooler with discs in Iris.
This build keeps the door SHUT with a large clear polycarbonate window so
stacked circular wafers read *behind glass* — the silhouette fabs recognize:
fab-blue body, charcoal door, external latch/cams, OHT flange, side grips.

Window strategy: opaque baked body/door/frame + SEPARATE FoupGlass pane with
alpha-blend polycarb (single-material bake kills transparency, so glass is a
second mesh/material that embed-reauthored preserves).

Keeps the webport size contract: longest axis ≈ 1.896 so fitUniform(1.05) holds.
Door/window face −Y build → glTF +Z → Babylon −Z (inspection cam).

Outputs:
  - packages/content/.tmp-reauthor/Foup.glb  (Foup + FoupGlass)
  - packages/content/textures/Foup/{albedo,orm,normal}.png

Then: npm run assets:reauthor:foup-mesh

Usage:
  blender -b -P reauthor-foup-mesh.py -- \\
    --out ../.tmp-reauthor/Foup.glb \\
    --tex-out ../textures/Foup \\
    --size 1024
"""

from __future__ import annotations

import argparse
import math
import sys
from pathlib import Path

import bpy
from mathutils import Vector


# Upright closed FOUP — taller than cube; classic cassette proportion.
BODY = {
    "w": 1.18,  # X width
    "d": 1.12,  # Y depth (door on −Y during build)
    "h": 2.10,  # Z height
}

COL = {
    "body": (0.07, 0.34, 0.50, 1.0),       # fab blue
    "body_dark": (0.04, 0.22, 0.32, 1.0),  # recessed panels
    "door": (0.022, 0.024, 0.028, 1.0),    # charcoal closed door
    "frame": (0.55, 0.60, 0.66, 1.0),      # chrome window / door bezel
    "window_tint": (0.22, 0.42, 0.50, 1.0),  # recessed tint lip (cutout edge)
    "glass": (0.62, 0.84, 0.92, 0.42),     # polycarb tint — alpha high enough to read on Iris
    "wafer": (0.86, 0.92, 0.98, 1.0),      # bright silicon
    "wafer_edge": (0.98, 0.99, 1.0, 1.0),
    "slot_metal": (0.58, 0.64, 0.72, 1.0),
    "steel": (0.80, 0.84, 0.88, 1.0),
    "steel_dark": (0.26, 0.28, 0.32, 1.0),
    "gasket": (0.05, 0.055, 0.06, 1.0),
    "label": (0.94, 0.95, 0.90, 1.0),
    "accent": (0.98, 0.52, 0.08, 1.0),
    "flange": (0.48, 0.52, 0.56, 1.0),
    "interior": (0.03, 0.035, 0.042, 1.0),
}


def argv_after_double_dash() -> list[str]:
    if "--" in sys.argv:
        return sys.argv[sys.argv.index("--") + 1 :]
    return []


def clear_scene() -> None:
    bpy.ops.wm.read_factory_settings(use_empty=True)


def active(obj: bpy.types.Object) -> bpy.types.Object:
    bpy.ops.object.select_all(action="DESELECT")
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    return obj


def apply_all(obj: bpy.types.Object) -> None:
    active(obj)
    for mod in list(obj.modifiers):
        try:
            bpy.ops.object.modifier_apply(modifier=mod.name)
        except RuntimeError:
            obj.modifiers.remove(mod)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)


def make_box(name: str, size: tuple[float, float, float], loc=(0.0, 0.0, 0.0)) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=loc)
    box = bpy.context.active_object
    box.name = name
    box.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return box


def make_cyl(
    name: str,
    radius: float,
    depth: float,
    loc=(0.0, 0.0, 0.0),
    rot=(0.0, 0.0, 0.0),
    vertices: int = 24,
) -> bpy.types.Object:
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=loc, rotation=rot, vertices=vertices
    )
    obj = bpy.context.active_object
    obj.name = name
    return obj


def boolean_diff(host: bpy.types.Object, cutter: bpy.types.Object, name: str = "Bool") -> None:
    active(host)
    mod = host.modifiers.new(name=name, type="BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.object = cutter
    bpy.ops.object.modifier_apply(modifier=mod.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def bevel(obj: bpy.types.Object, width: float = 0.018, segments: int = 2) -> None:
    active(obj)
    mod = obj.modifiers.new(name="Bevel", type="BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    mod.angle_limit = math.radians(28)
    bpy.ops.object.modifier_apply(modifier=mod.name)


def assign_mat(
    obj: bpy.types.Object,
    name: str,
    color: tuple[float, float, float, float],
    metallic: float = 0.04,
    roughness: float = 0.55,
) -> bpy.types.Material:
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Metallic"].default_value = metallic
    bsdf.inputs["Roughness"].default_value = roughness
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def assign_glass_mat(obj: bpy.types.Object) -> bpy.types.Material:
    """Alpha-blend polycarb — survives as its own GLB material (not baked)."""
    mat = bpy.data.materials.get("FoupGlassMat") or bpy.data.materials.new("FoupGlassMat")
    mat.use_nodes = True
    mat.blend_method = "BLEND"
    if hasattr(mat, "shadow_method"):
        mat.shadow_method = "NONE"
    mat.use_backface_culling = False
    nt = mat.node_tree
    bsdf = next(n for n in nt.nodes if n.type == "BSDF_PRINCIPLED")
    tint = COL["glass"]
    bsdf.inputs["Base Color"].default_value = (tint[0], tint[1], tint[2], 1.0)
    bsdf.inputs["Metallic"].default_value = 0.0
    bsdf.inputs["Roughness"].default_value = 0.08
    # Transmission / alpha — Blender 4+ uses Transmission Weight; keep alpha too.
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.92
    elif "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = 0.92
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.58  # polycarbonate
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = tint[3]
    # glTF export reads this for baseColorFactor.a
    mat.diffuse_color = tint
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    return mat


def join_objects(objs: list[bpy.types.Object], name: str) -> bpy.types.Object:
    assert objs
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    host = bpy.context.active_object
    host.name = name
    return host


def set_flat_shade(obj: bpy.types.Object) -> None:
    active(obj)
    bpy.ops.object.shade_flat()
    for poly in obj.data.polygons:
        poly.use_smooth = False


def build_foup_pod() -> tuple[bpy.types.Object, bpy.types.Object]:
    """Closed-door FOUP — opaque bake host + separate polycarb glass pane."""
    w, d, h = BODY["w"], BODY["d"], BODY["h"]
    parts: list[bpy.types.Object] = []

    front_y = -d * 0.5
    # Large front window — classic FOUP glass panel proportion (~55% of door).
    win_w, win_h = w * 0.62, h * 0.52
    win_z = 0.12  # slightly above center (latch lives below)

    # --- Shell: upright fab-blue body ---
    body = make_box("foupBody", (w, d, h), loc=(0, 0, 0))
    bevel(body, width=0.022, segments=2)
    assign_mat(body, "matBody", COL["body"], metallic=0.02, roughness=0.50)
    parts.append(body)

    # Hollow cassette cavity (keep front wall — door covers it; window cuts later).
    cavity = make_box("cavity", (w * 0.78, d * 0.72, h * 0.78), loc=(0, 0.02, 0.0))
    boolean_diff(body, cavity, "Hollow")

    for sx in (-1, 1):
        side_cut = make_box(
            f"sideRecess{sx}",
            (0.045, d * 0.48, h * 0.48),
            loc=(sx * w * 0.5, 0.04, -0.02),
        )
        boolean_diff(body, side_cut, f"SideRecess{sx}")

    # Dark interior so wafers punch through the window.
    cavity_back = make_box(
        "cavityBack",
        (win_w * 1.05, 0.045, win_h * 1.1),
        loc=(0, d * 0.22, win_z),
    )
    assign_mat(cavity_back, "matCavity", COL["interior"], metallic=0.0, roughness=0.92)
    parts.append(cavity_back)
    for sx in (-1, 1):
        wall = make_box(
            f"cavityWall{sx}",
            (0.035, d * 0.5, win_h * 1.05),
            loc=(sx * win_w * 0.52, 0.0, win_z),
        )
        assign_mat(wall, "matInterior", COL["interior"], metallic=0.02, roughness=0.88)
        parts.append(wall)

    # --- Closed charcoal door leaf (flush on front) ---
    door_w, door_t, door_h = w * 0.92, 0.070, h * 0.90
    door_y = front_y - door_t * 0.35
    door = make_box("doorPanel", (door_w, door_t, door_h), loc=(0, door_y, -0.01))
    bevel(door, width=0.006, segments=1)
    # Cut the large window aperture through the closed door.
    boolean_diff(
        door,
        make_box("winCut", (win_w, 0.25, win_h), loc=(0, door_y, win_z)),
        "WindowCut",
    )
    # Softer door dielectric — Iris was blowing a harsh vertical specular streak.
    assign_mat(door, "matDoor", COL["door"], metallic=0.04, roughness=0.62)
    parts.append(door)

    # Also pierce the body front wall so the cavity / wafers are truly visible.
    boolean_diff(
        body,
        make_box("bodyWinCut", (win_w * 0.98, 0.35, win_h * 0.98), loc=(0, front_y + 0.08, win_z)),
        "BodyWindow",
    )

    # Chrome window frame (outer + inner lip) — reads as glazed FOUP window.
    frame_t = 0.055
    frame_d = 0.045
    frame_y = door_y - door_t * 0.5 - 0.01
    for i, (ww, hh, xx, zz) in enumerate(
        [
            (win_w + frame_t * 2.0, frame_t, 0.0, win_h * 0.5 + frame_t * 0.5 + win_z),
            (win_w + frame_t * 2.0, frame_t, 0.0, -win_h * 0.5 - frame_t * 0.5 + win_z),
            (frame_t, win_h + frame_t * 2.0, -(win_w * 0.5 + frame_t * 0.5), win_z),
            (frame_t, win_h + frame_t * 2.0, (win_w * 0.5 + frame_t * 0.5), win_z),
        ]
    ):
        fr = make_box(f"winFrame{i}", (ww, frame_d, hh), loc=(xx, frame_y, zz))
        assign_mat(fr, "matFrame", COL["frame"], metallic=0.72, roughness=0.28)
        parts.append(fr)

    # Recessed tint lip inside the aperture (edge cue under the polycarb pane).
    for i, (ww, hh, xx, zz) in enumerate(
        [
            (win_w * 0.98, 0.018, 0.0, win_h * 0.5 - 0.01 + win_z),
            (win_w * 0.98, 0.018, 0.0, -win_h * 0.5 + 0.01 + win_z),
            (0.018, win_h * 0.96, -win_w * 0.5 + 0.01, win_z),
            (0.018, win_h * 0.96, win_w * 0.5 - 0.01, win_z),
        ]
    ):
        lip = make_box(f"winTint{i}", (ww, 0.022, hh), loc=(xx, frame_y + 0.02, zz))
        assign_mat(lip, "matWinTint", COL["window_tint"], metallic=0.15, roughness=0.28)
        parts.append(lip)

    # Real polycarb pane — NOT joined into the opaque bake host.
    # Sit proud of the door face so Iris catches a glass specular plane.
    glass = make_box(
        "FoupGlass",
        (win_w * 0.97, 0.014, win_h * 0.97),
        loc=(0.0, frame_y - 0.018, win_z),
    )
    assign_glass_mat(glass)
    set_flat_shade(glass)
    # Thin highlight streak — sells polycarb even when env maps are weak.
    streak = make_box(
        "FoupGlassStreak",
        (win_w * 0.18, 0.006, win_h * 0.92),
        loc=(win_w * 0.22, frame_y - 0.026, win_z),
    )
    streak_mat = assign_glass_mat(streak)
    streak_mat.name = "FoupGlassMat"
    bsdf = next(n for n in streak_mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (0.85, 0.95, 1.0, 1.0)
    if "Alpha" in bsdf.inputs:
        bsdf.inputs["Alpha"].default_value = 0.55
    set_flat_shade(streak)
    # Merge streak into glass mesh (same material family) before peer transforms.
    bpy.ops.object.select_all(action="DESELECT")
    streak.select_set(True)
    glass.select_set(True)
    bpy.context.view_layer.objects.active = glass
    bpy.ops.object.join()
    glass = bpy.context.active_object
    glass.name = "FoupGlass"

    # Door perimeter gasket (closed seal).
    gasket = make_box("gasket", (door_w * 1.02, 0.018, door_h * 1.02), loc=(0, door_y + door_t * 0.45, -0.01))
    gasket_hole = make_box(
        "gasketHole", (win_w * 1.04, 0.05, win_h * 1.04), loc=(0, door_y + door_t * 0.45, win_z)
    )
    boolean_diff(gasket, gasket_hole, "GasketFrame")
    assign_mat(gasket, "matGasket", COL["gasket"], metallic=0.0, roughness=0.85)
    parts.append(gasket)

    # --- Stacked circular wafers behind the window (NOT vent bars) ---
    n_wafers = 7
    wafer_r = win_w * 0.42
    z0 = -win_h * 0.38 + win_z
    z_span = win_h * 0.72
    for i in range(n_wafers):
        t = i / (n_wafers - 1)
        z = z0 + t * z_span
        # Sit just behind the window plane so arcs fill the aperture.
        y = front_y + 0.18 + i * 0.006
        tip = math.radians(12)
        wafer = make_cyl(
            f"waferDisk{i}",
            radius=wafer_r,
            depth=0.008,
            loc=(0, y, z),
            rot=(math.radians(90) - tip, 0, 0),
            vertices=40,
        )
        assign_mat(wafer, "matWafer", COL["wafer"], metallic=0.85, roughness=0.10)
        parts.append(wafer)
        rim = make_cyl(
            f"waferRim{i}",
            radius=wafer_r * 1.035,
            depth=0.007,
            loc=(0, y - 0.006, z),
            rot=(math.radians(90) - tip, 0, 0),
            vertices=40,
        )
        rim_cut = make_cyl(
            f"waferRimCut{i}",
            radius=wafer_r * 0.88,
            depth=0.02,
            loc=(0, y - 0.006, z),
            rot=(math.radians(90) - tip, 0, 0),
            vertices=32,
        )
        boolean_diff(rim, rim_cut, f"RimHollow{i}")
        assign_mat(rim, "matWaferEdge", COL["wafer_edge"], metallic=0.98, roughness=0.05)
        parts.append(rim)
        # Alignment flat — silicon cue.
        flat = make_box(
            f"waferFlat{i}",
            (wafer_r * 0.45, 0.007, 0.014),
            loc=(0, y - 0.008, z - wafer_r * 0.92),
        )
        assign_mat(flat, "matWaferFlat", COL["wafer_edge"], metallic=0.92, roughness=0.08)
        parts.append(flat)
        for sx in (-1, 1):
            rail = make_box(
                f"slotRail{i}_{sx}",
                (0.024, 0.05, 0.012),
                loc=(sx * (wafer_r * 0.96), y + 0.03, z),
            )
            assign_mat(rail, "matSlotRail", COL["slot_metal"], metallic=0.55, roughness=0.28)
            parts.append(rail)

    # --- External latch bar + dual cams on CLOSED door (below window) ---
    latch_z = -h * 0.32
    latch = make_box(
        "latchBar",
        (door_w * 0.62, 0.09, 0.095),
        loc=(0, door_y - door_t * 0.5 - 0.055, latch_z),
    )
    bevel(latch, width=0.01, segments=1)
    assign_mat(latch, "matLatch", COL["steel"], metallic=0.9, roughness=0.14)
    parts.append(latch)
    for sx in (-1, 1):
        cam = make_cyl(
            f"latchCam{sx}",
            radius=0.078,
            depth=0.075,
            loc=(sx * door_w * 0.20, door_y - door_t * 0.5 - 0.10, latch_z),
            rot=(math.radians(90), 0, 0),
            vertices=16,
        )
        assign_mat(cam, "matCam", COL["steel"], metallic=0.92, roughness=0.12)
        parts.append(cam)
        hub = make_cyl(
            f"latchHub{sx}",
            radius=0.028,
            depth=0.085,
            loc=(sx * door_w * 0.20, door_y - door_t * 0.5 - 0.12, latch_z),
            rot=(math.radians(90), 0, 0),
            vertices=12,
        )
        assign_mat(hub, "matCamHub", COL["steel_dark"], metallic=0.7, roughness=0.28)
        parts.append(hub)
    lever = make_box(
        "latchLever",
        (0.15, 0.08, 0.042),
        loc=(door_w * 0.16, door_y - door_t * 0.5 - 0.11, latch_z - 0.05),
    )
    assign_mat(lever, "matLever", COL["steel"], metallic=0.85, roughness=0.16)
    parts.append(lever)

    # Lot accent stripe above window on door face.
    stripe = make_box(
        "lotStripe",
        (door_w * 0.55, 0.022, 0.038),
        loc=(0, door_y - door_t * 0.5 - 0.012, h * 0.38),
    )
    assign_mat(stripe, "matAccent", COL["accent"], metallic=0.05, roughness=0.42)
    parts.append(stripe)

    # Hinge knuckles on +X edge (closed door still shows them).
    for i, zz in enumerate((-0.35, 0.0, 0.35)):
        knuckle = make_cyl(
            f"hingeKnuckle{i}",
            radius=0.026,
            depth=0.055,
            loc=(door_w * 0.5 + 0.01, door_y, zz),
            rot=(0, math.radians(90), 0),
            vertices=12,
        )
        assign_mat(knuckle, "matHinge", COL["steel_dark"], metallic=0.7, roughness=0.3)
        parts.append(knuckle)

    # --- Top OHT flange + carry handle ---
    flange = make_cyl(
        "ohtFlange",
        radius=0.36,
        depth=0.058,
        loc=(0, 0.02, h * 0.5 + 0.018),
        vertices=28,
    )
    assign_mat(flange, "matFlange", COL["flange"], metallic=0.65, roughness=0.32)
    parts.append(flange)
    flange_ring = make_cyl(
        "ohtRing",
        radius=0.44,
        depth=0.030,
        loc=(0, 0.02, h * 0.5 + 0.048),
        vertices=28,
    )
    ring_cut = make_cyl(
        "ohtRingCut", radius=0.30, depth=0.08, loc=(0, 0.02, h * 0.5 + 0.048), vertices=24
    )
    boolean_diff(flange_ring, ring_cut, "RingHollow")
    assign_mat(flange_ring, "matFlangeRing", COL["steel"], metallic=0.8, roughness=0.22)
    parts.append(flange_ring)

    for sx in (-1, 1):
        post = make_cyl(
            f"handlePost{sx}",
            radius=0.026,
            depth=0.18,
            loc=(sx * 0.20, -0.02, h * 0.5 + 0.12),
            vertices=14,
        )
        assign_mat(post, "matHandle", COL["steel"], metallic=0.75, roughness=0.25)
        parts.append(post)
    grip = make_cyl(
        "handleGrip",
        radius=0.030,
        depth=0.44,
        loc=(0, -0.02, h * 0.5 + 0.20),
        rot=(0, math.radians(90), 0),
        vertices=16,
    )
    assign_mat(grip, "matGrip", COL["steel_dark"], metallic=0.65, roughness=0.32)
    parts.append(grip)

    # --- Side carry grips ---
    for sx in (-1, 1):
        for y in (-0.22, 0.22):
            sp = make_cyl(
                f"sidePost{sx}_{y}",
                radius=0.018,
                depth=0.12,
                loc=(sx * (w * 0.5 + 0.02), y, h * 0.05),
                rot=(0, math.radians(90), 0),
                vertices=12,
            )
            assign_mat(sp, "matSideGrip", COL["body_dark"], metallic=0.03, roughness=0.5)
            parts.append(sp)
        bar = make_cyl(
            f"sideBar{sx}",
            radius=0.022,
            depth=0.48,
            loc=(sx * (w * 0.5 + 0.085), 0, h * 0.05),
            rot=(math.radians(90), 0, 0),
            vertices=14,
        )
        assign_mat(bar, "matSideBar", COL["body_dark"], metallic=0.03, roughness=0.5)
        parts.append(bar)

    # --- Side barcode / RFID ---
    plate = make_box("labelPlate", (0.022, 0.22, 0.14), loc=(w * 0.5 + 0.012, 0.08, 0.18))
    assign_mat(plate, "matLabel", COL["label"], metallic=0.0, roughness=0.55)
    parts.append(plate)
    for i in range(7):
        bw = 0.012 + (i % 3) * 0.006
        bar_mark = make_box(
            f"barcode{i}",
            (0.01, bw, 0.10),
            loc=(w * 0.5 + 0.024, -0.02 + i * 0.032, 0.18),
        )
        assign_mat(bar_mark, "matBarcode", COL["gasket"], metallic=0.0, roughness=0.7)
        parts.append(bar_mark)

    # --- Base kinematic pads ---
    for i, (x, y) in enumerate([(-0.32, 0.32), (0.32, 0.32), (0.0, -0.36)]):
        pad = make_cyl(
            f"kinPad{i}",
            radius=0.055,
            depth=0.032,
            loc=(x, y, -h * 0.5 - 0.008),
            vertices=12,
        )
        assign_mat(pad, "matPad", COL["steel"], metallic=0.7, roughness=0.32)
        parts.append(pad)

    host = join_objects(parts, "Foup")
    bevel(host, width=0.005, segments=1)
    set_flat_shade(host)

    # Keep glass as a peer mesh — apply identical fit transforms so the pane
    # stays registered to the door aperture.
    active(host)
    bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
    origin_delta = Vector(host.location)
    host.location = (0.0, 0.0, 0.0)
    apply_all(host)
    glass.location = Vector(glass.location) - origin_delta
    apply_all(glass)

    coords = [host.matrix_world @ v.co for v in host.data.vertices]
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    size = Vector((max(xs) - min(xs), max(ys) - min(ys), max(zs) - min(zs)))
    target_long = 1.896
    longest = max(size.x, size.y, size.z, 1e-6)
    s = target_long / longest
    for obj in (host, glass):
        obj.scale = (s, s, s)
        apply_all(obj)

    coords = [host.matrix_world @ v.co for v in host.data.vertices]
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    center = Vector(
        ((min(xs) + max(xs)) * 0.5, (min(ys) + max(ys)) * 0.5, (min(zs) + max(zs)) * 0.5)
    )
    for obj in (host, glass):
        obj.location = Vector(obj.location) - center
        apply_all(obj)
        obj.rotation_euler = (0.0, 0.0, 0.0)
        apply_all(obj)

    return host, glass


def unwrap(obj: bpy.types.Object) -> None:
    active(obj)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.014)
    bpy.ops.object.mode_set(mode="OBJECT")


def _ensure_bake_image_node(mat: bpy.types.Material, image: bpy.types.Image) -> bpy.types.Node:
    mat.use_nodes = True
    nt = mat.node_tree
    for node in nt.nodes:
        if node.type == "TEX_IMAGE" and node.image == image:
            return node
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.location = (-600, 300)
    return tex


def paint_and_bake(
    target: bpy.types.Object, size: int
) -> tuple[bpy.types.Image, bpy.types.Image, bpy.types.Image]:
    """Bake pod's own fab materials into albedo/ORM — no Unity source transfer."""
    albedo = bpy.data.images.new("FoupBakeAlbedo", width=size, height=size, alpha=False)
    orm = bpy.data.images.new("FoupBakeORM", width=size, height=size, alpha=False)
    normal = bpy.data.images.new("FoupBakeNormal", width=size, height=size, alpha=False)
    albedo.pixels = [0.18, 0.52, 0.58, 1.0] * (size * size)
    orm.pixels = [1.0, 0.55, 0.04, 1.0] * (size * size)
    normal.pixels = [0.5, 0.5, 1.0, 1.0] * (size * size)

    scene = bpy.context.scene
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.samples = 24
    scene.render.bake.use_pass_direct = False
    scene.render.bake.use_pass_indirect = False
    scene.render.bake.use_pass_color = True
    scene.render.bake.margin = 6
    scene.render.bake.use_selected_to_active = False

    active(target)
    bake_nodes: list[tuple[bpy.types.Material, bpy.types.Node]] = []
    for mat in list(target.data.materials):
        if mat is None:
            continue
        node = _ensure_bake_image_node(mat, albedo)
        bake_nodes.append((mat, node))

    if not bake_nodes:
        raise RuntimeError("FOUP pod has no materials to bake")

    first_mat, first_node = bake_nodes[0]
    target.active_material_index = 0
    for mat, node in bake_nodes:
        for n in mat.node_tree.nodes:
            n.select = False
        node.select = True
        mat.node_tree.nodes.active = node
    first_mat.node_tree.nodes.active = first_node

    print("bake DIFFUSE (fab pod materials)…")
    scene.cycles.bake_type = "DIFFUSE"
    bpy.ops.object.bake(type="DIFFUSE", pass_filter={"COLOR"}, use_clear=True)

    normal.pixels = [0.5, 0.5, 1.0, 1.0] * (size * size)

    ao_img = bpy.data.images.new("FoupBakeAO", width=size, height=size, alpha=False)
    for mat, _node in bake_nodes:
        ao_node = _ensure_bake_image_node(mat, ao_img)
        for n in mat.node_tree.nodes:
            n.select = False
        ao_node.select = True
        mat.node_tree.nodes.active = ao_node
    scene.cycles.bake_type = "AO"
    print("bake AO (self)…")
    bpy.ops.object.bake(type="AO", use_clear=True)

    ao_px = list(ao_img.pixels)
    alb_px = list(albedo.pixels)
    n = size * size
    orm_px = [0.0] * (n * 4)
    for i in range(n):
        ao = ao_px[i * 4]
        ao = max(0.0, min(1.0, ao ** 1.2 * 1.01))
        r = alb_px[i * 4 + 0]
        g = alb_px[i * 4 + 1]
        b = alb_px[i * 4 + 2]
        lum = (r + g + b) / 3.0
        chroma = max(r, g, b) - min(r, g, b)
        if lum > 0.55 and chroma < 0.18:
            metal = 0.92
            rough = 0.10
            alb_px[i * 4 + 0] = max(alb_px[i * 4 + 0], 0.90)
            alb_px[i * 4 + 1] = max(alb_px[i * 4 + 1], 0.94)
            alb_px[i * 4 + 2] = max(alb_px[i * 4 + 2], 0.99)
        elif lum > 0.28 and chroma < 0.22 and b >= g * 0.88 and g >= r * 0.95:
            metal = 0.78
            rough = 0.16
            alb_px[i * 4 + 0] = max(alb_px[i * 4 + 0], 0.78)
            alb_px[i * 4 + 1] = max(alb_px[i * 4 + 1], 0.84)
            alb_px[i * 4 + 2] = max(alb_px[i * 4 + 2], 0.92)
        elif lum > 0.34 and chroma < 0.22:
            metal = 0.78
            rough = 0.22
            alb_px[i * 4 + 0] = max(alb_px[i * 4 + 0], 0.70)
            alb_px[i * 4 + 1] = max(alb_px[i * 4 + 1], 0.74)
            alb_px[i * 4 + 2] = max(alb_px[i * 4 + 2], 0.80)
        elif lum < 0.12:
            # Charcoal door — keep dielectric, raise roughness so Iris doesn't blow specular.
            metal = 0.04
            rough = 0.58
            for c in range(3):
                alb_px[i * 4 + c] = min(alb_px[i * 4 + c], 0.045)
        elif g > r + 0.04 and b > r + 0.02:
            metal = 0.03
            rough = 0.52
            alb_px[i * 4 + 0] = min(0.12, alb_px[i * 4 + 0] * 0.92)
            alb_px[i * 4 + 1] = min(0.40, alb_px[i * 4 + 1] * 0.95)
            alb_px[i * 4 + 2] = min(0.55, alb_px[i * 4 + 2] * 0.98)
        elif r > 0.55 and g > 0.25 and b < 0.35:
            metal = 0.04
            rough = 0.42
        else:
            metal = 0.08
            rough = 0.46
        rough = max(0.08, min(0.75, rough + (1.0 - ao) * 0.06))
        orm_px[i * 4 + 0] = ao
        orm_px[i * 4 + 1] = rough
        orm_px[i * 4 + 2] = metal
        orm_px[i * 4 + 3] = 1.0
        if metal > 0.55:
            shade = 0.94 + 0.06 * ao
        else:
            shade = 0.84 + 0.16 * ao
        for c in range(3):
            alb_px[i * 4 + c] = max(0.0, min(1.0, alb_px[i * 4 + c] * shade))
    orm.pixels = orm_px
    albedo.pixels = alb_px

    bake_mat = bpy.data.materials.new("FoupBakeMat")
    bake_mat.use_nodes = True
    nt = bake_mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (0, 0)
    out.location = (300, 0)
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    tex_a = nt.nodes.new("ShaderNodeTexImage")
    tex_a.image = albedo
    tex_a.location = (-400, 200)
    tex_o = nt.nodes.new("ShaderNodeTexImage")
    tex_o.image = orm
    tex_o.location = (-400, 0)
    tex_n = nt.nodes.new("ShaderNodeTexImage")
    tex_n.image = normal
    tex_n.location = (-400, -200)
    nt.links.new(tex_a.outputs["Color"], bsdf.inputs["Base Color"])
    sep = nt.nodes.new("ShaderNodeSeparateColor")
    sep.location = (-180, 0)
    nt.links.new(tex_o.outputs["Color"], sep.inputs["Color"])
    nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    nt.links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nrm = nt.nodes.new("ShaderNodeNormalMap")
    nrm.location = (-180, -200)
    nt.links.new(tex_n.outputs["Color"], nrm.inputs["Color"])
    nt.links.new(nrm.outputs["Normal"], bsdf.inputs["Normal"])

    target.data.materials.clear()
    target.data.materials.append(bake_mat)

    return albedo, orm, normal


def save_images(albedo: bpy.types.Image, orm: bpy.types.Image, normal: bpy.types.Image, tex_out: Path) -> None:
    tex_out.mkdir(parents=True, exist_ok=True)
    for img, name in ((albedo, "albedo.png"), (orm, "orm.png"), (normal, "normal.png")):
        path = tex_out / name
        img.filepath_raw = str(path)
        img.file_format = "PNG"
        img.save()
        print(f"wrote {path}")


def export_glb(obj: bpy.types.Object, out: Path) -> None:
    out.parent.mkdir(parents=True, exist_ok=True)
    for o in bpy.data.objects:
        sel = o == obj
        o.select_set(sel)
        o.hide_render = not sel
        o.hide_viewport = not sel
        if hasattr(o, "hide_set"):
            o.hide_set(not sel)
    active(obj)
    bpy.ops.export_scene.gltf(
        filepath=str(out),
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_image_format="AUTO",
        export_yup=True,
    )
    mats = [m.name if m else "?" for m in obj.data.materials]
    print(f"wrote {out} ({out.stat().st_size} bytes) mats={mats} verts={len(obj.data.vertices)}")


def report_bbox(obj: bpy.types.Object, label: str) -> None:
    coords = [obj.matrix_world @ v.co for v in obj.data.vertices]
    xs = [c.x for c in coords]
    ys = [c.y for c in coords]
    zs = [c.z for c in coords]
    print(
        f"{label}: verts={len(coords)} polys={len(obj.data.polygons)} "
        f"x[{min(xs):.3f},{max(xs):.3f}] y[{min(ys):.3f},{max(ys):.3f}] z[{min(zs):.3f},{max(zs):.3f}]"
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Reauthor FOUP as closed front-opening wafer pod")
    here = Path(__file__).resolve().parent
    pkg = here.parent
    parser.add_argument("--out", type=Path, default=pkg / ".tmp-reauthor/Foup.glb")
    parser.add_argument("--tex-out", type=Path, default=pkg / "textures/Foup")
    parser.add_argument("--size", type=int, default=1024)
    parser.add_argument("--src", type=Path, default=None)
    args = parser.parse_args(argv_after_double_dash())

    clear_scene()
    print("build CLOSED front-opening FOUP (polycarb window + wafer stack)…")
    target, glass = build_foup_pod()
    report_bbox(target, "pod")
    report_bbox(glass, "glass")

    unwrap(target)
    albedo, orm, normal = paint_and_bake(target, args.size)
    save_images(albedo, orm, normal, args.tex_out)

    # Join glass AFTER bake so polycarb stays a second material slot (alpha survives
    # glTF). Joining before bake would stamp opaque atlases onto the pane.
    bpy.ops.object.select_all(action="DESELECT")
    glass.select_set(True)
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.join()
    target = bpy.context.active_object
    target.name = "Foup"
    # Ensure glass material name is stable for embed-reauthored preserve path.
    for mat in target.data.materials:
        if mat and "glass" in mat.name.lower():
            mat.name = "FoupGlassMat"
    print("materials after glass join:", [m.name if m else None for m in target.data.materials])
    report_bbox(target, "pod+glass")

    export_glb(target, args.out)
    print("DONE")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
