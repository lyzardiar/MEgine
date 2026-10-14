# Scene navigation and Edit preview performance

Author: MiYu

Scene selection and camera framing keep the mounted world snapshot intact. Fast hierarchy double-click, hierarchy Space, Scene Space and F frame the selected subtree using world transforms, mesh bounds and the viewport aspect ratio. Static glTF geometry is loaded through the existing preview cache. Terrain patches, sprites, lines, tilemaps and sprite batches contribute geometry bounds. Screen Canvas framing retains its existing pixel-space behavior.

Scene WASD and arrow keys move along the current camera basis; Shift accelerates. Releasing keys, losing focus or switching panels stops movement. Wheel dolly keeps a useful movement floor near the orbit pivot and continues translating the camera beyond it. Framing restores the orbit center and distance. Existing 2D controls and Play input remain separate.

Edit Game previews retain their immutable world in both the browser and native host. Unchanged polls send the retained key; scene edits publish a new snapshot. The host scopes keys by project and WebView. Expired keys retry with the corresponding owned snapshot. Play continues to use its runtime revision. The native cache currently retains one Game world, so alternating multiple Game windows can evict each other and trigger safe reuploads.

Changed Edit content or viewport settings bypass the idle polling delay. Unchanged previews retain the 300 ms external-resource polling interval. Static Edit Game images stay on the canvas between updates, while Spine previews and Play interaction keep browser processing active. Profiler distinguishes Edit Preview Update Interval, Native Render, Native Command and Request to Canvas; update intervals include polling and are not render durations or compositor measurements.

Validation:

- 61 targeted tests passed across framing/navigation/zoom, native frames/transport, presentation and Canvas behavior. Frontend production build passed.
- Release build uses `cargo build --release -p mengine-editor-tauri --features custom-protocol`.
- Native UI tests use actual hierarchy mouse double-click, Space, WASD/arrows, blur and repeated wheel events. Camera restoration and absence of Scene/Game placeholder frames are asserted.
- Performance evidence is in `scene-navigation-performance.json`: the same 4,259-entity fixture with simultaneous Scene/Game views, a 2-second CPU sample, and 7 completed Game frames per comparison. Request-to-Canvas averaged 134.414 ms before retained Game uploads and 18.414 ms with retention; Native Render averaged 12.745 and 12.275 ms. This local measurement does not establish another machine's frame rate.
- The final delivery rerun averaged 22.214 ms Request to Canvas and 12.448 ms Native Render. Seven steady requests were 177 bytes each with zero scene snapshots. A deliberate native cache eviction recovered by reuploading the owned snapshot. The actual Ground 9 terrain node framed at distance 18.100 with pivot [-20, -0.125, -20]; navigation preserved the world reference and showed no placeholder frames. Console errors: zero.
- Exact posed-animation bounds, procedural meshpatch bounds and full UI grouping bounds are not covered by this change. Static glTF bounds follow the editor's existing first-mesh preview representation.
