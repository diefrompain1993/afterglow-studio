export class LiveEngine {
  constructor(context,onPosition){this.context=context;this.onPosition=onPosition;this.position=0;this.playing=false;this.duration=0;this.room=-1;this.wetNodes=[];this.roomTimer=null;}
  async init(){
    const c=this.context;
    await c.audioWorklet.addModule(new URL('./live-processor.js',import.meta.url));
    this.node=new AudioWorkletNode(c,'afterglow-player',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
    this.bass=c.createBiquadFilter();this.bass.type='lowshelf';this.bass.frequency.value=110;
    this.dry=c.createGain();this.wet=c.createGain();this.master=c.createGain();
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=3;this.limiter.ratio.value=20;this.limiter.attack.value=.003;this.limiter.release.value=.15;
    this.node.connect(this.bass);this.bass.connect(this.dry);this.dry.connect(this.limiter);this.wet.connect(this.limiter);this.limiter.connect(this.master);this.master.connect(c.destination);this.master.gain.value=.8;
    this.analyser=c.createAnalyser();this.analyser.fftSize=256;this.master.connect(this.analyser);
    this.node.port.onmessage=({data:d})=>{if(d.type==='position'){this.position=d.seconds;this.playing=d.playing;this.onPosition(d);}};
    this.node.onprocessorerror=()=>{this.playing=false;this.onPosition({error:'Аудиодвижок остановился. Перезагрузи страницу и снова выбери трек.'});};
  }
  load(buffer){this.pause();this.position=0;this.duration=buffer.duration;this.node.port.postMessage({type:'load',channels:Array.from({length:2},(_,i)=>buffer.getChannelData(Math.min(i,buffer.numberOfChannels-1)))});}
  settings(s){
    this.node.port.postMessage({type:'settings',settings:s});const now=this.context.currentTime;
    this.bass.gain.setTargetAtTime(s.bass,now,.015);this.dry.gain.setTargetAtTime(1-s.reverb/100*.35,now,.015);this.wet.gain.setTargetAtTime(s.reverb/100*1.6,now,.015);
    if(s.room!==this.room){clearTimeout(this.roomTimer);this.roomTimer=setTimeout(()=>this.setRoom(s.room),60);}
  }
  setRoom(seconds){
    this.room=seconds;const c=this.context,impulse=c.createBuffer(2,Math.ceil(seconds*c.sampleRate),c.sampleRate);let seed=731;
    for(let channel=0;channel<2;channel++){const data=impulse.getChannelData(channel);for(let i=0;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.pow(1-i/data.length,2.5);}}
    const conv=c.createConvolver(),gain=c.createGain();conv.buffer=impulse;gain.gain.value=0;this.bass.connect(conv);conv.connect(gain);gain.connect(this.wet);gain.gain.setTargetAtTime(1,c.currentTime,.03);
    for(const old of this.wetNodes){old.gain.gain.setTargetAtTime(0,c.currentTime,.03);setTimeout(()=>{this.bass.disconnect(old.conv);old.conv.disconnect();old.gain.disconnect();},200);}
    this.wetNodes=[{conv,gain}];
  }
  async play(){await this.context.resume();this.playing=true;this.node.port.postMessage({type:'play'});}
  pause(){if(this.node)this.node.port.postMessage({type:'pause'});this.playing=false;}
  seek(seconds){this.position=seconds;this.node.port.postMessage({type:'seek',seconds});}
  loop(value){this.node.port.postMessage({type:'loop',value});}
  volume(value){this.master.gain.setTargetAtTime(value,this.context.currentTime,.015);}
}
