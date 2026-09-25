"""Build original, deterministic 3D artwork, track, UI and synthesized audio for Pelican Road Rage."""
import json
import math
import random
import shutil
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'samples/pelican-road-rage'
MODELS = OUT / 'Assets/Models'
TAU = math.tau
random.seed(71)


def color(hex):
    # Material values are linear; UI remains authored in sRGB.
    rgb = [int(hex[i:i+2], 16) / 255 for i in (0, 2, 4)]
    return [v / 12.92 if v <= .04045 else ((v + .055) / 1.055) ** 2.4 for v in rgb] + [1]


PALETTE = {'asphalt': '364751', 'sand': 'E8D4AA', 'cream': 'FFF0CA', 'orange': 'F17B36', 'teal': '158D91', 'sea': '329FAD', 'foam': '91DBCE', 'rock': 'C0A083', 'grass': '749C65', 'leaf': '30846B', 'leafLight': '63A97A', 'trunk': '9C7153', 'rubber': '17252E', 'metal': 'A8BFC2', 'yellow': 'F6BA4D', 'white': 'F4EDDA', 'black': '152936', 'red': 'DC5A48', 'blue': '488CC1', 'purple': '8666A9', 'window': '385967', 'glow': 'B4FFFF'}


class Mesh:
    def __init__(self):
        self.p, self.n, self.i = [], [], []

    def tri(self, a, b, c):
        u, v = [b[i]-a[i] for i in range(3)], [c[i]-a[i] for i in range(3)]
        n = [u[1]*v[2]-u[2]*v[1], u[2]*v[0]-u[0]*v[2], u[0]*v[1]-u[1]*v[0]]
        length = math.sqrt(sum(t*t for t in n))
        if length < 1e-8: return
        n = [t/length for t in n]
        base = len(self.p)
        self.p.extend([a,b,c]); self.n.extend([n]*3); self.i.extend([base,base+1,base+2])

    def quad(self, a,b,c,d):
        self.tri(a,b,c); self.tri(a,c,d)

    def box(self, p, s, yaw=0):
        co, si = math.cos(yaw), math.sin(yaw)
        v = []
        for x,y,z in [(-1,-1,-1),(1,-1,-1),(1,1,-1),(-1,1,-1),(-1,-1,1),(1,-1,1),(1,1,1),(-1,1,1)]:
            x,y,z = x*s[0]/2,y*s[1]/2,z*s[2]/2
            v.append([p[0]+x*co+z*si,p[1]+y,p[2]-x*si+z*co])
        for a,b,c,d in [(0,3,2,1),(4,5,6,7),(0,4,7,3),(1,2,6,5),(3,7,6,2),(0,1,5,4)]: self.quad(v[a],v[b],v[c],v[d])

    def ellipsoid(self,p,s,segments=16,rings=10):
        base = len(self.p)
        for j in range(rings+1):
            phi=math.pi*j/rings
            for k in range(segments+1):
                theta=TAU*k/segments
                v=[math.sin(phi)*math.cos(theta),math.cos(phi),math.sin(phi)*math.sin(theta)]
                self.p.append([p[i]+s[i]*v[i] for i in range(3)])
                n=[v[i]/s[i] for i in range(3)]; length=math.sqrt(sum(t*t for t in n)); self.n.append([t/length for t in n])
        for j in range(rings):
            for k in range(segments):
                a=base+j*(segments+1)+k; b=a+segments+1
                self.i.extend([a,a+1,b+1,a,b+1,b])

    def tube(self,a,b,r1,r2=None,segments=12):
        r2 = r1 if r2 is None else r2
        axis=[b[i]-a[i] for i in range(3)]; length=math.sqrt(sum(t*t for t in axis)); axis=[t/length for t in axis]
        v=[axis[2],0,-axis[0]] if abs(axis[1])<.9 else [1,0,0]
        axis_length=length
        length=math.sqrt(sum(t*t for t in v)); v=[t/length for t in v]
        w=[axis[1]*v[2]-axis[2]*v[1],axis[2]*v[0]-axis[0]*v[2],axis[0]*v[1]-axis[1]*v[0]]
        ring=lambda p,r,k:[p[i]+r*(v[i]*math.cos(TAU*k/segments)+w[i]*math.sin(TAU*k/segments)) for i in range(3)]
        base=len(self.p)
        for point,radius in [(a,r1),(b,r2)]:
            for k in range(segments+1):
                self.p.append(ring(point,radius,k))
                normal=[v[i]*math.cos(TAU*k/segments)+w[i]*math.sin(TAU*k/segments)+axis[i]*(r1-r2)/axis_length for i in range(3)]
                norm=math.sqrt(sum(t*t for t in normal)); self.n.append([t/norm for t in normal])
        for k in range(segments):
            x=base+k; y=x+segments+1
            self.i.extend([x,x+1,y+1,x,y+1,y])
            self.tri(a,ring(a,r1,k+1),ring(a,r1,k)); self.tri(b,ring(b,r2,k),ring(b,r2,k+1))

    def torus(self,p,r,t,segments=32,sides=8):
        # Axle along X: motorcycle wheels.
        base=len(self.p)
        for j in range(segments+1):
            a=TAU*j/segments
            for k in range(sides+1):
                b=TAU*k/sides; n=[math.sin(b),math.cos(a)*math.cos(b),math.sin(a)*math.cos(b)]
                self.p.append([p[0]+t*n[0],p[1]+r*math.cos(a)+t*n[1],p[2]+r*math.sin(a)+t*n[2]]); self.n.append(n)
        for j in range(segments):
            for k in range(sides):
                a=base+j*(sides+1)+k; b=a+sides+1
                self.i.extend([a,b,a+1,a+1,b,b+1])

    def loft(self, sections, steps=8, sides=32):
        """Smooth sculpted surface along a curved spine; sections are (y,z,width,depth)."""
        points=[]
        for i in range(len(sections)-1):
            a,b,c,d=sections[max(0,i-1)],sections[i],sections[i+1],sections[min(len(sections)-1,i+2)]
            for j in range(steps):
                t=j/steps
                points.append([.5*((2*b[k])+(-a[k]+c[k])*t+(2*a[k]-5*b[k]+4*c[k]-d[k])*t*t+(-a[k]+3*b[k]-3*c[k]+d[k])*t*t*t) for k in range(4)])
        points.append(list(sections[-1])); base=len(self.p)
        for i,(y,z,w,h) in enumerate(points):
            prev=points[max(0,i-1)]; after=points[min(len(points)-1,i+1)]; dy=after[0]-prev[0]; dz=after[1]-prev[1]
            norm=math.hypot(dy,dz); ny,nz=-dz/norm,dy/norm
            for k in range(sides+1):
                a=TAU*k/sides
                self.p.append([max(.002,w)*math.cos(a),y+ny*max(.002,h)*math.sin(a),z+nz*max(.002,h)*math.sin(a)])
                self.n.append([0,0,0])
        first=len(self.i)
        for j in range(len(points)-1):
            for k in range(sides):
                a=base+j*(sides+1)+k; b=a+sides+1
                self.i.extend([a,b,a+1,a+1,b,b+1])
        # Area-weighted smooth normals; weld the ring seam.
        for j in range(first,len(self.i),3):
            ids=self.i[j:j+3]; a,b,c=[self.p[n] for n in ids]; u=[b[k]-a[k] for k in range(3)]; v=[c[k]-a[k] for k in range(3)]
            n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
            for idx in ids:
                for k in range(3): self.n[idx][k]+=n[k]
        for j in range(len(points)):
            a=base+j*(sides+1); b=a+sides
            n=[self.n[a][k]+self.n[b][k] for k in range(3)]; self.n[a]=n[:]; self.n[b]=n[:]
        for i in range(base,len(self.n)):
            n=self.n[i]; length=math.sqrt(sum(v*v for v in n)); self.n[i]=[v/max(length,1e-8) for v in n]

    def save(self,name):
        if not self.p: return None
        data=bytearray(); views=[]; accessors=[]
        for values,fmt,kind,ctype in [(self.p,'f','VEC3',5126),(self.n,'f','VEC3',5126),(self.i,'I','SCALAR',5125)]:
            flat=[v for row in values for v in row] if kind!='SCALAR' else values
            raw=struct.pack('<'+fmt*len(flat),*flat); offset=len(data); data.extend(raw)
            views.append(dict(buffer=0,byteOffset=offset,byteLength=len(raw)))
            accessor=dict(bufferView=len(views)-1,componentType=ctype,count=len(values),type=kind)
            if len(accessors)==0:
                accessor['min']=[min(v[i] for v in values) for i in range(3)]; accessor['max']=[max(v[i] for v in values) for i in range(3)]
            accessors.append(accessor)
        doc=dict(asset=dict(version='2.0',generator='MEngine Pelican original geometry'),buffers=[dict(byteLength=len(data))],bufferViews=views,accessors=accessors,meshes=[dict(primitives=[dict(attributes=dict(POSITION=0,NORMAL=1),indices=2)])],nodes=[dict(mesh=0)],scenes=[dict(nodes=[0])],scene=0)
        text=json.dumps(doc,separators=(',',':')).encode(); text+=b' '*((-len(text))%4); data+=b'\0'*((-len(data))%4)
        path=MODELS/(name+'.glb'); path.write_bytes(struct.pack('<III',0x46546C67,2,28+len(text)+len(data))+struct.pack('<II',len(text),0x4E4F534A)+text+struct.pack('<II',len(data),0x004E4942)+data)
        return 'Assets/Models/'+path.name


def track(s,x=0,y=0):
    cx=24*math.sin(s/145)+12*math.sin(s/65)
    cy=1.5+.45*math.sin(s/150)+.65*math.sin(s/450)
    dx=24/145*math.cos(s/145)+12/65*math.cos(s/65)
    co=1/math.sqrt(1+dx*dx)
    return [cx+x*co,cy+y,-s+x*dx*co]


def main():
    for d in ['Assets/Models','Assets/Scenes','Assets/Scripts','Assets/Audio','Assets/Fonts','Assets/Art']: (OUT/d).mkdir(parents=True,exist_ok=True)
    for name in ['Roboto-Regular.ttf','LICENSE.txt']:
        source=ROOT/'samples/unity-normal-mapping/Assets/Fonts'/name
        if source.exists(): shutil.copy2(source,OUT/'Assets/Fonts'/name)
    shutil.copy2(ROOT/'samples/types/engine.d.ts',OUT/'Assets/Scripts/mengine.d.ts')
    scene=[]
    def entity(name,components=None,parent=None):
        e=dict(entity=len(scene)+1,name=name,parent=parent,siblingIndex=len(scene),active=True,components=components or {})
        scene.append(e); return e['entity']
    def transform(p=(0,0,0),s=(1,1,1),q=(0,0,0,1)): return dict(position=p,scale=s,rotation=q)
    def material(palette):
        painted=palette in ['teal','yellow','red','blue','purple']
        return dict(base_color=color(PALETTE[palette]),roughness=.28 if palette=='metal' else .3 if painted else .74,metallic=.75 if palette=='metal' else .18 if painted else 0)
    def render(name,mesh,palette,parent=None,p=(0,0,0),s=(1,1,1),q=(0,0,0,1)):
        return entity(name,dict(Transform=transform(p,s,q),MeshRenderer=dict(mesh=mesh,material='default'),PbrMaterial=material(palette)),parent)
    entity('Main Camera',dict(Transform=transform(track(-8,0,4),q=[-.16,0,0,.987]),Camera3D=dict(fov_y_degrees=56,near=.15,far=1100,clear_flags='skybox'),AudioListener=dict(primary=True)))
    entity('Golden hour',dict(Transform=transform(q=[-.044,-.82,-.064,.566]),DirectionalLight=dict(color=[1,.51,.25,1],intensity=4.8,shadow_distance=70,shadow_strength=.85,shadow_bias=.001)))
    entity('Coastal atmosphere',dict(EnvironmentLight=dict(sky_color=color('7185AA'),equator_color=color('C5A3A7'),ground_color=color('293541'),diffuse_intensity=.75,specular_intensity=.7,background_enabled=True,tone_mapping=True)))
    world={k:Mesh() for k in PALETTE}
    # Continuous surface: strips follow the exact same curve as the vehicle simulation.
    for start in range(-60,2800,4):
        for lo,hi,y,pal in [(-7,7,0,'asphalt'),(-8.3,-7,-.05,'cream'),(7,8.3,-.05,'cream'),(-12,-8.3,-.18,'sand'),(8.3,50,-.2,'grass')]:
            world[pal].quad(track(start,lo,y),track(start,hi,y),track(start+4,hi,y),track(start+4,lo,y))
        for side in [-1,1]:
            lo,hi=sorted([side*7,side*7.7]); pal='orange' if start%8==0 else 'cream'
            world[pal].quad(track(start,lo,.035),track(start,hi,.035),track(start+4,hi,.035),track(start+4,lo,.035))
        if start%12<5:
            for x in [-2.35,2.35]: world['cream'].quad(track(start,x-.055,.025),track(start,x+.055,.025),track(start+3,x+.055,.025),track(start+3,x-.055,.025))
        # Layered faceted coastal cliff and breaking surf, sea on the left.
        world['rock'].quad(track(start,-12,-.18),track(start,-14,-4),track(start+4,-14,-4),track(start+4,-12,-.18))
        if start%12==0:
            a,b=track(start,-9.5,.8),track(start+12,-9.5,.8)
            world['trunk'].tube(a,b,.065,segments=8)
            world['trunk'].tube(track(start,-9.5,.1),track(start,-9.5,1.15),.09,segments=8)
    # Roadside objects are batched by material into static GLBs.
    for s in range(-10,2780,38):
        for side in [-1,1]:
            if side==1 and s%3==0: continue
            x=side*random.uniform(10.5,12) if side<0 else random.uniform(12,21); p=track(s,x); height=random.uniform(6,10)
            top=[p[0]+side*1.1,p[1]+height,p[2]+.6]
            world['trunk'].tube(p,top,.32,.19,8)
            for k in range(9):
                a=k*TAU/9+s; leaf=world['leaf' if k%2 else 'leafLight']
                def blade(t,side):
                    w=math.sin(math.pi*t)**.65*.5*(1+.12*math.sin(t*45))
                    return [top[0]+math.cos(a)*4.8*t+math.sin(a)*w*side,top[1]+math.sin(t*math.pi)*.7-t*t*1.9,top[2]+math.sin(a)*4.8*t-math.cos(a)*w*side]
                for j in range(12):
                    t,u=j/12,(j+1)/12
                    leaf.quad(blade(t,-1),blade(u,-1),blade(u,1),blade(t,1)); leaf.quad(blade(t,1),blade(u,1),blade(u,-1),blade(t,-1))
                world['leafLight'].tube(top,blade(.7,0),.025,.008,5)
            for k in range(3): world['trunk'].ellipsoid([top[0]+.2*k,top[1]-.3,top[2]],[.24,.3,.24],8,5)
        if s%2==0:
            for side in [-1,1]:
                p=track(s,side*8.2,.65); world['cream'].box(p,[.22,1.3,.22]); world['orange'].box([p[0],p[1]+.4,p[2]+.13],[.25,.22,.06])
    for s in range(680,1440,33):
        p=track(s,random.uniform(16,25)); h=random.uniform(4,9); w=random.uniform(7,12)
        world['cream' if s%2 else 'sand'].box([p[0],p[1]+h/2,p[2]],[w,h,13])
        world['red'].box([p[0],p[1]+h+.2,p[2]],[w+.6,.4,13.6])
        for y in [1.4,3.8,6.2]:
            if y>h-1: continue
            for z in [-4,0,4]:
                world['window'].box([p[0]-w/2-.025,p[1]+y,p[2]+z],[.06,1.4,1.4])
                world['teal'].box([p[0]-w/2-.12,p[1]+y-.8,p[2]+z],[.3,.16,1.8])
        world['teal'].box([p[0]-w/2-1.8,p[1]+2.7,p[2]],[3.8,.18,9])
    # Lighthouse, marina sails and distant hills are strong landmarks.
    p=track(2050,-22)
    for i in range(7): world['cream' if i%2==0 else 'red'].tube([p[0],p[1]+i*2.5,p[2]],[p[0],p[1]+(i+1)*2.5,p[2]],2-i*.15,1.85-i*.15,16)
    world['window'].tube([p[0],p[1]+17.5,p[2]],[p[0],p[1]+20,p[2]],1.3,1.3,12)
    world['red'].tube([p[0],p[1]+20,p[2]],[p[0],p[1]+22,p[2]],1.9,0,16)
    for s in range(100,2600,220):
        p=track(s,-random.uniform(60,160)); p[1]=-.8
        world['white'].ellipsoid(p,[1,.8,4],12,6)
        world['trunk'].tube(p,[p[0],p[1]+8,p[2]],.08)
        world['cream'].tri([p[0],p[1]+1,p[2]],[p[0],p[1]+8,p[2]],[p[0]+4,p[1]+1,p[2]])
    for s in range(0,2800,180):
        p=track(s,random.uniform(80,120),-5)
        world['grass'].ellipsoid(p,[random.uniform(30,75),random.uniform(15,40),80],9,5)
    for s in [10,900,1800,2700]:
        for x in [-8.5,8.5]: world['teal'].box(track(s,x,4),[.7,8,.7])
        world['teal'].box(track(s,0,8),[18,1.3,.75])
        for x in range(-8,9): world['yellow' if x%2 else 'cream'].box(track(s,x,8),[.65,.75,.8])
        if s in [10,2700]:
            for x in range(-7,7):
                for z in range(3):
                    world['cream' if (x+z)%2 else 'rubber'].quad(track(s+z,x,.04),track(s+z,x+1,.04),track(s+z+1,x+1,.04),track(s+z+1,x,.04))
    for pal,mesh in world.items():
        path=mesh.save('coast-'+pal)
        if path:
            obj=render('Coast / '+pal,path,pal)
            if pal=='asphalt':
                scene[obj-1]['components'].pop('PbrMaterial'); scene[obj-1]['components']['MeshRenderer']['material']='Assets/Materials/Road.mmat'
    # A tessellated ocean patch follows the camera. Its periodic height field translates
    # continuously, while the material supplies moving fine normals, Fresnel and sun glints.
    sea=Mesh(); n=400; size=1400
    for j in range(n+1):
        z=math.copysign((abs(j/n-.5)*2)**1.5*size/2,j/n-.5)
        for i in range(n+1):
            x=size/2-size*(1-i/n)**2
            h=1.05*math.sin(x*.14+z*.19)+.48*math.sin(x*.29-z*.11)+.12*math.sin(x*.6+z*.43)
            dx=.147*math.cos(x*.14+z*.19)+.1392*math.cos(x*.29-z*.11)+.072*math.cos(x*.6+z*.43)
            dz=.1995*math.cos(x*.14+z*.19)-.0528*math.cos(x*.29-z*.11)+.0516*math.cos(x*.6+z*.43)
            norm=math.sqrt(1+dx*dx+dz*dz); sea.p.append([x,h,z]); sea.n.append([-dx/norm,1/norm,-dz/norm])
    for j in range(n):
        for i in range(n):
            a=j*(n+1)+i; b=a+n+1; sea.i.extend([a,b,a+1,a+1,b,b+1])
    ocean=entity('Ocean',dict(Transform=transform([-320,-.9,0]),MeshRenderer=dict(mesh=sea.save('ocean-waves'),material='Assets/Materials/Ocean.mmat',cast_shadows=False)))
    # The low sun has a emissive core and a large soft halo supplied by the sky material.
    sky=Mesh(); sky.ellipsoid([0,0,0],[1,1,1],48,32)
    entity('Sunset sky',dict(Transform=transform(s=[1000,1000,1000]),MeshRenderer=dict(mesh=sky.save('sunset-sky'),material='Assets/Materials/Sunset.mmat',cast_shadows=False)))
    # Original cafe-racer and pelican. Each articulated group is a handful of material batches.
    bike={k:Mesh() for k in ['rubber','metal','yellow','teal','red','cream']}
    for x in [-.32,.32]:
        for a,b in [([x,.5,1.05],[x,1.1,-.1]),([x,.5,1.05],[x,.55,-.55]),([x,.55,-.55],[x,1.1,-.1]),([x,1.1,-.1],[x,.5,-1.15])]: bike['metal'].tube(a,b,.07)
        bike['metal'].tube([x,.5,-1.15],[x,1.5,-.8],.085)
    bike['yellow'].ellipsoid([0,1.05,-.22],[.47,.36,.68],32,20)
    bike['teal'].ellipsoid([0,.94,.67],[.37,.22,.65],32,20)
    bike['rubber'].ellipsoid([0,1.1,.52],[.4,.1,.58])
    bike['metal'].ellipsoid([0,.55,-.08],[.42,.37,.45])
    for y in [.39,.49,.59,.69,.79]: bike['black' if 'black' in bike else 'rubber'].box([0,y,-.15],[.87,.035,.6])
    bike['metal'].tube([.4,.4,.12],[.48,.48,1.35],.095,.12)
    bike['rubber'].tube([.48,.48,1.32],[.48,.48,1.4],.08)
    bike['yellow'].ellipsoid([0,1.27,-1.04],[.4,.37,.2])
    bike['cream'].ellipsoid([0,1.27,-1.21],[.29,.27,.045])
    bike['teal'].ellipsoid([0,1.54,-1.06],[.32,.22,.06])
    bike['metal'].tube([-.62,1.49,-.73],[.62,1.49,-.73],.048)
    for x in [-.64,.64]:
        bike['rubber'].tube([x-.1,1.49,-.73],[x+.1,1.49,-.73],.07)
        bike['metal'].tube([x,1.49,-.73],[x*1.08,1.9,-.75],.024)
        bike['teal'].ellipsoid([x*1.08,1.91,-.75],[.13,.09,.045])
    bike['red'].box([0,1.02,1.2],[.25,.1,.05])
    rider={k:Mesh() for k in ['white','cream','orange','teal','black','red']}
    rider['white'].loft([(1.57,1.55,.015,.025),(1.65,1.15,.3,.28),(1.94,.57,.63,.69),(2.1,-.03,.5,.56),(2.35,-.26,.3,.31),(2.75,-.18,.18,.2),(3.1,-.01,.16,.18),(3.4,-.15,.24,.26),(3.58,-.43,.31,.31),(3.54,-.66,.23,.22),(3.49,-.77,.02,.04)],10,40)
    # Upper bill is a tapered profile; the lower pouch forms a hanging triangular sail.
    rider['orange'].loft([(3.5,-.63,.16,.045),(3.48,-.87,.25,.075),(3.44,-1.35,.14,.055),(3.37,-1.98,.008,.009)],12,32)
    rider['orange'].loft([(3.43,-.69,.18,.05),(3.24,-.86,.225,.2),(3.23,-1.23,.14,.2),(3.36,-1.92,.005,.007)],12,32)
    rider['cream'].loft([(3.532,-.7,.02,.008),(3.52,-.89,.235,.018),(3.475,-1.35,.13,.013),(3.38,-1.96,.003,.003)],10,24)
    rider['teal'].loft([(3.58,-.77,.015,.02),(3.7,-.63,.27,.12),(3.78,-.36,.33,.21),(3.66,-.06,.19,.11),(3.62,-.02,.01,.01)],10,32)
    rider['cream'].loft([(3.60,-.775,.012,.012),(3.81,-.61,.035,.012),(3.985,-.37,.04,.012),(3.77,-.11,.033,.012),(3.635,-.015,.008,.008)],10,20)
    # Visible eye and gold goggle rim, rather than an opaque helmet hiding expression.
    for x in [-.285,.285]:
        rider['cream'].ellipsoid([x,3.63,-.53],[.049,.105,.12],20,12)
        rider['black'].ellipsoid([x*1.13,3.63,-.56],[.035,.07,.077],20,12)
        rider['white'].ellipsoid([x*1.22,3.66,-.588],[.012,.018,.019],12,8)
        rider['orange'].ellipsoid([x*1.5,1,.06],[.17,.12,.33],24,12)
        leg=Mesh(); leg.loft([(1.66,.35,.05,.06),(1.52,.27,.105,.11),(1.24,.12,.073,.08),(1.02,.06,.06,.06)],8,24)
        base=len(rider['white'].p); rider['white'].p.extend([[v[0]+x*1.6,v[1],v[2]] for v in leg.p]); rider['white'].n.extend(leg.n); rider['white'].i.extend([v+base for v in leg.i])
    # Scarf tails and layered flight feathers follow curved paths.
    rider['red'].loft([(2.73,-.18,.18,.2),(2.82,-.15,.184,.2),(2.88,-.13,.18,.2)],5,32)
    rider['red'].loft([(2.8,-.02,.16,.022),(2.65,.43,.13,.028),(2.78,.9,.085,.025),(2.62,1.43,.015,.014)],10,16)
    for k in range(5):
        feather=Mesh(); feather.loft([(2.19,.35,.04,.035),(2.13,.59,.11,.07),(1.97,.88+k*.035,.1,.06),(1.8,1.16+k*.025,.015,.015)],8,20)
        for side in [-1,1]:
            base=len(rider['cream'].p)
            rider['cream'].p.extend([[v[0]+side*(.46+k*.015),v[1]-k*.025,v[2]] for v in feather.p]); rider['cream'].n.extend(feather.n); rider['cream'].i.extend([v+base for v in feather.i])
    folded=Mesh(); folded.loft([(2.32,.05,.01,.02),(2.31,.24,.055,.2),(2.19,.52,.09,.32),(1.99,.85,.07,.24),(1.83,1.07,.01,.025)],10,28)
    for side in [-1,1]:
        base=len(rider['white'].p); rider['white'].p.extend([[v[0]+side*.52,v[1],v[2]] for v in folded.p]); rider['white'].n.extend(folded.n); rider['white'].i.extend([v+base for v in folded.i])
    wing=Mesh(); wing.loft([(0,0,.06,.06),(-.12,-.04,.24,.15),(-.34,-.2,.23,.13),(-.53,-.4,.14,.085),(-.6,-.55,.018,.018)],10,32)
    for k in range(5):
        base=len(wing.p); feather=Mesh(); feather.loft([(-.25,0,.04,.05),(-.48,-.2,.045,.035),(-.62-k*.018,-.5+k*.052,.005,.004)],8,12)
        wing.p.extend([[v[0]+(k-2)*.06,v[1],v[2]+.09] for v in feather.p]); wing.n.extend(feather.n); wing.i.extend([v+base for v in feather.i])
    wing_path=wing.save('pelican-wing')
    tire=Mesh(); tire.torus([0,0,0],.43,.14); tire_path=tire.save('wheel-tire')
    rim=Mesh(); rim.torus([0,0,0],.3,.035,24,6); rim.tube([-.16,0,0],[.16,0,0],.105)
    for k in range(10):
        a=TAU*k/10; rim.tube([0,0,0],[0,.3*math.cos(a),.3*math.sin(a)],.018,segments=5)
    rim_path=rim.save('wheel-rim')
    bike_paths={k:m.save('bike-'+k) for k,m in bike.items()}; rider_paths={k:m.save('pelican-'+k) for k,m in rider.items()}
    for i,pal in enumerate(['yellow','red','blue','purple','teal','cream']):
        root=entity('Rider '+str(i),dict(Transform=transform(track(-i*4,i%3*3-3))))
        for k,path in bike_paths.items(): render(f'Rider {i} bike {k}',path,pal if k=='yellow' else k,root)
        for k,path in rider_paths.items():
            bird=render(f'Rider {i} bird {k}',path,pal if k=='teal' and i else k,root)
            if k=='orange': scene[bird-1]['components']['PbrMaterial'].update(base_color=color('EBA854'),roughness=.46)
        for side in [-1,1]: render(f'Rider {i} wing {side}',wing_path,'white',root,p=[side*.5,2.13,-.03],s=[side,1,1])
        for z in [-1.15,1.05]:
            wheel=entity(f'Rider {i} wheel {z}',dict(Transform=transform([0,.56,z])),root)
            render('Tire',tire_path,'rubber',wheel); render('Spokes',rim_path,'metal',wheel)
    fish=Mesh(); fish.ellipsoid([0,0,0],[.28,.19,.55],12,7); fish.tri([0,0,.35],[-.32,.1,.85],[.32,.1,.85]); fish.tri([0,0,.35],[.32,.1,.85],[-.32,.1,.85]); fish_path=fish.save('sardine')
    for i in range(32): render('Pickup '+str(i),fish_path,'yellow',p=track(70+i*79,[-4,0,4][i%3],1))
    cone=Mesh(); cone.tube([0,0,0],[0,1,0],.4,.07,12); cone_path=cone.save('cone')
    for i in range(22): render('Hazard '+str(i),cone_path,'orange',p=track(130+i*114,[-4,2,4,-2][i%4]))
    spark=Mesh(); spark.ellipsoid([0,0,0],[.07,.07,.18],6,4); spark_path=spark.save('spark')
    for i in range(18): render('Spark '+str(i),spark_path,'yellow',p=[0,-100,0])
    # Overlay uses a single consistent 1280x720 design space.
    canvas=entity('Race UI',dict(Canvas=dict(render_mode='ScreenSpaceOverlay'),CanvasScaler=dict(ui_scale_mode='ScaleWithScreenSize',reference_resolution=[1280,720],screen_match_mode='MatchWidthOrHeight',match_width_or_height=.5),GraphicRaycaster=dict(enabled=True)))
    def ui(name,x,y,w,h,component,value,parent=canvas):
        return entity(name,dict(RectTransform=dict(anchor_min=[.5,.5],anchor_max=[.5,.5],pivot=[.5,.5],anchored_position=[x-640,y-360],size_delta=[w,h]),**{component:value}),parent)
    def panel(name,x,y,w,h,c): return ui(name,x,y,w,h,'Image',dict(color=c,raycast_target=False))
    def text(name,content,x,y,w,h,size=20,c=(.91,.94,.89,1),align='Left'):
        return ui(name,x,y,w,h,'Text',dict(text=content,font='Assets/Fonts/Roboto-Regular.ttf',font_size=size,color=c,alignment=align,vertical_align='Middle',horizontal_overflow='Overflow',vertical_overflow='Overflow',raycast_target=False))
    navy=[.026,.075,.105,.92]; mint=[.49,.91,.79,1]; gold=[1,.74,.29,1]
    panel('HUD top',640,49,1216,62,navy)
    text('Brand','PELICAN / ROAD RAGE',202,46,280,35,22)
    text('Sector','01  /  SUNWASH COAST',648,44,330,32,17,mint,'Center')
    text('Position','6 / 6',1093,42,150,40,30,gold,'Right')
    panel('Progress rail',640,81,1216,3,[.3,.4,.4,.7]); panel('Progress fill',32,81,1,3,mint)
    panel('Dashboard',193,628,322,114,navy); text('Speed','000',109,613,120,58,49); text('Speed label','KM/H',211,621,75,25,15,mint)
    text('Boost label','NITRO / SPACE',159,664,222,22,13,mint); panel('Boost rail',229,664,172,7,[.18,.28,.31,1]); panel('Boost fill',229,664,172,7,mint)
    panel('Health panel',1090,638,315,92,navy); text('Health label','FEATHERS',1047,617,183,25,14); panel('Health rail',1090,640,267,9,[.23,.28,.3,1]); panel('Health fill',1090,640,267,9,gold)
    text('Score','00000  /  STYLE',1090,666,267,25,16,mint,'Right')
    text('Toast','',640,159,850,50,28,gold,'Center'); text('Hint','W / S  throttle + brake     A / D  steer     J / K  wing attack     SPACE  boost     ESC  pause',640,703,1180,25,14)
    text('Combo','',640,535,600,36,26,mint,'Center'); text('Countdown','',640,319,400,130,100,gold,'Center')
    ui('Cover art',640,360,1280,720,'RawImage',dict(texture='Assets/Art/cover.png',color=[1,1,1,1],raycast_target=False))
    panel('Menu tint',284,360,568,720,[.015,.055,.08,.72])
    text('Menu eyebrow','A COASTAL COMBAT RACER',265,152,410,30,16,mint)
    text('Menu title','PELICAN\nROAD RAGE',274,258,430,174,63)
    text('Menu copy','Ride fast. Ruffle feathers.\nRule the coast.',266,393,410,75,24,gold)
    panel('Start button',241,493,360,62,[.98,.72,.25,1]); text('Start label','ENTER   /   RIDE OUT',240,493,330,44,22,[.025,.09,.11,1],'Center')
    text('Menu controls','WASD / ARROWS    Ride\nJ / K    Strike left / right\nSPACE    Nitro       SHIFT    Drift',270,596,420,94,19)
    text('Menu footer','2.7 KM  /  6 RIDERS  /  ONE TROPHY',270,679,420,24,13,mint)
    for name,clip,vol,loop in [('Motor','motor',.26,True),('Music','coast',.25,True),('Hit sound','hit',.55,False),('Pickup sound','pickup',.6,False),('Boost sound','boost',.35,False),('Finish sound','finish',.55,False)]:
        entity(name,dict(AudioSource=dict(clip='Assets/Audio/'+clip+'.wav',volume=vol,looped=loop,play_on_awake=False,playing=False)))
    entity('Audio settings',dict(AudioMixer=dict(master_volume=.8,music_volume=.55)))
    entity('Race telemetry',dict(Transform=transform()))
    (OUT/'project.json').write_text(json.dumps(dict(name='Pelican Road Rage',version=1,language='typescript',mainScene='Assets/Scenes/Main.mscene',buildScenes=['Assets/Scenes/Main.mscene'],startupScript='Assets/Scripts/Main.ts',assetMode='all'),indent=2)+'\n')
    (OUT/'Assets/Scenes/Main.mscene').write_text(json.dumps(dict(version=1,name='Sunwash Coast',world=dict(entities=scene,frame=0,sim_frame=0,clear_color=[.32,.62,.67,1],selected=1)),indent=2)+'\n')
    sounds()
    print(f'Built {len(scene)} entities and {len(list(MODELS.glob("*.glb")))} original mesh assets.')


def sounds():
    rate=22050
    def wav(name,duration,fn):
        with wave.open(str(OUT/'Assets/Audio'/(name+'.wav')),'wb') as f:
            f.setparams((1,2,rate,0,'NONE','not compressed'))
            f.writeframes(b''.join(struct.pack('<h',int(max(-.95,min(.95,fn(i/rate)))*32767)) for i in range(int(duration*rate))))
    wav('motor',2,lambda t:.22*math.sin(TAU*70*t)+.1*math.sin(TAU*140*t)+.045*math.sin(TAU*280*t))
    wav('hit',.27,lambda t:math.exp(-t*18)*(.55*random.uniform(-1,1)+.25*math.sin(TAU*(150*t-180*t*t))))
    wav('pickup',.4,lambda t:.28*math.sin(TAU*(680*t+900*t*t))*math.sin(math.pi*t/.4)**2)
    wav('boost',.7,lambda t:(.15*random.uniform(-1,1)+.12*math.sin(TAU*(110*t+160*t*t)))*math.sin(math.pi*t/.7))
    notes=[523.25,659.25,783.99,1046.5]
    wav('finish',1.6,lambda t:.28*math.sin(TAU*notes[min(3,int(t/.4))]*t)*math.sin(math.pi*(t%.4)/.4)**2)
    # Original 8-bar surf/synth groove, exact loop length at 120 BPM.
    def music(t):
        beat=t*2; step=int(beat*2); u=(beat*2)%1; chord=[0,5,9,7][int(beat/8)%4]
        bass=55*2**(chord/12); lead=220*2**(([0,7,12,7,4,7,14,12][step%8]+chord)/12)
        kick=.24*math.sin(TAU*(42*(t%.5)+4*(1-math.exp(-35*(t%.5)))))*math.exp(-20*(t%.5))
        hat=.045*random.uniform(-1,1)*math.exp(-28*(t%.25))
        return kick+hat+.12*math.sin(TAU*bass*t)*(1-.5*u)+.07*math.sin(TAU*lead*t)*math.sin(math.pi*u)**2
    wav('coast',16,music)


if __name__=='__main__': main()
