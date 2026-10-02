# Frostbound Realms: continuous 3D movement

Author: MiYu

Unit bodies, selection rings, health bars, flags, sleep markers and auras update on every render tick. Camera panning and zoom also update each tick. The heavier terrain and HUD refresh retains its 80 ms interval, with immediate refresh for input, placement previews and selection drags.

Unit positions interpolate between authoritative simulation states without extrapolation. Walking remains active between simulation ticks, and paused single-player bodies and mesh poses freeze. New games, restored games and network joins clear interpolation and heading history. Hidden units leave the track set; snapshot rewinds and gaps discard stale positions. Position changes greater than three world units snap immediately, including same-tick Blink commands. Rule simulation and skeletal pose sampling remain at their existing rates; skeletal sampling is still 12 Hz.

The real-client VM test covers movement, walking, displayed-position picking, immediate HUD response, pause, camera movement, new-game reset, network states, disappearing/reappearing units, snapshot rewind/gaps, Blink and joining with reused IDs. The full Node rules and real TCP suite passed. Native QuickJS integration passed 4 tests with 0 failures.

Standalone native component observations compare the client from `71076ce` with the current client using the same short movement and pause fixture at 2560 by 1440. Model position changes increased from 13 to 25; the current trace contains 17 authoritative position changes and 8 model changes within an unchanged authoritative frame. Paused models and poses freeze in the current trace. This fixture reads native scene snapshots every tick and reduces its own frame rate to approximately 20–22 FPS; those numbers are observation overhead, not a normal Player benchmark.

Separate Player measurements without per-frame scene observation were 53.013 / 48.662 / 51.519 FPS before the movement change and 51.092 / 49.158 / 50.135 FPS after it, at the same resolution. These short runs support continuous movement at approximately the same frame rate, not an FPS improvement or whole-match performance guarantee. Physical display presentation, mouse operation and audio listening are not measured by these fixtures.

Evidence: `continuous-motion-before-player.json`, `native-player-performance-skirmish.json`, `native-player-motion-before-skirmish.json`, `native-player-motion-skirmish.json`, `native-classic-hud-qa.json` and `player-smoke.json`. Raw native motion traces and logs remain in the isolated directories recorded by the motion reports.

The Release package contains 715 hash-validated files. Content SHA-256: `a9ad634fec72c04904e9520aee142a9b22762687768274c240f7e49a3c2c10a5`.

Final native HUD acceptance passed selection, inventory, minimap, worker construction preview, pause, save/load, editor controls and all four faction skins, with zero rejected pipelines. The packaged Player remained responsive for 30 seconds with zero logged errors. Three normal Player modes were also checked: skirmish 49–51 FPS, MOBA 40–45 FPS and tower defense 53–56 FPS.

A matching MOBA baseline reconstructed from `71076ce` measured 44.701 / 38.372 / 42.860 FPS, compared with 44.750 / 39.819 / 43.975 FPS for the current client. These short windows show no material movement-related frame-rate regression. `native-player-performance-before-moba.json` records the baseline.
