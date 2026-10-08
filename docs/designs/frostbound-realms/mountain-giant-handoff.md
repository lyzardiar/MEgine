# Mountain Giant phase handoff

Author: MiYu

Source Mountain Giant now trains at Ancient of Lore slot 2 using 425 gold, 100 lumber, 7 food and the full 50-second timer. Completed Ages/Wonders gate production. Source body, independent portrait, icons, normal/siege weapons, upgrades and night regeneration are connected. War Club consumes a living tree after .8 seconds, grants 15 actual melee siege attacks, has a 2.5-second removal and 5-second cooldown. Taunt selects up to 10 eligible visible mobile attackers in radius 4.5, with 15-second cooldown and ordinary orders that players can override. Uninterruptible Druid transformations are preserved. Decaying Giant corpses cannot be used by Raise Dead, Rod or Cannibalize.

Hardened/Resistant Skin research uses source 100/175/40s and 50/100/75s prices/timers and completed Eternity/Wonders gates. Attack reduction and selected hero-duration spell hooks are implemented. Armor-order/magic classification and the full Resistant Skin immunity/hero-effect semantics remain unmeasured against original Warcraft. Current Taunt retains the caster's tree attachment; original interruption behavior is unverified.

Validation: 204 standard-suite PASS groups, generated-client actions/animations/F5, authoritative TCP privacy/reconnect/abilities, and exact regeneration/protected writes for 145 signed outputs. Native QA verifies source body/portrait, full50s training, full40s/75s research with F5 continuation, tree attachment/held-club art and finite Taunt geometry. The report includes exact generated artifact hashes, material diagnostics and normal owned-editor shutdown. Rule tests cover 15 attacks and defenses. The obsolete biome-tree expectation also fails against previous HEAD and is listed separately. Agent playback does not prove physical input, audio listening, original-runtime equivalence or cross-machine LAN.

Reproduce: python scripts/import-frost-mountain-giant.py; python scripts/test-frost-mountain-giant-assets.py; node scripts/build-frostbound.mjs; node scripts/test-frostbound.mjs; node scripts/qa-frost-mountain-giant.mjs. Back up the authored scene before building and restore it afterward. Shared asset-library remains read-only. Original provenance and license limits remain in the signed receipt/license.

Next: port original Night Elf AI strategy from signed elf.ai/common.ai now that its Mountain Giant prerequisite exists. Full Warcraft III recreation remains active and incomplete. Authored scene and root catalog are preserved. Stage only the phase manifest and verify signed index blobs before commit/push.
