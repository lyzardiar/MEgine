use mengine_effekseer::{DependencyKind, EffectManager};
use std::{collections::BTreeSet, env, fs, process::ExitCode};

const DEPENDENCY_KINDS: [DependencyKind; 7] = [
    DependencyKind::ColorTexture,
    DependencyKind::NormalTexture,
    DependencyKind::DistortionTexture,
    DependencyKind::Model,
    DependencyKind::Material,
    DependencyKind::Sound,
    DependencyKind::Curve,
];

fn main() -> ExitCode {
    let Some(path) = env::args().nth(1) else {
        eprintln!("usage: inspect_effect <effect.efk|effect.efkefc>");
        return ExitCode::from(2);
    };
    let bytes = match fs::read(&path) {
        Ok(bytes) => bytes,
        Err(error) => {
            eprintln!("failed to read {path}: {error}");
            return ExitCode::FAILURE;
        }
    };
    let mut manager = match EffectManager::new(16_384) {
        Ok(manager) => manager,
        Err(error) => {
            eprintln!("failed to create Effekseer manager: {error}");
            return ExitCode::FAILURE;
        }
    };
    let effect = match manager.load_effect_named(&bytes, &path) {
        Ok(effect) => effect,
        Err(error) => {
            eprintln!("failed to load {path}: {error}");
            return ExitCode::FAILURE;
        }
    };

    for kind in DEPENDENCY_KINDS {
        match manager.dependencies(effect, kind) {
            Ok(paths) => {
                for dependency in paths {
                    println!("{kind:?}\t{dependency}");
                }
            }
            Err(error) => {
                eprintln!("failed to inspect {kind:?} dependencies: {error}");
                return ExitCode::FAILURE;
            }
        }
    }

    let handle = match manager.play(effect, [0.0, 0.0, 0.0]) {
        Ok(handle) => handle,
        Err(error) => {
            eprintln!("failed to play {path}: {error}");
            return ExitCode::FAILURE;
        }
    };
    let mut peak_triangles = 0;
    let mut peak_models = 0;
    let mut draw_textures = BTreeSet::new();
    let mut draw_models = BTreeSet::new();
    for _ in 0..180 {
        manager.update_seconds(1.0 / 60.0);
        let draw = manager.capture(
            [1.0, 0.0, 0.0],
            [0.0, 1.0, 0.0],
            [0.0, 0.0, -1.0],
            [0.0, 1.5, 4.0],
        );
        peak_triangles = peak_triangles.max(draw.triangles.len());
        peak_models = peak_models.max(draw.models.len());
        draw_textures.extend(
            draw.triangles
                .iter()
                .map(|triangle| triangle.texture.clone())
                .chain(draw.models.iter().map(|model| model.texture.clone()))
                .filter(|path| !path.is_empty()),
        );
        draw_models.extend(
            draw.models
                .iter()
                .map(|model| model.model.clone())
                .filter(|path| !path.is_empty()),
        );
        if !manager.exists(handle) {
            break;
        }
    }
    for texture in draw_textures {
        println!("DrawTexture\t{texture}");
    }
    for model in draw_models {
        println!("DrawModel\t{model}");
    }
    println!("DrawPeak\ttriangles={peak_triangles}\tmodels={peak_models}");
    ExitCode::SUCCESS
}
