# Shadow Hunter source assets and rules

Author: MiYu

Oshd source rules, original command cards, Healing Wave lightning, Serpent Ward and all sixteen Hex form identities are prepared for gameplay integration. `game/shadowhunter.js` exposes source attributes, growth, missile parameters, E/X/W/V cards, ranked spell values, ward profiles and deterministic form selection. The current simulation and generated client still run the committed Tauren gameplay stage; Shadow Hunter gameplay is not registered yet.

The signed rules identify Healing Wave as 130/215/300 healing, 3/4/5 total targets, 25% reduction per bounce, range 7 and bounce radius 5. Hex lasts 15/30/45 seconds on ordinary units and 4/5/6 on heroes; DataA 99 is maximum creep level. All source animal forms have movement speed 100, converted to world speed 1. Ply4/DataD selects amphibious Sheep/Penguin, and Ply5/DataE selects their floating identities. Land and water identities preserve their original separate scales and movement types despite sharing source model stems.

Serpent Wards have 75/135/135 HP, average piercing damage 12/24.5/43, range 6, attack cooldown 1.5, zero movement, 40-second lifespan and ACmi magic immunity. The source launch height is 2.25, missile speed 9 and arc 0.15. Big Bad Voodoo has radius 8, duration 30, cost 200 and cooldown 180. Its source targeting is air/ground/friend/vulnerable/invulnerable, excluding the caster; it must not inherit an organic-only helper filter.

The effect importer explicitly supports declared particle-only bindings and checks their MDX chunks before geometry conversion. PolyMorphDoneGround and VoodooAuraTarget contain emitters without geosets and are exported as sampled effects with no substitute geometry. HealingWaveTarget, VoodooAura and both original missiles retain geometry. The original Serpent Ward emitters and Shadow Hunter body clips are preserved separately.

Validation completed:

- `node scripts/test-frost-shadowhunter-profile.mjs`: original attributes, ranks, command cards, editor meanings, sixteen form identities, lightning and browser/CommonJS parity passed.
- `python scripts/test-frost-shadowhunter-assets.py`: 517 signed files, 186 deterministic GUIDs, 17 body models, four spell geometry models, eight native effects and 574 native geometry pose samples passed. Four asset packs reproduced byte-for-byte with the game archive unavailable. Modified outputs and corrupt sources were rejected.
- `python scripts/test-frost-effect-import-compatibility.py --refresh-receipts`: Swordmaster/Blademaster, Far Seer and Tauren effects reproduced 106/278/152 existing outputs byte-for-byte. Only the shared importer provenance changed in their receipts.
- `node scripts/qa-frost-shadowhunter-assets.mjs`: native Hex-form and spell previews passed with zero console errors and zero material-pipeline rejections. The owned editor exited normally; runtime, discovery, isolated fixture and storage cleanup passed. `native-shadowhunter-assets-qa.json` records exact source/editor fingerprints. Screenshots are `shadowhunter-native-hex-forms.png` and `shadowhunter-native-source-effects.png`.

The successful small preview completed in 12.256 seconds: project open/ready 1.403 seconds, form snapshot 7.915 seconds, and spell snapshot 1.590 seconds. These stages include their RPC calls and must not be added to command durations. This preview has 87 entities and is not comparable to full-game gameplay QA. Two earlier attempts remain in separate reports: the first used authored entity ids after native remapping; the second rendered both snapshots but waited on an unsaved-scene close confirmation. The preview now resolves live ids by name and saves the disposable scene before shutdown. The second attempt's editor was subsequently closed normally after cancelling its confirmation and saving through the existing bridge; its orphaned temporary directory remains because automatic approval rejected its cleanup command. No forced process termination was used.

Next gameplay integration points, from the completed read-only review:

- Register fourth Orc hero class 3, source profile, versioned world/save state and protocol. Reuse source hero recruitment, attributes, AI, command cards and original portrait.
- Healing Wave needs eligible organic friendly/self targets, ordered unique bounces with reduction, source HWPB/HWSB geometry and target effect. Use the actual caster and ward missiles.
- Hex keeps ownership/movement control; block attacks in both targeting and exported fire paths. Block all casting/autocast paths, cancel pending weapon windup and existing casts/channels immediately, and override movement rate without corrupting saved base speed. Render the selected original animal form and restore the original body at expiry.
- Wards require stationary placement, ranked damage/HP, magic immunity, expiry, launch position, native body animation and embedded emitters.
- Voodoo enters common invulnerability/damage protection. It must stop immediately on commands, death, stun, Hex, Cyclone and forced displacement, and protection must derive from the current legal channel and range. Do not trust saved protection flags.
- Restore must validate source/rank/duration/form/channel; public state must redact enemy internal casts and attribution. Dedicated gameplay, generated-client, F5, actual TCP and full native gameplay acceptance remain pending.

Source extraction does not establish a free redistribution license; the original asset ownership notice and the converter MIT license are retained. Original-game solver parity, campaign, cross-machine LAN, full map editor and classic TD/Dota parity remain incomplete. The full Warcraft III goal remains active.
