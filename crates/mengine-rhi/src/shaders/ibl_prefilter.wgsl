// GPU Cubemap IBL Compute Pipeline:
//   1. cs_equirect_to_cube : Equirectangular 2D -> 6-face Cubemap (mip 0)
//   2. cs_downsample_cube  : Box-filter mipmap chain on source Cubemap
//   3. cs_prefilter_ggx    : Filtered Importance Sampling GGX specular prefilter (zero fireflies!)
//   4. cs_irradiance_cube  : Cosine-weighted diffuse irradiance cubemap

const PI: f32 = 3.141592653589793;
const PREFILTER_SAMPLES: u32 = 128u;
const IRRADIANCE_SAMPLES: u32 = 256u;

struct IblUniforms {
    output_size: vec2<u32>,
    source_size: vec2<u32>,
    params: vec4<f32>, // x = roughness, y = source_mip_count, z = unused, w = unused
};

@group(0) @binding(0) var src_equirect: texture_2d<f32>;
@group(0) @binding(1) var src_cube: texture_cube<f32>;
@group(0) @binding(2) var env_sampler: sampler;
@group(0) @binding(3) var dst_cube: texture_storage_2d_array<rgba16float, write>;
@group(0) @binding(4) var<uniform> settings: IblUniforms;

fn cube_face_direction(face: u32, uv: vec2<f32>) -> vec3<f32> {
    let a = uv.x * 2.0 - 1.0;
    let b = 1.0 - uv.y * 2.0;
    switch face {
        case 0u: { return normalize(vec3<f32>( 1.0,  b, -a)); } // +X
        case 1u: { return normalize(vec3<f32>(-1.0,  b,  a)); } // -X
        case 2u: { return normalize(vec3<f32>( a,  1.0, -b)); } // +Y
        case 3u: { return normalize(vec3<f32>( a, -1.0,  b)); } // -Y
        case 4u: { return normalize(vec3<f32>( a,  b,  1.0)); } // +Z
        default: { return normalize(vec3<f32>(-a,  b, -1.0)); } // -Z
    }
}

fn direction_to_equirect_uv(dir: vec3<f32>) -> vec2<f32> {
    let d = normalize(dir);
    return vec2<f32>(
        atan2(d.z, d.x) / (2.0 * PI) + 0.5,
        acos(clamp(d.y, -1.0, 1.0)) / PI,
    );
}

fn radical_inverse_vdc(bits: u32) -> f32 {
    return f32(reverseBits(bits)) * 2.3283064365386963e-10;
}

fn build_basis(n: vec3<f32>) -> mat3x3<f32> {
    let up = select(vec3<f32>(0.0, 0.0, 1.0), vec3<f32>(1.0, 0.0, 0.0), abs(n.z) > 0.999);
    let t = normalize(cross(up, n));
    let b = cross(n, t);
    return mat3x3<f32>(t, b, n);
}

fn importance_sample_ggx(xi: vec2<f32>, basis: mat3x3<f32>, roughness: f32) -> vec3<f32> {
    let a = roughness * roughness;
    let a2 = a * a;
    let phi = 2.0 * PI * xi.x;
    let cos_theta = sqrt((1.0 - xi.y) / (1.0 + (a2 - 1.0) * xi.y));
    let sin_theta = sqrt(max(1.0 - cos_theta * cos_theta, 0.0));
    let h_local = vec3<f32>(cos(phi) * sin_theta, sin(phi) * sin_theta, cos_theta);
    return normalize(basis * h_local);
}

fn distribution_ggx(ndh: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let d = ndh * ndh * (a2 - 1.0) + 1.0;
    return a2 / max(PI * d * d, 0.000001);
}

fn cosine_sample_hemisphere(xi: vec2<f32>, basis: mat3x3<f32>) -> vec3<f32> {
    let phi = 2.0 * PI * xi.x;
    let r = sqrt(xi.y);
    let local = vec3<f32>(cos(phi) * r, sin(phi) * r, sqrt(max(1.0 - xi.y, 0.0)));
    return normalize(basis * local);
}

@compute @workgroup_size(8, 8, 1)
fn cs_equirect_to_cube(@builtin(global_invocation_id) gid: vec3<u32>) {
    if gid.x >= settings.output_size.x || gid.y >= settings.output_size.y || gid.z >= 6u {
        return;
    }
    let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(settings.output_size);
    let dir = cube_face_direction(gid.z, uv);
    let color = textureSampleLevel(src_equirect, env_sampler, direction_to_equirect_uv(dir), 0.0).rgb;
    textureStore(dst_cube, vec2<i32>(gid.xy), i32(gid.z), vec4<f32>(max(color, vec3<f32>(0.0)), 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn cs_downsample_cube(@builtin(global_invocation_id) gid: vec3<u32>) {
    if gid.x >= settings.output_size.x || gid.y >= settings.output_size.y || gid.z >= 6u {
        return;
    }
    let src_lod = settings.params.x;
    let texel = vec2<f32>(1.0) / vec2<f32>(settings.output_size);
    let center = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) * texel;
    let offsets = array<vec2<f32>, 4>(
        vec2<f32>(-0.25, -0.25),
        vec2<f32>( 0.25, -0.25),
        vec2<f32>(-0.25,  0.25),
        vec2<f32>( 0.25,  0.25),
    );
    var sum = vec3<f32>(0.0);
    for (var i = 0u; i < 4u; i = i + 1u) {
        let dir = cube_face_direction(gid.z, center + offsets[i] * texel);
        sum += textureSampleLevel(src_cube, env_sampler, dir, src_lod).rgb;
    }
    textureStore(dst_cube, vec2<i32>(gid.xy), i32(gid.z), vec4<f32>(sum * 0.25, 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn cs_prefilter_ggx(@builtin(global_invocation_id) gid: vec3<u32>) {
    if gid.x >= settings.output_size.x || gid.y >= settings.output_size.y || gid.z >= 6u {
        return;
    }
    let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(settings.output_size);
    let n = cube_face_direction(gid.z, uv);
    let v = n;
    let roughness = clamp(settings.params.x, 0.0, 1.0);
    let max_src_lod = max(settings.params.y - 1.0, 0.0);

    if roughness <= 0.002 {
        let col = textureSampleLevel(src_cube, env_sampler, n, 0.0).rgb;
        textureStore(dst_cube, vec2<i32>(gid.xy), i32(gid.z), vec4<f32>(col, 1.0));
        return;
    }

    let basis = build_basis(n);
    let src_res = f32(max(settings.source_size.x, 1u));
    let sa_texel = 4.0 * PI / (6.0 * src_res * src_res);

    var radiance = vec3<f32>(0.0);
    var total_weight = 0.0;

    for (var i = 0u; i < PREFILTER_SAMPLES; i = i + 1u) {
        let xi = vec2<f32>(f32(i) / f32(PREFILTER_SAMPLES), radical_inverse_vdc(i));
        let h = importance_sample_ggx(xi, basis, roughness);
        let l = normalize(2.0 * dot(v, h) * h - v);
        let ndl = max(dot(n, l), 0.0);
        if ndl > 0.0 {
            let ndh = max(dot(n, h), 0.0);
            let hdv = max(dot(h, v), 0.0);
            let d = distribution_ggx(ndh, roughness);
            let pdf = max(d * ndh / max(4.0 * hdv, 0.0001), 0.0001);
            let sa_sample = 1.0 / (f32(PREFILTER_SAMPLES) * pdf);
            let mip_level = clamp(0.5 * log2(sa_sample / sa_texel) + 0.5, 0.0, max_src_lod);
            radiance += textureSampleLevel(src_cube, env_sampler, l, mip_level).rgb * ndl;
            total_weight += ndl;
        }
    }

    let fallback = textureSampleLevel(src_cube, env_sampler, n, max_src_lod).rgb;
    let result = select(fallback, radiance / max(total_weight, 0.00001), total_weight > 0.0);
    textureStore(dst_cube, vec2<i32>(gid.xy), i32(gid.z), vec4<f32>(result, 1.0));
}

@compute @workgroup_size(8, 8, 1)
fn cs_irradiance_cube(@builtin(global_invocation_id) gid: vec3<u32>) {
    if gid.x >= settings.output_size.x || gid.y >= settings.output_size.y || gid.z >= 6u {
        return;
    }
    let uv = (vec2<f32>(gid.xy) + vec2<f32>(0.5)) / vec2<f32>(settings.output_size);
    let n = cube_face_direction(gid.z, uv);
    let basis = build_basis(n);
    let sample_lod = max(settings.params.y - 3.0, 0.0);

    var irradiance = vec3<f32>(0.0);
    for (var i = 0u; i < IRRADIANCE_SAMPLES; i = i + 1u) {
        let xi = vec2<f32>(f32(i) / f32(IRRADIANCE_SAMPLES), radical_inverse_vdc(i));
        let l = cosine_sample_hemisphere(xi, basis);
        irradiance += textureSampleLevel(src_cube, env_sampler, l, sample_lod).rgb;
    }
    irradiance /= f32(IRRADIANCE_SAMPLES);
    textureStore(dst_cube, vec2<i32>(gid.xy), i32(gid.z), vec4<f32>(irradiance, 1.0));
}
