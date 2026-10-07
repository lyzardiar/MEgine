# Chimaera production and source art

Author: MiYu

New games use protocol 53 and `chimaeraVersion=1`. Older saves default to version 0 and retain their production rosters. The shared asset library and existing root model catalog are preserved. Source Chimaera art uses a separate signed catalog and `Assets/Chimaera` runtime paths.

The original `echm` body, portrait, `edos` Roost and both missile models come from the shared Warcraft III library. `chimaera-sources.json` records source hashes, generated output hashes and converter identities; `test-frost-chimaera-assets.py` verifies exact regeneration and refuses modified outputs. Original asset extraction does not establish redistribution permission.

| Source | Implemented behavior |
|---|---|
| `edos` | 1,200 HP, fortified armor 5, 140 gold / 190 lumber / 80 seconds; stationary mechanical building. Construction requires a completed Tree of Eternity and Ancient of Wind and consumes the building Wisp. |
| `echm` | 1,000 HP, light armor 2, 330 gold / 70 lumber / 5 food / 60 seconds; speed 250, flying height 280, no mana or persistent corpse, night regeneration 0.5 HP/s. |
| Weapon 2, default mask 2 | Magic attack, 66 + 1d17 damage, range 450, cooldown 2.5 seconds, damage point 0.5 seconds, lightning missile speed 1,500 and zero arc. |
| Weapon 1 | Siege attack, 44 + 1d11 damage, range 850, cooldown 2.5 seconds, damage point 0.7 seconds, acid missile speed 1,200 and zero arc; structure targets. |
| `Recb` | Roost B research, 125 gold / 225 lumber / 40 seconds; source `renw=3` opens both weapons. |

Source units are converted at 100 units per world unit. Original modelScale remains 1; the Chimaera and Roost retain their separate original geometry and selection scales 2 and 4. C trains a Chimaera in slot 0; B researches Corrosive Breath in slot 8. Wisp C selects Roost construction in slot 9; Night Elf Tree of Life and Ancient of War use B/R to avoid duplicate construction keys.

Strength of the Wild adds one corresponding damage die per rank. Reinforced Hides adds 2 armor per rank. Default magic damage and acid damage use their respective signed Warcraft damage tables. Projectiles retain weapon slot, launch technology and rolled damage after research changes or shooter death. A windup retains the chosen slot across research completion. Strict saves verify source stats, research ownership, queues, historical projectile slots and valid acid targets.

Lightning secondary damage uses the source 50/125/200 radii and 1/0.5/0.1 multipliers. Direct structure hits are allowed; structures and air units are excluded from secondary `ground,debris` splash. Magic-immune victims receive no magic attack or magic splash damage.

Source tables do not establish runtime arbitration when both weapons can attack a structure. The current policy selects acid for structures after research, retains lightning for other ground targets, uses one shared cooldown and follows moving acid targets. These policies, splash allegiance/immunity edge behavior, and the exact original acid animation remain unmeasured in the original game. `Acor` legacy fields are retained as evidence; no additional damage-over-time effect is inferred from them. Debris/destructible attacks outside the existing unit target system are not implemented by this phase.

This phase adds player-controlled construction, production, research and combat. The general AI has not gained a Roost production strategy. Full Warcraft III equivalence, campaigns, all editor capabilities and classic map parity remain unfinished.
