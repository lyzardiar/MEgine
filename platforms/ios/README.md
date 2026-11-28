# iOS Player (Adapter Reserved)

iOS support reserves a clean C-ABI + Swift/Metal adapter contract (`mengine-platform::IosAdapter`, `SupportStage::AdapterReserved`):
- **Graphics**: Metal via `wgpu` (`CAMetalLayer`)
- **Script Runtime**: `quickjs-runtime` (`NativeQuickJs`) to comply with Apple's W^X JIT restriction on iOS App Store builds.
- **Files**:
  - `bridging/mengine_ios.h` — C-ABI surface, lifecycle, safe-area, and touch declarations
  - `MEnginePlayer/MEngineBridge.swift` — Swift adapter stub ready for XCFramework linking
