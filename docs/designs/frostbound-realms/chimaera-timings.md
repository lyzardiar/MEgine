# Chimaera native timings

Author: MiYu

Measured wall-clock durations from native-chimaera-qa.json. Runtime stage totals contain command execution; do not add the two tables together. Fixture copying and shutdown are outside the timed stages.

| Stage | Seconds |
|---|---:|
| Generated client preflight | 1.539 |
| project open and ready | 79.761 |
| original Chimaera body, Roost and portrait camera | 102.559 |
| C Roost source 60s production and F5 queue continuation | 332.905 |
| B Corrosive Breath source 40s research and acid attack | 305.137 |

| Command | Calls | Seconds |
|---|---:|---:|
| playback.step | 71 | 533.282 |
| playback.input | 64 | 128.177 |
| entity.get | 38 | 72.083 |
| panel.focus | 1 | 38.755 |
| project.open | 1 | 15.203 |
| view.screenshot | 4 | 13.177 |
| project.state | 2 | 8.341 |
| playback.play | 1 | 7.809 |
| view.set_game_resolution | 1 | 3.382 |
| playback.stop | 1 | 0.534 |
| profiler.get_samples | 1 | 0.082 |
| console.get_logs | 1 | 0.029 |

The current pipeline runs generated client preflight before opening an owned editor, uses an isolated source fixture, batches simulation steps in groups of 100 and executes the full regression suite independently while native QA runs. Successful fixtures close normally and are removed by the existing helper. The shared library is read-only.

The dominant remaining costs are playback stepping and repeated input/frame synchronization. A useful next optimization is a measured native command sequence that preserves input release and observation boundaries. Reduce duplicated load/selection observations only where the expected state is already verified; preserve full source training/research timing and saved continuation. Asset conversion is not the bottleneck.
