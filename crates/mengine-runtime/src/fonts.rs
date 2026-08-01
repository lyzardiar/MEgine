use crate::textures::resolve_project_asset_path;
use crate::ui::{UiFontGlyphMetrics, UiFontGlyphTexture, UiFontResolver};
use ab_glyph::{point, Font, FontArc, ScaleFont};
use mengine_rhi::Renderer;
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::time::SystemTime;

const MAX_FONT_BYTES: u64 = 64 * 1024 * 1024;
const ATLAS_SIZE: u32 = 1024;
const MAX_ATLAS_PAGES: usize = 32;
const GLYPH_PADDING: u32 = 1;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct FontLoadFailure {
    pub key: String,
    pub path: PathBuf,
    pub error: String,
}

#[derive(Clone, Copy, Debug, Default, PartialEq, Eq)]
struct FileStamp {
    modified: Option<SystemTime>,
    length: Option<u64>,
}

#[derive(Clone)]
struct CachedFont {
    stamp: FileStamp,
    revision: String,
    result: Result<FontArc, String>,
}

#[derive(Clone, Debug, Hash, PartialEq, Eq)]
struct AtlasKey {
    font: String,
    revision: String,
    size: u16,
    style: u8,
}

struct FontAtlasPage {
    key: String,
    pixels: Vec<u8>,
    cursor_x: u32,
    cursor_y: u32,
    row_height: u32,
    dirty: bool,
    glyphs: HashMap<char, UiFontGlyphTexture>,
}

impl FontAtlasPage {
    fn new(key: String) -> Self {
        Self {
            key,
            pixels: vec![0; (ATLAS_SIZE * ATLAS_SIZE * 4) as usize],
            cursor_x: GLYPH_PADDING,
            cursor_y: GLYPH_PADDING,
            row_height: 0,
            dirty: false,
            glyphs: HashMap::new(),
        }
    }

    fn insert(
        &mut self,
        character: char,
        width: u32,
        height: u32,
        alpha: &[u8],
        bounds: [f32; 4],
    ) -> Option<UiFontGlyphTexture> {
        if width == 0
            || height == 0
            || width + GLYPH_PADDING * 2 > ATLAS_SIZE
            || height + GLYPH_PADDING * 2 > ATLAS_SIZE
            || alpha.len() != (width * height) as usize
        {
            return None;
        }
        if self.cursor_x + width + GLYPH_PADDING > ATLAS_SIZE {
            self.cursor_x = GLYPH_PADDING;
            self.cursor_y = self
                .cursor_y
                .saturating_add(self.row_height + GLYPH_PADDING);
            self.row_height = 0;
        }
        if self.cursor_y + height + GLYPH_PADDING > ATLAS_SIZE {
            return None;
        }
        let x = self.cursor_x;
        let y = self.cursor_y;
        for row in 0..height {
            for column in 0..width {
                let coverage = alpha[(row * width + column) as usize];
                let offset = (((y + row) * ATLAS_SIZE + x + column) * 4) as usize;
                self.pixels[offset] = 255;
                self.pixels[offset + 1] = 255;
                self.pixels[offset + 2] = 255;
                self.pixels[offset + 3] = coverage;
            }
        }
        self.cursor_x += width + GLYPH_PADDING;
        self.row_height = self.row_height.max(height);
        self.dirty = true;
        let glyph = UiFontGlyphTexture {
            key: self.key.clone(),
            uv: [
                x as f32 / ATLAS_SIZE as f32,
                y as f32 / ATLAS_SIZE as f32,
                width as f32 / ATLAS_SIZE as f32,
                height as f32 / ATLAS_SIZE as f32,
            ],
            bounds,
        };
        self.glyphs.insert(character, glyph.clone());
        Some(glyph)
    }
}

#[derive(Clone, Debug)]
struct GlyphGeometry {
    advance: f32,
    metric_width: f32,
    line_height: f32,
    geometry: Option<(f32, f32)>,
    bounds: [f32; 4],
    width: u32,
    height: u32,
    bold_pixels: u32,
    italic_pixels: u32,
}

#[derive(Default)]
pub struct RuntimeFontCache {
    project_root: Option<PathBuf>,
    fonts: HashMap<String, CachedFont>,
    checked_fonts: HashSet<String>,
    atlases: HashMap<AtlasKey, Vec<FontAtlasPage>>,
    retired_textures: Vec<String>,
    failures: Vec<FontLoadFailure>,
    reported_failures: HashSet<String>,
}

impl RuntimeFontCache {
    pub fn new(project_root: Option<PathBuf>) -> Self {
        Self {
            project_root,
            ..Self::default()
        }
    }

    pub fn set_project_root(&mut self, project_root: Option<PathBuf>) {
        if self.project_root == project_root {
            return;
        }
        self.retire_all_atlases();
        self.project_root = project_root;
        self.fonts.clear();
        self.checked_fonts.clear();
        self.reported_failures.clear();
    }

    /// Start a new UI collection pass. A font's file stamp is checked once per
    /// frame, while every glyph in that frame reuses the parsed FontArc.
    pub fn begin_frame(&mut self) {
        self.checked_fonts.clear();
    }

    pub fn take_failures(&mut self) -> Vec<FontLoadFailure> {
        std::mem::take(&mut self.failures)
    }

    pub fn sync(&mut self, renderer: &mut Renderer) {
        for key in self.retired_textures.drain(..) {
            renderer.remove_ui_texture(&key);
        }
        let mut upload_failures = Vec::new();
        for pages in self.atlases.values_mut() {
            for page in pages {
                if !page.dirty {
                    continue;
                }
                match renderer.upload_ui_texture_rgba8(
                    &page.key,
                    ATLAS_SIZE,
                    ATLAS_SIZE,
                    &page.pixels,
                ) {
                    Ok(()) => page.dirty = false,
                    Err(error) => upload_failures.push((page.key.clone(), error.to_string())),
                }
            }
        }
        for (key, error) in upload_failures {
            self.report_failure(
                &key,
                self.project_root.clone().unwrap_or_default(),
                format!("dynamic font atlas upload failed: {error}"),
            );
        }
    }

    fn retire_all_atlases(&mut self) {
        self.retired_textures.extend(
            self.atlases
                .values()
                .flat_map(|pages| pages.iter().map(|page| page.key.clone())),
        );
        self.atlases.clear();
    }

    fn retire_font_atlases(&mut self, font: &str) {
        let keys = self
            .atlases
            .keys()
            .filter(|key| key.font == font)
            .cloned()
            .collect::<Vec<_>>();
        for key in keys {
            if let Some(pages) = self.atlases.remove(&key) {
                self.retired_textures
                    .extend(pages.into_iter().map(|page| page.key));
            }
        }
    }

    fn report_failure(&mut self, key: &str, path: PathBuf, error: String) {
        let identity = format!("{key}\0{}\0{error}", path.display());
        if !self.reported_failures.insert(identity) {
            return;
        }
        self.failures.push(FontLoadFailure {
            key: key.into(),
            path,
            error,
        });
    }

    fn font(&mut self, reference: &str) -> Option<(String, String, FontArc)> {
        let key = reference.trim().replace('\\', "/");
        let root = self.project_root.as_deref()?;
        if !key.starts_with("Assets/") {
            self.report_failure(
                &key,
                root.to_path_buf(),
                "font must be stored under the project Assets directory".into(),
            );
            return None;
        }
        let Some(path) = resolve_project_asset_path(root, &key) else {
            self.report_failure(
                &key,
                root.to_path_buf(),
                "font must be a project-relative path without '..'".into(),
            );
            return None;
        };
        if !matches!(path.extension().and_then(|value| value.to_str()), Some(value) if value.eq_ignore_ascii_case("ttf") || value.eq_ignore_ascii_case("otf"))
        {
            self.report_failure(&key, path, "font must use .ttf or .otf".into());
            return None;
        }
        if self.checked_fonts.insert(key.clone()) {
            if let Ok(metadata) = std::fs::symlink_metadata(&path) {
                let confined = !metadata.file_type().is_symlink()
                    && root
                        .canonicalize()
                        .ok()
                        .zip(path.canonicalize().ok())
                        .is_some_and(|(root, path)| path.starts_with(root));
                if !confined {
                    self.report_failure(
                        &key,
                        path,
                        "font path must resolve inside the project without symbolic links".into(),
                    );
                    return None;
                }
            }
            let stamp = file_stamp(&path);
            let stale = self
                .fonts
                .get(&key)
                .is_none_or(|cached| cached.stamp != stamp);
            if stale {
                self.retire_font_atlases(&key);
                self.reported_failures
                    .retain(|identity| !identity.starts_with(&format!("{key}\0")));
                let loaded = load_font_file(&path);
                let revision = loaded
                    .as_ref()
                    .map(|(revision, _)| revision.clone())
                    .unwrap_or_default();
                self.fonts.insert(
                    key.clone(),
                    CachedFont {
                        stamp,
                        revision,
                        result: loaded.map(|(_, font)| font),
                    },
                );
            }
        }
        let cached = self.fonts.get(&key)?.clone();
        match cached.result {
            Ok(font) => Some((key, cached.revision, font)),
            Err(error) => {
                self.report_failure(&key, path, error);
                None
            }
        }
    }

    fn geometry(
        font: &FontArc,
        character: char,
        font_size: f32,
        font_style: &str,
    ) -> GlyphGeometry {
        let size = quantized_size(font_size) as f32;
        let scaled = font.as_scaled(size);
        let glyph_id = scaled.glyph_id(character);
        let advance = scaled.h_advance(glyph_id).max(0.0);
        let line_height = (scaled.ascent() - scaled.descent() + scaled.line_gap()).max(1.0);
        let glyph = glyph_id.with_scale_and_position(size, point(0.0, scaled.ascent()));
        let outlined = font.outline_glyph(glyph);
        let bold = matches!(font_style, "Bold" | "BoldAndItalic");
        let italic = matches!(font_style, "Italic" | "BoldAndItalic");
        let bold_pixels = if bold {
            (size * 0.04).round().max(1.0) as u32
        } else {
            0
        };
        let (base_left, base_top, base_width, base_height) = outlined
            .as_ref()
            .map(|glyph| {
                let bounds = glyph.px_bounds();
                (
                    bounds.min.x,
                    bounds.min.y,
                    bounds.width().max(0.0) as u32,
                    bounds.height().max(0.0) as u32,
                )
            })
            .unwrap_or((0.0, 0.0, 0, 0));
        let italic_pixels = if italic {
            (base_height as f32 * 0.2).ceil() as u32
        } else {
            0
        };
        let width = base_width
            .saturating_add(bold_pixels)
            .saturating_add(italic_pixels);
        let height = base_height;
        let geometry = (width > 0 && height > 0).then_some((base_left, base_left + width as f32));
        GlyphGeometry {
            advance: advance + bold_pixels as f32,
            metric_width: geometry.map_or(advance, |(_, right)| advance.max(right)),
            line_height,
            geometry,
            bounds: [base_left, base_top, width as f32, height as f32],
            width,
            height,
            bold_pixels,
            italic_pixels,
        }
    }

    fn rasterize(
        font: &FontArc,
        character: char,
        font_size: f32,
        geometry: &GlyphGeometry,
    ) -> Option<Vec<u8>> {
        if geometry.width == 0 || geometry.height == 0 {
            return None;
        }
        let size = quantized_size(font_size) as f32;
        let scaled = font.as_scaled(size);
        let glyph = scaled
            .glyph_id(character)
            .with_scale_and_position(size, point(0.0, scaled.ascent()));
        let outlined = font.outline_glyph(glyph)?;
        let base = outlined.px_bounds();
        let base_width = base.width().max(0.0) as u32;
        let base_height = base.height().max(0.0) as u32;
        let mut source = vec![0_u8; (base_width * base_height) as usize];
        outlined.draw(|x, y, coverage| {
            if x < base_width && y < base_height {
                source[(y * base_width + x) as usize] =
                    (coverage.clamp(0.0, 1.0) * 255.0).round() as u8;
            }
        });
        let mut output = vec![0_u8; (geometry.width * geometry.height) as usize];
        for y in 0..base_height {
            let italic = if base_height > 1 {
                ((base_height - 1 - y) as f32 / (base_height - 1) as f32
                    * geometry.italic_pixels as f32)
                    .round() as u32
            } else {
                0
            };
            for x in 0..base_width {
                let coverage = source[(y * base_width + x) as usize];
                if coverage == 0 {
                    continue;
                }
                for bold in 0..=geometry.bold_pixels {
                    let target_x = x + italic + bold;
                    if target_x < geometry.width {
                        let target = &mut output[(y * geometry.width + target_x) as usize];
                        *target = (*target).max(coverage);
                    }
                }
            }
        }
        Some(output)
    }

    fn total_atlas_pages(&self) -> usize {
        self.atlases.values().map(Vec::len).sum()
    }
}

impl UiFontResolver for RuntimeFontCache {
    fn measure_glyph(
        &mut self,
        reference: &str,
        character: char,
        font_size: f32,
        font_style: &str,
    ) -> Option<UiFontGlyphMetrics> {
        let (_, _, font) = self.font(reference)?;
        let geometry = Self::geometry(&font, character, font_size, font_style);
        Some(UiFontGlyphMetrics {
            advance: geometry.advance,
            metric_width: geometry.metric_width,
            line_height: geometry.line_height,
            geometry: geometry.geometry,
        })
    }

    fn measure_pair_kerning(
        &mut self,
        reference: &str,
        left: char,
        right: char,
        font_size: f32,
        _font_style: &str,
    ) -> Option<f32> {
        let (_, _, font) = self.font(reference)?;
        let scaled = font.as_scaled(quantized_size(font_size) as f32);
        Some(scaled.kern(scaled.glyph_id(left), scaled.glyph_id(right)))
    }

    fn resolve_glyph_texture(
        &mut self,
        reference: &str,
        character: char,
        font_size: f32,
        font_style: &str,
    ) -> Option<UiFontGlyphTexture> {
        let (font_key, revision, font) = self.font(reference)?;
        let atlas_key = AtlasKey {
            font: font_key.clone(),
            revision,
            size: quantized_size(font_size),
            style: style_key(font_style),
        };
        if let Some(glyph) = self
            .atlases
            .get(&atlas_key)
            .and_then(|pages| pages.iter().find_map(|page| page.glyphs.get(&character)))
        {
            return Some(glyph.clone());
        }
        let geometry = Self::geometry(&font, character, font_size, font_style);
        let alpha = Self::rasterize(&font, character, font_size, &geometry)?;
        if let Some(glyph) = self.atlases.get_mut(&atlas_key).and_then(|pages| {
            pages.iter_mut().find_map(|page| {
                page.insert(
                    character,
                    geometry.width,
                    geometry.height,
                    &alpha,
                    geometry.bounds,
                )
            })
        }) {
            return Some(glyph);
        }
        if self.total_atlas_pages() >= MAX_ATLAS_PAGES {
            self.report_failure(
                &font_key,
                self.project_root.clone().unwrap_or_default(),
                format!("dynamic font atlas budget exhausted at {MAX_ATLAS_PAGES} pages"),
            );
            return None;
        }
        let page_index = self.atlases.get(&atlas_key).map_or(0, Vec::len);
        let mut digest = Sha256::new();
        digest.update(atlas_key.font.as_bytes());
        digest.update(atlas_key.revision.as_bytes());
        digest.update(atlas_key.size.to_le_bytes());
        digest.update([atlas_key.style]);
        let identity = format!("{:x}", digest.finalize());
        let mut page =
            FontAtlasPage::new(format!("mengine-font://{}/{page_index}", &identity[..16]));
        let glyph = page.insert(
            character,
            geometry.width,
            geometry.height,
            &alpha,
            geometry.bounds,
        )?;
        self.atlases.entry(atlas_key).or_default().push(page);
        Some(glyph)
    }
}

fn style_key(font_style: &str) -> u8 {
    match font_style {
        "Bold" => 1,
        "Italic" => 2,
        "BoldAndItalic" => 3,
        _ => 0,
    }
}

fn quantized_size(font_size: f32) -> u16 {
    if font_size.is_finite() {
        font_size.round().clamp(1.0, 512.0) as u16
    } else {
        16
    }
}

fn file_stamp(path: &Path) -> FileStamp {
    let Ok(metadata) = std::fs::metadata(path) else {
        return FileStamp::default();
    };
    FileStamp {
        modified: metadata.modified().ok(),
        length: Some(metadata.len()),
    }
}

fn load_font_file(path: &Path) -> Result<(String, FontArc), String> {
    let metadata = std::fs::metadata(path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
        return Err("font path is not a regular file".into());
    }
    if metadata.len() > MAX_FONT_BYTES {
        return Err(format!("font exceeds {MAX_FONT_BYTES} byte limit"));
    }
    let bytes = std::fs::read(path).map_err(|error| error.to_string())?;
    let revision = format!("{:x}", Sha256::digest(&bytes));
    let font = FontArc::try_from_vec(bytes).map_err(|error| error.to_string())?;
    Ok((revision, font))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn font_paths_are_confined_and_invalid_data_fails_softly_once() {
        let root = std::env::temp_dir().join(format!(
            "mengine-font-cache-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets/Fonts")).unwrap();
        std::fs::write(root.join("Assets/Fonts/broken.ttf"), b"not a font").unwrap();
        let mut cache = RuntimeFontCache::new(Some(root.clone()));
        assert!(cache
            .measure_glyph("../outside.ttf", 'A', 16.0, "Normal")
            .is_none());
        assert!(cache
            .measure_glyph("../outside.ttf", 'A', 16.0, "Normal")
            .is_none());
        assert!(cache
            .measure_glyph("ProjectSettings/outside.ttf", 'A', 16.0, "Normal")
            .is_none());
        assert!(cache
            .measure_glyph("Assets/Fonts/broken.ttf", 'A', 16.0, "Normal")
            .is_none());
        assert!(cache
            .measure_glyph("Assets/Fonts/broken.ttf", 'A', 16.0, "Normal")
            .is_none());
        let failures = cache.take_failures();
        assert_eq!(failures.len(), 3);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn installed_font_is_measured_rasterized_and_shared_in_one_atlas() {
        let source = [
            PathBuf::from(r"C:\Windows\Fonts\arial.ttf"),
            PathBuf::from("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"),
            PathBuf::from("/System/Library/Fonts/Supplemental/Arial.ttf"),
        ]
        .into_iter()
        .find(|path| path.is_file());
        let Some(source) = source else {
            return;
        };
        let root = std::env::temp_dir().join(format!(
            "mengine-font-render-{}-{}",
            std::process::id(),
            SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        std::fs::create_dir_all(root.join("Assets/Fonts")).unwrap();
        std::fs::copy(source, root.join("Assets/Fonts/Test.ttf")).unwrap();
        let mut cache = RuntimeFontCache::new(Some(root.clone()));

        let wide = cache
            .measure_glyph("Assets/Fonts/Test.ttf", 'W', 24.0, "Normal")
            .unwrap();
        let narrow = cache
            .measure_glyph("Assets/Fonts/Test.ttf", 'I', 24.0, "Normal")
            .unwrap();
        assert!(wide.advance > narrow.advance);
        assert!(wide.line_height > 0.0);
        let kerning = cache
            .measure_pair_kerning("Assets/Fonts/Test.ttf", 'A', 'V', 24.0, "Normal")
            .unwrap();
        assert!(
            kerning < 0.0,
            "expected the installed AV pair to tighten, got {kerning}"
        );
        assert_eq!(cache.checked_fonts.len(), 1);
        let first = cache
            .resolve_glyph_texture("Assets/Fonts/Test.ttf", 'W', 24.0, "Normal")
            .unwrap();
        let repeated = cache
            .resolve_glyph_texture("Assets/Fonts/Test.ttf", 'W', 24.0, "Normal")
            .unwrap();
        let second = cache
            .resolve_glyph_texture("Assets/Fonts/Test.ttf", 'I', 24.0, "Normal")
            .unwrap();
        assert_eq!(first, repeated);
        assert_eq!(first.key, second.key);
        assert!(first.key.starts_with("mengine-font://"));
        assert_eq!(cache.total_atlas_pages(), 1);
        assert!(cache
            .atlases
            .values()
            .flat_map(|pages| pages.iter())
            .flat_map(|page| page.pixels.chunks_exact(4))
            .any(|pixel| pixel[3] > 0));
        assert!(cache.take_failures().is_empty());
        cache.begin_frame();
        assert!(cache.checked_fonts.is_empty());
        assert!(cache
            .measure_glyph("Assets/Fonts/Test.ttf", 'A', 24.0, "Normal")
            .is_some());
        assert_eq!(cache.checked_fonts.len(), 1);
        let _ = std::fs::remove_dir_all(root);
    }

    #[test]
    fn quantized_sizes_and_style_keys_are_bounded_and_stable() {
        assert_eq!(quantized_size(f32::NAN), 16);
        assert_eq!(quantized_size(-100.0), 1);
        assert_eq!(quantized_size(9999.0), 512);
        assert_eq!(style_key("BoldAndItalic"), 3);
        assert_eq!(style_key("unknown"), 0);
    }
}
