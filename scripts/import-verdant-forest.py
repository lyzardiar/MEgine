"""Verdant Forest / 翠影幽林 — Large-scale photorealistic 3D forest sample importer.

Downloads real CC0 photogrammetry glTF 2.0 nature assets, 1K PBR forest-floor textures,
and a real 32-bit floating-point forest HDRI from Poly Haven, splits multi-material glTF
meshes 1:1 into MEngine GLB + .mmat assets (preserving Albedo, Normal, ARM metallic/roughness/AO,
and alpha-cutout foliage), and assembles a lush 220m x 220m rolling forest valley with a stream,
4-cascade CSM dappled sunlight shadows, Cubemap IBL, SSAO, Bloom, AgX tone mapping, and
real-time PBR / Toon / Standard shading preview.

Run from the repository root:
    python scripts/import-verdant-forest.py
"""
import json
import math
import random
import shutil
import struct
import urllib.request
import uuid
from pathlib import Path

import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp/imported-assets-cache/polyhaven"
OUT = ROOT / "samples/verdant-forest"
MODELS = OUT / "Assets/Models"
TEXTURES = OUT / "Assets/Textures"
MATERIALS = OUT / "Assets/Materials"
SCENES = OUT / "Assets/Scenes"
SCRIPTS = OUT / "Assets/Scripts"
FONTS = OUT / "Assets/Fonts"

META_NAMESPACE = uuid.UUID("3d1b78a4-6d20-4812-a42e-2e88a34f9201")
TAU = math.tau
random.seed(1337)

HEADERS = {"User-Agent": "MEngineSceneImporter/1.0"}

# Curated real CC0 Poly Haven photogrammetry nature models (full-size trees + undergrowth + full PBR maps).
POLYHAVEN_MODELS = [
    "pine_tree_01",     # towering real photogrammetry pine tree (full canopy)
    "fir_tree_01",      # dense spruce/fir forest tree (full canopy)
    "tree_small_02",    # leafy woodland deciduous tree
    "shrub_01",         # lush woodland shrub
    "boulder_01",       # mossy forest boulder
    "dead_tree_trunk",  # fallen weathered forest trunk
    "fern_02",          # forest floor fern
]
POLYHAVEN_GROUND_TEX = "forest_floor"
POLYHAVEN_HDRI = "epping_forest_01"


# --------------------------------------------------------------------------- download helpers


def fetch_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_file(url: str, dst: Path):
    if dst.exists() and dst.stat().st_size > 0:
        return
    dst.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=90) as resp:
        dst.write_bytes(resp.read())


# --------------------------------------------------------------------------- math helpers


def mat4_identity():
    return [1, 0, 0, 0,  0, 1, 0, 0,  0, 0, 1, 0,  0, 0, 0, 1]


def mat4_mul(a, b):
    # Column-major 4x4 matrix multiply (glTF convention)
    out = [0.0] * 16
    for col in range(4):
        for row in range(4):
            out[col * 4 + row] = sum(a[k * 4 + row] * b[col * 4 + k] for k in range(4))
    return out


def mat4_from_trs(t, r, s):
    x, y, z, w = r
    xx, yy, zz = x * x, y * y, z * z
    xy, xz, yz = x * y, x * z, y * z
    wx, wy, wz = w * x, w * y, w * z
    sx, sy, sz = s
    return [
        (1.0 - 2.0 * (yy + zz)) * sx, (2.0 * (xy + wz)) * sx, (2.0 * (xz - wy)) * sx, 0.0,
        (2.0 * (xy - wz)) * sy, (1.0 - 2.0 * (xx + zz)) * sy, (2.0 * (yz + wx)) * sy, 0.0,
        (2.0 * (xz + wy)) * sz, (2.0 * (yz - wx)) * sz, (1.0 - 2.0 * (xx + yy)) * sz, 0.0,
        t[0], t[1], t[2], 1.0,
    ]


def mat4_transform_point(m, p):
    return [
        m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
        m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
        m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    ]


def mat4_transform_normal(m, n):
    # Upper-left 3x3 inverse transpose for normals (handles non-uniform scale)
    a, b, c = m[0], m[4], m[8]
    d, e, f = m[1], m[5], m[9]
    g, h, i = m[2], m[6], m[10]
    det = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)
    if abs(det) < 1e-10:
        return list(n)
    inv = 1.0 / det
    nx = ((e * i - f * h) * n[0] + (f * g - d * i) * n[1] + (d * h - e * g) * n[2]) * inv
    ny = ((c * h - b * i) * n[0] + (a * i - c * g) * n[1] + (b * g - a * h) * n[2]) * inv
    nz = ((b * f - c * e) * n[0] + (c * d - a * f) * n[1] + (a * e - b * d) * n[2]) * inv
    ln = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
    return [nx / ln, ny / ln, nz / ln]


def mat4_det3(m):
    a, b, c = m[0], m[4], m[8]
    d, e, f = m[1], m[5], m[9]
    g, h, i = m[2], m[6], m[10]
    return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g)


def quat_yxz(yaw, pitch=0.0, roll=0.0):
    hy, hp, hr = yaw * 0.5, pitch * 0.5, roll * 0.5
    sy, cy = math.sin(hy), math.cos(hy)
    sp, cp = math.sin(hp), math.cos(hp)
    sr, cr = math.sin(hr), math.cos(hr)
    return [
        cy * sp * cr + sy * cp * sr,
        sy * cp * cr - cy * sp * sr,
        cy * cp * sr - sy * sp * cr,
        cy * cp * cr + sy * sp * sr,
    ]


def look_at_quat(eye, target):
    dx, dy, dz = target[0] - eye[0], target[1] - eye[1], target[2] - eye[2]
    ln = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    nx, ny, nz = dx / ln, dy / ln, dz / ln
    yaw = math.atan2(-nx, -nz)
    pitch = math.atan2(ny, math.hypot(nx, nz) or 1e-6)
    return quat_yxz(yaw, pitch, 0.0)


# --------------------------------------------------------------------------- glTF reader + splitter


COMP_FMT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def read_accessor(doc, buffers, acc_idx):
    acc = doc["accessors"][acc_idx]
    bv = doc["bufferViews"][acc["bufferView"]]
    buf = buffers[bv["buffer"]]
    fmt_char, comp_size = COMP_FMT[acc["componentType"]]
    num_comp = TYPE_COUNT[acc["type"]]
    count = acc["count"]
    byte_offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride") or (comp_size * num_comp)
    elem_fmt = "<" + fmt_char * num_comp
    out = []
    for i in range(count):
        off = byte_offset + i * stride
        vals = struct.unpack_from(elem_fmt, buf, off)
        out.append(vals[0] if num_comp == 1 else list(vals))
    return out


def save_glb(path: Path, positions, normals, uvs, indices):
    data = bytearray()
    views = []
    accessors = []

    def add(raw, ctype, kind, count):
        off = len(data)
        data.extend(raw)
        views.append({"buffer": 0, "byteOffset": off, "byteLength": len(raw)})
        accessors.append({"bufferView": len(views) - 1, "componentType": ctype, "count": count, "type": kind})
        return len(accessors) - 1

    def pack_f(rows, ch):
        flat = [v for r in rows for v in r[:ch]]
        return struct.pack("<" + "f" * len(flat), *flat)

    p_idx = add(pack_f(positions, 3), 5126, "VEC3", len(positions))
    accessors[p_idx]["min"] = [min(v[k] for v in positions) for k in range(3)]
    accessors[p_idx]["max"] = [max(v[k] for v in positions) for k in range(3)]
    n_idx = add(pack_f(normals, 3), 5126, "VEC3", len(normals))
    uv_idx = add(pack_f(uvs, 2), 5126, "VEC2", len(uvs))
    i_idx = add(struct.pack("<" + "I" * len(indices), *indices), 5125, "SCALAR", len(indices))

    doc = {
        "asset": {"version": "2.0", "generator": "MEngine Verdant Forest 1:1 glTF Importer"},
        "buffers": [{"byteLength": len(data)}],
        "bufferViews": views,
        "accessors": accessors,
        "meshes": [{"primitives": [{"attributes": {"POSITION": p_idx, "NORMAL": n_idx, "TEXCOORD_0": uv_idx}, "indices": i_idx}]}],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }
    js = json.dumps(doc, separators=(",", ":")).encode()
    js += b" " * ((-len(js)) % 4)
    data += b"\0" * ((-len(data)) % 4)
    header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(js) + 8 + len(data))
    path.write_bytes(
        header
        + struct.pack("<II", len(js), 0x4E4F534A) + js
        + struct.pack("<II", len(data), 0x004E4942) + data
    )


def decimate_mesh(positions, normals, uvs, indices, target_tris: int, is_foliage: bool):
    """Fast numpy UV-preserving decimation for high-poly Poly Haven photogrammetry scans."""
    n_tris = len(indices) // 3
    if n_tris <= target_tris:
        return positions, normals, uvs, indices

    pos = np.asarray(positions, dtype=np.float32)
    nrm = np.asarray(normals, dtype=np.float32)
    uv = np.asarray(uvs, dtype=np.float32)
    tri = np.asarray(indices, dtype=np.int32).reshape(-1, 3)

    # For disconnected needle/leaf foliage (e.g. fir_sapling needles), thin connected islands
    # uniformly and slightly thicken kept needles so canopy density stays lush at 6x-10x fewer tris.
    if is_foliage:
        n_verts = len(pos)
        parent = np.arange(n_verts, dtype=np.int32)

        def find(x):
            while parent[x] != x:
                parent[x] = parent[parent[x]]
                x = parent[x]
            return x

        for a, b, c in tri.tolist():
            ra, rb, rc = find(a), find(b), find(c)
            if ra != rb:
                parent[rb] = ra
            if ra != rc:
                parent[rc] = ra
        roots = np.array([find(i) for i in range(n_verts)], dtype=np.int32)
        tri_roots = roots[tri[:, 0]]
        uniq_roots, inv = np.unique(tri_roots, return_inverse=True)
        if len(uniq_roots) > 80:
            keep_ratio = max(0.005, min(1.0, target_tris / float(n_tris)))
            stride = max(2, int(round(1.0 / keep_ratio)))
            # Deterministic hash order on component index gives spatially even thinning
            keep_comp = (np.arange(len(uniq_roots)) % stride) == 0
            keep_mask = keep_comp[inv]
            kept_tri = tri[keep_mask]
            used_v, new_idx = np.unique(kept_tri.reshape(-1), return_inverse=True)
            new_pos = pos[used_v].copy()
            new_nrm = nrm[used_v]
            new_uv = uv[used_v]
            # Gently thicken kept foliage cards around each component's centroid to preserve volume
            scale_boost = min(2.35, 1.0 + 0.24 * math.log2(stride))
            used_roots = roots[used_v]
            _, comp_ids = np.unique(used_roots, return_inverse=True)
            counts = np.bincount(comp_ids).astype(np.float32)[:, None]
            sums = np.zeros((len(counts), 3), dtype=np.float32)
            np.add.at(sums, comp_ids, new_pos)
            centroids = sums / np.maximum(counts, 1.0)
            new_pos = centroids[comp_ids] + (new_pos - centroids[comp_ids]) * scale_boost
            return new_pos.tolist(), new_nrm.tolist(), new_uv.tolist(), new_idx.astype(np.int32).tolist()

    # For continuous photogrammetry surfaces (boulder, bark, trunk, shrub), UV-bucketed voxel clustering
    mn = pos.min(axis=0)
    mx = pos.max(axis=0)
    extent = np.maximum(mx - mn, 1e-4)
    scale = float(extent.max())

    def cluster_at(res: int):
        step = scale / float(res)
        qp = np.floor((pos - mn) / step).astype(np.int64)
        # Keep UV seam islands separate so photogrammetry textures never smear across charts
        qu = np.floor(uv * 12.0).astype(np.int64)
        keys = (
            ((qp[:, 0] & 0x3FF) << 40)
            | ((qp[:, 1] & 0x3FF) << 30)
            | ((qp[:, 2] & 0x3FF) << 20)
            | ((qu[:, 0] & 0x3FF) << 10)
            | (qu[:, 1] & 0x3FF)
        )
        _, inv = np.unique(keys, return_inverse=True)
        mapped = inv[tri]
        valid = (mapped[:, 0] != mapped[:, 1]) & (mapped[:, 1] != mapped[:, 2]) & (mapped[:, 0] != mapped[:, 2])
        return inv, mapped[valid]

    lo, hi = 18, 220
    best = None
    for _ in range(8):
        mid = (lo + hi) // 2
        inv, mtri = cluster_at(mid)
        best = (inv, mtri)
        if len(mtri) > target_tris:
            hi = mid - 1
        else:
            lo = mid + 1
    inv, mtri = best
    if len(mtri) == 0:
        return positions, normals, uvs, indices

    n_clusters = int(inv.max()) + 1
    counts = np.bincount(inv, minlength=n_clusters).astype(np.float32)[:, None]
    c_pos = np.zeros((n_clusters, 3), dtype=np.float32)
    c_nrm = np.zeros((n_clusters, 3), dtype=np.float32)
    c_uv = np.zeros((n_clusters, 2), dtype=np.float32)
    np.add.at(c_pos, inv, pos)
    np.add.at(c_nrm, inv, nrm)
    np.add.at(c_uv, inv, uv)
    c_pos /= np.maximum(counts, 1.0)
    c_uv /= np.maximum(counts, 1.0)
    nlen = np.linalg.norm(c_nrm, axis=1, keepdims=True)
    c_nrm = np.where(nlen > 1e-6, c_nrm / np.maximum(nlen, 1e-6), np.array([[0.0, 1.0, 0.0]], dtype=np.float32))

    # Compact to only vertices referenced by surviving triangles
    used_v, new_idx = np.unique(mtri.reshape(-1), return_inverse=True)
    return c_pos[used_v].tolist(), c_nrm[used_v].tolist(), c_uv[used_v].tolist(), new_idx.astype(np.int32).tolist()


def import_polyhaven_model(model_id: str, target_tris: int = 16000):
    """Downloads a Poly Haven 1K glTF model, splits multi-variant root nodes into individual
    centered variants, decimates ultra-high-poly scans cleanly, and writes MEngine GLBs + .mmat."""
    print(f"[PolyHaven] Fetching metadata for {model_id}...")
    info = fetch_json(f"https://api.polyhaven.com/files/{model_id}")
    g1k = info["gltf"]["1k"]["gltf"]
    model_cache = CACHE / model_id
    gltf_path = model_cache / f"{model_id}_1k.gltf"
    download_file(g1k["url"], gltf_path)
    for rel, meta in g1k.get("include", {}).items():
        download_file(meta["url"], model_cache / rel)

    doc = json.loads(gltf_path.read_text(encoding="utf-8"))
    buffers = []
    for buf in doc.get("buffers", []):
        buffers.append((model_cache / buf["uri"]).read_bytes())

    # Copy all referenced textures into Assets/Textures/
    tex_map = {}
    for img_idx, img in enumerate(doc.get("images", [])):
        uri = img.get("uri", "")
        src = model_cache / uri
        if src.exists():
            dst_name = f"{model_id}_{Path(uri).name}"
            dst = TEXTURES / dst_name
            if not dst.exists():
                shutil.copy2(src, dst)
            tex_map[img_idx] = f"Assets/Textures/{dst_name}"

    def resolve_tex(tex_ref):
        if not tex_ref:
            return ""
        t = doc["textures"][tex_ref["index"]]
        return tex_map.get(t["source"], "")

    nodes = doc.get("nodes", [])
    materials_doc = doc.get("materials", [{}])
    shared_mats = {}

    def get_material_variants(mat_idx: int):
        if mat_idx in shared_mats:
            return shared_mats[mat_idx]
        mat = materials_doc[mat_idx] if mat_idx < len(materials_doc) else {}
        pbr = mat.get("pbrMetallicRoughness", {})
        alpha_mode = mat.get("alphaMode", "OPAQUE")
        surface = "cutout" if alpha_mode == "MASK" else ("transparent" if alpha_mode == "BLEND" else "opaque")
        is_foliage = (surface != "opaque") or any(w in mat.get("name", "").lower() for w in ["leaf", "needle", "twig", "fern", "branch", "foliage"])

        base_tex = resolve_tex(pbr.get("baseColorTexture"))
        norm_tex = resolve_tex(mat.get("normalTexture"))
        orm_tex = resolve_tex(pbr.get("metallicRoughnessTexture"))
        occ_tex = resolve_tex(mat.get("occlusionTexture"))

        mat_paths = {}
        for variant, shader_name in [("pbr", "pbr"), ("toon", "toon"), ("std", "standard")]:
            mmat_name = f"{model_id}_m{mat_idx}_{variant}.mmat"
            mmat = {
                "version": 10,
                "name": f"{model_id} {mat.get('name', f'mat{mat_idx}')} ({variant})",
                "shader": shader_name,
                "surface": surface,
                "alpha_cutoff": float(mat.get("alphaCutoff", 0.45)) if surface == "cutout" else 0.5,
                "base_color": pbr.get("baseColorFactor", [1.0, 1.0, 1.0, 1.0]),
                "metallic": float(pbr.get("metallicFactor", 0.0)),
                "roughness": float(pbr.get("roughnessFactor", 0.85)),
                "double_sided": bool(mat.get("doubleSided", False) or is_foliage),
                "base_color_texture": base_tex,
                "normal_texture": norm_tex,
                "normal_scale": float(mat.get("normalTexture", {}).get("scale", 1.0)),
                "metallic_roughness_texture": orm_tex,
                "occlusion_texture": occ_tex or orm_tex,
                "occlusion_strength": float(mat.get("occlusionTexture", {}).get("strength", 1.0)),
                "anisotropy": 8,
                "toon_steps": 3.0,
                "toon_smoothness": 0.08,
                "toon_specular_size": 0.25,
                "toon_shadow_tint": [0.18, 0.28, 0.34, 0.85],
                "toon_rim_color": [0.88, 0.96, 0.72, 0.30],
            }
            (MATERIALS / mmat_name).write_text(json.dumps(mmat, indent=2) + "\n", encoding="utf-8")
            mat_paths[variant] = f"Assets/Materials/{mmat_name}"
        shared_mats[mat_idx] = (mat_paths, is_foliage)
        return mat_paths, is_foliage

    def extract_subtree(root_idx):
        by_mat = {}

        def visit(node_idx, parent_m):
            node = nodes[node_idx]
            if "matrix" in node:
                local = node["matrix"]
            else:
                local = mat4_from_trs(
                    node.get("translation", [0, 0, 0]),
                    node.get("rotation", [0, 0, 0, 1]),
                    node.get("scale", [1, 1, 1]),
                )
            world_m = mat4_mul(parent_m, local)
            if "mesh" in node:
                mesh = doc["meshes"][node["mesh"]]
                flip = mat4_det3(world_m) < 0.0
                for prim in mesh.get("primitives", []):
                    if prim.get("mode", 4) != 4:
                        continue
                    mat_idx = prim.get("material", 0)
                    attrs = prim["attributes"]
                    pos = read_accessor(doc, buffers, attrs["POSITION"])
                    nrm = read_accessor(doc, buffers, attrs["NORMAL"]) if "NORMAL" in attrs else [[0, 1, 0]] * len(pos)
                    uv = read_accessor(doc, buffers, attrs["TEXCOORD_0"]) if "TEXCOORD_0" in attrs else [[0, 0]] * len(pos)
                    idx = read_accessor(doc, buffers, prim["indices"]) if "indices" in prim else list(range(len(pos)))

                    bucket = by_mat.setdefault(mat_idx, {"p": [], "n": [], "uv": [], "i": []})
                    base = len(bucket["p"])
                    for p in pos:
                        bucket["p"].append(mat4_transform_point(world_m, p))
                    for n in nrm:
                        bucket["n"].append(mat4_transform_normal(world_m, n))
                    bucket["uv"].extend(uv)
                    for k in range(0, len(idx), 3):
                        a, b, c = base + idx[k], base + idx[k + 1], base + idx[k + 2]
                        bucket["i"].extend([a, c, b] if flip else [a, b, c])
            for child in node.get("children", []):
                visit(child, world_m)

        visit(root_idx, mat4_identity())
        return by_mat

    scene_idx = doc.get("scene", 0)
    roots = doc["scenes"][scene_idx].get("nodes", []) if doc.get("scenes") else list(range(len(nodes)))

    # Poly Haven packs multiple asset variants as separate top-level root nodes (e.g. fir_sapling_a/b/c).
    # Export each root node as its own centered variant so trees/ferns are never glued in a row!
    variants = []
    for v_idx, r_idx in enumerate(roots):
        by_mat = extract_subtree(r_idx)
        all_pts = [p for b in by_mat.values() for p in b["p"]]
        if not all_pts:
            continue
        cx = 0.5 * (min(p[0] for p in all_pts) + max(p[0] for p in all_pts))
        min_y = min(p[1] for p in all_pts)
        cz = 0.5 * (min(p[2] for p in all_pts) + max(p[2] for p in all_pts))

        parts = []
        for mat_idx, bucket in sorted(by_mat.items()):
            if not bucket["p"] or not bucket["i"]:
                continue
            for p in bucket["p"]:
                p[0] -= cx
                p[1] -= min_y
                p[2] -= cz

            mat_paths, is_foliage = get_material_variants(mat_idx)
            p_dec, n_dec, uv_dec, i_dec = decimate_mesh(
                bucket["p"], bucket["n"], bucket["uv"], bucket["i"],
                target_tris=target_tris, is_foliage=is_foliage,
            )
            glb_name = f"{model_id}_v{v_idx}_m{mat_idx}.glb"
            save_glb(MODELS / glb_name, p_dec, n_dec, uv_dec, i_dec)
            parts.append({
                "mesh": f"Assets/Models/{glb_name}",
                "materials": mat_paths,
                "tris": len(i_dec) // 3,
            })
        if parts:
            variants.append(parts)

    total_tris = sum(p["tris"] for v in variants for p in v)
    print(f"  -> Imported {model_id}: {len(variants)} variants, {total_tris} total triangles (game-ready LOD).")
    return variants


def download_polyhaven_ground(tex_id: str):
    print(f"[PolyHaven] Fetching ground PBR texture {tex_id}...")
    info = fetch_json(f"https://api.polyhaven.com/files/{tex_id}")
    out = {}
    for role, key in [("diff", "Diffuse"), ("nor", "nor_gl"), ("arm", "arm")]:
        entry = info.get(key, {}).get("1k", {})
        fmt_entry = entry.get("jpg") or entry.get("png")
        if fmt_entry:
            ext = ".jpg" if "jpg" in entry else ".png"
            dst = TEXTURES / f"{tex_id}_{role}{ext}"
            download_file(fmt_entry["url"], dst)
            out[role] = f"Assets/Textures/{dst.name}"
    return out


def download_polyhaven_hdri(hdri_id: str):
    print(f"[PolyHaven] Fetching 32-bit HDRI {hdri_id}...")
    info = fetch_json(f"https://api.polyhaven.com/files/{hdri_id}")
    hdr = info["hdri"]["2k"]["hdr"]
    dst = TEXTURES / f"{hdri_id}_2k.hdr"
    download_file(hdr["url"], dst)
    return f"Assets/Textures/{dst.name}"


# --------------------------------------------------------------------------- forest terrain & stream


def _hash2(x, y, seed):
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    n = (n ^ (n >> 16)) & 0xFFFFFFFF
    return n / 4294967295.0


def vnoise(x, y, seed=0):
    xi, yi = int(math.floor(x)), int(math.floor(y))
    xf, yf = x - xi, y - yi
    u = xf * xf * (3.0 - 2.0 * xf)
    v = yf * yf * (3.0 - 2.0 * yf)
    a, b = _hash2(xi, yi, seed), _hash2(xi + 1, yi, seed)
    c, d = _hash2(xi, yi + 1, seed), _hash2(xi + 1, yi + 1, seed)
    return (a + (b - a) * u) + ((c + (d - c) * u) - (a + (b - a) * u)) * v


def fbm(x, y, octaves=4, seed=7):
    amp, freq, tot, norm = 1.0, 1.0, 0.0, 0.0
    for _ in range(octaves):
        tot += amp * vnoise(x * freq, y * freq, seed)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return tot / norm


def stream_center_x(z):
    return 12.0 * math.sin(z * 0.032) + 5.0 * math.cos(z * 0.017)


def forest_height(x, z):
    # Rolling woodland valley with a winding creek bed running near x = stream_center_x(z)
    sx = stream_center_x(z)
    dist_stream = abs(x - sx)
    valley_walls = 0.0022 * (dist_stream ** 1.85)
    hills = 8.5 * (fbm(x * 0.018 + 3.0, z * 0.018 - 2.0, 4, 19) - 0.35)
    micro = 0.75 * (fbm(x * 0.09, z * 0.09, 3, 41) - 0.5)
    creek_carve = -2.2 * math.exp(-(dist_stream * dist_stream) / 36.0)
    # Keep a scenic walking path gently flattened on the east bank (dist_stream ~ 10..15)
    path_d = abs((x - sx) - 11.5)
    h = valley_walls + hills + micro + creek_carve
    path_blend = math.exp(-(path_d * path_d) / 14.0)
    return h * (1.0 - 0.45 * path_blend) + 1.35 * (0.45 * path_blend)


def build_forest_terrain():
    n = 140
    span = 110.0
    positions, normals, uvs, indices = [], [], [], []
    e = 0.65
    for j in range(n + 1):
        z = -span + 2.0 * span * j / n
        for i in range(n + 1):
            x = -span + 2.0 * span * i / n
            y = forest_height(x, z)
            dx = (forest_height(x + e, z) - forest_height(x - e, z)) / (2.0 * e)
            dz = (forest_height(x, z + e) - forest_height(x, z - e)) / (2.0 * e)
            inv = 1.0 / math.sqrt(1.0 + dx * dx + dz * dz)
            positions.append([x, y, z])
            normals.append([-dx * inv, inv, -dz * inv])
            uvs.append([(x + span) / 10.0, (z + span) / 10.0])
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            b = a + (n + 1)
            indices.extend([a, b, a + 1, a + 1, b, b + 1])
    save_glb(MODELS / "forest_terrain.glb", positions, normals, uvs, indices)
    return "Assets/Models/forest_terrain.glb"


def build_creek_mesh():
    n = 80
    positions, normals, uvs, indices = [], [], [], []
    for j in range(n + 1):
        z = -105.0 + 210.0 * j / n
        cx = stream_center_x(z)
        for i, off in enumerate([-10.0, 0.0, 10.0]):
            positions.append([cx + off, -0.35, z])
            normals.append([0.0, 1.0, 0.0])
            uvs.append([i * 0.5, j / 4.0])
    for j in range(n):
        for i in range(2):
            a = j * 3 + i
            b = a + 3
            indices.extend([a, b, a + 1, a + 1, b, b + 1])
    save_glb(MODELS / "forest_stream.glb", positions, normals, uvs, indices)
    return "Assets/Models/forest_stream.glb"


# --------------------------------------------------------------------------- scene assembly


IMPORTER_BY_EXT = {
    ".glb": "model", ".png": "texture", ".jpg": "texture", ".hdr": "texture",
    ".mshader": "shader", ".mmat": "material", ".mscene": "scene",
    ".ts": "script", ".js": "script", ".ttf": "font", ".wav": "audio",
}


def sync_meta_files():
    for path in sorted((OUT / "Assets").rglob("*")):
        if path.is_dir() or path.suffix == ".meta":
            continue
        imp = IMPORTER_BY_EXT.get(path.suffix.lower())
        if not imp:
            continue
        rel = path.relative_to(OUT).as_posix()
        meta = {"schemaVersion": 1, "guid": str(uuid.uuid5(META_NAMESPACE, rel)), "importer": imp}
        path.with_name(path.name + ".meta").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main():
    for d in [MODELS, TEXTURES, MATERIALS, SCENES, SCRIPTS, FONTS]:
        d.mkdir(parents=True, exist_ok=True)

    font_src = ROOT / "samples/frostbound-realms/Assets/Fonts/NotoSansSC.ttf"
    if font_src.exists() and not (FONTS / "NotoSansSC.ttf").exists():
        shutil.copy2(font_src, FONTS / "NotoSansSC.ttf")
    shutil.copy2(ROOT / "samples/types/engine.d.ts", SCRIPTS / "mengine.d.ts")

    # Clean stale legacy merged GLBs before regenerating split variants
    for old_glb in MODELS.glob("*.glb"):
        old_glb.unlink()
        old_meta = old_glb.with_name(old_glb.name + ".meta")
        if old_meta.exists():
            old_meta.unlink()

    # 1. Import real Poly Haven photogrammetry models + PBR ground + 32-bit HDRI
    target_map = {
        "pine_tree_01": 20000,
        "fir_tree_01": 20000,
        "tree_small_02": 18000,
        "shrub_01": 10000,
        "boulder_01": 8000,
        "dead_tree_trunk": 9000,
        "fern_02": 3000,
    }
    catalog = {mid: import_polyhaven_model(mid, target_tris=target_map.get(mid, 12000)) for mid in POLYHAVEN_MODELS}
    ground_tex = download_polyhaven_ground(POLYHAVEN_GROUND_TEX)
    hdri_path = download_polyhaven_hdri(POLYHAVEN_HDRI)

    # 2. Build terrain & forest stream + their PBR/Toon/Standard material variants
    terrain_mesh = build_forest_terrain()
    stream_mesh = build_creek_mesh()

    terrain_mats = {}
    for variant, shader_name in [("pbr", "pbr"), ("toon", "toon"), ("std", "standard")]:
        mname = f"forest_ground_{variant}.mmat"
        (MATERIALS / mname).write_text(json.dumps({
            "version": 10,
            "name": f"Forest Floor ({variant})",
            "shader": shader_name,
            "surface": "opaque",
            "base_color": [0.88, 0.90, 0.84, 1.0],
            "metallic": 0.0,
            "roughness": 0.92,
            "base_color_texture": ground_tex.get("diff", ""),
            "normal_texture": ground_tex.get("nor", ""),
            "normal_scale": 1.15,
            "metallic_roughness_texture": ground_tex.get("arm", ""),
            "occlusion_texture": ground_tex.get("arm", ""),
            "occlusion_strength": 0.9,
            "anisotropy": 8,
            "toon_steps": 3.0,
            "toon_smoothness": 0.08,
            "toon_shadow_tint": [0.16, 0.25, 0.28, 0.85],
            "toon_rim_color": [0.0, 0.0, 0.0, 0.0],
        }, indent=2) + "\n", encoding="utf-8")
        terrain_mats[variant] = f"Assets/Materials/{mname}"

    stream_mat = "Assets/Materials/forest_stream.mmat"
    (MATERIALS / "forest_stream.mmat").write_text(json.dumps({
        "version": 10,
        "name": "Forest Creek Water",
        "shader": "pbr",
        "surface": "opaque",
        "base_color": [0.012, 0.042, 0.038, 1.0],
        "metallic": 0.04,
        "roughness": 0.06,
        "ior": 1.33,
        "clearcoat": 0.85,
        "clearcoat_roughness": 0.04,
        "normal_texture": ground_tex.get("nor", ""),
        "normal_scale": 0.22,
        "uv_scale": [3.5, 12.0],
        "double_sided": True,
    }, indent=2) + "\n", encoding="utf-8")

    # 3. Assemble lush 220m x 220m forest scene
    entities = []

    def entity(name, components=None, parent=None):
        e = {
            "entity": len(entities) + 1, "name": name, "parent": parent,
            "siblingIndex": len(entities), "active": True, "components": components or {},
        }
        entities.append(e)
        return e["entity"]

    def tf(pos=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0, 1)):
        return {"position": list(pos), "scale": list(scale), "rotation": list(rot)}

    eye = [18.0, forest_height(18.0, 28.0) + 3.2, 28.0]
    target = [8.0, forest_height(8.0, -4.0) + 2.6, -4.0]
    cam_id = entity("Main Camera", {
        "Transform": tf(eye, rot=look_at_quat(eye, target)),
        "Camera3D": {"fov_y_degrees": 54.0, "near": 0.15, "far": 900.0, "primary": True, "clear_flags": "skybox"},
        "AudioListener": {"primary": True},
    })

    # Dramatic side-raking golden morning sunbeams cutting across the woodland valley!
    entity("Forest Sun", {
        "Transform": tf([0, 80, 0], rot=look_at_quat([0, 0, 0], [0.76, -0.44, -0.48])),
        "DirectionalLight": {
            "color": [1.0, 0.90, 0.72, 1.0], "intensity": 4.2,
            "cast_shadows": True, "shadow_strength": 0.92,
            "shadow_distance": 170.0, "shadow_bias": 0.0008, "shadow_normal_bias": 0.025,
        },
    })

    entity("Forest Environment", {
        "EnvironmentLight": {
            "sky_color": [0.16, 0.34, 0.62, 1.0],
            "equator_color": [0.46, 0.56, 0.48, 1.0],
            "ground_color": [0.06, 0.08, 0.05, 1.0],
            "diffuse_intensity": 0.45,
            "specular_intensity": 0.80,
            "texture": hdri_path,
            "background_enabled": True,
            "background_intensity": 0.88,
            "exposure": -0.25,
            "tone_mapping": True,
        }
    })

    # Track variant-swappable entities so Main.ts can switch PBR / Toon / Standard live!
    swappable = []

    t_id = entity("Forest Terrain", {
        "Transform": tf(),
        "MeshRenderer": {"mesh": terrain_mesh, "material": terrain_mats["pbr"], "cast_shadows": True, "receive_shadows": True},
    })
    swappable.append({"entity": t_id, "mesh": terrain_mesh, "materials": terrain_mats, "cast": True})

    entity("Forest Creek", {
        "Transform": tf(),
        "MeshRenderer": {"mesh": stream_mesh, "material": stream_mat, "cast_shadows": False, "receive_shadows": True},
    })

    def spawn_asset(asset_id, name, pos, scale, yaw, pitch=0.0, roll=0.0, variant_idx=0):
        variants = catalog[asset_id]
        parts = variants[variant_idx % len(variants)]
        root = entity(name, {"Transform": tf(pos, [scale, scale, scale], quat_yxz(yaw, pitch, roll))})
        for idx, part in enumerate(parts):
            pid = entity(f"{name} / p{idx}", {
                "Transform": tf(),
                "MeshRenderer": {"mesh": part["mesh"], "material": part["materials"]["pbr"], "cast_shadows": True, "receive_shadows": True},
            }, root)
            swappable.append({"entity": pid, "mesh": part["mesh"], "materials": part["materials"], "cast": True})

    # Place 105 towering real photogrammetry pines, firs & deciduous woodland trees across both banks!
    placed_trees = 0
    tree_species = [
        ("pine_tree_01", 0.78, 1.18),
        ("fir_tree_01", 0.78, 1.18),
        ("tree_small_02", 1.35, 2.25),
    ]
    for attempt in range(460):
        if placed_trees >= 105:
            break
        x = random.uniform(-82.0, 82.0)
        z = random.uniform(-82.0, 82.0)
        sx = stream_center_x(z)
        if abs(x - sx) < 6.8:
            continue
        if abs((x - sx) - 11.5) < 3.6:  # keep woodland trail clear for camera walk
            continue
        y = forest_height(x, z) - 0.15
        species, sc_min, sc_max = tree_species[placed_trees % len(tree_species)]
        sc = random.uniform(sc_min, sc_max)
        spawn_asset(species, f"Forest Tree {placed_trees}", [x, y, z], sc, random.uniform(0, TAU),
                    random.uniform(-0.03, 0.03), random.uniform(-0.03, 0.03), variant_idx=placed_trees)
        placed_trees += 1

    # Place 55 lush shrubs along tree lines and creek banks
    for idx in range(55):
        x = random.uniform(-68.0, 68.0)
        z = random.uniform(-68.0, 68.0)
        sx = stream_center_x(z)
        if abs(x - sx) < 4.5 or abs((x - sx) - 11.5) < 2.6:
            continue
        y = forest_height(x, z) - 0.08
        spawn_asset("shrub_01", f"Shrub {idx}", [x, y, z], random.uniform(1.4, 2.4), random.uniform(0, TAU), variant_idx=idx)

    # Place 34 mossy boulders along the creek bed and forest slopes
    for idx in range(34):
        z = random.uniform(-75.0, 75.0)
        sx = stream_center_x(z)
        if idx < 18:
            x = sx + random.choice([-1, 1]) * random.uniform(3.5, 7.5)
        else:
            x = random.uniform(-65.0, 65.0)
        y = forest_height(x, z) - 0.25
        spawn_asset("boulder_01", f"Boulder {idx}", [x, y, z], random.uniform(1.1, 2.9), random.uniform(0, TAU), variant_idx=idx)

    # Place 16 weathered fallen dead tree trunks
    for idx in range(16):
        x = random.uniform(-55.0, 55.0)
        z = random.uniform(-55.0, 55.0)
        sx = stream_center_x(z)
        if abs(x - sx) < 4.5 or abs((x - sx) - 11.5) < 3.0:
            continue
        y = forest_height(x, z) - 0.05
        spawn_asset("dead_tree_trunk", f"Fallen Trunk {idx}", [x, y, z], random.uniform(1.5, 2.8), random.uniform(0, TAU), variant_idx=idx)

    # Place 75 ferns carpeting the forest floor near the trail and creek
    for idx in range(75):
        z = random.uniform(-55.0, 55.0)
        sx = stream_center_x(z)
        x = sx + random.uniform(-22.0, 28.0)
        if abs(x - sx) < 3.5 or abs((x - sx) - 11.5) < 1.8:
            continue
        y = forest_height(x, z) - 0.04
        spawn_asset("fern_02", f"Fern {idx}", [x, y, z], random.uniform(1.2, 2.4), random.uniform(0, TAU), variant_idx=idx)

    # Warm camp/shrine lanterns along the forest trail (showcases dynamic point lights + bloom!)
    for idx, z in enumerate([-32.0, -10.0, 12.0, 34.0]):
        x = stream_center_x(z) + 14.0
        y = forest_height(x, z) + 1.8
        entity(f"Trail Lantern {idx}", {
            "Transform": tf([x, y, z]),
            "PointLight": {"color": [1.0, 0.72, 0.36, 1.0], "intensity": 14.0, "range": 16.0},
        })

    # Clean HUD overlay
    canvas = entity("HUD Canvas", {
        "Canvas": {"render_mode": "ScreenSpaceOverlay", "pixel_perfect": False, "sorting_order": 100},
        "CanvasScaler": {"ui_scale_mode": "ScaleWithScreenSize", "reference_resolution": [1920, 1080], "screen_match_mode": "MatchWidthOrHeight", "match_width_or_height": 0.5},
        "GraphicRaycaster": {"enabled": False},
    })

    def hud_box(name, cx, cy, w, h, col):
        return entity(name, {
            "RectTransform": {"anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5], "pivot": [0.5, 0.5], "anchored_position": [cx - 960, cy - 540], "size_delta": [w, h]},
            "Image": {"sprite": "white", "color": col, "raycast_target": False},
        }, canvas)

    def hud_text(name, cx, cy, w, h, content, size, col=(0.96, 0.98, 0.96, 1.0), align="Left"):
        return entity(name, {
            "RectTransform": {"anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5], "pivot": [0.5, 0.5], "anchored_position": [cx - 960, cy - 540], "size_delta": [w, h]},
            "Text": {"text": content, "font": "Assets/Fonts/NotoSansSC.ttf", "font_size": size, "color": list(col), "alignment": align, "vertical_align": "Middle", "horizontal_overflow": "Overflow", "vertical_overflow": "Overflow", "raycast_target": False},
        }, canvas)

    hud_box("hud-bg", 310, 74, 560, 96, [0.02, 0.05, 0.04, 0.72])
    hud_text("hud-title", 310, 54, 520, 34, "VERDANT FOREST  ·  写实大型森林（Poly Haven CC0）", 21, [1.0, 0.88, 0.54, 1.0])
    hud_text("hud-mode", 310, 92, 520, 28, "渲染模式：1 物理 PBR   |   4-CSM 软阴影 · Cubemap IBL · SSAO · AgX", 15, [0.76, 0.92, 0.80, 0.95])
    hud_box("hud-hint-bg", 1480, 1002, 820, 48, [0.02, 0.05, 0.04, 0.68])
    hud_text("hud-hint", 1480, 1002, 780, 30, "1 PBR   2 卡渲 Toon   3 标准 3D   WASD 自由漫游   C 切视角   SPACE 暂停运镜", 15, [0.85, 0.92, 0.88, 0.92], align="Right")

    # Save swappable manifest embedded into Main.ts
    manifest_js = json.dumps(swappable, separators=(",", ":"))
    main_ts = f"""/**
 * Verdant Forest — Real Poly Haven CC0 Photogrammetry Forest Showcase.
 * Keys: 1=PBR, 2=Toon(Cel), 3=Standard 3D, C=Camera Preset, WASD/QE=Free Fly, Space=Toggle Orbit.
 */
interface Swappable {{ entity: number; mesh: string; materials: {{ pbr: string; toon: string; std: string }}; cast: boolean; }}
const SWAPPABLE: Swappable[] = {manifest_js};

let initialized = false;
let byName: Record<string, number> = {{}};
let mode: 'pbr' | 'toon' | 'std' = 'pbr';
let camPreset = 0;
let autoOrbit = true;
let elapsed = 0;
let freePos: [number, number, number] = [18, 5.5, 28];
let freeYaw = 0.25;
let freePitch = -0.10;

function quat(yaw: number, pitch: number): number[] {{
  const hy = yaw * 0.5, hp = pitch * 0.5;
  const sy = Math.sin(hy), cy = Math.cos(hy), sp = Math.sin(hp), cp = Math.cos(hp);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}}

function lookAt(eye: number[], target: number[]): number[] {{
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  const nx = dx / len, ny = dy / len, nz = dz / len;
  return quat(Math.atan2(-nx, -nz), Math.atan2(ny, Math.hypot(nx, nz) || 1e-6));
}}

function setComp(entity: number, component: string, value: unknown): void {{
  engine.pushCommandJson(JSON.stringify({{ op: 'setComponent', entity, component, value }}));
}}

function applyShadingMode(next: 'pbr' | 'toon' | 'std'): void {{
  mode = next;
  for (const item of SWAPPABLE) {{
    setComp(item.entity, 'MeshRenderer', {{
      mesh: item.mesh,
      material: item.materials[next],
      cast_shadows: item.cast,
      receive_shadows: true,
    }});
  }}
  const label = next === 'pbr'
    ? '渲染模式：1 物理 PBR   |   4-CSM 软阴影 · Cubemap IBL · SSAO · AgX'
    : next === 'toon'
    ? '渲染模式：2 卡渲 Toon   |   阶梯色阶 · 冷暖阴影偏色 · 风格化边缘光'
    : '渲染模式：3 标准 3D   |   Half-Lambert + 归一化 Blinn-Phong';
  if (byName['hud-mode']) {{
    setComp(byName['hud-mode'], 'Text', {{
      text: label, font: 'Assets/Fonts/NotoSansSC.ttf', font_size: 15,
      color: [0.76, 0.92, 0.80, 0.95], alignment: 'Left', vertical_align: 'Middle',
      horizontal_overflow: 'Overflow', vertical_overflow: 'Overflow', raycast_target: false,
    }});
  }}
}}

function onSceneLoaded(_scene: EngineSceneInfo): void {{ initialized = false; }}

function onTick(dt: number, _frame: number): void {{
  if (!initialized) {{
    byName = {{}};
    for (const e of engine.snapshot.entities) if (e.name) byName[e.name] = e.entity;
    initialized = true;
  }}
  dt = Math.min(dt, 0.08);
  const pressed = (k: string) => engine.input.pressedKeys.includes(k);
  const held = (...ks: string[]) => ks.some(k => engine.input.keys.includes(k));

  if (pressed('Digit1')) applyShadingMode('pbr');
  if (pressed('Digit2')) applyShadingMode('toon');
  if (pressed('Digit3')) applyShadingMode('std');
  if (pressed('Space')) autoOrbit = !autoOrbit;
  if (pressed('KeyC')) {{ camPreset = (camPreset + 1) % 3; autoOrbit = true; }}

  const moving = held('KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight');
  if (moving) autoOrbit = false;

  const camId = byName['Main Camera'];
  if (!camId) return;

  if (autoOrbit) {{
    elapsed += dt;
    let eye: [number, number, number];
    let target: [number, number, number];
    if (camPreset === 0) {{
      // Trail walk glide along the woodland creek
      const z = 36 - ((elapsed * 2.8) % 72);
      const sx = 12 * Math.sin(z * 0.032) + 5 * Math.cos(z * 0.017);
      eye = [sx + 11.5, 4.6, z];
      target = [sx + 3.0, 4.0, z - 14.0];
    }} else if (camPreset === 1) {{
      // Canopy aerial sweep showing full forest + CSM shadows
      const a = elapsed * 0.14;
      eye = [Math.cos(a) * 52, 24, Math.sin(a) * 52];
      target = [0, 3.5, 0];
    }} else {{
      // Close-up showcase of scanned fir bark, ferns and mossy boulder
      const a = elapsed * 0.25;
      eye = [14 + Math.cos(a) * 9, 3.4, 8 + Math.sin(a) * 9];
      target = [14, 2.2, 8];
    }}
    freePos = eye;
    setComp(camId, 'Transform', {{ position: eye, rotation: lookAt(eye, target), scale: [1, 1, 1] }});
  }} else {{
    const turn = Number(held('ArrowLeft')) - Number(held('ArrowRight'));
    freeYaw += turn * 1.6 * dt;
    const fx = -Math.sin(freeYaw), fz = -Math.cos(freeYaw);
    const rx = Math.cos(freeYaw), rz = -Math.sin(freeYaw);
    const spd = held('ShiftLeft', 'ShiftRight') ? 26 : 12;
    const fwd = Number(held('KeyW', 'ArrowUp')) - Number(held('KeyS', 'ArrowDown'));
    const strafe = Number(held('KeyD')) - Number(held('KeyA'));
    const up = Number(held('KeyE')) - Number(held('KeyQ'));
    freePos[0] += (fx * fwd + rx * strafe) * spd * dt;
    freePos[1] += up * spd * dt;
    freePos[2] += (fz * fwd + rz * strafe) * spd * dt;
    setComp(camId, 'Transform', {{ position: freePos, rotation: quat(freeYaw, freePitch), scale: [1, 1, 1] }});
  }}
}}
"""
    (SCRIPTS / "Main.ts").write_text(main_ts, encoding="utf-8")

    (OUT / ".gitignore").write_text("/Builds/\n", encoding="utf-8")
    (OUT / "project.json").write_text(json.dumps({
        "name": "Verdant Forest", "version": 1, "language": "typescript",
        "mainScene": "Assets/Scenes/Main.mscene", "buildScenes": ["Assets/Scenes/Main.mscene"],
        "startupScript": "Assets/Scripts/Main.ts", "assetMode": "all",
    }, indent=2) + "\n", encoding="utf-8")
    (SCENES / "Main.mscene").write_text(json.dumps({
        "version": 1, "name": "Verdant Forest",
        "world": {"entities": entities, "frame": 0, "sim_frame": 0, "clear_color": [0.22, 0.34, 0.42, 1.0], "selected": cam_id},
    }, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(
        "# Verdant Forest / 翠影幽林\n\n"
        "导入自 **Poly Haven CC0** 真实照片扫描 3D 自然资产（冷杉、灌木、苔藓巨岩、倒木、蕨类、林地 1K PBR 贴图与 32-bit 森林 HDRI `epping_forest_01`），"
        "按原始 glTF 材质 1:1 拆分导入 MEngine，验证 4 级联 CSM 树影、Cubemap IBL、SSAO、Bloom、AgX 以及 PBR / 卡渲 Toon / 标准 3D 实时切换。\n\n"
        "按键：`1` 物理 PBR · `2` 卡渲 Toon · `3` 标准 3D · `C` 切换运镜 · `WASD/QE` 自由漫游 · `Space` 暂停/恢复自动运镜。\n",
        encoding="utf-8",
    )

    sync_meta_files()
    print(f"Built Verdant Forest: {len(entities)} entities, {len(swappable)} swappable mesh parts.")


if __name__ == "__main__":
    main()
