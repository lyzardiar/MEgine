# Tauren Chieftain original source assets and rules

Author: MiYu

The original Tauren Chieftain body and portrait already exist in `orc-hero-models.json`. `game/tauren.js` now defines source attributes/growth, a 0.47-second cast point, W/T/E/R command cards and the exact Shockwave, War Stomp, Endurance Aura and Reincarnation parameters. The running simulation still needs to register and execute this profile. Full Warcraft III single-player, multiplayer, editor, classic TD and Dota parity remains an active project objective.

Source rules: level-one HP 725, maximum mana 225, initial mana 100, average ordinary damage 32, melee range 1.28, cooldown 2.05, damage point 0.36 and model scale 1.1. Shockwave deals 75/130/200 damage per ground target, caps total damage at 900/1560/2400, travels eight world units at speed 10.5 and has final radius 1.25. War Stomp deals 25/50/75 damage in radii 2.5/3/3.5, stunning ordinary units for 3/4/5 seconds and heroes for 2/3/4 seconds. Endurance Aura provides 10/20/30 percent movement and 5/10/15 percent attack speed in radius nine. Reincarnation has a seven-second regeneration delay and a 240-second cooldown. The original editor metadata labels AOre DataA as regeneration delay; its separate Cast field is three seconds. Runtime death/revival behavior must be verified independently.

Converted bindings: ShockwaveMissile, WarStompCaster, CommandAura, ReincarnationTarget and ClassicTaurenChieftainEmbedded. The conversion preserves original geometry/layer states, textures, particles, body ribbons and animation clips. Reincarnation has distinct Death, Stand and Birth clips; the Tauren body has Spell Slam and Attack Slam clips. Shader and sampled-effect solver parity with the original game is not established by conversion.

Validation entries:

- `node scripts/test-frost-tauren-profile.mjs`: original attributes, item bonuses, ranked ability field meanings, source editor labels, passive/active cards, Unicode names and CommonJS/browser parity.
- `python scripts/test-frost-tauren-assets.py`: 157 signed files, 57 deterministic GUIDs, 54 original geometry pose samples, offline byte-identical reconstruction, modified-output rejection and corrupt-source rejection. Report: `tauren-assets-validation.json`.
- `node scripts/qa-frost-tauren-assets.mjs`: isolated native preview of original body, embedded ribbons and four spell snapshots. Report: `native-tauren-assets-qa.json`; image: `tauren-native-source-assets.png`. A passing preview proves native asset mounting/rendering within this fixture; it does not prove live spell execution.

Next: register Otch in the existing source-hero simulation/UI/client paths. Implement travelling Shockwave with per-target hits and total-damage cap, organic ground War Stomp with hero-specific duration and immediate channel interruption, strongest-source Endurance Aura and source limits, and death-time Reincarnation with cooldown/hero lifecycle/economy rules. Add save/restore and authoritative TCP continuation, then validate the complete native gameplay path. Physical input, audio, original-game solver parity and cross-machine LAN remain unverified.

Native source preview passed in 10.779 seconds: 16 render objects, 75 sampled-effect primitives, zero console errors and zero rejected material pipelines. The owned editor exited normally; runtime/discovery, fixture and isolated storage were removed. This fixture exercises four original effect clips and the original body/ribbon together without opening the full 71,077-entity game scene.

Receipts: `tauren-rules-sources.json` and `tauren-effects-sources.json`; original body/portrait provenance remains in `orc-hero-art-sources.json`. The rules generator reuses signed Orc tables and records additional original editor strings without changing `asset-library`. Existing Far Seer gameplay outputs remain unchanged.
