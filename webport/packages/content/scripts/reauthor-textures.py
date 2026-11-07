#!/usr/bin/env python3
"""
Re-author dress-prop albedos + generate metallicRoughness (ORM) maps.

Source: Assets/Models/*.glb baseColor JPEGs (extracted) or --from-dir.
Output: packages/content/textures/<Prop>/{albedo.png,orm.png}

Albedo: percentile levels + mild S-curve (fixes midtone-flat plastic mud).
FOUP additionally bakes soft cavity AO + directional panel form lighting into
albedo so silhouette reads under software-GL without real-time specular.
ORM (glTF): R=AO(255), G=roughness, B=metalness — absolute 0–255.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

PROPS = {
    "Foup": {
        # Matte PEI/plastic carrier — deepen blacks, keep warm brown.
        "black": 0.015,
        "white": 0.012,
        "curve": 1.55,
        "sat": 1.08,
        "rough_base": 168,
        "rough_span": 55,
        "metal_base": 4,
        "metal_span": 18,
        "metal_bias": 0.12,  # desat midtones → slight latch/hinge metal
        # Software-GL form bake (multiplicative — not another global stretch).
        "bake_form": True,
        "bake_ao": 1.05,
        "bake_dir": 0.78,
        "bake_panel": 0.58,
        "bake_ambient": 0.46,
        "unsharp_radius": 2.0,
        "unsharp_percent": 135,
        "unsharp_threshold": 1,
    },
    "Console": {
        "black": 0.02,
        "white": 0.015,
        "curve": 1.45,
        "sat": 1.05,
        "rough_base": 118,
        "rough_span": 62,
        "metal_base": 28,
        "metal_span": 90,
        "metal_bias": 0.42,
    },
    "Inspection": {
        "black": 0.02,
        "white": 0.018,
        "curve": 1.42,
        "sat": 1.04,
        "rough_base": 110,
        "rough_span": 58,
        "metal_base": 36,
        "metal_span": 110,
        "metal_bias": 0.5,
    },
    "DataSlate": {
        "black": 0.018,
        "white": 0.02,
        "curve": 1.5,
        "sat": 1.06,
        "rough_base": 145,
        "rough_span": 48,
        "metal_base": 8,
        "metal_span": 40,
        "metal_bias": 0.22,
    },
}


def s_curve(x: np.ndarray, amount: float) -> np.ndarray:
    """Contrast S-curve around 0.5. amount>1 increases midtone separation."""
    # Smoothstep-ish: mix linear with cubic contrast.
    y = x * x * (3.0 - 2.0 * x)
    t = np.clip((amount - 1.0) / 1.2, 0.0, 1.0)
    return x * (1.0 - t) + y * t


def levels_stretch(rgb: np.ndarray, black_pct: float, white_pct: float, curve: float) -> np.ndarray:
    """Percentile black/white points + S-curve. rgb float 0–1."""
    lum = rgb.mean(axis=2)
    lo = float(np.quantile(lum, black_pct))
    hi = float(np.quantile(lum, 1.0 - white_pct))
    if hi - lo < 1e-3:
        hi = lo + 1e-3
    stretched = np.clip((rgb - lo) / (hi - lo), 0.0, 1.0)
    # Per-channel S-curve keeps hue better than lum-only remap.
    out = s_curve(stretched, curve)
    return np.clip(out, 0.0, 1.0)


def adjust_saturation(rgb: np.ndarray, sat: float) -> np.ndarray:
    if abs(sat - 1.0) < 1e-3:
        return rgb
    lum = rgb.mean(axis=2, keepdims=True)
    return np.clip(lum + (rgb - lum) * sat, 0.0, 1.0)


def _gauss_lum(lum01: np.ndarray, radius: float) -> np.ndarray:
    pil = Image.fromarray((np.clip(lum01, 0, 1) * 255.0 + 0.5).astype(np.uint8), "L")
    return np.asarray(pil.filter(ImageFilter.GaussianBlur(radius=radius)), dtype=np.float32) / 255.0


def bake_form_lighting(rgb: np.ndarray, normal: np.ndarray | None, cfg: dict) -> np.ndarray:
    """
    Bake soft cavity AO + directional panel light/dark into albedo.

    Multiplicative only — preserves hue/identity. Protects bright decals.
    Uses tangent-space normal when present; else UV-space wrap falloff.
    """
    lum = rgb.mean(axis=2)
    blur_s = _gauss_lum(lum, 2.2)
    blur_m = _gauss_lum(lum, 7.0)
    blur_l = _gauss_lum(lum, 18.0)

    # Cavities: darker than local neighborhood → deepen (soft AO, not a hard mask).
    cavity = np.clip(blur_s - lum, 0.0, 1.0)
    recess = np.clip(blur_m - lum, 0.0, 1.0)
    bowl = np.clip(blur_l - lum, 0.0, 1.0)
    ao_amt = float(cfg.get("bake_ao", 0.65))
    ao = 1.0 - np.clip(
        cavity * (0.7 * ao_amt) + recess * (1.0 * ao_amt) + bowl * (0.35 * ao_amt),
        0.0,
        0.78,
    )

    # Directional form from authored normal (software specular substitute).
    ambient = float(cfg.get("bake_ambient", 0.58))
    dir_amt = float(cfg.get("bake_dir", 0.45))
    if normal is not None:
        n = normal.astype(np.float32) / 255.0 * 2.0 - 1.0
        # Re-normalize after jpeg/webp decode noise.
        nlen = np.sqrt(np.maximum((n * n).sum(axis=2), 1e-6))
        n = n / nlen[..., None]
        # Upper-left key + slight front — matches bay key/rim under soft GL.
        lx, ly, lz = 0.48, 0.62, 0.62
        ndotl = np.clip(n[:, :, 0] * lx + n[:, :, 1] * ly + n[:, :, 2] * lz, 0.0, 1.0)
        # Soft fill under key; still leave dark faces readable.
        wrap = np.clip((ndotl + 0.12) / 1.12, 0.0, 1.0)
        shade = ambient + (1.0 - ambient) * (wrap * (0.55 + 0.45 * dir_amt) + (1.0 - dir_amt) * 0.35)
        # Second cooler rim from −X so panel turns read without specular.
        lx2, ly2, lz2 = -0.55, 0.25, 0.55
        rim = np.clip(n[:, :, 0] * lx2 + n[:, :, 1] * ly2 + n[:, :, 2] * lz2, 0.0, 1.0)
        shade = shade + rim * 0.14 * dir_amt
    else:
        h, w = lum.shape
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        u, v = xx / max(w - 1, 1), yy / max(h - 1, 1)
        shade = ambient + (1.0 - ambient) * (0.55 * (1.0 - u) + 0.45 * (1.0 - v))

    # Panel light/dark: mid-frequency structure vs large-scale wash.
    panel_amt = float(cfg.get("bake_panel", 0.3))
    rel = np.clip(blur_s / (blur_l + 1e-4), 0.45, 1.7)
    panel = 1.0 + (rel - 1.0) * panel_amt

    # Extra bevel cue: darken just inside high-gradient seams (silhouette under soft GL).
    gx = np.abs(np.diff(blur_s, axis=1, prepend=blur_s[:, :1]))
    gy = np.abs(np.diff(blur_s, axis=0, prepend=blur_s[:1, :]))
    edge = np.clip((gx + gy) * 8.0, 0.0, 1.0)
    bevel = 1.0 - edge * (0.32 * ao_amt)

    # UV-island lip: darken near empty/near-black atlas gaps so panel silhouettes hold.
    empty = (lum < 0.04).astype(np.float32)
    empty_b = _gauss_lum(empty, 1.4)
    lip = 1.0 - np.clip(empty_b * 1.8, 0.0, 0.35) * (lum > 0.05)

    mul = np.clip(ao * shade * panel * bevel * lip, 0.22, 1.55)

    # Protect labels / cream decals / high-chroma accents from crushing.
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    chroma = mx - mn
    protect = np.clip((lum - 0.70) / 0.22, 0.0, 1.0)
    protect = np.maximum(protect, np.clip((chroma - 0.22) / 0.28, 0.0, 1.0) * np.clip(lum * 1.1, 0.0, 1.0))
    mul = 1.0 + (mul - 1.0) * (1.0 - protect)

    # Mild mean restore so bake doesn't globally crush midtones (identity preserved).
    out = np.clip(rgb * mul[..., None], 0.0, 1.0)
    mean_in = float(lum.mean()) + 1e-6
    mean_out = float(out.mean(axis=2).mean()) + 1e-6
    # Allow intentional AO darkening (~8%), not a chalk wash.
    restore = np.clip(mean_in / mean_out, 0.92, 1.06)
    out = np.clip(out * restore, 0.0, 1.0)
    return out


def make_orm(rgb: np.ndarray, normal: np.ndarray | None, cfg: dict) -> np.ndarray:
    """Build ORM uint8 HxWx3 from stretched albedo (+ optional normal)."""
    lum = rgb.mean(axis=2)
    # Saturation proxy: high chroma → dielectric ink/paint; low → metal candidate.
    mx = rgb.max(axis=2)
    mn = rgb.min(axis=2)
    chroma = mx - mn
    desat = 1.0 - np.clip(chroma * 2.2, 0.0, 1.0)
    # Mid-luma band is where brushed housings live.
    mid = 1.0 - np.abs(lum - 0.48) * 2.2
    mid = np.clip(mid, 0.0, 1.0)

    metal_w = desat * mid * float(cfg["metal_bias"])
    # Very dark plastics / deep recesses stay dielectric.
    metal_w *= np.clip((lum - 0.08) / 0.25, 0.0, 1.0)
    metal = cfg["metal_base"] + metal_w * cfg["metal_span"]

    # Roughness: darker + higher chroma (paint/labels) → rougher; metal → smoother.
    rough = cfg["rough_base"] + (0.55 - lum) * cfg["rough_span"]
    rough -= metal_w * 40.0
    rough += chroma * 28.0

    if normal is not None:
        # Normal slope magnitude → micro-rough bump.
        n = normal.astype(np.float32)
        # Decode tangent-space normal roughly; blue-heavy maps.
        dx = np.abs(n[:, :, 0] - 128.0)
        dy = np.abs(n[:, :, 1] - 128.0)
        slope = np.clip((dx + dy) / 90.0, 0.0, 1.0)
        rough += slope * 22.0

    # Fine grain so SwiftShader doesn't shade as flat chalk.
    rng = np.random.default_rng(0xF00F ^ (hash(cfg["rough_base"]) & 0xFFFFFFFF))
    grain = rng.normal(0.0, 4.5, size=lum.shape)
    rough = np.clip(rough + grain, 18, 245)
    metal = np.clip(metal + grain * 0.35, 0, 220)

    ao = np.full_like(lum, 255.0)
    orm = np.stack([ao, rough, metal], axis=2).astype(np.uint8)
    return orm


def process_prop(
    name: str,
    albedo_path: Path,
    normal_path: Path | None,
    out_dir: Path,
    size: int,
) -> dict:
    cfg = PROPS[name]
    albedo = Image.open(albedo_path).convert("RGB")
    if max(albedo.size) > size:
        albedo = albedo.resize((size, size), Image.Resampling.LANCZOS)

    arr = np.asarray(albedo, dtype=np.float32) / 255.0
    before = {
        "mean": float(arr.mean() * 255),
        "std": float(arr.mean(axis=2).std()),
        "p2": float(np.percentile(arr.mean(axis=2) * 255, 2)),
        "p98": float(np.percentile(arr.mean(axis=2) * 255, 98)),
    }

    normal_arr = None
    if normal_path and normal_path.exists():
        nimg = Image.open(normal_path).convert("RGB")
        if nimg.size != albedo.size:
            nimg = nimg.resize(albedo.size, Image.Resampling.LANCZOS)
        normal_arr = np.asarray(nimg)

    stretched = levels_stretch(arr, cfg["black"], cfg["white"], cfg["curve"])
    stretched = adjust_saturation(stretched, cfg["sat"])
    baked = False
    if cfg.get("bake_form"):
        stretched = bake_form_lighting(stretched, normal_arr, cfg)
        baked = True

    # Mild unsharp so panel lines survive WebP; FOUP uses a harder edge for silhouette.
    out_img = Image.fromarray((stretched * 255.0 + 0.5).astype(np.uint8), "RGB")
    ur = float(cfg.get("unsharp_radius", 1.2))
    up = int(cfg.get("unsharp_percent", 55))
    ut = int(cfg.get("unsharp_threshold", 2))
    out_img = out_img.filter(ImageFilter.UnsharpMask(radius=ur, percent=up, threshold=ut))
    stretched = np.asarray(out_img, dtype=np.float32) / 255.0

    after = {
        "mean": float(stretched.mean() * 255),
        "std": float(stretched.mean(axis=2).std()),
        "p2": float(np.percentile(stretched.mean(axis=2) * 255, 2)),
        "p98": float(np.percentile(stretched.mean(axis=2) * 255, 98)),
    }

    orm = make_orm(stretched, normal_arr, cfg)
    orm_img = Image.fromarray(orm, "RGB")

    out_dir.mkdir(parents=True, exist_ok=True)
    albedo_out = out_dir / "albedo.png"
    orm_out = out_dir / "orm.png"
    out_img.save(albedo_out, optimize=True)
    orm_img.save(orm_out, optimize=True)

    return {
        "prop": name,
        "albedo": str(albedo_out),
        "orm": str(orm_out),
        "size": list(out_img.size),
        "before": before,
        "after": after,
        "delta_std": after["std"] - before["std"],
        "bake_form": baked,
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--from-dir",
        type=Path,
        default=Path("/tmp/prop-tex/src"),
        help="Directory with <Prop>_albedo.jpg and optional <Prop>_normal.png",
    )
    ap.add_argument(
        "--out",
        type=Path,
        default=Path(__file__).resolve().parents[1] / "textures",
    )
    ap.add_argument("--size", type=int, default=1024, help="Max albedo/ORM edge (web budget)")
    ap.add_argument("--props", nargs="*", default=list(PROPS.keys()))
    args = ap.parse_args()

    reports = []
    for name in args.props:
        if name not in PROPS:
            print(f"skip unknown prop {name}", file=sys.stderr)
            continue
        albedo = args.from_dir / f"{name}_albedo.jpg"
        if not albedo.exists():
            albedo = args.from_dir / f"{name}_albedo.png"
        if not albedo.exists():
            print(f"MISSING albedo for {name} under {args.from_dir}", file=sys.stderr)
            return 1
        normal = args.from_dir / f"{name}_normal.png"
        rep = process_prop(name, albedo, normal if normal.exists() else None, args.out / name, args.size)
        reports.append(rep)
        print(
            f"{name:12} std {rep['before']['std']:.1f}->{rep['after']['std']:.1f} "
            f"(+{rep['delta_std']:.1f})  p2 {rep['before']['p2']:.0f}->{rep['after']['p2']:.0f}  "
            f"p98 {rep['before']['p98']:.0f}->{rep['after']['p98']:.0f}"
        )

    summary = args.out / "reauthor-summary.json"
    # Merge when reauthoring a subset (keep Console/Inspection rows intact).
    if summary.exists() and set(args.props) != set(PROPS.keys()):
        try:
            prev = json.loads(summary.read_text())
            by_name = {p["prop"]: p for p in prev.get("props", [])}
            for rep in reports:
                by_name[rep["prop"]] = rep
            merged = [by_name[n] for n in PROPS.keys() if n in by_name]
            reports = merged
        except (json.JSONDecodeError, KeyError, TypeError):
            pass
    summary.write_text(json.dumps({"props": reports}, indent=2) + "\n")
    print(f"wrote {summary}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
