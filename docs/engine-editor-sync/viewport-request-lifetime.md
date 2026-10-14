# Viewport request lifetime

Scene, Game and selected-camera preview rendering accept errors only from the current request generation and world session, matching their existing successful-frame ownership checks. An in-flight request from a stopped Play session can complete after the editor has returned to Edit mode. Its failure must not mark the current renderer unavailable or log an error against the new world. Failures belonging to the current request still report normally.

Release reproduction before this change: all authored-title, first Play frame, custom-game, pause/resume and return-to-title checks passed without console errors. Stopping Play at 1791952945253 produced Camera Preview: Play session expired at 1791952945499. Evidence: D:/MEngineNativeQA/rpg-multiview-title-preview-verified-1791952902773/report.json.

The Game scheduling fixture now includes the actual request-key and polling-interval declarations, models GPU timing revision and world metadata, and isolates the runtime-frame subscription from the separate GPU event subscription. A regression exercises a failed old-session request followed by successful rendering in the current session. Current-session failures continue to be tested.

Validation: 63 tests pass across nativeViewportFrame, nativeViewportPresentation, nativeSceneCompletionScheduling and nativeGameCompletionScheduling. TypeScript and production frontend build pass. Packaged Release runtime evidence is recorded in viewport-request-lifetime.json.
