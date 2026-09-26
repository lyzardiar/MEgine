// Public script API shared by the editor and standalone player.
((command, request, revision, snapshot, spriteBatch) => {
  let valueRevision = -1, value, jsonRevision = -1, json;
  const api = {
    scene: null,
    pushCommandJson: json => command(String(json)),
    setSpriteBatchData: (entity, instances, colors = []) => spriteBatch(String(entity), instances, colors),
    setClearColor(r, g, b, a = 1) {
      const number = (value, fallback = 0) => typeof value === 'number' ? value : fallback;
      command(JSON.stringify({op: 'setClearColor', r: number(r), g: number(g), b: number(b), a: number(a, 1)}));
    },
  };
  const snapshotProperty = {
    enumerable: true, configurable: true,
    get() { const current = revision(); if (valueRevision !== current) { value = JSON.parse(snapshot()); valueRevision = current; } return value; },
    set(next) { value = next; valueRevision = revision(); },
  };
  const jsonProperty = {
    enumerable: true, configurable: true,
    get() { const current = revision(); if (jsonRevision !== current) { json = snapshot(); jsonRevision = current; } return json; },
    set(next) { json = next; jsonRevision = revision(); },
  };
  for (const name of ['loadScene', 'reloadScene', 'instantiatePrefab', 'setAnimatorParameter', 'setAnimatorTrigger', 'playAnimatorState', 'setAnimatorLayerWeight', 'playAnimatorLayerState', 'playAnimation', 'pauseAnimation', 'stopAnimation', 'seekAnimation', 'playTimeline', 'pauseTimeline', 'stopTimeline', 'seekTimeline', 'playAudio', 'pauseAudio', 'stopAudio', 'seekAudio']) {
    api[name] = (...args) => {
      if (name === 'reloadScene') return request(name, '[]');
      if (name === 'instantiatePrefab') {
        args[0] = String(args[0]);
        if (args.length > 1 && typeof args[1] !== 'number') args[1] = String(args[1]);
      } else if (typeof args[0] !== 'number') args[0] = String(args[0]);
      if (['setAnimatorParameter', 'setAnimatorTrigger', 'playAnimatorState', 'setAnimatorLayerWeight', 'playAnimatorLayerState'].includes(name)) args[1] = String(args[1]);
      if (name === 'playAnimatorLayerState') args[2] = String(args[2]);
      return request(name, JSON.stringify(args, (_, value) => typeof value === 'bigint' ? String(value) : value));
    };
  }
  globalThis.engine = api;
  delete globalThis.__mengineCommand;
  delete globalThis.__mengineRequest;
  delete globalThis.__mengineRevision;
  delete globalThis.__mengineSnapshot;
  delete globalThis.__mengineSpriteBatch;
  const restoreSnapshot = () => {
    Object.defineProperty(globalThis.engine, 'snapshot', snapshotProperty);
    Object.defineProperty(globalThis, 'lastSnapshot', jsonProperty);
  };
  restoreSnapshot();
  return restoreSnapshot;
})(__mengineCommand, __mengineRequest, __mengineRevision, __mengineSnapshot, __mengineSpriteBatch);
