"""Author: MiYu. Build native terrain chunks from a preserved Warcraft map export."""
import argparse
from collections import defaultdict
import hashlib
import importlib
import io
import json
import math
import os
from pathlib import Path
import shutil
import tempfile
import numpy as np
from PIL import Image
from warcraft_mpq import mpyq, read_archive
from warcraft_terrain import ground_layers, ground_normals, placed_template, terrain_layout

ROOT = Path(__file__).resolve().parents[1]
SAMPLE = ROOT / 'samples/frostbound-realms'
converter = importlib.import_module('convert-warcraft-assets')
rows = importlib.import_module('import-frost-wisp-rules').rows
BLIGHTS = dict(A='Ashen', B='Barrens', C='Felwood', D='Cave', F='Lordf', G='Dungeon', I='Ice', J='DRuins', K='Citadel', L='Lords', N='North', O='Outland', Q='VillageFall', V='Village', W='Lordw', X='Village', Y='Village', Z='Ruins')
sha = lambda data: hashlib.sha256(data).hexdigest()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')


def padded(image, border=2):
    size = image.width
    result = Image.new('RGBA', (size+2*border, size+2*border))
    result.paste(image, (border, border))
    for x in range(size+2*border):
        for y in list(range(border)) + list(range(size+border, size+2*border)):
            result.putpixel((x, y), image.getpixel((min(max(x-border, 0), size-1), min(max(y-border, 0), size-1))))
    for y in range(border, size+border):
        for x in list(range(border)) + list(range(size+border, size+2*border)):
            result.putpixel((x, y), image.getpixel((min(max(x-border, 0), size-1), y-border)))
    return result


def build(export, game, output, chunk_size=32):
    if chunk_size not in (8, 16, 32):
        raise ValueError('Chunk size must be 8, 16 or 32 tiles')
    output = Path(output).resolve()
    if output.exists():
        raise FileExistsError(f'Preserve existing terrain project: {output}')
    exported = Path(export).resolve()
    data = json.loads((exported / 'map.json').read_bytes())
    if data.get('schema') != 'mengine.warcraft-map' or data.get('schemaVersion') != 1:
        raise ValueError('Unsupported map export schema')
    # Geometry is always rebuilt from authenticated binary members, not mutable JSON arrays.
    from warcraft_map import load_map
    original = (exported / data['source']['preservedArchive']).resolve()
    original.relative_to(exported)
    if sha(original.read_bytes()) != data['source']['sha256']:
        raise ValueError('Preserved source map digest changed')
    map_data, members = load_map(original)
    terrain = map_data['terrain']
    archive_raw = original.read_bytes()
    archives = [('map', mpyq.MPQArchive(io.BytesIO(archive_raw[map_data['source']['mpqOffset']:]), listfile=False))]
    archives += [(name, mpyq.MPQArchive(str(game / name), listfile=False)) for name in ['War3Patch.mpq', 'War3xLocal.mpq', 'War3x.mpq', 'war3.mpq']]
    sources, raw_sources = {}, {}

    def read(relative):
        relative = converter.relative(relative).as_posix()
        if relative in raw_sources:
            return raw_sources[relative]
        for name, archive in archives:
            try:
                raw = read_archive(archive, relative.replace('/', '\\'))
                sources[relative] = dict(path=relative, archive=name, bytes=len(raw), sha256=sha(raw))
                raw_sources[relative] = raw
                return raw
            except FileNotFoundError:
                pass
        raise FileNotFoundError(relative)

    ground_rows = rows(read('TerrainArt/Terrain.slk'))
    cliff_table = rows(read('TerrainArt/CliffTypes.slk'))
    cliff_rows = [cliff_table[key] for key in terrain['cliffTilesets']]
    water_row = rows(read('TerrainArt/Water.slk'))[terrain['tileset']+'Sha']
    cliff_receipt = json.loads((SAMPLE / 'classic-cliff-sources.json').read_bytes())
    for relative in ['Assets/WarcraftIII/classic-cliff-catalog.json', 'Assets/WarcraftIII/Models/Terrain/ClassicCliffs.mpatch']:
        expected = next(record['sha256'] for record in cliff_receipt['files'] if record['path'] == relative)
        if sha((SAMPLE / relative).read_bytes()) != expected:
            raise ValueError('Modified source cliff template: '+relative)
    catalog = json.loads((SAMPLE / 'Assets/WarcraftIII/classic-cliff-catalog.json').read_bytes())
    patches_path = SAMPLE / catalog['mesh']
    patches = json.loads(patches_path.read_bytes())['templates']
    layout = terrain_layout(terrain, catalog, cliff_rows)
    textures = []
    for code in terrain['groundTilesets']:
        row = ground_rows[code]
        textures.append(converter.decode_texture(read(row['dir']+'/'+row['file']+'.blp')))
    textures.append(converter.decode_texture(read('TerrainArt/Blight/'+BLIGHTS[terrain['tileset']]+'_Blight.blp')))
    if any(image.size not in [(256, 256), (512, 256)] for image in textures):
        raise ValueError('Unsupported terrain texture dimensions')
    extended = [image.width == 512 for image in textures]
    tile_lookup, tiles = {}, []
    for cell in layout['ground']:
        key = tuple(ground_layers(cell['textures'], cell['variation'], extended))
        if key not in tile_lookup:
            tile_lookup[key] = len(tiles)
            composite = None
            for texture, variation in key:
                tx, ty = (variation % 4, variation // 4) if variation < 16 else (4+(variation-16)%4, (variation-16)//4)
                image = textures[texture].crop((tx*64, ty*64, tx*64+64, ty*64+64))
                if composite is None:
                    composite = image.copy()
                    composite.putalpha(255)
                else:
                    composite = Image.alpha_composite(composite, image)
            tiles.append(composite)
        cell['atlasTile'] = tile_lookup[key]
    atlas_columns = max(1, math.ceil(math.sqrt(len(tiles))))
    if atlas_columns*64 > 8192:
        raise ValueError('Terrain atlas exceeds native texture limit; multiple atlas pages required')
    # Power-of-two tile boundaries remain separate through mip 6; the shader clamps each sampled level.
    atlas = Image.new('RGBA', (atlas_columns*64, math.ceil(len(tiles)/atlas_columns)*64))
    for index, tile in enumerate(tiles):
        atlas.paste(tile, (index % atlas_columns*64, index // atlas_columns*64))

    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix='.original-terrain-', dir=output.parent))
    try:
        def save_image(relative, image):
            target = temporary / relative
            target.parent.mkdir(parents=True, exist_ok=True)
            image.save(target)
        ground_material = 'Assets/Materials/Ground.mmat'
        save_image('Assets/Textures/Ground.png', atlas)
        (temporary/'Assets/Shaders').mkdir()
        (temporary/'Assets/Shaders/Ground.mshader').write_text(ground_shader(atlas.size),encoding='utf-8')
        write_json(temporary / ground_material, dict(version=8, name='Original map ground', shader='custom', custom_shader='Assets/Shaders/Ground.mshader', surface='opaque', base_color=[1,1,1,1], roughness=1, wrap_u='clamp', wrap_v='clamp'))
        for index, row in enumerate(cliff_rows):
            image = converter.decode_texture(read(row['texDir']+'/'+row['texFile']+'.blp'))
            relative = f'Assets/Textures/Cliff{index}.png'
            save_image(relative, image)
            write_json(temporary / f'Assets/Materials/Cliff{index}.mmat', dict(version=8, name='Original cliff '+row['cliffID'], shader='pbr', surface='opaque', base_color=[1,1,1,1], base_color_texture=relative, roughness=1, wrap_u='clamp', wrap_v='clamp'))
        batches = defaultdict(lambda: dict(positions=[], normals=[], uvs=[], indices=[]))

        def append(kind, cell, material, points, normals, uvs, indices):
            key = (cell[0]//chunk_size, cell[1]//chunk_size, kind, material)
            batch = batches[key]
            start = len(batch['positions'])
            batch['positions'].extend(points)
            batch['normals'].extend(normals)
            batch['uvs'].extend(uvs)
            batch['indices'].extend(start+i for i in indices)

        width, height = terrain['vertexSize']
        ox, oy = terrain['origin']
        heights = layout['surfaceHeights']
        normals = ground_normals(terrain, layout)
        for cell in layout['ground']:
            ids = cell['corners']
            points = [[ox/128+i%width, heights[i], -oy/128-i//width] for i in ids]
            tile = cell['atlasTile']
            tx, ty = tile%atlas_columns*64+.5, tile//atlas_columns*64+.5
            uvs = [[(tx+u*63)/atlas.width, (ty+v*63)/atlas.height] for u,v in [(0,1),(0,0),(1,0),(1,1)]]
            append('Ground', cell['cell'], ground_material, points, [normals[i] for i in ids], uvs, [0,3,1,1,3,2])
        for placement in layout['cliffs']:
            template = patches[placement['template']]
            model = catalog['models'][placement['template']]
            if sha(read(model['model'])) != model['sourceSha256']:
                raise ValueError('Cliff template is stale or map overrides source model: '+model['id'])
            append('Cliff', placement['cell'], f'Assets/Materials/Cliff{placement["texture"]}.mmat', placed_template(terrain, layout, placement, template), template['normals'], template['uvs'], template['indices'])
        water_frames = [converter.decode_texture(read(water_row['texFile']+f'{i:02}.blp')) for i in range(int(water_row['numTex']))]
        size = water_frames[0].width
        if any(image.size != (size, size) for image in water_frames):
            raise ValueError('Water animation frame dimensions differ')
        if size < 1 or size & (size-1):
            raise ValueError('Water mip isolation requires power-of-two frame dimensions')
        water_atlas = Image.new('RGBA', (size*8, size*math.ceil(len(water_frames)/8)))
        for i, frame in enumerate(water_frames):
            water_atlas.paste(frame, ((i%8)*size, (i//8)*size))
        save_image('Assets/Textures/Water.png', water_atlas)
        shader = water_shader(water_row, size, water_atlas.size, [ox/128, oy/128], [width,height])
        (temporary / 'Assets/Shaders/Water.mshader').write_text(shader, encoding='utf-8')
        write_json(temporary / 'Assets/Materials/Water.mmat', dict(version=8, name='Original water', shader='custom', custom_shader='Assets/Shaders/Water.mshader', surface='transparent', blend_mode='alpha', base_color=[1,1,1,1], roughness=0.4, transparent_depth_write=False, render_queue=3000))
        water_heights = [((c[1]&0x3fff)-8192)/512+float(water_row['height']) for c in terrain['corners']]
        depth_bytes=np.asarray([max(0,water_heights[i]-heights[i]) for i in range(len(heights))],dtype='<f4').view('u1').reshape(height,width,4)
        save_image('Assets/Textures/WaterDepth.png',Image.fromarray(depth_bytes))
        water_count = 0
        for y in range(height-1):
            for x in range(width-1):
                ids = [y*width+x,(y+1)*width+x,(y+1)*width+x+1,y*width+x+1]
                if not any(terrain['corners'][i][2]&64 for i in ids):
                    continue
                points = [[ox/128+i%width, water_heights[i], -oy/128-i//width] for i in ids]
                append('Water', [x,y], 'Assets/Materials/Water.mmat', points, [[0,1,0]]*4, [[max(0,water_heights[i]-heights[i]),0] for i in ids], [0,3,1,1,3,2])
                water_count += 1
        entities, mesh_records = [], []

        def entity(name, components):
            entities.append(dict(entity=len(entities)+1, name=name, active=True, components=components))
            return entities[-1]['entity']

        extent = max(width-1, (height-1)*1.5)
        center_x, center_z = ox/128+(width-1)/2, -oy/128-(height-1)/2
        angle = -math.pi/2
        entity('Camera', dict(Transform=dict(position=[center_x,extent,center_z], rotation=[math.sin(angle/2),0,0,math.cos(angle/2)]), Camera3D=dict(primary=True, projection='orthographic', orthographic_size=max((width-1)*.32,(height-1)*.55), near=.1, far=extent*4)))
        entity('Sun', dict(Transform=dict(rotation=[-.4,-.2,0,.894427]), DirectionalLight=dict(intensity=2.2,color=[1,1,1,1],cast_shadows=True)))
        water_names = []
        for (x,y,kind,material), batch in sorted(batches.items()):
            name = f'{kind}-{x}-{y}-{Path(material).stem}'
            mesh = f'Assets/Models/{name}.glb'
            glb = converter.Glb()
            glb.mesh(batch['positions'], batch['normals'], batch['uvs'], batch['indices'])
            glb.save(temporary / mesh)
            entity(name, dict(Transform=dict(position=[0,0,0]), MeshRenderer=dict(mesh=mesh,material=material)))
            if kind == 'Water':
                water_names.append(name)
            mesh_records.append(dict(path=mesh, vertices=len(batch['positions']), triangles=len(batch['indices'])//3, sha256=sha((temporary/mesh).read_bytes())))
        scene = dict(version=1,name=map_data['name'],world=dict(entities=entities,clear_color=[.035,.045,.055,1]))
        write_json(temporary/'Assets/Scenes/Main.mscene', scene)
        script = '// Author: MiYu. Original water animation advances only with simulation time.\n'
        script += 'var waterNames='+json.dumps(water_names)+';var waterEntities=null,elapsed=0,lastFrame=-1;\nfunction onTick(dt){waterEntities??=engine.findEntitiesByName(waterNames).map(e=>e.entity);elapsed+=Math.max(0,dt);const frame=Math.floor(elapsed*'+water_row['texRate']+')%'+water_row['numTex']+';if(frame===lastFrame)return;lastFrame=frame;for(const entity of waterEntities)engine.pushCommandJson(JSON.stringify({op:"setComponent",entity,component:"MaterialPropertyBlock",value:{custom_parameter_names:["water_time"],custom_parameter_values:[[frame,0,0,0]]}}));}\n'
        (temporary/'Assets/Scripts').mkdir()
        (temporary/'Assets/Scripts/Main.js').write_text(script,encoding='utf-8')
        write_json(temporary/'project.json',dict(name=map_data['name']+' original terrain',version=1,language='javascript',mainScene='Assets/Scenes/Main.mscene',startupScript='Assets/Scripts/Main.js',buildScenes=['Assets/Scenes/Main.mscene']))
        for relative, raw in raw_sources.items():
            target = temporary/'SourceAssets'/relative
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        receipt = dict(mapSha256=data['source']['sha256'], terrainTiles=terrain['tileSize'], coordinateScale=1/128, axes=['X','Z','-Y'], chunkSize=chunk_size,
                       sourceExport=str(exported), groundTiles=len(layout['ground']), cliffInstances=len(layout['cliffs']), rampTransitions=sum('Trans' in p['model'] for p in layout['cliffs']),
                       rampEntrances=len(layout['rampEntrances']), waterTiles=water_count, entities=len(entities), atlasTiles=len(tiles), groundAtlas=dict(tileSize=64,maxMip=6,size=list(atlas.size),sampling='per-tile-clamped-trilinear'), meshes=mesh_records,
                       waterAtlas=dict(frameSize=size,maxMip=int(math.log2(size)),size=list(water_atlas.size),frames=len(water_frames),sampling='per-frame-repeat-trilinear'),
                       sources=list(sources.values()), templateSha256=sha(patches_path.read_bytes()), templateCatalogSha256=sha((SAMPLE/'Assets/WarcraftIII/classic-cliff-catalog.json').read_bytes()),
                       compilerSha256=sha(Path(__file__).read_bytes()), layoutSha256=sha((ROOT/'scripts/warcraft_terrain.py').read_bytes()), converterSha256=sha((ROOT/'scripts/convert-warcraft-assets.py').read_bytes()),
                       coverage=dict(terrainScene=True, gameplay=False, doodads=False, units=False, shorelineModels=False, originalRuntimeVisualParity=False))
        write_json(temporary/'terrain-sources.json',receipt)
        write_json(temporary/'terrain-layout.json',layout)
        os.rename(temporary,output)
        return receipt
    finally:
        for _, archive in archives:
            archive.file.close()
        if temporary.exists():
            temporary.resolve().relative_to(output.parent)
            shutil.rmtree(temporary)


def ground_shader(atlas_size):
    return '/* MENGINE_PARAMETERS\n'+json.dumps(dict(textures=[dict(name='ground',type='color',default='Assets/Textures/Ground.png')]))+'\n*/\n'+f'''// Author: MiYu. Keep ground filtering inside one source tile at every mip.
fn source_ground_level(uv:vec2<f32>,level:f32) -> vec4<f32> {{
    let size=vec2<f32>({float(atlas_size[0])},{float(atlas_size[1])});
    let tile=floor(uv*size/64.0)*64.0;
    let local=(uv*size-tile-vec2<f32>(0.5))*(64.0/63.0);
    let margin=vec2<f32>(0.5*exp2(level));
    let pixel=tile+clamp(local,margin,vec2<f32>(64.0)-margin);
    return textureSampleLevel(mengine_custom_texture_0,material_sampler,pixel/size,level);
}}
fn source_ground_sample(uv:vec2<f32>,lod:f32) -> vec4<f32> {{
    let level=clamp(lod,0.0,6.0);let lower=floor(level);let upper=min(lower+1.0,6.0);
    let a=source_ground_level(uv,lower);
    if level==lower {{return a;}}
    return mix(a,source_ground_level(uv,upper),level-lower);
}}
fn mengine_lit_surface_hook(surface:MEngineSurface,uv:vec2<f32>,world_position:vec3<f32>) -> MEngineSurface {{
    let pixel=uv*vec2<f32>({float(atlas_size[0])},{float(atlas_size[1])})*(64.0/63.0);
    let dx=dpdx(pixel);let dy=dpdy(pixel);
    let lod=0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),0.000001));
    var s=surface;s.base_color=source_ground_sample(uv,lod).rgb;s.alpha=1.0;return s;
}}
'''


def water_atlas_sampling(size, atlas_size):
    return f'''// Author: MiYu. Repeat within one water frame, including bilinear taps across its edges.
fn source_water_level(frame:u32,local:vec2<f32>,level:f32) -> vec4<f32> {{
    let n=i32({size}u>>u32(level));let origin=vec2<i32>(i32(frame%8u),i32(frame/8u))*n;
    if n==1 {{return textureLoad(mengine_custom_texture_0,origin,i32(level));}}
    let pixel=local*f32(n)-vec2<f32>(0.5);let lo=vec2<i32>(floor(pixel));let f=fract(pixel);
    let wrapped=((lo%vec2<i32>(n))+vec2<i32>(n))%vec2<i32>(n);
    if all(wrapped+vec2<i32>(1)<vec2<i32>(n)) {{
        let uv=(vec2<f32>(origin+wrapped)+f+vec2<f32>(0.5))/vec2<f32>(textureDimensions(mengine_custom_texture_0,u32(level)));
        return textureSampleLevel(mengine_custom_texture_0,material_sampler,uv,level);
    }}
    let a=origin+wrapped;let b=origin+(wrapped+vec2<i32>(1))%vec2<i32>(n);
    let sw=textureLoad(mengine_custom_texture_0,a,i32(level));let se=textureLoad(mengine_custom_texture_0,vec2<i32>(b.x,a.y),i32(level));
    let nw=textureLoad(mengine_custom_texture_0,vec2<i32>(a.x,b.y),i32(level));let ne=textureLoad(mengine_custom_texture_0,b,i32(level));
    return mix(mix(sw,se,f.x),mix(nw,ne,f.x),f.y);
}}
fn source_water_sample(frame:u32,local:vec2<f32>,lod:f32) -> vec4<f32> {{
    let level=clamp(lod,0.0,{float(int(math.log2(size)))});let lower=floor(level);let a=source_water_level(frame,local,lower);
    if level==lower {{return a;}}
    return mix(a,source_water_level(frame,local,lower+1.0),level-lower);
}}
'''


def water_shader(row, size, atlas_size, origin, vertex_size):
    colors = {key:[float(row[key+'_'+c])/255 for c in ['R','G','B','A']] for key in ['Smin','Smax','Dmin','Dmax']}
    vec = lambda values:'vec4<f32>('+','.join(str(float(v)) for v in values)+')'
    return '/* MENGINE_PARAMETERS\n'+json.dumps(dict(parameters=[dict(name='water_time',type='vector4',default=[0,0,0,0])],textures=[dict(name='water',type='color',default='Assets/Textures/Water.png'),dict(name='water_depth',type='data',default='Assets/Textures/WaterDepth.png')]))+'\n*/\n'+water_atlas_sampling(size,atlas_size)+f'''// Author: MiYu. Source W3E water heights and Water.slk colors, frames and lattice.
fn source_water_tint(cell:vec2<i32>) -> vec4<f32> {{
    let packed=vec4<u32>(textureLoad(mengine_custom_texture_1,clamp(cell,vec2<i32>(0),vec2<i32>({vertex_size[0]-1},{vertex_size[1]-1})),0)*255.0+vec4<f32>(0.5));
    let depth=clamp(bitcast<f32>(packed.r|(packed.g<<8u)|(packed.b<<16u)|(packed.a<<24u)),0.0,1.0);
    if depth<=0.5 {{return mix({vec(colors['Smin'])},{vec(colors['Smax'])},clamp((depth-0.078125)/0.421875,0.0,1.0));}}
    return mix({vec(colors['Dmin'])},{vec(colors['Dmax'])},clamp((depth-0.5)/0.0625,0.0,1.0));
}}
fn mengine_lit_surface_hook(surface: MEngineSurface, uv: vec2<f32>, world_position: vec3<f32>) -> MEngineSurface {{
    var s=surface;
    let frame=u32(max(0.0,mengine_param_water_time().x))%{int(row['numTex'])}u;
    let lattice=(vec2<f32>(world_position.x,-world_position.z)-vec2<f32>({float(origin[0])},{float(origin[1])}))/{float(row['cells'])};
    let local=vec2<f32>(lattice.x,-lattice.y);
    let dx=dpdx(lattice)*{float(size)};let dy=dpdy(lattice)*{float(size)};
    let lod=0.5*log2(max(max(dot(dx,dx),dot(dy,dy)),0.000001));
    let pixel=source_water_sample(frame,local,lod);
    let grid=lattice*{float(row['cells'])};let cell=vec2<i32>(floor(grid));let f=fract(grid);
    let sw=source_water_tint(cell);let nw=source_water_tint(cell+vec2<i32>(0,1));let ne=source_water_tint(cell+vec2<i32>(1,1));let se=source_water_tint(cell+vec2<i32>(1,0));
    var tint=sw*(1.0-f.x-f.y)+se*f.x+nw*f.y;
    if f.x+f.y>1.0 {{tint=ne*(f.x+f.y-1.0)+nw*(1.0-f.x)+se*(1.0-f.y);}}
    s.base_color=pixel.rgb*pow(tint.rgb,vec3<f32>(2.2));s.alpha=pixel.a*tint.a;s.roughness=0.4;s.metallic=0.0;
    return s;
}}
'''


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('export',type=Path)
    parser.add_argument('--game',type=Path,default=Path('E:/Program Files (x86)/dzclient/Game/Warcraft III Frozen Throne'))
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--chunk-size',type=int,default=32)
    args=parser.parse_args()
    result=build(args.export,args.game,args.output,args.chunk_size)
    print(json.dumps({k:v for k,v in result.items() if k not in ['meshes','sources']},ensure_ascii=False))
