# Renderer-owned mesh vertex buffer reuse

Animation poses and camera-specific meshes keep independent live GPU buffers. When a mesh is removed or replaced, its internally uploaded vertex buffer enters an exact-capacity idle pool. Later uploads copy new vertices with `Queue::write_buffer`, reuse exact index contents through the existing index cache, and recompute local bounds. The pool retains at most 512 idle buffers and 16 MiB of payload; oversized or over-budget releases are dropped. Exact capacities do not inflate the logical size of active pose buffers.

Only Renderer-owned uploads are recyclable. `MeshGpu::upload`, initial builtin meshes, and buffers supplied through `register_mesh` remain external to the pool. Registering a mesh also clears eligibility for the new resource, regardless of COPY_DST usage, because the caller may hold aliases to its buffer.

Each render invocation submits its local encoder before returning, including every embedded scene view. A later queue write runs after previously submitted draws on the same queue. No GPU-idle wait or additional upload submission is required. Runtime pose pruning protects all meshes used by the current main and embedded views and typically supplies reusable buffers for the next frame.

Profiler counts expose `meshVertexBufferReuses`, `meshVertexPoolBuffers`, and `meshVertexPoolBytes`. The idle pool has a separate GPU memory category; payload bytes exclude active meshes and driver overhead. Existing vertex upload CPU wall time includes lookup, allocation when needed, and queue writes. Queue staging allocations still occur, and cold uploads before cache eviction can still allocate new buffers; fewer resource creations alone do not prove shorter frames.

## Validation

RHI 70 passed, editor host 59 passed/four ignored, runtime 228 passed. GPU tests submit geometry to a target, immediately recycle its buffer without polling or readback, submit different geometry plus an independent embedded view, and verify all resulting pixels. Other checks cover external COPY_DST buffer aliases by GPU byte readback, same-key replacement and topology/bounds changes, exact capacity and budget limits, and empty meshes. The render passes skip meshes with zero indices before binding buffers.

One earlier parallel runtime test process exited with `0xc0000374` heap corruption after 227 test completions; Windows reported `ntdll.dll` without a diagnostic driver stack. The remaining test passed in isolation, followed by all 228 runtime tests passing both serially and with default parallelism. The cause of that intermittent process failure is not established or claimed fixed. Logs: `D:/MEngineNativeQA/vertex-buffer-pool-libs-final.log`, `vertex-buffer-pool-runtime-isolated.log`, `vertex-buffer-pool-runtime-serial.log`, and `vertex-buffer-pool-runtime-parallel-confirm.log`.
