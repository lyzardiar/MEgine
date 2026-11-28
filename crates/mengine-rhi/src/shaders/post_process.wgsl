// Single-sample HDR Composite & Post-Processing Pass:
//   - Modulates HDR scene with half-res bilateral-filtered SSAO
//   - Adds energy-conserving Dual-Kawase Bloom
//   - Exposure + AgX (default) / ACES Filmic / Neutral / None tone mapping
//   - Perceptually accurate sRGB-space FXAA (when enabled)
//   - Strict output colorspace handling (encodes linear -> sRGB if target format is non-sRGB)

struct PostProcessUniforms {
    params: vec4<f32>, // x = exposure_ev, y = tone_mapper (0=None, 1=AgX, 2=ACES, 3=Neutral), z = bloom_intensity, w = ssao_strength
    flags: vec4<f32>,  // x = output_is_srgb, y = fxaa_enabled, z = unused, w = unused
};

@group(0) @binding(0) var hdr_color: texture_2d<f32>;
@group(0) @binding(1) var bloom_tex: texture_2d<f32>;
@group(0) @binding(2) var ssao_tex: texture_2d<f32>;
@group(0) @binding(3) var linear_sampler: sampler;
@group(0) @binding(4) var<uniform> settings: PostProcessUniforms;

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

fn linear_to_srgb(c: vec3<f32>) -> vec3<f32> {
    let clamped = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    let low = clamped * 12.92;
    let high = 1.055 * pow(clamped, vec3<f32>(1.0 / 2.4)) - vec3<f32>(0.055);
    return select(high, low, clamped <= vec3<f32>(0.0031308));
}

fn srgb_to_linear(c: vec3<f32>) -> vec3<f32> {
    let clamped = clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    let low = clamped / 12.92;
    let high = pow((clamped + vec3<f32>(0.055)) / 1.055, vec3<f32>(2.4));
    return select(high, low, clamped <= vec3<f32>(0.04045));
}

// AgX tone mapper (Troy Sobotka / Blender 4 / Bevy approximation):
// Preserves hue on saturated oranges, blues and sunsets without clipping harshly.
fn agx_default_contrast_approx(x: vec3<f32>) -> vec3<f32> {
    let x2 = x * x;
    let x4 = x2 * x2;
    return 15.5 * x4 * x2
        - 40.14 * x4 * x
        + 31.96 * x4
        - 6.868 * x2 * x
        + 0.4298 * x2
        + 0.1191 * x
        - 0.00232;
}

fn agx_tone_map(color: vec3<f32>) -> vec3<f32> {
    let agx_mat = mat3x3<f32>(
        vec3<f32>(0.842479062253094, 0.0423282422610123, 0.0423756549057051),
        vec3<f32>(0.0784335999999992, 0.878468636469772, 0.0784336),
        vec3<f32>(0.0792237451477643, 0.0791661274605434, 0.879142973793104),
    );
    let agx_mat_inv = mat3x3<f32>(
        vec3<f32>( 1.19687900512017,  -0.0528968517574562, -0.0529716355144438),
        vec3<f32>(-0.0980208811401368, 1.15190312990417,   -0.0980434501171241),
        vec3<f32>(-0.0990297440797205,-0.0989611768448433,  1.15107367264116),
    );
    var val = agx_mat * max(color, vec3<f32>(1e-6));
    val = clamp(log2(val), vec3<f32>(-12.47393), vec3<f32>(4.026069));
    val = (val - vec3<f32>(-12.47393)) / (4.026069 - (-12.47393));
    val = agx_default_contrast_approx(val);
    // Subtle punchy look (sat = 1.08)
    let luma = dot(val, vec3<f32>(0.2126, 0.7152, 0.0722));
    val = mix(vec3<f32>(luma), val, 1.08);
    val = agx_mat_inv * val;
    return clamp(pow(max(val, vec3<f32>(0.0)), vec3<f32>(2.2)), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn aces_fitted(color: vec3<f32>) -> vec3<f32> {
    let num = color * (2.51 * color + vec3<f32>(0.03));
    let den = color * (2.43 * color + vec3<f32>(0.59)) + vec3<f32>(0.14);
    return clamp(num / den, vec3<f32>(0.0), vec3<f32>(1.0));
}

fn khronos_pbr_neutral(color: vec3<f32>) -> vec3<f32> {
    let start_compression = 0.8 - 0.04;
    let desaturation = 0.15;
    let x = min(color.r, min(color.g, color.b));
    let offset = select(0.04, x - 6.25 * x * x, x < 0.08);
    var c = color - vec3<f32>(offset);
    let peak = max(c.r, max(c.g, c.b));
    if peak < start_compression {
        return clamp(c, vec3<f32>(0.0), vec3<f32>(1.0));
    }
    let d = 1.0 - start_compression;
    let new_peak = 1.0 - d * d / (peak + d - start_compression);
    c *= new_peak / peak;
    let g = 1.0 - 1.0 / (desaturation * (peak - new_peak) + 1.0);
    return clamp(mix(c, vec3<f32>(new_peak), g), vec3<f32>(0.0), vec3<f32>(1.0));
}

fn tone_map_linear(hdr: vec3<f32>) -> vec3<f32> {
    let exposed = max(hdr, vec3<f32>(0.0)) * exp2(settings.params.x);
    let mode = u32(round(settings.params.y));
    if mode == 0u {
        return clamp(exposed, vec3<f32>(0.0), vec3<f32>(1.0));
    } else if mode == 2u {
        return aces_fitted(exposed);
    } else if mode == 3u {
        return khronos_pbr_neutral(exposed);
    }
    return agx_tone_map(exposed);
}

fn composite_srgb_at(pixel: vec2<i32>, dims: vec2<i32>) -> vec4<f32> {
    let coord = clamp(pixel, vec2<i32>(0), dims - vec2<i32>(1));
    let uv = (vec2<f32>(coord) + vec2<f32>(0.5)) / vec2<f32>(dims);
    let hdr = textureLoad(hdr_color, coord, 0);
    var rgb = max(hdr.rgb, vec3<f32>(0.0));

    if settings.params.w > 0.001 {
        let ao = textureSampleLevel(ssao_tex, linear_sampler, uv, 0.0).r;
        // Apply SSAO softly so dark shadows get grounded contact without crushing bright emissives.
        let luma = dot(rgb, vec3<f32>(0.2126, 0.7152, 0.0722));
        let ao_weight = settings.params.w * (1.0 / (1.0 + luma * 0.75));
        rgb *= mix(1.0, ao, clamp(ao_weight, 0.0, 1.0));
    }
    if settings.params.z > 0.0001 {
        rgb += textureSampleLevel(bloom_tex, linear_sampler, uv, 0.0).rgb * settings.params.z;
    }

    let ldr_linear = tone_map_linear(rgb);
    return vec4<f32>(linear_to_srgb(ldr_linear), clamp(hdr.a, 0.0, 1.0));
}

fn sample_srgb(p: vec2<f32>, dims: vec2<i32>) -> vec3<f32> {
    let base = vec2<i32>(floor(p));
    let f = fract(p);
    let c00 = composite_srgb_at(base, dims).rgb;
    let c10 = composite_srgb_at(base + vec2<i32>(1, 0), dims).rgb;
    let c01 = composite_srgb_at(base + vec2<i32>(0, 1), dims).rgb;
    let c11 = composite_srgb_at(base + vec2<i32>(1, 1), dims).rgb;
    return mix(mix(c00, c10, f.x), mix(c01, c11, f.x), f.y);
}

fn srgb_luma(c: vec3<f32>) -> f32 {
    return dot(c, vec3<f32>(0.299, 0.587, 0.114));
}

@fragment
fn fs_main(input: VsOut) -> @location(0) vec4<f32> {
    let dims = vec2<i32>(textureDimensions(hdr_color));
    let pixel = vec2<i32>(input.position.xy);
    let center = composite_srgb_at(pixel, dims);

    var final_srgb = center.rgb;
    if settings.flags.y > 0.5 {
        let nw = srgb_luma(composite_srgb_at(pixel + vec2<i32>(-1, -1), dims).rgb);
        let ne = srgb_luma(composite_srgb_at(pixel + vec2<i32>( 1, -1), dims).rgb);
        let sw = srgb_luma(composite_srgb_at(pixel + vec2<i32>(-1,  1), dims).rgb);
        let se = srgb_luma(composite_srgb_at(pixel + vec2<i32>( 1,  1), dims).rgb);
        let m = srgb_luma(center.rgb);
        let lo = min(m, min(min(nw, ne), min(sw, se)));
        let hi = max(m, max(max(nw, ne), max(sw, se)));
        if hi - lo >= max(0.0312, hi * 0.125) {
            let dir = vec2<f32>(-((nw + ne) - (sw + se)), (nw + sw) - (ne + se));
            let reduce = max((nw + ne + sw + se) * 0.03125, 0.0078125);
            let step_v = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2<f32>(-8.0), vec2<f32>(8.0));
            let p = vec2<f32>(pixel);
            let narrow = (sample_srgb(p - step_v / 6.0, dims) + sample_srgb(p + step_v / 6.0, dims)) * 0.5;
            let wide = narrow * 0.5 + (sample_srgb(p - step_v * 0.5, dims) + sample_srgb(p + step_v * 0.5, dims)) * 0.25;
            let wl = srgb_luma(wide);
            final_srgb = select(wide, narrow, wl < lo || wl > hi);
        }
    }

    // If hardware render target is an sRGB view, output linear so GPU performs exact hardware OETF.
    // If target is non-sRGB (e.g. UNORM fallback), output sRGB-encoded values directly!
    let output_rgb = select(final_srgb, srgb_to_linear(final_srgb), settings.flags.x > 0.5);
    return vec4<f32>(output_rgb, center.a);
}
