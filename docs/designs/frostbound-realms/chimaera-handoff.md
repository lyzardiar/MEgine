# Chimaera handoff

Author: MiYu

Implemented protocol 53, new-game chimaeraVersion 1, source Roost construction/production, source Corrosive Breath research and target-aware two-weapon combat. The original body, portrait, Roost and missile art use separate signed catalogs/runtime paths. Existing source library, root catalog and protected scene are preserved.

Validation: 186 full regression PASS groups; exact regeneration and protected-output asset tests; generated source client; authoritative TCP research/train/combat/reconnect; native full 60s training and 40s research with F5 continuation, original models and acid impact. Agent input was used. The native fixture tested the final generated Main.js and a regenerated scene; the source workspace scene was restored byte-for-byte afterward. Evidence: chimaera-validation.json, native-chimaera-qa.json and chimaera-timings.md.

Reproduce: python scripts/import-frost-chimaera.py; python scripts/test-frost-chimaera-assets.py; node scripts/build-frostbound.mjs; node scripts/test-frostbound.mjs; node scripts/qa-frost-chimaera.mjs. Back up and restore the existing authored scene around the builder. Preserve preexisting dirty files and screenshots; stage only the phase manifest.

Pending original measurements: overlapping weapon selection, shared cooldown, acid homing, splash allegiance/immunity edge behavior and acid animation. No extra Acor DOT is inferred. Full original game parity remains active and unfinished. A future source production phase can cover Faerie Dragon; AI should also gain an explicit Night Elf air production strategy. Existing coupling life/effect transfer measurements remain outstanding.
