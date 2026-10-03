/* Author: MiYu. Four-cell chunks share a one-cell border for continuous terrain and fog. */
var FrostTerrain=(()=>{
  const meshes=new WeakMap();
  const names=Array.from({length:9},(_,i)=>'cells'+i);
  const surfaceNames=['Auto winter','Soil','Snow','Grass','Rock'];
  const cliffNames=['Rock','Ice','Masonry'],cliffMaterials=['Ground','GroundIce','GroundMasonry'];
  const material=map=>'Assets/Materials/'+cliffMaterials[map.cliffStyle||0]+'.mmat';
  function cells(state,team,allVisible){
    return state.map.terrain.map((kind,i)=>{
      if(state.mode==='td'&&kind===0){const x=i%32*2-31,z=Math.floor(i/32)*2-31;if(Frost.tdPath.slice(1).some((p,j)=>{const a=Frost.tdPath[j];return Math.abs(a[0]-p[0])<1?Math.abs(x-p[0])<2&&z>=Math.min(a[1],p[1])&&z<=Math.max(a[1],p[1]):Math.abs(z-p[1])<2&&x>=Math.min(a[0],p[0])&&x<=Math.max(a[0],p[0]);}))kind=2;}
      // MiYu: base terrain + three times the authored surface; the fractional field retains fog.
      if(kind!==1)kind+=(state.map.surfaces?.[i]||0)*3;
      return kind*2+(allVisible||state.visible[team]?.[i]?1:state.explored[team]?.[i]?.4:.07);
    });
  }
  function chunk(data,x,z){
    const packed=[];for(let dz=-1;dz<=4;dz++)for(let dx=-1;dx<=4;dx++)packed.push(data[Frost.clamp(z*4+dz,0,31)*32+Frost.clamp(x*4+dx,0,31)]);
    return Array.from({length:9},(_,i)=>packed.slice(i*4,i*4+4));
  }
  function mesh(map,x,z){let cache=meshes.get(map);if(!cache){cache=[];meshes.set(map,cache);}const slot=z*8+x;if(cache[slot])return cache[slot];let data='';for(let dz=-1;dz<=4;dz++)for(let dx=-1;dx<=4;dx++){const i=Frost.clamp(z*4+dz,0,31)*32+Frost.clamp(x*4+dx,0,31);for(const [cx,cz] of [[0,0],[2,0],[2,2],[0,2]])data+=Frost.tierHeight(map,i,cx,cz).toString(16);}for(let dz=-1;dz<=5;dz++)for(let dx=-1;dx<=5;dx++)data+=(128+(map.relief?.[Frost.clamp(z*4+dz,0,32)*33+Frost.clamp(x*4+dx,0,32)]||0)*16).toString(16).padStart(2,'0');return cache[slot]='terrain4h:'+x.toString(16)+z.toString(16)+data+(map.cliffStyle?map.cliffStyle.toString(16):'');}
  return {names,surfaceNames,cliffNames,material,cells,chunk,mesh};
})();
if(typeof module!=='undefined')module.exports=FrostTerrain;
