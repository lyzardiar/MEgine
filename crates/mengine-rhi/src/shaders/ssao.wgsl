// Half-resolution Screen-Space Ambient Occlusion (SSAO) + Depth-Aware Bilateral Blur.
// Reconstructs view-space positions and face normals from the resolved scene depth buffer.

const PI: f32 = 3.141592653589793;

struct SsaoUniforms {
    inv_proj: mat4x4<f32>,
    proj: mat4x4<f32>,
    params: vec4<f32>, // x=radius, y=bias, z=intensity, w=unused
    texel_size: vec4<f32>, // xy = 1 / half_res, zw = blur_dir
};

@group(0) @binding(0) var depth_tex: texture_2d<f32>;
@group(0) @binding(1) var ssao_tex: texture_2d<f32>;
@group(0) @binding(2) var linear_sampler: sampler;
@group(0) @binding(3) var<uniform> ssao: SsaoUniforms;

struct VsOut {
    @builtin(position) position: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> VsOut {
    let pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var out: VsOut;
    out.position = vec4<f32>(pos[vid], 0.0, 1.0);
    out.uv = vec2<f32>(pos[vid].x * 0.5 + 0.5, 0.5 - pos[vid].y * 0.5);
    return out;
}

fn view_pos_from_depth(uv: vec2<f32>, depth: f32) -> vec3<f32> {
    let ndc = vec4<f32>(uv.x * 2.0 - 1.0, 1.0 - uv.y * 2.0, depth, 1.0);
    let view = ssao.inv_proj * ndc;
    return view.xyz / max(view.w, 0.00001);
}

fn sample_depth(uv: vec2<f32>) -> f32 {
    let dims = vec2<f32>(textureDimensions(depth_tex));
    let coord = clamp(vec2<i32>(uv * dims), vec2<i32>(0), vec2<i32>(dims) - vec2<i32>(1));
    return textureLoad(depth_tex, coord, 0).r;
}

fn hash_noise(p: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(p, vec2<f32>(0.06711056, 0.00583715))));
}

@fragment
fn fs_ssao(input: VsOut) -> @location(0) vec4<f32> {
    let depth = sample_depth(input.uv);
    if depth >= 0.9999 || ssao.params.z <= 0.001 {
        return vec4<f32>(1.0, 0.0, 0.0, 1.0);
    }

    let center = view_pos_from_depth(input.uv, depth);
    let dx = ssao.texel_size.xy * vec2<f32>(1.0, 0.0);
    let dy = ssao.texel_size.xy * vec2<f32>(0.0, 1.0);

    let p_r = view_pos_from_depth(input.uv + dx, sample_depth(input.uv + dx));
    let p_l = view_pos_from_depth(input.uv - dx, sample_depth(input.uv - dx));
    let p_u = view_pos_from_depth(input.uv - dy, sample_depth(input.uv - dy));
    let p_d = view_pos_from_depth(input.uv + dy, sample_depth(input.uv + dy));

    let dpx = select(p_r - center, center - p_l, abs(p_l.z - center.z) < abs(p_r.z - center.z));
    let dpy = select(p_u - center, center - p_d, abs(p_d.z - center.z) < abs(p_u.z - center.z));
    let normal = normalize(cross(dpx, dpy));

    let radius = max(ssao.params.x, 0.15);
    let bias = ssao.params.y;
    let rand_ang = hash_noise(input.position.xy) * 2.0 * PI;

    var occlusion = 0.0;
    let sample_count = 12u;
    for (var i = 0u; i < sample_count; i = i + 1u) {
        let frac = (f32(i) + 0.5) / f32(sample_count);
        let ang = rand_ang + frac * 6.2831853 * 3.0;
        let r = radius * (0.15 + 0.85 * frac * frac);
        // Screen-space projected spiral offset scaled by view depth
        let sample_view = center + vec3<f32>(cos(ang) * r, sin(ang) * r, 0.0);
        let clip = ssao.proj * vec4<f32>(sample_view, 1.0);
        let s_uv = vec2<f32>(clip.x / clip.w * 0.5 + 0.5, 0.5 - clip.y / clip.w * 0.5);
        if s_uv.x < 0.0 || s_uv.x > 1.0 || s_uv.y < 0.0 || s_uv.y > 1.0 {
            continue;
        }
        let s_depth = sample_depth(s_uv);
        if s_depth >= 0.9999 {
            continue;
        }
        let s_pos = view_pos_from_depth(s_uv, s_depth);
        let diff = s_pos - center;
        let dist = length(diff);
        if dist < 0.0001 || dist > radius * 2.2 {
            continue;
        }
        let nd = max(dot(normal, diff / dist) - bias, 0.0);
        let falloff = clamp(1.0 - (dist / (radius * 1.8)), 0.0, 1.0);
        occlusion += nd * falloff * falloff;
    }

    let ao = clamp(1.0 - (occlusion / f32(sample_count)) * 2.4 * ssao.params.z, 0.12, 1.0);
    return vec4<f32>(ao, 0.0, 0.0, 1.0);
}

@fragment
fn fs_blur(input: VsOut) -> @location(0) vec4<f32> {
    let center_depth = sample_depth(input.uv);
    let center_ao = textureSample(ssao_tex, linear_sampler, input.uv).r;
    if center_depth >= 0.9999 {
        return vec4<f32>(1.0, 0.0, 0.0, 1.0);
    }
    let center_z = view_pos_from_depth(input.uv, center_depth).z;
    let step_uv = ssao.texel_size.xy * ssao.texel_size.zw;

    var total = center_ao * 0.28;
    var weight_sum = 0.28;
    let weights = array<f32, 3>(0.22, 0.10, 0.04);

    for (var k = 1; k <= 3; k = k + 1) {
        let w = weights[k - 1];
        for (var s = -1; s <= 1; s = s + 2) {
            let uv = clamp(input.uv + step_uv * f32(k * s), vec2<f32>(0.0), vec2<f32>(1.0));
            let d = sample_depth(uv);
            let z = view_pos_from_depth(uv, d).z;
            let depth_w = exp(-abs(z - center_z) * 1.6);
            let combined = w * depth_w;
            total += textureSample(ssao_tex, linear_sampler, uv).r * combined;
            weight_sum += combined;
        }
    }
    return vec4<f32>(total / max(weight_sum, 0.0001), 0.0, 0.0, 1.0);
}
