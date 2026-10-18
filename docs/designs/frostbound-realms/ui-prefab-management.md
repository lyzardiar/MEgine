# Frostbound UI management

Author: MiYu

The Interface canvas contains four layers: Background, Screens, Modals and Overlays. Each screen is an editable prefab v2 in `samples/frostbound-realms/Assets/Prefabs/UI`. Its children group related content; buttons own their border, background, text, icon and shortcut. The portrait camera, model and RawImage belong to BattleHUD, with prefab-local entity references.

The 16 screens are MenuBackdrop, MenuBrand, MainMenu, SinglePlayer, FrontChrome, MapSelection, Options, Credits, BattleHUD, WorldOverlay, QuitDialog, NetworkDialog, PauseDialog, RenameDialog, Tooltip and Notifications. MainMenu, map selection and dialogs can be edited independently in the editor. Apply writes changes into the source prefab; Revert restores the linked instance. Group nodes stretch with their parent, and button parts use local anchors.

`scripts/build-frostbound.mjs` reads these prefabs and creates linked instances in Main.mscene. Prefab source edits survive regeneration. Stable node and instance IDs preserve Apply/Revert links and portrait references. `scripts/seed-frost-ui-prefabs.mjs` is a one-time migration tool and refuses to overwrite existing assets.

`game/ui-manager.js` owns screen visibility, modal input priority and canvas/local layout conversion. It caches entity references at initialization and switches screen roots only when the presentation state changes. Individual content such as selection details, health bars and inventory slots retain their own visibility. Hidden ancestors block button, portrait, selection and minimap input. A modal accepts interaction only in its own screen.

Authored layout comes from the actual loaded scene hierarchy. Runtime button movement changes the control root, while child parts remain local. Layout is synchronized before input, including viewport resizing and transitions between map editing and battle. The game continues using its existing menu/world CanvasScaler rules.

Validation commands:

```powershell
node scripts/build-frostbound.mjs
node scripts/test-frost-ui-prefabs.mjs - D:/MEngineNativeQA/engine-main-sync
node scripts/test-frost-ui-client.mjs
node scripts/test-frost-build-output.mjs
node scripts/test-frost-client-reconnect.mjs
```

The generated-client regression compares visible geometry against the previous flat scene at 1280×720, 1920×720 and 960×900, including a selected worker and repeated editor/battle transitions. Its 51 transition cases compare 11,451 visible rectangles. Visibility-function visits fall from 99,771 to 58,059 across those cases; this measures JavaScript work, not end-to-end frame time. Prefab tests cover stable links, edited source consumption, aspect ratios, noncentral pivots, internal entity references and editor capture/Apply/Revert utilities.

The older minimap comparison against commit `becc870` fails on tower-defense tile 211 even with the unmodified current HEAD as its candidate. This baseline discrepancy predates the UI hierarchy change. The pre-migration `0b6a136` geometry and visibility comparison is the acceptance baseline for this change.
