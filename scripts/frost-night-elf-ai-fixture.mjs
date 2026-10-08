// Author: MiYu. Standard resource-funded Night Elf economy with a land barrier for late-game acceptance.
export function nightAiFixture(S){
 const map=S.defaultMap();map.name='Original Night Elf AI';map.props=[{kind:'mine',x:-20,z:20,amount:10000},{kind:'mine',x:-20,z:-7,amount:10000},{kind:'mine',x:-7,z:-22,amount:10000},...Array.from({length:14},(_,i)=>({kind:'tree',x:-14+(i%7)*2,z:12+Math.floor(i/7)*3,amount:500}))];map.units=[];map.triggers=[];map.doodads=[];for(const k of ['terrain','heights','relief','ramps'])map[k].fill(0);map.spawns=[[-24,24],[24,-24]];for(let i=0;i<32;i++)map.terrain[i*32+16]=1;
 return S.create('skirmish',{map,factions:[2,0],ai:[true,false]});
}
