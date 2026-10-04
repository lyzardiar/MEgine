# Frostbound Realms 3D 地表植被

Author: MiYu

地形使用连续起伏、分层岩壁和坡道网格；本阶段加入实际弯曲的 3D 草丛，让地表具有离开地面的轮廓与层次。

## 资产与显示

使用 Poly Haven 的 [grass_medium_01](https://polyhaven.com/a/grass_medium_01)，CC0；摄影 Rob Tuytel，建模 Rico Cilliers。七个源文件共 5,881,647 字节，下载地址、作者和 SHA-256 均保存于样例的 `realistic-sources.json`。

选择三个源草丛模型，分别保留 833、653 和 1,257 个三角形。近远视图均使用完整源几何。绿草与干草采用实拍颜色、透明裁剪、法线与 ARM 材质；森林和显式草地使用绿草，冬季和荒原使用干草。

地图最多安排 192 处确定性的草丛位置。根部贴合真实地形高度，朝向沿地面法线倾斜；排除水面、道路、显式泥地/雪地/岩地、悬崖边和建筑附近。草丛服从探索与战争迷雾；隐藏敌方建筑不会通过移除草丛泄露位置。地图绘制、撤销和读档会更新地表位置。

原有 3,716 个场景实体及编号、六张地图、140 个模型条目和 57 个既有生成资产均保持不变，追加 192 个草丛实体。

## 验证入口

- `node scripts/test-frost-ground-detail.mjs`：确定性布局、地形排除、绘制缓存、根部高度、坡度旋转和序列化。
- `python scripts/test-frost-grass-import.py`：源文件哈希、完整 3D 几何、法线、绿/干材质和透明遮罩。
- `node scripts/qa-frostbound.mjs --tilesets --deterministic-input`：隔离的原生 Release 编辑器，覆盖三种地表、近远草丛绑定、地图编辑/存取/试玩以及两客户端自定义地图与重连。联网等待持续运行，输入使用暂停单步，匹配服务器的真实时间心跳与保留期。
- `scripts/smoke-frostbound.ps1`：发布包所有文件哈希/大小和 30 秒 Player 启动检查。

当前仍未匹配 Warcraft III 原版的专用美术模块；地表与草丛是此引擎中的实现。物理鼠标操作、音频听感、跨机器局域网和稳定 Player 帧率尚未验收，完整游戏复刻仍未完成。
