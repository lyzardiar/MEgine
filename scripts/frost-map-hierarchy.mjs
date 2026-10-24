// Author: MiYu. Organize map placements without changing their IDs, transforms or model children.
export function groupMapScene(scene, cellSize = 32) {
  if (!Number.isFinite(cellSize) || cellSize <= 0) throw Error('Map hierarchy cell size must be positive');
  const entities = scene.world.entities, roots = entities.filter(entity => entity.parent == null);
  let next = entities.reduce((max, entity) => Math.max(max, entity.entity), 0) + 1;
  const groups = new Map();
  const group = (key, name, parent = null) => {
    if (!groups.has(key)) {
      const entity = { entity: next++, name, parent, active: true, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } };
      entities.push(entity); groups.set(key, entity.entity);
    }
    return groups.get(key);
  };
  for (const entity of roots) {
    const name = entity.name ?? '', kind = /^(Ground|Water|Cliff)-/.test(name) ? 'terrain' : /^Doodad-/.test(name) ? 'doodads' : /^Unit-/.test(name) ? 'units' : null;
    if (!kind) continue;
    const root = group('map', '地图内容');
    let parent = group(kind, { terrain: '地形', doodads: '装饰物', units: '单位' }[kind], root);
    if (kind === 'terrain') {
      const type = name.split('-')[0]; parent = group(`terrain/${type}`, { Ground: '地面', Water: '水面', Cliff: '悬崖' }[type], parent);
    } else if (kind === 'doodads') {
      const position = entity.components.Transform?.position;
      const cell = position && Number.isFinite(position[0]) && Number.isFinite(position[2]) ? `${Math.floor(position[0] / cellSize)}, ${Math.floor(position[2] / cellSize)}` : '未定位';
      parent = group(`doodads/${cell}`, `区域 ${cell}`, parent);
    }
    entity.parent = parent;
  }
  return { version: 1, cellSize, addedGroups: groups.size };
}
