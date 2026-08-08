import {
  applySelectedPrefab,
  createProjectPrefabFromSelection,
  revertSelectedPrefab,
  unpackSelectedPrefab,
} from '../prefabWorkflow';
import { registerMenuItem } from './registry';

registerMenuItem(
  'Assets/Create/Prefab From Selection',
  async (context) => {
    const path = await createProjectPrefabFromSelection(context.store);
    context.log(`Created ${path}`);
    context.refresh();
  },
  {
    priority: 120,
    agentInvokable: false,
    agentAlternative: 'create_prefab',
    validate: (context) => context.store.mode === 'edit' && context.store.selected != null,
  },
);

registerMenuItem(
  'GameObject/Prefab/Apply',
  async (context) => {
    const path = await applySelectedPrefab(context.store, undefined, context.contextEntity);
    context.log(`Applied ${path}`);
    context.refresh();
  },
  {
    priority: 20,
    separatorBefore: true,
    agentInvokable: false,
    agentAlternative: 'apply_prefab',
    validate: (context) => context.store.getPrefabInstance(context.contextEntity) != null,
  },
);

registerMenuItem(
  'GameObject/Prefab/Revert',
  async (context) => {
    const path = await revertSelectedPrefab(context.store, undefined, context.contextEntity);
    context.log(`Reverted ${path}`);
    context.refresh();
  },
  {
    priority: 21,
    agentInvokable: false,
    agentAlternative: 'revert_prefab',
    validate: (context) => context.store.getPrefabInstance(context.contextEntity) != null,
  },
);

registerMenuItem(
  'GameObject/Prefab/Unpack',
  (context) => {
    const path = unpackSelectedPrefab(context.store, context.contextEntity);
    context.log(`Unpacked ${path}`);
    context.refresh();
  },
  {
    priority: 22,
    agentInvokable: false,
    agentAlternative: 'unpack_prefab',
    validate: (context) => context.store.getPrefabInstance(context.contextEntity) != null,
  },
);
