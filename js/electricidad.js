// Modelo eléctrico: fuente CC -> S1 -> R1 -> LED -> GND (Ley de Ohm + caída directa del LED).
export const circuit = { Vs:5.0, R:330, Vf:2.0, Ilim:0.5, Imax_led:0.030, S1:true, fault:'none',
  parts:{R:false, LED:false, C:false} };
const f=(v,d=2)=>Number.isFinite(v)?v.toFixed(d):'∞';

export function solve(){
  const c=circuit,p=c.parts;
  const o={Vs:c.Vs,I:0,Vr:0,Vled:0,Rtot:Infinity,closed:false,state:'ABIERTO',cls:'bad',msg:'',burned:false,
    cont:p.R&&p.LED&&c.fault!=='open', Rslot:p.R?c.R:Infinity};
  if(c.fault==='railshort'){ o.I=c.Ilim; o.Vs=c.Ilim*0.1; o.Rtot=0.1; o.state='CORTOCIRCUITO (limitador activo)'; return o; }
  if(!c.S1){ o.msg='S1 abierto'; return o; }
  if(!p.R||!p.LED){ o.msg='Faltan componentes'; return o; }
  if(c.fault==='open'){ o.msg='Pista abierta'; return o; }
  o.closed=true;
  if(c.fault==='ledshort'){ o.I=c.Vs/(c.R+0.05); o.Vr=o.I*c.R; o.Vled=0; o.state='LED EN CORTO'; o.cls='warn'; }
  else { o.I=Math.max(0,(c.Vs-c.Vf)/c.R); o.Vr=o.I*c.R; o.Vled=Math.min(c.Vf,c.Vs); o.state='CERRADO (conduce)'; o.cls='ok'; }
  o.Rtot=o.I>0?c.Vs/o.I:Infinity;
  if(o.I>c.Imax_led && c.fault!=='ledshort'){ o.burned=true; o.state='SOBRECORRIENTE: LED dañado'; o.cls='bad'; }
  return o;
}
export function measure(kind){
  const s=solve(), c=circuit;
  switch(kind){
    case 'V': return {ok:true, text:`Voltaje → Vfuente=${f(s.Vs)} V · V(R1)=${f(s.Vr)} V · V(LED)=${f(s.Vled)} V`};
    case 'I': return {ok:s.closed, text:`Corriente → I=${f(s.I*1000,1)} mA [(${f(c.Vs,1)}−${f(c.Vf,1)})/${c.R}]`+(s.closed?'':' (lazo abierto)')};
    case 'R': return {ok:c.parts.R, text:`Resistencia → R1=${f(s.Rslot,0)} Ω · R equivalente del lazo=${f(s.Rtot,0)} Ω`};
    case 'C': return {ok:s.cont, text:`Continuidad R1→LED→GND: ${s.cont?'SÍ (pitido)':'NO (circuito abierto)'}`};
  }
}
export function inspect(){
  const c=circuit,p=c.parts,s=solve(),out=[];
  out.push({ok:p.R,msg:p.R?`R1 conectada (${c.R} Ω)`:'R1 desconectada'});
  out.push({ok:p.LED,msg:p.LED?'LED conectado':'LED desconectado'});
  out.push({ok:p.C,msg:p.C?'C1 conectado (bloquea CC, sin efecto en régimen)':'C1 desconectado'});
  out.push({ok:c.S1,msg:c.S1?'S1 cerrado':'S1 abierto'});
  out.push({ok:c.fault==='none',msg:c.fault==='none'?'Sin fallas en pistas':`Falla detectada: ${c.fault}`});
  if(s.burned) out.push({ok:false,msg:`Sobrecorriente en LED: ${f(s.I*1000,1)} mA > 30 mA`});
  return out;
}
