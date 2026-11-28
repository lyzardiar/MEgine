"""Pelican Island Ride / 鹈鹕环岛骑行 — deterministic 3D sample generator.

Generates:
  - Procedural GLB meshes: organic tropical island terrain, closed-loop coastal bike path,
    curbs, guardrails, palm groves, surf cottages, striped lighthouse, wooden pier,
    sailboats, coastal boulders, circling seagulls, a vintage beach cruiser bicycle
    (frame, spoked wheels, rotating crankset & woven fish basket), and a continuous-surface
    pelican rider (lofted body/neck/head, beak & pouch, sun hat, flowing scarf, wings, feet).
  - Procedural textures: seamless tangent-space terrain normal map + equirectangular
    tropical daytime and golden-hour sky environment maps for IBL reflections.
  - Synthesized audio: looping ocean waves breeze and a crisp bicycle brass bell.
  - Standard MEgine project manifest, Main.mscene, script typings, CJK font, and .meta files.

Run from the repository root:
    python scripts/create-pelican-island-ride.py
"""
import json
import math
import random
import shutil
import struct
import uuid
import wave
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "samples/pelican-island-ride"
MODELS = OUT / "Assets/Models"
TEXTURES = OUT / "Assets/Textures"
SCENES = OUT / "Assets/Scenes"
SCRIPTS = OUT / "Assets/Scripts"
FONTS = OUT / "Assets/Fonts"
AUDIO = OUT / "Assets/Audio"
TAU = math.tau
META_NAMESPACE = uuid.UUID("7f3b90c2-5b88-4e64-9a4a-8d7c5124b6e1")

random.seed(42)


# --------------------------------------------------------------------------- colors & math


def srgb_to_linear(hex_str):
    rgb = [int(hex_str[i:i + 2], 16) / 255.0 for i in (0, 2, 4)]
    return [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in rgb] + [1.0]


PALETTE = {
    "road": "D46A52",        # terracotta / coastal bike path
    "cream": "F7EBD2",
    "white": "F5F1E6",
    "sand": "E7CF9F",
    "teal": "1E9B9D",        # vintage cruiser frame
    "mint": "62C6B8",
    "coral": "E8634B",
    "yellow": "F6C445",
    "orange": "F09336",
    "beak": "F2A640",
    "pouch": "E68232",
    "red": "D9483B",
    "navy": "1D3549",
    "black": "17222B",
    "metal": "B8C7CC",
    "brass": "E6B84C",
    "rubber": "1B242B",
    "leather": "7E4928",
    "wicker": "C89B5B",
    "trunk": "8C6344",
    "wood": "9E7149",
    "leaf": "2B8059",
    "leafLight": "59A86A",
    "rock": "8F8578",
    "window": "3B6275",
    "beacon": "FFE89E",
    "silver": "C7D9E2",
}


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def smoothstep(edge0, edge1, x):
    t = clamp((x - edge0) / (edge1 - edge0), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def quat_yxz(yaw, pitch=0.0, roll=0.0):
    """Quaternion [x, y, z, w] for Y(yaw) * X(pitch) * Z(roll), radians.
    Matches Main.ts quaternion() so -Z forward aligns cleanly with yaw/pitch."""
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
    length = math.sqrt(dx * dx + dy * dy + dz * dz) or 1.0
    nx, ny, nz = dx / length, dy / length, dz / length
    yaw = math.atan2(-nx, -nz)
    horiz = math.hypot(nx, nz) or 1e-6
    pitch = math.atan2(ny, horiz)
    return quat_yxz(yaw, pitch, 0.0)


# --------------------------------------------------------------------------- noise


def _hash2(x, y, seed):
    n = (x * 374761393 + y * 668265263 + seed * 2246822519) & 0xFFFFFFFF
    n = (n ^ (n >> 13)) * 1274126177 & 0xFFFFFFFF
    n = (n ^ (n >> 16)) & 0xFFFFFFFF
    return n / 4294967295.0


def value_noise(x, y, seed=0):
    xi, yi = int(math.floor(x)), int(math.floor(y))
    xf, yf = x - xi, y - yi
    u = xf * xf * (3.0 - 2.0 * xf)
    v = yf * yf * (3.0 - 2.0 * yf)
    tl, tr = _hash2(xi, yi, seed), _hash2(xi + 1, yi, seed)
    bl, br = _hash2(xi, yi + 1, seed), _hash2(xi + 1, yi + 1, seed)
    top = tl + (tr - tl) * u
    bot = bl + (br - bl) * u
    return top + (bot - top) * v


def fbm(x, y, octaves=4, seed=0):
    amp, freq, total, norm = 1.0, 1.0, 0.0, 0.0
    for _ in range(octaves):
        total += amp * value_noise(x * freq, y * freq, seed)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


def periodic_fbm(u, v, period, octaves=4, seed=0):
    amp, freq, total, norm = 1.0, 1.0, 0.0, 0.0
    for _ in range(octaves):
        span = int(period * freq)
        ax, ay = u * span, v * span
        x0, y0 = int(math.floor(ax)), int(math.floor(ay))
        xf, yf = ax - x0, ay - y0
        sx = xf * xf * (3.0 - 2.0 * xf)
        sy = yf * yf * (3.0 - 2.0 * yf)
        a0, a1 = x0 % span, (x0 + 1) % span
        b0, b1 = y0 % span, (y0 + 1) % span
        tl, tr = _hash2(a0, b0, seed), _hash2(a1, b0, seed)
        bl, br = _hash2(a0, b1, seed), _hash2(a1, b1, seed)
        top = tl + (tr - tl) * sx
        bot = bl + (br - bl) * sx
        total += amp * (top + (bot - top) * sy)
        norm += amp
        amp *= 0.5
        freq *= 2.0
    return total / norm


# --------------------------------------------------------------------------- mesh builder


class Mesh:
    """Procedural triangle mesh exporter to glTF 2.0 binary (.glb)."""

    def __init__(self, with_uv=False):
        self.p, self.n, self.i = [], [], []
        self.uv = [] if with_uv else None

    def vert(self, pos, normal, uv=None):
        self.p.append(list(pos))
        self.n.append(list(normal))
        if self.uv is not None:
            self.uv.append(list(uv) if uv is not None else [0.0, 0.0])

    def tri(self, a, b, c, ua=None, ub=None, uc=None):
        u = [b[k] - a[k] for k in range(3)]
        v = [c[k] - a[k] for k in range(3)]
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
        length = math.sqrt(sum(t * t for t in n))
        if length < 1e-8:
            return
        n = [t / length for t in n]
        base = len(self.p)
        self.vert(a, n, ua)
        self.vert(b, n, ub)
        self.vert(c, n, uc)
        self.i.extend([base, base + 1, base + 2])

    def quad(self, a, b, c, d, ua=None, ub=None, uc=None, ud=None):
        self.tri(a, b, c, ua, ub, uc)
        self.tri(a, c, d, ua, uc, ud)

    def smooth_quad(self, a, b, c, d, na, nb, nc, nd, ua=None, ub=None, uc=None, ud=None):
        base = len(self.p)
        self.vert(a, na, ua)
        self.vert(b, nb, ub)
        self.vert(c, nc, uc)
        self.vert(d, nd, ud)
        self.i.extend([base, base + 1, base + 2, base, base + 2, base + 3])

    def box(self, center, size, yaw=0.0):
        co, si = math.cos(yaw), math.sin(yaw)
        verts = []
        for x, y, z in [
            (-1, -1, -1), (1, -1, -1), (1, 1, -1), (-1, 1, -1),
            (-1, -1, 1), (1, -1, 1), (1, 1, 1), (-1, 1, 1),
        ]:
            lx, ly, lz = x * size[0] * 0.5, y * size[1] * 0.5, z * size[2] * 0.5
            verts.append([center[0] + lx * co + lz * si, center[1] + ly, center[2] - lx * si + lz * co])
        for a, b, c, d in [(0, 3, 2, 1), (4, 5, 6, 7), (0, 4, 7, 3), (1, 2, 6, 5), (3, 7, 6, 2), (0, 1, 5, 4)]:
            self.quad(verts[a], verts[b], verts[c], verts[d])

    def ellipsoid(self, center, radii, segments=18, rings=12):
        base = len(self.p)
        for j in range(rings + 1):
            phi = math.pi * j / rings
            for k in range(segments + 1):
                theta = TAU * k / segments
                vx = math.sin(phi) * math.cos(theta)
                vy = math.cos(phi)
                vz = math.sin(phi) * math.sin(theta)
                self.vert(
                    [center[0] + radii[0] * vx, center[1] + radii[1] * vy, center[2] + radii[2] * vz],
                    self._norm([vx / max(radii[0], 1e-4), vy / max(radii[1], 1e-4), vz / max(radii[2], 1e-4)]),
                    [k / segments, j / rings],
                )
        for j in range(rings):
            for k in range(segments):
                a = base + j * (segments + 1) + k
                b = a + segments + 1
                self.i.extend([a, a + 1, b + 1, a, b + 1, b])

    def tube(self, a, b, r1, r2=None, segments=12, cap=True):
        r2 = r1 if r2 is None else r2
        axis = [b[k] - a[k] for k in range(3)]
        axis_len = math.sqrt(sum(t * t for t in axis))
        if axis_len < 1e-6:
            return
        axis = [t / axis_len for t in axis]
        v = [axis[2], 0.0, -axis[0]] if abs(axis[1]) < 0.9 else [1.0, 0.0, 0.0]
        v = self._norm(v)
        w = [axis[1] * v[2] - axis[2] * v[1], axis[2] * v[0] - axis[0] * v[2], axis[0] * v[1] - axis[1] * v[0]]

        def ring(pt, rad, k):
            ang = TAU * k / segments
            co, si = math.cos(ang), math.sin(ang)
            return [pt[idx] + rad * (v[idx] * co + w[idx] * si) for idx in range(3)]

        base = len(self.p)
        for pt, rad in [(a, r1), (b, r2)]:
            for k in range(segments + 1):
                ang = TAU * k / segments
                co, si = math.cos(ang), math.sin(ang)
                nrm = self._norm([v[idx] * co + w[idx] * si + axis[idx] * (r1 - r2) / axis_len for idx in range(3)])
                self.vert(ring(pt, rad, k), nrm, [k / segments, 0.0 if pt is a else 1.0])
        for k in range(segments):
            x = base + k
            y = x + segments + 1
            self.i.extend([x, x + 1, y + 1, x, y + 1, y])
            if cap:
                if r1 > 1e-5:
                    self.tri(a, ring(a, r1, k + 1), ring(a, r1, k))
                if r2 > 1e-5:
                    self.tri(b, ring(b, r2, k), ring(b, r2, k + 1))

    def torus_x(self, center, major_r, minor_r, segments=32, sides=10):
        """Torus whose axle runs along X (ideal for bicycle wheels & chainring)."""
        base = len(self.p)
        for j in range(segments + 1):
            a = TAU * j / segments
            ca, sa = math.cos(a), math.sin(a)
            for k in range(sides + 1):
                b = TAU * k / sides
                cb, sb = math.cos(b), math.sin(b)
                nrm = [sb, ca * cb, sa * cb]
                self.vert(
                    [center[0] + minor_r * nrm[0], center[1] + major_r * ca + minor_r * nrm[1], center[2] + major_r * sa + minor_r * nrm[2]],
                    nrm,
                    [j / segments, k / sides],
                )
        for j in range(segments):
            for k in range(sides):
                a = base + j * (sides + 1) + k
                b = a + sides + 1
                self.i.extend([a, b, a + 1, a + 1, b, b + 1])

    def loft(self, sections, steps=8, sides=28, x_offset=0.0):
        """Smooth Catmull-Rom lofted surface along a spine in the YZ plane.
        Each section is (y, z, half_width_x, half_depth_yz)."""
        points = []
        for i in range(len(sections) - 1):
            a = sections[max(0, i - 1)]
            b = sections[i]
            c = sections[i + 1]
            d = sections[min(len(sections) - 1, i + 2)]
            for j in range(steps):
                t = j / steps
                t2, t3 = t * t, t * t * t
                points.append([
                    0.5 * (
                        (2 * b[k])
                        + (-a[k] + c[k]) * t
                        + (2 * a[k] - 5 * b[k] + 4 * c[k] - d[k]) * t2
                        + (-a[k] + 3 * b[k] - 3 * c[k] + d[k]) * t3
                    )
                    for k in range(4)
                ])
        points.append(list(sections[-1]))
        base = len(self.p)
        for i, (y, z, w, h) in enumerate(points):
            prev = points[max(0, i - 1)]
            after = points[min(len(points) - 1, i + 1)]
            dy, dz = after[0] - prev[0], after[1] - prev[1]
            norm = math.hypot(dy, dz) or 1.0
            ny, nz = -dz / norm, dy / norm
            wx, hy = max(0.002, w), max(0.002, h)
            for k in range(sides + 1):
                a = TAU * k / sides
                self.vert(
                    [x_offset + wx * math.cos(a), y + ny * hy * math.sin(a), z + nz * hy * math.sin(a)],
                    [0.0, 0.0, 0.0],
                    [k / sides, i / max(1, len(points) - 1)],
                )
        first = len(self.i)
        for j in range(len(points) - 1):
            for k in range(sides):
                a = base + j * (sides + 1) + k
                b = a + sides + 1
                self.i.extend([a, b, a + 1, a + 1, b, b + 1])
        for j in range(first, len(self.i), 3):
            ids = self.i[j:j + 3]
            pa, pb, pc = self.p[ids[0]], self.p[ids[1]], self.p[ids[2]]
            u = [pb[k] - pa[k] for k in range(3)]
            v = [pc[k] - pa[k] for k in range(3)]
            fn = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]
            for idx in ids:
                for k in range(3):
                    self.n[idx][k] += fn[k]
        for j in range(len(points)):
            a = base + j * (sides + 1)
            b = a + sides
            blended = [self.n[a][k] + self.n[b][k] for k in range(3)]
            self.n[a] = blended[:]
            self.n[b] = blended[:]
        for i in range(base, len(self.n)):
            self.n[i] = self._norm(self.n[i])

    def merge(self, other, offset=(0.0, 0.0, 0.0), scale=(1.0, 1.0, 1.0)):
        base = len(self.p)
        flip = (scale[0] * scale[1] * scale[2]) < 0
        for idx in range(len(other.p)):
            p = other.p[idx]
            n = other.n[idx]
            self.vert(
                [p[0] * scale[0] + offset[0], p[1] * scale[1] + offset[1], p[2] * scale[2] + offset[2]],
                self._norm([n[0] / scale[0], n[1] / scale[1], n[2] / scale[2]]),
                other.uv[idx] if (self.uv is not None and other.uv is not None) else None,
            )
        for j in range(0, len(other.i), 3):
            a, b, c = base + other.i[j], base + other.i[j + 1], base + other.i[j + 2]
            self.i.extend([a, c, b] if flip else [a, b, c])

    @staticmethod
    def _norm(v):
        length = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
        if length < 1e-8:
            return [0.0, 1.0, 0.0]
        return [v[0] / length, v[1] / length, v[2] / length]

    def save(self, name):
        if not self.p:
            return None
        data = bytearray()
        views = []
        accessors = []

        def add(raw, ctype, kind, count):
            offset = len(data)
            data.extend(raw)
            views.append({"buffer": 0, "byteOffset": offset, "byteLength": len(raw)})
            accessors.append({"bufferView": len(views) - 1, "componentType": ctype, "count": count, "type": kind})
            return len(accessors) - 1

        def pack_floats(rows, channels):
            flat = [v for row in rows for v in row[:channels]]
            return struct.pack("<" + "f" * len(flat), *flat)

        pos_idx = add(pack_floats(self.p, 3), 5126, "VEC3", len(self.p))
        accessors[pos_idx]["min"] = [min(v[k] for v in self.p) for k in range(3)]
        accessors[pos_idx]["max"] = [max(v[k] for v in self.p) for k in range(3)]
        nrm_idx = add(pack_floats(self.n, 3), 5126, "VEC3", len(self.n))
        attrs = {"POSITION": pos_idx, "NORMAL": nrm_idx}
        if self.uv is not None:
            attrs["TEXCOORD_0"] = add(pack_floats(self.uv, 2), 5126, "VEC2", len(self.uv))
        idx_idx = add(struct.pack("<" + "I" * len(self.i), *self.i), 5125, "SCALAR", len(self.i))

        doc = {
            "asset": {"version": "2.0", "generator": "MEngine Pelican Island Ride"},
            "buffers": [{"byteLength": len(data)}],
            "bufferViews": views,
            "accessors": accessors,
            "meshes": [{"primitives": [{"attributes": attrs, "indices": idx_idx}]}],
            "nodes": [{"mesh": 0}],
            "scenes": [{"nodes": [0]}],
            "scene": 0,
        }
        text = json.dumps(doc, separators=(",", ":")).encode()
        text += b" " * ((-len(text)) % 4)
        data += b"\0" * ((-len(data)) % 4)
        path = MODELS / f"{name}.glb"
        header = struct.pack("<III", 0x46546C67, 2, 12 + 8 + len(text) + 8 + len(data))
        json_chunk = struct.pack("<II", len(text), 0x4E4F534A) + text
        bin_chunk = struct.pack("<II", len(data), 0x004E4942) + data
        path.write_bytes(header + json_chunk + bin_chunk)
        return "Assets/Models/" + path.name


# --------------------------------------------------------------------------- island & loop mathematics
# Keep shore_radius, road_radius, and road_height IDENTICAL to Main.ts and Ocean.mshader!


def shore_radius(ang):
    return (
        69.0
        + 8.5 * math.sin(2.0 * ang + 0.35)
        + 5.0 * math.cos(3.0 * ang - 0.55)
        + 2.5 * math.sin(5.0 * ang + 1.1)
    )


def road_radius(ang):
    return shore_radius(ang) - 12.0


def road_height(ang):
    return (
        3.25
        + 1.45 * math.sin(ang - 0.5)
        + 0.65 * math.cos(2.0 * ang + 0.7)
        + 0.32 * math.sin(3.0 * ang)
    )


def road_center(ang):
    r = road_radius(ang)
    return [r * math.cos(ang), road_height(ang), r * math.sin(ang)]


def road_frame(ang):
    """Returns (center, forward_xz_unit, outward_xz_unit) at polar angle ang.
    As ang increases, travel goes clockwise in top-down view with the ocean on the LEFT (outward)."""
    e = 0.0025
    c = road_center(ang)
    p0 = road_center(ang - e)
    p1 = road_center(ang + e)
    tx, tz = p1[0] - p0[0], p1[2] - p0[2]
    tlen = math.hypot(tx, tz) or 1.0
    tx, tz = tx / tlen, tz / tlen
    # Outward (toward the sea) in XZ when travelling along increasing ang: (tz, -tx).
    ox, oz = tz, -tx
    return c, (tx, tz), (ox, oz)


def road_point(ang, lateral=0.0, y_off=0.0):
    """lateral > 0 moves seaward (left of rider); lateral < 0 moves inland (right of rider)."""
    c, _, (ox, oz) = road_frame(ang)
    return [c[0] + ox * lateral, c[1] + y_off, c[2] + oz * lateral]


def island_height(x, z):
    d = math.hypot(x, z)
    ang = math.atan2(z, x)
    sr = shore_radius(ang)
    rr = road_radius(ang)
    rh = road_height(ang)

    # Broad organic dome falling smoothly into a shallow shelf beneath the waterline.
    u = d / max(sr, 1.0)
    if u < 1.0:
        rim = 1.0 - u
        base = 7.2 * (rim ** 1.18) + 2.4 * fbm(x * 0.025 + 3.0, z * 0.025 - 1.5, 4, 17) * rim
    else:
        base = -3.8 * smoothstep(1.0, 1.32, u)

    # Three volcanic peaks forming a dramatic layered island silhouette in the interior.
    def peak(cx, cz, sx, sz, height):
        q = math.hypot((x - cx) / sx, (z - cz) / sz)
        return height * (max(0.0, 1.0 - q) ** 1.35)

    peaks = (
        peak(-9.0, -7.0, 31.0, 29.0, 17.5)
        + peak(15.0, 8.0, 26.0, 25.0, 12.0)
        + peak(-16.0, 16.0, 24.0, 22.0, 9.5)
    )
    peaks *= 0.84 + 0.16 * fbm(x * 0.055 + 7.0, z * 0.055 + 2.0, 4, 29)
    h = base + peaks

    # Gently grade the coastal bike-path bench so the road sits flush with zero clipping.
    dr = d - rr
    if abs(dr) < 9.5:
        grade = 1.0 - smoothstep(3.8, 9.5, abs(dr))
        h = h * (1.0 - grade) + (rh - 0.10) * grade

    # Keep the beach gently sloping seaward outside the road.
    if rr + 3.8 < d < sr + 14.0:
        beach_t = smoothstep(rr + 3.8, sr, d)
        beach_h = rh * (1.0 - beach_t) - 0.12
        if d > sr:
            beach_h = -3.6 * smoothstep(sr, sr + 14.0, d)
        blend = smoothstep(rr + 3.8, rr + 7.2, d)
        h = h * (1.0 - blend) + beach_h * blend

    return h


def analytic_normal(fn, x, z, e=0.55):
    dx = (fn(x + e, z) - fn(x - e, z)) / (2.0 * e)
    dz = (fn(x, z + e) - fn(x, z - e)) / (2.0 * e)
    inv = 1.0 / math.sqrt(1.0 + dx * dx + dz * dz)
    return [-dx * inv, inv, -dz * inv]


# --------------------------------------------------------------------------- world meshes


def build_island_mesh():
    mesh = Mesh(with_uv=True)
    n = 184
    span = 98.0
    grid = {}
    for j in range(n + 1):
        z = -span + 2.0 * span * j / n
        for i in range(n + 1):
            x = -span + 2.0 * span * i / n
            if math.hypot(x, z) > span:
                grid[(i, j)] = None
                continue
            y = island_height(x, z)
            nrm = analytic_normal(island_height, x, z)
            grid[(i, j)] = ([x, y, z], nrm, [(x + span) / (2.0 * span), (z + span) / (2.0 * span)])
    for j in range(n):
        for i in range(n):
            c0 = grid[(i, j)]
            c1 = grid[(i + 1, j)]
            c2 = grid[(i + 1, j + 1)]
            c3 = grid[(i, j + 1)]
            if c0 is None or c1 is None or c2 is None or c3 is None:
                continue
            mesh.smooth_quad(c0[0], c3[0], c2[0], c1[0], c0[1], c3[1], c2[1], c1[1], c0[2], c3[2], c2[2], c1[2])
    return mesh


def build_ocean_mesh():
    mesh = Mesh(with_uv=True)
    n = 180
    span = 540.0
    for j in range(n + 1):
        vj = j / n - 0.5
        z = math.copysign((abs(vj) * 2.0) ** 1.35 * span, vj)
        for i in range(n + 1):
            vi = i / n - 0.5
            x = math.copysign((abs(vi) * 2.0) ** 1.35 * span, vi)
            mesh.vert([x, 0.0, z], [0.0, 1.0, 0.0], [(x + span) / (2.0 * span), (z + span) / (2.0 * span)])
    for j in range(n):
        for i in range(n):
            a = j * (n + 1) + i
            b = a + (n + 1)
            mesh.i.extend([a, b, a + 1, a + 1, b, b + 1])
    return mesh


def build_sky_dome():
    mesh = Mesh(with_uv=True)
    radius = 880.0
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
            a, b = grid[j][k], grid[j][k + 1]
            c, d = grid[j + 1][k + 1], grid[j + 1][k]
            mesh.i.extend([a, c, b, a, d, c])
    return mesh


def add_palm_tree(world, base_pos, height, lean_angle, seed):
    bx, by, bz = base_pos
    lean = 1.4 + 0.8 * ((seed * 37) % 10) / 10.0
    lx, lz = math.cos(lean_angle) * lean, math.sin(lean_angle) * lean
    # Curved 4-segment trunk.
    pts = []
    for s in range(5):
        t = s / 4.0
        bend = t * t
        pts.append([bx + lx * bend, by + height * t, bz + lz * bend])
    for s in range(4):
        r0 = 0.34 * (1.0 - 0.14 * s)
        r1 = 0.34 * (1.0 - 0.14 * (s + 1))
        world["trunk"].tube(pts[s], pts[s + 1], r0, r1, segments=8)
    top = pts[-1]
    # 9 arching tropical palm fronds.
    for k in range(9):
        a = k * TAU / 9.0 + seed * 0.7
        leaf = world["leaf" if k % 2 == 0 else "leafLight"]
        frond_len = 4.2 + (k % 3) * 0.45

        def blade(t, side):
            w = (math.sin(math.pi * t) ** 0.65) * 0.46 * (1.0 + 0.1 * math.sin(t * 36.0))
            return [
                top[0] + math.cos(a) * frond_len * t + math.sin(a) * w * side,
                top[1] + math.sin(t * math.pi) * 0.78 - t * t * 1.85,
                top[2] + math.sin(a) * frond_len * t - math.cos(a) * w * side,
            ]

        for j in range(10):
            t0, t1 = j / 10.0, (j + 1) / 10.0
            leaf.quad(blade(t0, -1), blade(t1, -1), blade(t1, 1), blade(t0, 1))
            leaf.quad(blade(t0, 1), blade(t1, 1), blade(t1, -1), blade(t0, -1))
        world["leafLight"].tube(top, blade(0.72, 0), 0.03, 0.01, segments=5)
    # Cluster of coconuts.
    for k in range(3):
        ca = k * TAU / 3.0 + seed
        world["leather"].ellipsoid(
            [top[0] + math.cos(ca) * 0.28, top[1] - 0.26, top[2] + math.sin(ca) * 0.28],
            [0.21, 0.25, 0.21], segments=8, rings=6,
        )


def build_world_props():
    """Creates the closed-loop bike road, curbs, wooden guardrails, palm groves,
    striped lighthouse, coastal village cottages, wooden pier, rocks and anchored sails."""
    world = {k: Mesh() for k in PALETTE}

    # ---- 1. Closed-loop coastal bike path + curbs + dashed center line + scenic guardrail
    segs = 260
    for i in range(segs):
        a0 = TAU * i / segs
        a1 = TAU * (i + 1) / segs
        # Road surface & crisp shoulders
        strips = [
            (-2.85, 2.85, 0.04, "road"),
            (-3.40, -2.85, 0.07, "cream"),
            (2.85, 3.40, 0.07, "cream"),
            (-2.68, -2.54, 0.06, "white"),
            (2.54, 2.68, 0.06, "white"),
        ]
        for lo, hi, y, pal in strips:
            p00 = road_point(a0, lo, y)
            p01 = road_point(a0, hi, y)
            p11 = road_point(a1, hi, y)
            p10 = road_point(a1, lo, y)
            world[pal].quad(p00, p01, p11, p10)
            # Subtle curb edge drop so road never looks paper-thin.
            if pal == "cream":
                edge = lo if lo < 0 else hi
                e0 = road_point(a0, edge, y)
                e1 = road_point(a1, edge, y)
                b0 = road_point(a0, edge, -0.35)
                b1 = road_point(a1, edge, -0.35)
                if lo < 0:
                    world["sand"].quad(b0, e0, e1, b1)
                else:
                    world["sand"].quad(e0, b0, b1, e1)

        # Warm yellow center dashes
        if i % 3 != 2:
            world["yellow"].quad(
                road_point(a0, -0.07, 0.065),
                road_point(a0, 0.07, 0.065),
                road_point(a1, 0.07, 0.065),
                road_point(a1, -0.07, 0.065),
            )

        # Seaward wooden coastal rail along elevated bluff stretches
        h_here = road_height(a0)
        if h_here > 3.1:
            if i % 2 == 0:
                post_b = road_point(a0, 3.65, -0.15)
                post_t = road_point(a0, 3.65, 0.92)
                world["wood"].tube(post_b, post_t, 0.085, 0.075, segments=7)
            r0 = road_point(a0, 3.65, 0.78)
            r1 = road_point(a1, 3.65, 0.78)
            world["wood"].tube(r0, r1, 0.055, 0.055, segments=6, cap=False)
            r0_low = road_point(a0, 3.65, 0.42)
            r1_low = road_point(a1, 3.65, 0.42)
            world["cream"].tube(r0_low, r1_low, 0.035, 0.035, segments=6, cap=False)

    # ---- 2. Palm groves around the island (inland slope + beachside clusters)
    for k in range(38):
        ang = TAU * k / 38.0 + 0.04 * math.sin(k * 2.1)
        # Alternate inland hillside and seaward beach edge (keeping clear of the road)
        if k % 3 == 0:
            lat = 6.2 + (k % 4) * 0.9
        else:
            lat = -(7.0 + (k % 5) * 3.4)
        p = road_point(ang, lat, 0.0)
        py = island_height(p[0], p[2])
        if py < 0.45:
            continue
        height = 6.5 + (k % 5) * 0.95
        add_palm_tree(world, [p[0], py - 0.25, p[2]], height, ang + (0.3 if lat > 0 else -0.4), k)

    # Extra palms nestled on the interior hillside
    for k in range(14):
        ang = TAU * k / 14.0 + 0.22
        dist = 20.0 + (k % 3) * 8.5
        px, pz = math.cos(ang) * dist, math.sin(ang) * dist
        py = island_height(px, pz)
        if py > 3.5:
            add_palm_tree(world, [px, py - 0.3, pz], 7.0 + (k % 4) * 0.8, ang, k + 50)

    # ---- 3. Striped Lighthouse on the high scenic headland (near ang = 1.85 rad)
    lh_ang = 1.90
    lh_pt = road_point(lh_ang, -11.5, 0.0)
    lh_y = island_height(lh_pt[0], lh_pt[2]) - 0.4
    lh_x, lh_z = lh_pt[0], lh_pt[2]
    # Stone plinth
    world["rock"].tube([lh_x, lh_y - 1.5, lh_z], [lh_x, lh_y + 1.2, lh_z], 4.2, 3.6, segments=16)
    # 7 alternating cream & coral-red tapered rings
    for i in range(7):
        r0 = 2.65 - i * 0.17
        r1 = 2.65 - (i + 1) * 0.17
        pal = "cream" if i % 2 == 0 else "red"
        world[pal].tube([lh_x, lh_y + 1.2 + i * 2.2, lh_z], [lh_x, lh_y + 1.2 + (i + 1) * 2.2, lh_z], r0, r1, segments=18)
    gallery_y = lh_y + 1.2 + 7 * 2.2
    world["navy"].tube([lh_x, gallery_y, lh_z], [lh_x, gallery_y + 0.45, lh_z], 2.05, 2.05, segments=18)
    world["beacon"].tube([lh_x, gallery_y + 0.45, lh_z], [lh_x, gallery_y + 2.8, lh_z], 1.35, 1.35, segments=14)
    world["red"].tube([lh_x, gallery_y + 2.8, lh_z], [lh_x, gallery_y + 5.2, lh_z], 1.95, 0.05, segments=18)
    # Keeper's cottage beside lighthouse
    world["cream"].box([lh_x + 4.8, lh_y + 2.2, lh_z + 1.5], [5.4, 3.6, 4.4], yaw=0.35)
    world["red"].box([lh_x + 4.8, lh_y + 4.2, lh_z + 1.5], [6.0, 0.55, 5.0], yaw=0.35)
    world["window"].box([lh_x + 4.8, lh_y + 2.3, lh_z + 3.72], [1.4, 1.2, 0.1], yaw=0.35)

    # ---- 4. Coastal surf cottages & beach umbrellas along the sunny bay (ang ~ 4.4..5.5 rad)
    cottage_specs = [
        (4.35, -9.2, "coral", 6.2, 4.0, 5.0),
        (4.62, -10.0, "teal", 5.4, 3.6, 4.8),
        (4.92, -9.5, "yellow", 6.6, 4.4, 5.4),
        (5.22, -10.4, "mint", 5.8, 3.8, 4.8),
        (5.52, -9.6, "coral", 5.2, 3.5, 4.6),
    ]
    for ang, lat, roof_pal, w, h, d in cottage_specs:
        pt = road_point(ang, lat, 0.0)
        py = island_height(pt[0], pt[2]) - 0.3
        yaw = -ang + math.pi * 0.5
        world["cream"].box([pt[0], py + h * 0.5, pt[2]], [w, h, d], yaw=yaw)
        world[roof_pal].box([pt[0], py + h + 0.25, pt[2]], [w + 0.9, 0.5, d + 0.9], yaw=yaw)
        # Awning & porch posts
        co, si = math.cos(yaw), math.sin(yaw)
        front_x = pt[0] + si * (d * 0.5 + 0.08)
        front_z = pt[2] + co * (d * 0.5 + 0.08)
        world["window"].box([front_x, py + h * 0.52, front_z], [1.5, 1.3, 0.12], yaw=yaw)
        world["wood"].box([pt[0] + si * (d * 0.5 + 1.1), py + 0.35, pt[2] + co * (d * 0.5 + 1.1)], [w * 0.9, 0.22, 2.2], yaw=yaw)

    # Beach umbrellas on the golden sand across from the village
    for k, ang in enumerate([4.50, 4.78, 5.10, 5.38, 0.35, 0.65]):
        pt = road_point(ang, 7.6, 0.0)
        py = island_height(pt[0], pt[2])
        if py < 0.2:
            continue
        world["wood"].tube([pt[0], py - 0.2, pt[2]], [pt[0], py + 2.35, pt[2]], 0.055, 0.05, segments=6)
        pal = ["coral", "teal", "yellow", "mint"][k % 4]
        world[pal].tube([pt[0], py + 2.1, pt[2]], [pt[0], py + 2.65, pt[2]], 1.65, 0.08, segments=10)

    # ---- 5. Wooden pier jutting into the turquoise cove (ang ~ 3.25 rad)
    pier_ang = 3.25
    _, _, (pox, poz) = road_frame(pier_ang)
    pier_start = road_point(pier_ang, 4.0, 0.0)
    pier_y = 1.15
    pier_len = 22.0
    pier_yaw = math.atan2(pox, poz)
    for step in range(18):
        dist = step * (pier_len / 18.0)
        px = pier_start[0] + pox * dist
        pz = pier_start[2] + poz * dist
        world["wood"].box([px, pier_y, pz], [3.6, 0.22, 1.05], yaw=pier_yaw)
        if step % 3 == 0:
            for side in (-1.55, 1.55):
                sx = px - poz * side
                sz = pz + pox * side
                world["trunk"].tube([sx, -2.5, sz], [sx, pier_y + 0.85, sz], 0.14, 0.12, segments=7)

    # ---- 6. Coastal boulders along the shoreline
    for k in range(24):
        ang = TAU * k / 24.0 + 0.13
        sr = shore_radius(ang)
        r = sr - 2.0 + (k % 3) * 3.2
        rx, rz = math.cos(ang) * r, math.sin(ang) * r
        ry = max(-0.4, island_height(rx, rz))
        sx = 1.6 + (k % 4) * 0.75
        sy = 1.0 + (k % 3) * 0.55
        sz = 1.5 + ((k + 2) % 4) * 0.65
        world["rock"].ellipsoid([rx, ry + sy * 0.35, rz], [sx, sy, sz], segments=9, rings=6)

    # ---- 7. Distant anchored sailboats around the sea
    for k, (ang, offshore, hull_pal) in enumerate([
        (0.55, 34.0, "coral"),
        (2.40, 42.0, "teal"),
        (3.65, 29.0, "navy"),
        (5.75, 38.0, "yellow"),
    ]):
        r = shore_radius(ang) + offshore
        bx, bz = math.cos(ang) * r, math.sin(ang) * r
        world[hull_pal].ellipsoid([bx, 0.15, bz], [1.25, 0.75, 4.1], segments=12, rings=7)
        world["cream"].box([bx, 0.55, bz], [1.7, 0.18, 5.2])
        world["wood"].tube([bx, 0.55, bz - 0.2], [bx, 8.2, bz - 0.2], 0.09, 0.05, segments=7)
        # Main sail + jib (double-sided triangles)
        s0, s1, s2 = [bx, 1.4, bz - 0.1], [bx, 7.9, bz - 0.1], [bx + 0.35, 1.5, bz + 3.4]
        world["white"].tri(s0, s1, s2)
        world["white"].tri(s0, s2, s1)
        j0, j1, j2 = [bx, 1.5, bz - 0.35], [bx, 7.3, bz - 0.35], [bx - 0.25, 1.5, bz - 3.3]
        world["cream"].tri(j0, j1, j2)
        world["cream"].tri(j0, j2, j1)

    return world


# --------------------------------------------------------------------------- hero meshes: bicycle + pelican


def build_bicycle_and_pelican():
    """Creates articulated GLB assets for the cruiser bicycle and the pelican rider.
    Local convention: forward is -Z, ground contact is y = 0."""
    assets = {}

    # ---- 1. Vintage Beach Cruiser Frame (static parts attached to Rider Root)
    bike = {k: Mesh() for k in ["teal", "cream", "metal", "leather", "wicker", "brass", "silver", "coral"]}
    bb = [0.0, 0.44, 0.08]
    seat_top = [0.0, 1.12, 0.34]
    head_top = [0.0, 1.18, -0.60]
    head_bot = [0.0, 0.90, -0.69]
    rear_l, rear_r = [-0.11, 0.50, 0.92], [0.11, 0.50, 0.92]
    front_l, front_r = [-0.10, 0.50, -0.92], [0.10, 0.50, -0.92]

    # Diamond / swept beach cruiser tubes
    bike["teal"].tube(bb, seat_top, 0.042, 0.040, 12)             # seat tube
    bike["teal"].tube(head_bot, head_top, 0.046, 0.046, 12)       # head tube
    bike["teal"].tube(head_top, [0.0, 1.10, -0.15], 0.036, 0.036, 10)  # top tube front
    bike["teal"].tube([0.0, 1.10, -0.15], seat_top, 0.036, 0.034, 10)  # top tube rear
    bike["teal"].tube(head_bot, [0.0, 0.58, -0.28], 0.042, 0.042, 10)  # down tube front
    bike["teal"].tube([0.0, 0.58, -0.28], bb, 0.042, 0.042, 10)        # down tube rear
    bike["teal"].tube(seat_top, rear_l, 0.024, 0.020, 8)
    bike["teal"].tube(seat_top, rear_r, 0.024, 0.020, 8)
    bike["teal"].tube(bb, rear_l, 0.026, 0.020, 8)
    bike["teal"].tube(bb, rear_r, 0.026, 0.020, 8)
    bike["teal"].tube(head_bot, front_l, 0.028, 0.022, 10)
    bike["teal"].tube(head_bot, front_r, 0.028, 0.022, 10)

    # Cream fenders hugging front and rear wheels
    for center_z, start_deg, end_deg in [(-0.92, -135, -35), (0.92, 20, 145)]:
        prev = None
        for step in range(11):
            a = math.radians(start_deg + (end_deg - start_deg) * step / 10.0)
            pt = [0.0, 0.50 + 0.545 * math.cos(a), center_z + 0.545 * math.sin(a)]
            if prev is not None:
                bike["cream"].tube(prev, pt, 0.048, 0.048, 8)
            prev = pt

    # Handlebar stem, swept-back cruiser handlebars, leather grips, brass bell
    stem_top = [0.0, 1.38, -0.64]
    bike["metal"].tube(head_top, stem_top, 0.030, 0.028, 10)
    for side in (-1.0, 1.0):
        mid = [side * 0.28, 1.40, -0.58]
        grip_in = [side * 0.44, 1.37, -0.44]
        grip_out = [side * 0.48, 1.35, -0.28]
        bike["metal"].tube(stem_top, mid, 0.024, 0.024, 10)
        bike["metal"].tube(mid, grip_in, 0.024, 0.024, 10)
        bike["leather"].tube(grip_in, grip_out, 0.036, 0.036, 10)
    # Brass bicycle bell on right handlebar
    bike["brass"].ellipsoid([0.28, 1.46, -0.56], [0.055, 0.042, 0.055], 12, 8)
    # Chrome retro headlamp
    bike["metal"].ellipsoid([0.0, 1.12, -0.78], [0.075, 0.075, 0.11], 12, 8)
    bike["brass"].ellipsoid([0.0, 1.12, -0.88], [0.062, 0.062, 0.02], 12, 6)

    # Seat post + comfortable brown leather cruiser saddle + rear rack
    bike["metal"].tube(seat_top, [0.0, 1.24, 0.37], 0.028, 0.028, 10)
    bike["leather"].ellipsoid([0.0, 1.27, 0.40], [0.19, 0.065, 0.25], 16, 10)
    bike["metal"].tube([-0.14, 1.06, 0.56], [-0.14, 1.06, 1.12], 0.018, 0.018, 8)
    bike["metal"].tube([0.14, 1.06, 0.56], [0.14, 1.06, 1.12], 0.018, 0.018, 8)
    bike["metal"].tube([-0.14, 1.06, 1.12], [0.14, 1.06, 1.12], 0.018, 0.018, 8)
    bike["metal"].tube([-0.14, 1.06, 1.05], rear_l, 0.016, 0.016, 6)
    bike["metal"].tube([0.14, 1.06, 1.05], rear_r, 0.016, 0.016, 6)
    # Tail reflector
    bike["coral"].box([0.0, 1.05, 1.16], [0.10, 0.07, 0.04])

    # Woven wicker basket on the front + 2 shiny sardines peeking out!
    bike["wicker"].box([0.0, 1.04, -0.96], [0.46, 0.32, 0.32])
    bike["leather"].box([0.0, 1.21, -0.96], [0.49, 0.045, 0.35])
    bike["metal"].tube([0.0, 1.10, -0.66], [-0.16, 1.06, -0.82], 0.015, 0.015, 6)
    bike["metal"].tube([0.0, 1.10, -0.66], [0.16, 1.06, -0.82], 0.015, 0.015, 6)
    # Little fish peeking out of basket
    for fx, fz, fy in [(-0.10, -0.95, 1.28), (0.11, -0.98, 1.25)]:
        bike["silver"].ellipsoid([fx, fy, fz], [0.06, 0.13, 0.07], 10, 8)
        bike["coral"].tri([fx, fy + 0.10, fz], [fx - 0.07, fy + 0.20, fz], [fx + 0.07, fy + 0.20, fz])
        bike["coral"].tri([fx, fy + 0.10, fz], [fx + 0.07, fy + 0.20, fz], [fx - 0.07, fy + 0.20, fz])

    assets["bike"] = {k: m.save(f"bike-{k}") for k, m in bike.items() if m.p}

    # ---- 2. Spoked Bicycle Wheel (shared by front & rear rotating entities)
    tire = Mesh()
    tire.torus_x([0.0, 0.0, 0.0], 0.44, 0.062, segments=36, sides=10)
    assets["wheel_tire"] = tire.save("wheel-tire")

    wall = Mesh()
    wall.torus_x([0.0, 0.0, 0.0], 0.39, 0.025, segments=32, sides=8)
    assets["wheel_wall"] = wall.save("wheel-wall")

    rim = Mesh()
    rim.torus_x([0.0, 0.0, 0.0], 0.37, 0.020, segments=32, sides=8)
    rim.tube([-0.09, 0.0, 0.0], [0.09, 0.0, 0.0], 0.055, 0.055, 12)
    for k in range(12):
        a = TAU * k / 12.0
        rim.tube([0.0, 0.0, 0.0], [0.0, 0.365 * math.cos(a), 0.365 * math.sin(a)], 0.010, 0.010, 6)
    assets["wheel_rim"] = rim.save("wheel-rim")

    # ---- 3. Rotating Crankset & Pedals (origin at Bottom Bracket [0, 0.44, 0.08])
    crank_metal = Mesh()
    crank_metal.torus_x([0.08, 0.0, 0.0], 0.135, 0.018, segments=24, sides=6)
    crank_metal.tube([-0.14, 0.0, 0.0], [0.14, 0.0, 0.0], 0.036, 0.036, 10)
    # Left crank arm extends toward -Z (a=0 -> front); right crank arm toward +Z (opposite).
    crank_metal.tube([-0.14, 0.0, 0.0], [-0.17, 0.0, -0.21], 0.022, 0.018, 8)
    crank_metal.tube([0.14, 0.0, 0.0], [0.17, 0.0, 0.21], 0.022, 0.018, 8)
    assets["crank_metal"] = crank_metal.save("crank-metal")

    crank_pedal = Mesh()
    crank_pedal.box([-0.24, 0.0, -0.21], [0.14, 0.04, 0.10])
    crank_pedal.box([0.24, 0.0, 0.21], [0.14, 0.04, 0.10])
    assets["crank_pedal"] = crank_pedal.save("crank-pedal")

    # ---- 4. Sculpted Pelican Rider (continuous lofted body, S-neck, big beak, pouch, hat, scarf)
    pelican = {k: Mesh() for k in ["white", "cream", "beak", "pouch", "black", "wicker", "coral", "teal"]}

    # Body + S-curved neck + head (seated nicely on the cruiser saddle at y ~ 1.35, z ~ 0.38)
    pelican["white"].loft([
        (1.48, 1.18, 0.02, 0.025),    # tail tip
        (1.52, 0.90, 0.24, 0.20),     # tail base
        (1.64, 0.45, 0.46, 0.46),     # plump belly on saddle
        (1.78, 0.04, 0.40, 0.40),     # chest
        (1.98, -0.14, 0.24, 0.25),    # lower neck curve
        (2.28, -0.06, 0.15, 0.16),    # graceful S-neck mid
        (2.58, 0.04, 0.14, 0.15),     # upper neck backbend
        (2.82, -0.08, 0.21, 0.22),    # back of head
        (2.94, -0.32, 0.25, 0.24),    # cranium
        (2.90, -0.52, 0.18, 0.17),    # face front
        (2.86, -0.60, 0.02, 0.03),    # beak root cap
    ], steps=10, sides=34)

    # Upper long bill (tapered golden-orange with subtle hook tip)
    pelican["beak"].loft([
        (2.88, -0.50, 0.13, 0.040),
        (2.87, -0.74, 0.17, 0.058),
        (2.83, -1.16, 0.11, 0.042),
        (2.74, -1.58, 0.010, 0.012),
    ], steps=10, sides=26)

    # Cream dorsal ridge along the upper bill
    pelican["cream"].loft([
        (2.915, -0.55, 0.02, 0.008),
        (2.905, -0.76, 0.14, 0.014),
        (2.86, -1.16, 0.09, 0.011),
        (2.76, -1.55, 0.004, 0.004),
    ], steps=8, sides=18)

    # Iconic hanging throat pouch
    pelican["pouch"].loft([
        (2.81, -0.54, 0.14, 0.045),
        (2.62, -0.74, 0.18, 0.17),
        (2.61, -1.08, 0.12, 0.16),
        (2.73, -1.52, 0.006, 0.008),
    ], steps=10, sides=26)

    # Expressive bright eyes with dark pupils & white catchlight
    for side in (-1.0, 1.0):
        pelican["cream"].ellipsoid([side * 0.215, 2.97, -0.41], [0.042, 0.085, 0.092], 16, 10)
        pelican["black"].ellipsoid([side * 0.245, 2.97, -0.435], [0.030, 0.056, 0.060], 16, 10)
        pelican["white"].ellipsoid([side * 0.265, 2.995, -0.458], [0.011, 0.016, 0.016], 10, 6)

    # Tropical straw sun hat + coral ribbon band!
    pelican["wicker"].tube([0.0, 3.10, -0.26], [0.0, 3.16, -0.26], 0.44, 0.42, segments=24)  # wide brim
    pelican["wicker"].tube([0.0, 3.14, -0.26], [0.0, 3.38, -0.26], 0.24, 0.19, segments=22)  # crown
    pelican["coral"].tube([0.0, 3.16, -0.26], [0.0, 3.24, -0.26], 0.252, 0.245, segments=22) # ribbon

    # Scarf collar wrapped around neck (flowing tail is animated separately)
    pelican["coral"].loft([
        (2.26, -0.06, 0.165, 0.175),
        (2.34, -0.04, 0.172, 0.182),
        (2.41, -0.02, 0.165, 0.175),
    ], steps=5, sides=26)

    # Layered tail & shoulder feathers for crisp silhouette
    for k in range(4):
        for side in (-1.0, 1.0):
            pelican["cream"].loft([
                (1.68 - k * 0.03, 0.45, 0.035, 0.03),
                (1.62 - k * 0.03, 0.72 + k * 0.04, 0.08, 0.05),
                (1.50 - k * 0.02, 1.00 + k * 0.03, 0.015, 0.015),
            ], steps=6, sides=14, x_offset=side * (0.34 + k * 0.015))

    assets["pelican"] = {k: m.save(f"pelican-{k}") for k, m in pelican.items() if m.p}

    # ---- 5. Articulated Wing (mounted at shoulder [±0.38, 1.80, 0.05], reaches gently toward handlebar)
    wing = Mesh()
    wing.loft([
        (0.0, 0.0, 0.07, 0.07),
        (-0.14, -0.14, 0.16, 0.12),
        (-0.30, -0.32, 0.15, 0.10),
        (-0.42, -0.46, 0.10, 0.065),
        (-0.46, -0.54, 0.02, 0.02),
    ], steps=8, sides=22)
    # Primary flight feathers fanning backwards off the wing
    for k in range(4):
        wing.loft([
            (-0.18, -0.06, 0.035, 0.04),
            (-0.32, 0.14 + k * 0.06, 0.042, 0.028),
            (-0.38 - k * 0.02, 0.40 + k * 0.07, 0.008, 0.006),
        ], steps=6, sides=10, x_offset=0.05 + k * 0.018)
    assets["pelican_wing"] = wing.save("pelican-wing")

    # ---- 6. Flowing Scarf Tail (pivots at back of neck [0, 2.34, 0.08], flutters in breeze)
    scarf = Mesh()
    scarf.loft([
        (0.0, 0.0, 0.13, 0.022),
        (-0.08, 0.36, 0.11, 0.025),
        (0.03, 0.74, 0.075, 0.022),
        (-0.06, 1.14, 0.018, 0.014),
    ], steps=10, sides=16)
    assets["pelican_scarf"] = scarf.save("pelican-scarf")

    # ---- 7. Pedaling Leg & Webbed Foot (pivots at each pedal position in Main.ts)
    foot_mesh = Mesh()
    # Webbed orange pelican foot resting on the pedal + lower leg rising toward thigh
    foot_mesh.ellipsoid([0.0, 0.04, -0.05], [0.095, 0.035, 0.155], 14, 8)
    foot_mesh.tube([0.0, 0.05, 0.02], [0.0, 0.56, 0.14], 0.045, 0.065, 10)
    assets["pelican_foot"] = foot_mesh.save("pelican-foot")

    # ---- 8. Gliding Seagull (body + wing pair for lively island sky)
    gull_body = Mesh()
    gull_body.ellipsoid([0.0, 0.0, 0.0], [0.14, 0.12, 0.42], 12, 8)
    gull_body.tube([0.0, 0.03, -0.38], [0.0, 0.0, -0.60], 0.04, 0.008, 8)
    assets["gull_body"] = gull_body.save("gull-body")

    gull_wing = Mesh()
    gull_wing.quad([0.0, 0.0, -0.18], [0.95, 0.12, -0.06], [0.85, 0.10, 0.16], [0.0, 0.0, 0.18])
    gull_wing.quad([0.0, 0.0, 0.18], [0.85, 0.10, 0.16], [0.95, 0.12, -0.06], [0.0, 0.0, -0.18])
    gull_wing.quad([0.95, 0.12, -0.06], [1.55, -0.05, 0.12], [1.45, -0.06, 0.24], [0.85, 0.10, 0.16])
    gull_wing.quad([0.85, 0.10, 0.16], [1.45, -0.06, 0.24], [1.55, -0.05, 0.12], [0.95, 0.12, -0.06])
    assets["gull_wing"] = gull_wing.save("gull-wing")

    return assets


# --------------------------------------------------------------------------- procedural textures


def write_normal_map(path, size=512, cells=14.0, strength=2.2):
    heights = [[0.0] * size for _ in range(size)]
    for y in range(size):
        v = y / size
        for x in range(size):
            u = x / size
            heights[y][x] = (
                0.62 * periodic_fbm(u, v, cells, 4, 13)
                + 0.38 * periodic_fbm(u + 0.37, v - 0.19, cells * 2.0, 3, 27)
            )
    px = bytearray()
    for y in range(size):
        for x in range(size):
            xl, xr = heights[y][(x - 1) % size], heights[y][(x + 1) % size]
            yu, yd = heights[(y - 1) % size][x], heights[(y + 1) % size][x]
            nx, ny, nz = -(xr - xl) * strength, -(yd - yu) * strength, 1.0
            inv = 1.0 / math.sqrt(nx * nx + ny * ny + nz * nz)
            px.extend((
                int((nx * inv * 0.5 + 0.5) * 255),
                int((ny * inv * 0.5 + 0.5) * 255),
                int((nz * inv * 0.5 + 0.5) * 255),
            ))
    Image.frombytes("RGB", (size, size), bytes(px)).save(path)


def write_env_sky(path, sunset=False, width=1024, height=512):
    if not sunset:
        zenith = [0.07, 0.30, 0.72]
        horizon = [0.55, 0.80, 0.94]
        ground = [0.05, 0.14, 0.20]
        sun_dir = [-0.55, 0.62, -0.56]
        sun_col = [1.0, 0.94, 0.80]
    else:
        zenith = [0.04, 0.06, 0.19]
        horizon = [0.85, 0.34, 0.16]
        ground = [0.03, 0.04, 0.07]
        sun_dir = [-0.84, 0.17, -0.51]
        sun_col = [1.0, 0.58, 0.26]

    sl = math.sqrt(sum(t * t for t in sun_dir))
    sun_dir = [t / sl for t in sun_dir]

    # Cloud density map for rich reflections on the water and chrome bike parts.
    cw, ch = 256, 128
    cmap = Image.new("L", (cw, ch))
    cpx = cmap.load()
    for j in range(ch):
        v = j / ch
        for i in range(cw):
            u = i / cw
            wx = u + 0.12 * periodic_fbm(u, v, 6, 3, 41)
            wy = v + 0.12 * periodic_fbm(u + 0.25, v - 0.18, 6, 3, 73)
            val = periodic_fbm(wx, wy, 8, 4, 11)
            cpx[i, j] = int(clamp((val - 0.48) * 3.0, 0.0, 1.0) * 255)
    clouds = cmap.resize((width, height), Image.BILINEAR).load()

    px = bytearray()
    for row in range(height):
        lat = math.pi * 0.5 - math.pi * row / (height - 1)
        sy, cy = math.sin(lat), math.cos(lat)
        for col in range(width):
            lon = -math.pi + TAU * col / width
            dirv = [cy * math.cos(lon), sy, cy * math.sin(lon)]
            cosang = clamp(sum(dirv[k] * sun_dir[k] for k in range(3)), -1.0, 1.0)
            if sy >= 0.0:
                mixt = sy ** 0.55
                rgb = [horizon[k] + (zenith[k] - horizon[k]) * mixt for k in range(3)]
            else:
                mixt = sy + 1.0
                rgb = [ground[k] + (horizon[k] - ground[k]) * mixt for k in range(3)]
            ang = math.acos(cosang)
            glow = 0.75 * math.exp(-ang * 3.2)
            disc = 6.0 if cosang > 0.9991 else 0.0
            rgb = [rgb[k] + sun_col[k] * (glow + disc) for k in range(3)]
            if sy > 0.0:
                band = clamp(sy * 3.0, 0.0, 1.0) * clamp((1.0 - sy) * 2.0, 0.0, 1.0)
                c = (clouds[col, row] / 255.0) * band * 0.75
                if sunset:
                    ccol = [0.34 + sun_col[0] * glow * 0.9, 0.24 + sun_col[1] * glow * 0.8, 0.30 + sun_col[2] * glow * 0.5]
                else:
                    ccol = [0.92, 0.95, 0.99]
                rgb = [rgb[k] * (1.0 - c) + ccol[k] * c for k in range(3)]
            for k in range(3):
                enc = clamp(rgb[k], 0.0, 1.0) ** (1.0 / 2.2)
                px.append(int(enc * 255))
    Image.frombytes("RGB", (width, height), bytes(px)).save(path)


# --------------------------------------------------------------------------- synthesized audio


def write_audio():
    rate = 22050

    def write_wav(name, duration, sample_fn):
        with wave.open(str(AUDIO / f"{name}.wav"), "wb") as wf:
            wf.setparams((1, 2, rate, 0, "NONE", "not compressed"))
            frames = bytearray()
            total = int(duration * rate)
            for i in range(total):
                s = clamp(sample_fn(i / rate, duration), -0.95, 0.95)
                frames.extend(struct.pack("<h", int(s * 32767)))
            wf.writeframes(bytes(frames))

    # Gentle looping ocean surf + tropical breeze (seamless 8 s loop).
    rng = random.Random(99)
    lp = 0.0

    def ocean_sample(t, dur):
        nonlocal lp
        white = rng.uniform(-1.0, 1.0)
        lp = lp * 0.92 + white * 0.08
        swell = 0.55 + 0.45 * math.sin(TAU * t / dur)
        surf = 0.5 + 0.5 * math.sin(TAU * 2.0 * t / dur + 0.8)
        return (lp * 0.42 * swell + white * 0.03 * surf)

    write_wav("ocean-breeze", 8.0, ocean_sample)

    # Crisp double-ring vintage bicycle brass bell ("ding-ding!").
    def bell_sample(t, _dur):
        out = 0.0
        for onset in (0.0, 0.16):
            dt = t - onset
            if dt >= 0.0:
                env = math.exp(-dt * 8.5)
                out += env * (
                    0.42 * math.sin(TAU * 1568.0 * dt)
                    + 0.24 * math.sin(TAU * 3136.0 * dt)
                    + 0.12 * math.sin(TAU * 4680.0 * dt)
                )
        return out * 0.65

    write_wav("bike-bell", 0.95, bell_sample)


# --------------------------------------------------------------------------- scene & meta generation


class SceneBuilder:
    def __init__(self):
        self.entities = []

    def entity(self, name, components=None, parent=None):
        ent = {
            "entity": len(self.entities) + 1,
            "name": name,
            "parent": parent,
            "siblingIndex": len(self.entities),
            "active": True,
            "components": components or {},
        }
        self.entities.append(ent)
        return ent["entity"]

    @staticmethod
    def transform(pos=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0, 1)):
        return {"position": list(pos), "scale": list(scale), "rotation": list(rot)}

    @staticmethod
    def pbr(pal):
        glossy = pal in ("teal", "coral", "yellow", "mint", "red", "beacon")
        metallic = pal in ("metal", "brass", "silver")
        emissive = [1.0, 0.84, 0.42] if pal == "beacon" else None
        mat = {
            "base_color": srgb_to_linear(PALETTE[pal]),
            "roughness": 0.22 if metallic else (0.34 if glossy else (0.48 if pal in ("beak", "pouch") else 0.72)),
            "metallic": 0.82 if metallic else (0.14 if glossy else 0.0),
        }
        if emissive:
            mat["emissive"] = emissive
        return mat

    def mesh(self, name, mesh_path, material="default", pbr_pal=None, parent=None,
             pos=(0, 0, 0), scale=(1, 1, 1), rot=(0, 0, 0, 1),
             cast_shadows=True, receive_shadows=True):
        comps = {
            "Transform": self.transform(pos, scale, rot),
            "MeshRenderer": {
                "mesh": mesh_path,
                "material": material,
                "cast_shadows": cast_shadows,
                "receive_shadows": receive_shadows,
            },
        }
        if pbr_pal is not None:
            comps["PbrMaterial"] = self.pbr(pbr_pal)
        return self.entity(name, comps, parent)

    def params(self, entity_id, names, values):
        self.entities[entity_id - 1]["components"]["MaterialPropertyBlock"] = {
            "custom_parameter_names": names,
            "custom_parameter_values": values,
        }


IMPORTER_BY_EXT = {
    ".glb": "model",
    ".png": "texture",
    ".mshader": "shader",
    ".mmat": "material",
    ".mscene": "scene",
    ".ts": "script",
    ".js": "script",
    ".ttf": "font",
    ".wav": "audio",
}


def sync_meta_files():
    assets_root = OUT / "Assets"
    for path in sorted(assets_root.rglob("*")):
        if path.is_dir() or path.suffix == ".meta":
            continue
        ext = path.suffix.lower()
        importer = IMPORTER_BY_EXT.get(ext)
        if importer is None:
            continue
        meta_path = path.with_name(path.name + ".meta")
        rel = path.relative_to(OUT).as_posix()
        guid = str(uuid.uuid5(META_NAMESPACE, rel))
        meta = {"schemaVersion": 1, "guid": guid, "importer": importer}
        meta_path.write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")


def main():
    for d in [MODELS, TEXTURES, SCENES, SCRIPTS, FONTS, AUDIO]:
        d.mkdir(parents=True, exist_ok=True)

    # Reuse repo CJK font + engine script typings.
    font_src = ROOT / "samples/frostbound-realms/Assets/Fonts/NotoSansSC.ttf"
    font_dst = FONTS / "NotoSansSC.ttf"
    if font_src.exists() and not font_dst.exists():
        shutil.copy2(font_src, font_dst)
    shutil.copy2(ROOT / "samples/types/engine.d.ts", SCRIPTS / "mengine.d.ts")

    # ---- Procedural meshes
    island_path = build_island_mesh().save("island")
    ocean_path = build_ocean_mesh().save("ocean")
    sky_path = build_sky_dome().save("sky-dome")
    world_props = build_world_props()
    world_paths = {pal: m.save(f"island-{pal}") for pal, m in world_props.items() if m.p}
    hero = build_bicycle_and_pelican()

    # ---- Procedural textures & audio
    write_normal_map(TEXTURES / "island-normal.png", 512, 14.0, 2.2)
    write_env_sky(TEXTURES / "sky-day.png", sunset=False)
    write_env_sky(TEXTURES / "sky-sunset.png", sunset=True)
    write_audio()

    # ---- Scene assembly
    s = SceneBuilder()

    # Initial rider placement on the scenic bay stretch (ang = 0.0)
    start_ang = 0.0
    rider_pos = road_point(start_ang, 0.0, 0.05)
    _, (tx, tz), (ox, oz) = road_frame(start_ang)
    rider_yaw = math.atan2(-tx, -tz)

    cam_pos = [rider_pos[0] - tx * 7.8 + ox * 3.8, rider_pos[1] + 3.6, rider_pos[2] - tz * 7.8 + oz * 3.8]
    cam_target = [rider_pos[0] + tx * 2.0, rider_pos[1] + 1.9, rider_pos[2] + tz * 2.0]

    cam_id = s.entity("Main Camera", {
        "Transform": s.transform(cam_pos, rot=look_at_quat(cam_pos, cam_target)),
        "Camera3D": {
            "fov_y_degrees": 52.0, "near": 0.2, "far": 1800.0, "primary": True,
            "clear_flags": "skybox", "background_color": [0.35, 0.65, 0.85, 1.0],
        },
        "AudioListener": {"primary": True},
    })

    sun_rot = look_at_quat([0, 0, 0], [0.55, -0.62, 0.56])
    s.entity("Sun Light", {
        "Transform": s.transform([0, 60, 0], rot=sun_rot),
        "DirectionalLight": {
            "color": [1.0, 0.96, 0.86, 1.0], "intensity": 2.4,
            "cast_shadows": True, "shadow_strength": 0.78,
            "shadow_distance": 140.0, "shadow_bias": 0.0014, "shadow_normal_bias": 0.02,
        },
    })

    s.entity("Environment", {
        "EnvironmentLight": {
            "sky_color": srgb_to_linear("4F8ED6"),
            "equator_color": srgb_to_linear("B6DCEB"),
            "ground_color": srgb_to_linear("2A464D"),
            "diffuse_intensity": 0.65, "specular_intensity": 0.68,
            "texture": "Assets/Textures/sky-day.png",
            "background_enabled": False, "background_intensity": 0.75,
            "exposure": -0.05, "tone_mapping": True,
        }
    })

    sky_id = s.mesh("Sky Dome", sky_path, "Assets/Materials/Sky.mmat", cast_shadows=False, receive_shadows=False)
    s.params(sky_id, ["clock"], [[0, 0, 0, 0]])

    ocean_id = s.mesh("Ocean", ocean_path, "Assets/Materials/Ocean.mmat", cast_shadows=False, receive_shadows=False)
    s.params(ocean_id, ["clock"], [[0, 0, 0, 0]])

    island_id = s.mesh("Island Terrain", island_path, "Assets/Materials/Island.mmat", cast_shadows=True, receive_shadows=True)
    s.params(island_id, ["clock"], [[0, 0, 0, 0]])

    # Static island props grouped by palette
    world_root = s.entity("Island Props", {"Transform": s.transform()})
    for pal, path in world_paths.items():
        s.mesh(f"Prop / {pal}", path, pbr_pal=pal, parent=world_root)

    # ---- Hero: Pelican + Vintage Cruiser Bicycle
    rider_root = s.entity("Pelican Rider", {"Transform": s.transform(rider_pos, rot=quat_yxz(rider_yaw))})
    for pal, path in hero["bike"].items():
        s.mesh(f"Bike / {pal}", path, pbr_pal=pal, parent=rider_root)
    for pal, path in hero["pelican"].items():
        s.mesh(f"Pelican / {pal}", path, pbr_pal=pal, parent=rider_root)

    # Front & rear spinning spoked wheels
    for label, z_off in [("Front", -0.92), ("Rear", 0.92)]:
        wheel = s.entity(f"Wheel {label}", {"Transform": s.transform([0.0, 0.50, z_off])}, rider_root)
        s.mesh(f"Wheel {label} Tire", hero["wheel_tire"], pbr_pal="rubber", parent=wheel)
        s.mesh(f"Wheel {label} Wall", hero["wheel_wall"], pbr_pal="cream", parent=wheel)
        s.mesh(f"Wheel {label} Rim", hero["wheel_rim"], pbr_pal="metal", parent=wheel)

    # Rotating crankset
    crank = s.entity("Bike Crank", {"Transform": s.transform([0.0, 0.44, 0.08])}, rider_root)
    s.mesh("Crank Metal", hero["crank_metal"], pbr_pal="metal", parent=crank)
    s.mesh("Crank Pedals", hero["crank_pedal"], pbr_pal="leather", parent=crank)

    # Articulated wings, fluttering scarf tail, and pedaling webbed feet
    s.mesh("Pelican Wing L", hero["pelican_wing"], pbr_pal="white", parent=rider_root,
           pos=[-0.38, 1.80, 0.05], scale=[-1.0, 1.0, 1.0])
    s.mesh("Pelican Wing R", hero["pelican_wing"], pbr_pal="white", parent=rider_root,
           pos=[0.38, 1.80, 0.05], scale=[1.0, 1.0, 1.0])
    s.mesh("Pelican Scarf", hero["pelican_scarf"], pbr_pal="coral", parent=rider_root,
           pos=[0.0, 2.34, 0.08])
    s.mesh("Pelican Foot L", hero["pelican_foot"], pbr_pal="orange", parent=rider_root,
           pos=[-0.23, 0.44, -0.13])
    s.mesh("Pelican Foot R", hero["pelican_foot"], pbr_pal="orange", parent=rider_root,
           pos=[0.23, 0.44, 0.29])

    # ---- Circling seagulls overhead
    for idx in range(6):
        gull = s.entity(f"Seagull {idx}", {"Transform": s.transform([0, 24 + idx * 2, 0])})
        s.mesh(f"Seagull {idx} Body", hero["gull_body"], pbr_pal="white", parent=gull, cast_shadows=False)
        s.mesh(f"Seagull {idx} Wing L", hero["gull_wing"], pbr_pal="white", parent=gull,
               scale=[-1.0, 1.0, 1.0], cast_shadows=False)
        s.mesh(f"Seagull {idx} Wing R", hero["gull_wing"], pbr_pal="white", parent=gull,
               scale=[1.0, 1.0, 1.0], cast_shadows=False)

    # ---- Audio sources
    s.entity("Ocean Audio", {
        "AudioSource": {
            "clip": "Assets/Audio/ocean-breeze.wav",
            "volume": 0.26, "looped": True, "play_on_awake": True, "playing": True,
        }
    })
    s.entity("Bell Audio", {
        "AudioSource": {
            "clip": "Assets/Audio/bike-bell.wav",
            "volume": 0.55, "looped": False, "play_on_awake": False, "playing": False,
        }
    })
    s.entity("Audio Mixer", {"AudioMixer": {"master_volume": 0.85, "music_volume": 0.7}})

    # ---- Clean bilingual HUD overlay (1920x1080 reference space, center-anchored)
    canvas = s.entity("HUD Canvas", {
        "Canvas": {"render_mode": "ScreenSpaceOverlay", "pixel_perfect": False, "sorting_order": 100},
        "CanvasScaler": {
            "ui_scale_mode": "ScaleWithScreenSize", "reference_resolution": [1920, 1080],
            "screen_match_mode": "MatchWidthOrHeight", "match_width_or_height": 0.5,
        },
        "GraphicRaycaster": {"enabled": False},
    })

    def place(name, cx, cy, w, h, pivot=(0.5, 0.5)):
        return s.entity(name, {
            "RectTransform": {
                "anchor_min": [0.5, 0.5], "anchor_max": [0.5, 0.5],
                "pivot": list(pivot), "anchored_position": [cx - 960, cy - 540],
                "size_delta": [w, h],
            }
        }, canvas)

    def panel(name, cx, cy, w, h, col):
        e = place(name, cx, cy, w, h)
        s.entities[e - 1]["components"]["Image"] = {"sprite": "white", "color": col, "raycast_target": False}
        return e

    def label(name, cx, cy, w, h, text, size, col=(0.96, 0.97, 0.98, 1.0), align="Left", valign="Middle"):
        e = place(name, cx, cy, w, h)
        s.entities[e - 1]["components"]["Text"] = {
            "text": text, "font": "Assets/Fonts/NotoSansSC.ttf", "font_size": size,
            "color": list(col), "alignment": align, "vertical_align": valign,
            "horizontal_overflow": "Overflow", "vertical_overflow": "Overflow",
            "line_spacing": 1.18, "raycast_target": False,
        }
        return e

    glass = [0.025, 0.065, 0.095, 0.72]
    mint = [0.46, 0.90, 0.84, 1.0]
    gold = [1.0, 0.80, 0.38, 1.0]
    muted = [0.76, 0.86, 0.90, 0.92]

    # Top-left title card
    panel("hud-title-bg", 268, 76, 468, 92, glass)
    panel("hud-title-bar", 38, 76, 5, 62, gold)
    label("hud-eyebrow", 276, 52, 420, 28, "MENGINE  ·  3D COASTAL SAMPLE", 15, mint)
    label("hud-title", 276, 88, 420, 40, "鹈鹕环岛骑行  ·  PELICAN ISLAND", 25, [1, 1, 1, 0.98])

    # Top-right camera & lighting badge
    panel("hud-mode-bg", 1682, 76, 408, 92, glass)
    label("hud-camera", 1682, 56, 368, 30, "镜头：侧后跟随  /  CHASE CAM", 17, gold, align="Right")
    label("hud-lighting", 1682, 92, 368, 28, "晴昼海风  ·  TROPICAL DAY", 15, mint, align="Right")

    # Bottom-left ride telemetry
    panel("hud-ride-bg", 268, 962, 468, 124, glass)
    label("hud-landmark", 276, 928, 430, 32, "椰影白沙湾  ·  PALM COVE", 21, gold)
    label("hud-stats", 276, 968, 430, 32, "24 KM/H   ·   第 1 圈   ·   自动巡游", 18, [0.96, 0.98, 0.99, 0.96])
    label("hud-bell-toast", 276, 1002, 430, 24, "按 B 摇响车铃，鹈鹕会开心挥翅", 14, muted)

    # Bottom-right control hints
    panel("hud-hint-bg", 1510, 998, 752, 52, [0.02, 0.05, 0.08, 0.68])
    label("hud-hint", 1510, 998, 716, 32, "WASD 骑行调速   C 切镜头   L 晴昼/日落   B 车铃   SPACE 暂停   V 隐藏UI",
          15, muted, align="Right")

    # ---- Write project.json & Main.mscene
    (OUT / "project.json").write_text(json.dumps({
        "name": "Pelican Island Ride",
        "version": 1,
        "language": "typescript",
        "mainScene": "Assets/Scenes/Main.mscene",
        "buildScenes": ["Assets/Scenes/Main.mscene"],
        "startupScript": "Assets/Scripts/Main.ts",
        "assetMode": "all",
    }, indent=2) + "\n", encoding="utf-8")

    (SCENES / "Main.mscene").write_text(json.dumps({
        "version": 1,
        "name": "Pelican Island",
        "world": {
            "entities": s.entities,
            "frame": 0,
            "sim_frame": 0,
            "clear_color": [0.35, 0.65, 0.85, 1.0],
            "selected": cam_id,
        },
    }, indent=2) + "\n", encoding="utf-8")

    sync_meta_files()
    print(f"Built Pelican Island Ride: {len(s.entities)} entities, {len(list(MODELS.glob('*.glb')))} GLBs.")


if __name__ == "__main__":
    main()
