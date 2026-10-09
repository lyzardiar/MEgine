// Author: MiYu. Original Chain Lightning textures and source parameters on the shared ribbon geometry.
import fs from 'node:fs';
import path from 'node:path';
export function buildFarseerLightning(root,rules){
 const source=fs.readFileSync(new URL('../samples/frostbound-realms/Assets/Shaders/BloodMageLightning.mshader',import.meta.url),'utf8').replace(/\r\n/g,'\n');fs.mkdirSync(path.join(root,'Assets/Shaders'),{recursive:true});
 for(const [id,rule] of Object.entries(rules)){
  const name='FarseerLightning'+id,shader='Assets/Shaders/'+name+'.mshader',material='Assets/Materials/'+name+'.mmat';
  fs.writeFileSync(path.join(root,shader),source.replace('// Author: MiYu. Animated mana-drain texture with source signed UV scale and bounded noise.','// Author: MiYu. Original '+id+' Chain Lightning texture with source UV and noise parameters.').replaceAll('Assets/BloodMage/Lightning/DrainManaLightning.png',rule.texture));
  fs.writeFileSync(path.join(root,material),JSON.stringify({version:8,name:'Far Seer '+id+' lightning',shader:'custom',custom_shader:shader,surface:'transparent',blend_mode:'additive',base_color:[Number(rule.R)/255,Number(rule.G)/255,Number(rule.B)/255,Number(rule.A)/255],base_color_texture:rule.texture,double_sided:true,transparent_depth_write:false,render_queue:3000,wrap_u:'repeat',wrap_v:'clamp'},null,2)+'\n');
 }
}
