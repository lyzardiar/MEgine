# Mountain Giant measured timings

Author: MiYu

Native wall-clock data. Stage and command totals overlap; fixture copy and normal shutdown are outside measured stages. Supplemental tests overlap the standard suite. Do not add their counts/timings.

| Native stage | Seconds |
|---|---:|
| Generated-client preflight | 1.585 |
| project open and ready | 54.959 |
| source Giant body, portrait and Lore slots | 118.581 |
| G full 50s training and F5 continuation | 368.075 |
| H and T full 40s and 75s skin research | 657.510 |
| W source tree weapon and T finite Taunt | 294.469 |

| Native command | Calls | Seconds |
|---|---:|---:|
| playback.step | 108 | 1030.896 |
| playback.input | 95 | 249.567 |
| entity.get | 53 | 135.829 |
| view.screenshot | 6 | 26.064 |
| project.open | 1 | 17.210 |
| panel.focus | 1 | 13.859 |
| playback.play | 1 | 8.352 |
| project.state | 2 | 6.094 |
| view.set_game_resolution | 1 | 5.316 |
| playback.stop | 1 | 0.455 |
| profiler.get_samples | 1 | 0.095 |
| console.get_logs | 1 | 0.040 |

The run uses indexed scene lookup, generated-client preflight and batches of at most 100 native simulation frames. Asset regeneration and isolated regression ran independently of native acceptance. Native playback and bridge round trips dominate acceptance.

Next optimizations: run the standard suite once and select only supplemental tests absent from its imports; support a validated press/step/release sequence command to reduce bridge synchronization. Preserve input edges, full source timers and F5 observation points. The initial broad driver timed out the aggregate entrypoint at 180 seconds; its successful streaming run is recorded separately. Separate historical runs do not establish workload speedup.
