// Author: MiYu. Bound all classic MDX records and validate source references before sampling.
use super::*;
use std::collections::HashMap;

pub(super) struct Reader<'a> { bytes: &'a [u8], at: usize }
impl<'a> Reader<'a> {
    fn new(bytes: &'a [u8]) -> Self { Self {bytes,at:0} }
    fn remaining(&self) -> usize { self.bytes.len()-self.at }
    fn take(&mut self, length: usize) -> Result<&'a [u8],AssetError> { let end=self.at.checked_add(length).ok_or_else(||invalid("record range overflow"))?; let bytes=self.bytes.get(self.at..end).ok_or_else(||invalid("truncated record"))?; self.at=end; Ok(bytes) }
    fn tag(&mut self) -> Result<[u8;4],AssetError> { Ok(self.take(4)?.try_into().unwrap()) }
    fn expect(&mut self, tag: &[u8;4]) -> Result<(),AssetError> { if self.tag()?!=*tag {return Err(invalid(format!("expected {}",String::from_utf8_lossy(tag))));} Ok(()) }
    fn u32(&mut self) -> Result<u32,AssetError> { Ok(u32::from_le_bytes(self.take(4)?.try_into().unwrap())) }
    fn i32(&mut self) -> Result<i32,AssetError> { Ok(self.u32()? as i32) }
    fn f32(&mut self) -> Result<f32,AssetError> { let n=f32::from_bits(self.u32()?); if !n.is_finite() {return Err(invalid("non-finite value"));} Ok(n) }
    fn vector(&mut self, width: usize) -> Result<Vec4,AssetError> { let mut value=[0.;4]; for n in &mut value[..width] {*n=self.f32()?;} Ok(Vec4::from_array(value)) }
    fn string(&mut self, count: usize, budget: &mut Budget, path: bool) -> Result<String,AssetError> {
        let bytes=self.take(count)?; let bytes=&bytes[..bytes.iter().position(|n|*n==0).unwrap_or(bytes.len())];
        let value=if path {let path=std::str::from_utf8(bytes).map_err(|_|invalid("texture or attachment path is not UTF-8; legacy encoding requires an explicit session policy"))?; if !path.is_empty() {crate::asset_bytes::normalize_member(path)?;} path.to_owned()} else {String::from_utf8_lossy(bytes).into_owned()}; budget.charge(value.capacity())?; Ok(value)
    }
    fn record(&mut self, minimum: usize) -> Result<Reader<'a>,AssetError> { let length=self.u32()? as usize; if length<minimum || length<4 {return Err(invalid("invalid inclusive record size"));} Ok(Reader::new(self.take(length-4)?)) }
    fn counted(&mut self, stride: usize, limit: usize) -> Result<(&'a [u8],usize),AssetError> { let count=self.u32()? as usize; if count>limit {return Err(invalid("record count exceeds limit"));} let size=count.checked_mul(stride).ok_or_else(||invalid("array size overflow"))?; Ok((self.take(size)?,count)) }
    fn words(&mut self, limit: usize, budget: &mut Budget) -> Result<Vec<u32>,AssetError> { let (bytes,count)=self.counted(4,limit)?; let mut out=budget.array(count)?; out.extend(bytes.chunks_exact(4).map(|v|u32::from_le_bytes(v.try_into().unwrap()))); Ok(out) }
    fn vectors<const N:usize>(&mut self, limit: usize, budget: &mut Budget) -> Result<Vec<[f32;N]>,AssetError> {
        let (bytes,count)=self.counted(N*4,limit)?; let mut out=budget.array(count)?;
        for item in bytes.chunks_exact(N*4) {let mut r=Reader::new(item); let mut v=[0.;N]; for n in &mut v {*n=r.f32()?;} out.push(v);} Ok(out)
    }
    fn finish(&self) -> Result<(),AssetError> { if self.remaining()!=0 {return Err(invalid("unconsumed record bytes or unsupported record layout"));} Ok(()) }
}

struct Budget { remaining: usize, vertices: usize, indices: usize, keys: usize, limits: MdxReadLimits }
impl Budget {
    fn charge(&mut self, bytes: usize) -> Result<(),AssetError> { self.remaining=self.remaining.checked_sub(bytes).ok_or_else(||invalid("decoded model exceeds byte budget"))?; Ok(()) }
    fn array<T>(&mut self, count: usize) -> Result<Vec<T>,AssetError> { self.charge(count.checked_mul(std::mem::size_of::<T>()).ok_or_else(||invalid("array allocation overflow"))?)?; let mut out=Vec::new(); out.try_reserve_exact(count).map_err(|_|invalid("cannot reserve model array"))?; Ok(out) }
    fn push<T>(&mut self, output: &mut Vec<T>, value: T) -> Result<(),AssetError> {
        if output.len()==output.capacity() {let extra=output.capacity().max(1); self.charge(extra.checked_mul(std::mem::size_of::<T>()).ok_or_else(||invalid("record allocation overflow"))?)?; output.try_reserve_exact(extra).map_err(|_|invalid("cannot reserve model records"))?;} output.push(value); Ok(())
    }
    fn diagnostic(&mut self, output: &mut Vec<String>, value: String) -> Result<(),AssetError> {self.charge(value.capacity())?; self.push(output,value)}
}

fn track(r: &mut Reader<'_>, width: usize, integer: bool, budget: &mut Budget) -> Result<Track,AssetError> {
    let count=r.u32()? as usize; let interpolation=r.u32()?; let global=r.i32()?;
    if interpolation>3 || global < -1 || integer && interpolation!=0 || count>budget.limits.max_keys.saturating_sub(budget.keys) {return Err(invalid("invalid track mode or key limit"));}
    let stride=4+width*4*if interpolation>1 {3} else {1}; let size=count.checked_mul(stride).ok_or_else(||invalid("track size overflow"))?;
    let mut source=Reader::new(r.take(size)?); let mut keys=budget.array(count)?; budget.keys+=count;
    for _ in 0..count {
        let time=source.i32()? as i64; let value=if integer {Vec4::new(source.u32()? as f32,0.,0.,0.)} else {source.vector(width)?};
        let (incoming,outgoing)=if interpolation>1 {(source.vector(width)?,source.vector(width)?)} else {(Vec4::ZERO,Vec4::ZERO)};
        if keys.last().is_some_and(|k:&Key|k.time>time) {return Err(invalid("track keys are not sorted"));} keys.push(Key {time,value,incoming,outgoing});
    }
    Ok(Track {interpolation,global,keys,collapse_outside:false})
}

fn set_track(slot: &mut Option<Track>, r: &mut Reader<'_>, width: usize, integer: bool, budget: &mut Budget) -> Result<(),AssetError> { if slot.is_some() {return Err(invalid("duplicate animation track"));} *slot=Some(track(r,width,integer,budget)?); Ok(()) }

fn materials(r: &mut Reader<'_>, output: &mut Vec<Material>, budget: &mut Budget) -> Result<(),AssetError> {
    while r.remaining()!=0 {
        if output.len()>=4096 {return Err(invalid("material count exceeds limit"));} let mut body=r.record(20)?; let priority=body.i32()?; let flags=body.u32()?; body.expect(b"LAYS")?; let count=body.u32()? as usize;
        if count>body.remaining()/28 || count>4096 {return Err(invalid("invalid material layer count"));} let mut layers=budget.array(count)?;
        for _ in 0..count {
            let mut layer=body.record(28)?; let filter=layer.u32()?; let flags=layer.u32()?; let texture=layer.u32()?; let texture_animation=layer.i32()?; let coord=layer.u32()? as usize; let alpha=layer.f32()?;
            if filter>6 || texture_animation < -1 {return Err(invalid("unsupported material filter or texture animation"));}
            let mut value=Layer {filter,flags,texture,texture_animation,coord,alpha,alpha_track:None,texture_track:None};
            while layer.remaining()!=0 {match &layer.tag()? {b"KMTA"=>set_track(&mut value.alpha_track,&mut layer,1,false,budget)?,b"KMTF"=>set_track(&mut value.texture_track,&mut layer,1,true,budget)?,_=>return Err(invalid("unsupported classic material track"))}}
            layers.push(value);
        }
        body.finish()?; budget.push(output,Material {priority,flags,layers})?;
    } Ok(())
}

fn geosets(r: &mut Reader<'_>, output: &mut Vec<Geoset>, budget: &mut Budget) -> Result<(),AssetError> {
    while r.remaining()!=0 {
        if output.len()>=4096 {return Err(invalid("geoset count exceeds limit"));} let mut body=r.record(4)?;
        body.expect(b"VRTX")?; let positions=body.vectors::<3>(budget.limits.max_vertices.saturating_sub(budget.vertices),budget)?; budget.vertices+=positions.len();
        body.expect(b"NRMS")?; let normals=body.vectors::<3>(positions.len(),budget)?;
        body.expect(b"PTYP")?; let types=body.words(4096,budget)?; if types.iter().any(|n|*n!=4) {return Err(invalid("only triangle primitive groups are supported"));}
        body.expect(b"PCNT")?; let primitive_counts=body.words(4096,budget)?;
        body.expect(b"PVTX")?; let (raw,count)=body.counted(2,budget.limits.max_indices.saturating_sub(budget.indices))?; let mut indices=budget.array(count)?; indices.extend(raw.chunks_exact(2).map(|n|u16::from_le_bytes(n.try_into().unwrap()) as u32)); budget.indices+=count;
        if count%3!=0 || indices.iter().any(|i|*i as usize>=positions.len()) || types.len()!=primitive_counts.len() || primitive_counts.iter().map(|n|*n as u64).sum::<u64>()!=count as u64 || primitive_counts.iter().any(|n|n%3!=0) {return Err(invalid("invalid primitive counts or triangle indices"));}
        body.expect(b"GNDX")?; let (raw,count)=body.counted(1,positions.len())?; let mut vertex_groups=budget.array(count)?; vertex_groups.extend_from_slice(raw);
        body.expect(b"MTGC")?; let group_sizes=body.words(256,budget)?;
        body.expect(b"MATS")?; let matrix_ids=body.words(budget.limits.max_nodes.saturating_mul(256),budget)?;
        let material=body.u32()? as usize; body.take(8)?; body.take(28)?; let (_,_) = body.counted(28,65536)?;
        body.expect(b"UVAS")?; let layer_count=body.u32()? as usize; if layer_count>8 {return Err(invalid("UV set count exceeds limit"));} let mut uvs=budget.array(layer_count)?;
        for _ in 0..layer_count {body.expect(b"UVBS")?; let layer=body.vectors::<2>(positions.len(),budget)?; if layer.len()!=positions.len() {return Err(invalid("UV count differs from vertices"));} uvs.push(layer);}
        body.finish()?;
        if !normals.is_empty() && normals.len()!=positions.len() || !group_sizes.is_empty() && vertex_groups.len()!=positions.len() || group_sizes.iter().map(|n|*n as u64).sum::<u64>()!=matrix_ids.len() as u64 {return Err(invalid("incomplete normals or matrix groups"));}
        let mut groups=budget.array(group_sizes.len())?; let mut at=0;
        for size in group_sizes {let size=size as usize; if size==0 {return Err(invalid("empty matrix influence group"));} let mut group=budget.array(size)?; group.extend(matrix_ids[at..at+size].iter().map(|i|*i as usize)); at+=size; groups.push(group);}
        if !groups.is_empty() && vertex_groups.iter().any(|i|*i as usize>=groups.len()) {return Err(invalid("vertex matrix group is missing"));}
        budget.push(output,Geoset {positions,normals,uvs,indices,vertex_groups,groups,material,animation:None})?;
    } Ok(())
}

fn nodes(r: &mut Reader<'_>, kind: &[u8;4], output: &mut Vec<Node>, diagnostics: &mut Vec<String>, budget: &mut Budget) -> Result<(),AssetError> {
    while r.remaining()!=0 {
        if output.len()>=budget.limits.max_nodes {return Err(invalid("node count exceeds limit"));}
        let outer=!matches!(kind,b"BONE"|b"HELP"|b"EVTS"|b"CLID"); let mut owned=if outer {Some(r.record(100)?)} else {None}; let source=owned.as_mut().unwrap_or(&mut *r);
        let mut body=source.record(96)?; let name=body.string(80,budget,false)?; let id=body.i32()?; let parent_id=body.i32()?; let flags=body.u32()?;
        if id<0 || parent_id < -1 {return Err(invalid("invalid node object id"));}
        let mut node=Node {name,kind:*kind,id,parent_id,flags,pivot:Vec3::ZERO,translation:None,rotation:None,scale:None,attachment:None};
        while body.remaining()!=0 {match &body.tag()? {b"KGTR"=>set_track(&mut node.translation,&mut body,3,false,budget)?,b"KGRT"=>set_track(&mut node.rotation,&mut body,4,false,budget)?,b"KGSC"=>set_track(&mut node.scale,&mut body,3,false,budget)?,_=>return Err(invalid("unsupported node transform track"))}}
        match kind {
            b"BONE"=>{source.take(8)?;},
            b"HELP"=>{},
            b"ATCH"=>{let path=source.string(260,budget,true)?; let attachment_id=source.u32()?; let mut visibility=None; while source.remaining()!=0 {source.expect(b"KATV")?; set_track(&mut visibility,source,1,false,budget)?;} node.attachment=Some((attachment_id,path,visibility));},
            b"EVTS"=>{source.expect(b"KEVT")?; let count=source.u32()? as usize; source.i32()?; source.take(count.checked_mul(4).ok_or_else(||invalid("event size overflow"))?)?;},
            b"CLID"=>{let shape=source.u32()?; if shape>3 {return Err(invalid("unsupported collision shape"));} source.take(if shape==2 {12} else {24})?; if matches!(shape,2|3) {source.f32()?;}},
            _=>{budget.diagnostic(diagnostics,format!("{} node payload is not consumed as effect behavior",String::from_utf8_lossy(kind)))?; source.take(source.remaining())?;},
        }
        if let Some(body)=owned {body.finish()?;} budget.push(output,node)?;
    } Ok(())
}

pub(super) fn parse(bytes: &[u8], limits: MdxReadLimits) -> Result<MdxModel,AssetError> {
    if bytes.len()>limits.max_input_bytes {return Err(invalid("source exceeds input byte limit"));} let mut r=Reader::new(bytes); r.expect(b"MDLX")?;
    let mut budget=Budget {remaining:limits.max_decoded_bytes,vertices:0,indices:0,keys:0,limits};
    let mut model=MdxModel {name:String::new(),version:0,sequences:Vec::new(),globals:Vec::new(),textures:Vec::new(),materials:Vec::new(),geosets:Vec::new(),geoset_animations:Vec::new(),nodes:Vec::new(),order:Vec::new(),parents:Vec::new(),draw_order:Vec::new(),texture_animations:Vec::new(),diagnostics:Vec::new(),max_pose_bytes:limits.max_decoded_bytes,decoded_bytes:0};
    let mut pivots=Vec::new(); let mut seen=Vec::new();
    while r.remaining()!=0 {
        let tag=r.tag()?; let length=r.u32()? as usize; let mut body=Reader::new(r.take(length)?);
        if seen.len()>=64 || seen.contains(&tag) {return Err(invalid("duplicate top-level chunk or chunk count exceeds64"));} budget.push(&mut seen,tag)?;
        match &tag {
            b"VERS"=>{model.version=body.u32()?;},
            b"MODL"=>{model.name=body.string(80,&mut budget,false)?; body.take(260+28+4)?;},
            b"SEQS"=>{while body.remaining()!=0 {if model.sequences.len()>=4096 {return Err(invalid("sequence count exceeds limit"));} let name=body.string(80,&mut budget,false)?; let start_ms=body.i32()? as i64; let end_ms=body.i32()? as i64; body.f32()?; let flags=body.u32()?; let rarity=body.f32()?; body.take(32)?; if end_ms<start_ms {return Err(invalid("negative sequence duration"));} budget.push(&mut model.sequences,MdxSequence {name,start_ms,end_ms,non_looping:flags&1!=0,rarity})?;}},
            b"GLBS"=>{if body.remaining()%4!=0 {return Err(invalid("truncated global sequence table"));} while body.remaining()!=0 {budget.push(&mut model.globals,body.u32()?)?;}},
            b"TEXS"=>{while body.remaining()!=0 {let replaceable_id=body.u32()?; let path=body.string(260,&mut budget,true)?; let flags=body.u32()?; budget.push(&mut model.textures,MdxTexture {path,replaceable_id,flags})?;}},
            b"MTLS"=>materials(&mut body,&mut model.materials,&mut budget)?,
            b"GEOS"=>geosets(&mut body,&mut model.geosets,&mut budget)?,
            b"GEOA"=>{while body.remaining()!=0 {let mut item=body.record(28)?; let alpha=item.f32()?; let flags=item.u32()?; let bgr=item.vector(3)?.truncate(); let geoset=item.u32()? as usize; let mut value=GeosetAnimation {geoset,alpha,color:if flags&2!=0 {Vec3::new(bgr.z,bgr.y,bgr.x)} else {Vec3::ONE},alpha_track:None,color_track:None}; while item.remaining()!=0 {match &item.tag()? {b"KGAO"=>set_track(&mut value.alpha_track,&mut item,1,false,&mut budget)?,b"KGAC"=>set_track(&mut value.color_track,&mut item,3,false,&mut budget)?,_=>return Err(invalid("unsupported geoset animation track"))}} budget.push(&mut model.geoset_animations,value)?;}},
            b"TXAN"=>{while body.remaining()!=0 {let mut item=body.record(4)?; let mut value=TextureAnimation {translation:None,rotation:None,scale:None}; while item.remaining()!=0 {match &item.tag()? {b"KTAT"=>set_track(&mut value.translation,&mut item,3,false,&mut budget)?,b"KTAR"=>set_track(&mut value.rotation,&mut item,4,false,&mut budget)?,b"KTAS"=>set_track(&mut value.scale,&mut item,3,false,&mut budget)?,_=>return Err(invalid("unsupported texture animation track"))}} budget.push(&mut model.texture_animations,value)?;}},
            b"BONE"|b"HELP"|b"ATCH"|b"EVTS"|b"CLID"|b"PRE2"|b"PREM"|b"RIBB"|b"LITE"=>nodes(&mut body,&tag,&mut model.nodes,&mut model.diagnostics,&mut budget)?,
            b"PIVT"=>{if body.remaining()%12!=0 {return Err(invalid("truncated pivot table"));} while body.remaining()!=0 {let v=body.take(12)?; budget.push(&mut pivots,Vec3::new(f32::from_le_bytes(v[..4].try_into().unwrap()),f32::from_le_bytes(v[4..8].try_into().unwrap()),f32::from_le_bytes(v[8..].try_into().unwrap())))?;}},
            _=>{budget.diagnostic(&mut model.diagnostics,format!("{} ({length} bytes) is not consumed",String::from_utf8_lossy(&tag)))?; body.take(body.remaining())?;},
        }
        body.finish()?;
    }
    if model.version!=800 {return Err(invalid(format!("unsupported model version {}; this reader requires classic version800",model.version)));}
    validate(&mut model,&pivots,&mut budget)?; model.decoded_bytes=limits.max_decoded_bytes-budget.remaining; Ok(model)
}

fn validate(model: &mut MdxModel, pivots: &[Vec3], budget: &mut Budget) -> Result<(),AssetError> {
    let mut ids=HashMap::new(); budget.charge(model.nodes.len().checked_mul(64).ok_or_else(||invalid("node map size overflow"))?)?; ids.try_reserve(model.nodes.len()).map_err(|_|invalid("cannot reserve node map"))?;
    for (index,node) in model.nodes.iter().enumerate() {if ids.insert(node.id,index).is_some() {return Err(invalid("duplicate node object id"));}}
    model.parents=budget.array(model.nodes.len())?;
    for node in &mut model.nodes {
        model.parents.push(if node.parent_id<0 {None} else {Some(*ids.get(&node.parent_id).ok_or_else(||invalid("node parent object is missing"))?)});
        node.pivot=*pivots.get(node.id as usize).unwrap_or(&Vec3::ZERO);
        if !node.pivot.is_finite() {if node.translation.is_none() && node.rotation.is_none() && node.scale.is_none() && matches!(&node.kind,b"BONE"|b"HELP") {node.pivot=Vec3::ZERO; budget.diagnostic(&mut model.diagnostics,format!("static node {} has an identity pivot repair",node.id))?;} else {return Err(invalid("non-finite animated node pivot"));}}
        if let Some(t)=&mut node.scale {t.collapse_outside=t.global<0 && t.keys.len()>1 && t.keys[0].value.truncate().length_squared()<1e-4 && t.keys.last().unwrap().value.truncate().length_squared()<1e-4 && model.sequences.iter().any(|s|t.keys[0].time>=s.start_ms && t.keys.last().unwrap().time<=s.end_ms);}
        for track in [&node.translation,&node.rotation,&node.scale].into_iter().flatten().chain(node.attachment.iter().filter_map(|(_,_,t)|t.as_ref())) {validate_track(track,model.globals.len())?;}
    }
    let mut marks=budget.array(model.nodes.len())?; marks.resize(model.nodes.len(),0u8); let mut path=budget.array(model.nodes.len())?; model.order=budget.array(model.nodes.len())?;
    for index in 0..model.nodes.len() {let mut current=Some(index); while let Some(i)=current {if marks[i]==2 {break;} if marks[i]==1 {return Err(invalid("cyclic node hierarchy"));} marks[i]=1; path.push(i); current=model.parents[i];} while let Some(i)=path.pop() {marks[i]=2; model.order.push(i);}}
    for geoset in &mut model.geosets {
        let material=model.materials.get(geoset.material).ok_or_else(||invalid("geoset material is missing"))?;
        for layer in &material.layers {if layer.coord>=geoset.uvs.len().max(1) {return Err(invalid("material UV set is missing"));}}
        for group in &mut geoset.groups {for id in group {*id=*ids.get(&(*id as i32)).ok_or_else(||invalid("matrix group node is missing"))?;}}
    }
    for material in &model.materials {for layer in &material.layers {
        if layer.texture_animation>=0 && layer.texture_animation as usize>=model.texture_animations.len() || layer.texture as usize>=model.textures.len() {return Err(invalid("material texture or texture animation is missing"));}
        for track in [&layer.alpha_track,&layer.texture_track].into_iter().flatten() {validate_track(track,model.globals.len())?;}
        if layer.texture_track.as_ref().is_some_and(|t|t.keys.iter().any(|k|k.value.x as usize>=model.textures.len())) {return Err(invalid("animated texture index is missing"));}
    }}
    for (index,animation) in model.geoset_animations.iter().enumerate() {let geoset=model.geosets.get_mut(animation.geoset).ok_or_else(||invalid("geoset animation target is missing"))?; if geoset.animation.replace(index).is_some() {return Err(invalid("duplicate geoset animation target"));} for track in [&animation.alpha_track,&animation.color_track].into_iter().flatten() {validate_track(track,model.globals.len())?;}}
    for animation in &model.texture_animations {for track in [&animation.translation,&animation.rotation,&animation.scale].into_iter().flatten() {validate_track(track,model.globals.len())?;}}
    let count=model.geosets.iter().try_fold(0usize,|count,g|count.checked_add(model.materials[g.material].layers.len()).ok_or_else(||invalid("draw-order count overflow")))?;
    model.draw_order=budget.array(count)?; for (g,geoset) in model.geosets.iter().enumerate() {for l in 0..model.materials[geoset.material].layers.len() {model.draw_order.push((g,l));}}
    let geosets=&model.geosets; let materials=&model.materials;
    model.draw_order.sort_unstable_by(|a,b|{let (xm,ym)=(&materials[geosets[a.0].material],&materials[geosets[b.0].material]); let (x,y)=(&xm.layers[a.1],&ym.layers[b.1]); (x.filter>=2).cmp(&(y.filter>=2)).then_with(||if x.filter<2 {a.cmp(b)} else {xm.priority.cmp(&ym.priority).then(x.filter.cmp(&y.filter)).then(a.cmp(b))})});
    Ok(())
}

fn validate_track(track: &Track, globals: usize) -> Result<(),AssetError> { if track.global>=0 && track.global as usize>=globals {return Err(invalid("animation global sequence is missing"));} Ok(()) }
