# Viewport GPU timing

Set `MENGINE_GPU_TIMINGS=1` before launching the desktop editor, then select the Profiler GPU module. The default launch does not request timestamp features or allocate query buffers. Unsupported adapters keep rendering without a GPU sample.

Hardware timestamps report Shadow depth, Environment background, Forward HDR, Tone mapping, UI overlay, and, when encoder timestamps are supported, Texture readback copy. Optional shadow/UI stages reset every frame. Samples describe the main viewport; nested scene views are outside the sample.

GPU durations overlap CPU work and the readback map wait. Do not add them to CPU totals or interpret the full map wait as texture-copy cost. GPU resource bytes remain logical estimates.

The readback error path unmaps both buffers, so a failed pixel mapping can be retried without retaining a mapped context or poisoning the shared staging-buffer lock.

Validation evidence is in `gpu-timing-validation.json`. Hardware tests can be run with `MENGINE_GPU_TIMINGS=1 cargo test -p mengine-rhi --release --offline --locked -- --test-threads=1`; the timestamps test also checks disabled mode. Actual Release acceptance includes continuous Scene movement in Edit/Play, pending-frame selection, mask pixel comparisons, and frozen GPU module presentation.
