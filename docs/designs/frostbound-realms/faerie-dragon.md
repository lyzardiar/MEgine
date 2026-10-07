# Faerie Dragon source production and spells

Author: MiYu

Protocol 54 and new-game faerieVersion 1 add the original efdr unit to Ancient of Wind slot 2 (F). A living, completed source Ancient of Wonders (existing production Ancient shop, eden) is required. Training costs 155 gold, 25 lumber and 2 food and lasts 25 seconds; it is available with Tree of Ages, without the generic tier-three flyer gate. Existing rooted/uprooted Wonders rules and shop inventory are reused.

Source unit data: 450 HP, light armor 0, speed 350, flight height 240, initial/max mana 75/200, mana regeneration .75/s and night healing .5/s. Pierce weapon deals 13 + 1d3, has 300 horizontal range, .5s front swing, 1.75s cooldown and a homing 900-speed missile with .15 arc. Strength of the Wild adds dice and Reinforced Hides adds 2 armor per rank. The source unit leaves no corpse and has Magic Immunity. No Ultravision research membership is inferred from Ault.

Phase Shift occupies slot 8 (E); default autocast is sourced from UnitAbilities. It costs 20 mana, lasts 1.5s and has 6.5s cooldown. During the current disappearance state the unit cannot attack, move or be damaged, and opponents cannot target or see it. The owner retains selection and the source special effect binding. Right-click toggles autocast. Standard movement/stop orders end disappearance. Manual shifting interrupts Mana Flare.

Mana Flare occupies slot 9 (F); the current fixed-step implementation uses the source .75s cast, 50 mana, 30s channel, 20s cooldown and +12 armor while channeling. Completed eligible spell expenditures react in 750 range. Ordinary casters take 3 damage per mana capped at 90; hero casters take 1 damage per mana capped at 50. Explicit spell-cost hooks cover hero spells, caster spells, Raise Dead, Purge against Sentinels, Druid spells/morphs, Abolish Magic and Phase Shift. Moon Well transfer, regeneration, drains and inventory uses are excluded. Movement, Stop, death, stun, Cyclone, Sanctuary and staff transport end channeling. Armor is derived from channel state, never persisted as an extra base-armor increment.

Source body, portrait, attack missile and five spell models/effects are signed and imported into Assets/FaerieDragon. The body, original perspective portrait, phase effect, channel base, target/impact effects and transient Mana Flare missile are bound to the client. Missile art uses its source animation duration as a presentation interval; authoritative reaction damage is immediate. All converted paths and material references are namespaced, and regeneration refuses changed output before writing. The shared asset library is read-only.

Save validation checks the feature version, source derived stats, timers, autocast type, state ownership, order/channel consistency, Wind queue identity and historical missile trajectory. Opponents do not receive the private autocast setting. The server executes the same simulation; new protocol 54 is required.

Native initialization uses the existing indexed entity lookup in batches of at most 512. Static roots are loaded initially and actual model/effect child nodes are loaded when displayed. Inactive pool nodes stay disabled, and front menus skip unit animation/node sampling. Older script hosts retain the snapshot fallback.

## Original runtime boundaries

Source tables establish numeric fields and original art, not engine state-machine timing. Impact-triggered Phase Shift autocast, in-flight cancellation, order interruption and interaction with channeling are provisional. Mana Flare cast-event eligibility, mitigation/cap order, proc interval, caster-only/splash semantics and visual flight interval require original Warcraft runtime comparison. DataE=12 is supported by the armor tooltip; its conflicting localized metadata label is not treated as a 12-second proc period. No area splash damage is invented from DataF. The source portrait camera is sampled at frame zero; animated camera tracks are retained in the receipt but not played. These boundaries prevent a full original-game equivalence claim.

Native, generated-client and authoritative TCP evidence are recorded separately. Agent playback does not establish physical input, audio or cross-machine LAN acceptance. The full Warcraft III recreation remains incomplete.
