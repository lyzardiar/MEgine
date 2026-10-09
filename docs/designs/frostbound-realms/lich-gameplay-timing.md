# Lich step timings

Author: MiYu. Timings are measured stage totals, excluding file-copy/bootstrap, shutdown and work outside these runs. They are not an end-to-end task-time estimate.

| Native run | Stage seconds | Evidence |
|---|---:|---|
| float32 comparison failure | 130.275 | native-lich-first-attempt.json |
| script loading deadline interruption | 101.136 | native-lich-startup-interruption.json |
| fixed FX slot assertion failure | 263.798 | native-lich-presentation-validation.json |
| final continuation passed | 264.082 | native-lich-qa.json |

Final regression suite: 66 groups / 7.903s. Final native startup: 108.296s. Final Decay/F5 acceptance: 93.429s.

The primary measured costs are loading the 83,029-entity scene and native interaction/save acceptance. Three failed native runs also consumed time: floating-point and dynamic FX-slot assertions were corrected in the QA runner; eager editor-map initialization was moved into the first runtime frame after the script deadline interruption. Final continuation reused previous presentation evidence. No Rust rebuild was performed. Native key/point input uses playback.sequence. Independent tests were bounded to three parallel processes.

Remaining optimization: build a small, reproducible native gameplay fixture for rapid iteration, with periodic full-scene integration and final visual acceptance. Keep float32 tolerances and query active effects instead of assuming fixed effect slots.
