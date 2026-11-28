"""Metro City / 现代都市 — Large-scale 3D city block sample importer.

Downloads authentic CC0 3D urban architecture, skyscrapers, commercial & suburban buildings,
roads, intersections, streetlamps, and vehicles from Kenney's official 3D asset packs
(via shorepine/kenney mirror) plus a real 32-bit floating-point golden-hour sky HDRI from
Poly Haven, splits multi-material GLBs 1:1 into MEngine assets, and constructs a 6x6
metropolitan city district with:
  - 90+ skyscrapers, commercial stores & suburban blocks
  - Complete road grid, crosswalks, curbs, central park & moving city traffic
  - 36 real dynamic streetlight PointLights (exercising the new 64+64 dynamic light pipeline)
  - 4-Cascade CSM building shadows, Cubemap IBL, SSAO, Dual-Kawase Bloom, AgX tone mapping
  - Live 1/2/3 switching between Physical PBR, Stylized Toon (Cel), and Standard 3D Shading

Run from the repository root:
    python scripts/import-metro-city.py
"""
import json
import math
import random
import shutil
import struct
import urllib.request
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tmp/imported-assets-cache/kenney-city"
OUT = ROOT / "samples/metro-city"
MODELS = OUT / "Assets/Models"
TEXTURES = OUT / "Assets/Textures"
MATERIALS = OUT / "Assets/Materials"
SCENES = OUT / "Assets/Scenes"
SCRIPTS = OUT / "Assets/Scripts"
FONTS = OUT / "Assets/Fonts"

META_NAMESPACE = uuid.UUID("92c4e1b0-4f38-49f1-82b5-6c1d3e980422")
TAU = math.tau
random.seed(2026)

HEADERS = {"User-Agent": "MEngineCityImporter/1.0"}
KENNEY_RAW = "https://raw.githubusercontent.com/shorepine/kenney/main/3d"

CITY_ASSETS = [
    # Skyscrapers & commercial buildings
    ("city-commercial", "building-skyscraper-a.glb"),
    ("city-commercial", "building-skyscraper-b.glb"),
    ("city-commercial", "building-skyscraper-c.glb"),
    ("city-commercial", "building-skyscraper-d.glb"),
    ("city-commercial", "building-skyscraper-e.glb"),
    ("city-commercial", "building-a.glb"),
    ("city-commercial", "building-b.glb"),
    ("city-commercial", "building-c.glb"),
    ("city-commercial", "building-d.glb"),
    ("city-commercial", "building-e.glb"),
    ("city-commercial", "building-f.glb"),
    ("city-commercial", "building-g.glb"),
    ("city-commercial", "building-h.glb"),
    ("city-commercial", "building-i.glb"),
    ("city-commercial", "building-j.glb"),
    # Roads, crosswalks, streetlights & traffic
    ("city-roads", "road-straight.glb"),
    ("city-roads", "road-crossroad.glb"),
    ("city-roads", "road-crossroad-path.glb"),
    ("city-roads", "road-crossing.glb"),
    ("city-roads", "road-bend.glb"),
    ("city-roads", "light-curved.glb"),
    ("city-roads", "light-curved-double.glb"),
    ("city-roads", "light-square.glb"),
    ("city-roads", "tile-low.glb"),
    # Vehicles
    ("car", "sedan.glb"),
    ("car", "sedan-sports.glb"),
    ("car", "suv.glb"),
    ("car", "taxi.glb"),
    ("car", "van.glb"),
    ("car", "truck.glb"),
    ("car", "police.glb"),
    # Park trees
    ("nature", "tree_oak.glb"),
    ("nature", "tree_pineDefaultA.glb"),
    ("nature", "tree_detailed.glb"),
]


def download_file(url: str, dst: Path):
    if dst.exists() and dst.stat().st_size > 0:
        return True
    dst.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers=HEADERS)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            dst.write_bytes(resp.read())
        return True
    except Exception as exc:
        print(f"  [warn] skip {url}: {exc}")
        return False


def fetch_json(url: str):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.loads(resp.read().decode("utf-8"))


# --------------------------------------------------------------------------- GLB parser & 1:1 splitter


COMP_FMT = {5120: ("b", 1), 5121: ("B", 1), 5122: ("h", 2), 5123: ("H", 2), 5125: ("I", 4), 5126: ("f", 4)}
TYPE_COUNT = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def mat4_identity():
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]


def mat4_mul(a, b):
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
    return quat_yxz(math.atan2(-nx, -nz), math.atan2(ny, math.hypot(nx, nz) or 1e-6), 0.0)


def parse_glb(raw: bytes):
    magic, version, total = struct.unpack_from("<III", raw, 0)
    assert magic == 0x46546C67, "Not a valid GLB file"
    off = 12
    doc = None
    bin_chunk = b""
    while off + 8 <= len(raw):
        clen, ctype = struct.unpack_from("<II", raw, off)
        off += 8
        chunk = raw[off:off + clen]
        off += clen
        if ctype == 0x4E4F534A:
            doc = json.loads(chunk.decode("utf-8"))
        elif ctype == 0x004E4942:
            bin_chunk = chunk
    return doc, bin_chunk


def read_accessor(doc, bin_data, acc_idx):
    acc = doc["accessors"][acc_idx]
    bv = doc["bufferViews"][acc["bufferView"]]
    fmt_char, comp_size = COMP_FMT[acc["componentType"]]
    num_comp = TYPE_COUNT[acc["type"]]
    count = acc["count"]
    byte_offset = bv.get("byteOffset", 0) + acc.get("byteOffset", 0)
    stride = bv.get("byteStride") or (comp_size * num_comp)
    elem_fmt = "<" + fmt_char * num_comp
    out = []
    for i in range(count):
        vals = struct.unpack_from(elem_fmt, bin_data, byte_offset + i * stride)
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
        "asset": {"version": "2.0", "generator": "MEngine Metro City Importer"},
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


def import_kenney_glb(pack: str, filename: str, material_cache: dict):
    """Downloads a Kenney GLB, extracts embedded colormap/materials 1:1, splits by material."""
    cache_path = CACHE / pack / filename
    url = f"{KENNEY_RAW}/{pack}/{filename}"
    if not download_file(url, cache_path):
        return None

    doc, bin_data = parse_glb(cache_path.read_bytes())
    stem = f"{pack}_{Path(filename).stem}"

    # Extract embedded OR external-URI textures (Kenney GLBs reference Textures/colormap.png!)
    img_paths = {}
    for img_idx, img in enumerate(doc.get("images", [])):
        if "bufferView" in img:
            bv = doc["bufferViews"][img["bufferView"]]
            off = bv.get("byteOffset", 0)
            blob = bin_data[off:off + bv["byteLength"]]
            ext = ".jpg" if "jpeg" in img.get("mimeType", "") else ".png"
            tkey = f"{pack}_tex_{len(blob)}{ext}"
            tdst = TEXTURES / tkey
            if not tdst.exists():
                tdst.write_bytes(blob)
            img_paths[img_idx] = f"Assets/Textures/{tkey}"
        elif "uri" in img:
            uri = img["uri"]
            tex_cache = CACHE / pack / uri
            tex_url = f"{KENNEY_RAW}/{pack}/{uri}"
            if download_file(tex_url, tex_cache):
                tkey = f"{pack}_{Path(uri).name}"
                tdst = TEXTURES / tkey
                if not tdst.exists():
                    shutil.copy2(tex_cache, tdst)
                img_paths[img_idx] = f"Assets/Textures/{tkey}"

    def resolve_tex(tex_ref):
        if not tex_ref:
            return ""
        t = doc["textures"][tex_ref["index"]]
        return img_paths.get(t["source"], "")

    by_mat = {}
    nodes = doc.get("nodes", [])

    def visit(n_idx, parent_m):
        node = nodes[n_idx]
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
                pos = read_accessor(doc, bin_data, attrs["POSITION"])
                nrm = read_accessor(doc, bin_data, attrs["NORMAL"]) if "NORMAL" in attrs else [[0, 1, 0]] * len(pos)
                uv = read_accessor(doc, bin_data, attrs["TEXCOORD_0"]) if "TEXCOORD_0" in attrs else [[0, 0]] * len(pos)
                idx = read_accessor(doc, bin_data, prim["indices"]) if "indices" in prim else list(range(len(pos)))

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
        for c in node.get("children", []):
            visit(c, world_m)

    scene_idx = doc.get("scene", 0)
    roots = doc["scenes"][scene_idx].get("nodes", []) if doc.get("scenes") else list(range(len(nodes)))
    for r in roots:
        visit(r, mat4_identity())

    if not by_mat:
        return None

    all_pts = [p for b in by_mat.values() for p in b["p"]]
    size_x = max(p[0] for p in all_pts) - min(p[0] for p in all_pts)
    size_y = max(p[1] for p in all_pts) - min(p[1] for p in all_pts)
    size_z = max(p[2] for p in all_pts) - min(p[2] for p in all_pts)

    parts = []
    mats = doc.get("materials", [{}])
    for mat_idx, bucket in sorted(by_mat.items()):
        if not bucket["p"] or not bucket["i"]:
            continue
        mat = mats[mat_idx] if mat_idx < len(mats) else {}
        pbr = mat.get("pbrMetallicRoughness", {})
        base_tex = resolve_tex(pbr.get("baseColorTexture"))
        base_col = [round(v, 4) for v in pbr.get("baseColorFactor", [1.0, 1.0, 1.0, 1.0])]
        metallic = round(float(pbr.get("metallicFactor", 0.05)), 3)
        roughness = round(float(pbr.get("roughnessFactor", 0.62)), 3)
        emissive = [round(v, 4) for v in mat.get("emissiveFactor", [0.0, 0.0, 0.0])]
        # Make glass windows slightly glossier and streetlamp bulbs glow!
        mname_lower = mat.get("name", "").lower()
        if "glass" in mname_lower or "window" in mname_lower:
            roughness = min(roughness, 0.14)
            metallic = max(metallic, 0.25)
        if "light" in mname_lower or "lamp" in mname_lower or "glow" in mname_lower:
            emissive = [1.0, 0.85, 0.55]

        sig = (base_tex, tuple(base_col), metallic, roughness, tuple(emissive))
        if sig not in material_cache:
            mid = len(material_cache)
            mat_paths = {}
            for variant, shader_name in [("pbr", "pbr"), ("toon", "toon"), ("std", "standard")]:
                fn = f"city_mat_{mid:02d}_{variant}.mmat"
                (MATERIALS / fn).write_text(json.dumps({
                    "version": 10,
                    "name": f"City Material {mid} ({variant})",
                    "shader": shader_name,
                    "surface": "opaque",
                    "base_color": base_col,
                    "metallic": metallic,
                    "roughness": roughness,
                    "emissive": emissive,
                    "emissive_strength": 2.4 if any(v > 0.1 for v in emissive) else 1.0,
                    "base_color_texture": base_tex,
                    "anisotropy": 8,
                    "toon_steps": 3.0,
                    "toon_smoothness": 0.05,
                    "toon_specular_size": 0.35,
                    "toon_shadow_tint": [0.20, 0.24, 0.38, 0.85],
                    "toon_rim_color": [1.0, 0.84, 0.58, 0.42],
                }, indent=2) + "\n", encoding="utf-8")
                mat_paths[variant] = f"Assets/Materials/{fn}"
            material_cache[sig] = mat_paths

        glb_name = f"{stem}_m{mat_idx}.glb"
        save_glb(MODELS / glb_name, bucket["p"], bucket["n"], bucket["uv"], bucket["i"])
        parts.append({"mesh": f"Assets/Models/{glb_name}", "materials": material_cache[sig]})

    return {"parts": parts, "bounds": (max(size_x, 0.05), max(size_y, 0.05), max(size_z, 0.05))}


def download_city_hdri():
    hdri_id = "belfast_sunset_puresky"
    print(f"[PolyHaven] Fetching 32-bit HDRI {hdri_id}...")
    info = fetch_json(f"https://api.polyhaven.com/files/{hdri_id}")
    hdr = info["hdri"]["2k"]["hdr"]
    dst = TEXTURES / f"{hdri_id}_2k.hdr"
    download_file(hdr["url"], dst)
    return f"Assets/Textures/{dst.name}"


IMPORTER_BY_EXT = {
    ".glb": "model", ".png": "texture", ".jpg": "texture", ".hdr": "texture",
    ".mshader": "shader", ".mmat": "material", ".mscene": "scene",
    ".ts": "script", ".js": "script", ".ttf": "font",
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

    print("[Kenney] Downloading and importing 3D city asset kits...")
    material_cache = {}
    catalog = {}
    for pack, fn in CITY_ASSETS:
        key = Path(fn).stem
        parts = import_kenney_glb(pack, fn, material_cache)
        if parts:
            catalog[key] = parts
    print(f"  -> Imported {len(catalog)} city models across {len(material_cache)} shared PBR/Toon/Standard materials.")

    hdri_path = download_city_hdri()

    # Ground base slab GLB (large asphalt/concrete urban foundation)
    save_glb(
        MODELS / "city_foundation.glb",
        [[-140, -0.05, -140], [140, -0.05, -140], [140, -0.05, 140], [-140, -0.05, 140]],
        [[0, 1, 0]] * 4,
        [[0, 0], [40, 0], [40, 40], [0, 40]],
        [0, 2, 1, 0, 3, 2],
    )
    ground_mats = {}
    for variant, shader_name in [("pbr", "pbr"), ("toon", "toon"), ("std", "standard")]:
        fn = f"city_ground_{variant}.mmat"
        (MATERIALS / fn).write_text(json.dumps({
            "version": 10, "name": f"City Ground ({variant})", "shader": shader_name,
            "surface": "opaque", "base_color": [0.16, 0.17, 0.19, 1.0],
            "metallic": 0.0, "roughness": 0.85,
            "toon_steps": 2.0, "toon_shadow_tint": [0.14, 0.18, 0.28, 0.85],
        }, indent=2) + "\n", encoding="utf-8")
        ground_mats[variant] = f"Assets/Materials/{fn}"

    entities = []
    swappable = []
    cars_anim = []

    def entity(name, components=None, parent=None):
        e = {
            "entity": len(entities) + 1, "name": name, "parent": parent,
            "siblingIndex": len(entities), "active": True, "components": components or {},
        }
        entities.append(e)
        return e["entity"]

    def tf(pos=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0, 1)):
        return {"position": list(pos), "scale": list(scale), "rotation": list(rot)}

    def spawn(key, name, pos, scale=1.0, yaw=0.0, cast=True):
        entry = catalog.get(key)
        if not entry:
            return None
        parts = entry["parts"]
        sc_vec = list(scale) if isinstance(scale, (list, tuple)) else [scale, scale, scale]
        root = entity(name, {"Transform": tf(pos, sc_vec, quat_yxz(yaw))})
        for idx, part in enumerate(parts):
            pid = entity(f"{name}/p{idx}", {
                "Transform": tf(),
                "MeshRenderer": {"mesh": part["mesh"], "material": part["materials"]["pbr"], "cast_shadows": cast, "receive_shadows": True},
            }, root)
            swappable.append({"entity": pid, "mesh": part["mesh"], "materials": part["materials"], "cast": cast})
        return root

    eye = [54.0, 29.0, 58.0]
    target = [2.0, 10.0, 0.0]
    cam_id = entity("Main Camera", {
        "Transform": tf(eye, rot=look_at_quat(eye, target)),
        "Camera3D": {"fov_y_degrees": 50.0, "near": 0.2, "far": 1200.0, "primary": True, "clear_flags": "skybox"},
        "AudioListener": {"primary": True},
    })

    # Dramatic side-raking golden-hour sun casting long crisp architectural shadows across the avenues!
    entity("City Sun", {
        "Transform": tf([0, 90, 0], rot=look_at_quat([0, 0, 0], [0.76, -0.34, -0.55])),
        "DirectionalLight": {
            "color": [1.0, 0.78, 0.52, 1.0], "intensity": 3.4,
            "cast_shadows": True, "shadow_strength": 0.92,
            "shadow_distance": 210.0, "shadow_bias": 0.0008, "shadow_normal_bias": 0.025,
        },
    })

    entity("City Environment", {
        "EnvironmentLight": {
            "sky_color": [0.12, 0.24, 0.48, 1.0],
            "equator_color": [0.76, 0.44, 0.26, 1.0],
            "ground_color": [0.05, 0.06, 0.08, 1.0],
            "diffuse_intensity": 0.36,
            "specular_intensity": 0.72,
            "texture": hdri_path,
            "background_enabled": True,
            "background_intensity": 0.85,
            "exposure": -0.35,
            "tone_mapping": True,
        }
    })

    gid = entity("City Foundation", {
        "Transform": tf(),
        "MeshRenderer": {"mesh": "Assets/Models/city_foundation.glb", "material": ground_mats["pbr"], "cast_shadows": False, "receive_shadows": True},
    })
    swappable.append({"entity": gid, "mesh": "Assets/Models/city_foundation.glb", "materials": ground_mats, "cast": False})

    # ---- Build a 17x17 modular urban grid (CELL = 8m -> 136m x 136m dense metropolis!)
    # Roads sit on grid lines divisible by 4: indices -8, -4, 0, 4, 8 (5 avenues x 5 streets)
    CELL = 8.0
    ROAD_IDX = {-8, -4, 0, 4, 8}
    skyscrapers = [k for k in ["building-skyscraper-a", "building-skyscraper-b", "building-skyscraper-c", "building-skyscraper-d", "building-skyscraper-e"] if k in catalog]
    commercial = [k for k in ["building-a", "building-b", "building-c", "building-d", "building-e", "building-f", "building-g", "building-h", "building-i", "building-j"] if k in catalog]
    trees = [k for k in ["tree_oak", "tree_pineDefaultA", "tree_detailed"] if k in catalog]

    lamp_count = 0
    for gx in range(-8, 9):
        for gz in range(-8, 9):
            wx, wz = gx * CELL, gz * CELL
            on_x_road = gx in ROAD_IDX
            on_z_road = gz in ROAD_IDX

            if on_x_road and on_z_road:
                spawn("road-crossroad", f"Crossroad {gx}_{gz}", [wx, 0.0, wz], scale=CELL, yaw=0.0, cast=False)
                # Place warm streetlight + real PointLight at all 25 intersections (showcasing 64-light buffer!)
                if lamp_count < 36:
                    lx, lz = wx + 3.55, wz + 3.55
                    spawn("light-curved", f"Streetlamp {lamp_count}", [lx, 0.0, lz], scale=6.8, yaw=math.pi * 0.25)
                    entity(f"Streetlight {lamp_count}", {
                        "Transform": tf([lx - 0.7, 4.9, lz - 0.7]),
                        "PointLight": {"color": [1.0, 0.78, 0.44, 1.0], "intensity": 18.0, "range": 18.0},
                    })
                    lamp_count += 1
            elif on_x_road:
                road_key = "road-crossing" if (gz % 2 == 0) else "road-straight"
                spawn(road_key, f"Ave {gx}_{gz}", [wx, 0.0, wz], scale=CELL, yaw=0.0, cast=False)
            elif on_z_road:
                road_key = "road-crossing" if (gx % 2 == 0) else "road-straight"
                spawn(road_key, f"St {gx}_{gz}", [wx, 0.0, wz], scale=CELL, yaw=math.pi * 0.5, cast=False)
            else:
                # Central Park block at (1..3, 1..3)
                if 1 <= gx <= 3 and 1 <= gz <= 3:
                    spawn("tile-low", f"Park Tile {gx}_{gz}", [wx, 0.0, wz], scale=CELL, cast=False)
                    if trees:
                        tkey = trees[(gx + gz) % len(trees)]
                        spawn(tkey, f"Park Tree {gx}_{gz}", [wx + random.uniform(-1.5, 1.5), 0.1, wz + random.uniform(-1.5, 1.5)],
                              scale=random.uniform(3.8, 5.4), yaw=random.uniform(0, TAU))
                else:
                    # Downtown core around center -> tall skyscrapers; outer blocks -> mid-rise commercial
                    # Scale each building cleanly by its exact XZ bounding box so it sits strictly inside its 8m lot!
                    dist = math.hypot(gx, gz)
                    if dist < 5.5 and skyscrapers and (gx + gz) % 2 == 0:
                        bkey = skyscrapers[(gx * 7 + gz * 13) % len(skyscrapers)]
                        bx, by, bz = catalog[bkey]["bounds"]
                        fit = (CELL * 0.84) / max(bx, bz)
                        sc = [fit, fit * random.uniform(1.05, 1.38), fit]
                    else:
                        bkey = commercial[(gx * 5 + gz * 11) % len(commercial)]
                        bx, by, bz = catalog[bkey]["bounds"]
                        fit = (CELL * 0.84) / max(bx, bz)
                        sc = [fit, fit * random.uniform(0.95, 1.18), fit]
                    yaw = random.choice([0.0, math.pi * 0.5, math.pi, -math.pi * 0.5])
                    spawn(bkey, f"Building {gx}_{gz}", [wx, 0.0, wz], scale=sc, yaw=yaw)

    # ---- Moving traffic along the main avenues & streets
    car_keys = [k for k in ["sedan", "sedan-sports", "suv", "taxi", "van", "truck", "police"] if k in catalog]
    for idx in range(16):
        ckey = car_keys[idx % len(car_keys)]
        axis = "z" if idx < 8 else "x"
        lane_grid = [-4, 0, 4, 0][idx % 4]
        direction = 1 if idx % 2 == 0 else -1
        lane_offset = 1.65 * direction
        start_t = -60.0 + (idx * 17.0) % 120.0
        pos = [lane_grid * CELL + lane_offset, 0.05, start_t] if axis == "z" else [start_t, 0.05, lane_grid * CELL + lane_offset]
        yaw = (0.0 if direction > 0 else math.pi) if axis == "z" else (math.pi * 0.5 if direction > 0 else -math.pi * 0.5)
        cid = spawn(ckey, f"Car {idx}", pos, scale=1.55, yaw=yaw)
        if cid:
            cars_anim.append({
                "entity": cid, "axis": axis, "lane": lane_grid * CELL + lane_offset,
                "dir": direction, "t": start_t, "speed": random.uniform(7.5, 13.0),
            })

    # ---- Clean HUD overlay
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

    def hud_text(name, cx, cy, w, h, content, size, col=(0.96, 0.98, 0.99, 1.0), align="Left"):
        return entity(name, {
            "RectTransform": {"anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5], "pivot": [0.5, 0.5], "anchored_position": [cx - 960, cy - 540], "size_delta": [w, h]},
            "Text": {"text": content, "font": "Assets/Fonts/NotoSansSC.ttf", "font_size": size, "color": list(col), "alignment": align, "vertical_align": "Middle", "horizontal_overflow": "Overflow", "vertical_overflow": "Overflow", "raycast_target": False},
        }, canvas)

    hud_box("hud-bg", 328, 74, 596, 96, [0.03, 0.04, 0.07, 0.74])
    hud_text("hud-title", 328, 54, 556, 34, "METRO CITY  ·  大型现代都市（Kenney + Poly Haven CC0）", 21, [1.0, 0.80, 0.44, 1.0])
    hud_text("hud-mode", 328, 92, 556, 28, "渲染模式：1 物理 PBR   |   4-CSM · 36 路灯点光 · Cubemap IBL · AgX", 15, [0.68, 0.88, 1.0, 0.96])
    hud_box("hud-hint-bg", 1480, 1002, 820, 48, [0.03, 0.04, 0.07, 0.70])
    hud_text("hud-hint", 1480, 1002, 780, 30, "1 PBR   2 卡渲 Toon   3 标准 3D   WASD/QE 自由飞行   C 切视角   SPACE 暂停", 15, [0.85, 0.90, 0.96, 0.92], align="Right")

    main_ts = f"""/**
 * Metro City — Large-scale CC0 Metropolis Showcase.
 * Keys: 1=PBR, 2=Toon(Cel), 3=Standard 3D, C=Camera Preset, WASD/QE=Free Fly, Space=Pause.
 */
interface Swappable {{ entity: number; mesh: string; materials: {{ pbr: string; toon: string; std: string }}; cast: boolean; }}
interface CarState {{ entity: number; axis: string; lane: number; dir: number; t: number; speed: number; }}

const SWAPPABLE: Swappable[] = {json.dumps(swappable, separators=(",", ":"))};
const CARS: CarState[] = {json.dumps(cars_anim, separators=(",", ":"))};

let initialized = false;
let byName: Record<string, number> = {{}};
let camPreset = 0;
let autoCam = true;
let elapsed = 0;
let freePos: [number, number, number] = [68, 42, 74];
let freeYaw = 0.72;
let freePitch = -0.35;

function quat(yaw: number, pitch: number): number[] {{
  const hy = yaw * 0.5, hp = pitch * 0.5;
  const sy = Math.sin(hy), cy = Math.cos(hy), sp = Math.sin(hp), cp = Math.cos(hp);
  return [cy * sp, sy * cp, -sy * sp, cy * cp];
}}

function lookAt(eye: number[], target: number[]): number[] {{
  const dx = target[0] - eye[0], dy = target[1] - eye[1], dz = target[2] - eye[2];
  const len = Math.hypot(dx, dy, dz) || 1;
  return quat(Math.atan2(-dx / len, -dz / len), Math.atan2(dy / len, Math.hypot(dx / len, dz / len) || 1e-6));
}}

function setComp(entity: number, component: string, value: unknown): void {{
  engine.pushCommandJson(JSON.stringify({{ op: 'setComponent', entity, component, value }}));
}}

function applyShadingMode(next: 'pbr' | 'toon' | 'std'): void {{
  for (const item of SWAPPABLE) {{
    setComp(item.entity, 'MeshRenderer', {{
      mesh: item.mesh,
      material: item.materials[next],
      cast_shadows: item.cast,
      receive_shadows: true,
    }});
  }}
  const label = next === 'pbr'
    ? '渲染模式：1 物理 PBR   |   4-CSM · 36 路灯点光 · Cubemap IBL · AgX'
    : next === 'toon'
    ? '渲染模式：2 卡渲 Toon   |   阶梯漫反射 · 建筑边缘光 · 动漫色彩'
    : '渲染模式：3 标准 3D   |   Half-Lambert + 归一化 Blinn-Phong';
  if (byName['hud-mode']) {{
    setComp(byName['hud-mode'], 'Text', {{
      text: label, font: 'Assets/Fonts/NotoSansSC.ttf', font_size: 15,
      color: [0.68, 0.88, 1.0, 0.96], alignment: 'Left', vertical_align: 'Middle',
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
  if (pressed('Space')) autoCam = !autoCam;
  if (pressed('KeyC')) {{ camPreset = (camPreset + 1) % 3; autoCam = true; }}

  const moving = held('KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowLeft', 'ArrowRight');
  if (moving) autoCam = false;

  // Animate urban traffic continuously
  for (const car of CARS) {{
    car.t += car.dir * car.speed * dt;
    if (car.t > 66) car.t = -66;
    if (car.t < -66) car.t = 66;
    const pos = car.axis === 'z' ? [car.lane, 0.05, car.t] : [car.t, 0.05, car.lane];
    const yaw = car.axis === 'z'
      ? (car.dir > 0 ? Math.PI : 0)
      : (car.dir > 0 ? -Math.PI * 0.5 : Math.PI * 0.5);
    setComp(car.entity, 'Transform', {{ position: pos, rotation: quat(yaw, 0), scale: [1.55, 1.55, 1.55] }});
  }}

  const camId = byName['Main Camera'];
  if (!camId) return;

  if (autoCam) {{
    elapsed += dt;
    let eye: [number, number, number];
    let target: [number, number, number];
    if (camPreset === 0) {{
      // Aerial skyline orbit
      const a = 0.72 + elapsed * 0.10;
      eye = [Math.cos(a) * 84, 38 + Math.sin(elapsed * 0.25) * 6, Math.sin(a) * 84];
      target = [0, 12, 0];
    }} else if (camPreset === 1) {{
      // Street-level canyon drive along Main Avenue
      const z = 54 - ((elapsed * 5.2) % 108);
      eye = [1.8, 3.6, z];
      target = [-0.5, 4.8, z - 18];
    }} else {{
      // Sunset Central Park + skyscraper vista
      const a = elapsed * 0.18;
      eye = [18 + Math.cos(a) * 26, 12, 18 + Math.sin(a) * 26];
      target = [0, 16, 0];
    }}
    freePos = eye;
    setComp(camId, 'Transform', {{ position: eye, rotation: lookAt(eye, target), scale: [1, 1, 1] }});
  }} else {{
    const turn = Number(held('ArrowLeft')) - Number(held('ArrowRight'));
    freeYaw += turn * 1.6 * dt;
    const fx = -Math.sin(freeYaw), fz = -Math.cos(freeYaw);
    const rx = Math.cos(freeYaw), rz = -Math.sin(freeYaw);
    const spd = held('ShiftLeft', 'ShiftRight') ? 38 : 18;
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
        "name": "Metro City", "version": 1, "language": "typescript",
        "mainScene": "Assets/Scenes/Main.mscene", "buildScenes": ["Assets/Scenes/Main.mscene"],
        "startupScript": "Assets/Scripts/Main.ts", "assetMode": "all",
    }, indent=2) + "\n", encoding="utf-8")
    (SCENES / "Main.mscene").write_text(json.dumps({
        "version": 1, "name": "Metro City",
        "world": {"entities": entities, "frame": 0, "sim_frame": 0, "clear_color": [0.15, 0.22, 0.34, 1.0], "selected": cam_id},
    }, indent=2) + "\n", encoding="utf-8")
    (OUT / "README.md").write_text(
        "# Metro City / 现代都市\n\n"
        "导入自 **Kenney CC0** 商业摩天楼、道路网、路灯与车辆套组 + **Poly Haven CC0** 32-bit 黄金日落天空 HDRI（`belfast_sunset_puresky`），"
        "构建 136m×136m 大型现代都市街区，含 36 盏真实动态路灯点光源、流动车流、4 级联 CSM 建筑阴影、Cubemap IBL、SSAO、Bloom 与 AgX 色调映射。\n\n"
        "按键：`1` 物理 PBR · `2` 卡渲 Toon · `3` 标准 3D · `C` 切换航拍/街景/公园视角 · `WASD/QE` 自由飞行 · `Space` 暂停/恢复自动运镜。\n",
        encoding="utf-8",
    )

    sync_meta_files()
    print(f"Built Metro City: {len(entities)} entities, {lamp_count} streetlights, {len(cars_anim)} moving cars.")


if __name__ == "__main__":
    main()
