/* Author: MiYu. Shared native HUD anchors, viewport scaling and hit coordinates. */
var FrostHUD=(()=>{
  function viewport(input,world=true){const [w,h]=input.viewport?.every(v=>v>1)?input.viewport:[1280,720],scale=world?Math.min(w/1280,h/720):w/1280;return {w,h,scale,width:w/scale,height:h/scale,match:world&&w/1280>h/720?1:0};}
  function pointer(input,world=true){const v=viewport(input,world);return {x:(input.pointer[0]-v.w/2)/v.scale,y:(input.pointer[1]-v.h/2)/v.scale};}
  function rect(r,input){const v=viewport(input),anchor=r.anchor_min.map((n,i)=>n+(r.anchor_max[i]-n)*r.pivot[i]);return {x:(anchor[0]-.5)*v.width+r.anchored_position[0],y:(anchor[1]-.5)*v.height+r.anchored_position[1],w:(r.anchor_max[0]-r.anchor_min[0])*v.width+r.size_delta[0],h:(r.anchor_max[1]-r.anchor_min[1])*v.height+r.size_delta[1]};}
  function local(r,p,input){const center=rect({...r,anchored_position:[0,0]},input);return [p.x-center.x,p.y-center.y];}
  function contains(r,p){return Math.abs(r.x-p.x)<r.w/2&&Math.abs(r.y-p.y)<r.h/2;}
  function mapPoint(r,x,z){return [r.anchored_position[0]+x/64*r.size_delta[0],r.anchored_position[1]+z/64*r.size_delta[1]];}
  function mapTarget(r,p){return {x:(p.x-r.x)/r.w*64,z:(p.y-r.y)/r.h*64};}
  return {viewport,pointer,rect,local,contains,mapPoint,mapTarget};
})();
if(typeof module!=='undefined')module.exports=FrostHUD;
