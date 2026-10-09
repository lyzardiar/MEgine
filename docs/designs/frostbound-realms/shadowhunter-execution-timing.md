# Shadow Hunter native acceptance timing

Author: MiYu

Timings cover native acceptance phases, include their RPC calls and exclude preceding fixture copies/preflight. They are not total development time. The scene contains 77,125 entities and reuses the existing Release editor without a native rebuild.

| Stage | Seconds |
| --- | ---: |
| project open and ready | 87.963 |
| source hero, original portrait and E/X/W/V cards | 38.045 |
| Healing Wave primary and secondary source ribbons with F5 continuation | 95.956 |
| Hex native animal body, source scale and saved restoration | 70.547 |
| Serpent Ward Birth, original embedded effect and save | 39.190 |
| Voodoo native channel protection and F5 then Stop | 82.363 |
| Total | 414.064 |

| Command | Count | Total seconds | Median seconds |
| --- | ---: | ---: | ---: |
| playback.step | 61 | 180.291 | 2.329 |
| playback.input | 60 | 83.714 | 1.994 |
| entity.get | 41 | 54.010 | 1.908 |
| project.open | 1 | 27.624 | 27.624 |
| panel.focus | 1 | 24.175 | 24.175 |
| project.state | 3 | 14.267 | 5.007 |

Command totals overlap phase timings and must not be added. Final-hash Hex-only acceptance took 192.814 seconds; it rechecked only the changed event/presentation path plus required initialization and F5. The other native skill phases were retained from the full report. These runs have different scopes and do not establish a speedup ratio. Independent regressions ran alongside native acceptance, prior generated hero checks were not repeated after the Hex-only event change, and final product generation was reproduced in an independent output root.

Remaining measured costs are startup, sequential input/step/query calls and large-scene state/render refresh. Ordered input/step batching is still pending. Request traces are necessary to separate runtime stepping, snapshot export, bridge refresh and frontend rendering.
