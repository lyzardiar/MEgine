// Author: MiYu. Update installed map hierarchy and its asset receipt without reconverting resources.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { groupMapScene } from './frost-map-hierarchy.mjs';

const [project, id] = process.argv.slice(2);
if (!project || !/^[a-z0-9][a-z0-9-]*$/.test(id ?? '')) throw Error('Usage: node scripts/refresh-frost-map-hierarchy.mjs <project> <map-id>');
const root = path.resolve(project), folder = path.join(root, 'Assets/Maps', id), scenePath = path.join(folder, 'Scenes/Main.mscene'), manifestPath = path.join(folder, 'manifest.json');
const scene = JSON.parse(fs.readFileSync(scenePath, 'utf8')), result = groupMapScene(scene);
const bytes = Buffer.from(JSON.stringify(scene, null, 2) + '\n'), manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const record = manifest.assets.find(asset => asset.path === `Assets/Maps/${id}/Scenes/Main.mscene`);
if (!record) throw Error('Map scene is absent from the asset manifest');
record.sha256 = hash(bytes); record.bytes = bytes.length;
manifest.hierarchy = { version: result.version, cellSize: result.cellSize, generator: 'scripts/frost-map-hierarchy.mjs', generatorSha256: hash(fs.readFileSync(fileURLToPath(new URL('./frost-map-hierarchy.mjs', import.meta.url)))) };
fs.writeFileSync(scenePath, bytes); fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(JSON.stringify({ map: id, ...result, roots: scene.world.entities.filter(e => e.parent == null).length }));
