// Author: MiYu. Generated default custom-game Crypt Lord preview text and original portrait.
import assert from 'node:assert/strict';
import {context,component,key,click,ui} from './test-frost-crypt-lord-generated.mjs';
key('F10');key('KeyX');click(ui('solo box'));click(ui('custom box'));
for(let i=0;i<3;i++){click(ui('faction box'));click(ui('heroChoice box'));}
assert.match(component('heroChoice label','Text').text,/Crypt Lord/);
assert.equal(component('Hero preview','Image').sprite,context.Frost.cryptLordRules.unit.icon);
console.log('PASS generated custom-game source Crypt Lord label and original portrait');
