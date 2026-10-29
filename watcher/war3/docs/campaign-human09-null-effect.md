# Human09 空位置特效

Human09 开场在新 Arthas 单位尚未创建时，执行 `AddSpecialEffectLoc(..., GetUnitLoc(udg_EvilArthas))`。`AddSpecialEffectLoc` 对空或已失效的位置返回空特效句柄；有效位置仍按原有路径创建特效。

固定版 Game.dll SHA-256 `e04d1716603c075eb0c8e1e21cf1093a664adc5249efab396bfa08d7b09d0c3a`。只读 Rizin 显示 `GetUnitLoc` 注册入口 `0x6f1e6280` 在单位解析失败时返回空，`AddSpecialEffectLoc` 入口 `0x6f1da260` 在位置解析失败时返回空，记录为 `tmp/docs-artifacts/war3/human03-continuation-1031/human09-effect-rizin.txt`。

隔离 Win32 x86 探针装载原图并越过原先的空位置异常，约 100 秒恢复控制并推进至 400 秒，记录 `tmp/docs-artifacts/war3/human03-continuation-1031/human09-after-effect.log`。该结果不覆盖完整关卡、原版画面或产品自动切关。

待阶段验证：运行 `war3_spell_tests` 的空位置、已移除位置及有效位置特效断言；在客户端完成开场，核对特效、输入和后续剧情。
