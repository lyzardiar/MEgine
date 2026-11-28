// 4-Cascade Directional Shadow Depth Pass (supports alpha cutout and double-sided/mirrored geometry).

struct ShadowCascadeUniform {
    light_view_proj: mat4x4<f32>,
};

struct ObjectUniforms {
    model: mat4x4<f32>,
    normal_matrix: mat4x4<f32>,
    base_color: vec4<f32>,
    material: vec4<f32>,
    emissive: vec4<f32>,
    texture_transform: vec4<f32>,
    map_params: vec4<f32>,
    layer_params: vec4<f32>,
    shadow_params: vec4<f32>,
    toon_params: vec4<f32>,
    toon_shadow_tint: vec4<f32>,
    toon_rim_color: vec4<f32>,
    custom_parameters: array<vec4<f32>, 16>,
};

@group(0) @binding(0) var<uniform> shadow_cascade: ShadowCascadeUniform;
@group(0) @binding(1) var<uniform> object: ObjectUniforms;
@group(1) @binding(0) var base_color_texture: texture_2d<f32>;
@group(1) @binding(5) var material_sampler: sampler;

struct VsIn {
    @location(0) position: vec3<f32>,
    @location(1) normal: vec3<f32>,
    @location(2) uv: vec2<f32>,
};

struct ShadowOut {
    @builtin(position) clip: vec4<f32>,
    @location(0) uv: vec2<f32>,
};

@vertex
fn vs_shadow(v: VsIn) -> ShadowOut {
    var output: ShadowOut;
    output.clip = shadow_cascade.light_view_proj * object.model * vec4<f32>(v.position, 1.0);
    let scaled_uv = v.uv * object.texture_transform.xy;
    let center = object.texture_transform.xy * 0.5;
    let angle = object.map_params.z;
    let rotation = mat2x2<f32>(cos(angle), sin(angle), -sin(angle), cos(angle));
    output.uv = rotation * (scaled_uv - center) + center + object.texture_transform.zw;
    return output;
}

@fragment
fn fs_shadow(input: ShadowOut) {
    if object.emissive.w > 0.0 {
        let alpha = textureSample(base_color_texture, material_sampler, input.uv).a
            * object.base_color.a;
        if alpha < object.emissive.w {
            discard;
        }
    }
}
