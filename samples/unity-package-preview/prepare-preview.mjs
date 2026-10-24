// Author: MiYu. Build an ignored standalone preview from an existing native Unity import.
import { cpSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const sample = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2] && resolve(process.argv[2]);
if (!source) throw new Error('Usage: node samples/unity-package-preview/prepare-preview.mjs IMPORTED_PROJECT [PREFAB_ASSET_PATH]');
const output = join(sample, 'LocalPreview');
if (existsSync(output)) throw new Error(`Preview already exists; move it aside to preserve local edits before generating another: ${output}`);

function inside(root, path) {
  const candidate = resolve(root, path), rel = relative(root, candidate);
  if (!rel || rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel)) throw new Error(`Path escapes source project: ${path}`);
  return candidate;
}

const imports = join(source, 'Assets', 'Imported');
const manifests = readdirSync(imports, { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => join(imports, entry.name, 'manifest.json')).filter(existsSync);
const reports = manifests.map(path => ({ path, value: JSON.parse(readFileSync(path, 'utf8')) }));
const choices = reports.flatMap(report => (report.value.prefabs ?? []).map(path => ({ ...report, prefab: path })));
const selected = process.argv[3] ? choices.find(choice => choice.prefab === process.argv[3].replaceAll('\\', '/')) : choices.length === 1 ? choices[0] : null;
if (!selected) throw new Error(`Select one imported prefab with the optional second argument. Available: ${choices.map(choice => choice.prefab).join(', ')}`);
const prefab = JSON.parse(readFileSync(inside(source, selected.prefab), 'utf8'));
const scene = JSON.parse(readFileSync(join(sample, 'Assets', 'Scenes', 'Main.mscene'), 'utf8'));
let nextId = Math.max(...scene.world.entities.map(entity => entity.entity)) + 1;
let particles = 0;
function append(node, parent, sibling, depth = 0) {
  if (depth > 256 || nextId > 65536 || !node || !node.name) throw new Error('Invalid or oversized imported prefab hierarchy');
  const components = structuredClone(node.components ?? {});
  for (const key of Object.keys(components)) if (!['Transform', 'ParticleEmitter3D'].includes(key)) throw new Error(`Preview generator only supports native particle prefab components: ${key}`);
  if (components.ParticleEmitter3D) {
    components.ParticleEmitter3D = { playback_time: -1, playback_generation: 0, ...components.ParticleEmitter3D };
    particles++;
    if (!existsSync(inside(source, components.ParticleEmitter3D.definition))) throw new Error('Particle definition is missing from the imported project');
  }
  if (parent === null && components.Transform) components.Transform.position = [0, 0, 0];
  const entity = nextId++;
  scene.world.entities.push({ entity, name: node.name, parent, sibling_index: sibling, active: node.active !== false, tag: node.tag ?? 'Untagged', layer: node.layer ?? 0, components });
  for (const [index, child] of (node.children ?? []).entries()) append(child, entity, index, depth + 1);
}
append(prefab.root, null, 3);
scene.name = `${prefab.name} Preview`;
scene.world.selected = 7;
const importDirectory = dirname(selected.path);
const importRelative = relative(source, importDirectory);
inside(source, importRelative);
mkdirSync(join(output, 'Assets', 'Scenes'), { recursive: true });
cpSync(importDirectory, join(output, importRelative), { recursive: true, filter: path => {
  if (lstatSync(path).isSymbolicLink()) throw new Error(`Import contains a symbolic link: ${path}`);
  return true;
} });
if (selected.value.source_root) {
  const sourceAssets = inside(source, selected.value.source_root);
  cpSync(sourceAssets, inside(output, selected.value.source_root), { recursive: true, filter: path => {
    if (lstatSync(path).isSymbolicLink()) throw new Error(`Source assets contain a symbolic link: ${path}`);
    return true;
  } });
}
cpSync(join(sample, 'Assets', 'Scripts'), join(output, 'Assets', 'Scripts'), { recursive: true });
cpSync(join(sample, 'Assets', 'Fonts'), join(output, 'Assets', 'Fonts'), { recursive: true });
writeFileSync(join(output, 'Assets', 'Scenes', 'Main.mscene'), `${JSON.stringify(scene, null, 2)}\n`);
writeFileSync(join(output, 'Assets', 'Scenes', 'Main.mscene.meta'), `${JSON.stringify({ schemaVersion: 1, guid: randomUUID(), importer: 'scene' })}\n`);
const project = JSON.parse(readFileSync(join(sample, 'project.json'), 'utf8'));
project.name = `${prefab.name} Preview`;
writeFileSync(join(output, 'project.json'), `${JSON.stringify(project, null, 2)}\n`);
writeFileSync(join(output, 'preview-source.json'), `${JSON.stringify({ sourceFingerprint: selected.value.source_fingerprint, prefab: selected.prefab, particleCount: particles }, null, 2)}\n`);
console.log(JSON.stringify({ project: join(output, 'project.json'), prefab: selected.prefab, particleCount: particles, entities: scene.world.entities.length }));
