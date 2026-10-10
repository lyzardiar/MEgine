// Author: MiYu. Identity folders preserve authored world transforms and pooled node names.
export function groupFrostScene(entities) {
  const originals = entities.slice(), groups = new Map();
  let nextId = entities.reduce((id, e) => Math.max(id, e.entity + 1), 1);
  const folder = (segments) => {
    let parent = null, key = '';
    for (const segment of segments) {
      key += '/' + segment;
      if (!groups.has(key)) {
        const entity = { entity: nextId++, name: 'Scene / ' + key.slice(1), parent, siblingIndex: entities.length, active: true, components: { Transform: { position: [0, 0, 0], rotation: [0, 0, 0, 1], scale: [1, 1, 1] } } };
        entities.push(entity);
        groups.set(key, entity.entity);
      }
      parent = groups.get(key);
    }
    return parent;
  };
  for (const e of originals) {
    if (e.parent != null || e.components.Canvas || e.components.RectTransform || e.name?.startsWith('Scene / ')) continue;
    const name = e.name ?? '', position = e.components.Transform?.position;
    let category;
    if (/^(Ground|Riverbed|Water|Pathing)\b/.test(name)) category = ['Terrain'];
    else if (/^(Scenery|Doodad|Prop)\b/.test(name)) category = ['Environment'];
    else if (/^(Unit|Corpse)\b/.test(name)) category = ['Units'];
    else if (/^Missile\b/.test(name)) category = ['Projectiles'];
    else if (e.components.AudioSource || e.components.AudioListener || e.components.AudioMixer) category = ['Audio'];
    else if (/^Classic\b/.test(name) || e.components.SampledEffect || e.components.ParticleEmitter3D || e.components.ParticleEmitter2D) category = ['Effects'];
    else category = ['Systems'];
    const pool = /^(.*?)(\d+)(.*)$/.exec(name);
    if (category[0] === 'Terrain' && position && position[1] !== -100) {
      category.push(`Region ${Math.floor(position[0] / 16)},${Math.floor(position[2] / 16)}`, name.split(' ')[0]);
    } else if (pool) {
      category.push(pool[1].trim() || 'Nodes', `Slots ${Math.floor(Number(pool[2]) / 32) * 32}-${Math.floor(Number(pool[2]) / 32) * 32 + 31}`);
    }
    e.parent = folder(category);
  }
  return { originalEntities: originals.length, groups: groups.size, roots: entities.filter((e) => e.parent == null).length };
}
