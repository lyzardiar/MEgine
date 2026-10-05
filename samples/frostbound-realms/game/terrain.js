/* Author: MiYu. Four-cell chunks share a one-cell border for continuous terrain and fog. */
var FrostTerrain=(()=>{
  const meshes=new WeakMap(),waterMeshes=new WeakMap(),detailCache=new WeakMap(),detailCount=192;
  const pathingCache=new WeakMap();
  const names=Array.from({length:9},(_,i)=>'cells'+i);
  const surfaceNames=['Auto terrain','Soil','Snow','Grass','Rock'];
  const tilesetNames=['Winter','Forest','Barrens'],tilesetColors=[[.49,.6,.61,1],[.26,.43,.14,1],[.62,.48,.29,1]];
  const cliffNames=['Rock','Ice','Masonry'],cliffMaterials=['Ground','GroundIce','GroundMasonry'];
  const material=map=>'Assets/Materials/'+cliffMaterials[map.cliffStyle||0]+'.mmat';
  const cliff=(map,i)=>map.cliffs?.[i]?map.cliffs[i]-1:map.cliffStyle||0;
  function cells(state,team,allVisible){
    const blight=[...(state.blight||[]),...state.units.filter(u=>u.hp>0&&u.built===1&&u.kind==='hall'&&state.teams[u.team]?.faction===3).map(u=>({x:u.x,z:u.z,radius:10}))];
    return state.map.terrain.map((kind,i)=>{
      if(state.mode==='td'&&kind===0){const x=i%32*2-31,z=Math.floor(i/32)*2-31;if(Frost.tdPath.slice(1).some((p,j)=>{const a=Frost.tdPath[j];return Math.abs(a[0]-p[0])<1?Math.abs(x-p[0])<2&&z>=Math.min(a[1],p[1])&&z<=Math.max(a[1],p[1]):Math.abs(z-p[1])<2&&x>=Math.min(a[0],p[0])&&x<=Math.max(a[0],p[0]);}))kind=2;}
      // MiYu: base terrain + three times the authored surface; the fractional field retains fog.
      if(kind!==1)kind+=(blight.some(b=>Math.hypot(i%32*2-31-b.x,Math.floor(i/32)*2-31-b.z)<=b.radius)?5:state.map.surfaces?.[i]||0)*3;
      return kind*2+(allVisible||state.visible[team]?.[i]?1:state.explored[team]?.[i]?.4:.07);
    });
  }
  function pathing(state){let values=pathingCache.get(state);if(values)return values;values=state.map.terrain.map((_,i)=>{const x=i%32*2-31,z=Math.floor(i/32)*2-31;return Frost.solid(state,x,z,0,-1,.5)?2:Frost.buildingSite(state,x,z,1)?0:1;});pathingCache.set(state,values);return values;}
  function chunk(data,x,z){
    const packed=[];for(let dz=-1;dz<=4;dz++)for(let dx=-1;dx<=4;dx++)packed.push(data[Frost.clamp(z*4+dz,0,31)*32+Frost.clamp(x*4+dx,0,31)]);
    return Array.from({length:9},(_,i)=>packed.slice(i*4,i*4+4));
  }
  function mesh(map,x,z){let cache=meshes.get(map);if(!cache){cache=[];meshes.set(map,cache);}const slot=z*8+x;if(cache[slot])return cache[slot];let data='',styles='';for(let dz=-1;dz<=4;dz++)for(let dx=-1;dx<=4;dx++){const i=Frost.clamp(z*4+dz,0,31)*32+Frost.clamp(x*4+dx,0,31);for(const [cx,cz] of [[0,0],[2,0],[2,2],[0,2]])data+=Frost.tierHeight(map,i,cx,cz).toString(16);styles+=cliff(map,i);}for(let dz=-1;dz<=5;dz++)for(let dx=-1;dx<=5;dx++)data+=(128+(map.relief?.[Frost.clamp(z*4+dz,0,32)*33+Frost.clamp(x*4+dx,0,32)]||0)*16).toString(16).padStart(2,'0');const suffix=styles.split('').every(v=>v===styles[0])?styles[0]==='0'?'':styles[0]:styles;return cache[slot]='terrain4h:'+x.toString(16)+z.toString(16)+data+suffix;}
  function waterMesh(map,x,z,bed=false){let cache=waterMeshes.get(map);if(!cache){cache=[];waterMeshes.set(map,cache);}const slot=z*8+x;if(cache[slot]===undefined){const wet=chunk(map.terrain,x,z).flat().map(v=>v===1?'1':'0').join('');cache[slot]=wet.includes('1')?'terrain4w:'+mesh(map,x,z).slice(10,254)+wet:null;}return cache[slot]&&cache[slot]+(bed?'1':'0');}
  function details(map){
    const key=[map.terrain,map.surfaces,map.heights,map.ramps,map.relief].map(v=>v?.join(',')).join(';'),cached=detailCache.get(map);if(cached?.key===key)return cached.values;
    const values=Array.from({length:detailCount},(_,i)=>{
      const tile=(i*37+19)%1024,surface=map.surfaces?.[tile]||0;if(map.terrain[tile]!==0||surface!==0&&surface!==3)return null;
      const x=tile%32*2-31.5+(i*17%101)/101,z=Math.floor(tile/32)*2-31.5+(i*29%101)/101;
      const p=Frost.groundSample(map,x,z);if(p?.i!==tile||!Frost.groundClear(map,x,z,x,z,.55))return null;
      const dx=(Frost.elevation(map,x+.25,z)-Frost.elevation(map,x-.25,z))*2,dz=(Frost.elevation(map,x,z+.25)-Frost.elevation(map,x,z-.25))*2,n=Math.hypot(dx,1,dz);
      return {x,z,y:p.y-.02,tile,normal:[-dx/n,1/n,-dz/n]};
    });detailCache.set(map,{key,values});return values;
  }
  return {pathing,names,surfaceNames,tilesetNames,tilesetColors,cliffNames,material,cliff,cells,chunk,mesh,waterMesh,detailCount,details};
})();
if(typeof module!=='undefined')module.exports=FrostTerrain;
