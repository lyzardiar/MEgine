# 作者制作的三维植被 LOD

2026-09-29。近景冷杉使用 Poly Haven 原作者 Blender 文件中的 LOD1，次级三维网格使用 LOD2。模型由三维枝干和交错枝叶面片组成，保留作者的形状、法线和 UV；场景中的近景树仍按位置使用不同朝向。远景继续使用现有固定视角树冠贴片。

| 模型 | 近景三角形 | 次级三维 LOD 三角形 |
| --- | ---: | ---: |
| RealSpruceA | 19,016 | 14,752 |
| RealSpruceB | 11,886 | 8,761 |
| RealSpruceC | 11,074 | 8,393 |

针叶漫反射直接取原作者 sRGB PNG，与原始灰度遮罩合成 RGBA；有效遮罩内的 RGB 字节和完整 Alpha 均有逐像素回归检查。颜色、法线、粗糙度纹理向未使用 UV 区域延伸 32 像素，降低 mip 采样的黑边污染。树枝保持不透明，枝叶使用双面 cutout、0.3 阈值及现有 4× MSAA，保留 PBR 法线和场景光照。

新增原始 `.blend` 与 9 张 PNG 使用同一资产的 CC0 许可，下载 URL、文件大小和 SHA-256 记录在 [realistic-sources.json](../../../samples/frostbound-realms/realistic-sources.json)。原作者 Rob Tuytel（摄影）、Rico Cilliers（建模）；[资产页面](https://polyhaven.com/a/fir_sapling_medium)。此阶段没有从 Free3D 下载素材。

## 原生画面与性能

![近景](realistic-close-detail.png)

基线为 `4df574e90b9905ccc16b4289e32a896a2a9a86c3`，相同原生 Release 编辑器、1,899 实体、1280×720 和 4× MSAA。标准视角预热 5 秒、采样三次各 5 秒；近景另预热 3 秒、采样一次 5 秒。

| 指标 | 基线 | 本阶段 |
| --- | ---: | ---: |
| 最近视角 FPS | 10.19 | 12.70 |
| 最近视角平均原生渲染 | 13.52 ms | 10.31 ms |
| 标准视角 FPS，中位数 | 13.27 | 14.74 |
| 六个三维网格与三张图集总字节 | 80,897,188 | 10,315,685 |

标准视角三次为 14.74、15.45、14.41 FPS；该视角仍使用远景贴片，不能把其变化全部归因于近景网格优化。这是顺序短窗口测量，未独占机器，也不是长期基准。整体仍不够流畅，5 ms 目标未达到。

## 验证与交付

- UV 变换、有限边缘延伸、细针叶缩小采样、作者 LOD、源颜色与 Alpha 回归通过；模型范围、来源与全部派生文件哈希检查通过。
- 导入与树冠烘焙连续重建后，45 个导入文件和 9 个树冠文件 SHA-256 一致。Blender 版本固定为 4.5.9，未承诺跨版本或跨硬件像素一致。
- 原生近景网格、远景 LOD 切换与地图编辑器渲染通过，MSAA=4，材质管线拒绝数为 0。
- 独立 Player 重新打包：362 文件、119,379,708 字节，内容哈希 `bff512a959cd71e1d93995023477006cf296667adfcc61bb19df1053509cdb56`。逐文件哈希检查通过；启动 30 秒窗口响应、日志错误 0。本阶段沿用已构建的 Release 原生程序，修改的是资产导入与游戏资源。
- 物理鼠标键盘、音频听感和跨机器 LAN 未在本阶段验收。角色、其他阵营、地形水岸、完整战役与完整游戏目标仍待完成；远景贴片仍依赖固定相机角度。

[完整对照与包记录](foliage-lods-qa.json)、[近远景原生验收](native-realistic-qa.json)、[标准视角采样](native-performance-qa.json)、[Player 启动验收](player-smoke.json)。

## 重建

按 [写实资产流程](realistic-art.md) 安装已有依赖，先设置 `BLENDER` 指向 Blender 4.5.9，再运行 `scripts/import-frost-realistic.py`。它调用 `scripts/export-frost-foliage.py` 导出作者 LOD。随后运行 `scripts/bake-frost-foliage.py` 恢复远景贴片与目录信息，再运行 `node scripts/build-frostbound.mjs`。测试入口为 `scripts/test-frost-realistic-import.py`、`node scripts/test-frost-visuals.mjs` 和顺序执行的 `qa-frostbound.mjs --realistic-only`、`--performance-only`。
