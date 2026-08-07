use crate::{renderer::compose_surface_shader, ui::compose_ui_shader};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShaderBackendArtifact {
    pub backend: &'static str,
    pub language: &'static str,
    pub source: Option<String>,
    pub byte_size: usize,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ShaderCompilationReport {
    pub domain: &'static str,
    pub entry_points: Vec<String>,
    pub artifacts: Vec<ShaderBackendArtifact>,
}

/// Compiles one authored WGSL hook through the same composed Player shader
/// used at runtime, then proves the native wgpu targets can consume it.
pub fn compile_shader_backends(source: &str) -> Result<ShaderCompilationReport, String> {
    let compact = source
        .chars()
        .filter(|character| !character.is_whitespace())
        .collect::<String>();
    let (domain, composed) = if compact.contains("fnmengine_ui_hook(") {
        ("ui", compose_ui_shader(source, None)?)
    } else {
        ("surface", compose_surface_shader(source, None)?)
    };

    let module = naga::front::wgsl::parse_str(&composed)
        .map_err(|error| format!("WGSL parse failed: {error}"))?;
    let info = naga::valid::Validator::new(
        naga::valid::ValidationFlags::all(),
        naga::valid::Capabilities::all(),
    )
    .validate(&module)
    .map_err(|error| format!("WGSL validation failed: {error}: {error:?}"))?;
    let entry_points = module
        .entry_points
        .iter()
        .map(|entry| entry.name.clone())
        .collect::<Vec<_>>();

    let spirv =
        naga::back::spv::write_vec(&module, &info, &naga::back::spv::Options::default(), None)
            .map_err(|error| format!("Vulkan SPIR-V generation failed: {error}"))?;

    let hlsl_options = naga::back::hlsl::Options::default();
    let mut hlsl = String::new();
    naga::back::hlsl::Writer::new(&mut hlsl, &hlsl_options)
        .write(&module, &info, None)
        .map_err(|error| format!("Direct3D 12 HLSL generation failed: {error}"))?;

    let msl_options = naga::back::msl::Options {
        // UI instancing uses instance_id, available since MSL 1.2. Target the
        // modern Metal baseline used by wgpu instead of Naga's legacy 1.0 default.
        lang_version: (2, 4),
        ..Default::default()
    };
    let (msl, _) = naga::back::msl::write_string(
        &module,
        &info,
        &msl_options,
        &naga::back::msl::PipelineOptions::default(),
    )
    .map_err(|error| format!("Metal MSL generation failed: {error}"))?;

    Ok(ShaderCompilationReport {
        domain,
        entry_points,
        artifacts: vec![
            ShaderBackendArtifact {
                backend: "WebGPU",
                language: "WGSL",
                byte_size: composed.len(),
                source: Some(composed),
            },
            ShaderBackendArtifact {
                backend: "Vulkan",
                language: "SPIR-V 1.0",
                byte_size: spirv.len() * std::mem::size_of::<u32>(),
                source: None,
            },
            ShaderBackendArtifact {
                backend: "Direct3D 12",
                language: "HLSL 5.1",
                byte_size: hlsl.len(),
                source: Some(hlsl),
            },
            ShaderBackendArtifact {
                backend: "Metal",
                language: "MSL",
                byte_size: msl.len(),
                source: Some(msl),
            },
        ],
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn surface_hooks_compile_for_webgpu_vulkan_d3d12_and_metal() {
        let report = compile_shader_backends(
            r#"fn mengine_lit_surface_hook(
                surface: MEngineSurface,
                uv: vec2<f32>,
                world_position: vec3<f32>,
            ) -> MEngineSurface {
                var result = surface;
                result.emissive = vec3<f32>(uv, world_position.z);
                return result;
            }"#,
        )
        .expect("surface shader should cross-compile");

        assert_eq!(report.domain, "surface");
        assert_eq!(
            report
                .artifacts
                .iter()
                .map(|artifact| artifact.backend)
                .collect::<Vec<_>>(),
            ["WebGPU", "Vulkan", "Direct3D 12", "Metal"]
        );
        assert!(report
            .artifacts
            .iter()
            .all(|artifact| artifact.byte_size > 0));
        assert!(report.entry_points.iter().any(|entry| entry == "vs_main"));
        assert!(report.entry_points.iter().any(|entry| entry == "fs_main"));
    }

    #[test]
    fn ui_hooks_use_the_same_cross_backend_contract() {
        let report = compile_shader_backends(
            r#"fn mengine_ui_hook(input: MEngineUiInput) -> vec4<f32> {
                return input.vertex_color;
            }"#,
        )
        .expect("UI shader should cross-compile");
        assert_eq!(report.domain, "ui");
        assert_eq!(report.artifacts.len(), 4);
    }
}
