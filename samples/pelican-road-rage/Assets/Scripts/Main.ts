/** Pelican Road Rage — original arcade driving, opponents, combat and presentation. */
type RaceMode = 'title' | 'countdown' | 'racing' | 'paused' | 'finished' | 'wrecked';
type Racer = { s: number; x: number; v: number; hp: number; stun: number; attack: number; side: number; lean: number; finish: number };
type Vec3 = [number, number, number];
const ROAD_LENGTH = 2700;
const clamp = (v: number, a: number, b: number): number => Math.max(a, Math.min(b, v));
const damp = (a: number, b: number, sharpness: number, dt: number): number => a + (b - a) * (1 - Math.exp(-sharpness * dt));
const MENU_NAMES = ['Cover art', 'Menu tint', 'Menu eyebrow', 'Menu title', 'Menu copy', 'Start button', 'Start label', 'Menu controls', 'Menu footer'];
const HUD_NAMES = ['HUD top', 'Brand', 'Sector', 'Position', 'Progress rail', 'Progress fill', 'Dashboard', 'Speed', 'Speed label', 'Boost label', 'Boost rail', 'Boost fill', 'Health panel', 'Health label', 'Health rail', 'Health fill', 'Score', 'Toast', 'Hint', 'Combo', 'Countdown'];
let mode: RaceMode = 'title', beforePause: RaceMode = 'racing';
let racers: Racer[] = [], elapsed = 0, raceTime = 0, countdown = 3, boost = 100, score = 0, combo = 0, comboTime = 0, hurt = 0, attackCooldown = 0, accumulator = 0;
let toast = '', toastTime = 0, drift = 0, hitCount = 0, pickups = 0, overtakes = 0, cameraStyle = 0, muted = false, initialized = false, photo = false;
let entities: Record<string, any> = {}, authored: Record<string, any> = {}, sent: Record<string, string> = {};
let collected: boolean[] = [], struck: boolean[] = [], passed: boolean[] = [], sparks: { p: Vec3; v: Vec3; life: number }[] = [];
let cameraPosition: Vec3 = [0,0,0];
let cameraYaw = 0, cameraPitch = -.25, cameraFov = 62;

function set(name: string, component: string, value: any): void {
  const entity = entities[name]; if (!entity) return;
  const key = name + '/' + component, encoded = JSON.stringify(value);
  if (sent[key] === encoded) return;
  sent[key] = encoded;
  engine.pushCommandJson(JSON.stringify({ op: 'setComponent', entity: entity.entity, component, value }));
}
function track(s: number, x = 0, y = 0): Vec3 {
  const dx = 24 / 145 * Math.cos(s / 145) + 12 / 65 * Math.cos(s / 65), co = 1 / Math.sqrt(1 + dx * dx);
  return [24 * Math.sin(s / 145) + 12 * Math.sin(s / 65) + x * co, 1.5 + .45 * Math.sin(s / 150) + .65 * Math.sin(s / 450) + y, -s + x * dx * co];
}
function quaternion(yaw: number, pitch = 0, roll = 0): number[] {
  const a = yaw / 2, b = pitch / 2, c = roll / 2, sy = Math.sin(a), cy = Math.cos(a), sx = Math.sin(b), cx = Math.cos(b), sz = Math.sin(c), cz = Math.cos(c);
  return [cy * sx * cz + sy * cx * sz, sy * cx * cz - cy * sx * sz, cy * cx * sz - sy * sx * cz, cy * cx * cz + sy * sx * sz];
}
function move(name: string, position: number[], rotation: number[] = [0,0,0,1], scale: number[] = [1,1,1]): void { set(name, 'Transform', { position, rotation, scale }); }
function label(name: string, text: string, color?: number[]): void { set(name, 'Text', { ...authored[name]?.Text, text, ...(color ? { color } : {}) }); }
function visible(name: string, show: boolean): void {
  const rect = authored[name]?.RectTransform; if (!rect) return;
  set(name, 'RectTransform', { ...rect, anchored_position: show ? rect.anchored_position : [10000,10000] });
}
function bar(name: string, fraction: number, width: number): void {
  const rect = authored[name].RectTransform, w = Math.max(.1, width * clamp(fraction, 0, 1));
  set(name, 'RectTransform', { ...rect, size_delta: [w, rect.size_delta[1]], anchored_position: [rect.anchored_position[0] - (width - w) / 2, rect.anchored_position[1]] });
}
function sound(name: string): void { if (entities[name] && !muted) engine.playAudio(entities[name].entity); }
function announce(message: string, seconds = 2): void { toast = message; toastTime = seconds; }
function addStyle(points: number, message: string): void {
  combo = Math.min(combo + 1, 8); comboTime = 5; score += points * combo; announce(message + (combo > 1 ? '  x' + combo : ''));
}
function burst(s: number, x: number, color = 'gold'): void {
  const p = track(s,x,1.2);
  for (let i = 0; i < 12; i++) {
    const a = i * 2.39996;
    sparks.push({ p: [...p], v: [Math.cos(a)*4, 2 + (i%3), Math.sin(a)*4], life: .6 + (i%3)*.08 });
  }
  sparks = sparks.slice(-18);
}
function reset(): void {
  racers = Array.from({ length: 6 }, (_, i) => ({ s: i === 0 ? 0 : 5 + i * 3.4, x: i === 0 ? 0 : [-3.5,3.5,0,-3.5,3.5][i-1], v: 0, hp: 100, stun: 0, attack: 0, side: 1, lean: 0, finish: 0 }));
  elapsed = raceTime = score = combo = comboTime = hurt = attackCooldown = accumulator = drift = hitCount = pickups = overtakes = 0;
  countdown = 3; boost = 100; toast = ''; toastTime = 0; sparks = []; collected = []; struck = []; passed = [];
  cameraPosition = track(-9,0,4.2); cameraYaw = -.25; cameraPitch = -.23; cameraFov = 62;
  for (let i = 0; i < 32; i++) move('Pickup '+i,track(70+i*79,[-4,0,4][i%3],1));
  for (let i = 0; i < 22; i++) move('Hazard '+i,track(130+i*114,[-4,2,4,-2][i%4]));
}
function setMode(next: RaceMode): void {
  mode = next;
  const title = next === 'title', overlay = title || next === 'paused' || next === 'finished' || next === 'wrecked';
  for (const name of MENU_NAMES) visible(name, overlay);
  visible('Cover art', title);
  for (const name of HUD_NAMES) visible(name, !title && !overlay);
  if (overlay && !title) {
    label('Menu eyebrow',next === 'paused' ? 'TAKE A BREATHER' : 'SUNWASH COAST / RESULTS');
    label('Menu title',next === 'paused' ? 'PIT\nSTOP' : next === 'wrecked' ? 'RUFFLED\nFEATHERS' : rank() === 1 ? 'COAST\nCHAMPION' : 'FINISH\nSTRONG');
    label('Menu copy',next === 'paused' ? 'Your rivals can wait.\nThe coast is yours.' : `PLACE ${rank()} / 6   •   ${formatTime(raceTime)}\n${score.toString().padStart(5,'0')} STYLE POINTS`);
    label('Start label',next === 'paused' ? 'ENTER   /   RESUME' : 'ENTER   /   RACE AGAIN');
    label('Menu controls',next === 'paused' ? 'C    Change chase camera\nM    Toggle music + effects\nR    Restart race' : `${hitCount} clean hits   /   ${pickups} sardines\n${overtakes} overtakes\nFind the racing line. Chain your boosts.`);
    label('Menu footer',next === 'paused' ? 'ESC / ENTER TO RETURN TO THE ROAD' : 'R / ENTER TO TRY A NEW RUN');
  }
  if (mode === 'racing') sound('Motor'); else if (entities['Motor']) engine.pauseAudio(entities['Motor'].entity);
}
function start(): void { reset(); setMode('countdown'); sound('Music'); announce('WELCOME TO SUNWASH COAST',3); }
function rank(): number { return 1 + racers.slice(1).filter(r => racers[0].finish ? r.finish > 0 && r.finish < racers[0].finish : r.s > racers[0].s).length; }
function formatTime(t: number): string { return `${Math.floor(t/60)}:${Math.floor(t%60).toString().padStart(2,'0')}.${Math.floor(t*10)%10}`; }
function damage(amount: number, message: string): void {
  if (hurt > 0) return;
  racers[0].hp = Math.max(0,racers[0].hp-amount); racers[0].v *= .64; hurt = 1.15; combo = 0; comboTime = 0;
  announce(message); sound('Hit sound'); burst(racers[0].s,racers[0].x);
  if (racers[0].hp <= 0) setMode('wrecked');
}
function strike(side: number): void {
  if (attackCooldown > 0 || mode !== 'racing') return;
  attackCooldown = .46; const player = racers[0]; player.attack = .32; player.side = side;
  let hit = false;
  for (const rival of racers.slice(1)) {
    if (rival.stun > .3 || rival.finish) continue;
    const dx = rival.x-player.x;
    if (Math.abs(rival.s-player.s) < 4.5 && dx*side > -.35 && dx*side < 3.8) {
      rival.hp -= 40; rival.stun = rival.hp <= 0 ? 3 : .85; rival.v *= rival.hp <= 0 ? .15 : .5;
      rival.x = clamp(rival.x+side*1.3,-6.1,6.1); hit = true; hitCount++; boost = Math.min(100,boost+12);
      addStyle(rival.hp <= 0 ? 350 : 100,rival.hp <= 0 ? 'FEATHERED TAKEDOWN!' : 'WING WHACK!'); burst(rival.s,rival.x);
    }
  }
  if (hit) sound('Hit sound');
}
function onSceneLoaded(): void { initialized = false; }
function initialize(): void {
  entities = {}; authored = {}; sent = {};
  for (const entity of engine.snapshot.entities) if (entity.name) { entities[entity.name] = entity; authored[entity.name] = entity.components; }
  reset(); setMode('title'); initialized = true;
}
function simulate(dt: number, keys: string[]): void {
  const held = (...codes: string[]): boolean => codes.some(key => keys.includes(key));
  const p = racers[0], previousS = p.s;
  raceTime += dt;
  hurt = Math.max(0,hurt-dt); attackCooldown = Math.max(0,attackCooldown-dt); comboTime = Math.max(0,comboTime-dt);
  if (!comboTime) combo = 0;
  const steer = Number(held('KeyD','ArrowRight'))-Number(held('KeyA','ArrowLeft'));
  const throttle = held('KeyW','ArrowUp'), brake = held('KeyS','ArrowDown'), drifting = held('ShiftLeft','ShiftRight') && Math.abs(steer)>0 && p.v>15;
  const boosting = held('Space') && boost>1 && !brake && p.v>8;
  const limit = boosting ? 54 : drifting ? 31 : 39;
  p.v = clamp(p.v + (brake ? -32 : throttle || boosting ? 17 : p.v>14 ? -5 : 6)*dt,0,limit);
  if (Math.abs(p.x)>6.65) { p.v = damp(p.v,13,3,dt); p.hp = Math.max(0,p.hp-dt*4); if (p.hp<=0) setMode('wrecked'); }
  const curve = -(24/145/145*Math.sin(p.s/145)+12/65/65*Math.sin(p.s/65));
  p.x += (steer*(drifting ? 9 : 6.4)*(clamp(p.v/12,.2,1)) + curve*p.v*p.v*.085)*dt;
  if (Math.abs(p.x)>7.8) { p.x=clamp(p.x,-7.8,7.8); damage(12,'GUARDRAIL! Keep to the racing line.'); }
  p.lean = damp(p.lean,-steer*(drifting ? .52 : .3),9,dt); p.s += p.v*dt;
  boost = clamp(boost+(boosting ? -26 : 3.3)*dt,0,100);
  if (drifting) { drift += dt; boost=Math.min(100,boost+dt*10); }
  else if (drift>.65) { addStyle(Math.round(drift*65),'CLEAN DRIFT'); drift=0; } else drift=0;
  for (let i=1;i<racers.length;i++) {
    const r=racers[i], prior=r.s;
    r.stun=Math.max(0,r.stun-dt); r.attack=Math.max(0,r.attack-dt);
    if (r.hp<=0 && r.stun===0) { r.hp=100; }
    const difference=p.s-r.s;
    const desired=clamp(32+i*.7+difference*.023,25,43);
    r.v=damp(r.v,r.stun>0 ? (r.hp<=0 ? 4 : 16) : desired,1.6,dt);
    let target=[-4,3.5,0,-2.5,4][i-1]+Math.sin(r.s/63+i*2)*.7;
    // Rivals telegraph and seek a close pass; the line remains escapable on either side.
    if (Math.abs(difference)<7 && Math.sin(raceTime*.7+i)>.35) target=clamp(p.x+(i%2 ? -1.7 : 1.7),-5.5,5.5);
    const dx=target-r.x; r.x=damp(r.x,target,r.stun ? .3 : 1.7,dt); r.lean=damp(r.lean,clamp(-dx*.15,-.28,.28),8,dt); r.s+=r.v*dt;
    if (Math.abs(r.s-p.s)<2.5 && Math.abs(r.x-p.x)<1.25 && r.stun===0) { r.attack=.4; r.side=Math.sign(p.x-r.x)||1; damage(9,'RIVAL STRIKE! J / K to fight back.'); }
    if (!passed[i] && r.s<p.s-3) { passed[i]=true; overtakes++; addStyle(75,'CLEAN OVERTAKE'); }
    if (r.s>p.s+8) passed[i]=false;
    if (r.s>=ROAD_LENGTH && !r.finish) r.finish=raceTime;
  }
  p.attack=Math.max(0,p.attack-dt);
  for (let i=0;i<32;i++) {
    const s=70+i*79, x=[-4,0,4][i%3];
    if (!collected[i] && previousS<=s+1.8 && p.s>=s-1.8 && Math.abs(p.x-x)<1.4) {
      collected[i]=true; pickups++; boost=Math.min(100,boost+27); p.hp=Math.min(100,p.hp+8); addStyle(60,'SARDINE SNACK + NITRO'); sound('Pickup sound'); burst(s,x); move('Pickup '+i,[0,-100,0]);
    }
  }
  for (let i=0;i<22;i++) {
    const s=130+i*114, x=[-4,2,4,-2][i%4];
    if (!struck[i] && previousS<=s+1 && p.s>=s-1 && Math.abs(p.x-x)<.9) { struck[i]=true; damage(14,'ROADWORK! Watch the orange cones.'); move('Hazard '+i,track(s,x,.15),quaternion(0,1.3)); }
    else if (!struck[i] && previousS<s && p.s>=s && Math.abs(p.x-x)<2.3) { struck[i]=true; addStyle(40,'NEAR MISS'); }
  }
  if (p.s>=ROAD_LENGTH && mode==='racing') { p.finish=raceTime; p.s=ROAD_LENGTH; score+=Math.max(0,7-rank())*500; setMode('finished'); sound('Finish sound'); }
}
function present(dt: number, keys: string[]): void {
  const p=racers[0], racing=mode==='racing', boosting=racing && keys.includes('Space') && boost>1 && p.v>8;
  for (let i=0;i<racers.length;i++) {
    const r=racers[i], dx=24/145*Math.cos(r.s/145)+12/65*Math.cos(r.s/65), pos=track(r.s,r.x,.035+Math.sin(elapsed*9+i)*.015*(r.v/40));
    const tilt = r.hp<=0 ? 1.2 : r.lean;
    move('Rider '+i,pos,quaternion(-Math.atan(dx),0,tilt));
    for (const side of [-1,1]) {
      const swing=r.attack>0 && r.side===side ? Math.sin((.4-r.attack)/.4*Math.PI)*1.3 : .22;
      move(`Rider ${i} wing ${side}`,[side*.5,2.13,-.03],quaternion(0,.55,side*swing),[side,1,1]);
    }
    for (const z of [-1.15,1.05]) move(`Rider ${i} wheel ${z}`,[0,.56,z],[Math.sin(r.s/.56/2),0,0,Math.cos(r.s/.56/2)]);
  }
  const distance=cameraStyle===2 ? 1.2 : cameraStyle===1 ? 6.4 : 8, height=cameraStyle===2 ? 2.8 : cameraStyle===1 ? 3.2 : 4;
  const desired=track(p.s-distance,p.x*.7+(cameraStyle===2 ? 7.5 : 2),height+(boosting ? .25 : 0));
  for (let j=0;j<3;j++) cameraPosition[j]=damp(cameraPosition[j],desired[j],j===1 ? 5 : 8,dt);
  const target=track(p.s+(cameraStyle===2 ? 0 : 4),p.x*.7,2.2), vx=target[0]-cameraPosition[0], vy=target[1]-cameraPosition[1], vz=target[2]-cameraPosition[2];
  cameraYaw=damp(cameraYaw,-Math.atan2(vx,-vz),8,dt); cameraPitch=damp(cameraPitch,Math.atan2(vy,Math.hypot(vx,vz)),8,dt); cameraFov=damp(cameraFov,cameraStyle===2 ? 42 : 56+(p.v/54)*7+(boosting ? 6 : 0),4,dt);
  const shake=hurt>.8 ? .045*Math.sin(elapsed*72) : 0;
  move('Main Camera',[cameraPosition[0]+shake,cameraPosition[1],cameraPosition[2]],quaternion(cameraYaw,cameraPitch,p.lean*.025));
  set('Main Camera','Camera3D',{...authored['Main Camera'].Camera3D,fov_y_degrees:cameraFov});
  const coast=track(p.s);
  move('Ocean',[coast[0]-710+Math.sin(elapsed*.075)*4,-.9,-p.s+Math.sin(elapsed*.045)*4]);
  set('Ocean','MaterialPropertyBlock',{custom_parameter_names:['clock'],custom_parameter_values:[[elapsed,0,0,0]]});
  move('Sunset sky',cameraPosition,[0,0,0,1],[1000,1000,1000]);
  for (let i=0;i<32;i++) if (!collected[i]) move('Pickup '+i,track(70+i*79,[-4,0,4][i%3],1.2+Math.sin(elapsed*3+i)*.16),quaternion(elapsed*1.8));
  for (const spark of sparks) { spark.life-=dt; for(let j=0;j<3;j++) spark.p[j]+=spark.v[j]*dt; spark.v[1]-=10*dt; }
  sparks=sparks.filter(spark=>spark.life>0);
  for (let i=0;i<18;i++) move('Spark '+i,sparks[i]?.p ?? [0,-100,0],quaternion(elapsed*3,elapsed));
  if (mode==='title') return;
  if (racing || mode==='countdown') {
    label('Speed',Math.round(p.v*3.6).toString().padStart(3,'0'));
    label('Position',`${rank()} / 6`);
    label('Sector',p.s<900 ? '01  /  SUNWASH COAST' : p.s<1800 ? '02  /  SALT AIR VILLAGE' : '03  /  LIGHTHOUSE RUN');
    label('Score',`${score.toString().padStart(5,'0')}  /  STYLE`);
    label('Countdown',mode==='countdown' ? Math.ceil(countdown).toString() : raceTime<.65 ? 'GO!' : '');
    label('Toast',toastTime>0 ? toast : '');
    label('Combo',drift>.25 ? `DRIFT  +${Math.floor(drift*65)}` : combo>1 ? `STYLE CHAIN  x${combo}` : boosting ? 'FULL THROTTLE' : '');
    bar('Boost fill',boost/100,172); bar('Health fill',p.hp/100,267);
    const rect=authored['Progress rail'].RectTransform, w=Math.max(1,1216*p.s/ROAD_LENGTH);
    set('Progress fill','RectTransform',{...rect,size_delta:[w,3],anchored_position:[-608+w/2,rect.anchored_position[1]]});
  }
  if(photo) for(const name of HUD_NAMES) visible(name,false);
  const audio=engine.snapshot.entities.find(e=>e.name==='Motor')?.components.AudioSource;
  if(audio) set('Motor','AudioSource',{...audio,pitch:.65+p.v/37,volume:racing ? .18+p.v/230 : 0});
}
function onTick(dt: number): void {
  if (!initialized) initialize();
  dt=clamp(dt,0,.1);
  const input=engine.input, pressed=(key: string): boolean=>input.pressedKeys.includes(key);
  if(pressed('KeyM')) { muted=!muted; set('Audio settings','AudioMixer',{...authored['Audio settings'].AudioMixer,muted}); }
  if(pressed('KeyC')) cameraStyle=(cameraStyle+1)%3;
  if(pressed('KeyV')) { photo=!photo; for(const name of HUD_NAMES) visible(name,!photo); }
  // Overlay buttons share the same 1280x720 coordinates as the CanvasScaler.
  const scale=Math.sqrt(Math.max(1,input.viewport[0])/1280*Math.max(1,input.viewport[1])/720);
  const mouseX=(input.pointer[0]-input.viewport[0]/2)/scale+640, mouseY=(input.pointer[1]-input.viewport[1]/2)/scale+360;
  const click=input.pressedButtons.includes(0)&&mouseX>=61&&mouseX<=421&&mouseY>=462&&mouseY<=524;
  if(pressed('KeyR') && mode!=='title') { start(); return; }
  if(pressed('Escape')) {
    if(mode==='racing'||mode==='countdown') { beforePause=mode; setMode('paused'); }
    else if(mode==='paused') setMode(beforePause);
  }
  if(pressed('Enter')||click) {
    if(mode==='title'||mode==='finished'||mode==='wrecked') start();
    else if(mode==='paused') setMode(beforePause);
  }
  if(mode==='paused'||mode==='finished'||mode==='wrecked') { telemetry(); return; }
  elapsed+=dt; toastTime=Math.max(0,toastTime-dt);
  if(mode==='countdown') { countdown-=dt; if(countdown<=0) { setMode('racing'); announce('GO! Find your line.',1.5); } }
  if(mode==='racing') {
    if(pressed('KeyJ')) strike(-1); if(pressed('KeyK')) strike(1);
    if(pressed('Space') && boost>5) sound('Boost sound');
    accumulator+=dt;
    while(accumulator>=1/120 && mode==='racing') { simulate(1/120,input.keys); accumulator-=1/120; }
  }
  present(dt,input.keys); telemetry();
}
function telemetry(): void {
  set('Race telemetry','Text',{text:JSON.stringify({mode,time:raceTime,distance:racers[0].s,lane:racers[0].x,speed:racers[0].v,health:racers[0].hp,boost,rank:rank(),score,hits:hitCount,pickups,overtakes,combo,drift,rivals:racers.slice(1).map(r=>({s:r.s,x:r.x,hp:r.hp,stun:r.stun})),muted,cameraStyle}),enabled:false});
}
