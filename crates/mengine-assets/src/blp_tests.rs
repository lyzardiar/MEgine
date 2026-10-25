// Author: MiYu. Exercise native BLP variants, independent JPEG plane references and bounded memory texture consumers.
use super::*;
use crate::{decode_texture_rgba8, load_texture_rgba8, texture_dimensions, texture_dimensions_from_bytes};

fn set(bytes: &mut [u8], at: usize, value: u32) { bytes[at..at + 4].copy_from_slice(&value.to_le_bytes()); }

fn blp1(width: u32, height: u32, alpha: u32, compression: u32, prefix: &[u8], payload: &[u8], mip: u8) -> Vec<u8> {
    let mut bytes = vec![0; 156]; bytes[..4].copy_from_slice(b"BLP1");
    for (at, value) in [(4, compression), (8, alpha), (12, width), (16, height), (20, 4), (24, 1), (28 + mip as usize * 4, 156 + prefix.len() as u32), (92 + mip as usize * 4, payload.len() as u32)] { set(&mut bytes, at, value); }
    bytes.extend_from_slice(prefix); bytes.extend_from_slice(payload); bytes
}

fn palette(depth: u32, indices: &[u8], alpha: &[u8]) -> Vec<u8> {
    let mut colors = vec![0; 1024]; colors[..8].copy_from_slice(&[10, 20, 30, 0, 40, 50, 60, 255]);
    blp1(indices.len() as u32, 1, depth, 1, &colors, &[indices, alpha].concat(), 0)
}

fn blp2(width: u32, height: u32, encoding: u8, depth: u8, alpha_encoding: u8, prefix: &[u8], payload: &[u8]) -> Vec<u8> {
    let mut bytes = vec![0; 148]; bytes[..4].copy_from_slice(b"BLP2"); set(&mut bytes, 4, 1); bytes[8..12].copy_from_slice(&[encoding, depth, alpha_encoding, 1]);
    for (at, value) in [(12, width), (16, height), (20, 148 + prefix.len() as u32), (84, payload.len() as u32)] { set(&mut bytes, at, value); }
    bytes.extend_from_slice(prefix); bytes.extend_from_slice(payload); bytes
}

fn jpeg_blp(jpeg: &[u8], alpha: u32, split: usize, mip: u8) -> Vec<u8> {
    let mut shared = (split as u32).to_le_bytes().to_vec(); shared.extend_from_slice(&jpeg[..split]); blp1(8 << mip, 8 << mip, alpha, 0, &shared, &jpeg[split..], mip)
}

fn decode(bytes: &[u8]) -> TextureRgba8 { decode_blp_mip_rgba8(bytes, 0, 1024 * 1024).unwrap() }
fn alphas(pixels: &[u8]) -> Vec<u8> { pixels.chunks_exact(4).map(|p| p[3]).collect() }

#[test]
fn blp1_palette_alpha_depths_and_reserved_palette_byte() {
    assert_eq!(decode(&palette(8, &[0, 1, 0], &[0, 127, 255])).pixels, [30, 20, 10, 0, 60, 50, 40, 127, 30, 20, 10, 255]);
    assert_eq!(alphas(&decode(&palette(4, &[0, 0, 1], &[0xf0, 0x07])).pixels), [0, 255, 119]);
    assert_eq!(alphas(&decode(&palette(1, &[0; 9], &[0x81, 0x01])).pixels), [255, 0, 0, 0, 0, 0, 0, 255, 255]);
    assert_eq!(alphas(&decode(&palette(0, &[0, 1], &[])).pixels), [255, 255]);
    for kind in [3, 5] { let mut picture_type = palette(0, &[0], &[]); set(&mut picture_type, 20, kind); assert_eq!(decode(&picture_type).pixels, [30, 20, 10, 255]); }
}

#[test]
fn blp_jpeg_preserves_independent_raw_component_references_and_mips() {
    let references: &[(&[u8], [u8; 4])] = &[
        (include_bytes!("../../../scripts/fixtures/warcraft/blp-jpeg-four-planes.jpg"), [112, 176, 224, 56]),
        (include_bytes!("../../../scripts/fixtures/warcraft/blp-jpeg-three-planes.jpg"), [99, 168, 72, 255]),
    ];
    for &(jpeg, expected) in references {
        for (split, mip, flags) in [(0, 0, 8), (20, 1, 8), (jpeg.len() / 2, 0, 0)] {
            let decoded = decode_blp_mip_rgba8(&jpeg_blp(jpeg, flags, split, mip), mip, 256).unwrap();
            let mut color = expected; if flags == 0 { color[3] = 255; }
            assert_eq!((decoded.width, decoded.height), (8, 8)); assert!(decoded.pixels.chunks_exact(4).all(|p| p == color), "split={split} mip={mip}: {:?}", &decoded.pixels[..4]);
        }
    }
}

#[test]
fn blp2_palette_and_bgra_keep_rgba_channel_order() {
    let mut colors = vec![0; 1024]; colors[..4].copy_from_slice(&[10, 20, 30, 0]);
    assert_eq!(decode(&blp2(2, 1, 1, 8, 0, &colors, &[0, 0, 128, 255])).pixels, [30, 20, 10, 128, 30, 20, 10, 255]);
    for depth in [0, 8] { assert_eq!(decode(&blp2(1, 1, 3, depth, 0, &[], &[10, 20, 30, 40])).pixels, [30, 20, 10, if depth == 0 { 255 } else { 40 }]); }
}

fn color_block(c0: u16, c1: u16, indices: u32) -> Vec<u8> { [c0.to_le_bytes().as_slice(), c1.to_le_bytes().as_slice(), indices.to_le_bytes().as_slice()].concat() }

#[test]
fn blp_bc1_transparency_interpolation_and_partial_blocks() {
    let block = color_block(0, 0xffff, 0b11_10_01_00);
    assert_eq!(&decode(&blp2(4, 4, 2, 1, 0, &[], &block)).pixels[..16], &[0, 0, 0, 255, 255, 255, 255, 255, 127, 127, 127, 255, 0, 0, 0, 0]);
    assert_eq!(decode(&blp2(1, 1, 2, 0, 0, &[], &color_block(0, 0xffff, 3))).pixels, [0, 0, 0, 255]);
    assert_eq!(decode(&blp2(1, 1, 2, 0, 0, &[], &color_block(0xf800, 0x001f, 2))).pixels, [170, 0, 85, 255]);
    let blocks = [color_block(0xf800, 0, 0), color_block(0x07e0, 0, 0)].concat(); let texture = decode(&blp2(5, 3, 2, 0, 0, &[], &blocks));
    assert_eq!(texture.pixels.len(), 60);
    for row in texture.pixels.chunks_exact(20) { assert_eq!(&row[..16], &[255, 0, 0, 255].repeat(4)); assert_eq!(&row[16..], &[0, 255, 0, 255]); }
}

#[test]
fn blp_bc2_explicit_alpha_and_four_color_mode() {
    let block = [&0xfedcba9876543210u64.to_le_bytes()[..], &color_block(0, 0xffff, 2)].concat();
    let decoded = decode(&blp2(4, 4, 2, 8, 1, &[], &block)); assert_eq!(alphas(&decoded.pixels), (0..16).map(|n| n * 17).collect::<Vec<_>>());
    assert_eq!(&decoded.pixels[..4], &[85, 85, 85, 0]);
}

#[test]
fn blp_bc3_both_alpha_interpolation_branches() {
    for (a0, a1, expected) in [(210, 0, [210, 0, 180, 150, 120, 90, 60, 30]), (0, 200, [0, 200, 40, 80, 120, 160, 0, 255])] {
        let bits = (0..16).fold(0u64, |b, i| b | ((i % 8) as u64) << (i * 3));
        let block = [&[a0, a1][..], &bits.to_le_bytes()[..6], &color_block(0xf800, 0, 0)].concat();
        assert_eq!(alphas(&decode(&blp2(4, 4, 2, 8, 7, &[], &block)).pixels), expected.repeat(2));
    }
}

#[test]
fn blp_bounds_reject_before_output_allocation_and_report_missing_mips() {
    let good = palette(8, &[0], &[255]); assert!(decode_blp_mip_rgba8(&good, 0, 3).is_err());
    for mip in [1, 16, 255] { assert!(decode_blp_mip_rgba8(&good, mip, 1024).is_err()); }
    let mut bad = Vec::new();
    for (at, value) in [(12, 0), (16, 16385), (8, 3), (20, 7), (28, 100), (28, u32::MAX), (92, u32::MAX), (92, 1)] { let mut bytes = good.clone(); set(&mut bytes, at, value); bad.push(bytes); }
    for len in [0, 4, 100, 155, good.len() - 1] { bad.push(good[..len].to_vec()); }
    for bytes in bad { assert!(decode_blp_mip_rgba8(&bytes, 0, usize::MAX).is_err()); }
    let mut huge = good.clone(); set(&mut huge, 12, 16384); set(&mut huge, 16, 16384);
    assert!(decode_blp_mip_rgba8(&huge, 0, 256 * 1024 * 1024).is_err());
    for (encoding, alpha_encoding, bytes) in [(1, 0, vec![0]), (3, 0, vec![0; 3]), (2, 0, vec![0; 7]), (2, 1, vec![0; 15]), (2, 7, vec![0; 15])] {
        assert!(decode_blp_mip_rgba8(&blp2(4, 4, encoding, 8, alpha_encoding, &[0; 1024], &bytes), 0, 1024).is_err());
    }
}

#[test]
fn blp_jpeg_rejects_shared_header_overlap_dimensions_and_truncated_data() {
    let jpeg = include_bytes!("../../../scripts/fixtures/warcraft/blp-jpeg-four-planes.jpg"); let good = jpeg_blp(jpeg, 8, 20, 0);
    for (at, value) in [(12, 4), (12, 16), (28, 160), (156, u32::MAX)] { let mut bytes = good.clone(); set(&mut bytes, at, value); assert!(decode_blp_mip_rgba8(&bytes, 0, 1024).is_err()); }
    let mut corrupt = good.clone(); corrupt[160..180].fill(0); assert!(decode_blp_mip_rgba8(&corrupt, 0, 1024).is_err());
    assert!(decode_blp_mip_rgba8(&good[..good.len() - 10], 0, 1024).is_err());
}

#[test]
fn blp_memory_texture_interface_and_file_loader_agree() {
    let bytes = palette(8, &[0, 1], &[128, 64]); assert_eq!(texture_dimensions_from_bytes(&bytes, "member.blp").unwrap(), [2, 1]);
    let expected = decode(&bytes); assert_eq!(decode_texture_rgba8(&bytes, "unknown").unwrap(), expected);
    let path = std::env::temp_dir().join(format!("mengine-native-blp-{}.BLP", std::process::id())); std::fs::write(&path, &bytes).unwrap();
    let size = texture_dimensions(&path); let decoded = load_texture_rgba8(&path); std::fs::remove_file(&path).unwrap(); assert_eq!(size.unwrap(), [2, 1]); assert_eq!(decoded.unwrap(), expected);
}

#[test]
fn blp_memory_texture_interface_keeps_png_and_tga_hint_support() {
    for format in [image::ImageFormat::Png, image::ImageFormat::Tga] {
        let rgba = vec![1, 2, 3, 255, 5, 6, 7, 128]; let mut encoded = std::io::Cursor::new(Vec::new());
        image::RgbaImage::from_raw(2, 1, rgba.clone()).unwrap().write_to(&mut encoded, format).unwrap(); let name = if format == image::ImageFormat::Tga { "map.tga" } else { "unknown" };
        assert_eq!(texture_dimensions_from_bytes(encoded.get_ref(), name).unwrap(), [2, 1]); assert_eq!(decode_texture_rgba8(encoded.get_ref(), name).unwrap().pixels, rgba);
    }
    // A small grayscale TGA header must hit the RGBA expansion budget before decoding its absent payload.
    let mut gray = vec![0; 18]; gray[2] = 3; gray[12..14].copy_from_slice(&16384u16.to_le_bytes()); gray[14..16].copy_from_slice(&8192u16.to_le_bytes()); gray[16] = 8;
    let error = decode_texture_rgba8(&gray, "gray.tga").unwrap_err(); assert!(matches!(error, AssetError::Invalid(ref message) if message.contains("RGBA byte budget")), "{error}");
}
