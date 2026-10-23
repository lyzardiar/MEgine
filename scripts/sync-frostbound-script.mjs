// Author: MiYu. Refresh game code and map registrations, preserving scenes and art.
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncGameScript} from './frost-script-bundle.mjs';
const source=fileURLToPath(new URL('../samples/frostbound-realms/',import.meta.url));
console.log(JSON.stringify(syncGameScript(source,process.argv[2]?path.resolve(process.argv[2]):source)));
