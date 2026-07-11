# iOS Player (stub)

MEngine iOS player will ship `mengine` as a static library + thin Swift entry, Metal via wgpu.

## Planned layout

```
platforms/ios/
  MEnginePlayer/       # Xcode project
  bridging/            # Swift ↔ Rust C ABI
```

## Notes

- App Store background / audio limits apply  
- Authoring stays on PC editor  
