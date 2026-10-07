# Dryad Slow Poison

Author: MiYu

New games give Dryad missiles the `Aspo` passive. A successful impact on an eligible enemy organic unit applies damage over time and movement/attack slowdown. The command card uses the original Chinese name, tooltip, passive icon and slot nine. The target status uses converted original `PoisonStingTarget` particles. Expiration, friendly Abolish Magic, Wisp Detonate, Purge and lightning-orb dispel remove the current implementation's status. Anti-magic Potion clears it synchronously. Timers continue while a Wisp mines; self-consumption, summon expiration and death clear poison before immediate save validation.

## Original source evidence and limits

`slow-poison-rules.json` preserves the original ability and buff rows. `UI/UnitEditorData.txt [stackFlags]` maps bits zero through three to damage, movement, attack rate and killing. `Aspo.DataD1=1` enables damage only. Source values are four damage per second, five seconds on ordinary units, one second on heroes, 50% movement reduction and 25% attack reduction. The kill flag is unset. Original Dryad `UnitAbilities.auto=Aadm` establishes its configured initial Abolish autocast preference; it becomes active once the research is available.

The implementation currently times every impact independently and sums its damage. Repeated and multiple attackers retain their individual application timers; poison slows do not stack. Damage uses fixed simulation ticks and caps at one HP. These choices are provisional: editor fields do not establish how the original game attributes repeated hits, schedules damage, or handles immunity and dispelling. Source-derived settings and passing MEngine tests must not be described as verified Warcraft runtime equivalence. The original Warcraft reference has no confirmed map load/probe result.

## Persistence and networking

Protocol 50 carries the poison presentation state. New saves use `dryadVersion=2`. Prior version-one saves retain attacks without poison and their earlier default-off spawning; explicit existing autocast settings remain intact. Save validation rejects forged source/projectile identities, invalid times, duplicate impacts, impossible ownership and poison display fields. A missing caster does not stop an existing application. Both teams' public views receive only aggregate remaining time, without application source and impact records.

## Reproduce and verify

Run `python scripts/import-frost-slow-poison.py --check` for byte-exact regeneration of the 13 signed outputs and receipt. The importer uses patch-priority MPQ data and protects previously edited outputs. Source ownership remains Blizzard's; extracting these assets does not establish free redistribution rights.

Run `node scripts/build-frostbound.mjs`, then `node scripts/test-frostbound.mjs`. Targeted suites are `test-frost-slow-poison.mjs`, `test-frost-slow-poison-client.mjs` and `test-frost-slow-poison-network.mjs`. They cover real missile impacts, hero timing, provisional stacking, nonlethal damage, save continuation, legal mining/potion/consumption boundaries, public-state privacy, the generated passive card/particles, F5, and real TCP disconnect/resume/dispelling.

The validation receipt distinguishes canonical Git-blob hashes (`sourceFiles`) from local file bytes (`workingSourceFiles`), including Windows line endings. Imported original assets retain their signed bytes in both the checkout and Git. Native bundle and generated scene hashes identify the exact local product exercised by acceptance.

`qa-frost-slow-poison.mjs` first runs the generated-client checks, including its shared native fixture's full control sequence. The sequence validates separate attack/dispel targets, exact poison restoration and moving the caster away before expiration. A failed rehearsal stops before an editor is launched. It then runs an isolated native editor against the generated bundle. Its report records hashes, timings, screenshots, shader validation and owned-process cleanup. Native input comes through the MEngine bridge. Its friendly dispel target starts with a validated source-missile application; the enemy target is poisoned by a native right-click attack. Physical desktop input, audio listening and cross-machine LAN are outside this acceptance. Final results are recorded in `slow-poison-validation.json`.
