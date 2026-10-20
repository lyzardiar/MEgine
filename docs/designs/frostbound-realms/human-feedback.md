# Feedback damage

Author: MiYu

Spell Breaker Feedback burns up to 20 mana from ordinary units or 4 from heroes at missile impact. Its additional damage uses the attacker's weapon type and the target's current armor through `weaponDamage`; the effect and saved `feedbackAmount` continue to record actual mana removed. For a target with 5 armor and a neutral armor-type multiplier, burning 20 mana adds `20 / 1.3` damage. A normal attack against medium armor applies its 1.5 multiplier to Feedback as well. The state schema and protocol remain 114.

The original `Afbk` source row, source textures and Feedback particles remain in `human-sanctum.json` and the signed `human-spellbreaker-effects-sources.json` collection. REA upstream is [morluto/rea](https://github.com/morluto/rea), pinned locally to 6.5.0; source identity and updates are maintained in [README-MENGINE](../../../third_party/rea/README-MENGINE.md).

## Original binary evidence

All addresses below require the installed Warcraft 1.27 `Game.dll` SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`.

- `CAbilityFeedback` dispatches to `0x6f572410`. DataA/C select ordinary/hero mana limits, DataB/D select damage ratios, and DataE is read for the summoned-target bonus. The launch packet keeps its primary damage type in both type fields at `0x6f57256e`.
- `0x6f6b58e2` transfers packet types, damage and attack-type index into the missile. `0x6f6b5d45` transfers its Feedback ratio into the missile's value at `+0x9c`.
- `CMissileFeedback::DealDamage` at `0x6f56b1f0` reads current mana, calls the mana-change helper and multiplies its returned amount by the captured ratio before generic missile damage delivery.
- `0x6f6b6e70` constructs the damage packet. `0x6f68c870` adds its secondary amount to the total and records it separately. Unit virtual method `+0x120` receives that packet.
- `0x6f67dfad` applies physical armor reduction for damage type `0x10`, then `0x6f67e01e` applies the attack-type/armor-type table. Shared scaler `0x6f6971c0` scales both total damage and the secondary Feedback amount. This establishes that Feedback participates in armor scaling.

`scripts/probe-frost-rea-feedback.mjs` retains eight groups of authenticated REA evidence. `scripts/probe-frost-feedback-binary.py` executes the original packet constructor and armor/type branch in Unicorn for 12 cases: armor 0/5/10 and light/medium/heavy/hero armor types. External object queries, the `DefenseArmor` input and the source damage table are supplied by the harness; arithmetic and branch instructions are original DLL bytes. Reports and disassembly go to `tmp/docs-artifacts/frost-feedback/`.

## Reproduction

```powershell
node scripts/probe-frost-rea-feedback.mjs
python -m pip install --target tmp/docs-artifacts/frost-feedback/dependencies pefile==2024.8.26 unicorn==2.1.4
python scripts/probe-frost-feedback-binary.py --binary "E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne/Game.dll" --dependencies tmp/docs-artifacts/frost-feedback/dependencies
node scripts/test-frost-feedback-armor.mjs
node scripts/test-frost-human-spellbreaker.mjs
node scripts/test-frost-human-spellbreaker-client.mjs
node scripts/test-frost-human-spellbreaker-network.mjs
$env:MENGINE_EDITOR_EXECUTABLE='D:/MEngineNativeQA/engine-main-sync/target/release/mengine-editor-tauri.exe'
node scripts/qa-frost-feedback-armor.mjs
node scripts/test-frostbound.mjs
```

Rule checks cover 12 armor/type combinations, remaining mana, armor applied or removed during flight and exact saved continuation. Client and TCP checks compare the actual weapon damage roll, apply Inner Fire armor and verify the raw burn amount, particles, saves, reconnect and visibility. Native acceptance replays saved missiles and compares identical control ticks to account for health and mana regeneration.

The eight REA groups, 12 CPU cases, four rule groups, generated client, real TCP and three native cases passed. Native Feedback damage was 20 at armor 0, 15.384615384615358 at armor 5 and 3.3726812816188954 for a hero at armor 3.1. Console errors were zero; the owned editor exited normally. Its WebView runtime cache remains because removal returned EPERM. Generated, sample and native-tested Main.js agree at SHA-256 `20b9497ce24cd5f3952f6a9f00e8d9f3251f1587b7aeb7784d6bc474085f20a1`.

Full original-game attack acceptance, miss/evasion ordering, interactions with other defensive abilities and animation timing remain unmeasured. The original negative-armor lookup and bit-exact soft-float behavior are outside the CPU cases; the runtime continues to use the existing shared weapon armor implementation. Arcane Tower and Cannon Tower upgrade branches remain pending. Original `AHta` Reveal requires `Rhse`, as retained in `SourceAssets/HumanSentry/Units/HumanAbilityFunc.txt`.

Final-source `node scripts/test-frostbound.mjs` exited 0 with 741 PASS records, including 24,000 AI frames. Evidence: `tmp/docs-artifacts/frost-feedback/regression.log`; staged/generated/native Main identity: `index-verification.json`.
