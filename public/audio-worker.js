importScripts('vendor/lame.min.js');
self.onmessage=async({data:d})=>{try{
 if(d.type==='stretch'){
  const {SoundTouch,SimpleFilter}=await import('./vendor/soundtouch.js');
  const st=new SoundTouch();st.tempo=d.speed;st.pitchSemitones=d.pitch;
  const left=d.channels[0],right=d.channels[1]||left, size=left.length;
  const source={extract(target,n,pos){const available=Math.max(0,Math.min(n,size+32768-pos));for(let i=0;i<available;i++){target[i*2]=left[pos+i]||0;target[i*2+1]=right[pos+i]||0;}return available;}};
  const filter=new SimpleFilter(source,st),length=Math.ceil(size/d.speed),l=new Float32Array(length),r=new Float32Array(length),block=new Float32Array(8192);
  let offset=0;while(offset<length){const n=filter.extract(block,Math.min(4096,length-offset));if(!n)break;for(let i=0;i<n;i++){l[offset+i]=block[i*2];r[offset+i]=block[i*2+1];}offset+=n;}
  self.postMessage({channels:[l,r]},[l.buffer,r.buffer]);
 }else{
  const encoder=new lamejs.Mp3Encoder(2,d.sampleRate,320),chunks=[],[left,right]=d.channels;
  for(let i=0;i<left.length;i+=1152){const len=Math.min(1152,left.length-i),l=new Int16Array(len),r=new Int16Array(len);for(let j=0;j<len;j++){l[j]=Math.max(-1,Math.min(1,left[i+j]))*32767;r[j]=Math.max(-1,Math.min(1,right[i+j]))*32767;}const bytes=encoder.encodeBuffer(l,r);if(bytes.length)chunks.push(new Int8Array(bytes));}
  chunks.push(new Int8Array(encoder.flush()));self.postMessage({blob:new Blob(chunks,{type:'audio/mpeg'})});
 }
}catch(e){self.postMessage({error:e.message});}};
