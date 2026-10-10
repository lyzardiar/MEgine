# Private native Play copies

Author: MiYu.

EditorStore compares private editable native records by their pairing with factory-owned immutable records. Every record touched by find, sibling operations, visible hierarchy rows or Behaviour callbacks remains deeply checked. A legacy playViewportSnapshot exposes the array and all records, so it uses the complete comparison. Colors are always compared. When most records are exposed, the complete comparison avoids repeated per-record guards.

App uses playRenderSnapshot to read frozen native entities and colors, preserving array identity within each publication. Pending or generic data retains the existing mutable fallback. Native revisions and committed simulation clocks stay paired with their worlds. Unchanged record aliases survive native replies and are checked before the next upload; changed records, resets and restarts produce independent copies. Serialization-global changes invalidate private copies before the complete comparison, including Object.keys accessors and exposed Proxy hooks.

Forty-three focused tests pass, with a further nine-test ownership rerun covering the final global-hook alias case. Behaviour, frontend TypeScript/Vite and Native Release builds pass. The independent read-only review found no required corrections. Release embedding took 254 seconds; only one final native build was required.

The 24,671-entity real-store/native-driver fixture changes four records per mocked IPC delta and compares 22 complete outputs. Its internal-render mode exposes collapsed hierarchy rows while retaining private copies: median publication 19.740 to 4.856 ms; native reference lookup 14.347 to 0.360 ms. The public mutable mode still deeply checks all records: publication 16.593 to 18.731 ms and lookup 11.730 to 13.399 ms. No improvement is claimed for public mutable mode. These fixtures exclude actual IPC, native scripts, React and GPU.

Full native QA passes: hierarchy drag/rename/search/selection, Scene and Game spatial culling, F1 skirmish, continuous Play, paused edits, single step, authored restoration, Toggle/InputField, restart and Behaviour activation. Console errors: zero. Native presentation is 15.740 to 28.598 FPS across separate runs. Browser paint mean is 6.964 to 4.030 ms. Scene/script hashes and complete render counts match. These results do not establish stable 60 FPS or performance on other machines.

The QA receipt takes 221.050 seconds, preceded by 56.317 seconds of setup from observed Node creation. The complete wrapper window is 277.533 seconds. The owned editor exits normally and removes its discovery entry; the isolated runtime cache remains after EPERM. Receipt, source/binary hashes, CPU profile and measured samples are in private-play-copies-validation.json and native-play-state-spatial-private-copies.json; the raw profile is under tmp and retained locally.

Material metadata repair 2c555fa remains on the branch: all 3,151 tracked materials have tracked, valid and unique sidecars. The other computer's 2,736-file list was not provided, so its .mat.meta subset has not been individually identified. Unrelated catalog, images and reports remain outside this commit. The complete Warcraft III single-player/multiplayer/map editor/TD/Dota objective remains active and incomplete.
