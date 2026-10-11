// Author: MiYu. Native Stand bounds selection keeps its source-flag behavior while using the complete shared rules API.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),S=require('../samples/frostbound-realms/game/simulation.js'),root=new URL('../samples/frostbound-realms/',import.meta.url),catalog={...JSON.parse(fs.readFileSync(new URL('model-catalog.json',root))),...JSON.parse(fs.readFileSync(new URL('human-army-models.json',root)))};
for(const name of fs.readdirSync(root))if(name.endsWith('-models.json'))Object.assign(catalog,JSON.parse(fs.readFileSync(new URL(name,root))));
globalThis.Frost=S;globalThis.FrostArt=catalog;const V=require('../samples/frostbound-realms/game/visuals.js'),actors=Object.entries(catalog).filter(([,a])=>a.classic),select=()=>actors.map(([key,a])=>[key,V.classicClip(a,'Stand',{ancient:key.startsWith('WildwoodHall'),uprooted:!!a.classicUprooted})]),current=select();
// The clip probe supplies source form flags rather than a gameplay unit; all hero and summon predicates are false.
globalThis.Frost=new Proxy({ancient:u=>u.ancient},{get:(object,key)=>object[key]??(()=>false)});try{assert.deepEqual(select(),current);}finally{globalThis.Frost=S;}
assert.ok(actors.length>100);console.log('PASS classic import selector: complete shared-rules API preserves native Stand bounds clip selection for '+actors.length+' source actor/building bindings');
