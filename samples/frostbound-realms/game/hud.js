/* Author: MiYu. Shared native HUD anchors, viewport scaling and hit coordinates. */
var FrostHUD=(()=>{
  const editorLayout={
    'HUD Frame Minimap':[0,106,-100,200,200], 'HUD Frame Portrait':[0,296,-100,162,200], 'HUD Frame Info':[0,456,-100,156,200],
    Minimap:[0,106,-93,176,164], Portrait:[0,296,-110,122,96],
    'Selection title':[0,456,-163,142,24], 'Selection stats':[0,456,-112,142,66], 'Selection queue':[0,456,-38,142,36]
  };
  function editorRect(name,r){const p=editorLayout[name];if(p)return {...r,anchor_min:[p[0],1],anchor_max:[p[0],1],anchored_position:[p[1],p[2]],size_delta:[p[3],p[4]]};if(name==='HUD Frame Commands')return {...r,anchor_min:[0,1],anchor_max:[1,1],anchored_position:[269,-100],size_delta:[-542,200]};if(name==='Resources')return {...r,anchor_min:[1,0],anchor_max:[1,0],anchored_position:[-190,20],size_delta:[340,26]};return r;}
  function viewport(input,world=true){const [w,h]=input.viewport?.every(v=>v>1)?input.viewport:[1280,720],scale=world?Math.min(w/960,h/720):w/1280;return {w,h,scale,width:w/scale,height:h/scale,match:world&&w/960>h/720?1:0};}
  function pointer(input,world=true){const v=viewport(input,world);return {x:(input.pointer[0]-v.w/2)/v.scale,y:(input.pointer[1]-v.h/2)/v.scale};}
  function rect(r,input){const v=viewport(input),anchor=r.anchor_min.map((n,i)=>n+(r.anchor_max[i]-n)*r.pivot[i]);return {x:(anchor[0]-.5)*v.width+r.anchored_position[0],y:(anchor[1]-.5)*v.height+r.anchored_position[1],w:(r.anchor_max[0]-r.anchor_min[0])*v.width+r.size_delta[0],h:(r.anchor_max[1]-r.anchor_min[1])*v.height+r.size_delta[1]};}
  function local(r,p,input){const center=rect({...r,anchored_position:[0,0]},input);return [p.x-center.x,p.y-center.y];}
  function contains(r,p){return Math.abs(r.x-p.x)<r.w/2&&Math.abs(r.y-p.y)<r.h/2;}
  function mapPoint(r,x,z){return [r.anchored_position[0]+x/64*r.size_delta[0],r.anchored_position[1]+z/64*r.size_delta[1]];}
  function mapTarget(r,p){return {x:(p.x-r.x)/r.w*64,z:(p.y-r.y)/r.h*64};}
  return {viewport,pointer,rect,local,contains,mapPoint,mapTarget,editorRect,editorNames:[...Object.keys(editorLayout),'HUD Frame Commands','Resources']};
})();
if(typeof module!=='undefined')module.exports=FrostHUD;
