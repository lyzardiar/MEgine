# Lich source preparation and native preview timing

Author: MiYu

2026-10-09. This source stage reuses the existing sampler, node metadata reader, native bounds probe and Release editor. No Rust or frontend rebuild was needed. Original effect conversion completed in the observed 5.223-second command. Offline reproduction, integrity rejection and native parsing checks completed within the observed 6.328-second command, which also prepared the test script; these observations do not measure total development time.

The final 47-entity native preview completed in 11.070 seconds, including owned shutdown/report completion. Exact project readiness and render/query phase times are in native-lich-assets-qa.json. The small preview validates original assets at source scale before integration into the full client; its narrower scope cannot substitute for gameplay acceptance, and comparison with the Death Knight full-scene runs is not a like-for-like speedup claim.

An independent read-only source review ran alongside importer work and confirmed spell field mappings before gameplay implementation. Native input batching remains pending. Gameplay will retain generated-client/TCP checks and final native integration evidence.
