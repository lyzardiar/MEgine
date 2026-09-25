"""Rebuild the original Astral Thunder scene, procedural shaders and synthesized audio."""
import json
import math
import random
import shutil
import struct
import wave
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'samples/thunder-fighter'


def write(path, value):
    target = OUT / path
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(value, indent=2) + '\n', encoding='utf-8')


def main():
    for folder in ['Scenes', 'Scripts', 'Art', 'Materials', 'Shaders', 'Fonts', 'Audio']:
        (OUT / 'Assets' / folder).mkdir(parents=True, exist_ok=True)
    for name in ['Roboto-Regular.ttf', 'LICENSE.txt']:
        shutil.copy2(ROOT / 'samples/pelican-road-rage/Assets/Fonts' / name, OUT / 'Assets/Fonts' / name)
    shutil.copy2(ROOT / 'samples/types/engine.d.ts', OUT / 'Assets/Scripts/mengine.d.ts')
    names = ['interceptor', 'needle', 'gunship', 'sentinel', 'dreadnought', 'crown']
    write('Assets/Art/fleet.png.sprite.json', dict(version=1, mode='multiple', pixels_per_unit=256, slices=[dict(name=name, rect=[i % 3 * 512, i // 3 * 512, 512, 512], pivot=[.5,.5]) for i,name in enumerate(names)]))
    scene = []
    def entity(name, components, parent=None):
        scene.append(dict(entity=len(scene)+1, name=name, parent=parent, siblingIndex=len(scene), active=True, components=components))
        return len(scene)
    def tr(x=0,y=0): return dict(position=[x,y,0], rotation=[0,0,0,1], scale=[1,1,1])
    entity('Main Camera', dict(Transform=dict(position=[0,0,20],rotation=[0,0,0,1],scale=[1,1,1]), Camera2D=dict(size=9), EnvironmentLight=dict(background_enabled=False,tone_mapping=False), AudioListener=dict(primary=True)))
    def sprite(name, image, x,y,w,h,order=0,material=''):
        return entity(name,dict(Transform=tr(x,y),SpriteRenderer=dict(sprite=image,size=[w,h],color=[1,1,1,1],sorting_order=order,material=material)))
    sprite('Nebula','white',0,0,40,22,-100,'Assets/Materials/Nebula.mmat')
    sprite('Arena','white',0,0,11.7,17,-90,'Assets/Materials/Arena.mmat')
    for name,size,order,material in [('Enemy bullets',[.34,.34],25,'Orb'),('Needle bullets',[.22,.57],26,'Needle'),('Player fire',[.13,.75],15,'Needle'),('Missiles',[.18,.58],16,'Needle'),('Sparks',[.15,.55],36,'Needle'),('Glow',[1,1],12,'Glow'),('Shockwaves',[1,1],38,'Ring'),('Lasers',[.55,18],20,'Beam'),('Laser warnings',[.045,18],19,'Beam'),('Pickups',[.3,.3],17,'Diamond'),('Stars',[.05,.11],-80,'Glow')]:
        entity(name,dict(Transform=tr(),SpriteBatch2D=dict(sprite='white',material=f'Assets/Materials/{material}.mmat',size=size,instances=[],colors=[],sorting_order=order)))
    for i,kind in enumerate(['needle','gunship','sentinel','dreadnought','crown']):
        entity('Fleet '+str(i),dict(Transform=tr(),SpriteBatch2D=dict(sprite='Assets/Art/fleet.png#'+kind,size=[1,1],instances=[],colors=[],sorting_order=10)))
    sprite('Player','Assets/Art/fleet.png#interceptor',0,-6.5,1.1,1.1,18)
    sprite('Hit point','white',0,-6.5,.14,.14,42,'Assets/Materials/Orb.mmat')
    canvas=entity('Flight HUD',dict(Canvas=dict(render_mode='ScreenSpaceOverlay'),CanvasScaler=dict(ui_scale_mode='ScaleWithScreenSize',reference_resolution=[1280,720],screen_match_mode='MatchWidthOrHeight',match_width_or_height=.5),GraphicRaycaster=dict(enabled=True)))
    def ui(name,x,y,w,h,component,value):
        return entity(name,dict(RectTransform=dict(anchor_min=[.5,.5],anchor_max=[.5,.5],pivot=[.5,.5],anchored_position=[x-640,y-360],size_delta=[w,h]),**{component:value}),canvas)
    def panel(name,x,y,w,h,c): return ui(name,x,y,w,h,'Image',dict(color=c,raycast_target=False))
    def text(name,value,x,y,w,h,size=18,color=(.88,.94,1,1),align='Left'):
        return ui(name,x,y,w,h,'Text',dict(text=value,font='Assets/Fonts/Roboto-Regular.ttf',font_size=size,color=color,alignment=align,vertical_align='Middle',horizontal_overflow='Overflow',vertical_overflow='Overflow',raycast_target=False))
    cyan=[.17,.84,1,1]; gold=[1,.66,.25,1]; gray=[.35,.47,.62,1]; pink=[1,.22,.5,1]; dark=[.006,.012,.033,1]
    panel('Left rail',199,360,398,720,dark); panel('Right rail',1081,360,398,720,dark)
    panel('Left edge',399,360,2,680,[.1,.5,.65,.7]); panel('Right edge',881,360,2,680,[.4,.12,.55,.7])
    text('Eyebrow','MENGINE / FLIGHT DIVISION',198,53,308,25,13,cyan)
    text('Title','ASTRAL\nTHUNDER',211,151,336,165,53)
    text('Tagline','DANCE THROUGH THE STORM',199,256,310,26,13,gray)
    panel('Divider',198,290,308,1,[.14,.23,.35,1])
    text('Stage','01 / ION FRONT',199,320,308,30,21,cyan)
    text('Score label','SCORE',198,369,308,25,12,gray); text('Score','00000000',199,407,308,48,34)
    text('Chain','CHAIN  x1      GRAZE  000',199,452,308,30,15,gold)
    text('Armor','ARMOR  5 / 5',198,500,308,28,17); panel('Armor rail',198,527,308,5,[.12,.18,.27,1]); panel('Armor fill',198,527,308,5,cyan)
    text('Drive label','OVERDRIVE / E',198,574,308,25,13,cyan); panel('Drive rail',198,600,308,5,[.12,.18,.27,1]); panel('Drive fill',198,600,308,5,cyan)
    text('Bombs','NOVA  3 / 3',199,653,308,30,21,gold)
    text('Protocol','PILOT PROTOCOL',1080,62,300,24,13,cyan)
    text('Briefing','THREAD THE NEEDLE.\nBREAK THE CROWN.',1080,124,300,88,25)
    text('Objectives','01  Clear the drone screen\n02  Break the dreadnought\n03  Silence the Astral Crown',1080,219,300,85,17,gray)
    panel('Right divider',1080,284,300,1,[.14,.23,.35,1])
    text('Weapon','PULSE ARRAY / MK I',1080,328,300,33,20,gold)
    text('Weapon copy','Auto fire is engaged.\nCollect blue cores to upgrade.\nGraze bullets to charge Overdrive.',1080,392,300,87,15,gray)
    text('Controls','WASD / ARROWS     Move\nSHIFT                      Precision flight\nSPACE                     Nova burst\nE                              Overdrive\nESC / P                   Pause\nR / M                      Restart / Mute',1080,555,300,179,16)
    text('Render count','00 HOSTILES / 000 BULLETS',1080,674,300,25,12,cyan)
    text('Sector','ION FRONT / 01',640,30,450,30,14,cyan,'Center')
    text('Boss name','',640,72,420,26,16,pink,'Center'); panel('Boss rail',640,95,408,4,[.08,.12,.2,.85]); panel('Boss fill',640,95,408,4,pink)
    text('Announcement','',640,220,445,95,29,gold,'Center')
    text('Status','',640,660,440,28,15,cyan,'Center')
    panel('Menu shade',640,376,448,228,[.006,.012,.033,.9]); panel('Menu accent',640,263,448,2,cyan)
    text('Menu title','READY, PILOT?',640,310,424,65,35,align='Center')
    text('Menu copy','A storm of light. A single clear path.',640,367,424,43,16,gray,'Center')
    panel('Menu button',640,432,330,46,[.06,.51,.69,1]); text('Menu action','ENTER / LAUNCH',640,432,324,35,20,align='Center')
    text('Menu footer','5 ARMOR  /  3 NOVAS  /  AUTO FIRE',640,476,420,26,12,gray,'Center')
    entity('Flight telemetry',dict(Transform=tr()))
    entity('Audio mixer',dict(AudioMixer=dict(master_volume=.65,music_volume=.6)))
    for name,clip,volume,loop in [('Music','orbit',.22,True),('Shot sound','shot',.055,False),('Hit sound','hit',.25,False),('Explosion sound','explosion',.38,False),('Nova sound','nova',.45,False),('Pickup sound','pickup',.22,False),('Victory sound','victory',.4,False)]:
        entity(name,dict(AudioSource=dict(clip='Assets/Audio/'+clip+'.wav',volume=volume,looped=loop,play_on_awake=False,playing=False)))
    write('project.json',dict(name='Astral Thunder',version=1,language='typescript',mainScene='Assets/Scenes/Main.mscene',buildScenes=['Assets/Scenes/Main.mscene'],startupScript='Assets/Scripts/Main.ts',assetMode='all'))
    write('Assets/Scenes/Main.mscene',dict(version=1,name='Astral Thunder / Ion Front',world=dict(entities=scene,frame=0,sim_frame=0,clear_color=[.003,.006,.018,1],selected=1)))
    for name in ['Orb','Needle','Glow','Ring','Beam','Diamond','Arena','Nebula']:
        write(f'Assets/Materials/{name}.mmat',dict(version=10,name=name,shader='custom',custom_shader=f'Assets/Shaders/{name}.mshader',surface='transparent',blend_mode='alpha' if name in ['Arena','Nebula'] else 'additive',base_color=[1,1,1,1],custom_parameters=dict(clock=[0,0,0,0]) if name in ['Arena','Nebula'] else {},filter='linear'))
    sounds()
    print(f'Built {len(scene)} entities with 16 batched effect/fleet layers.')


def sounds():
    random.seed(431)
    rate=22050; tau=math.tau
    def wav(name,duration,fn):
        with wave.open(str(OUT/'Assets/Audio'/(name+'.wav')),'wb') as file:
            file.setparams((1,2,rate,0,'NONE','not compressed'))
            file.writeframes(b''.join(struct.pack('<h',int(max(-.95,min(.95,fn(i/rate)))*32767)) for i in range(int(duration*rate))))
    wav('shot',.08,lambda t:.16*math.sin(tau*(1300*t-5000*t*t))*math.exp(-t*40))
    wav('hit',.12,lambda t:(random.uniform(-.3,.3)+.3*math.sin(tau*180*t))*math.exp(-t*24))
    wav('explosion',.65,lambda t:(random.uniform(-.6,.6)+.22*math.sin(tau*(70*t-28*t*t)))*math.exp(-t*6))
    wav('nova',1.6,lambda t:(random.uniform(-.22,.22)+.3*math.sin(tau*(110*t-25*t*t))+.18*math.sin(tau*220*t))*math.exp(-t*2))
    wav('pickup',.2,lambda t:.23*math.sin(tau*(900*t+1500*t*t))*math.sin(math.pi*t/.2))
    wav('victory',1.8,lambda t:.25*math.sin(tau*[523.25,659.25,783.99,1046.5][min(3,int(t/.45))]*t)*math.sin(math.pi*(t%.45)/.45)**2)
    def music(t):
        step=int(t*8); chord=[0,3,-2,5][int(t/4)%4]; u=t%.125
        bass=55*2**(chord/12); lead=220*2**((chord+[0,7,12,15,12,7,3,7][step%8])/12)
        return .16*math.sin(tau*(42*(t%.5)+3*(1-math.exp(-40*(t%.5)))))*math.exp(-15*(t%.5))+.07*math.sin(tau*bass*t)+.07*math.sin(tau*lead*t)*math.exp(-u*20)+.025*random.uniform(-1,1)*math.exp(-u*60)
    wav('orbit',16,music)


if __name__=='__main__': main()
