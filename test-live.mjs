import assert from 'node:assert/strict';
globalThis.sampleRate=44100;
globalThis.AudioWorkletProcessor=class{constructor(){this.port={postMessage:()=>{},onmessage:null};}};
let Processor;globalThis.registerProcessor=(_,klass)=>Processor=klass;
await import('./public/live-processor.js');
const sr=44100,input=new Float32Array(sr*6);
for(let i=0;i<input.length;i++)input[i]=.3*Math.sin(2*Math.PI*440*i/sr);
function create(speed,pitch){const p=new Processor();send(p,{type:'load',channels:[input,input]});send(p,{type:'settings',settings:{speed,pitch,start:0,end:6,fadein:0,fadeout:0}});send(p,{type:'play'});return p;}
function send(p,data){p.port.onmessage({data});}
function read(p,seconds){const chunks=[];for(let i=0;i<Math.ceil(seconds*sr/128);i++){const out=[new Float32Array(128),new Float32Array(128)];p.process([], [out]);chunks.push(...out[0]);}return Float32Array.from(chunks);}
function frequency(data){let crossings=0;const start=Math.floor(data.length*.3),end=data.length-1;for(let i=start+1;i<end;i++)if(data[i-1]<=0&&data[i]>0)crossings++;return crossings/((end-start)/sr);}
function audible(data){assert(data.every(Number.isFinite));assert(data.some(x=>Math.abs(x)>.05));}
const p=create(.5,0),first=read(p,1);audible(first);assert(Math.abs(frequency(first)-440)<8);assert(Math.abs(p.position/sr-.5)<.01);
const before=p.position;send(p,{type:'settings',settings:{speed:1.5,pitch:12}});assert.equal(p.position,before);
const changed=read(p,1);audible(changed);assert(Math.abs(frequency(changed)-880)<12);assert(Math.abs(p.position/sr-2)<.02);
send(p,{type:'pause'});const pos=p.position;assert(read(p,.1).every(x=>x===0));assert.equal(p.position,pos);
send(p,{type:'seek',seconds:4});send(p,{type:'play'});audible(read(p,.1));assert(p.position>4*sr);
send(p,{type:'settings',settings:{start:1,end:2,speed:1,pitch:0}});send(p,{type:'loop',value:true});read(p,2.3);assert(p.playing);assert(p.position>=sr&&p.position<=2*sr);
send(p,{type:'loop',value:false});read(p,2);assert(!p.playing);
console.log('PASS: audible finite output; independent tempo/pitch; live updates preserve position; pause; seek; trim; loop; end.');
