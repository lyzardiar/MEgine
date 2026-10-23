"""Author: MiYu. Clip selection patches to authenticated generated ground triangles."""
import json
import math
import struct


def ground_triangles(raw):
    # Accept only the static, tightly packed GLB layout emitted by the terrain converter.
    magic,version,length=struct.unpack_from('<III',raw)
    if magic!=0x46546c67 or version!=2 or length!=len(raw):raise ValueError('Invalid terrain GLB')
    size,kind=struct.unpack_from('<II',raw,12)
    if kind!=0x4e4f534a:raise ValueError('Missing terrain GLB JSON')
    doc=json.loads(raw[20:20+size]);offset=28+size
    binary_size,binary_kind=struct.unpack_from('<II',raw,20+size)
    if binary_kind!=0x004e4942 or offset+binary_size!=len(raw) or doc['nodes']!=[{'mesh':0}]:raise ValueError('Unsupported terrain GLB layout')
    def accessor(index,component,shape,count,fmt):
        a=doc['accessors'][index];v=doc['bufferViews'][a['bufferView']]
        if a['componentType']!=component or a['type']!=shape or 'sparse' in a or 'byteStride' in v or v['buffer']!=0:raise ValueError('Unsupported terrain accessor')
        start=v.get('byteOffset',0)+a.get('byteOffset',0);end=start+a['count']*count*4
        if end>v.get('byteOffset',0)+v['byteLength'] or end>binary_size:raise ValueError('Truncated terrain accessor')
        return list(struct.iter_unpack('<'+fmt*count,raw[offset+start:offset+end]))
    triangles=[]
    for mesh in doc['meshes']:
        for p in mesh['primitives']:
            if p.get('mode',4)!=4:raise ValueError('Terrain must contain triangles')
            positions=accessor(p['attributes']['POSITION'],5126,'VEC3',3,'f');indices=[i[0] for i in accessor(p['indices'],5125,'SCALAR',1,'I')]
            if len(indices)%3 or any(i>=len(positions) for i in indices) or not all(math.isfinite(v) for p in positions for v in p):raise ValueError('Invalid terrain geometry')
            triangles.extend([[positions[i] for i in indices[n:n+3]] for n in range(0,len(indices),3)])
    return triangles


def selection_patch(triangles,x,z,size):
    """Preserve terrain triangle heights and edges while clipping to the source circle square."""
    half=size/2;positions=[];uvs=[];indices=[]
    for triangle in triangles:
        if max(p[0] for p in triangle)<x-half or min(p[0] for p in triangle)>x+half or max(p[2] for p in triangle)<z-half or min(p[2] for p in triangle)>z+half:continue
        polygon=list(triangle)
        for axis,edge,sign in [(0,x-half,1),(0,x+half,-1),(2,z-half,1),(2,z+half,-1)]:
            result=[]
            for i,b in enumerate(polygon):
                a=polygon[i-1];da=(a[axis]-edge)*sign;db=(b[axis]-edge)*sign
                if (da>=0)!=(db>=0):
                    t=da/(da-db);result.append([a[k]+(b[k]-a[k])*t for k in range(3)])
                if db>=0:result.append(b)
            polygon=result
        if len(polygon)<3:continue
        for i in range(1,len(polygon)-1):
            a,b,c=polygon[0],polygon[i],polygon[i+1]
            if abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))<1e-12:continue
            start=len(positions)
            for p in [a,b,c]:
                px,pz=(p[0]-x)/size,(p[2]-z)/size;positions.append([px,p[1],pz]);uvs.append([px+.5,pz+.5])
            indices.extend([start,start+1,start+2])
    return positions,uvs,indices
