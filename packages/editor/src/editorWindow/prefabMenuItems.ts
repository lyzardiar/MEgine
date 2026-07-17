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
    validate: (context) => context.store.mode === 'edit' && context.store.selected != null,
  },
);

registerMenuItem(
  'GameObject/Prefab/Apply',
  async (context) => {
    const path = await applySelectedPrefab(context.store);
    context.log(`Applied ${path}`);
    context.refresh();
  },
  {
    priority: 20,
    separatorBefore: true,
    validate: (context) => context.store.getPrefabInstance(context.contextEntity) != null,
  },
);

registerMenuItem(
  'GameObject/Prefab/Revert',
  async (context) => {
    const path = await revertSelectedPrefab(context.store);
    context.log(`Reverted ${path}`);
    context.refresh();
  },
  {
    priority: 21,
    validate: (context) => context.store.getPrefabInstance(context.contextEntity) != null,
  },
);

registerMenuItem(
  'GameObject/Prefab/Unpack',
  (context) => {
    const path = unpackSelectedPrefab(context.store);
    context.log(`Unpacked ${path}`);
    context.refresh();
  },
  {
    priority: 22,
    validate: (context) => context.store.getPrefabInstance(context.contextEntity) != null,
  },
);
