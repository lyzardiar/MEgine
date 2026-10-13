# Scene capture during Play

Author: MiYu

## Request ownership

Capturing a Scene view reserves new Scene and camera-preview requests until the capture is complete. Existing requests finish normally. The capture waits for both, explicitly requests its fresh frame, waits for the result, and copies the displayed canvas. Ordinary animation paints may display retained pixels during that interval but cannot start another native request. When the last capture finishes, active Play resumes request scheduling, including in a hidden WebView without animation callbacks.

This prevents a running Scene from returning `Viewport "scene" canvas is not available yet` while its capture waits for a selected camera preview: ordinary paints previously restarted Scene rendering between awaited completions and the capture's readiness check.

Game's explicit native screenshot path is unchanged. Generation checks, one in-flight request per viewport, revision ownership, camera association, capture timeouts and stopped/unmounted behavior remain in place. Render resolution, simulation and network state are unchanged.

## Timing diagnostics

The local repeated multiview capture at `8b46e15` measured a 26.840 ms Game completed-frame interval, 15.620 ms shared request delivery, and 1.474 ms CPU canvas upload. The gap between one completed profile and the next request start was approximately 8.499 ms (p95 23.2 ms), estimated from adjacent profile timestamps and request duration. These values use different boundaries and are not independent quantities to sum.

Shared buffers were reused in 378 of 383 Game frames. Allocation averaged 0.001 ms, copying 0.206 ms, and publication-ready to browser event 2.963 ms. The synchronous GPU wait is already included in native rendering. These observations do not identify the GPU readback alone as the cause of the user's 200 ms frame interval.

`scripts/summarize-viewport-scheduling.mjs` reports request-gap estimates alongside render, transport and completed-frame intervals. Timer callback traces are optional; unsupported or absent tracing fields are not interpreted as zero latency. The diagnostic result is stored in `viewport-capture-ownership.json`.

## Validation

Scheduling tests execute actual viewport request blocks with deterministic clocks. The capture regression test holds a camera-preview response pending, advances Scene rendering, and invokes an ordinary animation paint while capture waits. No new Scene request starts until the capture owns it. Capture returns pixels and Play resumes afterward. Related tests cover minimum request period, single-request ownership, revision reuse, stop, session changes, error, unmount, hidden viewports and capture timeout behavior.

Native validation uses a fixed RPG scene/script at `3098765`, 2560×1440 host size, 1920×1080 Game request and 4×MSAA. Five ten-second stages cover all three views, no preview, Game alone, hidden Profiler and restored multiview. Compilation completes before sampling. Game and Scene screenshots are requested during active Play, followed by paused alternating Scene/Preview pixel checks and native console inspection.

This fix establishes capture correctness, not a frame-rate improvement. Completed-frame intervals measure upload completion rather than hardware presentation. GPU readback and WebView upload remain in the display path; performance on the user's other machine is unverified.

## Results

All five native timing stages passed. During active Play, Game captured 1280×720 pixels in 295 ms and Scene captured 408×804 pixels in 274 ms. The following one-second window recorded 39 Game and 42 Scene frames, confirming both continued after capture. Visual inspection found scene geometry, the authored camera preview, game UI and the hero present in the captures.

Paused alternating Scene/Preview checks changed 136/230,400 and 71/57,600 pixels, below the 0.5% tolerance. The native console check returned zero errors. The owned QA editor exited normally; its isolated runtime directory remained after a Windows permission error during cleanup.

The repeated multiview Game completed-frame interval was 26.840 ms before and 27.084 ms after, with native rendering 8.313/8.279 ms. Game alone measured 18.655/18.688 ms. These runs do not establish a frame-rate improvement. The first multiview stage varied from 25.908 to 27.312 ms; the full distributions are retained rather than presenting a single favorable sample.

51 frontend request/frame tests passed. Release frontend and custom-protocol native builds succeeded. Independent code review found no blocking issue. Raw final capture: `D:/MEngineNativeQA/rpg-multiview-viewport-capture-final-1791923362806`.
