// Reproject the four neighbouring studio views to the camera chosen by the visitor.
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const quad = [[0,0],[1,0],[0,1],[1,1]];
const vertex = 'attribute vec2 position; varying vec2 screenUV; void main(){screenUV=vec2(position.x*.5+.5,.5-position.y*.5);gl_Position=vec4(position,0.,1.);}';
const fragment = `
precision highp float;
varying vec2 screenUV;
uniform vec2 pixels, gridSize, flowPixels, pivot;
uniform float zoomRatio, flowScale;
` + quad.map((_,i)=>`uniform sampler2D photo${i}, flow${i}; uniform vec2 cell${i}, travel${i}; uniform float weight${i};`).join('\n') + `
vec2 withinTile(vec2 uv, vec2 size) {return clamp(uv,.5/size,1.-.5/size);}
vec2 displacement(sampler2D field,vec2 cell,vec2 at,vec2 stepBy) {
  vec2 uv=(cell+withinTile(at,flowPixels))/gridSize;
  vec2 a=texture2D(field,vec2(uv.x,uv.y*.5)).rg;
  vec2 b=texture2D(field,vec2(uv.x,.5+uv.y*.5)).rg;
  return ((a*255.-128.)*stepBy.x+(b*255.-128.)*stepBy.y)*(flowScale/127.)/pixels;
}
vec3 sampleView(sampler2D photo,sampler2D field,vec2 cell,vec2 uv,vec2 stepBy){
  vec2 at=uv-displacement(field,cell,uv,stepBy);
  at=uv-displacement(field,cell,at,stepBy);
  return texture2D(photo,(cell+withinTile(at,pixels))/gridSize).rgb;
}
void main(){vec2 uv=pivot+(screenUV-pivot)*zoomRatio;
  gl_FragColor=vec4(` + quad.map((_,i)=>`weight${i}*sampleView(photo${i},flow${i},cell${i},uv,travel${i})`).join('+') + `,1.);
}`;

function programFor(gl) {
  const program=gl.createProgram();
  for(const [type,source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const shader=gl.createShader(type);
    gl.shaderSource(shader,source);gl.compileShader(shader);
    if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);gl.deleteShader(shader);
  }
  gl.linkProgram(program);
  if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  return program;
}

async function bitmap(input) {
  let blob=input;
  if(typeof input==='string'){
    const response=await fetch(input,{cache:'force-cache'});
    if(!response.ok)throw Error('Unable to load '+input);
    blob=await response.blob();
  }
  if(window.createImageBitmap) {
    try { return await createImageBitmap(blob,{colorSpaceConversion:'none',premultiplyAlpha:'none'}); }
    catch { /* Some WebKit versions do not implement these bitmap options. */ }
  }
  const img=new Image();const objectURL=URL.createObjectURL(blob);
  try { img.src=objectURL;await img.decode();return img; }
  finally { URL.revokeObjectURL(objectURL); }
}

export class RoseRenderer {
  constructor(canvas,meta,base,onError) {
    this.meta=meta;this.base=base;this.onError=onError;this.pages=new Map();this.queue=[];this.busy=0;
    this.pinned=new Set();this.clock=0;this.maxPages=meta.bundle?7:8;this.bundle=null;
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:false,depth:false,stencil:false}) ||
             canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false});
    if(!gl || gl.getParameter(gl.MAX_TEXTURE_SIZE)<meta.width*meta.columns) throw Error('WebGL unavailable');
    this.gl=gl;const p=programFor(gl);gl.useProgram(p);
    const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const attr=gl.getAttribLocation(p,'position');gl.enableVertexAttribArray(attr);gl.vertexAttribPointer(attr,2,gl.FLOAT,false,0,0);
    const loc=n=>gl.getUniformLocation(p,n);
    this.corners=quad.map((_,i)=>{
      gl.uniform1i(loc('photo'+i),2*i);gl.uniform1i(loc('flow'+i),2*i+1);
      return {cell:loc('cell'+i),travel:loc('travel'+i),weight:loc('weight'+i)};
    });
    gl.uniform2f(loc('pixels'),meta.width,meta.height);gl.uniform2f(loc('gridSize'),meta.columns,meta.rows);
    gl.uniform2f(loc('flowPixels'),meta.flowWidth,meta.flowHeight);gl.uniform2fv(loc('pivot'),meta.center);
    gl.uniform1f(loc('flowScale'),meta.flowScale);this.zoom=loc('zoomRatio');
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL,gl.NONE);gl.disable(gl.DITHER);
    gl.viewport(0,0,canvas.width,canvas.height);
  }

  coordinates(pose) {
    const {angles,stages}=this.meta;
    const a=clamp((pose.yaw-angles[0])/(angles[1]-angles[0]),0,angles.length-1);
    const t=clamp((pose.stage-stages[0])/(stages[1]-stages[0]),0,stages.length-1);
    const i=Math.min(angles.length-2,Math.floor(a)),j=Math.min(stages.length-2,Math.floor(t));
    return quad.map(([dx,dy])=>{
      const x=i+dx,y=j+dy;const {columns,rows}=this.meta;
      return {key:Math.floor(x/columns)+','+Math.floor(y/rows),cx:x%columns,cy:y%rows,
              da:a-x,dt:t-y,w:(1-Math.abs(a-x))*(1-Math.abs(t-y))};
    });
  }

  request(key,priority=false) {
    const old=this.pages.get(key);
    if(old){
      if(priority && old.state==='queued'){this.queue=this.queue.filter(k=>k!==key);this.queue.unshift(key);}
      return old;
    }
    const page={key,state:'queued',used:0,tries:0};this.pages.set(key,page);
    if(priority)this.queue.unshift(key);else this.queue.push(key);
    return page;
  }

  schedule() {
    while(this.busy<3 && this.queue.length){
      const key=this.queue.shift(),page=this.pages.get(key);
      if(!page || page.state!=='queued')continue;
      this.busy++;page.state='loading';
      this.fetchPage(page).catch(()=>{
        if(this.gl.isContextLost())return;
        if(++page.tries<3){page.state='retry';setTimeout(()=>{page.state='queued';this.queue.unshift(key);this.schedule();},450*page.tries);}
        else page.state='error';
      }).finally(()=>{this.busy--;this.schedule();});
    }
  }

  async fetchPage(page) {
    const [x,y]=page.key.split(',').map(k=>k.padStart(2,'0'));
    const name='p'+x+'-'+y,path=this.base+name;
    let photo=path+(this.meta.images||'.jpg'),motion=path+(this.meta.motion||'.png');
    if(this.meta.bundle){
      this.bundle??=fetch(this.base+this.meta.bundle,{cache:'force-cache'}).then(r=>{
        if(!r.ok)throw Error('Navigation data unavailable');return r.blob();
      }).catch(err=>{this.bundle=null;throw err;});
      const bytes=await this.bundle;
      const [offset,pixels,vectors]=this.meta.index[name];
      photo=bytes.slice(offset,offset+pixels,'image/webp');
      motion=bytes.slice(offset+pixels,offset+pixels+vectors,'image/webp');
    }
    const images=await Promise.allSettled([bitmap(photo),bitmap(motion)]);
    const sources=images.filter(r=>r.status==='fulfilled').map(r=>r.value);
    const gl=this.gl,textures=[];
    try{
      if(sources.length!==2)throw Error('Incomplete camera page');
      for(const source of sources){
        const tex=gl.createTexture();textures.push(tex);gl.bindTexture(gl.TEXTURE_2D,tex);
        for(const axis of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,axis,gl.CLAMP_TO_EDGE);
        for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
      }
      page.textures=textures;page.state='ready';page.used=++this.clock;this.trim();
    }catch(e){textures.forEach(t=>gl.deleteTexture(t));throw e;}
    finally{sources.forEach(source=>source.close?.());}
  }

  trim(){
    const ready=[...this.pages.values()].filter(p=>p.state==='ready');
    const available=ready.filter(p=>!this.pinned.has(p.key)).sort((a,b)=>a.used-b.used);
    while(ready.length>this.maxPages && available.length){
      const p=available.shift();p.textures.forEach(t=>this.gl.deleteTexture(t));this.pages.delete(p.key);ready.pop();
    }
  }

  warm(poses) {
    const nodes=poses.flatMap(pose=>this.coordinates(pose));
    const needed=nodes.filter(n=>n.w>0.000001);
    const keys=[...new Set(needed.map(n=>n.key))];
    this.pinned=new Set(keys);
    for(const k of keys){
      const page=this.request(k,true);
      if(page.state==='error')this.onError();
    }
    this.schedule();
    return keys.every(k=>this.pages.get(k)?.state==='ready');
  }

  prepare(pose){return this.warm([pose]);}

  prefetch(poses){
    const next=new Set(this.pinned);
    for(const pose of poses) for(const n of this.coordinates(pose)) if(n.w>.000001)next.add(n.key);
    // Discard speculative requests left over from an abandoned drag.
    this.queue=this.queue.filter(k=>{if(next.has(k))return true;this.pages.delete(k);return false;});
    for(const k of next)this.request(k);
    this.schedule();
  }

  draw(pose){
    const gl=this.gl,nodes=this.coordinates(pose);
    const first=nodes.find(n=>n.w>.000001);
    gl.uniform1f(this.zoom,pose.zoom/this.meta.baseZoom);
    nodes.forEach((n,i)=>{
      const actual=n.w>.000001?n:first,p=this.pages.get(actual.key),u=this.corners[i];
      p.used=++this.clock;
      for(let k=0;k<2;k++){gl.activeTexture(gl.TEXTURE0+2*i+k);gl.bindTexture(gl.TEXTURE_2D,p.textures[k]);}
      gl.uniform2f(u.cell,actual.cx,actual.cy);gl.uniform2f(u.travel,actual.da,actual.dt);gl.uniform1f(u.weight,n.w);
    });
    gl.drawArrays(gl.TRIANGLES,0,3);
  }
}
