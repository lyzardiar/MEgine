// Author: MiYu. Runtime object pool manager for dynamic entity creation.
// Creates entities on-demand instead of pre-allocating all at scene load.

const FrostObjectPool = (() => {
  const pools = {};
  const templates = {};
  let entityIdCounter = 100000; // Start from high ID to avoid conflicts

  function registerTemplate(poolName, createFn) {
    templates[poolName] = createFn;
    pools[poolName] = {
      active: [],
      inactive: [],
      created: 0
    };
  }

  function spawn(poolName, index) {
    const pool = pools[poolName];
    if (!pool) {
      console.error(`Pool "${poolName}" not registered`);
      return null;
    }

    // Reuse inactive entity if available
    if (pool.inactive.length > 0) {
      const entity = pool.inactive.pop();
      pool.active.push(entity);
      return entity;
    }

    // Create new entity
    if (!templates[poolName]) {
      console.error(`No template for pool "${poolName}"`);
      return null;
    }

    const entity = templates[poolName](index || pool.created, entityIdCounter++);
    pool.created++;
    pool.active.push(entity);

    // Use engine API to spawn entity
    if (typeof engine !== 'undefined' && engine.pushCommandJson) {
      engine.pushCommandJson(JSON.stringify({
        op: 'spawn',
        name: entity.name,
        components: entity.components
      }));
    }

    return entity;
  }

  function recycle(poolName, entity) {
    const pool = pools[poolName];
    if (!pool) return;

    const index = pool.active.indexOf(entity);
    if (index === -1) return;

    pool.active.splice(index, 1);
    pool.inactive.push(entity);

    // Hide entity by moving off-screen
    if (typeof engine !== 'undefined' && engine.pushCommandJson) {
      engine.pushCommandJson(JSON.stringify({
        op: 'set',
        entity: entity.entity,
        component: 'Transform',
        value: {position: [0, -100, 0], scale: [1, 1, 1], rotation: [0, 0, 0, 1]}
      }));
    }
  }

  function ensureCapacity(poolName, count) {
    const pool = pools[poolName];
    if (!pool) return;

    const needed = count - (pool.active.length + pool.inactive.length);
    for (let i = 0; i < needed; i++) {
      const entity = spawn(poolName);
      if (entity) recycle(poolName, entity);
    }
  }

  function getActive(poolName) {
    return pools[poolName]?.active || [];
  }

  function getStats() {
    const stats = {};
    for (const [name, pool] of Object.entries(pools)) {
      stats[name] = {
        active: pool.active.length,
        inactive: pool.inactive.length,
        total: pool.created
      };
    }
    return stats;
  }

  return {
    registerTemplate,
    spawn,
    recycle,
    ensureCapacity,
    getActive,
    getStats
  };
})();
