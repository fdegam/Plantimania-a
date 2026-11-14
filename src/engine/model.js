// Generación del modelo 3D de cada especie (masas, ramas, hojas, rocas y raíces).
import {mulberry,U,N} from "./random.js";
import {SPECIES,GROVE} from "./species.js";
/* ---------- modelo 3D ---------- */
const v3={add:(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]],mul:(a,s)=>[a[0]*s,a[1]*s,a[2]*s],norm:a=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];},cross:(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]]};
const dirAE=(az,el)=>[Math.cos(az)*Math.cos(el),Math.sin(el),Math.sin(az)*Math.cos(el)];
function curve3(a,b,bend){const m=[(a[0]+b[0])/2+bend[0],(a[1]+b[1])/2+bend[1],(a[2]+b[2])/2+bend[2]];const pts=[];for(let i=0;i<=14;i++){const t=i/14,u=1-t;pts.push([u*u*a[0]+2*u*t*m[0]+t*t*b[0],u*u*a[1]+2*u*t*m[1]+t*t*b[1],u*u*a[2]+2*u*t*m[2]+t*t*b[2]]);}return pts;}
function leaf3(B,dir,L,w,droop,roll,R,kind){
  let side=v3.cross(dir,[0,1,0]);if(Math.hypot(side[0],side[1],side[2])<1e-3)side=[1,0,0];side=v3.norm(side);
  const nrm=v3.norm(v3.cross(side,dir));const sv=v3.add(v3.mul(side,Math.cos(roll)),v3.mul(nrm,Math.sin(roll)));
  const n=16,ph=R()*6.28,C=[],Lf=[],Rt=[];
  for(let i=0;i<=n;i++){const t=i/n;const c=v3.add(v3.add(B,v3.mul(dir,L*t)),[0,-droop*L*t*t,0]);C.push(c);
    let wp;if(kind==="blade")wp=w*Math.pow(1-t,0.9);else if(kind==="petal")wp=w*Math.pow(Math.sin(Math.PI*t),0.5);else wp=w*Math.pow(Math.sin(Math.PI*t),0.75)*(1-0.25*t);
    if(kind==="wavy")wp*=1+0.1*Math.sin(t*20+ph);
    Lf.push(v3.add(c,v3.mul(sv,wp)));Rt.push(v3.add(c,v3.mul(sv,-wp)));}
  return {outline:Lf.concat(Rt.slice(0,n).reverse()),rib:(kind==="blade"||kind==="petal")?null:C.slice(0,n-1),center:kind==="blade"?C:null};
}
function shiftModel(m,ox,oz){
  const sp=q=>[q[0]+ox,q[1],q[2]+oz];
  return {clumps:m.clumps.map(c=>Object.assign({},c,{x:c.x+ox,z:c.z+oz})),limbs:m.limbs.map(L=>Object.assign({},L,{pts:L.pts.map(sp)})),
    twigs:(m.twigs||[]).map(t=>t.map(sp)),leaves:(m.leaves||[]).map(l=>({outline:l.outline.map(sp),rib:l.rib?l.rib.map(sp):null,center:l.center?l.center.map(sp):null,veins:l.veins?l.veins.map(v_=>v_.map(sp)):undefined})),H:m.H,W:m.W};
}
function gen(p){
  if(GROVE.has(p.species)&&p.tallos>1){
    const R=mulberry(p.seed*13+7),pos=[[0,0]],n=p.tallos;let tries=0;
    while(pos.length<n&&tries<500){tries++;const b=pos[Math.floor(R()*pos.length)],a=R()*6.283,d=p.W*U(R,0.55,0.9),q=[b[0]+Math.cos(a)*d,b[1]+Math.sin(a)*d*0.8];
      if(pos.every(o=>Math.hypot(o[0]-q[0],o[1]-q[1])>p.W*0.5))pos.push(q);}
    const parts=pos.map(([ox,oz],i)=>{const sc=i?U(R,0.8,1.08):1;return shiftModel(genOne(Object.assign({},p,{seed:p.seed+i*101,H:p.H*sc,W:p.W*sc,tallos:1})),ox,oz);});
    const ext=Math.max(...pos.map(q=>Math.abs(q[0])))*2;
    const m={clumps:[],limbs:[],twigs:[],leaves:[],H:Math.max(...parts.map(q=>q.H)),W:p.W+ext};
    for(const q of parts){m.clumps.push(...q.clumps);m.limbs.push(...q.limbs);m.twigs.push(...q.twigs);m.leaves.push(...q.leaves);}
    m.roots=p.rt==='ninguno'?{limbs:[],lines:[],spread:0}:genRoots(m,p);return m;
  }
  return genOne(GROVE.has(p.species)?Object.assign({},p,{tallos:1}):p);
}
function genOne(p){
  const g={conifera:genConifera,hiedra:genHiedra,roca:genRoca,arbusto:genArbusto,cipres:genCipres,olivo:genOlivo,masas:genMasas,multitallo:genMultitallo,rosetas:genRosetas,palmera:genPalmera,hojagrande:genHojaGrande,graminea:genGraminea}[p.mode]||genMasas;
  const m=g(p);m.leaves=m.leaves||[];m.roots=p.rt==='ninguno'?{limbs:[],lines:[],spread:0}:genRoots(m,p);return m;
}
function genMultitallo(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,clumps=[],limbs=[],twigs=[];
  const n=Math.max(2,p.tallos),w0=Math.max(0.015,H*0.006);
  const spread=Math.min(1.4,W/H*1.1);
  const addC=(q,r)=>clumps.push({x:q[0],y:q[1],z:q[2],r,sy:U(R,0.75,0.95),seed:Math.floor(R()*1e9)});
  const grow=(B,dir,L,w,dep)=>{
    const E=v3.add(B,v3.mul(dir,L));const pts=curve3(B,E,[N(R)*L*0.08,0,N(R)*L*0.08]);limbs.push({pts,w0:w,w1:w*0.6,trunk:dep===0});
    if(dep>=1){for(let j=0;j<3;j++){const b0=pts[Math.floor(U(R,0.5,1)*14)];const l=L*U(R,0.2,0.4);const e=[b0[0]+N(R)*l*0.5,b0[1]+l*U(R,0.3,0.8),b0[2]+N(R)*l*0.5];twigs.push([b0,[(b0[0]+e[0])/2+N(R)*l*0.1,(b0[1]+e[1])/2,(b0[2]+e[2])/2],e]);}}
    if(dep<2){for(let j=0;j<2;j++){const s0=pts[Math.floor(U(R,0.55,0.95)*14)];const az=Math.atan2(dir[2],dir[0])+N(R)*0.8;const el=Math.asin(Math.max(-1,Math.min(1,dir[1])))-U(R,0.05,0.35)*spread;grow(s0,dirAE(az,Math.max(0.45,el)),L*U(R,0.42,0.6),w*0.55,dep+1);}
      if(dep===1&&R()<0.6*p.dens)addC(pts[10],W*0.06*p.cs*U(R,0.7,1.2));}
    else{const k=Math.max(1,Math.round(2*p.dens));for(let j=0;j<k;j++)addC(v3.add(E,[N(R)*W*0.06,N(R)*W*0.04,N(R)*W*0.06]),W*0.062*p.cs*U(R,0.7,1.3));}
  };
  for(let i=0;i<n;i++){const az=2*Math.PI*i/n+N(R)*0.3;const el=Math.PI/2-U(R,0.08,0.3)*spread;grow([N(R)*W*0.03,0,N(R)*W*0.03],dirAE(az,el),H*U(R,0.5,0.62),w0,0);}
  return {clumps,limbs,twigs,H,W};
}
function genRosetas(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,limbs=[],leaves=[];
  const w0=Math.max(0.03,H*0.013);
  const trunkTop=[N(R)*0.05,H*Math.max(0.15,p.tr),N(R)*0.05];
  limbs.push({pts:curve3([0,0,0],trunkTop,[N(R)*0.1,0,N(R)*0.1]),w0,w1:w0*0.75,trunk:true});
  const levels=Math.max(2,Math.min(4,p.ramas||3));
  const L0=Math.hypot(W*0.42,(H-trunkTop[1])*0.8)/[0,1,1,1.72,2.24,2.61][levels];
  const rosette=(T)=>{
    const nl=Math.round(U(R,9,13)),lr=W*0.1*p.cs,az0=R()*6.28;
    for(let k=0;k<nl;k++){const az=az0+2*Math.PI*k/nl+N(R)*0.15;leaves.push(leaf3(T,dirAE(az,U(R,0.12,0.7)),lr*U(R,0.75,1.15),lr*0.17,0.15,N(R)*0.3,R,"lanceolada"));}
    const nf=R()<0.7*p.dens?Math.round(U(R,1,3)):0;
    for(let f=0;f<nf;f++){const C=v3.add(T,[N(R)*lr*0.25,lr*0.28,N(R)*lr*0.25]),a1=R()*6.28;for(let k=0;k<5;k++)leaves.push(leaf3(C,dirAE(a1+2*Math.PI*k/5,U(R,0.45,0.85)),lr*0.32,lr*0.14,0,0,R,"petal"));}
  };
  const grow=(B,dir,L,w,lev)=>{
    const E=v3.add(B,v3.mul(dir,L));const pts=curve3(B,E,[N(R)*L*0.1,Math.abs(N(R))*L*0.05,N(R)*L*0.1]);limbs.push({pts,w0:w,w1:w*0.7,trunk:false});
    if(lev>=levels){rosette(E);return;}
    const k=R()<0.3?3:2,az=Math.atan2(dir[2],dir[0]);
    for(let j=0;j<k;j++){const naz=az+(j-(k-1)/2)*U(R,0.6,1.1)+N(R)*0.3;const nel=Math.max(0.2,Math.asin(Math.max(-1,Math.min(1,dir[1])))-U(R,0.05,0.25));grow(E,dirAE(naz,nel),L*U(R,0.65,0.8),w*0.62,lev+1);}
    if(lev===levels-1&&R()<0.5*p.dens)rosette(pts[9]);
  };
  const nb=R()<0.4?2:3;for(let j=0;j<nb;j++)grow(trunkTop,dirAE(2*Math.PI*j/nb+R(),U(R,0.85,1.2)),L0,w0*0.68,1);
  return {clumps:[],limbs,leaves,H,W};
}
function genPalmera(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,limbs=[],leaves=[];
  const Lf=W*0.52*p.cs,Ht=Math.max(H*0.35,H-Lf*0.42),w0=Math.max(0.1,H*0.025);
  const top=[N(R)*H*0.04,Ht,N(R)*H*0.04];
  limbs.push({pts:curve3([0,0,0],top,[N(R)*H*0.05,0,N(R)*H*0.05]),w0,w1:w0*0.85,trunk:false,rings:true});
  const nf=Math.max(5,Math.round(14*p.dens));
  for(let i=0;i<nf;i++){
    const az=R()*6.283,el=U(R,-0.55,1.25),L=Lf*U(R,0.8,1.05),droop=U(R,0.25,0.55);
    const hor=[Math.cos(az),0,Math.sin(az)],side=[-Math.sin(az),0,Math.cos(az)];
    const P=(t)=>v3.add(top,[hor[0]*L*t*Math.cos(el),L*t*Math.sin(el)-droop*L*t*t,hor[2]*L*t*Math.cos(el)]);
    const rach=[];for(let k=0;k<=14;k++)rach.push(P(k/14));
    limbs.push({pts:rach,w0:Math.max(0.006,L*0.006),w1:L*0.002,trunk:false});
    for(let k=3;k<30;k++){const t=k/30,c=P(t),nx=P(t+0.01),fwd=v3.norm([nx[0]-c[0],nx[1]-c[1],nx[2]-c[2]]);
      const ll=L*0.2*Math.pow(Math.sin(Math.PI*Math.min(1,t*1.05)),0.6)+L*0.025;
      for(const sg of [-1,1]){const d=v3.norm(v3.add(v3.add(v3.mul(side,sg),v3.mul(fwd,0.75)),[0,-U(R,0.1,0.6),0]));leaves.push(leaf3(c,d,ll,ll*0.045,0.08,0.9,R,"blade"));}}
  }
  return {clumps:[],limbs,leaves,H,W};
}
function genHojaGrande(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,limbs=[],leaves=[];
  const n=Math.max(4,Math.round(16*p.dens));
  for(let i=0;i<n;i++){
    const az=R()*6.283,el=U(R,0.6,1.35),B=[N(R)*W*0.04,0,N(R)*W*0.04];
    const Lp=H*U(R,0.25,0.5),E=v3.add(B,v3.mul(dirAE(az,el),Lp));
    limbs.push({pts:curve3(B,E,[0,0,0]),w0:Math.max(0.004,H*0.007),w1:Math.max(0.003,H*0.005),trunk:false});
    const L=Math.min(W*0.55,H*0.6)*p.cs*U(R,0.7,1.1);
    leaves.push(leaf3(E,dirAE(az+N(R)*0.12,el-U(R,0.25,0.8)),L,L*0.2,U(R,0.1,0.45),N(R)*0.6,R,"wavy"));
  }
  return {clumps:[],limbs,leaves,H,W};
}
function genGraminea(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,leaves=[];
  const n=Math.max(20,Math.round(110*p.dens));
  for(let i=0;i<n;i++){
    const az=R()*6.283,el=U(R,0.7,1.5),B=[N(R)*W*0.05,0,N(R)*W*0.05];
    let L=H*U(R,0.5,1.05)/Math.sin(el);L=Math.min(L,(W*0.55)/Math.max(0.15,Math.cos(el)));
    leaves.push(leaf3(B,dirAE(az,el),L,H*0.0035*p.cs+0.001,U(R,0.05,0.5)*(1.6-el),N(R)*0.5,R,"blade"));
  }
  return {clumps:[],limbs:[],leaves,H,W};
}
function cub3(a,b,c,d){const pts=[];for(let i=0;i<=14;i++){const t=i/14,u=1-t;pts.push([0,1,2].map(k=>u*u*u*a[k]+3*u*u*t*b[k]+3*u*t*t*c[k]+t*t*t*d[k]));}return pts;}
function genOlivo(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,clumps=[],limbs=[],twigs=[];
  const Ht=H*Math.max(0.15,p.tr),w0=Math.max(0.06,H*0.042);
  const laz=R()*6.283,lean=Ht*U(R,0.15,0.4),ld=[Math.cos(laz),0,Math.sin(laz)],side=[-ld[2],0,ld[0]];
  const s1=U(R,0.1,0.25)*Ht*(R()<0.5?-1:1);
  const P0=[0,0,0],P3=[ld[0]*lean,Ht,ld[2]*lean];
  const P1=[ld[0]*lean*0.05+side[0]*s1,Ht*0.38,ld[2]*lean*0.05+side[2]*s1];
  const P2=[ld[0]*lean-side[0]*s1*0.8,Ht*0.72,ld[2]*lean-side[2]*s1*0.8];
  limbs.push({pts:cub3(P0,P1,P2,P3),w0,w1:w0*0.8,trunk:true,flare:0.9,spiral:true,knots:true});
  const tips=[];
  const grow=(B,dir,L,w,dep)=>{
    const E=v3.add(B,v3.mul(dir,L)),sd=v3.norm(v3.cross(dir,[0,1,0])),k1=N(R)*L*0.18,k2=N(R)*L*0.18;
    const pts=cub3(B,v3.add(v3.add(B,v3.mul(dir,L*0.33)),v3.mul(sd,k1)),v3.add(v3.add(B,v3.mul(dir,L*0.66)),v3.mul(sd,k2)),E);
    limbs.push({pts,w0:w,w1:w*0.62,trunk:false,flare:0,spiral:dep===0});
    if(dep<2){const k=dep===0?2:(R()<0.5?2:3),az=Math.atan2(dir[2],dir[0]),el=Math.asin(Math.max(-1,Math.min(1,dir[1])));
      for(let j=0;j<k;j++)grow(pts[Math.floor(U(R,0.7,1)*14)],dirAE(az+(j-(k-1)/2)*U(R,0.5,0.9)+N(R)*0.25,Math.max(0.15,el-U(R,0.05,0.3))),L*U(R,0.55,0.75),w*0.58,dep+1);}
    else tips.push(E);
    if(dep>=1)for(let j=0;j<2;j++){const b0=pts[Math.floor(U(R,0.5,1)*14)],l=L*U(R,0.25,0.5),e=[b0[0]+N(R)*l*0.5,b0[1]+l*U(R,0.2,0.7),b0[2]+N(R)*l*0.5];twigs.push([b0,[(b0[0]+e[0])/2+N(R)*l*0.1,(b0[1]+e[1])/2,(b0[2]+e[2])/2],e]);}
  };
  const ns=Math.max(2,p.tallos),reach=Math.hypot(W*0.45,(H-Ht)*0.6);
  for(let i=0;i<ns;i++)grow(P3,dirAE(laz+2*Math.PI*i/ns+N(R)*0.4,U(R,0.55,0.95)),reach*0.48,w0*0.62,0);
  const cx=P3[0],cz=P3[2],ymin=Ht+(H-Ht)*0.12,ry=(H-ymin)/1.7,cy=H-ry,rxz=W/2;
  const rt=()=>W*0.052*p.cs*U(R,0.6,1.4);
  const n=Math.round(120*p.dens),ph=R()*6.28;
  for(let i=0;i<n;i++){
    const az=R()*6.283,elv=Math.pow(R(),0.7)*Math.PI/2-0.35,r=rt(),sh=U(R,0.72,1),wob=1+0.15*Math.sin(3*az+ph);
    clumps.push({x:cx+Math.cos(az)*Math.cos(elv)*(rxz-r*0.6)*sh*wob,y:cy+Math.sin(elv)*(ry-r*0.5)*sh,z:cz+Math.sin(az)*Math.cos(elv)*(rxz-r*0.6)*sh*wob,r,sy:U(R,0.6,0.85),seed:Math.floor(R()*1e9),fine:true});
  }
  for(const t of tips)for(let j=0;j<2;j++){const r=rt()*0.8;clumps.push({x:t[0]+N(R)*r,y:t[1]+r*0.3,z:t[2]+N(R)*r,r,sy:0.7,seed:Math.floor(R()*1e9),fine:true});}
  return {clumps,limbs,twigs,H,W};
}
function genCipres(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,clumps=[],limbs=[],twigs=[];
  const yb=H*Math.max(0.04,p.tr),Rm=W/2,w0=Math.max(0.05,H*0.013),ns=Math.max(1,Math.min(3,p.tallos));
  for(let i=0;i<ns;i++){const bx=ns>1?(i-(ns-1)/2)*w0*2.2:0,top=[bx*0.4+N(R)*0.05,H*0.82,N(R)*0.05];
    limbs.push({pts:curve3([bx,0,N(R)*w0*0.5],top,[N(R)*0.08,0,N(R)*0.08]),w0:ns>1?w0*0.8:w0,w1:w0*0.3,trunk:true});}
  const prof=t=>Rm*Math.pow(Math.sin(Math.PI*Math.min(1,0.08+0.92*Math.pow(t,0.8))),0.75)*(1-0.1*t)*(1+0.08*Math.sin(t*9+R()*0));
  const tiers=Math.max(5,Math.round(11*p.dens));
  for(let k=0;k<tiers;k++){
    const t=k/(tiers-1),y0=yb+t*(H-yb)*0.86,per=Math.round(U(R,5,8));
    for(let j=0;j<per;j++){
      const az=2*Math.PI*j/per+R()*0.9,pf=prof(Math.min(1,t+0.06));
      const rx=Math.max(pf*U(R,0.32,0.5),W*0.06)*p.cs,hh=(H-yb)*U(R,0.12,0.2)*(1-0.35*t)*p.cs,ry=hh/2;
      const outer=R()<0.4,rr=outer?pf*U(R,0.72,0.98):Math.max(0,pf-rx*0.8)*U(R,0.5,1);
      clumps.push({x:Math.cos(az)*rr,y:Math.min(y0+ry*0.9,H-ry*0.95),z:Math.sin(az)*rr,r:rx,sy:ry/rx,seed:Math.floor(R()*1e9),flame:true});
    }
  }
  for(let k=0;k<3;k++){const rx=W*U(R,0.05,0.08)*p.cs,sy=U(R,4,6);clumps.push({x:N(R)*Rm*0.2,y:H-rx*sy*U(R,0.9,1.3),z:N(R)*Rm*0.2,r:rx,sy,seed:Math.floor(R()*1e9),flame:true});}
  return {clumps,limbs,twigs,H,W};
}
function genArbusto(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,clumps=[],limbs=[],twigs=[],leaves=[];
  const hedge=p.tipo==="seto",D=hedge?Math.min(0.9,Math.max(0.45,H*0.6)):W;
  const base=hedge?H*0.17:Math.min(W,H*1.3)*0.15;
  const rc=()=>base*p.cs*U(R,0.7,1.3);
  const n=Math.round((hedge?Math.max(30,W/H*40):70)*p.dens);
  const pos=[];
  for(let i=0;i<n;i++){
    const r=rc();let x,y,z;
    if(!hedge){
      const az=R()*6.283,el=Math.asin(R());const sh=U(R,0.82,1);
      x=Math.cos(az)*Math.cos(el)*(W/2-r*0.7)*sh;z=Math.sin(az)*Math.cos(el)*(W/2-r*0.7)*sh*0.9;y=Math.max(r*0.55,Math.sin(el)*(H-r*0.75)*sh);
    } else {
      const top=R()<0.32;x=U(R,-W/2+r*0.7,W/2-r*0.7);
      if(top){y=H-r*U(R,0.72,0.9);z=U(R,-D/2+r*0.6,D/2-r*0.6);}
      else{y=U(R,r*0.55,H-r*0.8);z=(R()<0.5?-1:1)*(D/2-r*U(R,0.55,0.8));}
      const ex=Math.abs(x)-(W/2-D*0.35);if(ex>0&&y>H-D*0.35)y-=ex*0.6;
    }
    clumps.push({x,y,z,r,sy:U(R,0.78,0.95),seed:Math.floor(R()*1e9),fine:true});pos.push([x,y,z,r]);
  }
  const ns=Math.max(2,p.tallos);
  for(let i=0;i<ns;i++){const bx=hedge?-W/2*0.85+W*0.85*(i+0.5)/ns:N(R)*W*0.06,top=[bx*0.8+N(R)*W*0.08,H*U(R,0.45,0.7),N(R)*D*0.1];limbs.push({pts:curve3([bx,0,N(R)*D*0.05],top,[N(R)*0.05,0,N(R)*0.05]),w0:Math.max(0.008,H*0.012),w1:Math.max(0.004,H*0.006),trunk:true});}
  // brotes que asoman por el borde
  const nb=Math.round((hedge?6:14)*p.dens);
  for(let i=0;i<nb;i++){
    const c=pos[Math.floor(R()*pos.length)];const out=v3.norm([c[0],hedge?(c[1]-H*0.5)*0.6+0.4:c[1]*0.9+0.2,c[2]]);
    const b=[c[0]+out[0]*c[3]*0.6,c[1]+out[1]*c[3]*0.6,c[2]+out[2]*c[3]*0.6],L=c[3]*U(R,0.9,1.8);
    const d=v3.norm([out[0]+N(R)*0.3,out[1]+0.6,out[2]+N(R)*0.3]),e=v3.add(b,v3.mul(d,L)),m=v3.add(v3.add(b,v3.mul(d,L*0.5)),[N(R)*L*0.1,0,N(R)*L*0.1]);
    twigs.push([b,m,e]);
    const nl=Math.round(U(R,4,8));for(let k=0;k<nl;k++){const t=0.3+0.7*k/nl,q=[b[0]+(e[0]-b[0])*t,b[1]+(e[1]-b[1])*t,b[2]+(e[2]-b[2])*t],az=R()*6.283;leaves.push(leaf3(q,v3.norm(v3.add(d,v3.mul(dirAE(az,0.2),0.9))),L*U(R,0.22,0.35),L*0.07,0.05,N(R)*0.5,R,"lanceolada"));}
    leaves.push(leaf3(e,d,L*0.28,L*0.06,0,0,R,"lanceolada"));
  }
  return {clumps,limbs,twigs,leaves,H,W};
}
function ivyLeaf(C,u,nrm,sz,R){
  const w=v3.norm(v3.cross(nrm,u)),u2=v3.norm(v3.cross(w,nrm));
  const lb=[[0,1],[0.8,0.72],[-0.8,0.72],[1.65,0.42],[-1.65,0.42]],nl=R()<0.35?3:5,pts=[];
  for(let i=0;i<=56;i++){const a=-Math.PI+2*Math.PI*i/56;let r=0.34;for(let k=0;k<nl;k++){const d=a-lb[k][0];r+=lb[k][1]*0.66*Math.exp(-Math.abs(d)/0.19);}
    const bd=Math.PI-Math.abs(a);if(bd<0.4)r*=0.55+0.45*bd/0.4;r*=sz;pts.push(v3.add(C,v3.add(v3.mul(u2,Math.cos(a)*r),v3.mul(w,Math.sin(a)*r))));}
  const veins=[];for(let k=0;k<nl;k++){const t=lb[k];veins.push([C,v3.add(C,v3.add(v3.mul(u2,Math.cos(t[0])*t[1]*0.78*sz),v3.mul(w,Math.sin(t[0])*t[1]*0.78*sz)))]);}
  return {outline:pts,veins,base:v3.add(C,v3.mul(u2,-0.2*sz))};
}
function genHiedra(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,leaves=[],twigs=[],wall=p.tipo==="muro";
  const sz=0.055*p.cs,step=0.035,ns=Math.max(1,p.tallos);
  const grow=(P,ang,maxL,depth)=>{
    let pts=[P],L=0,side=1,k=0;const top=H*U(R,0.75,1);
    while(L<maxL){
      ang+=N(R)*0.28;if(wall)ang+=(Math.PI/2-ang)*0.08;
      const last=pts[pts.length-1];let np;
      if(wall){np=[last[0]+Math.cos(ang)*step,last[1]+Math.sin(ang)*step,0.015];if(np[0]<-W/2||np[0]>W/2){ang=Math.PI-ang;np[0]=Math.max(-W/2,Math.min(W/2,np[0]));}if(np[1]>top)break;}
      else{np=[last[0]+Math.cos(ang)*step,0.012,last[2]+Math.sin(ang)*step];if(Math.hypot(np[0],np[2]*1.3)>W/2)break;}
      pts.push(np);L+=step;k++;
      if(R()<0.75*p.dens){
        side=-side;const tang=wall?[Math.cos(ang),Math.sin(ang),0]:[Math.cos(ang),0,Math.sin(ang)];
        let C,u,nrm;const s=sz*U(R,0.7,1.3);
        if(wall){const perp=[-tang[1],tang[0],0];C=[np[0]+perp[0]*side*s*0.9,np[1]+perp[1]*side*s*0.9+s*0.3,0.03+U(R,0,0.13)];
          const a=Math.PI/2+side*U(R,0.1,0.9)+N(R)*0.3;u=[Math.cos(a),Math.sin(a),0];nrm=v3.norm([N(R)*0.25,N(R)*0.15,1]);}
        else{const perp=[-tang[2],0,tang[0]];C=[np[0]+perp[0]*side*s,U(R,0.02,H),np[2]+perp[2]*side*s];
          const a=R()*6.283;u=[Math.cos(a),0,Math.sin(a)];nrm=v3.norm([N(R)*0.35,1,N(R)*0.35]);}
        const lf=ivyLeaf(C,u,nrm,s,R);leaves.push({outline:lf.outline,veins:lf.veins});twigs.push([np,[(np[0]+lf.base[0])/2,(np[1]+lf.base[1])/2,(np[2]+lf.base[2])/2],lf.base]);
      }
      if(depth<3&&R()<0.035)grow(np,ang+(R()<0.5?-1:1)*U(R,0.5,0.9),maxL*U(R,0.3,0.6),depth+1);
    }
    if(pts.length>1)twigs.push(pts);
  };
  for(let i=0;i<ns;i++){
    if(wall)grow([-W/2+W*(i+0.5)/ns+N(R)*W*0.05,0,0.015],Math.PI/2+N(R)*0.3,H*2.2,0);
    else grow([N(R)*W*0.05,0.012,N(R)*W*0.05],2*Math.PI*i/ns+N(R)*0.3,W*1.4,0);
  }
  return {clumps:[],limbs:[],twigs,leaves,H,W};
}
function icosphere(n){
  const t=(1+Math.sqrt(5))/2;let V=[[-1,t,0],[1,t,0],[-1,-t,0],[1,-t,0],[0,-1,t],[0,1,t],[0,-1,-t],[0,1,-t],[t,0,-1],[t,0,1],[-t,0,-1],[-t,0,1]].map(v3.norm);
  let F=[[0,11,5],[0,5,1],[0,1,7],[0,7,10],[0,10,11],[1,5,9],[5,11,4],[11,10,2],[10,7,6],[7,1,8],[3,9,4],[3,4,2],[3,2,6],[3,6,8],[3,8,9],[4,9,5],[2,4,11],[6,2,10],[8,6,7],[9,8,1]];
  for(let k=0;k<n;k++){const cache=new Map(),F2=[];const mid=(a,b)=>{const key=a<b?a+"_"+b:b+"_"+a;if(cache.has(key))return cache.get(key);V.push(v3.norm(v3.mul(v3.add(V[a],V[b]),0.5)));cache.set(key,V.length-1);return V.length-1;};
    for(const [a,b,c] of F){const ab=mid(a,b),bc=mid(b,c),ca=mid(c,a);F2.push([a,ab,ca],[b,bc,ab],[c,ca,bc],[ab,bc,ca]);}F=F2;}
  return {V,F};
}
function makeRock(cx,cz,sx,sy,sz,angular,irr,R){
  const {V,F}=icosphere(angular?1:2);
  const waves=[];for(let k=0;k<6;k++)waves.push({d:v3.norm([N(R),N(R),N(R)]),f:U(R,1.5,3.5),ph:R()*6.28,w:U(R,0.03,0.08)*irr});
  const cuts=[];if(angular){const nc=Math.round(U(R,5,9));for(let k=0;k<nc;k++)cuts.push({n:v3.norm([N(R),N(R)*0.7+0.2,N(R)]),o:U(R,0.55,0.85)});}
  const P=V.map(v=>{let r=1;for(const w of waves)r+=w.w*Math.cos(w.f*(v[0]*w.d[0]+v[1]*w.d[1]+v[2]*w.d[2])+w.ph);let q=v3.mul(v,r);
    for(const c of cuts){const d=q[0]*c.n[0]+q[1]*c.n[1]+q[2]*c.n[2];if(d>c.o)q=v3.add(q,v3.mul(c.n,-(d-c.o)));}
    const y=(q[1]+0.35)*sy/1.35;return [cx+q[0]*sx,Math.max(0,y),cz+q[2]*sz];});
  // caras orientadas hacia fuera
  const cen=[cx,sy*0.3,cz];
  const faces=F.map(([a,b,c])=>{const A=P[a],B=P[b],Cc=P[c];let n=v3.cross([B[0]-A[0],B[1]-A[1],B[2]-A[2]],[Cc[0]-A[0],Cc[1]-A[1],Cc[2]-A[2]]);const m=[(A[0]+B[0]+Cc[0])/3,(A[1]+B[1]+Cc[1])/3,(A[2]+B[2]+Cc[2])/3];
    if(n[0]*(m[0]-cen[0])+n[1]*(m[1]-cen[1])+n[2]*(m[2]-cen[2])<0){n=v3.mul(n,-1);return {v:[a,c,b],n:v3.norm(n),m};}return {v:[a,b,c],n:v3.norm(n),m};});
  const edges=new Map();faces.forEach((f,i)=>{for(let k=0;k<3;k++){const a=f.v[k],b=f.v[(k+1)%3],key=a<b?a+"_"+b:b+"_"+a;if(!edges.has(key))edges.set(key,[]);edges.get(key).push(i);}});
  return {P,faces,edges,angular};
}
function genRoca(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,rocks=[],irr=Math.max(0.2,p.jag);
  if(p.tipo==="grupo"){
    const n=Math.max(2,Math.round(5*p.dens));
    for(let i=0;i<n;i++){const big=i===0,s=big?1:U(R,0.3,0.7),x=big?0:U(R,-W/2,W/2)*0.75,z=big?0:N(R)*W*0.15;
      rocks.push(makeRock(x,z,W*0.22*s*U(R,0.8,1.2),H*s*U(R,0.75,1.05),W*0.18*s,R()<0.75,irr,R));}
  } else {
    rocks.push(makeRock(0,0,W/2,H,W*0.42,p.tipo==="angulosa",irr,R));
  }
  return {clumps:[],limbs:[],twigs:[],leaves:[],rocks,H,W};
}
function genConifera(p){
  const R=mulberry(p.seed*9973+17),H=p.H,W=p.W,clumps=[],limbs=[],twigs=[];
  const yb=H*Math.max(0.04,p.tr),Rm=W/2,w0=Math.max(0.05,H*0.014);
  limbs.push({pts:curve3([0,0,0],[N(R)*0.05,H*0.96,N(R)*0.05],[N(R)*0.06,0,N(R)*0.06]),w0,w1:w0*0.15,trunk:true});
  for(let k=0;k<Math.round(U(R,3,6));k++){const y=yb*U(R,0.35,1),az=R()*6.283,l=Rm*U(R,0.15,0.35),b=[0,y,0],e=[Math.cos(az)*l,y+l*U(R,-0.5,0.3),Math.sin(az)*l];twigs.push([b,[(b[0]+e[0])/2,(b[1]+e[1])/2+l*0.08,(b[2]+e[2])/2],e]);}
  const T=Math.max(8,Math.round(18*p.dens));
  for(let k=0;k<T;k++){
    const t=k/(T-1),y=yb+t*(H-yb)*0.92,prof=Rm*Math.pow(1-t*0.96,1.05)*(1+0.06*N(R)),per=Math.max(3,Math.round(4+8*(1-t)));
    for(let j=0;j<per;j++){const az=2*Math.PI*j/per+R()*0.8,rx=Math.max(prof*U(R,0.3,0.48),W*0.05)*p.cs,rr=Math.max(0,prof-rx*0.6)*U(R,0.55,1);
      clumps.push({x:Math.cos(az)*rr,y:y-rr*0.12,z:Math.sin(az)*rr,r:rx,sy:U(R,0.45,0.62)+0.35*t,seed:Math.floor(R()*1e9),fine:true});}
  }
  twigs.push([[0,H*0.9,0],[N(R)*0.03,H*0.95,0],[N(R)*0.04,H,0]]);
  for(let k=0;k<2;k++){const r=W*0.04*p.cs;clumps.push({x:N(R)*0.05,y:H*U(R,0.9,0.96),z:N(R)*0.05,r,sy:0.6,seed:Math.floor(R()*1e9),fine:true});}
  return {clumps,limbs,twigs,H,W};
}
function genMasas(p){
  const R=mulberry(p.seed*9973+17);
  const H=p.H, W=p.W, rad=W/2;
  const shrub=(p.tipo==="arbusto"||p.tipo==="seto");
  const y0=shrub?H*0.08:Math.max(H*p.tr,H*0.08);
  const clumps=[];
  const base={frondoso:46,redonda:34,columnar:36,ancha:44,joven:16,arbusto:22,seto:0}[p.tipo];
  let n=Math.round(base*p.dens);
  const addC=(x,y,z,r)=>clumps.push({x,y,z,r,sy:U(R,0.72,0.95),seed:Math.floor(R()*1e9)});
  if(p.tipo==="seto"){
    const D=Math.min(0.9,Math.max(0.45,H*0.6));
    const rc=Math.min(H*0.42,D*0.6);
    const nx=Math.max(3,Math.ceil(W/(rc*1.1)));
    for(let i=0;i<nx*Math.max(2,Math.round(3*p.dens));i++){
      const x=U(R,-W/2+rc*0.8,W/2-rc*0.8), y=U(R,rc*0.8,H-rc*0.85), z=U(R,-D/2+rc*0.5,D/2-rc*0.5);
      addC(x,y,z,rc*U(R,0.75,1.15)/Math.sqrt(p.dens)*(p.cs||1));
    }
  } else {
    const k={frondoso:0.27,redonda:0.32,columnar:0.46,ancha:0.27,joven:0.4,arbusto:0.33}[p.tipo];
    for(let i=0;i<n;i++){
      const rc=rad*k*U(R,0.72,1.22)/Math.sqrt(p.dens)*(p.cs||1);
      const t=Math.pow(R(),0.9);
      let y,prof;
      if(p.tipo==="frondoso"){ y=y0+rc*0.7+(H-y0-rc*1.5)*t; prof=rad*(0.72+0.34*Math.sin(Math.PI*Math.min(1,t*1.15))); }
      else if(p.tipo==="columnar"){ y=y0+rc*0.7+(H-y0-rc*1.4)*t; prof=rad*(1-0.62*Math.pow(t,1.6)); }
      else if(p.tipo==="ancha"){ y=y0+rc*0.6+(H-y0-rc*1.3)*t; prof=rad*(1-0.45*t*t); }
      else { // redonda, joven, arbusto: elipsoide
        const cy=shrub?0:(y0+H)/2, ry=shrub?H:(H-y0)/2;
        const lo=shrub?0.12:-1;
        const s=lo+(1-lo)*t; y=cy+s*(ry-rc*0.8); prof=rad*Math.sqrt(Math.max(0.05,1-s*s));
      }
      const a=R()*Math.PI*2, rr=Math.max(0,prof-rc*0.55)*(0.45+0.55*Math.sqrt(R()));
      addC(Math.cos(a)*rr,y,Math.sin(a)*rr,rc);
    }
  }
  // tronco y ramas
  const limbs=[],twigs=[];
  const w0=shrub?Math.max(0.012,H*0.012):Math.max(0.03,H*0.017+0.02);
  const nearest=(pt,k)=>clumps.map(c=>({c,d:Math.hypot(c.x-pt[0],c.y-pt[1],c.z-pt[2])})).sort((a,b)=>a.d-b.d).slice(0,k).map(o=>o.c);
  const curve=(a,b,bend)=>{const m=[(a[0]+b[0])/2+bend[0],(a[1]+b[1])/2+bend[1],(a[2]+b[2])/2+bend[2]];const pts=[];for(let i=0;i<=14;i++){const t=i/14,u=1-t;pts.push([u*u*a[0]+2*u*t*m[0]+t*t*b[0],u*u*a[1]+2*u*t*m[1]+t*t*b[1],u*u*a[2]+2*u*t*m[2]+t*t*b[2]]);}return pts;};
  const toward=(from,c,f)=>[from[0]+(c.x-from[0])*f,from[1]+(c.y-from[1])*f,from[2]+(c.z-from[2])*f];
  const branchTo=(from,c,w,dep)=>{
    const to=toward(from,c,U(R,0.62,0.85));
    const L=Math.hypot(to[0]-from[0],to[1]-from[1],to[2]-from[2]);
    const pts=curve(from,to,[N(R)*L*0.1,Math.abs(N(R))*L*0.08,N(R)*L*0.1]);
    limbs.push({pts,w0:w,w1:w*0.45,trunk:false});
    if(dep>=1){for(let j=0;j<3;j++){const b0=pts[Math.floor(U(R,0.6,1)*14)];const d=[N(R),Math.abs(N(R))*0.8+0.3,N(R)];const l=L*U(R,0.15,0.35);const e=[b0[0]+d[0]*l*0.6,b0[1]+d[1]*l*0.6,b0[2]+d[2]*l*0.6];twigs.push([b0,[(b0[0]+e[0])/2+N(R)*l*0.08,(b0[1]+e[1])/2,(b0[2]+e[2])/2+N(R)*l*0.08],e]);}}
    if(dep<2){
      const cand=nearest(to,4).filter(o=>o!==c);
      const nb=dep===0?2:1;
      for(let j=0;j<nb&&j<cand.length;j++){
        const s=pts[Math.floor(U(R,0.55,0.9)*14)];
        branchTo(s,cand[j],w*0.5,dep+1);
      }
    }
  };
  const stems=Math.max(1,p.tallos);
  const sortedLow=[...clumps].sort((a,b)=>a.y-b.y);
  for(let s=0;s<stems;s++){
    const spread=stems>1?(shrub?Math.min(W*0.15,0.25):w0*2.2*(1+(p.twist||0)*0.5)):0;
    const bx=stems>1?(p.tipo==="seto"?-W/2*0.85+W*0.85*(s+0.5)/stems:N(R)*spread):0;
    const bz=stems>1&&p.tipo!=="seto"?N(R)*spread:0;
    const ws=stems>1?w0*0.7:w0;
    if(!shrub){
      const top=[bx*(1+(p.twist||0)*0.4)+N(R)*w0*1.2*(1+(p.twist||0)*0.6),Math.max(y0*U(R,0.95,1.1),H*0.12),bz*(1+(p.twist||0)*0.4)+N(R)*w0*(1+(p.twist||0)*0.6)];
      const tw=1+(p.twist||0)*2;const pts=curve([bx,0,bz],top,[N(R)*w0*0.6*tw,0,N(R)*w0*0.6*tw]);
      limbs.push({pts,w0:ws,w1:ws*0.66,trunk:true});
      const nb=p.ramas;
      const pool=[...clumps].sort(()=>R()-0.5);
      for(let b=0;b<nb&&b<pool.length;b++){
        const c=pool[b]; const start=pts[Math.floor(U(R,0.78,1)*14)];
        branchTo(start,c,ws*0.5,0);
      }
      // guía central
      if(p.tipo!=="ancha"&&clumps.length){const topc=[...clumps].sort((a,b)=>b.y-a.y)[Math.floor(R()*2)]||clumps[0];branchTo(pts[14],topc,ws*0.42,1);}
    } else {
      const c=sortedLow[Math.floor(R()*Math.min(sortedLow.length,6))]||clumps[0];
      if(!c) continue;
      const tgt=[c.x*0.6,Math.max(c.y*U(R,0.8,1),H*0.4),c.z*0.6];
      const pts=curve([bx,0,bz],tgt,[N(R)*0.05,0,N(R)*0.05]);
      limbs.push({pts,w0:ws,w1:ws*0.5,trunk:true});
      const cand=nearest(tgt,3);
      for(let j=0;j<2&&j<cand.length;j++) branchTo(pts[Math.floor(U(R,0.5,0.85)*14)],cand[j],ws*0.55,1);
    }
  }
  return {clumps,limbs,twigs,H,W};
}

/* ---------- estaciones ---------- */
function genWinter(m,p){
  const R=mulberry(p.seed*331+5),H=m.H,W=m.W,limbs=[],twigs=[];
  const trunks=m.limbs.filter(L=>L.trunk&&L.pts[0][1]<=1e-9);
  const tops=(trunks.length?trunks:[{pts:[[0,0,0],[0,H*0.3,0]],w1:H*0.01}]).map(L=>({p:L.pts[L.pts.length-1],pts:L.pts,w:L.w1,set:[]}));
  for(const c of m.clumps){let bi=0,bd=1e9;tops.forEach((t,i)=>{const d=Math.hypot(t.p[0]-c.x,t.p[2]-c.z)+Math.max(0,t.p[1]-c.y)*0.5;if(d<bd){bd=d;bi=i;}});tops[bi].set.push(c);}
  const tip=Math.max(0.003,H*0.0011),thin=Math.max(0.004,H*0.0016),ex=2.4;
  const branch=(P,Q,w0,w1)=>{const L=Math.hypot(Q[0]-P[0],Q[1]-P[1],Q[2]-P[2]);if(L<1e-4)return;const pts=curve3(P,Q,[N(R)*L*0.05,Math.abs(N(R))*L*0.05,N(R)*L*0.05]);
    if(w0<thin)twigs.push([pts[0],pts[7],pts[14]]);else limbs.push({pts,w0,w1:Math.max(tip,w1),trunk:false,flare:0});};
  const spray=(T,d,l,dep)=>{const e=v3.add(T,v3.mul(d,l)),mid=v3.add(v3.add(T,v3.mul(d,l*0.5)),[N(R)*l*0.05,N(R)*l*0.03,N(R)*l*0.05]);twigs.push([T,mid,e]);
    if(dep<3)for(let j=0;j<2;j++){const t=U(R,0.45,0.9),q=[T[0]+(e[0]-T[0])*t,T[1]+(e[1]-T[1])*t,T[2]+(e[2]-T[2])*t];spray(q,v3.norm(v3.add(d,[N(R)*0.45,0.15+N(R)*0.12,N(R)*0.45])),l*U(R,0.5,0.66),dep+1);}};
  const kmeans=(S,k)=>{const P=S.map(c=>[c.x,c.y*0.7,c.z]);let C=[P[Math.floor(R()*P.length)]];
    while(C.length<k){let bi=0,bd=-1;P.forEach((q,i)=>{const d=Math.min(...C.map(c=>Math.hypot(q[0]-c[0],q[1]-c[1],q[2]-c[2])));if(d>bd){bd=d;bi=i;}});C.push(P[bi]);}
    let G=[];for(let it=0;it<6;it++){G=C.map(()=>[]);P.forEach((q,i)=>{let bi=0,bd=1e9;C.forEach((c,j)=>{const d=Math.hypot(q[0]-c[0],q[1]-c[1],q[2]-c[2]);if(d<bd){bd=d;bi=j;}});G[bi].push(i);});
      C=G.map((g,j)=>g.length?[0,1,2].map(a=>g.reduce((s_,i)=>s_+P[i][a],0)/g.length):C[j]);}
    return G.filter(g=>g.length).map(g=>g.map(i=>S[i]));};
  for(const t of tops){
    const Ntot=Math.max(1,t.set.length),Wt=t.w*0.9,wn=n=>Math.max(tip,Wt*Math.pow(n/Ntot,1/ex));
    const rec=(P,S,dep,pd)=>{
      const n=S.length;
      if(n===1||dep>9){for(const c of S){const T=[c.x,c.y,c.z];branch(P,T,wn(1),wn(1)*0.6);const d=v3.norm([T[0]-P[0],T[1]-P[1]+c.r*0.6,T[2]-P[2]]);for(let j=0;j<2;j++)spray(T,v3.norm(v3.add(d,[N(R)*0.35,0.1,N(R)*0.35])),c.r*U(R,0.5,0.75),0);}return;}
      const Cn=[0,0,0];for(const c of S){Cn[0]+=c.x/n;Cn[1]+=c.y/n;Cn[2]+=c.z/n;}
      const f=dep===0?U(R,0.3,0.42):U(R,0.38,0.55);
      let B=[P[0]+(Cn[0]-P[0])*f,P[1]+(Cn[1]-P[1])*f,P[2]+(Cn[2]-P[2])*f];
      branch(P,B,wn(n),wn(n)*0.92);
      const k=dep===0&&n>6?3:2,G=kmeans(S,Math.min(k,n));
      const nd=v3.norm([B[0]-P[0],B[1]-P[1],B[2]-P[2]]);
      if(G.length<2){rec(B,S.slice(0,Math.ceil(n/2)),dep+1,nd);rec(B,S.slice(Math.ceil(n/2)),dep+1,nd);}else for(const g of G)rec(B,g,dep+1,nd);
    };
    if(!t.set.length)continue;
    const ymin=Math.min(...t.set.map(c=>c.y)),cut=ymin*0.75;let st=t.pts[0];for(const q of t.pts)if(q[1]<=cut&&q[1]>=st[1])st=q;
    if(st[1]<t.p[1]-1e-6){const idx=t.pts.indexOf(st),seg=t.pts.slice(idx);if(seg.length>1)twigs.push(seg);} 
    rec(st[1]<t.p[1]-1e-6?st:t.p,t.set,0,[0,1,0]);
  }
  const fallen=[],nf=30;
  for(let i=0;i<nf;i++){const a=R()*6.283,r=m.W*0.55*Math.sqrt(R()),sz=Math.max(0.03,m.W*0.012);fallen.push(leaf3([Math.cos(a)*r,0.004,Math.sin(a)*r],dirAE(R()*6.283,0),sz,sz*0.3,0,0,R,"lanceolada"));}
  return {limbs,twigs,fallen};
}
function seasonModel(m,p){
  const S=SPECIES[p.species];
  if(!S||!S.caduca||p.estacion==="primavera")return m;
  // verano: algo menos frondoso que en primavera (se quita ~1 de cada 6 masas y hojas)
  if(p.estacion==="verano")return Object.assign({},m,{clumps:m.clumps.filter(c=>mulberry(c.seed+51)()<0.83),leaves:m.leaves.filter((l,i)=>mulberry(i*11+29)()<0.85)});
  if(!m.winter)m.winter=genWinter(m,p);
  const f=p.estacion==="otono"?0.22:0;
  return Object.assign({},m,{clumps:m.clumps.filter(c=>mulberry(c.seed+99)()<f),leaves:m.leaves.filter((l,i)=>mulberry(i*7+13)()<f),
    limbs:m.limbs.filter(L=>L.trunk&&L.pts[0][1]<=1e-9).concat(m.winter.limbs),twigs:m.winter.twigs,leafless:true,fallen:p.estacion==="otono"?m.winter.fallen:[]});
}

/* ---------- raíces ---------- */
function genRoots(model,p){
  const R=mulberry(p.seed*7919+3),H=model.H,W=model.W,limbs=[],lines=[];
  const D=H*p.rd*p.rp,Sp=W*p.rs*p.rp/2,rg=p.rg;
  let bases=model.limbs.filter(L=>L.pts[0][1]<=1e-9&&(L.trunk||L.rings)).map(L=>({b:L.pts[0],w:L.w0}));
  if(!bases.length)bases=[{b:[0,0,0],w:Math.max(0.01,W*0.03)}];
  if(bases.length>8)bases=bases.slice(0,8);
  const below=q=>[q[0],Math.min(q[1],-0.002*H),q[2]];
  const wig=(B,E,amp,n=14)=>{const pts=[];const ph=R()*6.28,ph2=R()*6.28;for(let i=0;i<=n;i++){const t=i/n;let q=[B[0]+(E[0]-B[0])*t,B[1]+(E[1]-B[1])*t,B[2]+(E[2]-B[2])*t];const s=Math.sin(Math.PI*t);q=[q[0]+Math.sin(ph+t*7)*amp*s,q[1]+Math.sin(ph2+t*5)*amp*0.5*s,q[2]+Math.cos(ph+t*6)*amp*s];pts.push(i===0?q:below(q));}return pts;};
  const fine=(pts,k,len)=>{for(let j=0;j<k;j++){const b=pts[Math.floor(U(R,0.25,1)*(pts.length-1))],e=below([b[0]+N(R)*len,b[1]-Math.abs(N(R))*len*0.8,b[2]+N(R)*len]);const m=below([(b[0]+e[0])/2+N(R)*len*0.15,(b[1]+e[1])/2,(b[2]+e[2])/2+N(R)*len*0.15]);lines.push([b,m,e]);}};
  const root=(B,dir,L,w,dep,taper,fork)=>{
    const E=below(v3.add(B,v3.mul(dir,L)));const pts=wig(B,E,L*0.07);limbs.push({pts,w0:w,w1:w*taper,root:true});
    fine(pts,Math.round(U(R,2,5)*(dep+1)),L*0.25);
    if(dep<fork){const k=dep===0?3:2;for(let j=0;j<k;j++){const s0=pts[Math.floor(U(R,0.3,0.85)*14)],az=Math.atan2(dir[2],dir[0])+N(R)*0.8,el=Math.asin(Math.max(-1,Math.min(1,dir[1])))+N(R)*0.3;root(s0,dirAE(az,Math.min(-0.05,el)),L*U(R,0.35,0.55),w*taper*0.8,dep+1,taper,fork);}}
    return pts;
  };
  for(const bs of bases){
    const wb=bs.w*rg,b0=bs.b,off=()=>[b0[0]+N(R)*bs.w*0.4,0,b0[2]+N(R)*bs.w*0.4];
    switch(p.rt){
      case "pivotante":{const tap=root(off(),v3.norm([N(R)*0.12,-1,N(R)*0.12]),D,wb*1.0,1,0.22,2);
        const nl=Math.round(U(R,4,7));for(let i=0;i<nl;i++){const s0=tap[Math.floor(R()*3)];root(s0,dirAE(R()*6.283,-U(R,0.15,0.5)),Sp*U(R,0.6,1),wb*0.45,0,0.3,2);}break;}
      case "corazon":{const n=Math.round(U(R,4,6));for(let i=0;i<n;i++){const el=-U(R,0.45,1.05),L=Math.min(D/Math.sin(-el),Sp/Math.cos(el));root(off(),dirAE(2*Math.PI*i/n+N(R)*0.3,el),L,wb*0.55,0,0.3,2);}break;}
      case "superficial":{const n=Math.round(U(R,5,8));
        limbs.push({pts:wig(b0,[b0[0],-D*0.22,b0[2]],0.02*H),w0:wb*1.35,w1:wb*1.05,root:true});
        for(let i=0;i<n;i++){const pts=root(off(),dirAE(2*Math.PI*i/n+N(R)*0.3,-U(R,0.05,0.25)),Sp*U(R,0.7,1.05),wb*0.45,0,0.3,2);
          for(let k=0;k<3;k++){const s0=pts[3+Math.floor(R()*10)];root(s0,v3.norm([N(R)*0.2,-1,N(R)*0.2]),D*U(R,0.4,0.85),wb*0.12,2,0.35,2);}}break;}
      case "cepellon":{const rb=Math.max(Sp*0.55,bs.w*4),q=[];for(let i=0;i<=32;i++){const a=Math.PI+Math.PI*i/32;q.push([b0[0]+Math.cos(a)*rb,Math.sin(a)*D*0.6,b0[2]]);}lines.push(q);
        for(let i=0;i<14;i++)root(off(),dirAE(R()*6.283,-U(R,0.3,1.3)),Math.min(D*0.9,Sp)*U(R,0.5,1),wb*0.18,1,0.35,2);break;}
      case "fasciculada":{const n=Math.round(40*Math.max(0.5,p.dens));for(let i=0;i<n;i++){const el=-U(R,0.3,1.5),L=Math.min(D/Math.max(0.2,Math.sin(-el)),Sp/Math.max(0.15,Math.cos(el)))*U(R,0.5,1);const B=[b0[0]+N(R)*W*0.05,0,b0[2]+N(R)*W*0.05];
        if(i<6)root(B,dirAE(R()*6.283,el),L,Math.max(wb*0.25,H*0.006)*rg,2,0.3,2);else{const pts=wig(B,below(v3.add(B,v3.mul(dirAE(R()*6.283,el),L))),L*0.08,10);lines.push(pts);fine(pts,2,L*0.15);}}break;}
      case "palmera":{const bz=[b0[0],-Math.min(0.35,D*0.25),b0[2]];limbs.push({pts:curve3(b0,bz,[0,0,0]),w0:bs.w*1.2,w1:bs.w*0.75,root:true,flare:0});
        const n=Math.round(70*Math.max(0.5,p.dens));for(let i=0;i<n;i++){const t=R(),B=[b0[0]+N(R)*bs.w*0.5,bz[1]*t,b0[2]+N(R)*bs.w*0.5],down=R()<0.25,el=down?-U(R,0.9,1.45):-U(R,0.08,0.55),L=down?D*U(R,0.6,1):Sp*U(R,0.6,1.1);
          const pts=wig(B,below(v3.add(B,v3.mul(dirAE(R()*6.283,el),L))),L*0.05,12);if(i<10)limbs.push({pts,w0:H*0.0016*rg,w1:H*0.0016*rg*0.85,root:true});else lines.push(pts);fine(pts,1,L*0.12);}break;}
      case "carnosa":{const n=Math.round(U(R,6,9));for(let i=0;i<n;i++)root(off(),dirAE(2*Math.PI*i/n+N(R)*0.3,-U(R,0.2,0.75)),Math.min(Sp,D*1.6)*U(R,0.6,1),wb*0.38,1,0.75,2);break;}
      case "rizoma":{const n=3;let last=[b0[0]-Sp*0.35,-D*0.08,b0[2]];for(let i=0;i<n;i++){const e=[last[0]+Sp*U(R,0.2,0.32),-D*U(R,0.06,0.14),last[2]+N(R)*Sp*0.3];limbs.push({pts:wig(last,e,Sp*0.03),w0:W*0.025*rg,w1:W*0.022*rg,root:true});
          for(let k=0;k<4;k++)root(e,dirAE(R()*6.283,-U(R,0.7,1.4)),D*U(R,0.5,1),W*0.008*rg,1,0.7,2);last=e;}break;}
    }
  }
  return {limbs,lines,spread:Sp};
}

export {v3,dirAE,curve3,leaf3,gen,seasonModel};
