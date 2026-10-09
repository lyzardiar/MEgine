/* Author: MiYu. Sample original MDX camera translation, target and roll in their animation windows. */
var FrostPortraitCamera=(()=>{
  function sample(track,sequence,time,globals=[],wall=time){
    if(!track)return [0,0,0];let keys=track.keys;
    if(track.globalSequence>=0){const period=globals[track.globalSequence];time=period?((wall%period)+period)%period:0;}else keys=keys.filter(k=>k.time>=sequence.start&&k.time<=sequence.end);
    if(!keys.length)return Array(track.dimensions).fill(0);if(time<=keys[0].time)return keys[0].value.slice();if(time>=keys.at(-1).time)return keys.at(-1).value.slice();
    const i=keys.findIndex((k,i)=>i<keys.length-1&&k.time<=time&&time<keys[i+1].time),a=keys[i],b=keys[i+1],t=(time-a.time)/(b.time-a.time),u=1-t,mode=track.interpolation;
    if(mode===0)return a.value.slice();if(mode===1)return a.value.map((v,i)=>v*u+b.value[i]*t);
    const w=mode===2?[2*t**3-3*t**2+1,t**3-2*t**2+t,t**3-t**2,-2*t**3+3*t**2]:[u**3,3*u**2*t,3*u*t**2,t**3];
    return a.value.map((v,i)=>w[0]*v+w[1]*a.outTangent[i]+w[2]*b.inTangent[i]+w[3]*b.value[i]);
  }
  function view(data,clip=data.initialSequence||0,seconds=0,wallSeconds=seconds){
    const c=data.sourceCamera,seq=data.sequences[clip];if(!seq)throw Error('Invalid portrait camera sequence');const duration=seq.end-seq.start,elapsed=seconds*1000,local=seq.loop?((elapsed%duration)+duration)%duration:Math.max(0,Math.min(duration,elapsed)),time=seq.start+local;
    const offset=tag=>sample(c.tracks[tag],seq,time,data.globalSequences,wallSeconds*1000),point=(p,tag)=>{const v=offset(tag);return [(p[0]+v[0])/128,(p[2]+v[2])/128,-(p[1]+v[1])/128];},position=point(c.position,'KCTR'),target=point(c.target,'KTTR'),[dx,dy,dz]=target.map((v,i)=>v-position[i]);
    if(!(dx*dx+dy*dy+dz*dz>0))throw Error('Degenerate portrait camera');const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(dy,Math.hypot(dx,dz)),sy=Math.sin(yaw/2),cy=Math.cos(yaw/2),sp=Math.sin(pitch/2),cp=Math.cos(pitch/2),q=[sp*cy,cp*sy,-sp*sy,cp*cy],roll=offset('KCRL')[0],sr=Math.sin(roll/2),cr=Math.cos(roll/2);
    return {modelRotation:[0,0,0,1],camera:{position,rotation:[q[0]*cr+q[1]*sr,q[1]*cr-q[0]*sr,q[2]*cr+q[3]*sr,q[3]*cr-q[2]*sr],scale:[1,1,1]},camera3D:{projection:'perspective',fov_y_degrees:c.fovRadians*180/Math.PI,near:c.near/128,far:c.far/128}};
  }
  return {sample,view};
})();
if(typeof module!=='undefined')module.exports=FrostPortraitCamera;
