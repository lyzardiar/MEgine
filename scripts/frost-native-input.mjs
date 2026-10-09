// Author: MiYu. Preserve press and release frame boundaries in one native playback request.
export const nativeKeyPhases=(key,deltaTime=.001)=>[{input:{keys:[key],viewport:[1280,720]},deltaTime},{input:{keys:[]},deltaTime}];
export const nativePointPhases=(pointer,deltaTime=.001)=>[{input:{pointer,viewport:[1280,720],buttons:[0]},deltaTime},{input:{buttons:[]},deltaTime}];
