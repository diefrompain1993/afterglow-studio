import assert from 'node:assert/strict';
import {BackgroundPlayer} from './public/background-player.js';
const handlers={};
Object.defineProperty(globalThis,'navigator',{value:{mediaSession:{setActionHandler:(k,v)=>handlers[k]=v,setPositionState:s=>{globalThis.reported=s;}},audioSession:{}},configurable:true});
globalThis.MediaMetadata=class{constructor(data){Object.assign(this,data);}};
class Audio extends EventTarget{
 paused=true;ended=false;duration=42;currentTime=0;
 play(){this.paused=false;this.dispatchEvent(new Event('play'));return Promise.resolve();}
 pause(){this.paused=true;this.dispatchEvent(new Event('pause'));}
 load(){} removeAttribute(){}
}
const audio=new Audio();let livePaused=0;
const p=new BackgroundPlayer(audio,()=>livePaused++,()=>{});
p.load(new Blob(['encoded']),{start:10,end:20,speed:.25},'Test',true,.8,12);
audio.onloadedmetadata();assert.equal(audio.currentTime,8);assert.equal(p.position,12);
await p.play();assert.equal(livePaused,1);assert.equal(navigator.audioSession.type,'playback');assert.equal(reported.playbackRate,1);
handlers.seekforward({seekOffset:10});assert.equal(audio.currentTime,18);assert.equal(p.position,14.5);
handlers.seekto({seekTime:100});assert.equal(audio.currentTime,42);assert.equal(p.position,20);
handlers.pause();assert.equal(p.playing,false);assert.equal(navigator.mediaSession.playbackState,'paused');
p.clear();assert.equal(p.active,false);assert.equal(p.url,null);assert.equal(handlers.play,null);
console.log('PASS: native media playback; source/rendered time mapping at 0.25x; lock-screen controls; pause; cleanup.');
