# API Guidelines (AI & humans)

1. **Never** call GPU / filesystem / networking from game scripts directly.  
2. Prefer **batch** `query` + `commit` over per-entity FFI.  
3. New components must be added to `idl/` first, then `pnpm codegen`.  
4. Editor tools should emit the same `WorldCommand` stream as runtime.  
5. AI agents should generate **Intent IR** (`@mengine/agent`), not arbitrary TS.  
6. Prefabs / scenes must validate against generated JSON Schema.  
7. Hot paths (physics, skinning, particles) stay in Rust jobs.  
8. Public TS API uses PascalCase types; commands use camelCase `op` tags.  
9. Hierarchy ops map to `WorldCommand`: reparent → `setParent`, create → `spawn`, delete → `despawn`, rename → `setComponent`/`Name`; editor-local `active` / `siblingIndex` align with future `Active` IDL.
