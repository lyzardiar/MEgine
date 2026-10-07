# Faerie Dragon handoff

Author: MiYu

Protocol 54 adds source efdr production at Wind slot 2 (F), completed Wonders prerequisite, 155/25/2 cost and full 25s training. Source body, portrait, attack missile, command icons and five spell effects are signed in a separate namespace. Phase Shift and Mana Flare integrate with source numeric data, save validation, private autocast state and authoritative spell-cost events. Channel armor ends with movement, interruption, Sanctuary or staff transport. Target art plays Birth, one Stand and Death before removal. Indexed client initialization avoids decoding the entire scene snapshot during startup.

Validation: 194 final regression PASS groups, 289-output exact regeneration/protected-write test, generated-client action/effect tests and authoritative TCP. Full native QA covers 25s training, F5 continuation, phase disappearance, complete 30s channel and attack/spell reaction. Its generated artifact predates the final cooldown-epsilon and target-effect-lifecycle fixes; the focused native report validates those fixes against the final Main.js hash. Reports and timings are recorded separately. Agent playback was used; physical input/audio and cross-machine LAN are unverified.

Reproduce: python scripts/import-frost-faerie-dragon.py; python scripts/test-frost-faerie-dragon-assets.py; node scripts/build-frostbound.mjs; node scripts/test-frostbound.mjs; node scripts/qa-frost-faerie-dragon.mjs; node scripts/qa-frost-faerie-dragon.mjs --focused. Back up the authored scene before building and restore it afterward. Shared asset-library is read-only, the root catalog remains preserved and the authored scene is restored byte-for-byte. Generated Main.js/scene are build outputs.

Full Warcraft III recreation remains active and incomplete. Original runtime comparisons still need Phase trigger/order semantics and Mana Flare event/proc/cap/splash timing. The source portrait camera uses frame zero; animated tracks are retained but not played. Future work can cover the Night Elf air-production AI and original-game interaction measurements.
