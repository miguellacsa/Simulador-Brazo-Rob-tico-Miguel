// Cinemática directa e inversa del brazo 5-DOF (cm y grados). Y = altura.
export const DH = { d1: 7.0, a2: 12.0, a3: 10.0, a4: 6.0, d5: 4.0 };
export const LIM = { q1:[-180,180], q2:[-90,90], q3:[-120,120], q4:[-90,90], q5:[-180,180], grip:[0,100] };
const R = Math.PI/180, D = 180/Math.PI;
export const clamp = (v,[a,b]) => Math.min(b, Math.max(a, v));

export function fk(q1d,q2d,q3d,q4d,q5d){
  const [q1,q2,q3,q4,q5] = [q1d,q2d,q3d,q4d,q5d].map(v=>v*R);
  const c1=Math.cos(q1), s1=Math.sin(q1), a=q2+q3+q4;
  const r2=DH.a2*Math.cos(q2),       h2=DH.d1+DH.a2*Math.sin(q2);
  const r3=r2+DH.a3*Math.cos(q2+q3), h3=h2+DH.a3*Math.sin(q2+q3);
  const r4=r3+DH.a4*Math.cos(a),     h4=h3+DH.a4*Math.sin(a);
  const r5=r4+DH.d5*Math.cos(a),     h5=h4+DH.d5*Math.sin(a);
  const P=(r,h)=>({x:r*c1,y:h,z:r*s1});
  const ap=[c1*Math.cos(a),Math.sin(a),s1*Math.cos(a)];
  const w=[-c1*Math.sin(a),Math.cos(a),-s1*Math.sin(a)], e=[-s1,0,c1];
  const m=w.map((v,i)=>Math.cos(q5)*v+Math.sin(q5)*e[i]);
  const n=w.map((v,i)=>-Math.sin(q5)*v+Math.cos(q5)*e[i]);
  const p5=P(r5,h5);
  const T05=[[ap[0],m[0],n[0],p5.x],[ap[1],m[1],n[1],p5.y],[ap[2],m[2],n[2],p5.z],[0,0,0,1]];
  return { P0:P(0,0), P1:P(0,DH.d1), P2:P(r2,h2), P3:P(r3,h3), P4:P(r4,h4), P5:p5, T05 };
}
export function inLimits(q){ return ['q1','q2','q3','q4'].every(k => q[k]>=LIM[k][0]-1e-6 && q[k]<=LIM[k][1]+1e-6); }

// IK analítica (codo arriba); prueba varias inclinaciones de herramienta (phi).
export function ik(x,y,z,phis=[-90,-75,-60,-45,-30,-15,0]){
  const q1=Math.atan2(z,x)*D, r=Math.hypot(x,z), L=DH.a4+DH.d5;
  for(const ph of phis){
    const p=ph*R, wx=r-L*Math.cos(p), wy=y-DH.d1-L*Math.sin(p);
    const c3=(wx*wx+wy*wy-DH.a2**2-DH.a3**2)/(2*DH.a2*DH.a3);
    if(Math.abs(c3)>1) continue;
    const s3=-Math.sqrt(1-c3*c3), q3=Math.atan2(s3,c3);
    const q2=Math.atan2(wy,wx)-Math.atan2(DH.a3*s3,DH.a2+DH.a3*c3);
    const q={q1,q2:q2*D,q3:q3*D,q4:ph-q2*D-q3*D};
    if(inLimits(q)) return q;
  }
  return null;
}

// Colisión simple del brazo con la mesa y con la base (placa 22x22, altura ~3.6 cm)
export function collides(q){
  const k=fk(q.q1,q.q2,q.q3,q.q4,q.q5), segs=[[k.P1,k.P2],[k.P2,k.P3],[k.P3,k.P4],[k.P4,k.P5]];
  for(const [a,b] of segs) for(let i=0;i<=10;i++){
    const t=i/10,x=a.x+(b.x-a.x)*t,y=a.y+(b.y-a.y)*t,z=a.z+(b.z-a.z)*t;
    if(y<(Math.abs(x)<11.5&&Math.abs(z)<11.5?3.8:0.3)) return true;
  }
  return false;
}
