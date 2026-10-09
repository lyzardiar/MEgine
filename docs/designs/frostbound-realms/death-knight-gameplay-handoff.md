# Death Knight gameplay delivery

Author: MiYu

The original Udea recruitment profile, level growth and all four abilities are implemented in the authoritative simulation and generated client. Death Coil uses its cast point and homing flight, Pact consumes an eligible owned unit, Aura selects the strongest nearby source, and Animate Dead raises up to six controllable, invulnerable original bodies for 40 seconds. Original models, portraits, icons, C/E/U/D cards, source scale, cast animation and sampled source effects are wired. Protocol 71 carries the versioned state; old saves retain the legacy rule gate.

Revived units preserve original sourceUnit and base profiles across enemy corpses, normal attacks, Huntress bounce and Bear-to-Claw form restoration. They inherit no research and consume no food. Strict restoration rejects altered source identities, expired units and a forged seventh body. Phase Shift excludes Pact targets.

Validation includes authoritative gameplay, generated client using native GLB node sampling, actual local TCP ownership/privacy/reconnect, independent byte-for-byte scene/script reproduction and existing hero regression. The broad suite completed through retained prefix logs and continuation from failed fixtures, not represented as a single successful full invocation. Generic legacy fixtures explicitly disable source hero gates when manually changing faction/stats.

Native evidence is split by product fingerprint. native-death-knight-qa.json covers the four-skill UI/gameplay, original enemy Footman/Peasant revival and F5 casting/unit continuation using Main SHA 735ab593912aa14b7421a12037a478ba9c03823dd322d282ebf17f549e4f7a8d. native-death-knight-variants-qa.json covers final Huntress/Bear body, Bear-to-Claw source identity, F5 during morph and completed restoration using Main SHA 968f1ff6920bbc9db04bfb445ea14954fc24bd06a3c27e3ed7eb57145f82a115. Both use scene SHA 215716b258e7284cb07c6008e9e03965697b6326e966d4b85cb45dc4704d951c and pass with zero console errors/shader rejections and normal owned shutdown/cleanup. The initial full-skill report is not full-skill native acceptance of the final hash.

The final generated scene has 80,149 entities and 397 model entries. Its Main.js and Main.mscene match independent generation into E:/work/codex/cache/mengine/death-knight-gameplay-reproduction. The existing editor binary D:/MEngineNativeQA/construction-build/release/mengine-editor-tauri.exe was reused; this gameplay stage changes no Rust code.

Original Warcraft runtime parity remains unverified for Pact current/max-life basis and hidden undead targeting, Aura stacking/linger and exact corpse selection. Standalone player, physical input/audio and cross-machine LAN acceptance have not been run. The full Warcraft recreation remains active and incomplete, including campaigns, original editor, complete unit/hero behavior and classic TD/Dota. Next engine efficiency work should batch native input/step operations and add bounded lightweight hero-interaction scenes, while retaining full-scene integration coverage.

Timing and implemented/pending optimization status: death-knight-gameplay-timing.md.
