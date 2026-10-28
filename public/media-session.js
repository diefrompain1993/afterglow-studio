// Keep the live DSP graph: no rendered mix, silent track or visibility-time swap.
export function requestPlaybackSession(nav=navigator){
 try{if(nav.audioSession){nav.audioSession.type='playback';return nav.audioSession.type==='playback';}}catch{}
 return false;
}
export function attachMediaSession({getState,play,pause,seek},nav=navigator){
 const session=nav.mediaSession;if(!session)return {update(){},clear(){}};
 const handlers={play:()=>Promise.resolve(play()).catch(()=>{}),pause,stop:()=>{pause();seek(getState().start);},seekto:e=>seek(getState().start+e.seekTime*getState().speed),seekbackward:e=>seek(getState().position-(e.seekOffset||10)*getState().speed),seekforward:e=>seek(getState().position+(e.seekOffset||10)*getState().speed)};
 let title='',lastPositionUpdate=0;
 for(const [name,handler] of Object.entries(handlers))try{session.setActionHandler(name,handler);}catch{}
 return {
  update(force=false){
   const s=getState();if(!s)return;
   try{
    session.playbackState=s.playing?'playing':'paused';
    if(title!==s.title){title=s.title;if(typeof MediaMetadata!=='undefined')session.metadata=new MediaMetadata({title,artist:'afterglow / live sound',album:'slowed + reverb'});}
    if(force||Date.now()-lastPositionUpdate>1000){
     const duration=(s.end-s.start)/s.speed;
     if(duration>0)session.setPositionState({duration,position:Math.max(0,Math.min(duration,(s.position-s.start)/s.speed)),playbackRate:1});
     lastPositionUpdate=Date.now();
    }
   }catch{}
  },
  clear(){for(const name of Object.keys(handlers))try{session.setActionHandler(name,null);}catch{}try{session.playbackState='none';session.metadata=null;session.setPositionState();}catch{}}
 };
}
