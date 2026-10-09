# Tauren Chieftain gameplay and original presentation

Author: MiYu

Otch is registered in original Orc melee games with source attributes, growth, weapon, starting mana, AI builds and W/T/E/R command cards. Shockwave travels eight units, hits each eligible ground target once and obeys its ranked total damage cap. War Stomp damages organic ground enemies, uses separate ordinary/hero stun durations and immediately interrupts channels. Endurance Aura selects the strongest nearby bearer, includes friendly air units and expires immediately when its source dies. Reincarnation waits seven seconds, blocks altar/AI revival and returns in place with full health and mana while its 240-second cooldown continues. Protocol 69 carries the new world state; opponent snapshots redact pending casts, stun attribution and Shockwave origin/hit/budget metadata.

Original body/portrait, model and selection scales, Attack Slam/Spell Slam, body ribbon, Shockwave geometry/particles, War Stomp, CommandAura geometry and Reincarnation Death/Stand/Birth clips are wired into the generated client. The corpse body and rebirth effect remain visible during the waiting period. F5 restores casts, travelling waves, stuns, aura and reincarnation clocks.

Validation: 15 source gameplay groups, generated-client interaction with native GLB sampling, actual localhost TCP ownership/privacy/reconnect through the full rebirth wait, and 13 generated files reconstructed byte-for-byte. Native full-game verification passed with zero console errors and zero rejected material pipelines; the owned editor exited normally and its fixture, runtime, discovery and isolated storage were removed. Native results and product fingerprints are in `native-tauren-qa.json`; combined coverage is in `tauren-gameplay-validation.json`.

The general regression suite passed in segments: 252 PASS messages before the generic racial-item fixture failure, then 102 PASS messages after that fixture explicitly selected taurenVersion 0. The continuation exited 0, including the main acceptance body. These are message counts, not independent module counts or one complete successful entry invocation. Dedicated Tauren and generated Far Seer checks were repeated after the final shared source changes.

Original tables and converter/source provenance are retained in `tauren-rules-sources.json` and `tauren-effects-sources.json`. The official classic unit page confirms seven seconds, 240 seconds, full mana and no experience when Reincarnation triggers. Full health, cooldown starting at the fatal hit, and suppressing gold/kill count are implemented choices without an original-game execution comparison.

Full Warcraft III campaign, cross-machine LAN, original editor/TD/Dota parity, physical input, audio listening and original solver equivalence remain unverified or incomplete. The complete game goal remains active.
