# Night Elf AI measured timings

Author: MiYu

Measured durations only; implementation, investigation, complete regression wall time, copying and shutdown were not fully timed and are not estimated. Native command totals overlap stage timings.

| Step | Seconds |
|---|---:|
| Funded Node economy, 1134 simulated seconds | 9.900 |
| Native opening run startup | 55.649 |
| Native original opening/F5, 220 fixed steps | 263.451 |
| Native late scene input check | 73.924 |
| Native late run startup | 54.636 |
| Native late source army and 20 fixed steps | 128.579 |

The opening evidence records a completed opening/F5 stage and a later viewport selection assertion. The final native run validates a visible Giant and the late scene. It reuses the opening only after exact editor, generated script and generated scene fingerprints match, avoiding another 220 native steps. `MENGINE_QA_OPENING_EVIDENCE` selects this verification mode; the default script runs all stages. The final aggregate native report is passed.

| Native command across recorded runs | Calls | Seconds |
|---|---:|---:|
| playback.step | 43 | 300.609 |
| playback.input | 40 | 105.108 |
| entity.get | 21 | 65.404 |
| project.open | 2 | 33.268 |
| panel.focus | 2 | 31.522 |
| playback.play | 2 | 17.519 |
| view.screenshot | 3 | 13.813 |
| project.state | 4 | 10.616 |
| view.set_game_resolution | 2 | 7.832 |
| playback.stop | 2 | 0.797 |
| console.get_logs | 2 | 0.164 |
| profiler.get_samples | 1 | 0.104 |

Native stepping, editor startup and UI query/input round trips dominate measured validation time. Source generation is reused and checked exactly, the standard suite is run once after implementation fixes, the independent review is read-only, and native continuation uses fingerprinted stage evidence. Further bridge/rendering profiling is needed before attributing this wall time to a specific engine bottleneck.
