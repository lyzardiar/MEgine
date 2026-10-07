# Faerie Dragon measured timings

Author: MiYu

Wall-clock data from the two native reports. Stage and command totals overlap; do not add them together. Fixture copy and shutdown are outside the measured stages.

| Run / stage | Seconds |
|---|---:|
| Full generated-client preflight | 1.376 |
| Full: project open and ready | 53.982 |
| Full: source body, portrait and Wind slot | 112.562 |
| Full: F source 25s training and F5 continuation | 263.217 |
| Full: E Phase Shift and F 30s channel with F5 | 323.095 |
| Full: original missile and anti-caster reaction | 221.314 |
| Final focused generated-client preflight | 1.367 |
| Final focused: project open and ready | 50.283 |
| Final focused: final source rendering, cooldown expiry and target effect lifecycle | 147.647 |

| Run / command | Calls | Seconds |
|---|---:|---:|
| Full: playback.step | 95 | 568.095 |
| Full: playback.input | 90 | 208.703 |
| Full: entity.get | 53 | 123.652 |
| Full: view.screenshot | 6 | 23.617 |
| Full: project.open | 1 | 17.111 |
| Full: panel.focus | 1 | 13.827 |
| Full: project.state | 2 | 8.754 |
| Full: playback.play | 1 | 8.564 |
| Full: view.set_game_resolution | 1 | 1.645 |
| Full: playback.stop | 1 | 0.366 |
| Full: console.get_logs | 1 | 0.081 |
| Full: profiler.get_samples | 1 | 0.066 |
| Final focused: playback.step | 17 | 81.801 |
| Final focused: entity.get | 10 | 33.903 |
| Final focused: playback.input | 16 | 27.586 |
| Final focused: project.open | 1 | 15.898 |
| Final focused: panel.focus | 1 | 12.967 |
| Final focused: playback.play | 1 | 8.300 |
| Final focused: view.screenshot | 2 | 8.239 |
| Final focused: project.state | 2 | 7.236 |
| Final focused: view.set_game_resolution | 1 | 1.955 |
| Final focused: playback.stop | 1 | 0.376 |
| Final focused: profiler.get_samples | 1 | 0.049 |
| Final focused: console.get_logs | 1 | 0.033 |

Initialization now uses the existing indexed name lookup in batches of at most 512, with lazy model-child registration and inactive pool nodes. Front menus skip world unit animation sampling. The first successful full startup took 53.982s. The earlier Chimaera phase recorded 79.761s; these are separate runs, not a controlled speedup benchmark. Two earlier Faerie launches hit the QuickJS interruption limit before this change.

Generated-client preflight precedes native startup, the full regression runs independently, and native simulation advances in batches up to 100 steps. The final native pass reuses full production evidence and focuses on the changed lifecycle and cooldown behavior. Owned editors close normally.

The next measured optimization should reduce bridge input/frame round trips while preserving press/release boundaries, actual source-duration training, save continuation and observation points. Runtime stepping and bridge synchronization dominate the current native acceptance; conversion is not the principal wait.
