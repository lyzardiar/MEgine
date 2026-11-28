package com.mengine.player

import android.os.Bundle
import android.view.Choreographer
import android.view.MotionEvent
import android.view.SurfaceHolder
import android.view.SurfaceView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : AppCompatActivity(), SurfaceHolder.Callback, Choreographer.FrameCallback {
    private lateinit var surfaceView: SurfaceView
    private var lastFrameNanos: Long = 0L
    private var running: Boolean = false

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        MEngineBridge.nativeInit(assets, filesDir.absolutePath)

        surfaceView = SurfaceView(this)
        surfaceView.holder.addCallback(this)
        surfaceView.setOnTouchListener { _, event ->
            dispatchTouch(event)
            true
        }
        setContentView(surfaceView)

        ViewCompat.setOnApplyWindowInsetsListener(surfaceView) { _, insets ->
            val bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            MEngineBridge.nativeOnSafeArea(
                bars.top.toFloat(),
                bars.right.toFloat(),
                bars.bottom.toFloat(),
                bars.left.toFloat(),
            )
            insets
        }
    }

    override fun onResume() {
        super.onResume()
        MEngineBridge.nativeOnLifecycle(1)
        running = true
        lastFrameNanos = 0L
        Choreographer.getInstance().postFrameCallback(this)
    }

    override fun onPause() {
        running = false
        Choreographer.getInstance().removeFrameCallback(this)
        MEngineBridge.nativeOnLifecycle(2)
        super.onPause()
    }

    override fun onTrimMemory(level: Int) {
        super.onTrimMemory(level)
        if (level >= TRIM_MEMORY_RUNNING_LOW) {
            MEngineBridge.nativeOnLifecycle(3)
        }
    }

    override fun onDestroy() {
        MEngineBridge.nativeOnLifecycle(4)
        super.onDestroy()
    }

    override fun surfaceCreated(holder: SurfaceHolder) {
        val frame = holder.surfaceFrame
        MEngineBridge.nativeOnSurface(
            holder.surface,
            frame.width(),
            frame.height(),
            resources.displayMetrics.density,
        )
    }

    override fun surfaceChanged(holder: SurfaceHolder, format: Int, width: Int, height: Int) {
        MEngineBridge.nativeOnSurface(
            holder.surface,
            width,
            height,
            resources.displayMetrics.density,
        )
    }

    override fun surfaceDestroyed(holder: SurfaceHolder) {
        MEngineBridge.nativeOnSurface(null, 0, 0, resources.displayMetrics.density)
    }

    override fun doFrame(frameTimeNanos: Long) {
        if (!running) return
        val dt = if (lastFrameNanos == 0L) 1f / 60f else ((frameTimeNanos - lastFrameNanos) / 1_000_000_000.0).toFloat()
        lastFrameNanos = frameTimeNanos
        MEngineBridge.nativeTick(dt.coerceIn(0f, 0.1f))
        Choreographer.getInstance().postFrameCallback(this)
    }

    private fun dispatchTouch(event: MotionEvent) {
        val action = event.actionMasked
        val phase = when (action) {
            MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> 0
            MotionEvent.ACTION_MOVE -> 1
            MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> 2
            else -> 3
        }
        if (action == MotionEvent.ACTION_MOVE) {
            for (i in 0 until event.pointerCount) {
                MEngineBridge.nativeOnTouch(
                    event.getPointerId(i).toLong(),
                    event.getX(i),
                    event.getY(i),
                    event.getPressure(i),
                    phase,
                )
            }
        } else {
            val idx = event.actionIndex
            MEngineBridge.nativeOnTouch(
                event.getPointerId(idx).toLong(),
                event.getX(idx),
                event.getY(idx),
                event.getPressure(idx),
                phase,
            )
        }
    }
}
