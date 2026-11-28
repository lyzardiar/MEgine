// Depth Resolve Shader: single-sample Depth24PlusStencil8 (DepthOnly) -> R32Float.
@group(0) @binding(0) var depth_single: texture_depth_2d;

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
    let pos = array<vec2<f32>, 3>(
        vec2<f32>(-1.0, -1.0),
        vec2<f32>(3.0, -1.0),
        vec2<f32>(-1.0, 3.0),
    );
    return vec4<f32>(pos[vid], 0.0, 1.0);
}

@fragment
fn fs_main(@builtin(position) position: vec4<f32>) -> @location(0) f32 {
    let dims = vec2<i32>(textureDimensions(depth_single));
    let coord = clamp(vec2<i32>(position.xy), vec2<i32>(0), dims - vec2<i32>(1));
    return textureLoad(depth_single, coord, 0);
}
