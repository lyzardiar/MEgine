# 资源来源

| 资源 | 来源 |
| --- | --- |
| `Assets/Art/fleet.png` | OpenAI ImageGen 为本示例生成；六种原创舰船，无外部游戏素材 |
| `Assets/Art/fleet.png.sprite.json` | 项目定义的 3 × 2 图集切片，每格 512 × 512 |
| `Assets/Shaders/*.mshader` | 本项目编写的原生 WGSL UI 着色器 |
| `Assets/Audio/*.wav` | `scripts/create-thunder-fighter.py` 合成的音效和 16 秒循环音乐 |
| `Assets/Fonts/Roboto-Regular.ttf` | 仓库已有 Roboto 字体；授权文本在 `Assets/Fonts/LICENSE.txt` |

最终图集生成要求：正交俯视，舰首向上，保持金属层次、装甲细节和发光反应堆；依次为象牙白/青色玩家截击机、品红无人机、铜色炮艇、紫色哨兵、蓝色无畏舰、金紫色六臂王冠。画布 1536 × 1024，精灵独立置于六个透明切片中，保持完整轮廓及间隔，不含文字或 UI。渲染验收检查了各切片没有相邻机体残片。

玩家、敌机和 Boss 为二维精灵；火力、弹幕、光效及关卡状态由脚本实时驱动。预览图来自引擎原生渲染。
