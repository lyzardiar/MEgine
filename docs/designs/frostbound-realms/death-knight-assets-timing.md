# Death Knight source preview and renderer validation timing

Author: MiYu

2026-10-09. The isolated source preview has forty entities and reuses the existing editor build directory. Native timing includes RPC and owned shutdown, and excludes asset conversion, fixture preparation, implementation and the full development task. These measurements cannot be used as an overall development speedup ratio.

The baseline preview completed in 11.359 seconds. It passed parsing/reference checks but showed incorrect multiply cloud rendering; its visual result is explicitly rejected. Original effect conversion completed within a 6.542-second command observation, including conversion subprocesses and validation. Rules/profile/import verification are separate checks, and source imports were revalidated after adding base resurrection definitions.

The runtime sampled-effect test command completed in 1 minute 28 seconds of build time, followed by four passing tests in 0.01 seconds. It reused D:/MEngineNativeQA/construction-build. The required Release editor rebuild after the native rendering change took 7 minutes 21 seconds with link-time optimization. No frontend build was needed because frontend source was unchanged.

The final native preview completed in 11.802 seconds: project readiness 1.474 seconds, specimen rendering/queries 9.016 seconds, with the remaining time covering owned shutdown and report completion. The authoritative timings are in native-death-knight-assets-qa.json. It has the same specimen scene, source effect bytes, sampled frames and camera as the baseline. death-knight-native-image-validation.json checks source/scene fingerprints, repaired cloud regions and unchanged hero pixels. The first rebuilt preview's mesh-pipeline-counter assertion failure is retained separately and is not counted as a successful acceptance.

Measured remaining costs in this stage are the required native Release link and process/scene initialization. The broader gameplay input/step batching optimization is still pending. No timing claim here covers gameplay integration or the complete Warcraft recreation.
