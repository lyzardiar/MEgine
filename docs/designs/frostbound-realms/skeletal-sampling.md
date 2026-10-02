# Frostbound Realms: finer skeletal poses

Author: MiYu

The shared glTF pose sampler accepts `model.glb#pose=clip:frame@rate`, with sampling rates from 1 to 60 Hz and a bounded 100-second frame index. References without a rate retain their 12 Hz behavior. The existing `parse_gltf_pose` and `GltfPoseSource.sample` APIs remain available; runtime rendering and Player asset validation resolve the explicit rate. The geometry inspection example uses the same parser and sampler.

World unit bodies request 30 Hz poses. Idle, walking and work loops keep their existing periods, including clips whose legacy frame count does not divide evenly at the new rate. Attack and cast geometry samples the authoritative phase with finer precision; rule cooldowns and cast phases remain at the simulation cadence. This stage does not interpolate combat timers or change hit/projectile timing. Portrait and corpse poses retain their existing 12 Hz references.

Native pose meshes remain shared by identical references and use the existing bounded mesh cache. Skinning still happens on the CPU when a pose first enters that cache; this stage does not introduce GPU skinning. New-rate geometry at the same timestamp matches the old sampler exactly, and intermediate samples move actual weighted vertices and equipped geometry.

Validation covers legacy/new reference limits, invalid rates, 11 downloaded skeletal characters, their intermediate native geometry, 30 Hz world-client pose requests, preserved loop periods and frozen paused poses. Full rule/TCP and native runtime checks are recorded alongside the final Player measurements. Native observation fixtures read snapshots every tick, so their frame rates include observation overhead.

Current validation passed: Node rules and real TCP; asset library 55/0; real character geometry 3/0; native QuickJS 4/0; runtime mesh checks 5/0; native 3D editor rendering and worker input; standalone native pose and pause observations. The final pose trace records 20 walking mesh changes at 12 Hz versus 25 at 30 Hz under intrusive snapshot observation. The real-client fixed-60-FPS test observes at least 25 distinct body poses per second; the native observation fixture itself runs near 20 FPS and cannot independently measure a 30-FPS physical display.

Normal Player measurements compare the current runtime against the client from `51a244a`, with identical assets, cameras and 2560 by 1440 viewport. Each mode has a 5-second warmup and three 5-second windows. Median changes are small and do not establish an FPS improvement.

| Mode | 12 Hz median FPS | 30 Hz median FPS | Change |
|---|---:|---:|---:|
| 遭遇战 | 51.141 | 51.262 | +0.24% |
| MOBA | 44.867 | 43.731 | -2.53% |
| 塔防 | 53.150 | 54.153 | +1.89% |

Reports: `native-player-poses-before-skirmish.json`, `native-player-poses-skirmish.json`, `native-player-sampling-before-*.json`, `native-player-performance-*.json` and `native-3d-qa.json`. The editor QA executable is compiled separately with `tauri/custom-protocol`; its exact path and hash are in the native report. The user's already running main editor remains open.

Release package: 715 hash-validated files, 30-second responsive startup and zero logged errors. Content SHA-256: `c110f6ddd3f95e24d3716de0e74be4053e24bf1b3d6b25fb1618149469f8bd80`. Complete stage evidence: `skeletal-sampling-validation.json`.
