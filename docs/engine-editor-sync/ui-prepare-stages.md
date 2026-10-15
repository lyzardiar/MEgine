# UI preparation CPU attribution

UI preparation exposes disjoint CPU wall-time scopes for buffer capacity/bindings, instance packing, queue writes, material lookup/texture sets, pipeline preparation and cache pruning. Custom shader composition/validation/module/pipeline creation and error pipeline creation are nested inside pipeline preparation. The slowest custom attempt carries its shader fingerprint. Rejected source attempts retain their time and attempt count; successful GPU creations are counted separately.

The renderer accumulates timings and counters across embedded views and the main view. Native profile counts distinguish UI custom attempts/builds, error builds, evictions, texture-set builds and buffer allocations from existing 3D material statistics. Buffer creation and queue-write timings are CPU API wall time, including possible driver waits, not GPU execution time. Temporary data cleanup and small bookkeeping remain in the enclosing remainder.

Drawing order, resource contents, cache policy and rendering behavior are unchanged. The headless stencil/material regression checks cold creation, warm reuse, invalid-source error fallback, cached rejection, grace-frame eviction, timing containment and accumulation. Multi-view pixel tests verify the accumulated UI timings fit the enclosing preparation scope.

Library suite: 352 passed, 0 failed, 4 ignored. Log: `D:/MEngineNativeQA/ui-prepare-stages-libs.log`.

Candidate source analysis of the previous native fixture found active SmallBuildingFire0/1 effects, whose Multiply/zero-cutoff generated shader fingerprints to `201eb84499d30ad4`. Alpha/0.75-cutoff fingerprints to `5b996cbe391855b7`. These values were calculated using the actual RHI fingerprint function and Rust formatter; only matching a native creation event establishes the relationship to a measured spike.

## Native evidence

`D:/MEngineNativeQA/rpg-multiview-ui-prepare-stages-after-1792083399142/report.json`: passed, zero console errors, normal exit, fixture restored, screenshot inspected. All expected scopes appeared and recursive containment passed. Live revision 563 created exactly one UI custom pipeline in each view. Fingerprint `201eb84499d30ad4` matches the generated Multiply/zero-cutoff sampled-effect shader: Game custom compilation 37.4658 ms of 37.6468 ms UI preparation; Scene 38.7373 ms of 38.8276 ms. The same frame had no buffer allocation, no pipeline eviction and one new texture set per view.

This establishes synchronous cold compilation of the standard Multiply sampled-effect shader as the observed UI spike. It does not implicate per-frame instance packing or UI buffer expansion. Live presentation median/P95/max: Game 32.3/64.5/110.1 ms, Scene 30.3/44.5/110.6 ms; observational only. Loading also created three custom UI pipelines (130.9283 ms combined) for other UI materials. Detailed evidence is in `ui-prepare-stages-native.json`.
