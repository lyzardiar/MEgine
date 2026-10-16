"""Lumen Shoal / 流光泻湖 — deterministic generator for an original 3D showcase sample.

Produces GLB meshes (ocean grid, island heightfield, faceted rocks, sky dome),
procedural textures (tangent-space normal map + equirectangular golden-hour sky for
image-based lighting and reflections), the .mscene and project manifest, and copies the
CJK-capable font + script typings. Shaders (.mshader), materials (.mmat) and Main.ts are
authored as static files in the sample directory and referenced here by path.

Run from the repository root:  python scripts/create-lumen-shoal.py
"""
import json
import math
import shutil
import struct
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "samples/lumen-shoal"
MODELS = OUT / "Assets/Models"
TEXTURES = OUT / "Assets/Textures"
SCENES = OUT / "Assets/Scenes"
SCRIPTS = OUT / "Assets/Scripts"
FONTS = OUT / "Assets/Fonts"
TAU = math.tau

# --------------------------------------------------------------------------- color


def srgb_to_linear(hex_str):
    """Material base colours are authored in linear space, matching Pelican Road Rage."""
    rgb = [int(hex_str[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [(v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4) for v in rgb] + [1.0]


# --------------------------------------------------------------------------- noise
# Small deterministic value-noise used for terrain, cloud-free height and textures.

def _hash2(x, y, seed):
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    n = (n ^ (n >> 16)) & 0xFFFFFFFF
    return n / 4294967295.0


def _smooth(t):
    return t * t * (3.0 - 2.0 * t)


def value_noise(x, y, seed=0):
    xi, yi = int(math.floor(x)), int(math.floor(y))
    xf, yf = x - xi, y - yi
    tl, tr = _hash2(xi, yi, seed), _hash2(xi + 1, yi, seed)
    bl, br = _hash2(xi, yi + 1, seed), _hash2(xi + 1, yi + 1, seed)
    u, v = _smooth(xf), _smooth(yf)
    top = tl + (tr - tl) * u
    bot = bl + (br - bl) * u
    return top + (bot - top) * v


def fbm(x, y, octaves=5, seed=0, lac=2.0, gain=0.5):
    amp, freq, total, norm = 1.0, 1.0, 0.0, 0.0
    for _ in range(octaves):
        total += amp * value_noise(x * freq, y * freq, seed)
        norm += amp
        amp *= gain
        freq *= lac
    return total / norm


def periodic_fbm(x, y, period, octaves=4, seed=0):
    """Value noise whose lattice wraps every `period` cells, so textures tile seamlessly."""
    amp, freq, total, norm = 1.0, 1.0, 0.0, 0.0
    span = int(period)
    for _ in range(octaves):
        xi, yi = x * freq, y * freq

        def wrap(a, b):
            return _hash2(int(a) % span, int(b) % span, seed)

        def cell(a, b):
            af, bf = math.floor(a), math.floor(b)
            u, v = _smooth(a - af), _smooth(b - bf)
            x0, x1 = af % span, (af + 1) % span
            y0, y1 = bf % span, (bf + 1) % span
            tl, tr = wrap(x0, y0), wrap(x1, y0)
            bl, br = wrap(x0, y1), wrap(x1, y1)
            return (tl + (tr - tl) * u) + ((bl + (br - bl) * u) - (tl + (tr - tl) * u)) * v

        total += amp * cell(xi, yi)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


# --------------------------------------------------------------------------- mesh


class Mesh:
    """Triangle soup carrying POSITION, NORMAL, optional TEXCOORD_0, written as GLB."""

    def __init__(self, with_uv=False):
        self.p, self.n, self.i = [], [], []
        self.uv = [] if with_uv else None
        self._face_normals = []

    def vert(self, position, normal, uv=None):
        self.p.append(position)
        self.n.append(normal)
        if self.uv is not None:
            self.uv.append(uv if uv is not None else [0.0, 0.0])

    def flat_tri(self, a, b, c, uv_a=None, uv_b=None, uv_c=None):
        u = [b[k] - a[k] for k in range(3)]
        v = [c[k] - a[k] for k in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        length = math.sqrt(sum(t * t for t in n)) or 1.0
        n = [t / length for t in n]
        base = len(self.p)
        self.vert(a, n, uv_a)
        self.vert(b, n, uv_b)
        self.vert(c, n, uv_c)
        self.i.extend([base, base + 1, base + 2])

    def smooth_quad(self, a, b, c, d, na, nb, nc, nd, ua, ub, uc, ud):
        base = len(self.p)
        self.vert(a, na, ua)
        self.vert(b, nb, ub)
        self.vert(c, nc, uc)
        self.vert(d, nd, ud)
        self.i.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def save(self, name):
        if not self.p:
            return None
        data = bytearray()
        views = []
        accessors = []

        def add(values, flat_fn, component_type, wgsl_type, count):
            raw = flat_fn()
            offset = len(data)
            data.extend(raw)
            views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw)})
            acc = {"bufferView": len(views) - 1, "componentType": component_type,
                   "count": count, "type": wgsl_type}
            accessors.append(acc)
            return len(accessors) - 1

        def pack_floats(rows, channels):
            flat = [v for row in rows for v in row[:channels]]
            return struct.pack("<" + "f" * len(flat), *flat)

        pos_idx = add(self.p, lambda: pack_floats(self.p, 3), 5126, "VEC3", len(self.p))
        mn = [min(v[k] for v in self.p) for k in range(3)]
        mx = [max(v[k] for v in self.p) for k in range(3)]
        accessors[pos_idx]["min"] = mn
        accessors[pos_idx]["max"] = mx
        nrm_idx = add(self.n, lambda: pack_floats(self.n, 3), 5126, "VEC3", len(self.n))
        attributes = {"POSITION": pos_idx, "NORMAL": nrm_idx}
        if self.uv is not None:
            attributes["TEXCOORD_0"] = add(self.uv, lambda: pack_floats(self.uv, 2), 5126, "VEC2", len(self.uv))
        idx_idx = add(self.i, lambda: struct.pack("<" + "I" * len(self.i), *self.i), 5125, "SCALAR", len(self.i))

        doc = {
            "asset": {"version": "2.0", "generator": "MEngine Lumen Shoal original geometry"},
            "buffers": [{"byteLength": len(data)}],
            "bufferViews": views,
            "accessors": accessors,
            "meshes": [{"primitives": [{"attributes": attributes, "indices": idx_idx}]}],
            "nodes": [{"mesh": 0}],
            "scenes": [{"nodes": [0]}],
            "scene": 0,
        }
        text = json.dumps(doc, separators=(",", ":")).encode()
        text += b" " * ((-len(text)) % 4)
        data += b"\0" * ((-len(data)) % 4)
        path = MODELS / (name + ".glb")
        header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(data))
        json_chunk = struct.pack("<II", len(text), 0x4E4F534A) + text
        bin_chunk = struct.pack("<II", len(data), 0x004E4942) + data
        path.write_bytes(header + json_chunk + bin_chunk)
        return "Assets/Models/" + path.name


# --------------------------------------------------------------------------- terrain

ISLAND_RADIUS = 78.0
SHORE_HEIGHT = 0.0  # water plane sits at y = 0; land rises above it.


def island_height(x, z):
    d = math.hypot(x, z)
    # Broad dome falling to sea level at the rim, with a raised back ridge.
    rim = 1.0 - min(d / ISLAND_RADIUS, 1.0)
    dome = 15.5 * (rim ** 1.35)
    hills = 6.2 * fbm(x * 0.018, z * 0.018, 5, 21) * rim
    ridge = 4.0 * math.exp(-((d - 34.0) ** 2) / 260.0) * fbm(x * 0.02 + 9.0, z * 0.02 - 4.0, 4, 7)
    beach = -1.4 if d > ISLAND_RADIUS - 9.0 else 0.0  # a shallow shelf below the waterline
    h = dome + hills + ridge + beach - 2.5
    # A freshwater lagoon carved into the meadow near the front.
    lg = math.exp(-(((x - 8.0) ** 2 + (z - 30.0) ** 2) / 90.0))
    h -= 3.4 * lg
    return h


def analytic_normal(fn, x, z, e=0.6):
    dx = (fn(x + e, z) - fn(x - e, z)) / (2.0 * e)
    dz = (fn(x, z + e) - fn(x, z - e)) / (2.0 * e)
    length = math.sqrt(1.0 + dx * dx + dz * dz)
    return [-dx / length, 1.0 / length, -dz / length]


def build_island():
    mesh = Mesh(with_uv=True)
    n = 176
    span = ISLAND_RADIUS + 12.0
    grid = {}
    for j in range(n + 1):
        z = -span + 2 * span * j / n
        for i in range(n + 1):
            x = -span + 2 * span * i / n
            d = math.hypot(x, z)
            if d > span:
                grid[(i, j)] = None
                continue
            h = island_height(x, z)
            grid[(i, j)] = (x, h, z, analytic_normal(island_height, x, z),
                            [(x + span) / (2 * span), (z + span) / (2 * span)])
    for j in range(n):
        for i in range(n):
            corners = [grid[(i, j)], grid[(i + 1, j)], grid[(i + 1, j + 1)], grid[(i, j + 1)]]
            if any(c is None for c in corners):
                continue
            (ax, ay, az, an, au), (bx, by, bz, bn, bu), (cx, cy, cz, cn, cu), (dx, dy, dz, dn, du) = corners
            mesh.smooth_quad([ax, ay, az], [bx, by, bz], [cx, cy, cz], [dx, dy, dz],
                             an, bn, cn, dn, au, bu, cu, du)
    return mesh


def build_ocean():
    mesh = Mesh(with_uv=True)
    n = 200
    span = 520.0
    uv_span = span
    for j in range(n + 1):
        z = -span + 2 * span * j / n
        for i in range(n + 1):
            x = -span + 2 * span * i / n
            d = math.hypot(x, z)
            # A full plane: the island rises above it and the carved lagoon holds water,
            # so no interior hole (and no jagged boundary) is needed.
            h = 0.22 * math.sin(x * 0.05 + z * 0.04) + 0.13 * math.sin(x * 0.11 - z * 0.09)
            damp = min(d / 120.0, 1.0)
            mesh.vert([x, h * damp, z], [0.0, 1.0, 0.0],
                      [(x + uv_span) / (2 * uv_span), (z + uv_span) / (2 * uv_span)])
    mesh.i = ocean_indices(mesh.p, n, span)
    return mesh


def ocean_indices(points, n, span):
    # Map quantised positions back to grid slots; skipped interior cells become holes.
    slot = {}
    for idx, (x, y, z) in enumerate(points):
        i = int(round((x + span) / (2 * span) * n))
        j = int(round((z + span) / (2 * span) * n))
        slot[(i, j)] = idx
    indices = []
    for j in range(n):
        for i in range(n):
            quad = [slot.get((i, j)), slot.get((i + 1, j)), slot.get((i + 1, j + 1)), slot.get((i, j + 1))]
            if any(v is None for v in quad):
                continue
            a, b, c, d = quad
            indices.extend([a, b, c, a, c, d])
    return indices


def build_rocks():
    """Faceted boulders: deliberately low tessellation with per-face flat normals."""
    rocks = []
    layouts = [(-30.0, -20.0, 3.4), (26.0, -12.0, 2.2), (41.0, 8.0, 4.6),
               (-16.0, 40.0, 1.8), (-46.0, 12.0, 2.8), (12.0, -44.0, 3.0)]
    for seed, (cx, cz, scale) in enumerate(layouts):
        mesh = Mesh(with_uv=True)
        segments, rings = 6, 4  # coarse -> reads as low-poly even before style switching
        verts = []
        for j in range(rings + 1):
            phi = math.pi * j / rings
            for k in range(segments + 1):
                theta = TAU * k / segments
                wob = 0.72 + 0.5 * value_noise(k * 1.7 + seed, j * 2.3 - seed, 5)
                vx = math.sin(phi) * math.cos(theta)
                vy = math.cos(phi)
                vz = math.sin(phi) * math.sin(theta)
                verts.append((cx + vx * scale * wob, island_height(cx, cz) + vy * scale * wob * 0.8 + scale * 0.35,
                              cz + vz * scale * wob, (vx, vy, vz), [k / segments, j / rings]))
        for j in range(rings):
            for k in range(segments):
                a = verts[j * (segments + 1) + k]
                b = verts[j * (segments + 1) + k + 1]
                c = verts[(j + 1) * (segments + 1) + k + 1]
                d = verts[(j + 1) * (segments + 1) + k]
                mesh.flat_tri(list(a[0:3]), list(b[0:3]), list(c[0:3]), a[4], b[4], c[4])
                mesh.flat_tri(list(a[0:3]), list(c[0:3]), list(d[0:3]), a[4], c[4], d[4])
        rocks.append(mesh)
    return rocks


def build_sky_dome():
    """Inverted UV sphere carrying the volumetric cloud shader; normals point inward."""
    mesh = Mesh(with_uv=True)
    radius = 900.0
    segments, rings = 48, 24
    grid = []
    for j in range(rings + 1):
        phi = math.pi * j / rings
        row = []
        for k in range(segments + 1):
            theta = TAU * k / segments
            vx = math.sin(phi) * math.cos(theta)
            vy = math.cos(phi)
            vz = math.sin(phi) * math.sin(theta)
            idx = len(mesh.p)
            mesh.vert([vx * radius, vy * radius, vz * radius], [-vx, -vy, -vz], [k / segments, j / rings])
            row.append(idx)
        grid.append(row)
    for j in range(rings):
        for k in range(segments):
            a = grid[j][k]
            b = grid[j][k + 1]
            c = grid[j + 1][k + 1]
            d = grid[j + 1][k]
            mesh.i.extend([a, c, b, a, d, c])
    return mesh


# --------------------------------------------------------------------------- textures


def _tiling_fbm(u, v, cells, octaves=4, seed=0):
    """Periodic fbm sampled on a [0,1)x[0,1) lattice wrapping every `cells` units."""
    total, amp, freq, norm = 0.0, 1.0, 1.0, 0.0
    for _ in range(octaves):
        total += amp * value_noise(u * cells * freq, v * cells * freq, seed)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def write_normal_map(path, size=512, cells=16.0, strength=2.4):
    """Tangent-space normal map from a periodic height field via central differences."""
    heights = [[0.0] * size for _ in range(size)]
    for y in range(size):
        for x in range(size):
            heights[y][x] = 0.65 * _tiling_fbm(x / size, y / size, cells, 4, 3) + \
                            0.35 * _tiling_fbm(x / size + 0.5, y / size - 0.3, cells * 2.4, 3, 11)
    px = bytearray()
    for y in range(size):
        for x in range(size):
            xl, xr = heights[y][(x - 1) % size], heights[y][(x + 1) % size]
            yu, yd = heights[(y - 1) % size][x], heights[(y + 1) % size][x]
            dhdx = (xr - xl) * strength
            dhdz = (yd - yu) * strength
            nx, ny, nz = -dhdx, -dhdz, 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            px.extend((int((nx * inv * 0.5 + 0.5) * 255),
                       int((ny * inv * 0.5 + 0.5) * 255),
                       int((nz * inv * 0.5 + 0.5) * 255)))
    Image.frombytes("RGB", (size, size), bytes(px)).save(path)


def write_env_sky(path, cloud_amount=0.0, width=1024, height=512):
    """Equirectangular golden-hour sky for image-based lighting and reflections.

    cloud_amount in [0,1] bakes a volumetric-style cumulus layer into the map using the
    same domain-warped fbm density you would ray-march at runtime. Two variants (clear and
    cloud-rich) are generated so the sample can swap the live sky + its reflections at the
    'volumetric clouds' stage."""
    zenith = [0.06, 0.26, 0.66]
    horizon = [1.0, 0.55, 0.28]
    ground = [0.06, 0.07, 0.10]
    sun_dir = [-0.90, 0.16, 0.40]
    sl = math.sqrt(sum(t * t for t in sun_dir))
    sun_dir = [t / sl for t in sun_dir]
    sun_col = [1.0, 0.66, 0.40]

    # Puffy cumulus density via domain-warped periodic fbm (ray-march-style shaping, offline).
    cw, chh = 512, 256
    density = Image.new("L", (cw, chh))
    dpx = density.load()
    for j in range(chh):
        for i in range(cw):
            u, v = i / cw, j / chh
            wx = u + 0.15 * _tiling_fbm(u, v, 6.0, 4, 101)
            wy = v + 0.15 * _tiling_fbm(u + 0.3, v - 0.2, 6.0, 4, 202)
            base = _tiling_fbm(wx, wy, 9.0, 5, 7)
            d = max(0.0, min(1.0, (base - 0.5) * 2.6))
            dpx[i, j] = int(d * 255)
    density = density.resize((width, height), Image.BILINEAR).load()

    px = bytearray()
    for row in range(height):
        lat = math.pi / 2.0 - math.pi * row / (height - 1)  # +pi/2 (zenith) .. -pi/2
        sy, cy = math.sin(lat), math.cos(lat)
        for col in range(width):
            lon = -math.pi + 2 * math.pi * col / width
            dirv = [cy * math.cos(lon), sy, cy * math.sin(lon)]
            cosang = max(-1.0, min(1.0, sum(dirv[k] * sun_dir[k] for k in range(3))))
            if sy >= 0:
                mixt = sy ** 0.5
                rgb = [horizon[k] + (zenith[k] - horizon[k]) * mixt for k in range(3)]
            else:
                mixt = sy + 1.0
                rgb = [ground[k] + (horizon[k] - ground[k]) * mixt for k in range(3)]
            ang = math.acos(cosang)
            glow = 0.9 * math.exp(-ang * 3.0)
            disc = 8.0 if cosang > 0.9992 else 0.0
            rgb = [rgb[k] + sun_col[k] * (glow + disc) for k in range(3)]
            if cloud_amount > 0.0:
                band = max(0.0, min(1.0, (sy + 0.05) * 1.4)) * max(0.0, min(1.0, (0.9 - sy) * 2.0))
                cloud = max(0.0, min(1.0, (density[col, row] / 255.0 - (0.62 - cloud_amount * 0.35)) * 3.2)) * band
                lit = max(0.0, min(1.0, cosang * 0.6 + 0.55))
                base_col = [0.55 * lit + 0.35, 0.6 * lit + 0.36, 0.72 * lit + 0.34]
                warm = [base_col[k] + sun_col[k] * glow * 0.5 for k in range(3)]
                rgb = [rgb[k] * (1 - cloud) + warm[k] * cloud for k in range(3)]
            for k in range(3):
                encoded = max(0.0, min(1.0, rgb[k])) ** (1 / 2.2)
                px.append(int(encoded * 255))
    Image.frombytes("RGB", (width, height), bytes(px)).save(path)


# --------------------------------------------------------------------------- scene


class SceneBuilder:
    def __init__(self):
        self.entities = []

    def entity(self, name, components=None, parent=None):
        ent = {"entity": len(self.entities) + 1, "name": name, "parent": parent,
               "siblingIndex": len(self.entities), "active": True, "components": components or {}}
        self.entities.append(ent)
        return ent["entity"]

    def transform(self, position=(0, 0, 0), scale=(1, 1, 1), rotation=(0, 0, 0, 1)):
        return {"position": list(position), "scale": list(scale), "rotation": list(rotation)}

    def mesh(self, name, mesh_path, material, parent=None, position=(0, 0, 0), scale=(1, 1, 1),
             rotation=(0, 0, 0, 1), cast_shadows=True, receive_shadows=True):
        return self.entity(name, {
            "Transform": self.transform(position, scale, rotation),
            "MeshRenderer": {"mesh": mesh_path, "material": material,
                             "cast_shadows": cast_shadows, "receive_shadows": receive_shadows},
        }, parent)

    def params(self, entity_id, names, values):
        self.entities[entity_id - 1]["components"]["MaterialPropertyBlock"] = {
            "custom_parameter_names": names, "custom_parameter_values": values,
        }


def euler_rotation(yaw_deg, pitch_deg=0.0, roll_deg=0.0):
    """Compose a quaternion [x,y,z,w] for an intrinsic Y * X * Z rotation (degrees)."""
    def mul(a, b):
        aw, ax, ay, az = a
        bw, bx, by, bz = b
        return [aw * bw - ax * bx - ay * by - az * bz,
                aw * bx + ax * bw + ay * bz - az * by,
                aw * by - ax * bz + ay * bw + az * bx,
                aw * bz + ax * by - ay * bx + az * bw]

    def axis(w, x, y, z):
        return [w, x, y, z]

    cy, sy = math.cos(math.radians(yaw_deg) / 2), math.sin(math.radians(yaw_deg) / 2)
    cp, sp = math.cos(math.radians(pitch_deg) / 2), math.sin(math.radians(pitch_deg) / 2)
    cr, sr = math.cos(math.radians(roll_deg) / 2), math.sin(math.radians(roll_deg) / 2)
    qy = axis(cy, 0.0, sy, 0.0)
    qx = axis(cp, sp, 0.0, 0.0)
    qz = axis(cr, 0.0, 0.0, sr)
    w, x, y, z = mul(qy, mul(qx, qz))
    return [x, y, z, w]


def look_at_quaternion(eye, target):
    """Return a quaternion (x,y,z,w) so that a -Z-forward camera at eye points at target."""
    ex, ey, ez = eye
    tx, ty, tz = target
    dx, dy, dz = tx - ex, ty - ey, tz - ez
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    dx, dy, dz = dx / length, dy / length, dz / length
    yaw = math.degrees(math.atan2(-dx, -dz))
    horizontal = math.sqrt(dx * dx + dz * dz) or 1e-6
    pitch = math.degrees(math.atan2(dy, horizontal))
    return euler_rotation(yaw, -pitch)


def main():
    for d in [MODELS, TEXTURES, SCENES, SCRIPTS, FONTS]:
        d.mkdir(parents=True, exist_ok=True)

    # Assets reused from sibling samples (all MIT/CC0 within the repo).
    font_src = ROOT / "samples/frostbound-realms/Assets/Fonts/NotoSansSC.ttf"
    font_dst = FONTS / "NotoSansSC.ttf"
    if font_src.exists() and not font_dst.exists():
        shutil.copy2(font_src, font_dst)
    shutil.copy2(ROOT / "samples/types/engine.d.ts", SCRIPTS / "mengine.d.ts")

    # ---- meshes
    island_path = build_island().save("island")
    ocean_path = build_ocean().save("ocean")
    rock_paths = [m.save(f"rock-{i}") for i, m in enumerate(build_rocks())]

    # ---- procedural textures
    write_normal_map(TEXTURES / "island-normal.png", 512, 16.0, 2.6)
    write_env_sky(TEXTURES / "sky-clear.png", cloud_amount=0.0)     # clear golden-hour sky
    write_env_sky(TEXTURES / "sky-clouds.png", cloud_amount=0.7)    # + volumetric-style cumulus

    # ---- scene assembly
    s = SceneBuilder()

    camera_pos = [120.0, 46.0, 150.0]
    camera_target = [0.0, 10.0, 0.0]
    cam_id = s.entity("Main Camera", {
        "Transform": s.transform(camera_pos, rotation=look_at_quaternion(camera_pos, camera_target)),
        "Camera3D": {"fov_y_degrees": 42.0, "near": 0.4, "far": 2000.0, "primary": True,
                     "clear_flags": "skybox", "background_color": [0.1, 0.12, 0.16, 1.0]},
        "AudioListener": {"primary": True},
    })

    sun_rot = look_at_quaternion([0, 0, 0], [-0.90, -0.16, -0.40])  # light travels toward the sun direction
    s.entity("Sun Light", {
        "Transform": s.transform([0, 40, 0], rotation=sun_rot),
        "DirectionalLight": {"color": [1.0, 0.72, 0.46, 1.0], "intensity": 3.4,
                             "cast_shadows": True, "shadow_strength": 0.82,
                             "shadow_distance": 260.0, "shadow_bias": 0.0016, "shadow_normal_bias": 0.02},
    })

    s.entity("Environment", {
        "EnvironmentLight": {
            "sky_color": srgb_to_linear("1C4E80"),
            "equator_color": srgb_to_linear("F2915A"),
            "ground_color": srgb_to_linear("0B0E12"),
            "diffuse_intensity": 0.7, "specular_intensity": 1.0,
            "texture": "Assets/Textures/sky-clear.png", "background_enabled": True,
            "background_intensity": 1.0, "exposure": 0.0, "tone_mapping": True,
        }
    })

    # Water lagoon + surrounding sea (single custom-shaded ocean grid).
    water_id = s.mesh("Water", ocean_path, "Assets/Materials/Water.mmat",
                      cast_shadows=False, receive_shadows=False)

    # Island (custom-shaded, tangent normal mapping + stylization).
    island_id = s.mesh("Island", island_path, "Assets/Materials/Ground.mmat", receive_shadows=True)

    # Faceted boulders reuse the ground shader with rock-appropriate parameters.
    rock_ids = [s.mesh(f"Rock {i}", rp, "Assets/Materials/Rock.mmat") for i, rp in enumerate(rock_paths)]

    # Drifting pollen / sea-mist particles for cinematic atmosphere (revealed at the grade stage).
    s.entity("Pollen", {
        "Transform": s.transform([0, 6, 0]),
        "ParticleEmitter3D": {"playing": True, "looping": True, "max_particles": 900,
                              "rate_over_time": 60, "lifetime_min": 6, "lifetime_max": 12,
                              "size_start": 0.14, "size_end": 0.02,
                              "color_start": [1.0, 0.86, 0.55, 0.9], "color_end": [1.0, 0.6, 0.3, 0.0],
                              "gravity": [0.05, 0.12, 0.0], "shape": "box", "shape_size": [150, 24, 150],
                              "spread_degrees": 12, "blend_mode": "additive", "billboard": True, "seed": 7},
    })

    # ----- authored defaults so the shader looks correct before Main.ts animates it.
    # MaterialPropertyBlock custom_parameter_values is a float4_array: every entry is 4 numbers.
    for eid in [water_id, island_id] + rock_ids:
        s.params(eid, ["clock", "reveal", "style"], [[0, 0, 0, 0], [0, 0, 0, 0], [0, 0, 0, 0]])

    # ----- UI overlay: bottom-left code panel + subtitle, top-left badge, style readout.
    # The engine measures RectTransform.anchored_position from the SCREEN CENTRE, so every
    # element uses anchor (0.5, 0.5) and an offset computed from a 1920x1080 design space
    # whose y axis points up (matching Pelican Road Rage's convention).
    canvas_id = s.entity("Overlay Canvas", {
        "Canvas": {"render_mode": "ScreenSpaceOverlay", "pixel_perfect": False, "sorting_order": 100},
        "CanvasScaler": {"ui_scale_mode": "ScaleWithScreenSize", "reference_resolution": [1920, 1080],
                         "screen_match_mode": "MatchWidthOrHeight", "match_width_or_height": 0.5},
        "GraphicRaycaster": {"enabled": False},
    })

    def place(name, cx, cy, w, h, pivot=(0.5, 0.5), parent=canvas_id):
        e = s.entity(name, {
            "RectTransform": {"anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                              "pivot": list(pivot), "anchored_position": [cx - 960, cy - 540],
                              "size_delta": [w, h]},
        }, parent)
        return e

    def image(name, cx, cy, w, h, color, parent=canvas_id):
        e = place(name, cx, cy, w, h, parent=parent)
        s.entities[e - 1]["components"]["Image"] = {"sprite": "white", "color": color, "raycast_target": False}
        return e

    def text(name, cx, cy, w, h, content, size, color=(0.94, 0.96, 0.98, 1.0), align="Left",
             valign="Middle", parent=canvas_id):
        e = place(name, cx, cy, w, h, parent=parent)
        s.entities[e - 1]["components"]["Text"] = {
            "text": content, "font": "Assets/Fonts/NotoSansSC.ttf", "font_size": size,
            "color": list(color), "alignment": align, "vertical_align": valign,
            "horizontal_overflow": "Overflow", "vertical_overflow": "Overflow",
            "line_spacing": 1.15, "raycast_target": False,
        }
        return e

    deep_panel = [0.03, 0.05, 0.08, 0.82]
    accent = [0.45, 0.85, 0.95, 1.0]
    gold = [1.0, 0.78, 0.36, 1.0]

    # Bottom-left narrative panel.
    image("panel-bg", 440, 250, 800, 400, deep_panel)
    image("panel-accent", 52, 424, 6, 72, accent)
    text("panel-badge", 440, 424, 760, 56, "STEP 1 / 6  ·  建立 3D 场景 / ESTABLISH THE 3D STAGE", 28,
         gold, align="Left", valign="Middle")
    text("panel-code", 436, 250, 760, 250, "// placeholder", 21,
         [0.62, 0.9, 0.76, 1.0], align="Left", valign="Top")
    # Bilingual subtitles, centred near the bottom.
    text("subtitle-cn", 960, 150, 1500, 66, "", 34, [1, 1, 1, 0.96], align="Center")
    text("subtitle-en", 960, 92, 1500, 44, "", 23, [0.82, 0.88, 0.94, 0.9], align="Center")

    # Title + style readout along the top; controls hint bottom-right.
    text("title", 300, 1030, 560, 52, "LUMEN SHOAL  ·  流光泻湖", 38, [1, 1, 1, 0.96], align="Left")
    text("mode", 1720, 1030, 360, 40, "REALISTIC / 写实", 26, accent, align="Right")
    text("hint", 1520, 40, 720, 36, "SPACE 下一步 · Next    1/2/3 风格 · Style    TAB 自动 · Auto    R 重置 · Reset",
         20, [0.75, 0.8, 0.86, 0.85], align="Right")

    # Progress bar across the very bottom (left-anchored fill).
    image("progress-rail", 960, 6, 1920, 8, [0.2, 0.3, 0.34, 0.9])
    e = place("progress-fill", 0, 6, 480, 8, pivot=(0, 0.5))
    s.entities[e - 1]["components"]["Image"] = {"sprite": "white", "color": accent, "raycast_target": False}

    (OUT / "project.json").write_text(json.dumps({
        "name": "Lumen Shoal", "version": 1, "language": "typescript",
        "mainScene": "Assets/Scenes/Main.mscene",
        "buildScenes": ["Assets/Scenes/Main.mscene"],
        "startupScript": "Assets/Scripts/Main.ts", "assetMode": "all",
    }, indent=2) + "\n")

    (SCENES / "Main.mscene").write_text(json.dumps({
        "version": 1, "name": "Lumen Shoal",
        "world": {"entities": s.entities, "frame": 0, "sim_frame": 0,
                  "clear_color": [0.05, 0.06, 0.09, 1.0], "selected": cam_id},
    }, indent=2) + "\n")

    print(f"Built {len(s.entities)} entities; meshes: island, ocean, {len(rock_paths)} rocks; "
          "textures: island-normal.png, sky-clear.png, sky-clouds.png")


if __name__ == "__main__":
    main()
