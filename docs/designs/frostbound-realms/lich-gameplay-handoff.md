# Lich gameplay delivery

Author: MiYu. Protocol 72; source Lich is enabled in skirmish with lichVersion=1, Undead faction and heroClass=1. Older saves default to lichVersion=0.

Implemented original body, portrait, scales, hover, homing missile, N/F/R/D command and research cards, and source sampled effects. Nova supports hidden area victims while requiring a visible primary target. Armor lasts 45 seconds, chills melee attackers for 5 seconds, and preserves orders during automatic casting. Ritual pays mana before converting current target health. Decay channels for 35 seconds, deals 4% maximum life per second, affects allied units and magic immunity, and destroys trees. Source armor reduction factor is 1.

Accepted Stop cancels idle automatic casting. Avatar and reincarnation clear hostile frost. Order changes, control, death and transport interrupt active casts/channels. Save validation rejects forged buffs/clocks and public area projections. Visible Decay areas render independently of hidden casters without exposing caster IDs.

Script evaluation no longer builds an editor map eagerly: the first runtime frame creates the state and clones its map for the editor. The native one-second load budget remains unchanged.

Validation: 66 regression groups in 7.903 seconds, followed by targeted public-area save guard and generated client checks. Real same-machine TCP verifies ownership, public projections and reconnect during Decay. Independent Main/scene/project generation is byte-equal. Native source body, Ritual, Decay and F5 evidence uses the final Main hash; portrait/cards/Nova/Armor evidence in native-lich-presentation-validation.json predates only the public-area save-header guard. Generated tests cover both hidden-caster views. Native errors/shader rejections are 0; the owned editor exited normally and its successful fixture/storage were removed.

Main SHA-256: 1fad2e2f2d209aa18a0bf295d0cfbd9f3c99e5b77f4de534953b62c2dae77420
Scene SHA-256: b361832407a2981e7abfe76c456b6aebaa0527562ca5de311bb3e00309e7e961
Editor SHA-256: 1e9c1386c1b504133a597fe9feff901fd2f57120635e79d3f91e1aa12cbcc2a6

Original Warcraft runtime parity remains unverified for Nova damage stacking, frost attack-speed stacking, Ritual life/payment rounding, Decay timing/shield semantics, and Armor default/autotarget behavior. Physical mouse/keyboard, listening to audio, standalone player and cross-machine LAN were not tested. This is a completed Lich prototype milestone, not completion of the full Warcraft recreation.

Next: continue original Undead heroes, then reduce full-scene native QA startup with a reproducible small fixture while retaining periodic full-client acceptance. Ponytail remains disabled. Preserve unrelated work and read-only asset-library.
