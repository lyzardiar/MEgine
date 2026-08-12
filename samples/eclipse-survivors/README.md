<!-- Author: MiYu -->

# Eclipse Survivors

An original, complete survivor-roguelite sample built entirely with MEngine.

## Included

- Local profile login and persistent progression.
- Four-slot equipment loadout with real runtime modifiers.
- Four data-driven auto-cast skills with upgrades and distinct attack patterns.
- Three filled expeditions, overlapping wave groups, bosses, victory and defeat flows.
- Experience, health, gold, kills, pause/retry, difficulty gates, and saved completion history.
- Generated original key art, character, enemies, equipment, skills, and pickups.
- Integrated MEngine Gameplay Data editor for `.mskill`, `.mlevel`, and `.mgame` assets.

## Play

```powershell
npm.cmd run sample:survivors
```

Type a Warden name and press Enter, or continue as a guest. Use `WASD` to move; skills fire automatically. Press `Escape` to pause.

## Authoring

Open this directory as an MEngine project. Double-click `Assets/Data/Skills.mskill` or `Assets/Data/Levels.mlevel` in Project. The Gameplay panel provides left-side Skills and Levels tools, validated fields, wave ordering, boss setup, dirty-state tracking, and save support.

Run `node Tools/generate-project.mjs` to deterministically regenerate scenes, data, import settings, and metadata without touching `Main.ts` or the original generated art.
