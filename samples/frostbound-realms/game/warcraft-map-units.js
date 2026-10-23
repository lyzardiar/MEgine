// Author: MiYu. Bind executed original units to scene roots and select through the active perspective camera.
var FrostWarcraftMapUnits=(()=>{
  function rotate(v,q){const [x,y,z,w]=q,[a,b,c]=v,tx=2*(y*c-z*b),ty=2*(z*a-x*c),tz=2*(x*b-y*a);return [a+w*tx+y*tz-z*ty,b+w*ty+z*tx-x*tz,c+w*tz+x*ty-y*tx];}
  const inverse=q=>[-q[0],-q[1],-q[2],q[3]],finite3=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  function ray(camera,pointer,viewport){
    const [w,h]=viewport,[px,py]=pointer,c=camera.Camera3D,t=camera.Transform;
    if(!(w>0&&h>0&&px>=0&&py>=0&&px<w&&py<h)||c.projection!=='perspective'||!finite3(t.position))return null;
    const tangent=Math.tan(c.fov_y_degrees*Math.PI/360),v=[(2*px/w-1)*tangent*w/h,(1-2*py/h)*tangent,-1],length=Math.hypot(...v);
    return {origin:t.position,direction:rotate(v.map(x=>x/length),t.rotation),near:c.near??0,far:c.far??Infinity};
  }
  function hitBox(ray,transform,bounds){
    const q=inverse(transform.rotation),origin=rotate(ray.origin.map((v,i)=>v-transform.position[i]),q).map((v,i)=>v/transform.scale[i]),direction=rotate(ray.direction,q).map((v,i)=>v/transform.scale[i]);let near=ray.near,far=ray.far;
    for(let i=0;i<3;i++){
      if(Math.abs(direction[i])<1e-10){if(origin[i]<bounds.min[i]||origin[i]>bounds.max[i])return null;continue;}
      const a=(bounds.min[i]-origin[i])/direction[i],b=(bounds.max[i]-origin[i])/direction[i];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far)return null;
    }
    return near;
  }
  function create(initialization,data){
    if(!data||initialization?.status!=='ready')return null;
    try{return bind(initialization,data);}catch(error){return {status:'unsupported',error:error.message,count:0,selected:()=>null,tick(){}};}
  }
  function bind(initialization,data){
    if(data.version!==1||!Array.isArray(data.placements)||!data.definitions||!data.selection)throw Error('Invalid unit binding data');
    const index=new Map(),used=new Set(),bound=[],key=(type,player,x,y)=>type+'/'+player+'/'+x+'/'+y;
    for(const p of data.placements){const k=key(p.typeId,p.player,Math.floor(p.sourcePosition[0]),Math.floor(p.sourcePosition[1]));if(!index.has(k))index.set(k,[]);index.get(k).push(p);}
    for(const u of initialization.units){
      const candidates=[],[x,y]=u.sourcePosition;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const p of index.get(key(u.typeId,u.player,Math.floor(x)+dx,Math.floor(y)+dy))||[])if(!used.has(p.index)&&Math.abs(p.sourcePosition[0]-x)<.052&&Math.abs(p.sourcePosition[1]-y)<.052&&Math.abs((p.facing-u.facing+540)%360-180)<.001)candidates.push(p);
      if(candidates.length!==1)throw Error('Missing or ambiguous visual placement for unit '+u.id);
      const placement=candidates[0],definition=data.definitions[u.typeId];if(!definition||!finite3(definition.bounds?.min)||!finite3(definition.bounds?.max))throw Error('Missing source unit definition '+u.typeId);
      used.add(placement.index);bound.push({unit:u,placement,definition});
    }
    if(used.size!==data.placements.length)throw Error('Uncreated source unit placements');
    const names=[...bound.map(b=>b.placement.name),'Map unit selection'],entities=[];
    for(let i=0;i<names.length;i+=1024)entities.push(...engine.findEntitiesByName(names.slice(i,i+1024)));
    const byName=new Map();for(const e of entities){if(byName.has(e.name))throw Error('Duplicate unit visual name '+e.name);byName.set(e.name,e);}
    const circle=byName.get('Map unit selection');if(!circle?.components.MeshRenderer)throw Error('Missing source selection renderer');
    const commands=[];
    for(const b of bound){
      const e=byName.get(b.placement.name),t=e?.components.Transform;if(!finite3(t?.position)||!finite3(t?.scale)||t.scale.some(v=>v===0))throw Error('Invalid unit visual transform');
      b.entity=e.entity;b.transform={...t,position:[b.unit.sourcePosition[0]/128,t.position[1],-b.unit.sourcePosition[1]/128],rotation:[0,Math.sin(b.unit.facing*Math.PI/360),0,Math.cos(b.unit.facing*Math.PI/360)]};
      if(JSON.stringify(t)!==JSON.stringify(b.transform))commands.push({op:'setComponent',entity:e.entity,component:'Transform',value:b.transform});
    }
    for(const b of bound){const u=b.unit,d=b.definition;u.visual={entity:b.entity,placementIndex:b.placement.index,creationNumber:b.placement.creationNumber};u.name=d.name;u.states={MAX_LIFE:d.maxLife,LIFE:d.maxLife,MAX_MANA:d.maxMana,MANA:d.initialMana,...u.states};}
    if(commands.length)engine.pushCommandsJson(JSON.stringify(commands));
    let selected=null,selectionKey='';
    function select(next){
      const key=next?JSON.stringify([next.entity,next.transform]):'';if(selectionKey===key)return;selectionKey=key;selected=next;
      if(!next){engine.setActive(circle.entity,false);return;}
      const d=next.definition,u=next.unit,cfg=data.selection,size=d.selectionScale*cfg.scaleFactor,material=cfg.sizes.find(s=>s.maxSize===null||size<=s.maxSize)?.material;if(!material)throw Error('Missing source circle size');
      const color=cfg.colors[u.player===data.localPlayer?'friend':u.player===15?'neutral':'enemy'],position=[...next.transform.position];position[1]+=d.selectionZ-d.moveHeight+.01;
      const p=next.placement,ground=p.selectionMesh&&Math.abs(position[0]-p.sourcePosition[0]/128)<.052/128&&Math.abs(position[2]+p.sourcePosition[1]/128)<.052/128;
      if(ground){position[0]=p.sourcePosition[0]/128;position[1]=d.selectionZ+.01;position[2]=-p.sourcePosition[1]/128;}
      const commands=[{op:'setComponent',entity:circle.entity,component:'Transform',value:{position,rotation:[0,0,0,1],scale:[size/128,1,size/128]}},{op:'setComponent',entity:circle.entity,component:'MeshRenderer',value:{...circle.components.MeshRenderer,mesh:ground?p.selectionMesh:cfg.mesh,material}},{op:'setComponent',entity:circle.entity,component:'MaterialPropertyBlock',value:{override_base_color:true,base_color:color}},{op:'setActive',entity:circle.entity,active:true}];
      engine.pushCommandsJson(JSON.stringify(commands));
    }
    function tick(input){
      if(!(input.pressedButtons||[]).includes(0))return;
      const viewport=input.viewport||[1280,720],pointer=input.pointer||[-1,-1],[w,h]=viewport;if(!(w>0&&h>0)||Math.abs((pointer[1]-h/2)*1280/w+318)<42)return;
      if(!(pointer[0]>=0&&pointer[1]>=0&&pointer[0]<w&&pointer[1]<h))return;
      const names=['Camera',...bound.map(b=>b.placement.name)],current=new Map();for(let i=0;i<names.length;i+=1024)for(const e of engine.findEntitiesByName(names.slice(i,i+1024)))current.set(e.name,e);
      const camera=current.get('Camera');if(!camera)return;const r=ray(camera.components,pointer,viewport);if(!r)return;
      let nearest=null,distance=Infinity;for(const b of bound){const e=current.get(b.placement.name),transform=e?.components.Transform;if(!e||e.entity!==b.entity||e.active===false||!finite3(transform?.position)||!finite3(transform?.scale)||transform.scale.some(v=>v===0))continue;b.transform=transform;const t=hitBox(r,b.transform,b.definition.bounds);if(t!==null&&t<distance){nearest=b;distance=t;}}select(nearest);
    }
    return {status:'ready',count:bound.length,selected:()=>selected?.unit||null,tick};
  }
  return {create,ray,hitBox};
})();
if(typeof module!=='undefined')module.exports=FrostWarcraftMapUnits;
