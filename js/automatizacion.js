// Tareas automáticas: cada una ejecuta movimientos reales del brazo (IK + pinza).
import { arm, bench, SLOTS, TRAY, BINS, PANEL } from './robot3d.js';
import { circuit, measure, inspect } from './electricidad.js';

export const hooks={ log:()=>{}, state:()=>{}, done:()=>{} };
let busy=false;
export const isBusy=()=>busy;
const wait=async ms=>{await new Promise(r=>setTimeout(r,ms)); if(arm.estop)throw new Error('ESTOP');};
const UP=9, PICK=1.9;

async function pick(o){
  const p=o.getWorldPosition(o.position.clone());
  await arm.setGrip(100); await arm.moveXYZ(p.x,UP,p.z); await arm.moveXYZ(p.x,PICK,p.z);
  await arm.setGrip(22); arm.grab(o); await arm.moveXYZ(p.x,UP,p.z);
}
async function place(o,x,z,y,dropY=y+1.5){
  await arm.moveXYZ(x,UP,z); await arm.moveXYZ(x,dropY,z);
  await arm.setGrip(100); arm.release(o,x,y,z); await arm.moveXYZ(x,UP,z); await arm.setGrip(50);
}
async function probe(x,z){ await arm.setGrip(0); await arm.moveXYZ(x,3,z); await wait(350); }

const tasks={
  async assemble(){
    for(const k of ['R','LED','C']){
      const o=bench.parts[k]; hooks.log('info',`Tomando ${k} de la bandeja`);
      await pick(o); await place(o,SLOTS[k].x,SLOTS[k].z,.8); circuit.parts[k]=true; o.userData.where='board';
      hooks.log('ok',`${k} insertado en protoboard (${SLOTS[k].x}, ${SLOTS[k].z})`);
    }
    await arm.home();
  },
  async volt(){ await probe(SLOTS.R.x,SLOTS.R.z); hooks.log('info',measure('V').text); await arm.home(); },
  async curr(){ await probe(SLOTS.LED.x,SLOTS.LED.z); const m=measure('I'); hooks.log(m.ok?'info':'warn',m.text); await arm.home(); },
  async res(){ await probe(SLOTS.R.x,SLOTS.R.z); const m=measure('R'); hooks.log(m.ok?'info':'warn',m.text); await arm.home(); },
  async cont(){ await probe(SLOTS.R.x,SLOTS.R.z); await probe(SLOTS.LED.x,SLOTS.LED.z); const m=measure('C'); hooks.log(m.ok?'ok':'warn',m.text); await arm.home(); },
  async inspect(){
    for(const k of ['R','LED','C']){ await probe(SLOTS[k].x,SLOTS[k].z); }
    let errs=0; inspect().forEach(r=>{hooks.log(r.ok?'ok':'err',(r.ok?'✔ ':'✘ ')+r.msg); if(!r.ok)errs++;});
    hooks.log(errs?'warn':'ok',`Inspección terminada: ${errs} hallazgo(s)`); await arm.home();
  },
  async sort(){
    for(const k of ['R','LED','C']){
      const o=bench.parts[k]; if(o.userData.where==='bin') continue;
      await pick(o); await place(o,BINS[k].x,BINS[k].z,.45,3.4); circuit.parts[k]=false; o.userData.where='bin';
      hooks.log('ok',`${k} clasificado en su contenedor`);
    }
    await arm.home();
  },
  async panel(){
    await arm.setGrip(0);
    for(const n of ['START','STOP']){
      const x=PANEL[n]; await arm.moveXYZ(x,PANEL.y,-21.5,[0,10,-10,20]);
      await arm.moveXYZ(x,PANEL.y,PANEL.z+.6,[0,10,-10,20]); await bench.press(n);
      hooks.log('info',n==='START'?'START pulsado → relé K1 energizado, luz verde ON':'STOP pulsado → K1 desenergizado, luz roja ON');
      await wait(900); await arm.moveXYZ(x,PANEL.y,-21.5,[0,10,-10,20]);
    }
    await arm.home();
  },
  async home(){ await arm.home(); }
};

export async function run(name){
  if(arm.estop){hooks.log('err','Parada de emergencia activa: rearme primero');return;}
  if(busy){hooks.log('warn','Hay una tarea en curso');return;}
  busy=true; hooks.state(name,'busy');
  try{ await tasks[name](); hooks.log('ok',`Tarea "${name}" completada`); hooks.done(true); }
  catch(e){ hooks.log('err',e.message==='ESTOP'?`Tarea "${name}" abortada por parada de emergencia`:`Tarea "${name}": ${e.message}`); hooks.done(false); }
  finally{ busy=false; hooks.state(arm.estop?'EMERGENCIA':'Inactivo',arm.estop?'stop':''); }
}
