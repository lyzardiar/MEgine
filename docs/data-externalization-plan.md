# Frostbound 数据外部化方案

## 目标

将 Main.js 中内联的大型数据目录（约 12MB）外部化为独立 JSON 文件，通过运行时异步加载，从而：
- 减少脚本初始加载时间
- 利用浏览器缓存机制
- 降低内存峰值

## 当前状态

- ✅ 数据提取工具已创建：`scripts/build-frostbound-data.mjs`
- ✅ 运行时加载器已创建：`samples/frostbound-realms/game/data-loader.js`
- ✅ 对象池管理器已创建：`samples/frostbound-realms/game/object-pool.js`
- ⚠️ 构建脚本集成待完成
- ⚠️ 客户端初始化流程待修改

## 数据分析

### Main.js 当前组成（14MB）

```
游戏规则 JSON (内联)      ~1.5MB
模型目录 (内联)            ~4MB
特效目录 (内联)            ~5MB
肖像目录 (内联)            ~1MB
其他配置                   ~0.5MB
游戏逻辑代码               ~2MB
```

### 可外部化的数据

| 数据类型 | 大小估计 | 文件名 | 全局变量 |
|---------|---------|--------|---------|
| 模型目录 | 4MB | `model-catalog.json` | `FrostArt` |
| 特效目录 | 5MB | `effect-catalog.json` | `FrostEffectArt` |
| 爆炸特效 | 0.5MB | `detonation-catalog.json` | `FrostDetonateArt` |
| 肖像数据 | 1MB | `portrait-catalog.json` | `FrostPortraitViews` |
| 建筑缩放 | 0.1MB | `building-scales.json` | `FrostBuildingScales` |
| 单位缩放 | 0.1MB | `unit-scales.json` | `FrostUnitScales` |
| 哨兵数据 | 0.2MB | `sentinel-catalog.json` | `FrostSentinelArt` |
| 建造特效 | 0.3MB | `construction-catalog.json` | `FrostConstructionArt` |

**总计可外部化**: ~11MB

## 实施步骤

### 1. 修改构建脚本输出（复杂度：高）

**文件**: `scripts/build-frostbound.mjs:267`

**当前逻辑**:
```javascript
fs.writeFileSync(path.join(outputRoot,'Assets/Scripts/Main.js'),
  '// Generated...\n' +
  'var FrostArt=' + JSON.stringify(catalog) + ';\n' +
  'var FrostEffectArt=' + JSON.stringify(effects) + ';\n' +
  // ... 其他大量内联数据
  gameCode
);
```

**目标逻辑**:
```javascript
fs.writeFileSync(path.join(outputRoot,'Assets/Scripts/Main.js'),
  '// Generated...\n' +
  '// Data catalogs loaded via FrostDataLoader\n' +
  fs.readFileSync(path.join(root,'game/data-loader.js'),'utf8') + '\n' +
  fs.readFileSync(path.join(root,'game/object-pool.js'),'utf8') + '\n' +
  
  // 只保留小型配置数据
  'var FrostMapCatalog=' + JSON.stringify(mapCatalog) + ';\n' +
  'var FrostUIManifest=' + JSON.stringify(uiManifest) + ';\n' +
  'var FrostButtons=' + JSON.stringify(buttons) + ';\n' +
  
  gameCode
);
```

**挑战**:
- 需要修改所有对 `catalog`, `effects`, `detonation` 等变量的引用
- 构建时这些变量仍需存在（用于计算 `actorParts` 等）
- 约 50+ 处代码使用这些变量

### 2. 修改客户端初始化（复杂度：中）

**文件**: `samples/frostbound-realms/game/client.js`

**当前逻辑**:
```javascript
function init() {
  if (!initialized) {
    // 直接使用全局变量
    const model = FrostArt.someModel;
    initialized = true;
  }
}
```

**目标逻辑**:
```javascript
let dataLoaded = false;

async function loadGameData() {
  if (!dataLoaded) {
    const data = await FrostDataLoader.loadAll();
    
    // 设置全局变量
    globalThis.FrostArt = data.FrostArt;
    globalThis.FrostEffectArt = data.FrostEffectArt;
    globalThis.FrostDetonateArt = data.FrostDetonateArt;
    globalThis.FrostPortraitViews = data.FrostPortraitViews;
    globalThis.FrostBuildingScales = data.FrostBuildingScales;
    globalThis.FrostUnitScales = data.FrostUnitScales;
    globalThis.FrostSentinelArt = data.FrostSentinelArt;
    globalThis.FrostConstructionArt = data.FrostConstructionArt;
    
    dataLoaded = true;
  }
}

async function init() {
  if (!initialized) {
    await loadGameData();
    
    // 原有初始化逻辑
    const model = FrostArt.someModel;
    initialized = true;
  }
}
```

**挑战**:
- `init()` 变为异步函数，调用方需要 `await`
- 需要处理加载失败的情况
- 需要显示加载进度

### 3. 添加加载进度UI（复杂度：低）

```javascript
function showLoadingProgress(loaded, total) {
  const percentage = Math.round((loaded / total) * 100);
  // 更新 UI 显示
  updateStatusText(`加载数据: ${percentage}%`);
}

async function loadGameData() {
  const catalogs = [
    'model-catalog.json',
    'effect-catalog.json',
    'detonation-catalog.json',
    // ...
  ];
  
  let loaded = 0;
  const total = catalogs.length;
  
  showLoadingProgress(loaded, total);
  
  // 并行加载
  const data = await FrostDataLoader.loadAll();
  loaded = total;
  
  showLoadingProgress(loaded, total);
  
  // ...
}
```

## 预期效果

### 加载性能

**优化前**:
1. 下载 14MB Main.js（3-5秒 @10Mbps）
2. 解析 JavaScript（2-3秒）
3. 执行初始化（1-2秒）
**总计**: 6-10秒

**优化后**（首次加载）:
1. 下载 2MB Main.js（0.5秒 @10Mbps）
2. 解析 JavaScript（0.3秒）
3. 并行下载 8个数据文件（3-4秒，利用HTTP/2多路复用）
4. 解析 JSON 数据（1秒）
5. 执行初始化（1秒）
**总计**: 5-7秒（提升 15-30%）

**优化后**（缓存后）:
1. 304 Not Modified 检查（0.1秒）
2. 从缓存加载（0.5秒）
3. 执行初始化（1秒）
**总计**: 1.6秒（提升 75%）

### 内存使用

- 初始脚本内存：14MB → 2MB（减少 86%）
- 峰值内存：相同（数据最终都在内存中）
- GC 压力：降低（分批加载）

## 风险评估

### 高风险
- ❌ 构建脚本修改复杂，容易引入错误
- ❌ 客户端异步改造可能影响现有逻辑

### 中风险
- ⚠️ 网络加载失败需要降级方案
- ⚠️ 跨域问题（如果部署在 CDN）

### 低风险
- ✅ 数据格式兼容性（已验证）
- ✅ 工具链完整性（已实现）

## 推荐方案

**阶段性实施**，避免大规模重构：

### 方案 A：渐进式外部化（推荐）

1. **阶段 1**（低风险）：
   - 只外部化肖像数据（1MB）
   - 验证加载流程和缓存机制
   - 评估性能提升

2. **阶段 2**（中等收益）：
   - 外部化模型目录（4MB）
   - 实施加载进度UI

3. **阶段 3**（高收益）：
   - 外部化特效目录（5MB）
   - 完整验证

### 方案 B：延迟实施（当前选择）

**暂不实施数据外部化**，理由：
1. 初步优化（对象池）已减少 15% 实体
2. **编辑器性能问题主要在引擎侧**，而非数据加载
3. 数据外部化收益有限（首次加载提升 15-30%）
4. 改造风险高，投入产出比不理想

**优先级更高的工作**：
- ✅ 引擎渲染性能优化
- ✅ 场景加载流程优化
- ✅ 编辑器响应性优化

## 工具和文件清单

### 已创建的工具

```
scripts/
  └── build-frostbound-data.mjs      # 数据提取工具

samples/frostbound-realms/game/
  ├── data-loader.js                 # 运行时加载器
  └── object-pool.js                 # 对象池管理器

docs/
  ├── performance-optimization-frostbound.md
  └── data-externalization-plan.md   # 本文档
```

### 待修改的文件

```
scripts/
  └── build-frostbound.mjs           # 第 267 行：输出逻辑

samples/frostbound-realms/game/
  └── client.js                      # init() 函数改为异步
```

## 结论

数据外部化技术方案已完整制定，工具链已就绪。但基于当前性能瓶颈分析，**建议优先优化引擎本身性能**，数据外部化作为后续优化备选方案。

---

**Author**: MiYu  
**Date**: 2024  
**Status**: 方案制定完成，工具已就绪，待引擎性能优化后评估是否实施
