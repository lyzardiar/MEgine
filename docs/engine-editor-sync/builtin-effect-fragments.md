# Builtin sampled-effect fragment options

Standard sampled effects carry alpha cutoff and Multiply RGB premultiplication as per-instance UI data. They use the existing builtin blend/depth/stencil pipelines. Cutoff values do not create shader variants or split otherwise compatible batches. Authored custom UI hooks remain supported with their existing input interface.

The fragment order is texture/custom hook, positive alpha cutoff, optional RGB premultiplication, stencil alpha rejection, then soft clipping. Default options are zero/false. The instance stride is 184 bytes, with 13 vertex attributes and 30 inter-stage components; the layout and WGSL validator test check the relevant downlevel limits. This does not establish support for the complete renderer on WebGL2.

The preceding native attribution captured the standard Multiply/zero-cutoff shader fingerprint `201eb84499d30ad4` at live revision 563 in both views. Game spent 37.4658 ms compiling it and Scene spent 38.7373 ms. This change removes that generated custom shader from the sampled-effect path.

## Validation

Library suite: 354 passed, zero failed, four ignored. The GPU pixel regression compares full RGBA output with the generated-hook implementation for fractional texture/vertex alpha, cutoff boundaries, Multiply plus cutoff, UV channels, clip-space corners, depth occlusion, scissor, soft clipping, default UI, and stencil push/test/pop. Builtin renders must create zero custom/error pipelines. Runtime coverage checks effect extraction, preserved UV/corners/depth, and batch compatibility across different cutoff values.

Log: `D:/MEngineNativeQA/builtin-effect-fragments-libs.log`.

CPU durations describe API wall time, including possible driver waits; they are not GPU execution times.

## Release acceptance

`D:/MEngineNativeQA/rpg-multiview-builtin-effect-fragments-after-1792084494104/report.json`: passed, zero console errors, normal exit, fixture restored. The live screenshot was inspected; active SmallBuildingFire0/1 effects were present at the end. Across warmup and live gameplay, both views recorded zero custom UI shader attempts/builds and zero error pipelines. Live UI preparation maximum was 0.321 ms in Game and 0.0708 ms in Scene. Loading still created three unrelated authored UI pipelines, taking 179.1145 ms combined.

WebView2 WebGPU on the AMD RDNA 2 adapter successfully compiled the actual builtin WGSL and 184-byte instance layout into Alpha and Multiply pipelines, with no compiler or validation messages. This validates the browser shader/interface, not complete browser gameplay or browser pixel equivalence. The native GPU test provides the pixel-equivalence coverage.

Live presentation median/P95/max was 30.5/66.9/153.7 ms in Game and 29.3/43.7/75.2 ms in Scene. These are observational samples, not a controlled whole-frame speedup measurement. Scene revision 403 still spent 44.3292 ms in vertex-buffer allocation/upload. Game's longest 153.7 ms presentation interval contained 25.1239 ms of measured native rendering, so that interval must not be attributed entirely to the render backend. Initial material setup and remaining CPU/transport/scheduling costs are still open performance work.

Detailed counts and timings: `builtin-effect-fragments-native.json`. Release package: `D:/MEngineNativeQA/releases/editor-builtin-effect-fragments-20261016/mengine-editor-tauri.exe`; its manifest records binary hashes, matching Release/Debug V8 player identities, and final source revisions.
