// Depth Resolve Shader (4x MSAA): multisampled Depth24PlusStencil8 (DepthOnly) -> R32Float.
@group(0) @binding(0) var depth_msaa: texture_depth_multisampled_2d;

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
    let dims = vec2<i32>(textureDimensions(depth_msaa));
    let coord = clamp(vec2<i32>(position.xy), vec2<i32>(0), dims - vec2<i32>(1));
    let d0 = textureLoad(depth_msaa, coord, 0);
    let d1 = textureLoad(depth_msaa, coord, 1);
    let d2 = textureLoad(depth_msaa, coord, 2);
    let d3 = textureLoad(depth_msaa, coord, 3);
    return min(min(d0, d1), min(d2, d3));
}
