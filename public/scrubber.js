// Pointer capture keeps dragging active even when a finger leaves the waveform.
export function attachScrubber(element,{duration,bounds,position,preview,commit,start,end}){
  let pointer=null,seconds=0,frame=0;
  function fromX(x){const rect=element.getBoundingClientRect(),[low,high]=bounds();return Math.max(low,Math.min(high,(x-rect.left)/rect.width*duration()));}
  function move(event){seconds=fromX(event.clientX);preview(seconds);if(!frame)frame=requestAnimationFrame(()=>{frame=0;commit(seconds);});}
  element.addEventListener('pointerdown',event=>{if(!duration()||pointer!==null||event.button>0)return;event.preventDefault();pointer=event.pointerId;element.setPointerCapture(pointer);element.classList.add('scrubbing');start();move(event);});
  element.addEventListener('pointermove',event=>{if(event.pointerId===pointer){event.preventDefault();move(event);}});
  function finish(event){if(event.pointerId!==pointer)return;if(event.type==='pointerup')move(event);if(frame){cancelAnimationFrame(frame);frame=0;}commit(seconds);const id=pointer;pointer=null;if(element.hasPointerCapture(id))element.releasePointerCapture(id);element.classList.remove('scrubbing');end(seconds);}
  for(const type of ['pointerup','pointercancel','lostpointercapture'])element.addEventListener(type,finish);
  element.addEventListener('keydown',event=>{if(!duration())return;const [low,high]=bounds();let next=position();if(event.key==='ArrowLeft')next-=event.shiftKey?10:5;else if(event.key==='ArrowRight')next+=event.shiftKey?10:5;else if(event.key==='Home')next=low;else if(event.key==='End')next=high;else return;event.preventDefault();seconds=Math.max(low,Math.min(high,next));preview(seconds);commit(seconds);});
}
