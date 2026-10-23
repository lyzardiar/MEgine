// Author: MiYu. Preserve original WPM coordinates and mutable terrain flags for imported maps.
var FrostWarcraftPathing=(()=>{
  const masks=[255,2,4,8,16,32,64,128],MAX_CELLS=16777216;
  function typeMask(type){if(!Number.isInteger(type)||type< -2147483648||type>2147483647)throw Error('Invalid pathing type');return masks[type]??0;}
  function encode(cells){const runs=[];for(const value of cells){if(runs.length&&runs[runs.length-1]===value)runs[runs.length-2]++;else runs.push(1,value);}return runs;}
  function create(data){
    if(!data||data.schema!=='mengine.warcraft-pathing'||data.version!==1||data.cellWorldSize!==32||!Array.isArray(data.size)||data.size.length!==2||!Array.from(data.size).every(v=>Number.isSafeInteger(v)&&v>0)||data.size[0]*data.size[1]>MAX_CELLS)throw Error('Invalid original pathing dimensions');
    if(!Array.isArray(data.origin)||data.origin.length!==2||!Array.from(data.origin).every(Number.isFinite)||typeof data.sourceSha256!=='string'||!/^[a-f0-9]{64}$/.test(data.sourceSha256))throw Error('Invalid original pathing identity');
    if(!Array.isArray(data.runs)||data.runs.length%2)throw Error('Invalid original pathing runs');
    const size=[...data.size],origin=[...data.origin],sourceSha256=data.sourceSha256,cells=new Uint8Array(size[0]*size[1]);let cursor=0,revision=0;
    for(let i=0;i<data.runs.length;i+=2){const count=data.runs[i],value=data.runs[i+1];if(!Number.isSafeInteger(count)||count<=0||cursor+count>cells.length||!Number.isInteger(value)||value<0||value>255)throw Error('Invalid original pathing run');cells.fill(value,cursor,cursor+count);cursor+=count;}
    if(cursor!==cells.length)throw Error('Incomplete original pathing cells');
    const index=(x,y)=>Number.isInteger(x)&&Number.isInteger(y)&&x>=0&&y>=0&&x<size[0]&&y<size[1]?y*size[0]+x:-1;
    const sourceCell=(x,y)=>{if(!Number.isFinite(x)||!Number.isFinite(y))throw Error('Non-finite pathing coordinate');const cx=Math.floor((x-origin[0])/32),cy=Math.floor((y-origin[1])/32);return index(cx,cy)<0?null:[cx,cy];};
    const engineCell=(x,z)=>sourceCell(x*128,-z*128);
    const getCell=(x,y)=>{const i=index(x,y);return i<0?null:cells[i];};
    const getAt=cell=>cell?getCell(...cell):null;
    function setCell(x,y,type,pathable){
      if(typeof pathable!=='boolean')throw Error('Pathable must be boolean');const mask=typeMask(type),i=index(x,y);if(i<0)return false;
      const next=pathable?cells[i]&~mask:cells[i]|mask;if(cells[i]!==next){cells[i]=next;revision++;}return true;
    }
    return Object.freeze({size:Object.freeze(size),origin:Object.freeze(origin),sourceSha256,cellWorldSize:32,engineCellSize:.25,
      get revision(){return revision;},sourceCell,engineCell,getCell,getSource:(x,y)=>getAt(sourceCell(x,y)),getEngine:(x,z)=>getAt(engineCell(x,z)),
      cellCenter:(x,y)=>index(x,y)<0?null:[(origin[0]+(x+.5)*32)/128,-(origin[1]+(y+.5)*32)/128],
      baseBlocked:(x,z,type)=>{const mask=typeMask(type),value=getAt(engineCell(x,z));return value===null?null:(value&mask)!==0;},
      setCell,setEngine:(x,z,type,pathable)=>{const cell=engineCell(x,z);if(!cell){typeMask(type);if(typeof pathable!=='boolean')throw Error('Pathable must be boolean');return false;}return setCell(...cell,type,pathable);},
      snapshot:()=>({schema:'mengine.warcraft-pathing',version:1,sourceSha256,size:[...size],origin:[...origin],cellWorldSize:32,runs:encode(cells)})});
  }
  return {create,typeMask};
})();
if(typeof module!=='undefined')module.exports=FrostWarcraftPathing;
