import {requestPlaybackSession} from './media-session.js?v=7';
import {NativeTransport} from './native-transport.js';
import {impulse,mix,bassStage} from './audio-effects.js';
export class LiveEngine {
  constructor(context,onPosition){this.context=context;this.onPosition=onPosition;this.position=0;this.playing=false;this.duration=0;this.room=-1;this.wetNodes=[];this.roomTimer=null;}
  async init(){
    const c=this.context;
    await c.audioWorklet.addModule(new URL('./live-processor.js',import.meta.url));
    this.node=new AudioWorkletNode(c,'afterglow-player',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    this.bassStage=bassStage(c);this.bass=this.bassStage.output;
    this.dry=c.createGain();this.wet=c.createGain();this.master=c.createGain();
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=3;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15;
    this.node.connect(this.bassStage.input);this.bass.connect(this.dry);this.dry.connect(this.limiter);this.wet.connect(this.limiter);this.limiter.connect(this.master);this.master.connect(c.destination);this.master.gain.value=.8;
    this.native=new NativeTransport(c,this.bassStage.input,d=>{if(this.linked){this.position=d.seconds;this.playing=d.playing;this.onPosition(d);}});
    this.analyser=c.createAnalyser();this.analyser.fftSize=256;this.master.connect(this.analyser);
    this.node.port.onmessage=({data:d})=>{if(d.type==='position'&&!this.linked){this.position=d.seconds;this.playing=d.playing;this.onPosition(d);}};
    this.node.onprocessorerror=()=>{this.playing=false;this.onPosition({error:'Аудиодвижок остановился. Перезагрузи страницу и снова выбери трек.'});};
  }
  load(buffer){this.pause();this.position=0;this.duration=buffer.duration;this.native.load(buffer);this.node.port.postMessage({type:'load',channels:Array.from({length:2},(_,i)=>buffer.getChannelData(Math.min(i,buffer.numberOfChannels-1)))});}
  settings(s){
    const changed=this.linked!==s.linked,wasPlaying=this.playing,position=this.position;
    if(changed)this.pause();this.linked=s.linked;
    this.node.port.postMessage({type:'settings',settings:s});this.native.settings(s);
    if(changed){this.seek(position);if(wasPlaying)this.play();}
    const now=this.context.currentTime,gains=mix(s.reverb/100);
    this.bassStage.set(s.bass);this.dry.gain.setTargetAtTime(gains.dry,now,.015);this.wet.gain.setTargetAtTime(gains.wet,now,.015);
    if(s.room!==this.room){clearTimeout(this.roomTimer);this.roomTimer=setTimeout(()=>this.setRoom(s.room),60);}
  }
  setRoom(seconds){
    this.room=seconds;const c=this.context;
    const conv=c.createConvolver(),gain=c.createGain();conv.buffer=impulse(c,seconds);gain.gain.value=0;this.bass.connect(conv);conv.connect(gain);gain.connect(this.wet);gain.gain.setTargetAtTime(1,c.currentTime,.03);
    for(const old of this.wetNodes){old.gain.gain.setTargetAtTime(0,c.currentTime,.03);setTimeout(()=>{this.bass.disconnect(old.conv);old.conv.disconnect();old.gain.disconnect();},200);}
    this.wetNodes=[{conv,gain}];
  }
  async play(){requestPlaybackSession();await this.context.resume();this.playing=true;if(this.linked)this.native.play();else this.node.port.postMessage({type:'play'});}
  pause(){if(this.node)this.node.port.postMessage({type:'pause'});this.native?.pause();this.playing=false;}
  seek(seconds){this.position=seconds;if(this.linked)this.native.seek(seconds);else this.node.port.postMessage({type:'seek',seconds});}
  loop(value){this.node.port.postMessage({type:'loop',value});this.native.loop(value);}
  volume(value){this.master.gain.setTargetAtTime(value,this.context.currentTime,.015);}
}
