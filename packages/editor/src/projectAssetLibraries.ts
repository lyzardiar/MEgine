// Author: MiYu. Project lists derive from one asset snapshot; only sprite dependencies trigger sprite discovery.
import { projectAssetSessionGeneration, refreshProjectFiles } from './projectAssets.ts';
import { refreshScripts } from './scriptLibrary.ts';
import { refreshSprites } from './spriteLibrary.ts';

let spriteRevision: string | null = null;
let spriteRefresh: Promise<void> | null = null;

export async function refreshProjectLibraries(force = false): Promise<void> {
  const generation = projectAssetSessionGeneration();
  const files = await refreshProjectFiles({ force });
  if (generation !== projectAssetSessionGeneration()) return;
  await refreshScripts(files);
  if (generation !== projectAssetSessionGeneration()) return;
  const revision = JSON.stringify([generation, files.filter((asset) => asset.kind === 'texture' || asset.kind === 'sprite-import').map((asset) => [asset.relPath, asset.revision, asset.metaRevision])]);
  if (!force && spriteRevision === revision) return;
  const previous = spriteRefresh;
  const request = (async () => {
    await previous;
    if (generation !== projectAssetSessionGeneration() || !force && spriteRevision === revision) return;
    await refreshSprites();
    if (generation === projectAssetSessionGeneration()) spriteRevision = revision;
  })();
  spriteRefresh = request;
  try { await request; } finally { if (spriteRefresh === request) spriteRefresh = null; }
}
