// Author: MiYu. Bind original option frames only to implemented client capabilities.
import fs from 'node:fs';
export const WARCRAFT_OPTION_BINDINGS={
  MouseScrollSlider:{key:'mouseScroll',disabledBy:'mouseScrollDisabled'},KeyScrollSlider:{key:'keyScroll'},
  MouseScrollDisableCheckBox:{key:'mouseScrollDisabled'},TooltipsCheckBox:{key:'tooltips'},HealthBarsCheckBox:{key:'healthBars'},
  SoundCheckBox:{key:'sfxEnabled'},MusicCheckBox:{key:'musicEnabled'},
  SoundVolumeSlider:{key:'sfx',enabledBy:'sfxEnabled'},MusicVolumeSlider:{key:'music',enabledBy:'musicEnabled'}
};
export const optionId=name=>'option'+name;
export const optionNode=name=>'Warcraft option '+name;
export const optionPage=page=>'Warcraft options '+page;
export function warcraftOptions(){const {pages}=JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/warcraft-options-layout.json',import.meta.url),'utf8'));return {pages,bindings:WARCRAFT_OPTION_BINDINGS};}
