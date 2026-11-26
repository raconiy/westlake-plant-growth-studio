import {RoseRenderer} from './rose-renderer.js';

const el=id=>document.getElementById(id);
const canvas=el('rose'),play=el('play'),bloom=el('bloom'),status=el('status');
const keys=new Set(),pointers=new Map(),pad=[...document.querySelectorAll('[data-key]')];
const names={left:'Orbit left',right:'Orbit right',up:'Move closer',down:'Pull back'};
const clamp=(v,lo,hi)=>Math.min(hi,Math.max(lo,v));
const base='./media/rose-camera-v1/';
let meta,renderer,shown,target,pending=false,ready=false,stopped=false,playing=false;
let lastTime=0,frame=0,lastPrefetch=0,waitingSince=0,drag=null,pinch=null;
let minStage,maxStage,minYaw,maxYaw;

function message(text) {
  if(status.textContent!==text)status.textContent=text;
  status.hidden=!text;
}
function failure(text='Camera assets could not load.'){
  if(stopped)return;stopped=true;playing=false;
  message(text);el('retry').hidden=false;play.disabled=true;bloom.disabled=true;
  pad.forEach(b=>b.disabled=true);el('reset').disabled=true;clearInput();
}
function setPlaying(value){playing=value;play.textContent=value?'Pause growth':'Play growth';}
function normalized(p){
  return {yaw:clamp(p.yaw,minYaw,maxYaw),zoom:clamp(p.zoom,meta.minZoom,meta.maxZoom),stage:clamp(p.stage,minStage,maxStage)};
}
function seek(p){if(!renderer||stopped)return;target=normalized(p);pending=true;}
function updateReadout(){
  const fraction=(shown.stage-minStage)/(maxStage-minStage);
  if(document.activeElement!==bloom || !pending)bloom.value=String(Math.round(fraction*1000));
  el('percent').textContent=Math.round(100*fraction)+'%';
  el('pose').textContent=shown.yaw.toFixed(1).replace('-','−')+'° · '+(meta.initial.zoom/shown.zoom).toFixed(2)+'×';
}
function keyFeedback(){
  pad.forEach(b=>b.classList.toggle('held',keys.has(b.dataset.key)));
  const action=[...keys].map(k=>names[k]).filter(Boolean).join(' · ');
  el('action').textContent=action || (drag?'Orbit camera':pinch?'Change distance':'Camera still');
}
function nudge(origin,dt,direction=keys){
  return normalized({...origin,
    yaw:origin.yaw+21*dt*(Number(direction.has('right'))-Number(direction.has('left'))),
    zoom:origin.zoom+.16*dt*(Number(direction.has('down'))-Number(direction.has('up')))});
}
function prefetch(t){
  if(t-lastPrefetch<95)return;lastPrefetch=t;
  const pose=pending?target:shown,forecast=[];
  for(const dt of [.19,.40,.68]){
    const p=nudge(pose,dt);if(playing)p.stage+=dt*1.16;
    forecast.push(normalized(p));
  }
  for(const sign of [-1,1])
    forecast.push(normalized({...pose,yaw:pose.yaw+sign*(keys.size?2.5:4.5)}));
  if(playing)forecast.push(normalized({...pose,stage:pose.stage+.92}));
  renderer.prefetch(forecast);
}
function tick(time) {
  if(stopped || document.hidden)return;
  const dt=lastTime?Math.min((time-lastTime)/1000,.045):0;lastTime=time;
  let wanted=pending?{...target}:nudge(shown,dt);
  if(ready && playing && (!pending || wanted.stage===shown.stage))wanted.stage=Math.min(maxStage,shown.stage+1.16*dt);
  const changed=!ready || wanted.yaw!==shown.yaw || wanted.zoom!==shown.zoom || wanted.stage!==shown.stage;
  if(changed){
    if(renderer.prepare(wanted)){
      renderer.draw(wanted);shown={...wanted};target=shown;pending=false;
      if(!ready){ready=true;canvas.classList.add('ready');el('poster').hidden=true;play.disabled=false;bloom.disabled=false;}
      if(shown.stage>=maxStage)setPlaying(false);
      updateReadout();waitingSince=0;message('');
    }else{
      if(!waitingSince)waitingSince=time;
      if(!ready || time-waitingSince>500)message(ready?'Loading this view…':'Opening the camera…');
    }
  }else{pending=false;if(ready && waitingSince){waitingSince=0;message('');}}
  prefetch(time);
  frame=requestAnimationFrame(tick);
}
function clearInput(){
  keys.clear();pointers.clear();drag=null;pinch=null;keyFeedback();
}
function press(key){
  if(!ready || stopped || keys.has(key))return;
  keys.add(key);seek(nudge(pending?target:shown,1/60,new Set([key])));keyFeedback();
}
function release(key){keys.delete(key);keyFeedback();}
function toggle(){
  if(!ready||stopped)return;
  if(!playing && shown.stage>=maxStage)seek({...shown,stage:minStage});
  setPlaying(!playing);
}
function reset(){if(!ready||stopped)return;clearInput();seek({...meta.initial});setPlaying(false);}
const arrowNames={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down'};
document.addEventListener('keydown',e=>{
  if(e.altKey||e.ctrlKey||e.metaKey||!ready||stopped || e.target.matches('input,textarea,select,[contenteditable=true]'))return;
  if(arrowNames[e.key]){e.preventDefault();if(!e.repeat)press(arrowNames[e.key]);}
  else if(e.code==='Space' && !e.target.closest('button,a')){e.preventDefault();if(!e.repeat)toggle();}
});
document.addEventListener('keyup',e=>{if(arrowNames[e.key])release(arrowNames[e.key]);});
window.addEventListener('blur',clearInput);
document.addEventListener('visibilitychange',()=>{
  clearInput();cancelAnimationFrame(frame);lastTime=0;
  if(!document.hidden&&renderer&&!stopped)frame=requestAnimationFrame(tick);
});
pad.forEach(b=>{
  b.addEventListener('pointerdown',e=>{if(e.button!==0 || !ready)return;e.preventDefault();b.setPointerCapture(e.pointerId);press(b.dataset.key);});
  for(const evt of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(evt,()=>release(b.dataset.key));
  b.addEventListener('click',e=>{if(!e.detail && ready)seek(nudge(shown,.12,new Set([b.dataset.key])));});
});
play.addEventListener('click',toggle);el('reset').addEventListener('click',reset);
bloom.addEventListener('input',()=>{
  if(!ready)return;setPlaying(false);
  seek({...shown,stage:minStage+(maxStage-minStage)*Number(bloom.value)/1000});
});
function distance(){const [a,b]=[...pointers.values()];return Math.hypot(a.x-b.x,a.y-b.y);}
canvas.addEventListener('pointerdown',e=>{
  if(!ready||stopped||e.button!==0)return;
  canvas.focus({preventScroll:true});canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pointers.size===1){drag={x:e.clientX,y:e.clientY,pose:{...shown}};pinch=null;}
  else if(pointers.size===2){pinch={width:distance(),zoom:shown.zoom};drag=null;}
  keyFeedback();
});
canvas.addEventListener('pointermove',e=>{
  if(!pointers.has(e.pointerId))return;
  pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pinch && pointers.size===2)seek({...shown,zoom:pinch.zoom*pinch.width/Math.max(1,distance())});
  else if(drag){
    const w=canvas.clientWidth;
    seek({...shown,yaw:drag.pose.yaw+(e.clientX-drag.x)/w*71,zoom:drag.pose.zoom+(e.clientY-drag.y)/w*.46});
  }
});
function endPointer(e){
  if(!pointers.delete(e.pointerId))return;
  pinch=null;drag=null;
  if(pointers.size===1)drag={...[...pointers.values()][0],pose:{...shown}};
  keyFeedback();
}
for(const evt of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(evt,endPointer);
canvas.addEventListener('wheel',e=>{
  if(!ready || stopped || document.activeElement!==canvas)return;
  e.preventDefault();const p=pending?target:shown;
  seek({...p,zoom:p.zoom+clamp(e.deltaY,-90,90)*.0008});
},{passive:false});
el('retry').addEventListener('click',()=>location.reload());
el('expand').hidden=!document.fullscreenEnabled;
el('expand').addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await el('instrument').requestFullscreen();}
  catch{el('expand').hidden=true;}
});
document.addEventListener('fullscreenchange',()=>{const s=document.fullscreenElement?'Exit fullscreen':'Enter fullscreen';el('expand').ariaLabel=s;el('expand').title=s;});
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();failure('Camera graphics were interrupted.');});
async function start(){
  bloom.disabled=true;
  const response=await fetch(base+'bank.json');
  if(!response.ok)throw Error('Missing camera metadata');
  meta=await response.json();minStage=meta.stages[0];maxStage=meta.stages.at(-1);
  minYaw=meta.angles[0];maxYaw=meta.angles.at(-1);
  shown={...meta.initial};target=shown;
  renderer=new RoseRenderer(canvas,meta,base,()=>failure());
  setPlaying(!matchMedia('(prefers-reduced-motion: reduce)').matches);
  frame=requestAnimationFrame(tick);
}
start().catch(e=>failure(e.message==='WebGL unavailable'?'This camera needs WebGL. You can still watch the film.':'The camera could not start.'));
