// Escena Three.js: brazo azul jerárquico, motor de movimiento suave y mesa de trabajo.
import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { DH, LIM, clamp, ik, collides } from './cinematica.js';

const mat=(c,m=.2,r=.5,x={})=>new T.MeshStandardMaterial({color:c,metalness:m,roughness:r,...x});
const M={blue:mat(0x1f7ae0,.85,.32),black:mat(0x14171c,.3,.55),silver:mat(0xd3dae2,1,.22),
  table:mat(0x18202f,.1,.85),white:mat(0xe8edf2,0,.6),pcb:mat(0x0b5d3b,.1,.7),dark:mat(0x232a38,.3,.6),gray:mat(0x3b4049,.7,.4)};
const add=(p,g,m,x=0,y=0,z=0)=>{const o=new T.Mesh(g,m);o.position.set(x,y,z);o.castShadow=true;o.receiveShadow=true;p.add(o);return o;};
const cyl=(r,h,s=24)=>new T.CylinderGeometry(r,r,h,s);

export const scene=new T.Scene(); scene.background=new T.Color(0x05070d); scene.fog=new T.Fog(0x05070d,120,260);
export let camera,renderer,controls;

// Placa de aluminio azul con extremos redondeados y perforaciones CNC
function plate(len,w,t){
  const r=w/2,s=new T.Shape();
  s.absarc(0,0,r,Math.PI/2,Math.PI*1.5,false); s.absarc(len,0,r,-Math.PI/2,Math.PI/2,false); s.closePath();
  const hole=(x,rad)=>{const h=new T.Path();h.absarc(x,0,rad,0,Math.PI*2,true);s.holes.push(h);};
  hole(0,r*.35); hole(len,r*.35);
  if(len>9){hole(len*.35,r*.28);hole(len*.65,r*.28);}
  const g=new T.ExtrudeGeometry(s,{depth:t,bevelEnabled:true,bevelSize:.06,bevelThickness:.06,bevelSegments:1,curveSegments:16});
  g.translate(0,0,-t/2); return g;
}
function link(len,w,sep){
  const g=new T.Group(), t=.35, e=Math.min(3.2,len/2.2), z0=sep/2;
  [-1,1].forEach(sd=>{
    add(g,plate(e,w,t),M.blue,0,0,sd*z0); add(g,plate(e,w,t),M.blue,len-e,0,sd*z0);
    [0,e,len-e,len].forEach(x=>add(g,cyl(.28,.25,10),M.silver,x,0,sd*(z0+.25)).rotation.x=Math.PI/2);
  });
  [-1,1].forEach(sd=>add(g,new T.BoxGeometry(Math.max(.1,len-2*e),.3,sep),M.blue,len/2,sd*w*.45,0));
  [0,len].forEach(x=>add(g,cyl(.45,sep+1,14),M.silver,x,0,0).rotation.x=Math.PI/2);
  const mid=len>=10?len*.5:e, bl=len-e-mid;
  if(len>=10){const c=add(g,cyl(w*.33,mid-e+.4,24),M.silver,(e+mid)/2,0,0);c.rotation.z=Math.PI/2;}
  if(bl>.5) add(g,new T.BoxGeometry(bl,w*.78,sep-.5),M.black,mid+bl/2,0,0);
  return g;
}
function servo(sz=1){
  const g=new T.Group();
  add(g,new T.BoxGeometry(4.2,2.2,2.4),M.black,.9,0,0);
  add(g,new T.BoxGeometry(6,.25,2.4),M.black,.9,-.3,0);
  [-2.4,3.9].forEach(x=>add(g,cyl(.18,.4,8),M.silver,x,.1,0));
  add(g,cyl(.9,.7,20),M.silver,0,0,1.5).rotation.x=Math.PI/2;
  add(g,cyl(.3,.2,10),M.dark,0,0,1.95).rotation.x=Math.PI/2;
  g.scale.setScalar(sz); return g;
}
function label(text,h=1.5){
  const c=document.createElement('canvas'),x=c.getContext('2d'),fs=44,font=`bold ${fs}px sans-serif`;
  x.font=font; const w=Math.ceil(x.measureText(text).width)+44; c.width=w; c.height=72;
  x.font=font; x.fillStyle='rgba(2,6,23,.88)'; x.strokeStyle='#06b6d4'; x.lineWidth=4;
  x.beginPath(); x.roundRect(3,3,w-6,66,14); x.fill(); x.stroke();
  x.fillStyle='#ffffff'; x.textAlign='center'; x.fillText(text,w/2,51);
  const tx=new T.CanvasTexture(c); tx.colorSpace=T.SRGBColorSpace; tx.anisotropy=8;
  const s=new T.Sprite(new T.SpriteMaterial({map:tx,transparent:true,depthWrite:false}));
  s.scale.set(h*w/72,h,1); s.renderOrder=5; return s;
}

// ---------- Brazo ----------
export const arm={cur:{q1:0,q2:30,q3:-20,q4:15,q5:0,grip:50},tgt:{q1:0,q2:30,q3:-20,q4:15,q5:0,grip:50},
  speed:1,estop:false,held:null,j:{}};
const waiters=[];

function buildArm(){
  const root=new T.Group(); scene.add(root);
  // Base: placa rectangular azul ranurada + octágono + anillo plateado + 4 ventosas
  add(root,new T.BoxGeometry(22,1.2,22),M.blue,0,.8,0);
  [-8,8].forEach(v=>{add(root,new T.BoxGeometry(10,.12,.6),M.dark,0,1.42,v);add(root,new T.BoxGeometry(.6,.12,10),M.dark,v,1.42,0);});
  [[-10,-10],[10,-10],[-10,10],[10,10]].forEach(([x,z])=>{
    add(root,cyl(2.3,.3,24),M.white,x,.15,z); add(root,cyl(.5,.3,12),M.silver,x,1.5,z);});
  add(root,new T.CylinderGeometry(9.5,10.2,2,8),M.blue,0,2.4,0).rotation.y=Math.PI/8;
  add(root,new T.TorusGeometry(7.2,.22,8,48),M.silver,0,3.42,0).rotation.x=Math.PI/2;
  add(root,cyl(6.8,.25,40),M.blue,0,3.5,0);
  for(let i=0;i<8;i++){const a=i*Math.PI/4+Math.PI/8;add(root,cyl(.3,.2,8),M.silver,Math.cos(a)*8.6,3.45,Math.sin(a)*8.6);}
  const yaw=new T.Group(); root.add(yaw); arm.j.yaw=yaw;
  add(yaw,cyl(2.4,1.6,24),M.black,0,4.4,0);
  const br=link(3.5,3.6,7.4); br.rotation.z=Math.PI/2; br.position.set(0,3.5,0); yaw.add(br);
  const sh=new T.Group(); sh.position.set(0,DH.d1,0); yaw.add(sh); arm.j.sh=sh;
  const s1=servo(1.1); s1.position.z=-3.1; s1.rotation.y=Math.PI; sh.add(s1);
  sh.add(link(DH.a2,3.2,5.6));
  const el=new T.Group(); el.position.set(DH.a2,0,0); sh.add(el); arm.j.el=el;
  const s2=servo(1); s2.position.z=-2.7; s2.rotation.y=Math.PI; el.add(s2);
  el.add(link(DH.a3,2.8,4.6));
  const wr=new T.Group(); wr.position.set(DH.a3,0,0); el.add(wr); arm.j.wr=wr;
  const s3=servo(.85); s3.position.z=-2.3; s3.rotation.y=Math.PI; wr.add(s3);
  wr.add(link(DH.a4,2.4,3.6));
  // Muñeca roll + pinza gris oscuro con engranajes
  const ro=new T.Group(); ro.position.set(DH.a4,0,0); wr.add(ro); arm.j.ro=ro;
  add(ro,cyl(1.1,1,16),M.silver,.6,0,0).rotation.z=Math.PI/2;
  add(ro,new T.BoxGeometry(DH.d5-1.6,2.6,3.6),M.gray,(DH.d5-1.6)/2+.8,0,0);
  const gx=DH.d5-2.2;
  [-1,1].forEach(s=>{
    add(ro,cyl(1.5,.5,14),M.gray,gx,0,s*1.3).rotation.x=0;
    add(ro,cyl(.35,.7,10),M.silver,gx,0,s*1.3);
    const f=new T.Group(); f.position.set(gx,0,s*1.3); ro.add(f); arm.j['f'+s]=f;
    add(f,new T.BoxGeometry(4.4,1.8,.35),M.gray,2.2,0,s*.3);
    add(f,new T.BoxGeometry(.7,1.8,.35),M.black,4.3,0,-s*.1);
  });
  arm.tip=new T.Group(); arm.tip.position.set(DH.d5-.5,0,0); ro.add(arm.tip);
  const cable=new T.CatmullRomCurve3([new T.Vector3(-3,3.6,-3),new T.Vector3(-5,5.5,-5),new T.Vector3(-4,8,-4),new T.Vector3(-1.5,7.5,-3.4)]);
  [0x111111,0xcc2222,0xeeeeee].forEach((c,i)=>{const o=new T.Mesh(new T.TubeGeometry(cable,24,.18,6),mat(c,0,.7));o.position.set(i*.4,0,i*.4);yaw.add(o);});
}
const D2R=Math.PI/180;
function apply(){
  const q=arm.cur;
  arm.j.yaw.rotation.y=-q.q1*D2R; arm.j.sh.rotation.z=q.q2*D2R; arm.j.el.rotation.z=q.q3*D2R;
  arm.j.wr.rotation.z=q.q4*D2R; arm.j.ro.rotation.x=q.q5*D2R;
  const a=q.grip/100*.55; arm.j.f1.rotation.y=-a; arm.j['f-1'].rotation.y=a;
}
arm.update=function(dt){
  if(arm.estop) return;
  const keys=Object.keys(LIM); let md=0;
  keys.forEach(k=>md=Math.max(md,Math.abs(arm.tgt[k]-arm.cur[k])));
  if(md<.05){ keys.forEach(k=>arm.cur[k]=arm.tgt[k]); apply(); while(waiters.length)waiters.shift().res(); return; }
  const step=Math.min(md,70*[.5,1,2][arm.speed-1]*dt), f=step/md;
  keys.forEach(k=>arm.cur[k]+=(arm.tgt[k]-arm.cur[k])*f); apply();
};
arm.moveJoints=t=>{
  if(arm.estop) return Promise.reject(new Error('ESTOP'));
  for(const k in t) arm.tgt[k]=clamp(t[k],LIM[k]);
  return new Promise((res,rej)=>waiters.push({res,rej}));
};
arm.setManual=(k,v)=>{ if(arm.estop) return false; const q={...arm.tgt,[k]:clamp(v,LIM[k])}; if(collides(q)) return false; arm.tgt[k]=q[k]; return true; };
arm.moveXYZ=(x,y,z,phis)=>{
  const q=ik(x,y,z,phis);
  if(!q) return Promise.reject(new Error(`Punto (${x.toFixed(1)}, ${y.toFixed(1)}, ${z.toFixed(1)}) fuera de alcance/límites`));
  return arm.moveJoints(q);
};
arm.setGrip=p=>arm.moveJoints({grip:p});
arm.home=()=>arm.moveJoints({q1:0,q2:30,q3:-20,q4:15,q5:0,grip:50});
arm.transport=()=>arm.moveJoints({q1:0,q2:60,q3:-115,q4:80,q5:0,grip:10}); // plegado hacia arriba, sin atravesar la base
arm.stop=()=>{ arm.estop=true; Object.assign(arm.tgt,arm.cur); while(waiters.length)waiters.shift().rej(new Error('ESTOP')); };
arm.rearm=()=>{ arm.estop=false; };
arm.grab=o=>{arm.tip.attach(o);arm.held=o;};
arm.release=(o,x,y,z)=>{scene.attach(o);o.position.set(x,y,z);o.rotation.set(0,0,0);arm.held=null;};

// ---------- Mesa de trabajo ----------
export const SLOTS={R:{x:-3.5,z:17},LED:{x:0,z:17},C:{x:3.5,z:17}};
export const TRAY={R:{x:5,z:-16.5},LED:{x:9,z:-16.5},C:{x:13,z:-16.5}};
export const BINS={R:{x:-18,z:-9},LED:{x:-18,z:0},C:{x:-18,z:9}};
export const PANEL={z:-26.5,y:11,START:-6,STOP:6};
export const bench={parts:{},btn:{},lamps:{},k1:false};

function buildBench(){
  add(scene,new T.BoxGeometry(84,2,80),M.table,0,-1,0);
  const grid=new T.GridHelper(80,20,0x06b6d4,0x0e3a4a);grid.position.y=.02;grid.material.opacity=.35;grid.material.transparent=true;scene.add(grid);bench.grid=grid;
  const lb=(t,x,z,y,h)=>{const s=label(t,h);s.position.set(x,y,z);scene.add(s);};
  // Protoboard (fuera de la base del brazo)
  add(scene,new T.BoxGeometry(14,.8,9),M.white,0,.4,17);
  for(let i=0;i<12;i++)for(let j=0;j<6;j++)add(scene,cyl(.12,.05,6),M.dark,-5.5+i*1,.82,14.6+j*1);
  Object.values(SLOTS).forEach(p=>add(scene,new T.BoxGeometry(2.8,.06,2.4),mat(0x1d4ed8),p.x,.82,p.z));
  lb('PROTOBOARD',0,24,3.2,1.6);
  add(scene,new T.BoxGeometry(6,3,4),M.black,13,1.5,17); lb('FUENTE 5V CC',13,17,5,1.4);
  // Componentes (escala 1.6 para que se vean completos)
  const mk={
    R:()=>{const g=new T.Group();add(g,cyl(.45,2.2,16),mat(0xd8b98a,0,.7),0,.9,0).rotation.z=Math.PI/2;
      [-.5,0,.5].forEach((x,i)=>add(g,cyl(.47,.18,16),mat([0xff7a00,0x7a3b00,0x111111][i]),x,.9,0).rotation.z=Math.PI/2);return g;},
    LED:()=>{const g=new T.Group();g.userData.mat=mat(0xff3333,0,.3,{emissive:0xff0000,emissiveIntensity:0,transparent:true,opacity:.9});
      add(g,cyl(.6,1.2,20),g.userData.mat,0,.6,0);add(g,new T.SphereGeometry(.6,20,12),g.userData.mat,0,1.2,0);return g;},
    C:()=>{const g=new T.Group();add(g,cyl(.75,1.8,20),mat(0x1c4fd0,.3,.5),0,.9,0);add(g,cyl(.76,.2,20),M.silver,0,1.75,0);return g;}};
  Object.keys(mk).forEach(k=>{const o=mk[k]();o.scale.setScalar(1.6);o.userData.type=k;scene.add(o);bench.parts[k]=o;});
  bench.led=bench.parts.LED.userData.mat;
  // Bandeja de partes
  add(scene,new T.BoxGeometry(16,.5,5.5),M.dark,9,.25,-16.5); lb('BANDEJA',9,-21,3.2,1.4);
  // Contenedores de clasificación (paredes bajas)
  const wm=mat(0x334155,.3,.6);
  Object.entries(BINS).forEach(([k,p])=>{
    add(scene,new T.BoxGeometry(8,.4,7),M.dark,p.x,.2,p.z);
    [[0,-3.5,8,.3],[0,3.5,8,.3],[-4,0,.3,7],[4,0,.3,7]].forEach(([dx,dz,w,d])=>add(scene,new T.BoxGeometry(w,1.2,d),wm,p.x+dx,.6,p.z+dz));
    lb(k==='R'?'RESISTENCIAS':k==='LED'?'LEDs':'CONDENSADORES',p.x,p.z,4.6,1.3);});
  // Tablero eléctrico
  add(scene,new T.BoxGeometry(24,18,1),mat(0x2b3547,.4,.5),0,9,PANEL.z-.5);
  const btn=(n,x,c)=>{const b=add(scene,cyl(1.1,1.2,20),mat(c,.2,.4,{emissive:c,emissiveIntensity:.15}),x,PANEL.y,PANEL.z+.6);b.rotation.x=Math.PI/2;b.userData.z0=b.position.z;bench.btn[n]=b;lb(n,x,PANEL.z+.8,PANEL.y+2.6,1.3);};
  btn('START',PANEL.START,0x16a34a); btn('STOP',PANEL.STOP,0xdc2626);
  add(scene,new T.BoxGeometry(5,3.5,2),mat(0x7a8aa0,.2,.5),0,PANEL.y+.5,PANEL.z+1); lb('RELÉ K1',0,PANEL.z+1,PANEL.y-2.6,1.3);
  [['on',-4,0x22c55e],['off',4,0xef4444]].forEach(([n,x,c])=>{const l=add(scene,cyl(.9,.8,20),mat(c,0,.3,{emissive:c,emissiveIntensity:.1}),x,15.5,PANEL.z+.4);l.rotation.x=Math.PI/2;bench.lamps[n]=l;});
  lb('LUCES PILOTO',0,PANEL.z+.8,17.8,1.3);
  bench.reset();
}
bench.setK1=on=>{bench.k1=on;bench.lamps.on.material.emissiveIntensity=on?1.4:.1;bench.lamps.off.material.emissiveIntensity=on?.1:1.4;};
bench.press=async n=>{const b=bench.btn[n];b.position.z=b.userData.z0+.8;if(n==='START')bench.setK1(true);else bench.setK1(false);setTimeout(()=>b.position.z=b.userData.z0,450);};
bench.reset=()=>{
  if(arm.held) scene.attach(arm.held);
  Object.entries(bench.parts).forEach(([k,o])=>{scene.attach(o);o.position.set(TRAY[k].x,.5,TRAY[k].z);o.rotation.set(0,0,0);o.userData.where='tray';});
  bench.setK1(false);
};
bench.setLed=(I,burned)=>{ bench.led.emissiveIntensity=burned?0:Math.min(1.5,I/.012); bench.led.color.set(burned?0x222222:0xff3333); };

// ---------- Inicio ----------
export const views={iso:[48,38,48],front:[0,22,70],top:[0,85,.1]};
export function setView(n){const v=views[n];camera.position.set(...v);controls.target.set(0,6,0);controls.update();}
export function initRobot(canvas){
  renderer=new T.WebGLRenderer({canvas,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.shadowMap.enabled=true;
  camera=new T.PerspectiveCamera(45,1,.5,500);
  controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.maxPolarAngle=Math.PI/2.02;controls.minDistance=15;controls.maxDistance=160;
  scene.add(new T.HemisphereLight(0xbfd8ff,0x1a2233,.9));
  const d=new T.DirectionalLight(0xffffff,2.2);d.position.set(30,60,35);d.castShadow=true;d.shadow.mapSize.set(1024,1024);
  Object.assign(d.shadow.camera,{left:-50,right:50,top:50,bottom:-50,near:1,far:150});scene.add(d);
  const p=new T.PointLight(0x06b6d4,600,120);p.position.set(-30,25,-20);scene.add(p);
  buildArm();buildBench();apply();setView('iso');
  const fit=()=>{const r=canvas.parentElement.getBoundingClientRect();if(!r.width)return;renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();};
  new ResizeObserver(fit).observe(canvas.parentElement);fit();
}
export function renderFrame(){controls.update();renderer.render(scene,camera);}
