// Author: MiYu. Verify weighted joints and native sampled deformation, including the attached crown.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const repo=fileURLToPath(new URL('../',import.meta.url)),sample=path.join(repo,'samples/frostbound-realms'),manifest=JSON.parse(fs.readFileSync(path.join(sample,'ancient-form-sources.json'))),catalog=JSON.parse(fs.readFileSync(path.join(sample,'model-catalog.json'))),exe=process.env.MENGINE_GLTF_BOUNDS||path.join(repo,'target/debug/examples/gltf_bounds.exe'),report={author:'MiYu',passed:false,models:[]};
const hash=f=>createHash('sha256').update(fs.readFileSync(path.join(sample,f))).digest('hex');
for(const entry of [...manifest.sources,...manifest.generated])assert.equal(hash(entry.file),entry.sha256,entry.file);
for(const [key,meta] of Object.entries(manifest.models)){
 const file=catalog[key].parts[0].mesh,buffer=fs.readFileSync(path.join(sample,file)),jsonLength=buffer.readUInt32LE(12),doc=JSON.parse(buffer.subarray(20,20+jsonLength).toString()),bin=buffer.subarray(28+jsonLength),primitive=doc.meshes[0].primitives[0],joints=doc.skins[0].joints.map(i=>doc.nodes[i].name),weights=Object.fromEntries(joints.map(j=>[j,0]));
 assert.equal(joints.length,15);assert.ok(!joints.includes('neutral_bone'));assert.deepEqual(doc.animations.map(a=>a.name),meta.clips.map(a=>a.name));
 const read=i=>{const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],width={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16}[a.type],bytes={5121:1,5123:2,5125:4,5126:4}[a.componentType],offset=(v.byteOffset||0)+(a.byteOffset||0),stride=v.byteStride||width*bytes;return Array.from({length:a.count},(_,n)=>Array.from({length:width},(_,c)=>{const at=offset+n*stride+c*bytes;return a.componentType===5126?bin.readFloatLE(at):a.componentType===5123?bin.readUInt16LE(at):a.componentType===5121?bin.readUInt8(at):bin.readUInt32LE(at);}));};
 const ids=read(primitive.attributes.JOINTS_0),influences=read(primitive.attributes.WEIGHTS_0);
 for(let i=0;i<ids.length;i++){assert.ok(Math.abs(influences[i].reduce((n,w)=>n+w,0)-1)<.001);for(let j=0;j<4;j++)if(influences[i][j]>.01)weights[joints[ids[i][j]]]++;}
 for(const [joint,count] of Object.entries(weights))assert.ok(count>5,key+' has real weights for '+joint);
 const pose=(clip,frame)=>JSON.parse(execFileSync(exe,[path.join(sample,file)+'#pose='+clip+':'+frame,'--positions'],{maxBuffer:24*1024*1024,encoding:'utf8'})),clips=[],base=pose(meta.clips.findIndex(a=>a.name==='Idle'),0);
 const displacement=(a,b,test=()=>true)=>{let moved=0,max=0;for(let i=0;i<a.positions.length;i++)if(test(a.positions[i])){const d=Math.hypot(...a.positions[i].map((v,j)=>v-b.positions[i][j]));if(d>.005)moved++;max=Math.max(max,d);}return {moved,max};};
 for(const [i,clip] of meta.clips.entries()){
  const start=pose(i,0),mid=pose(i,Math.floor(clip.frames/2)),last=pose(i,clip.frames-1);
  for(const p of [start,mid,last]){assert.ok(p.positions.every(v=>v.every(Number.isFinite)));assert.equal(p.vertices,base.vertices);assert.ok(p.max[1]<12&&p.min[1]>-3,'bounded native '+key+' '+clip.name);}
  const motion=displacement(start,mid),lower=displacement(start,mid,p=>p[1]<1.8),upper=displacement(start,mid,p=>p[1]>3.5);
  assert.ok(motion.moved>100,clip.name+' deforms real vertices');
  if(clip.name==='Walk')assert.ok(lower.moved>100&&lower.max>.03,'moving weighted legs');
  if(clip.name==='Attack')assert.ok(upper.moved>100&&upper.max>.1,'moving shoulders and crown');
  if(clip.name==='Death')assert.ok(last.max[1]<start.max[1]-.5,'crown falls with dying trunk');
  if(['Root','Uproot'].includes(clip.name)){assert.ok(mid.min[1]>start.min[1]+.3,'world vertical lift');assert.ok(Math.abs(mid.min[0]-start.min[0])<.05&&Math.abs(mid.min[2]-start.min[2])<.1,'no sideways morph translation');}
  clips.push({name:clip.name,start:{min:start.min,max:start.max},mid:{min:mid.min,max:mid.max},last:{min:last.min,max:last.max},motion,lower,upper});
 }
 report.models.push({key,file,sha256:hash(file),skinJoints:joints,weightedVertices:weights,clips});
}
report.passed=true;fs.writeFileSync(path.join(repo,'docs/designs/frostbound-realms/ancient-forms-validation.json'),JSON.stringify(report,null,2)+'\n');console.log('PASS: three Ancient tiers, 15 weighted joints each, all seven native clips, moving legs/shoulders/crown, vertical morph and falling death');
