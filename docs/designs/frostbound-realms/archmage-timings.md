# Archmage measured verification time

Author: MiYu

These are measured native stage durations from the Archmage QA reports and command logs. They exclude unmeasured implementation, fixture copying, cleanup, Git operations and independent work; they are not total development-time percentages.

| Run | Startup | Verification | Total measured stages |
| --- | ---: | ---: | ---: |
| Final gameplay | 56.807 s | 173.427 s | 230.234 s |
| Final visible effects | 56.628 s | 70.818 s | 127.446 s |
| Initial native float assertion | 60.194 s | 34.986 s | 95.180 s |
| Initial effect filename assertion | 56.073 s | 47.573 s | 103.646 s |
| Initial effect alpha assertion | 58.023 s | 47.308 s | 105.331 s |

Native engine builds: zero. The existing Release executable is reused. Measured successful native stages total 357.680 seconds. The three failed assertion runs add 304.157 seconds; those failures belong to the QA script, not the game's acceptance result. Native float comparisons now tolerate renderer precision, effect references use exact source casing and geometry activation is checked against original per-layer alpha tracks at the sampled phase.

Regression modules were run in the broad entry. After correcting its obsolete projectile field-list assertion for protocol 61, only the exact main acceptance body was repeated, with its source hash recorded in `archmage-validation.json`. Previously passed imported modules were not rerun for that assertion change. The independent importer reproduces 598 signed outputs and the scene/script rebuild is byte-identical.

Three failed fixtures are retained under `E:/work/codex/cache/mengine/native-qa`: `archmage-1791470635529`, `archmage-effects-1791471414810` and `archmage-effects-1791472058467`. Their Node owners were confirmed stopped, their discovery files were absent and their runtime directories were empty. Automatic approval rejected recursive removal with `blocked by policy`; removal was not retried. Successful gameplay/effects fixtures and their isolated saves were cleaned by the owned QA helper.
