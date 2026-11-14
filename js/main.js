import { LIM, DH, fk } from './cinematica.js';
import { initRobot, renderFrame, arm, bench, setView } from './robot3d.js';
import { circuit, solve } from './electricidad.js';
import * as auto from './automatizacion.js';

const $=id=>document.getElementById(id);
// ---- Partículas ----
const pc=$('particles-bg'),px=pc.getContext('2d');let ps=[];
const rs=()=>{pc.width=innerWidth;pc.height=innerHeight;};addEventListener('resize',rs);rs();
for(let i=0;i<60;i++)ps.push({x:Math.random()*pc.width,y:Math.random()*pc.height,r:Math.random()*2+.5,vx:(Math.random()-.5)*.4,vy:(Math.random()-.5)*.4,a:Math.random()*.5+.2});
(function pl(){px.clearRect(0,0,pc.width,pc.height);ps.forEach(p=>{p.x=(p.x+p.vx+pc.width)%pc.width;p.y=(p.y+p.vy+pc.height)%pc.height;px.beginPath();px.arc(p.x,p.y,p.r,0,7);px.fillStyle=`rgba(6,182,212,${p.a})`;px.fill();});requestAnimationFrame(pl);})();

// ---- Integrantes ----
[['miguel','ML','Miguel Ángel Llacsa Elías','Delegado del Grupo',1],['cristian','CC','Cristian Alí Casas Marrufo','Investigador'],
 ['robinsson','RA','Robinsson Luiggi Acosta Espejo','Investigador'],['vladimir','VE','Vladimir Alexander Espinoza Reyes','Investigador'],
 ['eberth','EA','Eberth Apaza Tordoya','Investigador']].forEach(([f,i,n,r,l])=>{
  $('members-grid').insertAdjacentHTML('beforeend',`<div class="member-card ${l?'leader':''}"><div class="avatar-box">
  <img src="img/${f}.jpeg" class="member-photo" alt="${n}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
  <div class="member-initials" style="display:none">${i}</div></div><div><h3>${n}</h3><span class="role">${r}</span></div></div>`);});

// ---- Navegación ----
let started=false;
$('btn-start').onclick=()=>{$('screen-intro').classList.remove('active');$('screen-sim').classList.add('active');
  if(!started){started=true;initRobot($('robot-canvas'));requestAnimationFrame(frame);log('info','Laboratorio inicializado. Brazo en posición HOME.');}};
$('btn-back').onclick=()=>{$('screen-sim').classList.remove('active');$('screen-intro').classList.add('active');};

// ---- Controles ----
const NAMES={q1:'1. Base (θ₁)',q2:'2. Hombro (θ₂)',q3:'3. Codo (θ₃)',q4:'4. Muñeca Pitch (θ₄)',q5:'5. Muñeca Roll (θ₅)',grip:'6. Pinza (apertura)'};
Object.keys(NAMES).forEach(k=>{
  $('sliders').insertAdjacentHTML('beforeend',`<div class="control-group"><div class="control-label"><span>${NAMES[k]}</span><span class="angle-val" id="v-${k}"></span></div>
  <input type="range" id="s-${k}" min="${LIM[k][0]}" max="${LIM[k][1]}" value="${arm.cur[k]}"></div>`);
  $('s-'+k).oninput=e=>{ if(auto.isBusy()){log('warn','Control manual bloqueado durante una tarea');return;} if(!arm.setManual(k,+e.target.value)) e.target.value=arm.tgt[k]; };
});
$('slider-speed').oninput=e=>{arm.speed=+e.target.value;$('val-speed').textContent=['Lenta','Normal','Rápida'][arm.speed-1];};
$('btn-home').onclick=()=>auto.run('home');
$('btn-transport').onclick=async()=>{ if(auto.isBusy()||arm.estop)return; try{await arm.transport();log('ok','Posición de transporte');}catch(e){} };
$('btn-estop').onclick=()=>{
  if(!arm.estop){arm.stop();$('btn-estop').textContent='✅ REARMAR';$('btn-estop').classList.add('armed');log('err','PARADA DE EMERGENCIA activada');setStatus('EMERGENCIA','stop');}
  else{arm.rearm();$('btn-estop').textContent='🛑 PARADA DE EMERGENCIA';$('btn-estop').classList.remove('armed');log('warn','Sistema rearmado');setStatus('Inactivo','');}};
document.querySelectorAll('[data-task]').forEach(b=>b.onclick=()=>auto.run(b.dataset.task));
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{setView(b.dataset.view);document.querySelectorAll('[data-view]').forEach(x=>x.classList.toggle('active',x===b));});
$('sel-r').onchange=e=>{circuit.R=+e.target.value;log('info',`R1 = ${circuit.R} Ω`);};
$('sel-fault').onchange=e=>{circuit.fault=e.target.value;log('warn',`Falla simulada: ${circuit.fault}`);};
$('chk-s1').onchange=e=>{circuit.S1=e.target.checked;log('info',`S1 ${circuit.S1?'cerrado':'abierto'}`);};
$('btn-reset-bench').onclick=()=>{if(auto.isBusy())return;bench.reset();circuit.parts.R=circuit.parts.LED=circuit.parts.C=false;log('info','Mesa reiniciada');};
$('btn-clear-log').onclick=()=>$('log').innerHTML='';

// ---- Registro ----
let nOk=0,nErr=0;
function log(t,m){const d=document.createElement('div');d.className=t;d.textContent=`[${new Date().toLocaleTimeString()}] ${m}`;$('log').prepend(d);}
function setStatus(t,c){$('status-text').textContent=t;$('status-pill').className='status-pill '+c;}
auto.hooks.log=log;auto.hooks.state=setStatus;
auto.hooks.done=ok=>{ok?nOk++:nErr++;$('cnt-ok').textContent=nOk;$('cnt-err').textContent=nErr;};

// ---- Tabla D-H (fija) ----
[['1',0,DH.d1,0,90],['2',0,0,DH.a2,0],['3',0,0,DH.a3,0],['4',0,0,DH.a4,90],['5',0,DH.d5,0,0]].forEach(([i,,d,a,al],n)=>
  $('dh-body').insertAdjacentHTML('beforeend',`<tr><td>${i}</td><td id="dh-${n}">0°</td><td>${d}</td><td>${a}</td><td>${al}°</td></tr>`));
['q1','q2','q3','q4','q5','grip'].forEach(k=>$('servo-body').insertAdjacentHTML('beforeend',`<tr><td>${NAMES[k].split(' (')[0]}</td><td id="sv-${k}"></td></tr>`));

// ---- Bucle principal (requestAnimationFrame) ----
let last=performance.now(),tick=0;
function frame(now){
  const dt=Math.min(.05,(now-last)/1000);last=now;
  arm.update(dt);
  const s=solve(); bench.setLed(s.I,s.burned);
  if((tick++%3)===0) updateUI(s);
  renderFrame(); requestAnimationFrame(frame);
}
function updateUI(s){
  const q=arm.cur;
  for(const k in q){
    $('v-'+k).textContent=k==='grip'?`${q[k].toFixed(0)}%`:`${q[k].toFixed(0)}°`;
    if(document.activeElement!==$('s-'+k)) $('s-'+k).value=q[k];
    const mov=Math.abs(arm.tgt[k]-q[k])>.5, lim=q[k]<=LIM[k][0]+1||q[k]>=LIM[k][1]-1;
    $('sv-'+k).innerHTML=`<span class="led ${mov?'mov':lim?'lim':'on'}"></span>${mov?'Moviendo':lim?'En límite':'Reposo'} · ${q[k].toFixed(1)}`;
  }
  ['q1','q2','q3','q4','q5'].forEach((k,n)=>$('dh-'+n).textContent=q[k].toFixed(0)+'°');
  const kin=fk(q.q1,q.q2,q.q3,q.q4,q.q5),p=kin.P5;
  $('pos-x').textContent=p.x.toFixed(2);$('pos-y').textContent=p.y.toFixed(2);$('pos-z').textContent=p.z.toFixed(2);
  $('matrix-container').innerHTML=kin.T05.flat().map(v=>`<div class="matrix-cell">${v.toFixed(2)}</div>`).join('');
  $('m-v').textContent=s.Vs.toFixed(2);$('m-i').textContent=(s.I*1000).toFixed(1);
  $('m-r').textContent=Number.isFinite(s.Rtot)?s.Rtot.toFixed(0):'∞';$('m-c').textContent=s.cont?'SÍ':'NO';
  $('circ-state').textContent='Circuito: '+s.state+(s.msg?` (${s.msg})`:'');$('circ-state').className='state-box '+s.cls;
  $('panel-state').textContent=`K1: ${bench.k1?'ON (luz verde)':'OFF (luz roja)'}`;
}
