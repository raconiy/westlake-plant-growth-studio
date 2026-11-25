'use strict';
const $=id=>document.getElementById(id),film=$('film'),proxy=$('proxy');
let job=null, view='film', selectedOpen=.78, originalOpen=.78, tracking=false, drag=null;
let catalogue=[];
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const secs=x=>'00:'+Math.max(0,Number.isFinite(x)?x:0).toFixed(1).padStart(4,'0');
const length=()=>job?.story?.frames?((job.story.frames-1)/job.story.fps):Math.max(0,(Number.isFinite(film.duration)?film.duration:0)-.125);
function forward(t){return t<=selectedOpen?t*originalOpen/selectedOpen:originalOpen+(t-selectedOpen)*(1-originalOpen)/(1-selectedOpen);}
function inverse(t){return t<=originalOpen?t*selectedOpen/originalOpen:selectedOpen+(t-originalOpen)*(1-selectedOpen)/(1-originalOpen);}
const logical=()=>length()?inverse(clamp(film.currentTime/length())):0;
function openChanged(){return Math.abs(selectedOpen-originalOpen)>.004;}
function notice(s){$('status').textContent=s||'';}
function play(){if(film.getAttribute('src'))film.play().catch(()=>{});}
function toggle(){if(film.paused)play();else film.pause();}
function seek(t,pause=true){if(!length()||!Number.isFinite(film.duration))return;if(pause)film.pause();film.currentTime=length()*forward(clamp(t));refresh();}
function refresh(){
    const L=length(),t=logical(),ft=clamp(film.currentTime/(L||1));$('timecode').textContent=secs(t*L);$('duration').textContent=secs(job?.story?.seconds||film.duration);
    $('playhead').style.left=(t*100)+'%';$('seek').value=Math.round(1000*t);
    const frame=Math.round(t*((job?.story?.frames||1)-1));$('seek').setAttribute('aria-valuetext','Frame '+frame+'');
    $('toggle').innerHTML=film.paused?'▶':'Ⅱ';$('toggle').setAttribute('aria-label',film.paused?'Play':'Pause');
    const rate=t<selectedOpen?originalOpen/selectedOpen:(1-originalOpen)/(1-selectedOpen);
    if(Number.isFinite(rate)&&Math.abs(rate-film.playbackRate)>.003)film.playbackRate=rate;
    let current=0;[...$('sequence').children].forEach((b,i)=>{if(film.currentTime+.025>=Number(b.dataset.sec))current=i;});
    [...$('sequence').children].forEach((b,i)=>b.setAttribute('aria-current',String(current===i)));
    if(view==='mesh'&&!$('meshPanel').hidden){const slider=$('meshTime'),v=Math.round(ft*Number(slider.max));if(Number(slider.value)!==v){slider.value=v;slider.dispatchEvent(new Event('input'));}}
    if(view==='proxy'&&proxy.readyState>=2){if(Math.abs(proxy.currentTime-film.currentTime)>.14||film.paused&&Math.abs(proxy.currentTime-film.currentTime)>.045)proxy.currentTime=film.currentTime;proxy.playbackRate=film.playbackRate;if(film.paused&&!proxy.paused)proxy.pause();else if(!film.paused&&proxy.paused)proxy.play().catch(()=>{});}
    const pts=job?.story?.focus, early=clamp(ft/.53),zoom=1+.92*(1-early*early*(3-2*early));$('focusShot').hidden=view!=='film'||!pts?.length;
    if(tracking&&pts?.length&&zoom>1.01){const p=pts[Math.min(pts.length-1,Math.round(ft*(pts.length-1)))];film.style.transformOrigin=p.map(v=>100*clamp((v-.5/zoom)/(1-1/zoom))+'%').join(' ');film.style.transform='scale('+zoom+')';}else film.style.transform='none';
}
for(const e of ['timeupdate','play','pause','seeked','loadedmetadata','ratechange'])film.addEventListener(e,refresh);
if(film.requestVideoFrameCallback){const tick=()=>{refresh();film.requestVideoFrameCallback(tick);};film.requestVideoFrameCallback(tick);}
$('seek').oninput=e=>seek(e.target.value/1000);$('toggle').onclick=toggle;
$('focusShot').onclick=()=>{tracking=!tracking;$('focusShot').setAttribute('aria-pressed',String(tracking));refresh();};
$('fullscreen').onclick=()=>{if(document.fullscreenElement)document.exitFullscreen();else if($('theatre').requestFullscreen)$('theatre').requestFullscreen().catch(()=>{});else film.webkitEnterFullscreen?.();};
function changeOpen(v){const t=logical();selectedOpen=clamp(v,.25,.92);$('onset').value=Math.round(100*selectedOpen);$('onset').style.setProperty('--at',((selectedOpen-.25)/.67*100)+'%');
    $('onsetValue').textContent='Frame '+Math.round(selectedOpen*((job?.story?.frames||1)-1))+'';
    $('onset').setAttribute('aria-valuetext',$('onsetValue').textContent);$('undoTiming').disabled=!openChanged();seek(t);

}
$('onset').onpointerdown=()=>{if(logical()<.15||logical()>.95)seek(selectedOpen);};$('onset').oninput=e=>changeOpen(Number(e.target.value)/100);$('undoTiming').onclick=()=>changeOpen(originalOpen);
function setSrc(el,src){if(src&&el.getAttribute('src')!==src)el.src=src;else if(!src&&el.hasAttribute('src')){el.pause();el.removeAttribute('src');el.load();}}
// A basic classroom file server may not implement byte-range requests.
const objectUrls=new Map();
async function playable(path){
    try{
        const headers=await fetch(path,{method:'HEAD'});
        if(!headers.ok || headers.headers.get('Accept-Ranges')?.toLowerCase()==='bytes')return path;
        if(!objectUrls.has(path))objectUrls.set(path,fetch(path).then(async r=>{
            if(!r.ok)throw Error('Could not load the film.');
            return URL.createObjectURL(await r.blob());
        }).catch(e=>{objectUrls.delete(path);throw e;}));
        return await objectUrls.get(path);
    }catch{return path;}
}
let viewRequest=0;
async function show(which){
    const id=++viewRequest;view=which;
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===which)));
    film.hidden=which!=='film';proxy.hidden=which!=='proxy';$('meshPanel').hidden=true;
    if(which!=='proxy')proxy.pause();
    $('emptyFilm').hidden=!!job?.video;
    if(which==='mesh'&&job?.mesh){
        $('emptyFilm').hidden=false;$('emptyFilm').textContent='Loading the 4D model…';
        await loadMesh(job);
        if(id!==viewRequest){if(view!=='mesh')$('meshPanel').hidden=true;return;}
        if(!document.querySelector('#meshCanvas').dataset.ready){$('emptyFilm').textContent='This browser could not display the 4D model.';}
        else{$('meshPanel').hidden=false;$('emptyFilm').hidden=true;}
    }else if(which==='proxy'&&job?.proxy){const path=await playable(job.proxy);if(id!==viewRequest)return;proxy.preload='auto';setSrc(proxy,path);proxy.load();proxy.addEventListener('loadedmetadata',()=>{if(view==='proxy')proxy.currentTime=film.currentTime;},{once:true});}
    refresh();
}
for(const b of document.querySelectorAll('[data-view]'))b.onclick=()=>show(b.dataset.view);
$('theatre').addEventListener('pointerdown',e=>{
    if(e.button!==0||e.target.closest('button')||!job?.video)return;
    const rect=$('theatre').getBoundingClientRect();drag={x:e.clientX,t:logical(),base:Number($('meshAngle').value),width:rect.width,moved:false,view};
    $('theatre').setPointerCapture(e.pointerId);
});
$('theatre').addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-drag.x;if(Math.abs(dx)>3)drag.moved=true;if(!drag.moved)return;
    if(drag.view==='mesh'){const a=$('meshAngle');a.value=(((drag.base+dx/drag.width*340+540)%360)+360)%360-180;a.dispatchEvent(new Event('input'));}
    else seek(drag.t+dx/drag.width);
});
$('theatre').addEventListener('pointerup',()=>{if(drag&&!drag.moved&&drag.view!=='mesh')toggle();drag=null;});$('theatre').addEventListener('pointercancel',()=>{drag=null;});
$('theatre').addEventListener('keydown',e=>{if(view==='mesh'&&['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const a=$('meshAngle');a.value=Number(a.value)+(e.key==='ArrowRight'?8:-8);a.dispatchEvent(new Event('input'));}});
const hover=$('hoverFrame');
$('stripBox').addEventListener('pointermove',e=>{
    if(!job?.story?.studio_assets)return;
    const r=$('stripBox').getBoundingClientRect(),t=clamp((e.clientX-r.left)/r.width);
    const source=forward(t),index=Math.min(15,Math.max(0,Math.round(15*source)));
    const i=hover.querySelector('i');
    i.style.backgroundImage=$('stripArt').style.backgroundImage;i.style.backgroundPosition=(100*index/15)+'% center';
    hover.style.left=clamp(t*r.width,58,r.width-58)+'px';
    hover.querySelector('span').textContent=secs(t*length())+'  ·  Frame '+Math.round(source*(job.story.frames-1))+'';hover.hidden=false;
});
for(const event of ['pointerleave','pointerup','pointercancel'])$('stripBox').addEventListener(event,()=>{hover.hidden=true;});
function timing(j){originalOpen=j.spec?.plants?.[0]?.open||.78;selectedOpen=originalOpen;$('onset').value=Math.round(100*originalOpen);$('onset').style.setProperty('--at',((originalOpen-.25)/.67*100)+'%');$('onsetValue').textContent='Frame '+Math.round(originalOpen*((j.story?.frames||1)-1))+'';$('undoTiming').disabled=true;}

async function selectSpecies(){
    const key=location.hash.slice(1);
    const entry=catalogue.find(item=>item.species===key)||catalogue[0];
    if(!entry||job?.id===entry.species)return;
    const dir='./media/'+entry.species+'/';
    job={id:entry.species,video:dir+'film.mp4',mesh:dir+'mesh.bin.gz',proxy:dir+'control.mp4',
         spec:{view:'oblique',plants:[{species:entry.species,open:entry.open}]},
         story:{frames:entry.frames,fps:entry.fps,seconds:entry.frames/entry.fps,items:entry.chapters,focus:entry.focus,studio_assets:true}};
    tracking=false;film.dataset.hd='true';$('focusShot').setAttribute('aria-pressed','false');
    $('plate').dataset.species=entry.species;$('filmTitle').textContent=entry.title;$('botanical').textContent=entry.latin;
    $('portrait').src=dir+'cover.webp';$('portrait').alt=entry.title+' flower detail';
    film.poster=dir+'poster.jpg';$('pixelSize').textContent=entry.width+' × '+entry.height;
    $('download').href=job.video;$('download').download=entry.species+'-720p.mp4';
    for(const a of $('species').children)a.setAttribute('aria-current',String(a.dataset.sp===entry.species));
    $('sequence').replaceChildren();
    for(const item of entry.chapters){
        const b=document.createElement('button');b.type='button';b.dataset.sec=item.seconds;
        b.textContent=item.label;b.title='Frame '+item.frame+'';
        b.onclick=()=>seek(inverse(clamp(item.seconds/(length()||1))));$('sequence').append(b);
    }
    $('stripArt').style.backgroundImage='url('+dir+'strip.jpg)';$('hoverFrame').hidden=true;
    setSrc(proxy,null);setSrc(film,null);$('singleTiming').hidden=false;timing(job);show('film');
    const path=await playable(dir+'film.mp4');
    if(job.id!==entry.species)return;
    setSrc(film,path);
    if(!matchMedia('(prefers-reduced-motion:reduce)').matches)play();
}
window.addEventListener('hashchange',selectSpecies);
(async()=>{
    try{
        const response=await fetch('./films.json');
        if(!response.ok)throw Error('Could not load the collection.');
        catalogue=await response.json();
        for(const entry of catalogue){
            const a=document.createElement('a'),img=new Image(),label=document.createElement('span');
            a.className='pick';a.dataset.sp=entry.species;a.href='#'+entry.species;
            img.src='./media/'+entry.species+'/cover.webp';img.alt='';label.textContent=entry.title;
            a.append(img,label);$('species').append(a);
        }
        selectSpecies();
    }catch(error){notice(error.message);}
})();
