import Foundation
import QuartzCore

/// Reserved iOS Swift adapter bridging UIKit/CAMetalLayer into MEngine's C-ABI (`mengine_ios.h`).
/// iOS uses `mengine-platform::IosAdapter` (Metal + QuickJS fallback due to Apple W^X JIT rules).
public final class MEngineIosAdapter {
    public enum LifecycleCode: UInt32 {
        case resumed = 1
        case suspended = 2
        case lowMemory = 3
        case quitRequested = 4
    }

    public init(documentsDir: String) {
        _ = documentsDir
        // Hook to mengine_ios_init(documentsDir) once libmengine_runtime.a xcframework is linked.
    }

    public func attachMetalLayer(_ layer: CAMetalLayer, width: UInt32, height: UInt32, scaleFactor: Float) {
        _ = (layer, width, height, scaleFactor)
        // Hook to mengine_ios_on_metal_layer(...)
    }

    public func onLifecycle(_ code: LifecycleCode) {
        _ = code
        // Hook to mengine_ios_on_lifecycle(code.rawValue)
    }

    public func tick(dtSeconds: Float) {
        _ = dtSeconds
        // Hook to mengine_ios_tick(dtSeconds)
    }
}
