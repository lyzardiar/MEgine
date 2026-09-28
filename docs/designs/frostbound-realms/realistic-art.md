# 写实美术阶段

本页记录写实素材接入阶段。当前画面、性能实测和 Player 包见 [画面细化阶段](rendering-refinement.md)。

人族八种建筑外观使用 Daniel74 的木梁、灰泥、砖基与瓦顶房屋模块，补充门窗并烘焙原始重复贴图；建造预览、场景模型、选中模型和建筑按钮使用同一份模型目录。环境使用 Poly Haven 的中型冷杉、灌木、扫描岩石、石砌火塘和森林地表。所有新增来源为 CC0，原件、来源地址与 SHA-256 保存在 `house-sources.json`、`realistic-sources.json`，许可位于样例 `Licenses/`。

Free3D 的实际访问返回 HTTP 403 与浏览器校验入口，正常浏览器也未成功加载。本阶段没有从 Free3D 下载模型。

## 原生截图

- [标准游戏视角](realistic-settlement.png)
- [远景](realistic-overview.png)
- [地图编辑器](realistic-editor.png)
- [最近视角的立体树模型](realistic-close-detail.png)

截图由原生 Release 编辑器运行实际样例生成。其他三族建筑与角色仍使用现有原型美术，尚未完成整款游戏的写实风格统一。近景针叶仍有锯齿；水岸与地形轮廓也需继续完善。

## 资源生成

Python 需要 numpy、Pillow；离线减面需要固定版本 meshoptimizer 0.24.0。Blender 4.5.9 只用于资产转换与烘焙，Player 不依赖 Blender 或 Node。

```powershell
npm install --prefix tmp/frost-realistic-tools meshoptimizer@0.24.0 --ignore-scripts --no-audit --no-fund
python scripts/import-frost-realistic.py
$env:BLENDER = '绝对路径/blender.exe'
& $env:BLENDER --background --factory-startup --python-exit-code 1 --python scripts/import-frost-houses.py
& $env:BLENDER --background --factory-startup --python-exit-code 1 --python scripts/bake-frost-foliage.py
node scripts/build-frostbound.mjs
node scripts/render-frost-faction-icons.mjs
```

`import-frost-assets.py` 接续上述三个导入/烘焙步骤，使用 `BLENDER` 环境变量或 PATH 中的 `blender`。原始房屋的镜像修改器在归并前求值，建筑最终居中并保持游戏占地边界。多材质植物保留法线与粗糙度贴图；图集按原始 UV 平铺范围生成。岩石同时限制高度和宽度，避免扁平扫描模型被放得过大。

远处与边缘的冷杉采用完整源模型烘焙的透明树冠贴片，每棵两三角形。贴片对应游戏固定俯视角度，不随随机树木朝向旋转；放大到近景时使用立体模型。若未来加入相机旋转，需重新生成多方向贴片或使用立体 LOD。纹理排除了渲染日期与耗时元数据；本机重复生成 69 个模型/材质/贴图文件和 9 个树冠文件，SHA-256 一致。跨 Blender 版本和硬件的像素一致性未承诺。

## 验证与当前性能

- `node scripts/test-frostbound.mjs`：规则、存档、TCP、模型范围、近远景选择、许可证及全部新增源文件/派生文件哈希检查通过。
- `cargo test -p mengine-editor-host --test frost_sample`：3 通过、0 失败。
- `qa-frostbound.mjs --realistic-only`：实际近/远景、编辑器与 LOD 切换通过，材质管线拒绝数 0。
- 原生建造、暂停/继续、取消退款，以及双客户端连接/重连检查通过。
- 稳定场景三次 5 秒测量为 12.01、10.77、11.68 FPS，原生 render 平均约 8.35–8.72 ms。交互截图流程中的性能统计包含加载和视角切换，不作为稳定帧率。5 ms 整体目标未达到，性能仍需优化。

素材接入阶段独立包包含 362 个文件、1899 个实体，历史内容哈希 `17f8e2f562a3c3f88939bf93f8d029d403fa30e7eb492d8e0ea1e77ef4812217`。当前包与验证见 [运行性能阶段](runtime-performance.md)。自动化 Agent 输入不证明物理鼠标键盘、音频听感或跨机器 LAN 验收。
