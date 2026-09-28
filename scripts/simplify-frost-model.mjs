// Author: MiYu. Offline UV/normal-aware LODs using pinned meshoptimizer 0.24.0 (MIT).
import fs from 'node:fs';
import {MeshoptSimplifier} from '../tmp/frost-realistic-tools/node_modules/meshoptimizer/meshopt_simplifier.module.js';
await MeshoptSimplifier.ready;
const [source,target,count,error]=process.argv.slice(2),raw=fs.readFileSync(source),jsonSize=raw.readUInt32LE(12),doc=JSON.parse(raw.subarray(20,20+jsonSize)),blob=raw.subarray(28+jsonSize),primitive=doc.meshes[0].primitives[0];
const read=i=>{const a=doc.accessors[i],v=doc.bufferViews[a.bufferView],b=blob.subarray((v.byteOffset||0)+(a.byteOffset||0),(v.byteOffset||0)+(a.byteOffset||0)+v.byteLength);return a.componentType===5125?new Uint32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length)):new Float32Array(b.buffer.slice(b.byteOffset,b.byteOffset+b.length));};
const p=read(primitive.attributes.POSITION),n=read(primitive.attributes.NORMAL),uv=read(primitive.attributes.TEXCOORD_0),indices=read(primitive.indices),attrs=new Float32Array(p.length/3*5);
for(let i=0;i<p.length/3;i++)attrs.set([n[i*3],n[i*3+1],n[i*3+2],uv[i*2],uv[i*2+1]],i*5);
const [simplified,actualError]=MeshoptSimplifier.simplifyWithAttributes(indices,p,3,attrs,5,[.1,.1,.1,.5,.5],null,Math.min(indices.length,Number(count)*3),Number(error));
const remap=new Int32Array(p.length/3).fill(-1),used=[];for(let i=0;i<simplified.length;i++){const old=simplified[i];if(remap[old]===-1){remap[old]=used.length;used.push(old);}simplified[i]=remap[old];}
const arrays=[new Float32Array(used.flatMap(i=>[p[i*3],p[i*3+1],p[i*3+2]])),new Float32Array(used.flatMap(i=>[n[i*3],n[i*3+1],n[i*3+2]])),new Float32Array(used.flatMap(i=>[uv[i*2],uv[i*2+1]])),simplified],chunks=[];let offset=0;
arrays.forEach((a,i)=>{chunks.push(Buffer.from(a.buffer));doc.bufferViews[i]={buffer:0,byteOffset:offset,byteLength:a.byteLength};doc.accessors[i].count=a.length/[3,3,2,1][i];offset+=a.byteLength;});doc.buffers[0].byteLength=offset;
for(const key of ['min','max'])doc.accessors[0][key]=[0,1,2].map(axis=>used.reduce((v,i)=>key==='min'?Math.min(v,p[i*3+axis]):Math.max(v,p[i*3+axis]),key==='min'?Infinity:-Infinity));
let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67,0);header.writeUInt32LE(2,4);header.writeUInt32LE(28+json.length+offset,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const binHeader=Buffer.alloc(8);binHeader.writeUInt32LE(offset);binHeader.writeUInt32LE(0x004e4942,4);fs.writeFileSync(target,Buffer.concat([header,json,binHeader,...chunks]));console.log(JSON.stringify({sourceTriangles:indices.length/3,triangles:simplified.length/3,vertices:used.length,error:actualError}));
