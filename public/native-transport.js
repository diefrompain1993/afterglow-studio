// Tape-style speed: let the browser resample a continuous source, without grains.
export class NativeTransport {
  constructor(context,destination,onPosition){this.c=context;this.destination=destination;this.onPosition=onPosition;this.buffer=null;this.playing=false;this.position=0;this.looping=false;this.s={speed:1,start:0,end:0,fadein:0,fadeout:0};this.generation=0;this.timer=setInterval(()=>this.tick(),50);}
  load(buffer){this.pause();this.buffer=buffer;this.position=0;this.s.end=buffer.duration;}
  current(){if(!this.playing)return this.position;let p=this.position+(this.c.currentTime-this.started)*this.s.speed;const length=this.s.end-this.s.start;if(this.looping&&length>0)p=this.s.start+((p-this.s.start)%length+length)%length;return Math.min(this.s.end,Math.max(this.s.start,p));}
  report(){this.onPosition({seconds:this.current(),playing:this.playing});}
  tick(){if(!this.playing)return;const p=this.current(),elapsed=(p-this.s.start)/this.s.speed,remaining=(this.s.end-p)/this.s.speed;let gain=1;if(this.s.fadein)gain*=Math.min(1,elapsed/this.s.fadein);if(this.s.fadeout)gain*=Math.min(1,remaining/this.s.fadeout);this.fade?.gain.setTargetAtTime(Math.max(0,gain),this.c.currentTime,.012);this.report();}
  settings(next){const p=this.current(),old=this.s;this.position=p;this.started=this.c.currentTime;this.s={...this.s,...next};if(this.position<this.s.start||this.position>=this.s.end)this.position=this.s.start;
    if(this.source){if(old.start!==this.s.start||old.end!==this.s.end){this.restart();return;}this.source.playbackRate.setTargetAtTime(this.s.speed,this.c.currentTime,.012);this.source.loopStart=this.s.start;this.source.loopEnd=this.s.end;}
  }
  stopSource(){this.generation++;if(this.source){const source=this.source,fade=this.fade;fade.gain.cancelScheduledValues(this.c.currentTime);fade.gain.setTargetAtTime(0,this.c.currentTime,.003);source.onended=null;try{source.stop(this.c.currentTime+.015);}catch{}setTimeout(()=>{source.disconnect();fade.disconnect();},50);this.source=null;}}
  restart(){this.stopSource();if(!this.buffer||!this.playing)return;const c=this.c,source=c.createBufferSource(),fade=c.createGain(),generation=this.generation;source.buffer=this.buffer;source.playbackRate.value=this.s.speed;source.loop=this.looping;source.loopStart=this.s.start;source.loopEnd=this.s.end;fade.gain.value=0;fade.gain.setTargetAtTime(1,c.currentTime,.005);source.connect(fade);fade.connect(this.destination);this.source=source;this.fade=fade;this.started=c.currentTime;
    source.onended=()=>{if(generation!==this.generation)return;this.position=this.s.end;this.playing=false;this.source=null;source.disconnect();fade.disconnect();this.report();};
    if(this.looping)source.start(c.currentTime,this.position);else source.start(c.currentTime,this.position,Math.max(.0001,this.s.end-this.position));
  }
  play(){if(this.position>=this.s.end)this.position=this.s.start;this.playing=true;this.restart();this.report();}
  pause(){this.position=this.current();this.playing=false;this.stopSource();this.report();}
  seek(seconds){this.position=Math.max(this.s.start,Math.min(seconds,this.s.end));if(this.playing)this.restart();this.report();}
  loop(value){this.position=this.current();this.looping=value;if(this.playing)this.restart();}
}
