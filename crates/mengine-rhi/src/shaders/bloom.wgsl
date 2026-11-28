// Dual-Kawase / Jimenez 13-tap Anti-Flicker HDR Bloom Pipeline.

struct BloomUniforms {
    texel_size: vec2<f32>,
    threshold: f32,
    knee: f32,
};

@group(0) @binding(0) var src_tex: texture_2d<f32>;
@group(0) @binding(1) var linear_sampler: sampler;
@group(0) @binding(2) var<uniform> bloom: BloomUniforms;

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

fn soft_threshold(color: vec3<f32>, threshold: f32, knee: f32) -> vec3<f32> {
    let br = max(color.r, max(color.g, color.b));
    let k = max(knee, 0.001);
    var soft = clamp(br - threshold + k, 0.0, 2.0 * k);
    soft = (soft * soft) / (4.0 * k + 0.00001);
    let contrib = max(soft, br - threshold) / max(br, 0.00001);
    return max(color * contrib, vec3<f32>(0.0));
}

fn karis_weight(c: vec3<f32>) -> f32 {
    let luma = dot(c, vec3<f32>(0.2126, 0.7152, 0.0722));
    return 1.0 / (1.0 + luma);
}

@fragment
fn fs_prefilter(input: VsOut) -> @location(0) vec4<f32> {
    let t = bloom.texel_size;
    let c0 = soft_threshold(textureSample(src_tex, linear_sampler, input.uv + vec2<f32>(-t.x, -t.y)).rgb, bloom.threshold, bloom.knee);
    let c1 = soft_threshold(textureSample(src_tex, linear_sampler, input.uv + vec2<f32>( t.x, -t.y)).rgb, bloom.threshold, bloom.knee);
    let c2 = soft_threshold(textureSample(src_tex, linear_sampler, input.uv + vec2<f32>(-t.x,  t.y)).rgb, bloom.threshold, bloom.knee);
    let c3 = soft_threshold(textureSample(src_tex, linear_sampler, input.uv + vec2<f32>( t.x,  t.y)).rgb, bloom.threshold, bloom.knee);
    let w0 = karis_weight(c0);
    let w1 = karis_weight(c1);
    let w2 = karis_weight(c2);
    let w3 = karis_weight(c3);
    let col = (c0 * w0 + c1 * w1 + c2 * w2 + c3 * w3) / max(w0 + w1 + w2 + w3, 0.0001);
    return vec4<f32>(min(col, vec3<f32>(32.0)), 1.0);
}

@fragment
fn fs_downsample(input: VsOut) -> @location(0) vec4<f32> {
    let x = bloom.texel_size.x;
    let y = bloom.texel_size.y;
    let uv = input.uv;

    let a = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-2.0 * x,  2.0 * y)).rgb;
    let b = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 0.0,      2.0 * y)).rgb;
    let c = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 2.0 * x,  2.0 * y)).rgb;
    let d = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-2.0 * x,  0.0    )).rgb;
    let e = textureSample(src_tex, linear_sampler, uv).rgb;
    let f = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 2.0 * x,  0.0    )).rgb;
    let g = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-2.0 * x, -2.0 * y)).rgb;
    let h = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 0.0,     -2.0 * y)).rgb;
    let i = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 2.0 * x, -2.0 * y)).rgb;

    let j = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-x,  y)).rgb;
    let k = textureSample(src_tex, linear_sampler, uv + vec2<f32>( x,  y)).rgb;
    let l = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-x, -y)).rgb;
    let m = textureSample(src_tex, linear_sampler, uv + vec2<f32>( x, -y)).rgb;

    var out = e * 0.125;
    out += (a + c + g + i) * 0.03125;
    out += (b + d + f + h) * 0.0625;
    out += (j + k + l + m) * 0.125;
    return vec4<f32>(max(out, vec3<f32>(0.0)), 1.0);
}

@fragment
fn fs_upsample(input: VsOut) -> @location(0) vec4<f32> {
    let x = bloom.texel_size.x;
    let y = bloom.texel_size.y;
    let uv = input.uv;

    let a = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-x,  y)).rgb;
    let b = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 0.0, y)).rgb;
    let c = textureSample(src_tex, linear_sampler, uv + vec2<f32>( x,  y)).rgb;
    let d = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-x,  0.0)).rgb;
    let e = textureSample(src_tex, linear_sampler, uv).rgb;
    let f = textureSample(src_tex, linear_sampler, uv + vec2<f32>( x,  0.0)).rgb;
    let g = textureSample(src_tex, linear_sampler, uv + vec2<f32>(-x, -y)).rgb;
    let h = textureSample(src_tex, linear_sampler, uv + vec2<f32>( 0.0, -y)).rgb;
    let i = textureSample(src_tex, linear_sampler, uv + vec2<f32>( x, -y)).rgb;

    var out = e * 4.0;
    out += (b + d + f + h) * 2.0;
    out += (a + c + g + i);
    return vec4<f32>(out * (1.0 / 16.0), 1.0);
}
