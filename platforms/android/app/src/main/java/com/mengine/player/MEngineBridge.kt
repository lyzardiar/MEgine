package com.mengine.player

import android.content.res.AssetManager
import android.view.Surface

/**
 * JNI bridge into `libmengine_runtime.so` (Rust core + V8 script host + Vulkan/GLES RHI).
 * Lifecycle codes: 1=Resumed, 2=Suspended, 3=LowMemory, 4=QuitRequested.
 * Touch phase codes: 0=Began, 1=Moved, 2=Ended, 3=Cancelled.
 */
object MEngineBridge {
    init {
        System.loadLibrary("mengine_runtime")
    }

    external fun nativeInit(assetManager: AssetManager, filesDir: String): Int
    external fun nativeOnLifecycle(code: Int)
    external fun nativeOnSurface(surface: Surface?, width: Int, height: Int, scaleFactor: Float)
    external fun nativeOnSafeArea(top: Float, right: Float, bottom: Float, left: Float)
    external fun nativeOnTouch(pointerId: Long, x: Float, y: Float, pressure: Float, phaseCode: Int)
    external fun nativeTick(dtSeconds: Float): Int
}
