# Large-scene Play synchronization

Author: MiYu

The editor compares its live Play world with an owned JSON baseline. Unchanged scene data uses a value comparison; changes retain the existing JSON comparison semantics, including key order and serialization hooks. Capturing a native frame updates changed entity baselines instead of serializing the whole scene. Direct edits through viewport entities, hierarchy entities, Transform arrays, clearColor and component input aliases remain detectable. Start, stop and error clear the synchronization baseline; detached remote sessions capture their imported world.

The native Play driver retains a validated entity ID index. Frames with unchanged entity order reuse that index and copy the ordered array, replacing only changed entities. ID edits, reorder, additions, removal and explicit reset use the full validated merge. Revision mismatch, invalid order and expired asynchronous sessions retain their previous error behavior. Full merge commits the index only after validation succeeds.

## Validation

- 24 Node tests passed across Play synchronization, native runtime lifecycle, delta parity/error recovery, Inspector components/materials/resources, metadata, gizmos, Behaviour lifecycle and viewport clocks.
- JSON tests cover direct deep edits and restoration, external aliases, key order, entity/color serialization hooks, undefined, array holes, non-finite numbers, shared objects and cyclic-reference rejection. Delta tests compare 150 successive updates against the full merge and cover large IDs, duplicate changed payloads, extra payload entities, reset, direct ID changes and error recovery.
- Editor TypeScript and production Vite build passed. Native editor Release builds passed. The standalone acceptance build enables custom-protocol so the frontend is embedded; cfg(dev) shells require localhost:5173 and are excluded from standalone acceptance.
- Independent read-only review found no remaining correctness blocker within the scene JSON contract. Arbitrary JavaScript getter side-effect invocation counts and custom global array iteration/serialization overrides are outside this contract.

## Measurements

`benchmark-play-state.mjs` loads the actual 89853-entity Main.mscene in the real EditorStore. Its retained-runtime fixture measures unchanged-world synchronization; it excludes native execution, IPC, React and rendering. `play-state-baseline.json` and `play-state-optimized.json` retain sample durations and exact source hashes. The first isolated baseline measured median step 275.185 ms, session lookup 113.947 ms and individual whole-world serialization 106.678 ms. The current benchmark includes the 326 identity folders (90,179 records), retains exact source hashes and separates CPU fixture timings from native viewport timings.

`qa-frost-play-state.mjs` runs the same published Main.js/Main.mscene in one native editor, enters skirmish using actual F1 input, captures 45 seconds of continuous playback, and verifies pause/step/stop with authored-state restoration and normal owned-editor cleanup. The baseline receipt `native-play-state-before.json` passed with 69 viewport samples, mean frame interval 729.128 ms and p95 2675.100 ms. The prior updated shell failed before gameplay and is retained in native-play-state-after.json. The final standalone custom-protocol binary and grouped scene have functional acceptance in native-spatial-completion.json and timing details in native-play-state-spatial-viewport.json. These receipts distinguish successful viewport/game assertions from a deferred WebView cache cleanup failure. The old cfg(dev) baseline is observational and is not an isolated causal performance comparison with the embedded final frontend. This comparison is separate from the completed two-client Crypt Lord networking acceptance.

## Scope

Play synchronization and native delta processing are delivered alongside the hierarchy and spatial-culling milestone described in spatial-handoff.md. Gameplay sources, generated game assets and unrelated existing work remain intact. Full Warcraft III fidelity, campaigns, networking modes and editor parity remain incomplete. Further native scene compilation, rendering and JavaScript gameplay costs require separate measurement.
