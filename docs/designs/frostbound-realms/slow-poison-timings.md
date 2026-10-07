# Slow Poison native acceptance timings

Author: MiYu

These are measured native stage/command timings. Stage totals exclude initial fixture copying, final shutdown and cleanup. They are not gameplay FPS or full-task Token measurements.

| Run | Result | Open/ready seconds | Validation seconds | Recorded stage total seconds |
| --- | --- | ---: | ---: | ---: |
| 1 | FAIL | 82.533 | 332.654 | 415.187 |
| 2 | FAIL | 73.819 | 298.148 | 371.967 |
| 3 | PASS | 77.932 | 322.627 | 400.559 |

Run one failed because the fixture placed two spell targets at the same position. Run two accepted B dispel but failed expiration because the caster resumed ordinary attacks and applied new poison. The final run validates distinct targets and moves the caster away after casting. The generated-client rehearsal of this exact shared fixture now gates future native runs before an editor is launched.

The first two failed runs consumed 787.154 measured stage seconds. Running the control rehearsal before native launch is the concrete workflow change that prevents this class of repeated native fixture debugging. The successful run uses one editor and one combined scene with two loads; independent rule/client/TCP regression runs concurrently.

| Native command | Calls | Total seconds | Longest call seconds |
| --- | ---: | ---: | ---: |
| playback.step | 44 | 183.767 | 20.765 |
| playback.input | 43 | 77.661 | 3.422 |
| entity.get | 31 | 57.259 | 3.231 |
| panel.focus | 1 | 37.812 | 37.812 |
| project.open | 1 | 13.055 | 13.055 |
| project.state | 2 | 10.456 | 5.908 |
| view.screenshot | 3 | 9.753 | 3.302 |
| playback.play | 1 | 6.700 | 6.700 |
| view.set_game_resolution | 1 | 3.992 | 3.992 |
| playback.stop | 1 | 0.323 | 0.323 |
| profiler.get_samples | 1 | 0.112 | 0.112 |
| console.get_logs | 1 | 0.028 | 0.028 |

Bridge input/step work and heavy-scene lifecycle are the main measured native costs. Reducing redundant load/input/query operations is the next workflow target; runtime FPS needs its own profiler measurement. Source extraction/regeneration, Git signing checks and pure JavaScript rules are outside this native timing table.

The successful editor exited normally and its fixture/storage were removed. Automatic approval rejected deletion of the two failed QA fixtures with only `blocked by policy`; their directories remain in the native QA cache. Their compact failure records are retained in this task's ignored temporary evidence.
