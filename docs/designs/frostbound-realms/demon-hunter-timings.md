# Demon Hunter measured validation timings

Author: MiYu

Only recorded durations are listed. Implementation, import, full regression wall time, copying and shutdown were not completely timed. Native command totals overlap stage durations.

| Step | Seconds |
|---|---:|
| Final full AI economy (2400 simulated seconds) | 39.972 |
| Native skills: project open and ready | 64.430 |
| Native skills: original hero geometry, learned source keys and target spell | 220.342 |
| Native skills: native Immolation, alternate demon mesh and F5 continuation | 176.014 |
| Final native portrait: project open and ready | 61.921 |
| Final native portrait: final native source portrait and HUD | 138.401 |

| Native command across the two successful reports | Calls | Seconds |
|---|---:|---:|
| playback.step | 54 | 292.437 |
| playback.input | 52 | 162.354 |
| entity.get | 20 | 65.274 |
| project.open | 2 | 39.389 |
| panel.focus | 2 | 33.037 |
| view.screenshot | 5 | 24.417 |
| playback.play | 2 | 19.046 |
| project.state | 4 | 13.437 |
| view.set_game_resolution | 2 | 11.591 |
| playback.stop | 2 | 0.803 |
| profiler.get_samples | 2 | 0.169 |
| console.get_logs | 2 | 0.077 |

Two recorded diagnostic portrait attempts consumed 53.996 + 157.013 seconds and 62.642 + 127.794 seconds. Their assertion queried the normal geoset, which is intentionally hidden in alternate clips. The final check verifies the visible alternate geoset, the source clip and displayed armor. The generated-client test now checks source visibility for all four portrait geosets before native startup.

The first 224-group regression reused the separately passed economy run. The final command-rejection fix affected command handling, so the complete standard entry was rerun once and passed 225 groups. Native startup and bridge playback/input/query round trips remain the largest recorded costs; specific renderer/bridge causes require profiling.
