# Warcraft III 原版季节树木贴图

本包保留 `LordaeronSnowTree.blp`、`LordaeronWinterTree.blp` 两张原始贴图及转换后的 RGBA PNG，不包含模型。来源为本机 Warcraft III Frozen Throne 安装包；原文件路径、MPQ 覆盖顺序、SHA-256 和工具版本记录在 `asset-sources.json` 与 `Licenses/converter-sources.json`。

Frostbound 的冬季树木复用原版 LordaeronTree0–5 几何，将 replaceable 31 材质绑定为 LordaeronSnowTree；森林使用 LordaeronSummerTree，荒地使用 BarrensTree。两张新增贴图通过源 alpha/JPEG 平面检查和原生 runtime 加载验证。

```powershell
python scripts/extract-frost-classic.py --only-texture 'ReplaceableTextures\LordaeronTree\LordaeronSnowTree.blp' --only-texture 'ReplaceableTextures\LordaeronTree\LordaeronWinterTree.blp' --out tmp/classic-tree-skins-export
python scripts/convert-warcraft-assets.py --input tmp/classic-tree-skins-export --output asset-library/warcraft-iii/tree-skins-ready
```

这些贴图属于 Blizzard 游戏资产，转换工具的 MIT 许可不改变资产权限。
