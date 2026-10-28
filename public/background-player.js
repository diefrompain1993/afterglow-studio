// Rendered audio must go directly to the native media player, never through Web Audio.
export class BackgroundPlayer {
 constructor(audio,beforePlay,update){
  this.audio=audio;this.active=false;this.url=null;this.update=update;
  audio.addEventListener('play',()=>{beforePlay();this.session();update();});
  for(const event of ['pause','ended','timeupdate','loadedmetadata','seeked'])audio.addEventListener(event,()=>{this.session();update();});
  audio.addEventListener('error',()=>update({error:'Фоновый плеер не смог прочитать микс. Подготовь его ещё раз.'}));
 }
 get playing(){return !this.audio.paused&&!this.audio.ended;}
 get position(){return Math.min(this.settings.end,this.settings.start+this.audio.currentTime*this.settings.speed);}
 load(blob,settings,title,loop,volume,position){
  this.clear();this.settings={...settings};this.active=true;
  this.url=URL.createObjectURL(blob);this.audio.src=this.url;
  this.audio.loop=loop;this.audio.volume=volume;
  this.audio.onloadedmetadata=()=>this.seek(position);
  this.audio.load();
  try{if('audioSession' in navigator)navigator.audioSession.type='playback';}catch{}
  if('mediaSession' in navigator){
   try{navigator.mediaSession.metadata=new MediaMetadata({title,artist:'Afterglow',album:'Микс со всеми эффектами'});}catch{}
   const actions={play:()=>this.play().catch(()=>this.update({error:'Нажми ▶ на сайте, чтобы продолжить.'})),pause:()=>this.pause(),seekto:e=>this.seekMedia(e.seekTime),seekbackward:e=>this.seekMedia(this.audio.currentTime-(e.seekOffset||10)),seekforward:e=>this.seekMedia(this.audio.currentTime+(e.seekOffset||10))};
   for(const [name,handler] of Object.entries(actions))try{navigator.mediaSession.setActionHandler(name,handler);}catch{}
  }
 }
 play(){return this.audio.play();}
 pause(){this.audio.pause();}
 seek(seconds){this.seekMedia((seconds-this.settings.start)/this.settings.speed);}
 seekMedia(seconds){if(Number.isFinite(this.audio.duration)&&Number.isFinite(seconds))this.audio.currentTime=Math.max(0,Math.min(this.audio.duration,seconds));}
 session(){
  if(!this.active||!('mediaSession' in navigator))return;
  try{navigator.mediaSession.playbackState=this.playing?'playing':'paused';
   if(this.audio.duration>0&&Number.isFinite(this.audio.duration))navigator.mediaSession.setPositionState({duration:this.audio.duration,playbackRate:1,position:Math.min(this.audio.duration,this.audio.currentTime)});
  }catch{}
 }
 clear(){
  this.active=false;this.audio.pause();this.audio.onloadedmetadata=null;
  this.audio.removeAttribute('src');this.audio.load();
  if(this.url)URL.revokeObjectURL(this.url);this.url=null;
  if('mediaSession' in navigator){try{navigator.mediaSession.playbackState='none';navigator.mediaSession.metadata=null;navigator.mediaSession.setPositionState();}catch{}
   for(const name of ['play','pause','seekto','seekbackward','seekforward'])try{navigator.mediaSession.setActionHandler(name,null);}catch{}
  }
 }
}
