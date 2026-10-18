# Human Barracks technology and Defend

Author: MiYu. Protocol 103. New skirmishes enable humanTechnologyVersion 1; saves without the marker restore as version 0.

The human Barracks shares its three paid production slots with Defend (150 gold, 100 lumber, 45 s), Long Rifles (75/125/30 s; Keep) and Animal War Training (125/175/40 s; Lumber Mill, Castle and Blacksmith). Research is unique per team, refunds on queue cancellation, consumes no population and retains full waiting clocks. Long Rifles increases Rifleman range from 400 to 600; Animal War Training adds 150 maximum HP to existing and newly trained Knights. New games retain the existing Knight health ratio with source float rounding; saves without healthUpgradeVersion keep their additive health behavior. See [HP upgrade policy](hitpoint-upgrades.md).

Defend uses the original D button and source Stand/Walk/Attack Defend clips. It preserves the current order, reduces piercing damage by 50%, lowers movement speed by 30% and reflects eligible unit piercing attacks with 30% probability. Building weapons cannot reflect. Stationary Serpent Wards are units and remain eligible. Reflected projectiles retain their original weapon kind, damage and upgrade snapshot; separate ownership fields attribute the returning damage and visible effects to the Footman team. Each returning arc resets its segment trajectory. Saves accept returning arrows, moving targets and dead reflectors, and reject forged ownership or shortened waiting research. A returning attack cannot reflect again.

SourceAssets/HumanTechnology preserves the original MPQ tables and button images. human-technology-sources.json records archive names, SHA-256 and generator fingerprints. The movement interpretation follows the source metadata and Blizzard unit description: https://classic.battle.net/war3/human/units/footman.shtml . Existing asset licenses still apply.

The material metadata repair is in commit 2c555fa. The current material audit covers 3,211 tracked materials, with no missing or untracked sidecars and no duplicate GUID. The other machine's full 2,736-file listing was not available; its additional .mat.meta paths have not been individually classified.

Validation: human-technology-validation.json summarizes rule, generated client, actual TCP, native editor and reproduction evidence. Native playback validates D/L/A buttons, prerequisite locks, payment, F5/menu reload and original Defend animation poses. Full research timers run in shared and generated client tests; the TCP clock uses accelerated fixed ticks while networking and authority use actual sockets. Physical input, the original executable comparison, standalone player and cross-machine LAN remain unverified.

The full Warcraft III recreation remains active. Remaining work includes Blacksmith research, the rest of human production, complete campaigns, custom maps, multiplayer and editor parity.
