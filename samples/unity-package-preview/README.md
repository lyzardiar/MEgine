# Unity Package Preview

Open `project.json` in MEngine Desktop. This sample provides a neutral 3D camera, an ungraded background, and a small playback HUD for imported native particle effects.

1. Choose **Assets → Import Unity Package...** and select a `.unitypackage`, or paste its absolute path and click **Analyze path**.
2. Inspect the asset list and compatibility diagnostics, then click **Import**. The desktop package includes the pinned FBX converter; in a development checkout run `python scripts/prepare-unity-import.py` once.
3. Double-click an imported prefab in the Project panel to instantiate it. Move the prefab to the origin and save the scene when you want to retain the preview setup.
4. Enter Play mode and focus the Game panel. **Space** plays or stops emission; **X** stops and clears particles; **R** restarts the imported particle systems. **Left/Right** orbit, **Up/Down** raise or lower the camera, **W/S** zoom, **Home** resets the camera, and **B** switches between dark, gray, and light backgrounds.

Playback applies to `ParticleEmitter3D` components with a native `.mparticle` definition. Restart clears the emitter for a frame, then creates a fresh simulation. The HUD reports playback time and imported emitter count. The empty scene intentionally contains no proprietary effects, fog, or post-processing.

Double-click a `.mparticle` asset to edit its JSON parameters. Save checks JSON structure and rejects concurrent file changes; the runtime reloads changed definitions, and **R** starts a fresh preview. The Particle System **Definition** field accepts these assets.

The HUD uses Roboto Regular; its Apache 2.0 license is included at `Assets/Fonts/LICENSE.txt`.

Generated imports under `Assets/Imported/` and preserved source assets and metadata under `SourceAssets/UnityPackages/` stay local and are ignored by Git. Reimporting an unchanged package returns the same verified output; conflicting or modified output requires a separate destination or deliberate local cleanup. Compatibility warnings remain available in the import manifest.

To preview an existing CLI import directly, run `node samples/unity-package-preview/prepare-preview.mjs <imported-project-directory>` from the repository root. If the import has several prefabs, append the exact `Assets/Imported/.../*.prefab` path reported by the command. Open the generated `LocalPreview/project.json` in the desktop editor and press Play. This copies the selected import into an ignored standalone project and keeps the shared empty scene unchanged. The generator refuses to replace an existing LocalPreview; move that directory aside before generating another preview.
