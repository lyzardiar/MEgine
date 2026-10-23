// Author: MiYu. Original LAN browser frame bindings and generated source layout.
import fs from 'node:fs';
export const LAN_BUTTONS={CreateButton:'lanCreate',LoadButton:'lanLoad',JoinButton:'lanJoin',CancelButton:'lanCancel'};
export const lanNode=name=>'Warcraft LAN '+name;
export function warcraftLan(){return JSON.parse(fs.readFileSync(new URL('../samples/frostbound-realms/warcraft-lan-layout.json',import.meta.url),'utf8'));}
