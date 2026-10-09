# Crypt Lord source assets and portrait camera

Author: MiYu

The original Ucrl hero profile, AUim/AUts/AUcb/AUls spell fields, six summon unit rows, Abu2/Abu3 burrow commands, Aloc, source icons and AI skill builds are reproducibly imported. The portable profile is `samples/frostbound-realms/game/crypt-lord.js`. These files are preparatory; the product simulation and client do not yet select this profile or execute these spells.

The asset pack contains original Impale hit/miss/stun effects, four Spiked Carapace attachment effects, Scarab and Locust geometry/animations, Locust missile particles and Crypt Lord embedded emitters. Beetle source scales remain 0.9/1.1/1.3, selection scales 1.25/1.5/1.75; burrow forms retain source scales 1.1/1.3 and disabled weapons. Existing general importers and earlier asset receipts remain unchanged.

`scripts/import-frost-animated-portrait.py` preserves MDX camera position/target/roll tracks, interpolation, tangents, global sequences and source animation windows. `game/portrait-camera.js` samples them at animation time in engine coordinates. The original portrait idle window starts at 3333ms and talk starts at 20000ms. The initial view samples the idle start, including its nonzero source offsets. Idle Bezier motion is retained even when the endpoint values match. The product portrait client still needs to call this sampler with its actual portrait animation clip/time.

Validation completed:

- `node scripts/test-frost-crypt-lord-profile.mjs`: original attributes, ranked spell meanings, distinct summon scales/forms, source cards/AI and browser parity.
- `node scripts/test-frost-portrait-camera.mjs`: step/linear/Hermite/Bezier interpolation, sequence windows, looping, global clocks, source offsets, quaternion look direction and browser parity.
- `python -X utf8 scripts/test-frost-crypt-lord-assets.py`: 250 verified files, 9 geometry models, 11 native effect parsers, 102 pose samples; byte-identical offline reproduction, modified-output/corrupt-source rejection and malformed camera rejection. 8599ms.
- `node scripts/qa-frost-crypt-lord-assets.mjs`: 83-entity native fixture, 30 rendered objects, source-scale beetles/burrow poses, original body/portrait, native profile execution and live Bezier camera motion. Startup 1853ms, whole run 10741ms, zero console errors/shader rejections. Owned editor exited normally; fixture and QA storage removed.

Evidence: `crypt-lord-assets-validation.json`, `native-crypt-lord-assets-qa.json`, `crypt-lord-native-source-assets.png`. Receipt fingerprints cover sources, generators, cached tools and generated files. Original artwork remains Blizzard property; source extraction does not establish a free redistribution license.

Next integration:

1. Add versioned authoritative Crypt Lord state/profile selection for skirmish faction 3, hero class 3, plus strict save/network projections.
2. Implement Impale while keeping wave time, airborne time and stun fields distinct. Establish whether source stun/airborne times overlap through runtime evidence before claiming Warcraft timing parity.
3. Add Spiked Carapace armor and eligible melee reflection without treating DataB as a reflection cap.
4. Implement corpse-consuming permanent beetles, five-summon limit, autocast and actual burrow forms, including visibility/commands/save/network paths.
5. Implement moving Locust entities, release intervals, per-target limit, damage return accumulation and return-to-hero healing. Validate original return-cap semantics before claiming original-runtime parity.
6. Connect source command cards/effects/attachments, source-scaled bodies and animated live portrait. Rebuild product artifacts once integration is ready; use small authoritative/native fixtures during iteration.

Gameplay, HUD/commands, multiplayer, physical input/audio and original Warcraft runtime parity are not established by this asset milestone.
