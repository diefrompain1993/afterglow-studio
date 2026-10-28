export function impulse(context,seconds){
  const buffer=context.createBuffer(2,Math.ceil(seconds*context.sampleRate),context.sampleRate);let seed=731;const pre=Math.round(.01*context.sampleRate);
  for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=pre;i<data.length;i++){seed=(seed*1664525+1013904223)>>>0;data[i]=(seed/4294967296*2-1)*Math.exp(-11.5129*(i-pre)/Math.max(1,data.length-pre));}}
  return buffer;
}
export function mix(wet){return {dry:Math.cos(wet*Math.PI/2),wet:Math.sin(wet*Math.PI/2)};}
export function bassStage(c){
  const input=c.createGain(),output=c.createGain(),dry=c.createGain(),processed=c.createGain(),low=c.createBiquadFilter(),high=c.createBiquadFilter(),midLow=c.createBiquadFilter(),midHigh=c.createBiquadFilter(),gain=c.createGain();
  low.type='lowpass';low.frequency.value=160;midHigh.type='highpass';midHigh.frequency.value=160;midLow.type='lowpass';midLow.frequency.value=2500;high.type='highpass';high.frequency.value=2500;
  input.connect(dry);dry.connect(output);input.connect(low);low.connect(gain);gain.connect(processed);input.connect(midHigh);midHigh.connect(midLow);midLow.connect(processed);input.connect(high);high.connect(processed);processed.connect(output);
  function set(db,smooth=true){const t=c.currentTime;for(const [param,value] of [[gain.gain,10**(db/20)],[dry.gain,db===0?1:0],[processed.gain,db===0?0:1]]){if(smooth)param.setTargetAtTime(value,t,.015);else param.value=value;}}
  set(0,false);return {input,output,set};
}
