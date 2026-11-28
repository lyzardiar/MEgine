// MEgine Next-Gen Forward+ Multi-Model Shader
// Supports:
//   - ShadingModel 0: Multi-Scattering PBR (Metallic-Roughness + Clearcoat + Cubemap IBL)
//   - ShadingModel 1: Stylized Toon / Cel Shading (banded ramp, shadow tint, cel specular, rim light)
//   - ShadingModel 2: Standard 3D Game Shading (Half-Lambert + normalized Blinn-Phong + hemisphere fill)
//   - ShadingModel 3: Unlit / 2D-in-3D
//   - 4-Cascade CSM with 16-tap rotated Poisson PCF, cascade blending & distance fade
//   - Dynamic 64 Point Lights + 64 Spot Lights via Storage Buffer with physical window attenuation
//   - Exponential Height & Distance Atmospheric Fog with solar Mie in-scattering
//   - Safe normal mapping (zero-cost skip when unused) + negative-scale handedness correction

const PI: f32 = 3.141592653589793;
const CASCADE_COUNT: u32 = 4u;

struct PointLightGpu {
    position_range: vec4<f32>,
    color_intensity: vec4<f32>,
};

struct SpotLightGpu {
    position_range: vec4<f32>,
    direction_inner: vec4<f32>,
    color_intensity: vec4<f32>,
    params: vec4<f32>, // x = outer_cos
};

struct LightBuffer {
    points: array<PointLightGpu, 64>,
    spots: array<SpotLightGpu, 64>,
};

struct GlobalUniforms {
    view_proj: mat4x4<f32>,
    view: mat4x4<f32>,
    camera_position: vec4<f32>,
    environment_sky: vec4<f32>,
    environment_equator: vec4<f32>,
    environment_ground: vec4<f32>,
    environment_params: vec4<f32>,         // x=diffuse_int, y=spec_int, z=rotation_rad, w=unused
    environment_texture_params: vec4<f32>, // x=has_cubemap, y=max_lod, z=unused, w=unused
    directional_direction: vec4<f32>,      // xyz=light travel dir, w=unused
    directional_color: vec4<f32>,          // rgb=color, a=intensity
    fog_color_density: vec4<f32>,          // rgb=fog_color, a=fog_density
    fog_params: vec4<f32>,                 // x=height_falloff, y=height_offset, z=max_opacity, w=sun_scatter
    light_counts: vec4<u32>,               // x=has_dir, y=point_count, z=spot_count, w=unused
};

struct ObjectUniforms {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    base_color: vec4<f32>,
    material: vec4<f32>,         // x=metallic, y=roughness, z=emissive_strength, w=shading_model (0=PBR,1=Toon,2=Standard,3=Unlit)
    emissive: vec4<f32>,         // rgb=emissive, w=alpha_cutoff
    texture_transform: vec4<f32>,
    map_params: vec4<f32>,       // x=normal_scale, y=occlusion_strength, z=uv_rot_rad, w=blend_mode
    layer_params: vec4<f32>,     // x=clearcoat, y=clearcoat_roughness, z=dielectric_f0, w=opaque_flag
    shadow_params: vec4<f32>,    // x=receive_shadows, y=negative_scale_flag, z=has_normal_map, w=unused
    toon_params: vec4<f32>,      // x=steps, y=smoothness, z=specular_size, w=rim_power
    toon_shadow_tint: vec4<f32>, // rgb=shadow tint color, w=tint_strength
    toon_rim_color: vec4<f32>,   // rgb=rim color, w=rim_intensity
    custom_parameters: array<vec4<f32>, 16>,
};

struct ShadowUniforms {
    light_view_proj: array<mat4x4<f32>, 4>,
    split_depths: vec4<f32>,     // view-space far distance for cascades 0..3
    cascade_biases: vec4<f32>,   // world-space normal bias scale per cascade
    params: vec4<f32>,           // x=strength, y=depth_bias, z=normal_bias, w=enabled
    texel_size: vec4<f32>,       // xy=1/shadow_size, z=fade_start, w=max_distance
};

@group(0) @binding(0) var<uniform> frame: GlobalUniforms;
@group(0) @binding(1) var<uniform> object: ObjectUniforms;
@group(0) @binding(2) var<storage, read> lights: LightBuffer;

@group(1) @binding(0) var base_color_texture: texture_2d<f32>;
@group(1) @binding(1) var normal_texture: texture_2d<f32>;
@group(1) @binding(2) var metallic_roughness_texture: texture_2d<f32>;
@group(1) @binding(3) var emissive_texture: texture_2d<f32>;
@group(1) @binding(4) var occlusion_texture: texture_2d<f32>;
@group(1) @binding(5) var material_sampler: sampler;
@group(1) @binding(6) var mengine_custom_texture_0: texture_2d<f32>;
@group(1) @binding(7) var mengine_custom_texture_1: texture_2d<f32>;
@group(1) @binding(8) var mengine_custom_texture_2: texture_2d<f32>;
@group(1) @binding(9) var mengine_custom_texture_3: texture_2d<f32>;
@group(1) @binding(10) var mengine_custom_texture_4: texture_2d<f32>;
@group(1) @binding(11) var mengine_custom_texture_5: texture_2d<f32>;

@group(2) @binding(0) var<uniform> shadow: ShadowUniforms;
@group(2) @binding(1) var directional_shadow_map: texture_depth_2d_array;
@group(2) @binding(2) var directional_shadow_sampler: sampler_comparison;

@group(3) @binding(0) var environment_cubemap: texture_cube<f32>;
@group(3) @binding(1) var environment_sampler: sampler;
@group(3) @binding(2) var brdf_lut: texture_2d<f32>;
@group(3) @binding(3) var brdf_lut_sampler: sampler;
@group(3) @binding(4) var environment_irradiance: texture_cube<f32>;

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct VsOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) @interpolate(perspective, centroid) world_position: vec3<f32>,
    @location(1) @interpolate(perspective, centroid) world_normal: vec3<f32>,
    @location(2) @interpolate(perspective, centroid) uv: vec2<f32>,
};

@vertex
fn vs_main(v: VsIn) -> VsOut {
    var o: VsOut;
    let world = object.model * vec4<f32>(v.position, 1.0);
    o.clip = frame.view_proj * world;
    o.world_position = world.xyz;
    let raw_normal = (object.normal_matrix * vec4<f32>(v.normal, 0.0)).xyz;
    o.world_normal = normalize(raw_normal);
    let scaled_uv = v.uv * object.texture_transform.xy;
    let center = object.texture_transform.xy * 0.5;
    let angle = object.map_params.z;
    let rotation = mat2x2<f32>(cos(angle), sin(angle), -sin(angle), cos(angle));
    o.uv = rotation * (scaled_uv - center) + center + object.texture_transform.zw;
    return o;
}

// --------------------------------------------------------------------------- BRDF (Multi-Scattering GGX)

fn distribution_ggx(ndh: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let d = ndh * ndh * (a2 - 1.0) + 1.0;
    return a2 / max(PI * d * d, 0.000001);
}

// Height-correlated Smith-GGX visibility term V = G / (4 * ndv * ndl)
fn visibility_smith_ggx_correlated(ndv: f32, ndl: f32, roughness: f32) -> f32 {
    let a = roughness * roughness;
    let a2 = a * a;
    let ggxv = ndl * sqrt(ndv * ndv * (1.0 - a2) + a2);
    let ggxl = ndv * sqrt(ndl * ndl * (1.0 - a2) + a2);
    return 0.5 / max(ggxv + ggxl, 0.00001);
}

fn fresnel_schlick(cos_theta: f32, f0: vec3<f32>) -> vec3<f32> {
    let f = pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
    return f0 + (vec3<f32>(1.0) - f0) * f;
}

fn fresnel_schlick_roughness(cos_theta: f32, f0: vec3<f32>, roughness: f32) -> vec3<f32> {
    let grazing = max(vec3<f32>(1.0 - roughness), f0);
    let f = pow(clamp(1.0 - cos_theta, 0.0, 1.0), 5.0);
    return f0 + (grazing - f0) * f;
}

// --------------------------------------------------------------------------- Environment / Cubemap IBL

fn analytic_environment_radiance(direction: vec3<f32>) -> vec3<f32> {
    let y = clamp(direction.y, -1.0, 1.0);
    if y >= 0.0 {
        return mix(frame.environment_equator.rgb, frame.environment_sky.rgb, pow(y, 0.65));
    }
    return mix(frame.environment_equator.rgb, frame.environment_ground.rgb, pow(-y, 0.65));
}

fn rotate_environment_direction(direction: vec3<f32>) -> vec3<f32> {
    let angle = frame.environment_params.z;
    let s = sin(angle);
    let c = cos(angle);
    return vec3<f32>(
        c * direction.x + s * direction.z,
        direction.y,
        -s * direction.x + c * direction.z,
    );
}

fn environment_radiance(direction: vec3<f32>, roughness: f32) -> vec3<f32> {
    let rotated = normalize(rotate_environment_direction(direction));
    if frame.environment_texture_params.x < 0.5 {
        return analytic_environment_radiance(rotated);
    }
    let lod = clamp(roughness, 0.0, 1.0) * frame.environment_texture_params.y;
    return textureSampleLevel(environment_cubemap, environment_sampler, rotated, lod).rgb;
}

fn environment_diffuse_radiance(direction: vec3<f32>) -> vec3<f32> {
    let rotated = normalize(rotate_environment_direction(direction));
    if frame.environment_texture_params.x < 0.5 {
        return analytic_environment_radiance(rotated);
    }
    return textureSampleLevel(environment_irradiance, environment_sampler, rotated, 0.0).rgb;
}

// Multi-scattering energy-conserving IBL (Fdez-Agüera 2019).
fn environment_contribution(
    n: vec3<f32>,
    v: vec3<f32>,
    base_color: vec3<f32>,
    metallic: f32,
    roughness: f32,
    occlusion: f32,
    dielectric_f0: f32,
) -> vec3<f32> {
    let f0 = mix(vec3<f32>(dielectric_f0), base_color, metallic);
    let ndv = clamp(dot(n, v), 0.0001, 1.0);
    let brdf = textureSampleLevel(brdf_lut, brdf_lut_sampler, vec2<f32>(ndv, roughness), 0.0).rg;

    // Single-scattering + multi-scattering energy compensation
    let fss_ess = f0 * brdf.x + vec3<f32>(brdf.y);
    let ess = brdf.x + brdf.y;
    let ems = max(1.0 - ess, 0.0);
    let f_avg = f0 + (vec3<f32>(1.0) - f0) / 21.0;
    let fms_ems = fss_ess * f_avg / max(vec3<f32>(1.0) - f_avg * ems, vec3<f32>(0.001)) * ems;

    let reflection = reflect(-v, n);
    let analytic_blur = 1.0 - frame.environment_texture_params.x;
    let spec_dir = normalize(mix(reflection, n, roughness * roughness * analytic_blur));
    let radiance = environment_radiance(spec_dir, roughness);
    let irradiance = environment_diffuse_radiance(n);

    let specular = radiance * (fss_ess + fms_ems) * frame.environment_params.y;
    let kd = (vec3<f32>(1.0) - (fss_ess + fms_ems)) * (1.0 - metallic);
    let diffuse = irradiance * kd * base_color * frame.environment_params.x;

    // Horizon specular occlusion to prevent light leaking under rough floors
    let spec_occ = clamp(pow(ndv + occlusion, exp2(-16.0 * roughness - 1.0)) - 1.0 + occlusion, 0.0, 1.0);
    return diffuse * occlusion + specular * spec_occ;
}

fn layered_environment_contribution(
    n: vec3<f32>,
    v: vec3<f32>,
    base_color: vec3<f32>,
    metallic: f32,
    roughness: f32,
    occlusion: f32,
    dielectric_f0: f32,
    clearcoat: f32,
    clearcoat_roughness: f32,
) -> vec3<f32> {
    let base = environment_contribution(n, v, base_color, metallic, roughness, occlusion, dielectric_f0);
    let amount = clamp(clearcoat, 0.0, 1.0);
    if amount <= 0.0 {
        return base;
    }
    let coat_rough = clamp(clearcoat_roughness, 0.04, 1.0);
    let ndv = clamp(dot(n, v), 0.0001, 1.0);
    let coat_f = fresnel_schlick_roughness(ndv, vec3<f32>(0.04), coat_rough).x * amount;
    let brdf = textureSampleLevel(brdf_lut, brdf_lut_sampler, vec2<f32>(ndv, coat_rough), 0.0).rg;
    let refl = reflect(-v, n);
    let coat_spec = environment_radiance(refl, coat_rough)
        * (vec3<f32>(0.04) * brdf.x + vec3<f32>(brdf.y))
        * frame.environment_params.y * amount;
    return base * (1.0 - coat_f) + coat_spec;
}

// --------------------------------------------------------------------------- Direct Lighting Models

fn pbr_light_contribution(
    n: vec3<f32>,
    v: vec3<f32>,
    l: vec3<f32>,
    radiance: vec3<f32>,
    base_color: vec3<f32>,
    metallic: f32,
    roughness: f32,
    dielectric_f0: f32,
    clearcoat: f32,
    clearcoat_roughness: f32,
) -> vec3<f32> {
    let ndl = max(dot(n, l), 0.0);
    let ndv = clamp(dot(n, v), 0.0001, 1.0);
    if ndl <= 0.0 {
        return vec3<f32>(0.0);
    }
    let h = normalize(l + v);
    let ndh = max(dot(n, h), 0.0);
    let vdh = max(dot(v, h), 0.0);

    let f0 = mix(vec3<f32>(dielectric_f0), base_color, metallic);
    let f = fresnel_schlick(vdh, f0);
    let d = distribution_ggx(ndh, roughness);
    let vis = visibility_smith_ggx_correlated(ndv, ndl, roughness);

    // Multi-scattering compensation factor on direct specular
    let brdf = textureSampleLevel(brdf_lut, brdf_lut_sampler, vec2<f32>(ndv, roughness), 0.0).rg;
    let ess = max(brdf.x + brdf.y, 0.05);
    let energy_comp = vec3<f32>(1.0) + f0 * (1.0 / ess - 1.0);

    let spec = d * vis * f * energy_comp;
    let kd = (vec3<f32>(1.0) - f) * (1.0 - metallic);
    var out = (kd * base_color / PI + spec) * radiance * ndl;

    let amount = clamp(clearcoat, 0.0, 1.0);
    if amount > 0.0 {
        let cr = clamp(clearcoat_roughness, 0.04, 1.0);
        let fc = fresnel_schlick(vdh, vec3<f32>(0.04)).x * amount;
        let dc = distribution_ggx(ndh, cr);
        let vc = visibility_smith_ggx_correlated(ndv, ndl, cr);
        out = out * (1.0 - fc) + vec3<f32>(dc * vc * fc) * radiance * ndl;
    }
    return out;
}

// Stylized Cel / Toon Shading Model (ShadingModel = 1)
fn toon_light_contribution(
    n: vec3<f32>,
    v: vec3<f32>,
    l: vec3<f32>,
    radiance: vec3<f32>,
    shadow_vis: f32,
    base_color: vec3<f32>,
    metallic: f32,
    roughness: f32,
) -> vec3<f32> {
    let steps = max(round(object.toon_params.x), 1.0);
    let smoothness = clamp(object.toon_params.y, 0.005, 0.45);
    let spec_size = clamp(object.toon_params.z, 0.01, 0.95);
    let rim_power = max(object.toon_params.w, 0.5);

    let half_lambert = dot(n, l) * 0.5 + 0.5;
    let lit_raw = clamp(half_lambert * mix(0.25, 1.0, shadow_vis), 0.0, 1.0);

    // Smoothly quantized stepped cel ramp
    var ramp = 0.0;
    if steps <= 1.5 {
        ramp = smoothstep(0.48 - smoothness, 0.48 + smoothness, lit_raw);
    } else {
        let scaled = lit_raw * steps;
        let band = floor(scaled);
        let frac = fract(scaled);
        ramp = clamp((band + smoothstep(0.5 - smoothness, 0.5 + smoothness, frac)) / steps, 0.0, 1.0);
    }

    let shadow_tint = mix(vec3<f32>(0.24, 0.28, 0.42), object.toon_shadow_tint.rgb, clamp(object.toon_shadow_tint.w, 0.0, 1.0));
    let shaded_albedo = mix(base_color * shadow_tint, base_color, ramp);

    // Crisp stylized cel specular
    let h = normalize(l + v);
    let ndh = max(dot(n, h), 0.0);
    let spec_threshold = mix(0.995, 0.72, spec_size * (0.4 + 0.6 * (1.0 - roughness)));
    let spec_band = smoothstep(spec_threshold - 0.012, spec_threshold + 0.012, ndh) * shadow_vis * step(0.0, dot(n, l));
    let spec_color = mix(vec3<f32>(1.0), base_color, metallic) * (0.35 + 0.65 * (1.0 - roughness));

    // Directional Fresnel rim light (masked off flat upward-facing ground planes so terrain stays clean)
    let ndv = clamp(dot(n, v), 0.0, 1.0);
    let non_ground = 1.0 - smoothstep(0.76, 0.96, n.y);
    let rim_raw = pow(1.0 - ndv, max(rim_power, 3.0)) * non_ground * smoothstep(-0.05, 0.45, dot(n, l)) * mix(0.25, 1.0, shadow_vis);
    let rim_mask = smoothstep(0.46, 0.62, rim_raw);
    let rim = object.toon_rim_color.rgb * object.toon_rim_color.w * rim_mask;

    return (shaded_albedo / PI * 1.15 + spec_color * spec_band * 0.45) * radiance + rim * radiance * 0.45;
}

// Standard 3D Game Shading Model (ShadingModel = 2): clean Half-Lambert + normalized Blinn-Phong
fn standard_light_contribution(
    n: vec3<f32>,
    v: vec3<f32>,
    l: vec3<f32>,
    radiance: vec3<f32>,
    shadow_vis: f32,
    base_color: vec3<f32>,
    metallic: f32,
    roughness: f32,
) -> vec3<f32> {
    let ndl = dot(n, l);
    let wrap = clamp(ndl * 0.65 + 0.35, 0.0, 1.0);
    let diffuse = base_color * (1.0 - metallic * 0.7) * wrap * mix(0.18, 1.0, shadow_vis) / PI;

    let h = normalize(l + v);
    let ndh = max(dot(n, h), 0.0);
    let shininess = mix(128.0, 6.0, roughness * roughness);
    let norm = (shininess + 8.0) / (8.0 * PI);
    let spec_col = mix(vec3<f32>(0.08), base_color, metallic);
    let spec = spec_col * pow(ndh, shininess) * norm * max(ndl, 0.0) * shadow_vis;

    return (diffuse + spec) * radiance;
}

// Physical inverse-square attenuation with smooth range window (Karis / Epic).
fn physical_distance_attenuation(dist: f32, range: f32) -> f32 {
    let r = max(range, 0.01);
    let inv_d2 = 1.0 / max(dist * dist, 0.04);
    let ratio = dist / r;
    let ratio2 = ratio * ratio;
    let window = clamp(1.0 - ratio2 * ratio2, 0.0, 1.0);
    return inv_d2 * window * window;
}

// --------------------------------------------------------------------------- Safe Tangent Frame

fn mapped_normal(
    geometric_normal: vec3<f32>,
    world_position: vec3<f32>,
    uv: vec2<f32>,
    encoded_normal: vec3<f32>,
    scale: f32,
) -> vec3<f32> {
    let dp1 = dpdx(world_position);
    let dp2 = dpdy(world_position);
    let duv1 = dpdx(uv);
    let duv2 = dpdy(uv);

    let dp2perp = cross(dp2, geometric_normal);
    let dp1perp = cross(geometric_normal, dp1);
    let t_raw = dp2perp * duv1.x + dp1perp * duv2.x;
    let b_raw = dp2perp * duv1.y + dp1perp * duv2.y;

    let max_len2 = max(dot(t_raw, t_raw), dot(b_raw, b_raw));
    if max_len2 < 1e-10 {
        return geometric_normal;
    }
    let inv_max = inverseSqrt(max_len2);
    let tangent = t_raw * inv_max;
    let bitangent = b_raw * inv_max;

    var tn = encoded_normal * 2.0 - vec3<f32>(1.0);
    tn.x *= scale;
    tn.y *= scale;
    return normalize(tangent * tn.x + bitangent * tn.y + geometric_normal * tn.z);
}

// --------------------------------------------------------------------------- 4-Cascade CSM + 16-tap Rotated Poisson PCF

const POISSON_DISK: array<vec2<f32>, 16> = array<vec2<f32>, 16>(
    vec2<f32>(-0.94201624, -0.39906216),
    vec2<f32>( 0.94558609, -0.76890725),
    vec2<f32>(-0.09418410, -0.92938870),
    vec2<f32>( 0.34495938,  0.29387760),
    vec2<f32>(-0.91588581,  0.45771432),
    vec2<f32>(-0.81544232, -0.87912464),
    vec2<f32>(-0.38277543,  0.27676845),
    vec2<f32>( 0.97484398,  0.75648379),
    vec2<f32>( 0.44323325, -0.97511554),
    vec2<f32>( 0.53742981, -0.47373420),
    vec2<f32>(-0.26496911, -0.41893023),
    vec2<f32>( 0.79197514,  0.19090188),
    vec2<f32>(-0.24188840,  0.99706507),
    vec2<f32>(-0.81409955,  0.91437590),
    vec2<f32>( 0.19984126,  0.78641367),
    vec2<f32>( 0.14383161, -0.14100790),
);

fn interleaved_gradient_noise(screen_xy: vec2<f32>) -> f32 {
    return fract(52.9829189 * fract(dot(screen_xy, vec2<f32>(0.06711056, 0.00583715))));
}

fn sample_cascade(
    cascade_idx: u32,
    world_position: vec3<f32>,
    world_normal: vec3<f32>,
    light_dir: vec3<f32>,
    screen_xy: vec2<f32>,
) -> f32 {
    let ndl = clamp(dot(world_normal, light_dir), 0.0, 1.0);
    let slope_factor = clamp(1.0 - ndl, 0.0, 1.0);
    let cascade_scale = shadow.cascade_biases[cascade_idx];

    let normal_offset = world_normal * (shadow.params.z * cascade_scale * (0.45 + 1.35 * slope_factor));
    let biased_pos = world_position + normal_offset;
    let clip = shadow.light_view_proj[cascade_idx] * vec4<f32>(biased_pos, 1.0);
    let proj = clip.xyz / clip.w;
    if proj.x < -0.995 || proj.x > 0.995 || proj.y < -0.995 || proj.y > 0.995 || proj.z < 0.0 || proj.z > 1.0 {
        return 1.0;
    }
    let uv = proj.xy * vec2<f32>(0.5, -0.5) + vec2<f32>(0.5);
    let depth_bias = shadow.params.y * (0.35 + 1.65 * slope_factor);
    let ref_depth = clamp(proj.z - depth_bias, 0.0, 1.0);

    let angle = interleaved_gradient_noise(screen_xy) * 2.0 * PI;
    let rot_s = sin(angle);
    let rot_c = cos(angle);
    let filter_radius = shadow.texel_size.xy * (1.35 + f32(cascade_idx) * 0.45);

    var vis = 0.0;
    for (var s = 0u; s < 16u; s = s + 1u) {
        let disk = POISSON_DISK[s];
        let rotated = vec2<f32>(disk.x * rot_c - disk.y * rot_s, disk.x * rot_s + disk.y * rot_c);
        vis += textureSampleCompareLevel(
            directional_shadow_map,
            directional_shadow_sampler,
            uv + rotated * filter_radius,
            i32(cascade_idx),
            ref_depth,
        );
    }
    return vis / 16.0;
}

fn directional_shadow_visibility(
    world_position: vec3<f32>,
    world_normal: vec3<f32>,
    light_dir: vec3<f32>,
    screen_xy: vec2<f32>,
) -> f32 {
    if shadow.params.w < 0.5 || object.shadow_params.x < 0.5 {
        return 1.0;
    }
    let view_pos = frame.view * vec4<f32>(world_position, 1.0);
    let view_depth = max(-view_pos.z, 0.0);
    if view_depth >= shadow.texel_size.w {
        return 1.0;
    }

    var cascade: u32 = 3u;
    if view_depth < shadow.split_depths.x {
        cascade = 0u;
    } else if view_depth < shadow.split_depths.y {
        cascade = 1u;
    } else if view_depth < shadow.split_depths.z {
        cascade = 2u;
    }

    var vis = sample_cascade(cascade, world_position, world_normal, light_dir, screen_xy);

    // Smooth blend across cascade boundaries (last 12% of each split)
    if cascade < 3u {
        let split_far = shadow.split_depths[cascade];
        let split_near = select(0.0, shadow.split_depths[cascade - 1u], cascade > 0u);
        let blend_width = max((split_far - split_near) * 0.14, 0.5);
        let blend_t = smoothstep(split_far - blend_width, split_far, view_depth);
        if blend_t > 0.001 {
            let next_vis = sample_cascade(cascade + 1u, world_position, world_normal, light_dir, screen_xy);
            vis = mix(vis, next_vis, blend_t);
        }
    }

    // Smooth fade-out approaching max shadow distance
    let fade = 1.0 - smoothstep(shadow.texel_size.z, shadow.texel_size.w, view_depth);
    return mix(1.0, vis, shadow.params.x * fade);
}

// --------------------------------------------------------------------------- Atmospheric Height Fog

fn apply_atmospheric_fog(color: vec3<f32>, world_position: vec3<f32>) -> vec3<f32> {
    let density = frame.fog_color_density.a;
    if density <= 0.00001 {
        return color;
    }
    let to_pixel = world_position - frame.camera_position.xyz;
    let dist = length(to_pixel);
    let ray_dir = to_pixel / max(dist, 0.0001);

    let height_falloff = max(frame.fog_params.x, 0.001);
    let height_offset = frame.fog_params.y;
    let h0 = max(frame.camera_position.y - height_offset, 0.0);
    let h1 = max(world_position.y - height_offset, 0.0);
    let avg_h = 0.5 * (h0 + h1);
    let height_factor = exp(-avg_h * height_falloff);

    let optical_depth = density * dist * height_factor;
    let fog_amount = clamp((1.0 - exp(-optical_depth)), 0.0, clamp(frame.fog_params.z, 0.0, 1.0));

    var fog_col = frame.fog_color_density.rgb;
    if frame.light_counts.x > 0u && frame.fog_params.w > 0.0 {
        let sun_dir = normalize(-frame.directional_direction.xyz);
        let sun_align = max(dot(ray_dir, sun_dir), 0.0);
        let inscatter = pow(sun_align, 8.0) * frame.fog_params.w;
        fog_col = mix(fog_col, frame.directional_color.rgb * max(frame.directional_color.a * 0.45, 0.6), clamp(inscatter, 0.0, 0.85));
    }
    return mix(color, fog_col, fog_amount);
}

// --------------------------------------------------------------------------- Surface Shader Hooks

struct MEngineSurface {
    base_color: vec3<f32>,
    alpha: f32,
    normal: vec3<f32>,
    metallic: f32,
    roughness: f32,
    occlusion: f32,
    emissive: vec3<f32>,
};

// MENGINE_SURFACE_HOOK_BEGIN
const MENGINE_HAS_LIT_SURFACE_HOOK: bool = false;
fn mengine_surface_hook(
    color: vec4<f32>,
    uv: vec2<f32>,
    world_position: vec3<f32>,
    world_normal: vec3<f32>,
) -> vec4<f32> {
    return color;
}
fn mengine_lit_surface_hook(
    surface: MEngineSurface,
    uv: vec2<f32>,
    world_position: vec3<f32>,
) -> MEngineSurface {
    return surface;
}
// MENGINE_SURFACE_HOOK_END

fn material_output(color: vec3<f32>, alpha: f32) -> vec4<f32> {
    let coverage_alpha = select(alpha, 1.0, object.layer_params.w > 0.5);
    if object.map_params.w > 0.5 && object.map_params.w < 1.5 {
        return vec4<f32>(color * coverage_alpha, coverage_alpha);
    }
    return vec4<f32>(color, coverage_alpha);
}

@fragment
fn fs_main(i: VsOut, @builtin(front_facing) front_facing: bool) -> @location(0) vec4<f32> {
    let sampled_color = textureSample(base_color_texture, material_sampler, i.uv);
    let sampled_normal = textureSample(normal_texture, material_sampler, i.uv).rgb;
    let sampled_orm = textureSample(metallic_roughness_texture, material_sampler, i.uv).rgb;
    let sampled_emissive = textureSample(emissive_texture, material_sampler, i.uv).rgb;
    let sampled_occlusion = textureSample(occlusion_texture, material_sampler, i.uv).r;

    let surface_color = object.base_color * sampled_color;
    let authored_base_color = max(surface_color.rgb, vec3<f32>(0.0));
    let authored_metallic = clamp(object.material.x * sampled_orm.b, 0.0, 1.0);
    let authored_roughness = clamp(object.material.y * sampled_orm.g, 0.04, 1.0);
    let authored_occlusion = mix(1.0, sampled_occlusion, clamp(object.map_params.y, 0.0, 1.0));
    let authored_emissive = max(object.emissive.rgb, vec3<f32>(0.0))
        * object.material.z
        * sampled_emissive;

    // Account for negative-determinant mirrored transforms so front/back normal polarity stays accurate.
    let mirrored = object.shadow_params.y > 0.5;
    let effective_front = select(front_facing, !front_facing, mirrored);
    let geom_normal = normalize(i.world_normal);
    let face_normal = select(-geom_normal, geom_normal, effective_front);

    // Only perturb normal via screen-space TBN when an actual normal map is bound.
    var n = face_normal;
    if object.shadow_params.z > 0.5 && object.map_params.x > 0.0001 {
        n = mapped_normal(face_normal, i.world_position, i.uv, sampled_normal, object.map_params.x);
    }

    var surface = MEngineSurface(
        authored_base_color,
        surface_color.a,
        n,
        authored_metallic,
        authored_roughness,
        authored_occlusion,
        authored_emissive,
    );
    if MENGINE_HAS_LIT_SURFACE_HOOK {
        surface = mengine_lit_surface_hook(surface, i.uv, i.world_position);
    }
    surface.base_color = max(surface.base_color, vec3<f32>(0.0));
    surface.alpha = clamp(surface.alpha, 0.0, 1.0);
    surface.metallic = clamp(surface.metallic, 0.0, 1.0);
    surface.roughness = clamp(surface.roughness, 0.04, 1.0);
    surface.occlusion = clamp(surface.occlusion, 0.0, 1.0);
    surface.emissive = max(surface.emissive, vec3<f32>(0.0));
    if dot(surface.normal, surface.normal) > 0.000001 {
        surface.normal = normalize(surface.normal);
    } else {
        surface.normal = face_normal;
    }

    if object.emissive.w > 0.0 && surface.alpha < object.emissive.w {
        discard;
    }

    let shading_model = u32(round(object.material.w));

    // ShadingModel 3: Unlit / 2D-in-3D
    if shading_model >= 3u {
        let unlit_surface = mengine_surface_hook(
            vec4<f32>(surface.base_color + surface.emissive, surface.alpha),
            i.uv,
            i.world_position,
            surface.normal,
        );
        return material_output(unlit_surface.rgb, unlit_surface.a);
    }

    let v = normalize(frame.camera_position.xyz - i.world_position);
    let clearcoat = clamp(object.layer_params.x, 0.0, 1.0);
    let clearcoat_roughness = clamp(object.layer_params.y, 0.04, 1.0);
    let dielectric_f0 = clamp(object.layer_params.z, 0.0, 1.0);

    // Ambient / IBL term per shading model
    var color = vec3<f32>(0.0);
    if shading_model == 0u {
        color = layered_environment_contribution(
            surface.normal, v, surface.base_color, surface.metallic,
            surface.roughness, surface.occlusion, dielectric_f0, clearcoat, clearcoat_roughness,
        );
    } else if shading_model == 1u {
        // Soft non-crushing ambient base for cel shading
        let env_irr = environment_diffuse_radiance(surface.normal) * frame.environment_params.x;
        color = env_irr * surface.base_color * 0.38 * surface.occlusion;
    } else {
        // Standard 3D game ambient fill
        let env_irr = environment_diffuse_radiance(surface.normal) * frame.environment_params.x;
        color = env_irr * surface.base_color * 0.65 * surface.occlusion;
    }

    // Main directional sunlight with 4-cascade CSM
    if frame.light_counts.x > 0u {
        let l = normalize(-frame.directional_direction.xyz);
        let radiance = frame.directional_color.rgb * frame.directional_color.a;
        let vis = directional_shadow_visibility(i.world_position, surface.normal, l, i.clip.xy);
        if shading_model == 0u {
            color += vis * pbr_light_contribution(
                surface.normal, v, l, radiance,
                surface.base_color, surface.metallic, surface.roughness,
                dielectric_f0, clearcoat, clearcoat_roughness,
            );
        } else if shading_model == 1u {
            color += toon_light_contribution(
                surface.normal, v, l, radiance, vis,
                surface.base_color, surface.metallic, surface.roughness,
            );
        } else {
            color += standard_light_contribution(
                surface.normal, v, l, radiance, vis,
                surface.base_color, surface.metallic, surface.roughness,
            );
        }
    }

    // Dynamic point lights (up to 64)
    let point_count = min(frame.light_counts.y, 64u);
    for (var idx = 0u; idx < point_count; idx = idx + 1u) {
        let light = lights.points[idx];
        let to_light = light.position_range.xyz - i.world_position;
        let dist = length(to_light);
        if dist >= light.position_range.w {
            continue;
        }
        let atten = physical_distance_attenuation(dist, light.position_range.w);
        let l = to_light / max(dist, 0.0001);
        let radiance = light.color_intensity.rgb * light.color_intensity.a * atten;
        if shading_model == 0u {
            color += pbr_light_contribution(
                surface.normal, v, l, radiance,
                surface.base_color, surface.metallic, surface.roughness,
                dielectric_f0, clearcoat, clearcoat_roughness,
            );
        } else if shading_model == 1u {
            color += toon_light_contribution(
                surface.normal, v, l, radiance, 1.0,
                surface.base_color, surface.metallic, surface.roughness,
            );
        } else {
            color += standard_light_contribution(
                surface.normal, v, l, radiance, 1.0,
                surface.base_color, surface.metallic, surface.roughness,
            );
        }
    }

    // Dynamic spot lights (up to 64)
    let spot_count = min(frame.light_counts.z, 64u);
    for (var idx = 0u; idx < spot_count; idx = idx + 1u) {
        let light = lights.spots[idx];
        let to_light = light.position_range.xyz - i.world_position;
        let dist = length(to_light);
        if dist >= light.position_range.w {
            continue;
        }
        let l = to_light / max(dist, 0.0001);
        let cone = dot(-l, normalize(light.direction_inner.xyz));
        let cone_atten = smoothstep(light.params.x, light.direction_inner.w, cone);
        if cone_atten <= 0.0001 {
            continue;
        }
        let atten = physical_distance_attenuation(dist, light.position_range.w) * cone_atten;
        let radiance = light.color_intensity.rgb * light.color_intensity.a * atten;
        if shading_model == 0u {
            color += pbr_light_contribution(
                surface.normal, v, l, radiance,
                surface.base_color, surface.metallic, surface.roughness,
                dielectric_f0, clearcoat, clearcoat_roughness,
            );
        } else if shading_model == 1u {
            color += toon_light_contribution(
                surface.normal, v, l, radiance, 1.0,
                surface.base_color, surface.metallic, surface.roughness,
            );
        } else {
            color += standard_light_contribution(
                surface.normal, v, l, radiance, 1.0,
                surface.base_color, surface.metallic, surface.roughness,
            );
        }
    }

    color += surface.emissive;
    color = apply_atmospheric_fog(color, i.world_position);

    let final_surface = mengine_surface_hook(
        vec4<f32>(color, surface.alpha),
        i.uv,
        i.world_position,
        surface.normal,
    );
    return material_output(final_surface.rgb, final_surface.a);
}
