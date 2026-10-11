// Author: MiYu. Verify shipped map files drive menu previews and single-player worlds.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {clientWorldFixture} from './frost-client-world-fixture.mjs';
const root=new URL('../samples/frostbound-realms/',import.meta.url),source=fs.readFileSync(new URL('Assets/Scripts/Main.js',root),'utf8'),scene=JSON.parse(fs.readFileSync(new URL('Assets/Scenes/Main.mscene',root))).world;
const world=clientWorldFixture(scene),engine=Object.assign(world.engine,{assets:{sampleNodes:()=>[]},network:{poll:()=>[],close(){},send(){}},storage:{load(){},save(){}},playAudio(){}}),context=vm.createContext({engine});
vm.runInContext(source.replace('  return {tick};','  return {tick,solo,menuMap,state:()=>state};'),context);
context.onTick(0);world.commit();
for(const [key,map] of Object.entries(context.FrostMapCatalog))assert.deepEqual(JSON.parse(JSON.stringify(map)),JSON.parse(fs.readFileSync(new URL('Assets/Maps/'+key+'.json',root))),'bundle matches '+key+' map file');
context.FrostMapCatalog.skirmish.name='Configured battlefield';context.FrostMapCatalog.skirmish.startingGold=987;
assert.equal(context.FrostClient.menuMap().name,'Configured battlefield');
context.FrostClient.solo('skirmish');assert.equal(context.FrostClient.state().map.name,'Configured battlefield');assert.equal(context.FrostClient.state().teams[0].gold,987);
for(const key of ['moba','td','rpg']){context.FrostClient.solo(key);assert.equal(context.FrostClient.state().map.name,context.FrostMapCatalog[key].name);assert.equal(context.FrostClient.state().mode,key);}
const siege=context.Frost.clone(context.FrostMapCatalog.siege);context.FrostClient.solo('skirmish',siege);assert.equal(context.FrostClient.state().map.name,siege.name);
context.FrostClient.state().map.name='Edited runtime map';assert.equal(context.FrostMapCatalog.siege.name,siege.name,'runtime edits preserve catalog');
console.log('PASS map catalog: all shipped JSON files match bundle, menu and default single-player consume configuration, all modes load and runtime maps remain independent');
