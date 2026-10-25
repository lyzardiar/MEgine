// Author: MiYu. Decode bounded Warcraft BLP members directly from archive bytes, including raw JPEG planes.
use crate::{AssetError, TextureRgba8};
use zune_core::{bytestream::ZCursor, options::DecoderOptions};

fn invalid(message: impl Into<String>) -> AssetError { AssetError::Invalid(format!("BLP: {}", message.into())) }
fn word(bytes: &[u8], at: usize) -> Result<u32, AssetError> { Ok(u32::from_le_bytes(bytes.get(at..at + 4).ok_or_else(|| invalid("truncated header"))?.try_into().unwrap())) }

#[derive(Clone, Copy)]
enum Encoding { Palette(usize), Jpeg, Bc(u8), Bgra }
struct Header { width: u32, height: u32, alpha: u32, encoding: Encoding, offsets: usize, sizes: usize }

impl Header {
    fn parse(bytes: &[u8]) -> Result<Self, AssetError> {
        let (offsets, sizes, encoding, alpha) = match bytes.get(..4) {
            Some(b"BLP1") => {
                if bytes.len() < 156 { return Err(invalid("truncated BLP1 header")); }
                let encoding = match word(bytes, 4)? {
                    0 => Encoding::Jpeg,
                    1 if matches!(word(bytes, 20)?, 3 | 4 | 5) => Encoding::Palette(156),
                    _ => return Err(invalid("unsupported BLP1 encoding")),
                };
                (28, 92, encoding, word(bytes, 8)?)
            }
            Some(b"BLP2") => {
                if bytes.len() < 148 || word(bytes, 4)? != 1 { return Err(invalid("invalid BLP2 header")); }
                let encoding = match bytes[8] { 1 => Encoding::Palette(148), 2 if matches!(bytes[10], 0 | 1 | 7) => Encoding::Bc(bytes[10]), 3 => Encoding::Bgra, _ => return Err(invalid("unsupported BLP2 encoding")) };
                (20, 84, encoding, bytes[9] as u32)
            }
            _ => return Err(invalid("unsupported magic")),
        };
        let (width, height) = (word(bytes, 12)?, word(bytes, 16)?);
        if width == 0 || height == 0 || width > 16384 || height > 16384 { return Err(invalid("invalid or oversized dimensions")); }
        if !matches!(encoding, Encoding::Jpeg) && !matches!(alpha, 0 | 1 | 4 | 8) { return Err(invalid("unsupported alpha depth")); }
        if matches!(encoding, Encoding::Bgra) && !matches!(alpha, 0 | 8) { return Err(invalid("BGRA requires zero or eight alpha bits")); }
        Ok(Self { width, height, alpha, encoding, offsets, sizes })
    }

    fn mip<'a>(&self, bytes: &'a [u8], mip: u8) -> Result<(&'a [u8], u32, u32), AssetError> {
        if mip >= 16 { return Err(invalid("mip index exceeds header table")); }
        let (offset, size) = (word(bytes, self.offsets + mip as usize * 4)? as usize, word(bytes, self.sizes + mip as usize * 4)? as usize);
        let floor = match self.encoding { Encoding::Palette(start) => start + 1024, Encoding::Jpeg => 160usize.checked_add(word(bytes, 156)? as usize).ok_or_else(|| invalid("JPEG shared header overflow"))?, _ => 148 };
        if size == 0 || offset < floor { return Err(invalid("missing mip or payload overlaps header")); }
        let end = offset.checked_add(size).ok_or_else(|| invalid("mip range overflow"))?;
        let payload = bytes.get(offset..end).ok_or_else(|| invalid("truncated mip payload"))?;
        Ok((payload, (self.width >> mip).max(1), (self.height >> mip).max(1)))
    }
}

pub(crate) fn dimensions(bytes: &[u8]) -> Result<[u32; 2], AssetError> { let h = Header::parse(bytes)?; Ok([h.width, h.height]) }
pub(crate) fn is_blp(bytes: &[u8]) -> bool { matches!(bytes.get(..4), Some(b"BLP1" | b"BLP2")) }

fn output(len: usize) -> Result<Vec<u8>, AssetError> {
    let mut pixels = Vec::new(); pixels.try_reserve_exact(len).map_err(|_| invalid("cannot reserve decoded mip"))?; pixels.resize(len, 0); Ok(pixels)
}

/// Decode one stored mip. The byte limit applies to the decoded RGBA payload, not decoder working memory.
pub fn decode_blp_mip_rgba8(bytes: &[u8], mip: u8, max_decoded_bytes: usize) -> Result<TextureRgba8, AssetError> {
    let header = Header::parse(bytes)?; let (payload, width, height) = header.mip(bytes, mip)?;
    let len = (width as usize).checked_mul(height as usize).and_then(|n| n.checked_mul(4)).filter(|n| *n <= max_decoded_bytes).ok_or_else(|| invalid("decoded mip exceeds byte budget"))?;
    if matches!(header.encoding, Encoding::Jpeg) { return Ok(TextureRgba8 { width, height, pixels: decode_jpeg(bytes, payload, &header, width, height, len)? }); }
    let required = match header.encoding { Encoding::Palette(_) => len / 4 + (len / 4 * header.alpha as usize).div_ceil(8), Encoding::Bgra => len, Encoding::Bc(kind) => width.div_ceil(4) as usize * height.div_ceil(4) as usize * if kind == 0 { 8 } else { 16 }, Encoding::Jpeg => unreachable!() };
    if payload.len() < required { return Err(invalid("truncated mip pixel or alpha data")); }
    let mut pixels = output(len)?;
    match header.encoding {
        Encoding::Palette(start) => {
            let palette = bytes.get(start..start + 1024).ok_or_else(|| invalid("truncated palette"))?;
            let count = pixels.len() / 4; let alpha_bytes = (count * header.alpha as usize).div_ceil(8);
            if payload.len() < count + alpha_bytes { return Err(invalid("truncated palette indices or alpha plane")); }
            for (index, pixel) in pixels.chunks_exact_mut(4).enumerate() {
                let color = &palette[payload[index] as usize * 4..][..4];
                let alpha = match header.alpha { 0 => 255, 1 => ((payload[count + index / 8] >> (index % 8)) & 1) * 255, 4 => ((payload[count + index / 2] >> (index % 2 * 4)) & 15) * 17, 8 => payload[count + index], _ => unreachable!() };
                pixel.copy_from_slice(&[color[2], color[1], color[0], alpha]);
            }
        }
        Encoding::Jpeg => unreachable!(),
        Encoding::Bgra => {
            if payload.len() < pixels.len() { return Err(invalid("truncated BGRA mip")); }
            for (pixel, color) in pixels.chunks_exact_mut(4).zip(payload.chunks_exact(4)) { pixel.copy_from_slice(&[color[2], color[1], color[0], if header.alpha == 0 { 255 } else { color[3] }]); }
        }
        Encoding::Bc(kind) => decode_bc(payload, width, height, kind, header.alpha != 0, &mut pixels)?,
    }
    Ok(TextureRgba8 { width, height, pixels })
}

fn decode_jpeg(bytes: &[u8], payload: &[u8], header: &Header, width: u32, height: u32, len: usize) -> Result<Vec<u8>, AssetError> {
    let shared_size = word(bytes, 156)? as usize;
    let shared = bytes.get(160..160 + shared_size).ok_or_else(|| invalid("truncated shared JPEG header"))?;
    let mut jpeg = Vec::new(); jpeg.try_reserve_exact(shared.len() + payload.len()).map_err(|_| invalid("cannot reserve JPEG input"))?; jpeg.extend_from_slice(shared); jpeg.extend_from_slice(payload);
    let options = DecoderOptions::default().set_max_width(width as usize).set_max_height(height as usize).jpeg_set_max_scans(256);
    let mut decoder = zune_jpeg::JpegDecoder::new_with_options(ZCursor::new(&jpeg), options);
    decoder.decode_headers().map_err(|e| invalid(format!("JPEG header: {e:?}")))?;
    let info = decoder.info().ok_or_else(|| invalid("missing JPEG information"))?;
    if u32::from(info.width) != width || u32::from(info.height) != height || !matches!(info.components, 3 | 4) { return Err(invalid("JPEG dimensions or component count disagree with BLP mip")); }
    // BLP stores BGR(A) planes, not print-CMYK. Preserve planes without RGB conversion or channel inversion.
    let color = decoder.input_colorspace().ok_or_else(|| invalid("unknown JPEG planes"))?;
    decoder.set_options(options.jpeg_set_out_colorspace(color));
    let components = info.components as usize;
    let mut pixels = output(len)?;
    decoder.decode_into(&mut pixels[..len / 4 * components]).map_err(|e| invalid(format!("JPEG payload: {e:?}")))?;
    // Expand three planes backwards so the RGBA output also serves as the decoder buffer.
    for index in (0..len / 4).rev() { let at = index * components; let color = [pixels[at + 2], pixels[at + 1], pixels[at], if components == 4 && header.alpha != 0 { pixels[at + 3] } else { 255 }]; pixels[index * 4..][..4].copy_from_slice(&color); }
    Ok(pixels)
}

fn rgb565(word: u16) -> [u8; 4] { let (r, g, b) = ((word >> 11) as u8, ((word >> 5) & 63) as u8, (word & 31) as u8); [(r << 3) | (r >> 2), (g << 2) | (g >> 4), (b << 3) | (b >> 2), 255] }

fn decode_bc(payload: &[u8], width: u32, height: u32, kind: u8, has_alpha: bool, pixels: &mut [u8]) -> Result<(), AssetError> {
    let block_size = if kind == 0 { 8 } else { 16 }; let blocks_x = width.div_ceil(4) as usize; let blocks_y = height.div_ceil(4) as usize;
    if payload.len() < blocks_x * blocks_y * block_size { return Err(invalid("truncated BC mip")); }
    for (index, block) in payload.chunks_exact(block_size).take(blocks_x * blocks_y).enumerate() {
        let colors = if kind == 0 { block } else { &block[8..] };
        let c0 = u16::from_le_bytes([colors[0], colors[1]]); let c1 = u16::from_le_bytes([colors[2], colors[3]]);
        let mut palette = [rgb565(c0), rgb565(c1), [0; 4], [0, 0, 0, if has_alpha { 0 } else { 255 }]];
        if c0 > c1 || kind != 0 {
            for channel in 0..3 { palette[2][channel] = ((2 * palette[0][channel] as u16 + palette[1][channel] as u16) / 3) as u8; palette[3][channel] = ((palette[0][channel] as u16 + 2 * palette[1][channel] as u16) / 3) as u8; }
            palette[2][3] = 255; palette[3][3] = 255;
        } else { for channel in 0..3 { palette[2][channel] = ((palette[0][channel] as u16 + palette[1][channel] as u16) / 2) as u8; } palette[2][3] = 255; }
        let indices = u32::from_le_bytes(colors[4..8].try_into().unwrap());
        let mut alpha = [255; 16];
        if kind == 1 { let bits = u64::from_le_bytes(block[..8].try_into().unwrap()); for (i, a) in alpha.iter_mut().enumerate() { *a = ((bits >> (4 * i)) & 15) as u8 * 17; } }
        if kind == 7 {
            let (a0, a1) = (block[0], block[1]); let mut table = [a0, a1, 0, 0, 0, 0, 0, 255];
            if a0 > a1 { for i in 2..8 { table[i] = (((8 - i) as u16 * a0 as u16 + (i - 1) as u16 * a1 as u16) / 7) as u8; } }
            else { for i in 2..6 { table[i] = (((6 - i) as u16 * a0 as u16 + (i - 1) as u16 * a1 as u16) / 5) as u8; } }
            let mut bits = 0u64; for i in 0..6 { bits |= (block[2 + i] as u64) << (8 * i); } for (i, a) in alpha.iter_mut().enumerate() { *a = table[((bits >> (3 * i)) & 7) as usize]; }
        }
        for i in 0..16 {
            let (x, y) = ((index % blocks_x) * 4 + i % 4, (index / blocks_x) * 4 + i / 4);
            if x >= width as usize || y >= height as usize { continue; }
            let mut color = palette[((indices >> (2 * i)) & 3) as usize];
            if kind != 0 { color[3] = if has_alpha { alpha[i] } else { 255 }; }
            pixels[(y * width as usize + x) * 4..][..4].copy_from_slice(&color);
        }
    }
    Ok(())
}

#[cfg(test)]
#[path = "blp_tests.rs"]
mod tests;
