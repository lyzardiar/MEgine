//! Content signatures for the audited native particle shader adapter. Author: MiYu.
use crate::Asset;
use serde::Serialize;
use std::path::Path;

const ADAPTER: &str = "VFX/EffectURP_V2_3D";
const SHADER_SHA256: &str = "c25a174da3a7b77f9306d8591d441ae25f07ccdc2f48e2501dd8b76e0d8282b8";
// This is the complete project-source include closure of the byte-exact shader.
// Its fixed includes make paths part of the signature; unrelated package sources
// do not participate. Package-library behavior is the documented URP baseline.
const PROJECT_INCLUDES: &[(&str, &str)] = &[
    (
        "EffectV2_Pass.hlsl",
        "6f87029b29ab0e00885e6cdec94aa5e844501e2082a29b0980e1def685fe21ce",
    ),
    (
        "Assets/ABAssets/AssetBundle/shader_mini/CodeVEnvironmentMini.hlsl",
        "e49f6204bc56ea317153bc44e1f9a00f3fa5d5e512ac6991ad115672573a5fe3",
    ),
    (
        "Assets/ABAssets/AssetBundle/shader_mini/CodeVSceneInputMini.hlsl",
        "9513ff9c688e1c19b06dc0591db1be003d889c4de93d2c84d9baa04801d0ba9f",
    ),
    (
        "Assets/ABAssets/AssetBundle/shader_mini/CodeVSceneWindMini.hlsl",
        "41701833b96151bbf5a795b13a989b2d55a8b01c8f4f61a460b0d9491905bc96",
    ),
    (
        "Assets/ABAssets/AssetBundle/shader_mini/CodeVSafetyMini.hlsl",
        "17f385ecb95f9f5e777a8247671dd6415f0b4445b588f59be064c88a1de044bc",
    ),
    (
        "Assets/ABAssets/AssetBundle/shaders/WarFog.hlsl",
        "a812e2e54d32817d19a74c96ac56880f35a0b0d434dac06793bcac92cf448721",
    ),
];
pub(crate) const URP_BASELINE_NOTICE: &str = "VFX native adapter targets the audited URP 14.0.11 baseline; package URP version is unverified and other versions are not guaranteed equivalent";
const EXTERNAL_INCLUDES: &[&str] = &[
    "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl",
    "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl",
    "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareOpaqueTexture.hlsl",
    "Packages/com.unity.render-pipelines.universal/ShaderLibrary/LightCookie/LightCookie.hlsl",
    "Packages/com.unity.render-pipelines.core/ShaderLibrary/CommonMaterial.hlsl",
];

#[derive(Serialize)]
pub(crate) struct SourceSignature {
    path: String,
    expected_sha256: &'static str,
    actual_sha256: Option<String>,
}
#[derive(Serialize)]
pub(crate) struct Verification {
    pub adapter: &'static str,
    status: &'static str,
    pub reason: Option<String>,
    project_sources: Vec<SourceSignature>,
    external_urp_baseline: &'static str,
    external_urp_version_verified: bool,
    external_includes: &'static [&'static str],
}

pub(crate) fn verify(assets: &[Asset], shader_guid: &str) -> Verification {
    let mut result = Verification {
        adapter: "unsupported",
        status: "approximate",
        reason: None,
        project_sources: Vec::new(),
        external_urp_baseline: "14.0.11",
        external_urp_version_verified: false,
        external_includes: EXTERNAL_INCLUDES,
    };
    let Some(shader) = assets
        .iter()
        .find(|a| a.summary.guid == shader_guid && a.summary.kind == "shader_source")
    else {
        result.reason = Some("referenced shader source is missing".into());
        return result;
    };
    result.project_sources.push(SourceSignature {
        path: shader.summary.path.clone(),
        expected_sha256: SHADER_SHA256,
        actual_sha256: Some(shader.summary.sha256.clone()),
    });
    if shader.summary.sha256 != SHADER_SHA256 {
        result.reason = Some("shader source hash has no audited native adapter".into());
        return result;
    }
    for &(include, expected) in PROJECT_INCLUDES {
        let path = if include.starts_with("Assets/") {
            include.into()
        } else {
            Path::new(&shader.summary.path)
                .parent()
                .unwrap_or(Path::new(""))
                .join(include)
                .to_string_lossy()
                .replace('\\', "/")
        };
        let source = assets
            .iter()
            .find(|a| a.summary.path == path && a.summary.kind == "shader_source");
        let actual = source.map(|a| a.summary.sha256.clone());
        if actual.as_deref() != Some(expected) && result.reason.is_none() {
            result.reason = Some(format!("project shader dependency {path} is missing or its content hash differs from the audited source"));
        }
        result.project_sources.push(SourceSignature {
            path,
            expected_sha256: expected,
            actual_sha256: actual,
        });
    }
    if result.reason.is_none() {
        result.adapter = ADAPTER;
        result.status = "verified_project_sources";
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::AssetSummary;

    // AssetSummary hashes are computed from raw archive bytes by package().
    fn signed_inventory(guid: &str) -> Vec<Asset> {
        let mut files = vec![(
            "Assets/ABAssets/AssetBundle/shaders/EffectURP_V2_3D.shader".into(),
            SHADER_SHA256,
        )];
        files.extend(PROJECT_INCLUDES.iter().map(|&(path, hash)| {
            (
                if path.starts_with("Assets/") {
                    path.into()
                } else {
                    format!("Assets/ABAssets/AssetBundle/shaders/{path}")
                },
                hash,
            )
        }));
        files
            .into_iter()
            .enumerate()
            .map(|(index, (path, hash))| Asset {
                summary: AssetSummary {
                    guid: if index == 0 {
                        guid.into()
                    } else {
                        format!("{index:032x}")
                    },
                    path,
                    kind: "shader_source".into(),
                    sha256: hash.into(),
                },
                bytes: vec![],
                meta: vec![],
            })
            .collect()
    }
    #[test]
    fn identical_sources_with_different_shader_guids_share_adapter() {
        for guid in [
            "f31c201e480f44f9a78911601ee5cab2",
            "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        ] {
            let result = verify(&signed_inventory(guid), guid);
            assert_eq!(result.adapter, ADAPTER);
            assert_eq!(result.project_sources.len(), 7);
            assert!(!result.external_urp_version_verified);
        }
    }
    #[test]
    fn same_guid_modified_or_missing_project_sources_are_approximate() {
        let guid = "f31c201e480f44f9a78911601ee5cab2";
        for index in 0..7 {
            let mut changed = signed_inventory(guid);
            changed[index].summary.sha256 = crate::sha(b"different raw bytes");
            let result = verify(&changed, guid);
            assert_eq!(result.adapter, "unsupported", "changed {index}");
            assert!(result.reason.is_some());
            let mut missing = signed_inventory(guid);
            missing.remove(index);
            assert_eq!(
                verify(&missing, guid).status,
                "approximate",
                "missing {index}"
            );
        }
    }
    #[test]
    fn include_resolution_and_unrelated_sources_are_distinct() {
        let guid = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
        let mut assets = signed_inventory(guid);
        let mut unrelated = assets[1].clone();
        unrelated.summary.path = "Assets/unrelated.hlsl".into();
        unrelated.summary.sha256 = crate::sha(b"unrelated");
        assets.push(unrelated);
        assert_eq!(verify(&assets, guid).adapter, ADAPTER);
        assets[1].summary.path = "Assets/wrong/EffectV2_Pass.hlsl".into();
        assert_eq!(verify(&assets, guid).status, "approximate");
    }
}
