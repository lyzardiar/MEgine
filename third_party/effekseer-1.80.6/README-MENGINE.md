# Effekseer Core 1.80.6

This directory vendors only the MIT-licensed Effekseer evaluator core from the official
`EffekseerForCpp1.80.6.zip` release. Official DirectX, OpenGL, Vulkan, Metal, LLGI, sound,
examples, and third-party renderer dependencies are intentionally excluded.

MEngine implements Effekseer's renderer callbacks on top of `mengine-rhi`; the upstream core
must not create a graphics device, swapchain, window surface, or presentation path.

Upstream: https://github.com/effekseer/Effekseer/releases/tag/1806
