// Author: MiYu. Source camera presets, map-bounded movement and terrain-following target height.
var originalMapCamera=(()=>{
  const cfg=originalCameraConfig,clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),aspect=cfg.projectionAspect||16/9;
  let camera=null,target=[...cfg.target],level=0,last='',drag=null;
  function height(x,z){const t=cfg.terrain,[w,h]=t.size,ix=clamp(Math.round(x-t.origin[0]),0,w-1),iz=clamp(Math.round(t.origin[1]-z),0,h-1);return t.heights[iz*w+ix];}
  function tick(dt){
    camera??=engine.findEntitiesByName(['Camera'])[0];if(!camera)return;
    const input=engine.input||{},keys=input.keys||[],pressed=input.pressedKeys||[],seconds=clamp(Number.isFinite(dt)?dt:0,0,.1);
    if(pressed.some(k=>['Equal','NumpadAdd','PageUp'].includes(k)))level=Math.min(cfg.presets.length-1,level+1);
    if(pressed.some(k=>['Minus','NumpadSubtract','PageDown'].includes(k)))level=Math.max(0,level-1);
    let dx=Number(keys.includes('ArrowRight')||keys.includes('KeyD'))-Number(keys.includes('ArrowLeft')||keys.includes('KeyA'));
    let dz=Number(keys.includes('ArrowDown')||keys.includes('KeyS'))-Number(keys.includes('ArrowUp')||keys.includes('KeyW'));
    const [w,h]=input.viewport||[0,0],[px,py]=input.pointer||[-1,-1],middle=(input.buttons||[]).includes(1);
    if(middle&&drag&&w>1&&h>1){const scale=cfg.presets[level].distance/h;target[0]-=(px-drag[0])*scale;target[1]-=(py-drag[1])*scale;}
    drag=middle?[px,py]:null;
    const length=Math.hypot(dx,dz),speed=cfg.speed*seconds/(length>1?length:1),sin=Math.sin(cfg.yaw),cos=Math.cos(cfg.yaw);
    target[0]=clamp(target[0]+(dx*cos+dz*sin)*speed,cfg.bounds[0],cfg.bounds[1]);target[1]=clamp(target[1]+(-dx*sin+dz*cos)*speed,cfg.bounds[2],cfg.bounds[3]);
    const preset=cfg.presets[level],pitch=preset.pitch,d=preset.distance,sp=Math.sin(pitch/2),cp=Math.cos(pitch/2),sy=Math.sin(cfg.yaw/2),cy=Math.cos(cfg.yaw/2);
    const transform={...camera.components.Transform,position:[target[0]+sin*Math.cos(pitch)*d,height(...target)-Math.sin(pitch)*d,target[1]+cos*Math.cos(pitch)*d],rotation:[cy*sp,sy*cp,-sy*sp,cy*cp]};
    const projection={...camera.components.Camera3D,projection:'perspective',fov_y_degrees:preset.fov/Math.sqrt(1+aspect*aspect),near:cfg.near,far:cfg.far};
    const state=JSON.stringify([transform,projection]);if(state===last)return;last=state;
    for(const [component,value] of [['Transform',transform],['Camera3D',projection]])engine.pushCommandJson(JSON.stringify({op:'setComponent',entity:camera.entity,component,value}));
  }
  return {tick};
})();
var originalCameraPreviousTick=onTick;
onTick=function(dt){originalCameraPreviousTick(dt);originalMapCamera.tick(dt);};
