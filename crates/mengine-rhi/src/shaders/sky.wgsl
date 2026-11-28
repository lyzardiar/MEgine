// Post-opaque depth-tested Skybox (depth = 1.0, LessEqual -> zero overdraw on occluded pixels).
// Renders seamless Cubemap environment or analytic physical atmosphere + solar disc.

struct SkyUniforms {
    inverse_view_projection: mat4x4<f32>,
    camera_position: vec4<f32>,
    sky_color: vec4<f32>,
    equator_color: vec4<f32>,
    ground_color: vec4<f32>,
    sun_direction: vec4<f32>, // xyz = toward sun, w = sun_enabled
    sun_color: vec4<f32>,     // rgb = sun radiance, w = unused
    params: vec4<f32>,        // x = has_cubemap, y = rotation_rad, z = bg_intensity, w = unused
};

@group(0) @binding(0) var<uniform> sky: SkyUniforms;
@group(1) @binding(1) var environment_sampler: sampler;
@group(1) @binding(5) var environment_source_cube: texture_cube<f32>;

struct VsOut {
    @builtin(position) position: vec4<f32>,
    @location(0) clip_xy: vec2<f32>,
};

@vertex
fn vs_main(@builtin(vertex_index) vertex_index: u32) -> VsOut {
    let positions = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    var output: VsOut;
    // Place on the far plane (z = 1.0) so depth test LessEqual culls all opaque pixels.
    output.position = vec4<f32>(positions[vertex_index], 1.0, 1.0);
    output.clip_xy = positions[vertex_index];
    return output;
}

fn rotate_environment_direction(direction: vec3<f32>) -> vec3<f32> {
    let s = sin(sky.params.y);
    let c = cos(sky.params.y);
    return vec3<f32>(
        c * direction.x + s * direction.z,
        direction.y,
        -s * direction.x + c * direction.z,
    );
}

fn analytic_atmosphere(direction: vec3<f32>) -> vec3<f32> {
    let y = clamp(direction.y, -1.0, 1.0);
    var col: vec3<f32>;
    if y >= 0.0 {
        let horizon_haze = pow(1.0 - y, 4.0);
        col = mix(sky.equator_color.rgb, sky.sky_color.rgb, pow(y, 0.55));
        col += sky.equator_color.rgb * horizon_haze * 0.25;
    } else {
        col = mix(sky.equator_color.rgb, sky.ground_color.rgb, pow(-y, 0.55));
    }
    if sky.sun_direction.w > 0.5 {
        let sun_dir = normalize(sky.sun_direction.xyz);
        let cos_ang = max(dot(direction, sun_dir), 0.0);
        let mie_halo = pow(cos_ang, 12.0) * 0.22 + pow(cos_ang, 256.0) * 1.1;
        let disc = smoothstep(0.9993, 0.9997, cos_ang) * 6.0;
        col += sky.sun_color.rgb * (mie_halo + disc) * smoothstep(-0.08, 0.04, y);
    }
    return col;
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    let far_world = sky.inverse_view_projection * vec4<f32>(input.clip_xy, 1.0, 1.0);
    let world_position = far_world.xyz / far_world.w;
    let direction = normalize(world_position - sky.camera_position.xyz);
    let rotated = normalize(rotate_environment_direction(direction));

    var radiance = analytic_atmosphere(rotated);
    if sky.params.x > 0.5 {
        radiance = textureSampleLevel(environment_source_cube, environment_sampler, rotated, 0.0).rgb;
    }
    return vec4<f32>(max(radiance, vec3<f32>(0.0)) * sky.params.z, 1.0);
}
