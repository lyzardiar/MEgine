# Dryad production and researched Abolish Magic

Author: MiYu

This document records the protocol-49 Dryad delivery. The current protocol-50 Slow Poison extension, configured default autocast and acceptance are documented in `slow-poison.md` and `slow-poison-validation.json`.

The Ancient of Lore can train Dryads in current Night Elf skirmishes. Dryads use the original body, independent portrait, missile, command icons and Dispel Magic target effect prepared in `dryad-assets.md`. They remain separate from the two morphable Druids. The overall Warcraft III recreation and full Dryad equivalence remain incomplete.

## Source rules and controls

`dryad-rules.json` retains the original unit, weapon, ability and research rows. Production costs 145 gold, 60 lumber and three food, taking 30 seconds in the shared Lore queue. The unit has 435 HP, 200 maximum mana, 75 initial mana, 0.75 mana regeneration per second, movement speed 3.5, Pierce damage 17-19, range five and a two-second attack period. Original weapon upgrades, armor upgrades, the 0.3-second attack windup and magic immunity are integrated with the existing simulation. The body scale is sourced independently from its pose bounds; modelScale is 1 and selection scale is 1.25.

`scripts/import-frost-dryad-portrait.py` verifies the original portrait MDX against the existing source receipt and extracts its single static `CAMS` camera. It rejects nonzero camera animation, converts the original positions and target with `(x,y,z) -> (x,z,-y)` at 1/128, and preserves its perspective field of view and clipping distances in `dryad-portrait.json`. The client keeps this model's rotation unchanged and uses a quaternion facing the original target. The generated-client regression checks the actual camera components and restores orthographic framing after selecting a building. `--check` verifies byte-exact camera regeneration.

Select a rooted Lore and press S to research Abolish Magic (`Resi`): 50 gold, 50 lumber and 45 seconds. Research uses the shared production queue, suspends while the Ancient uproots, rejects duplicates and refunds cancelled research. Select a researched Dryad and press B or click command slot eight, then select a visible target. Right-click the command toggles autocast. Version-one saves retain default-off spawning. New version-two games use the original `UnitAbilities.auto=Aadm` preference; see `slow-poison.md`.

Abolish Magic costs 50 mana at the end of its 0.3-second cast point, has five-unit range, no cooldown and a 0.51-second backswing. Interrupting before completion does not charge mana. The engine clears harmful allied effects or beneficial enemy effects, including enemy Scroll of Regeneration, Healing Salve and Lesser Clarity regeneration, and deals 300 dispel damage to enemy summons. Friendly beneficial effects and enemy harmful effects remain. Its target effect uses original sampled mesh and particle assets.

Autocast selects in-range visible targets, prioritizing allies with harmful magic, then enemies with beneficial magic or summoned origin. Attack, Attack Move and Hold resume after the cast or after its target becomes invalid. An existing Shift queue survives automatic casting, including saving and restoring during the cast. Manual spell orders replace the current command and queued commands.

## Saves and multiplayer

Protocol 49 separates this implementation from earlier gameplay versions. New saves contain `dryadVersion=1`, team research and explicit autocast settings. Legacy saves receive the disabled version without adding Dryads to their production roster. Restoration checks research ranks, source unit properties, spell target IDs, cast times, resumed orders and waypoint queues. Opponents do not receive private research, autocast settings or production queues.

The TCP test uses real sockets and disconnection/resumption, verifies research payment, authoritative dispelling and ownership rejection. It accelerates an already validated 45-second research queue only for TCP completion; the core and generated-client tests run the full simulation duration.

## Verification and remaining work

`dryad-gameplay-validation.json` records the final code and generated-product hashes, regression result and native report. Core regression covers production, research suspension/refunds, directional clearing, interruption, competing autocasts, Shift/save continuity, legally used regeneration items, source missile combat, immunity and invalid saves. The generated-client test executes S/B keys, target clicks, right-click toggling, original portrait/missile bindings and F5 restoration. Existing rendering and corpse tests include the new original model catalog.

`native-dryad-gameplay-qa.json` records the native MEngine editor's exact generated bundle, source scene and executable hashes, command timings, screenshots, shader rejection count and owned-process cleanup. Its fixture begins with research completed; native research payment/production is not exercised. Its input goes through the MEngine bridge. Physical desktop input, audible sound and cross-machine LAN are not accepted by this report.

Final acceptance passed 142 regression groups, eight Dryad core groups, two generated-client groups and one real TCP group. Native acceptance passed on the final generated bundle with zero material pipeline rejections; the original portrait camera's screenshot was visually checked. The owned editor exited normally and its isolated fixture was removed. The preexisting dirty source scene was preserved and restored after acceptance; run `node scripts/build-frostbound.mjs` to regenerate the scene and ignored startup script from the current sources.

Slow Poison is implemented by the subsequent protocol-50 extension. Original `Aspo.DataD1=1` bit definitions and configured initial autocast are preserved from original editor/unit data; repeated-hit attribution and runtime behavior still need accepted original-game measurements. The responding dzclient Warcraft III 1.27 OpenGL process has not produced a confirmed map load or probe output. MEngine tests and native rendering do not establish Warcraft runtime equivalence. The measurement tooling and its limitations are documented in `dryad-assets.md`.
