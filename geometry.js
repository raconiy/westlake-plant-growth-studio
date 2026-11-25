const meshBox=document.getElementById('meshPanel');
let displayedMesh='', meshVersion=0, meshObserver=null;
async function loadMesh(job) {
    const id=job.mesh?job.id:'';
    if(id===displayedMesh)return;
    displayedMesh=id;meshObserver?.disconnect();
    const version=++meshVersion;
    meshBox.hidden=true;
    if(!id)return;
    const old=document.getElementById('meshCanvas');
    const canvas=old.cloneNode(false);old.replaceWith(canvas);
    const gl=canvas.getContext('webgl2',{alpha:false,antialias:true});
    if(!gl)return;
    try{
        const response=await fetch(job.mesh);
        if(!response.ok)throw Error('Could not load the 4D model.');
        const compressed=await response.arrayBuffer();
        const signature=new Uint8Array(compressed,0,2);
        const data=signature[0]===31&&signature[1]===139
            ? await new Response(new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer()
            : compressed;
        if(version!==meshVersion)return;
        const len=new DataView(data).getUint32(0,true),offset=4+len;
        const info=JSON.parse(new TextDecoder().decode(new Uint8Array(data,4,len)));
        const shader=(type,src)=>{
            const sh=gl.createShader(type);gl.shaderSource(sh,src);gl.compileShader(sh);
            if(!gl.getShaderParameter(sh,gl.COMPILE_STATUS))throw Error(gl.getShaderInfoLog(sh));
            return sh;
        };
        const prog=gl.createProgram();
        gl.attachShader(prog,shader(gl.VERTEX_SHADER,`#version 300 es
        layout(location=0) in vec3 a;layout(location=1) in vec3 b;
        layout(location=2) in vec3 c;layout(location=3) in vec3 d;
        uniform vec3 span;uniform float phase,turn,aspect;
        out vec3 pos;out vec3 tint;
        void main(){
            vec3 p=(mix(a,b,phase)-vec3(.5))*span;
            float cs=cos(turn),sn=sin(turn);
            vec3 v=vec3(cs*p.x-sn*p.y,sn*p.x+cs*p.y,p.z);
            pos=vec3(v.x,v.z*.962-v.y*.272,v.y*.962+v.z*.272);
            gl_Position=vec4(pos.x/aspect,pos.y,-pos.z*.45,1.);
            tint=mix(c,d,phase);
        }`));
        gl.attachShader(prog,shader(gl.FRAGMENT_SHADER,`#version 300 es
        precision highp float;in vec3 pos;in vec3 tint;out vec4 pixel;
        void main(){vec3 n=normalize(cross(dFdx(pos),dFdy(pos)));float l=.63+.37*abs(dot(n,normalize(vec3(-.45,.72,.51))));pixel=vec4(tint*l,1.);}`));
        gl.linkProgram(prog);if(!gl.getProgramParameter(prog,gl.LINK_STATUS))throw Error(gl.getProgramInfoLog(prog));gl.useProgram(prog);
        const buffer=(type,view)=>{const b=gl.createBuffer();gl.bindBuffer(type,b);gl.bufferData(type,view,gl.STATIC_DRAW);return b;};
        const faces=buffer(gl.ELEMENT_ARRAY_BUFFER,new Uint32Array(data,offset,info.indices));
        const count=info.vertices*3,coordOffset=offset+info.indices*4;
        const coords=buffer(gl.ARRAY_BUFFER,new Uint16Array(data,coordOffset,count*info.frames));
        const colors=buffer(gl.ARRAY_BUFFER,new Uint8Array(data,coordOffset+2*count*info.frames,count*info.frames));
        const loc=s=>gl.getUniformLocation(prog,s);
        const phase=loc('phase'),turn=loc('turn'),aspect=loc('aspect');
        gl.uniform3fv(loc('span'),info.span.map(s=>1.78*s/Math.max(...info.span)));
        gl.uniform1f(loc('aspect'),canvas.width/canvas.height);
        gl.enable(gl.DEPTH_TEST);
        gl.clearColor(.105,.14,.112,1.);
        const time=document.getElementById('meshTime'),view=document.getElementById('meshAngle');
        time.max=info.last;time.value=Math.round(info.last*.78);view.value=job.spec.view==='oblique'?28:0;
        function draw(){
            if(canvas.clientWidth && canvas.clientHeight){
                const ratio=Math.min(window.devicePixelRatio||1,2560/canvas.clientWidth,1600/canvas.clientHeight);
                const width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio));
                if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
            }
            gl.uniform1f(aspect,canvas.width/canvas.height);
            const index=Number(time.value)/2,previous=Math.floor(index),next=Math.min(info.frames-1,previous+1);
            gl.viewport(0,0,canvas.width,canvas.height);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
            for(const [i,frame] of [previous,next].entries()){
                gl.bindBuffer(gl.ARRAY_BUFFER,coords);gl.enableVertexAttribArray(i);
                gl.vertexAttribPointer(i,3,gl.UNSIGNED_SHORT,true,0,frame*count*2);
                gl.bindBuffer(gl.ARRAY_BUFFER,colors);gl.enableVertexAttribArray(i+2);
                gl.vertexAttribPointer(i+2,3,gl.UNSIGNED_BYTE,true,0,frame*count);
            }
            gl.uniform1f(phase,index-previous);gl.uniform1f(turn,Number(view.value)*Math.PI/180);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,faces);gl.drawElements(gl.TRIANGLES,info.indices,gl.UNSIGNED_INT,0);
            document.getElementById('meshReadout').textContent='Frame '+time.value+' · '+view.value+'°';
        }
        time.oninput=view.oninput=draw;canvas.dataset.ready='1';meshBox.hidden=false;draw();meshObserver=new ResizeObserver(draw);meshObserver.observe(canvas);
    }catch(error){console.error(error);}
}
