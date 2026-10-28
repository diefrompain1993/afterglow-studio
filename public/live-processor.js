import {SoundTouch} from './vendor/soundtouch.js';

// All time/pitch processing runs on the audio thread, independent of UI/export work.
class AfterglowProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.channels=null;this.playing=false;this.loop=false;this.position=0;
    this.s={speed:1,pitch:0,start:0,end:0,fadein:0,fadeout:0};
    this.samples=new Float32Array(4096);this.output=new Float32Array(256);
    this.frames=0;this.ramp=0;
    this.port.onmessage=({data:d})=>{
      if(d.type==='load'){this.channels=d.channels;this.s.end=d.channels[0].length/sampleRate;this.position=0;this.reset();}
      if(d.type==='settings'){
        const changed=d.settings.speed!==this.s.speed||d.settings.pitch!==this.s.pitch;
        this.s={...this.s,...d.settings};
        const start=this.s.start*sampleRate,end=this.s.end*sampleRate;
        if(this.position<start||this.position>=end){this.position=start;this.reset();}
        else if(changed)this.reset();
      }
      if(d.type==='play'){if(this.position>=this.s.end*sampleRate)this.position=this.s.start*sampleRate;this.reset();this.playing=true;}
      if(d.type==='pause')this.playing=false;
      if(d.type==='seek'){this.position=Math.max(this.s.start*sampleRate,Math.min(d.seconds*sampleRate,this.s.end*sampleRate));this.reset();this.report();}
      if(d.type==='loop')this.loop=d.value;
    };
  }
  reset(){this.pipe=new SoundTouch();this.pipe.tempo=this.s.speed;this.pipe.pitchSemitones=this.s.pitch;this.readPosition=Math.floor(this.position);this.ramp=0;}
  report(){this.port.postMessage({type:'position',seconds:this.position/sampleRate,playing:this.playing});}
  process(inputs,outputs){
    const [left,right]=outputs[0];if(!left||!this.channels||!this.playing)return true;
    const n=left.length,limit=this.s.end*sampleRate;
    if(this.position>=limit){
      if(this.loop){this.position=this.s.start*sampleRate;this.reset();}
      else{this.playing=false;this.report();return true;}
    }
    // SoundTouch needs a small lookahead. Zero-pad it so the last samples survive.
    let rounds=0;
    while(this.pipe.outputBuffer.frameCount<n&&rounds++<32){
      for(let i=0;i<2048;i++){const p=this.readPosition+i;this.samples[i*2]=p<limit?(this.channels[0][p]||0):0;this.samples[i*2+1]=p<limit?((this.channels[1]||this.channels[0])[p]||0):0;}
      this.readPosition+=2048;this.pipe.inputBuffer.putSamples(this.samples,0,2048);this.pipe.process();
    }
    const available=Math.min(n,this.pipe.outputBuffer.frameCount);
    this.pipe.outputBuffer.extract(this.output,0,available);this.pipe.outputBuffer.receive(available);
    for(let i=0;i<available;i++){
      const position=this.position+i*this.s.speed;
      const elapsed=(position/sampleRate-this.s.start)/this.s.speed,remaining=(this.s.end-position/sampleRate)/this.s.speed;
      let gain=Math.min(1,this.ramp++/256);
      if(this.s.fadein>0)gain*=Math.min(1,Math.max(0,elapsed/this.s.fadein));
      if(this.s.fadeout>0)gain*=Math.min(1,Math.max(0,remaining/this.s.fadeout));
      if(position>=limit)gain=0;
      left[i]=this.output[i*2]*gain;if(right)right[i]=this.output[i*2+1]*gain;
    }
    this.position=Math.min(limit,this.position+n*this.s.speed);
    if((this.frames+=n)>=2048){this.frames=0;this.report();}
    return true;
  }
}
registerProcessor('afterglow-player',AfterglowProcessor);
