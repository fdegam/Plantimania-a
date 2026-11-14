// Dibujo de una vista: proyección, ocultación de líneas, perímetro, relleno y sombra.
import {mulberry,U,N} from "./random.js";
import {v3,seasonModel} from "./model.js";
import {genLitter} from "./litter.js";
/* ---------- proyecciones ---------- */
const ALPHA=Math.asin(Math.tan(Math.PI/6)); // 35.264°
const CA=Math.cos(ALPHA), SA=Math.sin(ALPHA);
// Acimut de la isométrica: 45° más el giro elegido (0, 90, 180 o 270). Lo fija drawView.
let ISO_C=Math.SQRT1_2, ISO_S=Math.SQRT1_2;
function setIsoRotation(deg){const a=(45+(deg||0))*Math.PI/180;ISO_C=Math.cos(a);ISO_S=Math.sin(a);}
function proj(v,q){
  const [x,y,z]=q;
  if(v==="alzado") return {s:[x,y],d:z};
  if(v==="planta") return {s:[x,-z],d:y};
  const x1=x*ISO_C+z*ISO_S, z1=-x*ISO_S+z*ISO_C;
  return {s:[x1,y*CA-z1*SA],d:z1*CA+y*SA};
}
function clumpRadii(v,c){
  if(v==="alzado") return [c.r,c.r*c.sy];
  if(v==="planta") return [c.r,c.r];
  return [c.r,c.r*Math.sqrt(Math.pow(c.sy*CA,2)+SA*SA)];
}

/* ---------- formas 2D ---------- */
function chaikin(P){const out=[];for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];out.push([0.75*a[0]+0.25*b[0],0.75*a[1]+0.25*b[1]],[0.25*a[0]+0.75*b[0],0.25*a[1]+0.75*b[1]]);}return out;}
function fringe(cx,cy,rx,ry,seed,jag){
  const R=mulberry(seed);
  const amp=(0.06*Math.min(rx,ry)+0.004)*jag+0.002;
  const per=Math.PI*(rx+ry); const n=Math.max(48,Math.min(900,Math.round(per/Math.max(amp*0.45,1e-4))));
  const fr=[1,2,3,5,8], wt=[0.05,0.09,0.07,0.05,0.03], ph=fr.map(()=>R()*6.28);
  let walk=[],acc=0;for(let i=0;i<n;i++){acc+=N(R);walk.push(acc);}
  const drift=walk[n-1]-walk[0];walk=walk.map((w,i)=>w-walk[0]-drift*i/(n-1));
  const sm=walk.map((_,i)=>{let s=0;for(let k=-4;k<=4;k++)s+=walk[(i+k+n)%n];return s/9;});
  const mx=Math.max(...sm.map(Math.abs))+1e-9; const lw=sm.map(w=>w/mx*0.06);
  const off=new Float64Array(n), tw=new Float64Array(n);
  if(jag>0.01){let i=0;while(i<n){i+=2+Math.floor(R()*5);if(i>=n)break;const k=[1,1,2,2,3][Math.floor(R()*5)],lean=N(R)*0.8;for(let j=0;j<k;j++){const q=(i+2*j)%n;off[q]+=amp*U(R,0.5,2.2)*(R()<0.12?1.3:1);tw[q]=lean;off[(q+1)%n]-=amp*U(R,0,0.5);}i+=2*k;}}
  const pts=[];
  for(let i=0;i<n;i++){const a=2*Math.PI*i/n;let lob=1+lw[i];for(let k=0;k<5;k++)lob+=wt[k]*Math.sin(fr[k]*a+ph[k]);const aa=a+tw[i]*(2*Math.PI/n)*1.4;pts.push([cx+Math.cos(aa)*(rx*lob+off[i]),cy+Math.sin(aa)*(ry*lob+off[i])]);}
  return chaikin(pts);
}
function fringeFine(cx,cy,rx,ry,seed,jag){
  const R=mulberry(seed),amp=0.09*Math.min(rx,ry)*Math.max(0.3,jag)+1e-4;
  const per=Math.PI*(rx+ry),n=Math.max(36,Math.min(600,Math.round(per/(amp*0.6))));
  const ph=[R()*6.28,R()*6.28,R()*6.28],pts=[];
  for(let i=0;i<n;i++){
    const a=2*Math.PI*i/n,lob=1+0.1*Math.sin(2*a+ph[0])+0.07*Math.sin(3*a+ph[1])+0.05*Math.sin(5*a+ph[2]);
    const bx=cx+Math.cos(a)*rx*lob,by=cy+Math.sin(a)*ry*lob;pts.push([bx,by]);
    if(R()<0.55){
      const nx=Math.cos(a)/rx,ny=Math.sin(a)/ry;let ang=Math.atan2(ny,nx)+N(R)*0.45;ang+=(Math.PI/2-ang)*0.25;const L=amp*U(R,1,2.8);
      const tip=[bx+Math.cos(ang)*L,by+Math.sin(ang)*L],mx=(bx+tip[0])/2,my=(by+tip[1])/2,px=-Math.sin(ang)*L*0.13,py=Math.cos(ang)*L*0.13;
      pts.push([mx-px,my-py],tip,[mx+px,my+py]);
    }
  }
  return pts;
}
function gapBlob(cx,cy,r,R){
  const n=5+Math.floor(R()*4); const ang=[];for(let i=0;i<n;i++)ang.push(R()*6.283);ang.sort((a,b)=>a-b);
  const P=ang.map(a=>[cx+Math.cos(a)*r*U(R,0.45,1.1),cy+Math.sin(a)*r*U(R,0.35,0.9)]);
  const c=chaikin(P);c.push(c[0]);return c;
}
function limbPoly(pts2,w0,w1,flare){
  const n=pts2.length,L=[],Rr=[];
  for(let i=0;i<n;i++){const a=pts2[Math.max(0,i-1)],b=pts2[Math.min(n-1,i+1)];let tx=b[0]-a[0],ty=b[1]-a[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;let w=w0+(w1-w0)*i/(n-1);if(flare)w*=1+flare*Math.exp(-i*1.1);L.push([pts2[i][0]-ty*w,pts2[i][1]+tx*w]);Rr.push([pts2[i][0]+ty*w,pts2[i][1]-tx*w]);}
  const e=pts2[n-1],e2=pts2[n-2]||pts2[0];let tx=e[0]-e2[0],ty=e[1]-e2[1];const l=Math.hypot(tx,ty)||1;tx/=l;ty/=l;
  const tip=[];for(let k=0;k<=4;k++){const t=k/4,a=Math.PI*t;tip.push([e[0]-ty*w1*Math.cos(a)+tx*w1*Math.sin(a)*0.9,e[1]+tx*w1*Math.cos(a)+ty*w1*Math.sin(a)*0.9]);}
  return {lines:[L,Rr,tip],poly:L.concat(tip.slice(1,-1),Rr.slice().reverse())};
}

/* ---------- máscara de ocultación ---------- */
class Mask{
  constructor(bb,res){this.x0=bb[0];this.y0=bb[1];this.res=res;this.w=Math.ceil((bb[2]-bb[0])/res)+2;this.h=Math.ceil((bb[3]-bb[1])/res)+2;this.m=new Uint8Array(this.w*this.h);this.m2=new Uint8Array(this.w*this.h);this.m3=new Uint8Array(this.w*this.h);this.out=[];}
  stroke2(P,rad){const st=this.res*0.8,w=this.w;for(let s_=0;s_<P.length-1;s_++){const a=P[s_],b=P[s_+1],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/st));for(let t=0;t<=n;t++){const i=Math.floor((a[0]+(b[0]-a[0])*t/n-this.x0)/this.res),j=Math.floor((a[1]+(b[1]-a[1])*t/n-this.y0)/this.res);for(let dj=-rad;dj<=rad;dj++)for(let di=-rad;di<=rad;di++){const ii=i+di,jj=j+dj;if(ii>=0&&jj>=0&&ii<w&&jj<this.h)this.m2[jj*w+ii]=1;}}}}
  close2(r,fill){
    const w=this.w,h=this.h,m=this.m2;
    const cham=(src,target)=>{const d=new Float32Array(w*h),B=1.4142;for(let i=0;i<w*h;i++)d[i]=src[i]===target?0:1e9;
      for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;let v=d[i];if(v===0)continue;if(x>0)v=Math.min(v,d[i-1]+1);if(y>0){v=Math.min(v,d[i-w]+1);if(x>0)v=Math.min(v,d[i-w-1]+B);if(x<w-1)v=Math.min(v,d[i-w+1]+B);}d[i]=v;}
      for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;let v=d[i];if(v===0)continue;if(x<w-1)v=Math.min(v,d[i+1]+1);if(y<h-1){v=Math.min(v,d[i+w]+1);if(x<w-1)v=Math.min(v,d[i+w+1]+B);if(x>0)v=Math.min(v,d[i+w-1]+B);}d[i]=v;}return d;};
    const d1=cham(m,1),dil=new Uint8Array(w*h);for(let i=0;i<w*h;i++)dil[i]=d1[i]<=r?1:0;
    const d2=cham(dil,0);for(let i=0;i<w*h;i++)if(d2[i]>r)m[i]=1;
    if(fill){const seen=new Uint8Array(w*h),st=new Int32Array(w*h);let sp=0;const push=i=>{if(!seen[i]&&!m[i]){seen[i]=1;st[sp++]=i;}};
      for(let i=0;i<w;i++){push(i);push((h-1)*w+i);}for(let j=0;j<h;j++){push(j*w);push(j*w+w-1);}
      while(sp){const i=st[--sp],x=i%w,y=(i-x)/w;if(x>0)push(i-1);if(x<w-1)push(i+1);if(y>0)push(i-w);if(y<h-1)push(i+w);}
      for(let i=0;i<w*h;i++)if(!seen[i])m[i]=1;}
  }
  at(arr,x,y){const i=Math.floor((x-this.x0)/this.res),j=Math.floor((y-this.y0)/this.res);return i>=0&&j>=0&&i<this.w&&j<this.h&&arr[j*this.w+i]===1;}
  covered(x,y){const i=Math.floor((x-this.x0)/this.res),j=Math.floor((y-this.y0)/this.res);return i>=0&&j>=0&&i<this.w&&j<this.h&&this.m[j*this.w+i]===1;}
  fill(P,ground){
    const w=this.w,res=this.res,x0=this.x0,y0=this.y0,n=P.length;
    let ymin=Infinity,ymax=-Infinity;for(const p of P){ymin=Math.min(ymin,p[1]);ymax=Math.max(ymax,p[1]);}
    const j0=Math.max(0,Math.floor((ymin-y0)/res)),j1=Math.min(this.h-1,Math.ceil((ymax-y0)/res));
    for(let j=j0;j<=j1;j++){
      const yc=y0+(j+0.5)*res,xs=[];
      for(let i=0;i<n;i++){const a=P[i],b=P[(i+1)%n];if((a[1]<=yc&&b[1]>yc)||(b[1]<=yc&&a[1]>yc)){const t=(yc-a[1])/(b[1]-a[1]);xs.push([a[0]+t*(b[0]-a[0]),b[1]>a[1]?1:-1]);}}
      xs.sort((a,b)=>a[0]-b[0]);let wn=0;
      for(let k=0;k<xs.length-1;k++){wn+=xs[k][1];if(wn!==0){const i0=Math.max(0,Math.ceil((xs[k][0]-x0)/res-0.5)),i1=Math.min(w-1,Math.floor((xs[k+1][0]-x0)/res-0.5));for(let i=i0;i<=i1;i++){if(ground==='p'){this.m2[j*w+i]=1;continue;}this.m[j*w+i]=1;if(ground==='r')continue;(ground?this.m3:this.m2)[j*w+i]=1;}}}
    }
  }
  clip(P,layer,ground){
    const st=this.res*0.9;let run=[];
    const flush=()=>{if(run.length>2){const tol=this.res*1.2,k=[run[0]];for(let i=1;i<run.length-1;i++){const l=k[k.length-1];if(Math.hypot(run[i][0]-l[0],run[i][1]-l[1])>tol)k.push(run[i]);}k.push(run[run.length-1]);this.out.push({pts:k,layer,ground});}run=[];};
    for(let s=0;s<P.length-1;s++){
      const a=P[s],b=P[s+1],len=Math.hypot(b[0]-a[0],b[1]-a[1]),n=Math.max(1,Math.ceil(len/st));
      for(let t=(s===0?0:1);t<=n;t++){const x=a[0]+(b[0]-a[0])*t/n,y=a[1]+(b[1]-a[1])*t/n;if(this.covered(x,y))flush();else run.push([x,y]);}
    }
    flush();
  }
}

/* ---------- perímetro: contorno de la silueta (marching squares) ---------- */
function traceMask(M){
  const w=M.w,h=M.h,m=M.m2,W2=2*w+4,adj=new Map();
  const add=(a,b)=>{let A=adj.get(a);if(!A)adj.set(a,A=[]);A.push(b);let B=adj.get(b);if(!B)adj.set(b,B=[]);B.push(a);};
  for(let j=0;j<h-1;j++)for(let i=0;i<w-1;i++){
    const v0=m[j*w+i],v1=m[j*w+i+1],v2=m[(j+1)*w+i+1],v3_=m[(j+1)*w+i+1-1];
    const c=v0|(v1<<1)|(v2<<2)|(v3_<<3);if(c===0||c===15)continue;
    const Bm=(2*j)*W2+(2*i+1),Rm=(2*j+1)*W2+(2*i+2),Tm=(2*j+2)*W2+(2*i+1),Lm=(2*j+1)*W2+(2*i);
    switch(c){case 1:case 14:add(Lm,Bm);break;case 2:case 13:add(Bm,Rm);break;case 3:case 12:add(Lm,Rm);break;case 4:case 11:add(Rm,Tm);break;
      case 6:case 9:add(Bm,Tm);break;case 7:case 8:add(Lm,Tm);break;case 5:add(Lm,Tm);add(Bm,Rm);break;case 10:add(Lm,Bm);add(Rm,Tm);break;}
  }
  const seen=new Set(),loops=[],toW=k=>{const y2=Math.floor(k/W2),x2=k-y2*W2;return [M.x0+(x2+1)/2*M.res,M.y0+(y2+1)/2*M.res];};
  const starts=[...adj.keys()].sort((a,b)=>adj.get(a).length-adj.get(b).length);
  for(const start of starts){
    if(seen.has(start))continue;
    const chain=[start];seen.add(start);let prev=-1,cur=start;
    for(;;){const nb=adj.get(cur);let nx=-1;for(const q of nb){if(q!==prev&&!seen.has(q)){nx=q;break;}}if(nx<0)break;seen.add(nx);chain.push(nx);prev=cur;cur=nx;}
    if(chain.length<8)continue;
    let P=chaikin(chaikin(chain.map(toW)));
    const tol=M.res*0.9,k=[P[0]];for(let i=1;i<P.length;i++){const l=k[k.length-1];if(Math.hypot(P[i][0]-l[0],P[i][1]-l[1])>tol)k.push(P[i]);}
    if(k.length<4)continue;
    let A=0;for(let i=0;i<k.length;i++){const a=k[i],b=k[(i+1)%k.length];A+=a[0]*b[1]-b[0]*a[1];}A/=2;
    const a0=k[0],b0=k[1],nx=-(b0[1]-a0[1]),ny=b0[0]-a0[0],nl=Math.hypot(nx,ny)||1,mx=(a0[0]+b0[0])/2,my=(a0[1]+b0[1])/2,o=M.res*1.6;
    const leftIn=M.at(M.m2,mx+nx/nl*o,my+ny/nl*o),outer=A>0?leftIn:!leftIn;
    if(!outer&&Math.abs(A)<M.minHole)continue;
    k.push([k[0][0],k[0][1]]);k.outer=outer;loops.push(k);
  }
  return loops;
}
function classify(M,trace){
  const fix=l=>l.layer==="VEG_CONTORNO*"?{pts:l.pts,layer:"VEG_CONTORNO"}:l.layer==="VEG_RAICES*"?{pts:l.pts,layer:"VEG_RAICES"}:l;
  if(!trace)return M.out.map(fix);
  const out=[],d=M.res*2.2;
  // 1) silueta, oculta donde la tapan las matas del suelo
  for(const loop of traceMask(M))out.push({pts:loop,layer:"VEG_PERIMETRO",closed:true,outer:loop.outer});
  // 2) líneas interiores: se quitan los tramos que caen sobre la silueta
  for(const l of M.out){
    if(l.layer!=="VEG_CONTORNO"){out.push(fix(l));continue;}
    const P=l.pts,n=P.length;let run=[];const fl=()=>{if(run.length>1)out.push({pts:run,layer:"VEG_CONTORNO"});run=[];};
    for(let i=0;i<n;i++){const a=P[Math.max(0,i-1)],b=P[Math.min(n-1,i+1)];let tx=b[0]-a[0],ty=b[1]-a[1];const L=Math.hypot(tx,ty)||1;tx/=L;ty/=L;
      const edge=!M.at(M.m2,P[i][0]-ty*d,P[i][1]+tx*d)||!M.at(M.m2,P[i][0]+ty*d,P[i][1]-tx*d);
      if(edge&&!l.ground)fl();else run.push(P[i]);}
    fl();
  }
  return out;
}
const layerOf=(l,p)=>(l.layer==="VEG_PERIMETRO"&&!p.perim)?"VEG_CONTORNO":l.layer;
const weightOf=(layer,p)=>layer==="VEG_RAICES"?p.gr:layer==="VEG_PERIMETRO"?p.gp:layer==="VEG_CONTORNO"?p.gc:p.gd;

/* ---------- sombra proyectada ---------- */
function castShadow(model,p,v,per){
  const th=p.sdir*Math.PI/180,el=p.salt*Math.PI/180,dx=Math.cos(th),dz=-Math.sin(th),ct=1/Math.tan(el),polys=[];
  const alz=v==="alzado";
  if(alz){const sn=Math.sin(th);if(sn<0.05||!per.length)return [];const ox=Math.cos(th)*p.sdist/sn,oy=-Math.tan(el)*p.sdist/sn;for(const l of per)polys.push(l.pts.map(q=>[q[0]+ox,q[1]+oy]));}
  else{
    const G=q=>{const k=Math.max(0,q[1])*ct;return proj(v,[q[0]+k*dx,0,q[2]+k*dz]).s;};
    for(const c of model.clumps){const b=c.r*c.sy,al=Math.sqrt(Math.pow(c.r*Math.sin(el),2)+Math.pow(b*Math.cos(el),2))/Math.sin(el),g0=[c.x+c.y*ct*dx,0,c.z+c.y*ct*dz],q=[];
      for(let i=0;i<24;i++){const a=i/24*6.283,u=Math.cos(a)*al,w=Math.sin(a)*c.r;q.push(proj(v,[g0[0]+dx*u-dz*w,0,g0[2]+dz*u+dx*w]).s);}polys.push(q);}
    for(const L of model.limbs){const P=L.pts.map(G);if(P.length>1)polys.push(limbPoly(P,L.w0,L.w1).poly);}
    for(const lf of model.leaves)polys.push(lf.outline.map(G));
    if(model.rocks)for(const rk of model.rocks)for(const f of rk.faces)polys.push(f.v.map(k=>G(rk.P[k])));
  }
  if(!polys.length)return [];
  let bb=[Infinity,Infinity,-Infinity,-Infinity];for(const P of polys)for(const q of P){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}
  const maxd=Math.max(bb[2]-bb[0],bb[3]-bb[1]),res=maxd/900,thin=p.mode==="graminea"||p.mode==="palmera"||p.mode==="hiedra";
  // La hiedra proyecta la sombra de sus hojas y tallos, no la de una envolvente.
  const ivy=p.mode==="hiedra";
  const cr=ivy?Math.max(2,Math.round(0.006/res)):thin?Math.round(0.03*maxd/res):Math.max(2,Math.round(0.006*maxd/res)),pad=res*(6+cr);
  const M=new Mask([bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad],res);M.minHole=ivy?Math.pow(0.02,2):Math.pow(maxd*0.04,2);
  for(const P of polys)if(P.length>2)M.fill(P);
  const clr=()=>{if(!alz)return;for(let j=0;j<M.h;j++){if(M.y0+(j+0.5)*res<0)for(let i=0;i<M.w;i++)M.m2[j*M.w+i]=0;}};
  clr();M.close2(cr,!ivy);clr();
  return traceMask(M).filter(l=>l.outer);
}
function dpLoop(P,tol){
  const pts=P.slice(0,-1);if(pts.length<8)return pts;
  const keep=new Uint8Array(pts.length);keep[0]=1;let far=0,md=0;
  for(let i=1;i<pts.length;i++){const d=Math.hypot(pts[i][0]-pts[0][0],pts[i][1]-pts[0][1]);if(d>md){md=d;far=i;}}keep[far]=1;
  const st=[[0,far],[far,pts.length]];
  while(st.length){const [a,b]=st.pop();const A=pts[a],B=pts[b%pts.length],L=Math.hypot(B[0]-A[0],B[1]-A[1])||1e-12;let mx=-1,mi=-1;
    for(let i=a+1;i<b;i++){const q=pts[i];const d=Math.abs((B[0]-A[0])*(A[1]-q[1])-(A[0]-q[0])*(B[1]-A[1]))/L;if(d>mx){mx=d;mi=i;}}
    if(mx>tol){keep[mi]=1;st.push([a,mi],[mi,b]);}}
  return pts.filter((_,i)=>keep[i]);
}
function pip(q,P){let c=false;for(let i=0,j=P.length-1;i<P.length;j=i++){const a=P[i],b=P[j];if((a[1]>q[1])!==(b[1]>q[1])&&q[0]<(b[0]-a[0])*(q[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
function ringArea(P){let A=0;for(let i=0;i<P.length;i++){const a=P[i],b=P[(i+1)%P.length];A+=a[0]*b[1]-b[0]*a[1];}return A/2;}
function segX(a,b,c,d){const o=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const d1=o(c,d,a),d2=o(c,d,b),d3=o(a,b,c),d4=o(a,b,d);return ((d1>0)!==(d2>0))&&((d3>0)!==(d4>0));}
function bridge(outer,holes){
  let ring=ringArea(outer)<0?outer.slice().reverse():outer.slice();
  const hs=holes.filter(h=>h.length>2).map(h=>ringArea(h)>0?h.slice().reverse():h.slice());
  hs.sort((a,b)=>Math.max(...b.map(q=>q[0]))-Math.max(...a.map(q=>q[0])));
  const same=(p,q)=>p[0]===q[0]&&p[1]===q[1];
  for(const h of hs){
    let mi=0;for(let i=1;i<h.length;i++)if(h[i][0]>h[mi][0])mi=i;const M=h[mi];
    const cand=ring.map((q,i)=>[Math.hypot(q[0]-M[0],q[1]-M[1]),i]).sort((a,b)=>a[0]-b[0]);let best=cand[0][1];
    for(const [,i] of cand.slice(0,80)){const V=ring[i];let hit=false;
      for(const poly of [ring,h]){for(let k=0;k<poly.length&&!hit;k++){const a=poly[k],b=poly[(k+1)%poly.length];if(same(a,V)||same(b,V)||same(a,M)||same(b,M))continue;if(segX(M,V,a,b))hit=true;}if(hit)break;}
      if(!hit){best=i;break;}}
    const hr=h.slice(mi).concat(h.slice(0,mi));
    ring=ring.slice(0,best+1).concat(hr,[hr[0].slice()],[ring[best].slice()],ring.slice(best+1));
  }
  return ring;
}
function inTri(q,a,b,c){const d1=(q[0]-b[0])*(a[1]-b[1])-(a[0]-b[0])*(q[1]-b[1]),d2=(q[0]-c[0])*(b[1]-c[1])-(b[0]-c[0])*(q[1]-c[1]),d3=(q[0]-a[0])*(c[1]-a[1])-(c[0]-a[0])*(q[1]-a[1]);return !((d1<0||d2<0||d3<0)&&(d1>0||d2>0||d3>0));}
function earclip(pts){
  let A=0;for(let i=0;i<pts.length;i++){const a=pts[i],b=pts[(i+1)%pts.length];A+=a[0]*b[1]-b[0]*a[1];}
  const P=A<0?pts.slice().reverse():pts.slice(),idx=P.map((_,i)=>i),tris=[];let i=0,stall=0;
  while(idx.length>3){const n=idx.length;if(stall>n){for(let k=1;k<n-1;k++)tris.push([P[idx[0]],P[idx[k]],P[idx[k+1]]]);return tris;}
    const ia=idx[(i-1+n)%n],ib=idx[i%n],ic=idx[(i+1)%n],a=P[ia],b=P[ib],c=P[ic];
    let ear=(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0])>0;
    if(ear)for(const j of idx){if(j===ia||j===ib||j===ic)continue;const q=P[j];if((q[0]===a[0]&&q[1]===a[1])||(q[0]===b[0]&&q[1]===b[1])||(q[0]===c[0]&&q[1]===c[1]))continue;if(inTri(q,a,b,c)){ear=false;break;}}
    if(ear){tris.push([a,b,c]);idx.splice(i%n,1);stall=0;if(i>=idx.length)i=0;}else{i=(i+1)%n;stall++;}}
  if(idx.length===3)tris.push(idx.map(k=>P[k]));
  return tris;
}

/* ---------- dibujo de una vista ---------- */
function drawView(model,p,v){
  setIsoRotation(p.isoRot);
  model=seasonModel(model,p);
  const items=[];
  const C="VEG_CONTORNO",D="VEG_DETALLE";
  const ys=model.clumps.map(c=>c.y).sort((a,b)=>b-a);
  const yTop=ys[Math.floor(ys.length*0.33)]??Infinity;
  const shrubV=(p.tipo==="arbusto"||p.tipo==="seto");
  const multi=p.mode==="multitallo";
  const limbTier=(v==="planta"||shrubV||!(p.mode==="masas"||multi))?0:1e6;
  const LX=-0.62,LY=0.78;
  const tier=(c)=>{if(v==="planta"||shrubV||p.mode==="olivo"||p.mode==="cipres"||p.mode==="conifera")return 0;if(multi)return (mulberry(c.seed+3)()<0.35)?2e6:0;if(c.y>=yTop)return 2e6;return (mulberry(c.seed+3)()<0.3)?2e6:0;};
  const litter=(v!=="alzado"&&model.fallen&&model.fallen.length)?genLitter(model,p).map(lf=>({lf,poly:lf.outline.map(q=>proj(v,q).s)})):[];
  for(const lf of (litter.length?[]:(model.fallen||[]))){const P=lf.outline.map(q=>proj(v,q)),poly=P.map(o=>o.s);items.push({d:P[0].d,lines:[{pts:poly.concat([poly[0]]),layer:C}],poly,ground:true});}
  for(const lf of model.leaves){
    const P=lf.outline.map(q=>proj(v,q)),poly=P.map(o=>o.s),d=P.reduce((a,o)=>a+o.d,0)/P.length;
    const lines=lf.center?[{pts:lf.center.map(q=>proj(v,q).s),layer:"VEG_CONTORNO*"}]:[{pts:poly.concat([poly[0]]),layer:C}];
    if(lf.rib)lines.push({pts:lf.rib.map(q=>proj(v,q).s),layer:D});
    if(lf.veins)for(const vn of lf.veins)lines.push({pts:vn.map(q=>proj(v,q).s),layer:D});
    items.push({d,lines,poly});
  }
  const shade=(cx,cy,rx,ry,R,amt)=>{ // trazos de sombra en el lado opuesto a la luz
    const out=[];const k=Math.round(amt*U(R,0.6,2.2));
    for(let i=0;i<k;i++){
      const a0=Math.atan2(-LY,-LX)+N(R)*0.5,span=U(R,0.25,0.6),rr=U(R,0.62,0.86),pts=[];
      const m=8+Math.floor(R()*5);
      for(let j=0;j<=m;j++){const a=a0-span/2+span*j/m;const tick=(j%2?-1:1)*U(R,0.02,0.07);pts.push([cx+Math.cos(a)*rx*(rr+tick),cy+Math.sin(a)*ry*(rr+tick)]);}
      out.push({pts,layer:D});
    }
    return out;
  };
  for(const c of model.clumps){
    const pr=proj(v,[c.x,c.y,c.z]);const [rx,ry]=clumpRadii(v,c);
    const R=mulberry(c.seed+7);const base=pr.d+c.r*0.2+tier(c);
    if(c.flame&&v!=="planta"){ // ciprés: ramillete apuntado y abierto hacia fuera
      let o=fringeFine(pr.s[0],pr.s[1],rx,ry,c.seed,p.jag*0.8);
      o=o.map(q=>{const dy=(q[1]-pr.s[1])/ry;let k=1;if(dy>0)k=1-0.9*Math.pow(Math.min(1,dy),1.15);else if(dy<-0.4)k=1-0.45*(-dy-0.4);return [pr.s[0]+(q[0]-pr.s[0])*k,q[1]];});
      const tl=-Math.max(-1,Math.min(1,pr.s[0]/(model.W/2)))*0.34,cs_=Math.cos(tl),sn_=Math.sin(tl),ox=pr.s[0],oy=pr.s[1]-ry;
      o=o.map(q=>{const dx=q[0]-ox,dy=q[1]-oy;return [ox+dx*cs_-dy*sn_,oy+dx*sn_+dy*cs_];});
      const lines=[];let run=[];const fl=()=>{if(run.length>2)lines.push({pts:run,layer:C});run=[];};
      const lim=U(R,-0.1,0.25);for(const q of o.concat([o[0]])){const dx=(q[0]-pr.s[0])/rx,dy=(q[1]-pr.s[1])/ry;if(dx*LX+dy*LY*0.6>lim)run.push(q);else fl();}fl();
      if(R()<0.35){const pts=[];for(let j=0;j<=8;j++){const t=j/8,yy=oy+ry*0.3+ry*1.4*t,kk=1-0.9*Math.pow(Math.max(0,(yy-pr.s[1])/ry),1.15),xx=pr.s[0]+rx*0.12*kk;pts.push([ox+(xx-ox)*cs_-(yy-oy)*sn_,oy+(xx-ox)*sn_+(yy-oy)*cs_]);}lines.push({pts,layer:D});}
      if(R()<0.4)lines.push(...shade(pr.s[0],pr.s[1],rx,ry,R,p.sombra*0.5));
      items.push({d:base,lines,poly:o});continue;
    }
    if(c.flame){const o=fringeFine(pr.s[0],pr.s[1],rx,rx,c.seed,p.jag);const lines=[];let run=[];const fl=()=>{if(run.length>2)lines.push({pts:run,layer:C});run=[];};for(const q of o.concat([o[0]])){const dx=(q[0]-pr.s[0])/rx,dy=(q[1]-pr.s[1])/rx;if(dx*LX+dy*LY>-0.1)run.push(q);else fl();}fl();items.push({d:base,lines,poly:o});continue;}
    if(c.fine){ // olivo: solo el canto iluminado de cada grupo, en capas
      const o=fringeFine(pr.s[0],pr.s[1],rx,ry,c.seed,p.jag);const lines=[];let run=[];
      const fl=()=>{if(run.length>2)lines.push({pts:run,layer:C});run=[];};
      const lim=U(R,-0.05,0.35);for(const q of o.concat([o[0]])){const dx=(q[0]-pr.s[0])/rx,dy=(q[1]-pr.s[1])/ry;if(dx*LX+dy*LY>lim)run.push(q);else fl();}fl();
      if(R()<0.6)lines.push(...shade(pr.s[0],pr.s[1],rx,ry,R,p.sombra*0.7));
      if(R()<0.25*p.huecos){const a=R()*6.283,rr=Math.sqrt(R())*0.4;lines.push({pts:gapBlob(pr.s[0]+Math.cos(a)*rx*rr,pr.s[1]+Math.sin(a)*ry*rr,rx*U(R,0.1,0.2),R),layer:R()<0.5?C:D});}
      items.push({d:base,lines,poly:o});continue;
    }
    const nsub=Math.round(p.real*U(R,6,11));
    if(nsub<2){
      const outl=fringe(pr.s[0],pr.s[1],rx,ry,c.seed,p.jag);
      const lines=[{pts:outl.concat([outl[0]]),layer:C}];
      lines.push(...shade(pr.s[0],pr.s[1],rx,ry,R,p.sombra));
      const ng=Math.round(p.huecos*U(R,0.3,3.2));
      for(let g=0;g<ng;g++){const a=R()*6.283,rr=Math.sqrt(R())*0.55;const gx=pr.s[0]+Math.cos(a)*rx*rr,gy=pr.s[1]+Math.sin(a)*ry*rr;const bold=R()<0.16;lines.push({pts:gapBlob(gx,gy,rx*U(R,bold?0.05:0.08,bold?0.1:0.2),R),layer:bold?C:D});}
      items.push({d:base,lines,poly:outl});
      continue;
    }
    // núcleo que tapa lo de detrás
    const core=fringe(pr.s[0],pr.s[1],rx*0.5,ry*0.5,c.seed+1,0);
    items.push({d:base-c.r*0.5,lines:[],poly:core});
    // subgrupos de hojas: los del centro quedan delante (esfera)
    const subs=[];
    for(let k=0;k<nsub;k++){
      const a=R()*6.283,rr=k===0?U(R,0.05,0.25):Math.sqrt(U(R,0.12,1))*0.62;
      const sx=pr.s[0]+Math.cos(a)*rx*rr,sy=pr.s[1]+Math.sin(a)*ry*rr;
      const rs=U(R,0.36,0.55)*(1-rr*0.25);
      subs.push({sx,sy,rsx:rx*rs,rsy:ry*rs,d:base+c.r*Math.sqrt(Math.max(0,1-rr*rr))*0.3,seed:c.seed+100+k});
    }
    subs.forEach((sb,k)=>{
      const R2=mulberry(sb.seed);
      const o=fringe(sb.sx,sb.sy,sb.rsx,sb.rsy,sb.seed,p.jag*1.1);
      const lines=[];{let run=[];const fl=()=>{if(run.length>2)lines.push({pts:run,layer:C});run=[];};const lim=U(R2,-0.45,0.05);
        for(const q of o.concat([o[0]])){const dx=(q[0]-sb.sx)/sb.rsx,dy=(q[1]-sb.sy)/sb.rsy;if(dx*LX+dy*LY>lim)run.push(q);else fl();}fl();}
      if(R2()<0.75)lines.push(...shade(sb.sx,sb.sy,sb.rsx,sb.rsy,R2,p.sombra*0.6));
      const ng=Math.round(p.huecos*U(R2,0,1.4));
      for(let g=0;g<ng;g++){const a=R2()*6.283,rr=U(R2,0.3,0.65);const bold=R2()<0.12;lines.push({pts:gapBlob(sb.sx+Math.cos(a)*sb.rsx*rr,sb.sy+Math.sin(a)*sb.rsy*rr,sb.rsx*U(R2,bold?0.08:0.12,bold?0.16:0.28),R2),layer:bold?C:D});}
      items.push({d:sb.d,lines,poly:o});
    });
  }
  if(model.rocks){
    const Lw=v3.norm([-0.6,0.75,0.35]);
    const ang=Math.PI/3,dx=Math.cos(ang),dy=Math.sin(ang),px=-dy,py=dx;
    const sp=Math.max(model.H,model.W)*0.022/Math.max(0.3,p.sombra);
    const hatch=(a,b,c,spacing)=>{const out=[];const o=[a,b,c].map(q=>q[0]*px+q[1]*py);const lo=Math.ceil(Math.min(...o)/spacing),hi=Math.floor(Math.max(...o)/spacing);
      for(let k=lo;k<=hi;k++){const t0=k*spacing,pts=[];const E=[[a,b],[b,c],[c,a]];for(const [A,B] of E){const oa=A[0]*px+A[1]*py,ob=B[0]*px+B[1]*py;if((oa-t0)*(ob-t0)<0){const t=(t0-oa)/(ob-oa);pts.push([A[0]+(B[0]-A[0])*t,A[1]+(B[1]-A[1])*t]);}}
        if(pts.length===2)out.push({pts,layer:D});}return out;};
    for(const rk of model.rocks){
      const Pp=rk.P.map(q=>proj(v,q));
      const front=rk.faces.map(f=>{const a=proj(v,f.m),b=proj(v,v3.add(f.m,v3.mul(f.n,0.01)));return b.d-a.d>0;});
      rk.faces.forEach((f,i)=>{
        if(!front[i])return;
        const tri=f.v.map(k=>Pp[k].s),d=f.v.reduce((s_,k)=>s_+Pp[k].d,0)/3,lines=[];
        for(let k=0;k<3;k++){const a=f.v[k],b=f.v[(k+1)%3],key=a<b?a+"_"+b:b+"_"+a,adj=rk.edges.get(key),j=adj.find(x=>x!==i);
          if(j===undefined)continue;const g2=rk.faces[j];const cr=f.n[0]*g2.n[0]+f.n[1]*g2.n[1]+f.n[2]*g2.n[2];
          const edgeOwner=!front[j]||i<j;if(edgeOwner&&(rk.angular?cr<0.9:cr<0.55)){const dj=front[j]?rk.faces[j].v.reduce((s_,q)=>s_+Pp[q].d,0)/3:-1e9;items.push({d:Math.max(f.v.reduce((s_,q)=>s_+Pp[q].d,0)/3,dj)+1e-6,lines:[{pts:[Pp[a].s,Pp[b].s],layer:C}],poly:null});}}
        const sh=f.n[0]*Lw[0]+f.n[1]*Lw[1]+f.n[2]*Lw[2];
        if(p.sombra>0&&sh<0.25){lines.push(...hatch(tri[0],tri[1],tri[2],sp*(sh<-0.15?0.55:1)));}
        items.push({d,lines,poly:tri});
      });
    }
  }
  for(const tw of (model.twigs||[])){
    const P=tw.map(q=>proj(v,q));const d=P.reduce((a,o)=>a+o.d,0)/P.length;
    items.push({d:d+limbTier,lines:[{pts:P.map(o=>o.s),layer:"VEG_CONTORNO*"}],poly:null});
  }
  for(const L of model.limbs){
    const P=L.pts.map(q=>proj(v,q));
    const chunks=[[0,6],[5,10],[9,14]];
    const pp=P.map(o=>o.s);
    const full=limbPoly(pp,L.w0,L.w1);
    // dividimos la rama en tramos con su propia profundidad
    chunks.forEach(([a,b],ci)=>{
      const sub=pp.slice(a,b+1);const wa=L.w0+(L.w1-L.w0)*a/14,wb=L.w0+(L.w1-L.w0)*b/14;
      const lp=limbPoly(sub,wa,wb,(ci===0&&v!=="planta")?(L.flare!=null?L.flare:(L.trunk?0.55*p.real+0.15:0)):0);const dd=P.slice(a,b+1).reduce((s,o)=>s+o.d,0)/(b-a+1);
      const lines=[{pts:lp.lines[0],layer:C},{pts:lp.lines[1],layer:C}];let gpoly=null;
      if(ci===0&&v!=="planta"&&L.pts[0][1]<=1e-9&&sub.length>3){
        const yg=proj(v,[L.pts[0][0],0,L.pts[0][2]]).s[1];let A2=lp.lines[0],B2=lp.lines[1];const sw=A2[0][0]>B2[0][0];if(sw){const t=A2;A2=B2;B2=t;}
        const fl=(L.flare!=null?L.flare:(L.trunk?0.55*p.real+0.15:0)),k=3,bc=sub[0],fw=wa*(1+fl*1.3);
        const mk=(S,sg)=>{const st=[bc[0]+sg*fw,yg],e=S[k],c=[e[0],yg],cur=[];for(let i=0;i<=6;i++){const t=i/6,u=1-t;cur.push([u*u*st[0]+2*u*t*c[0]+t*t*e[0],u*u*st[1]+2*u*t*c[1]+t*t*e[1]]);}return cur.concat(S.slice(k+1));};
        const nA=mk(A2,-1),nB=mk(B2,1),tip=sw?lp.lines[2].slice().reverse():lp.lines[2];
        lines[0]={pts:nA,layer:C};lines[1]={pts:nB,layer:C};lp.lines[0]=sw?nB:nA;lp.lines[1]=sw?nA:nB;
        gpoly=nA.concat(tip.slice(1,-1),nB.slice().reverse());
      }
      if(ci===2)lines.push({pts:lp.lines[2],layer:C});
      if(L.spiral&&v!=="planta"){const R=mulberry(a*17+Math.round(L.w0*1e5));const A2=lp.lines[0],B2=lp.lines[1];
        for(let k=0;k<4;k++){const ph=R()*6.28,fq=U(R,0.35,0.7),pts=[];for(let i=0;i<A2.length;i++){const t=0.5+0.42*Math.sin(ph+(a+i)*fq);pts.push([A2[i][0]+(B2[i][0]-A2[i][0])*t,A2[i][1]+(B2[i][1]-A2[i][1])*t]);}lines.push({pts,layer:D});}
        if(L.knots&&ci===1){for(let k=0;k<2;k++){const i=1+Math.floor(R()*(A2.length-2)),t=U(R,0.3,0.7),c=[A2[i][0]+(B2[i][0]-A2[i][0])*t,A2[i][1]+(B2[i][1]-A2[i][1])*t],r=wa*U(R,0.12,0.22),q=[];for(let j=0;j<=12;j++){const an=j/12*6.283;q.push([c[0]+Math.cos(an)*r*0.7,c[1]+Math.sin(an)*r]);}lines.push({pts:q,layer:D});}}}
      if(L.trunk&&v!=="planta"&&ci<2&&!L.spiral){const R=mulberry(a*31+Math.round(L.w0*1e4));const nb=Math.round(5+10*p.real);
        for(let k=0;k<Math.round(4*p.real);k++){const i=Math.floor(R()*(sub.length-2)),f=U(R,-0.6,0.6);const pts=[];for(let j=0;j<4&&i+j<sub.length;j++){const q=sub[i+j];pts.push([q[0]+f*wa+N(R)*wa*0.06,q[1]]);}if(pts.length>1)lines.push({pts,layer:D});}
        for(let k=0;k<nb;k++){const i=Math.floor(R()*(sub.length-1)),q=sub[i],w=wa*U(R,-0.5,0.5),l=wa*U(R,0.6,1.6);lines.push({pts:[[q[0]+w,q[1]],[q[0]+w+N(R)*wa*0.1,q[1]+l*0.5],[q[0]+w+N(R)*wa*0.15,q[1]+l]],layer:D});}}
      if(L.rings&&v!=="planta"){const A2=lp.lines[0],B2=lp.lines[1];for(let i=0;i<A2.length-1;i++)for(const f of [0,0.34,0.67]){const a=[A2[i][0]+(A2[i+1][0]-A2[i][0])*f,A2[i][1]+(A2[i+1][1]-A2[i][1])*f],b=[B2[i][0]+(B2[i+1][0]-B2[i][0])*f,B2[i][1]+(B2[i+1][1]-B2[i][1])*f],m=[(a[0]+b[0])/2,(a[1]+b[1])/2-Math.hypot(a[0]-b[0],a[1]-b[1])*0.12];lines.push({pts:[a,m,b],layer:D});}}
      const poly=gpoly||lp.poly; items.push({d:dd+limbTier,lines,poly});
    });
  }
  if(p.raices&&v==="alzado"&&model.roots){
    const thin=model.H/700;
    for(const L of model.roots.limbs){
      const P=L.pts.map(q=>proj(v,q)),pp=P.map(o=>o.s),d=P.reduce((a,o)=>a+o.d,0)/P.length;
      if(L.w0<thin){items.push({d,lines:[{pts:pp,layer:"VEG_RAICES*"}],poly:null,root:true});continue;}
      const lp=limbPoly(pp,L.w0,L.w1);
      items.push({d,lines:[{pts:lp.lines[0],layer:"VEG_RAICES"},{pts:lp.lines[1],layer:"VEG_RAICES"},{pts:lp.lines[2],layer:"VEG_RAICES"}],poly:lp.poly,root:true});
    }
    for(const l of model.roots.lines){const P=l.map(q=>proj(v,q));items.push({d:P[0].d,lines:[{pts:P.map(o=>o.s),layer:"VEG_RAICES*"}],poly:null,root:true});}
  }
  if(p.suelo&&v!=="planta"){
    const R=mulberry(p.seed*31+7),sc=Math.min(1.5,Math.max(0.35,model.H/6)),C2=C;
    const tuft=(x,y,n,dd)=>{for(let k=0;k<n;k++){const h=U(R,0.03,0.12)*sc,lean=N(R)*h*0.35,w=h*0.07,bx=x+N(R)*h*0.25;
      const Lb=[],Rb=[];for(let i=0;i<=8;i++){const t=i/8,cx=bx+lean*t*t,cy=y+h*t,ww=w*(1-t);Lb.push([cx-ww,cy]);Rb.push([cx+ww,cy]);}
      const poly=Lb.concat(Rb.slice(0,8).reverse());items.push({d:dd===undefined?1e12:dd,lines:[{pts:poly.slice(1),layer:C2}],poly,ground:true});}};
    if(v==="alzado"){
      const hl=Math.max(model.W*0.36,0.3*sc,(p.raices&&model.roots)?model.roots.spread*1.1:0),n=Math.max(30,Math.round(hl*2/(0.025*sc))),pts=[];
      let yy=0;for(let i=0;i<=n;i++){const x=-hl+2*hl*i/n;yy=yy*0.8+N(R)*0.004*sc;pts.push([x,yy]);}
      // tramo continuo en el centro y discontinuo hacia los extremos
      const segs=[];let i=0;while(i<n){const t=Math.abs(pts[i][0])/hl;const len=t<0.6?n:Math.max(2,Math.round(U(R,2,6)*(1.2-t)));const gap=t<0.6?0:Math.round(U(R,1,3)*(0.5+t));segs.push(pts.slice(i,Math.min(n+1,i+len+1)));i+=len+gap;}
      for(const sg of segs)if(sg.length>1)items.push({d:p.raices?1e12-1:-1e12,lines:[{pts:sg,layer:C2}],poly:null,ground:true});
      const nt=Math.round(hl*2/(0.35*sc));for(let k=0;k<nt;k++){const x=U(R,-hl*0.9,hl*0.9);tuft(x,0,Math.round(U(R,2,6)));}
      for(let k=0;k<4;k++)tuft(N(R)*model.W*0.04,0,Math.round(U(R,3,6)));
      for(let k=0;k<Math.round(hl*3);k++){const x=U(R,-hl,hl),r=U(R,0.008,0.025)*sc,q=[];for(let j=0;j<=8;j++){const a=Math.PI*j/8;q.push([x+Math.cos(a)*r*1.5,Math.sin(a)*r]);}items.push({d:-1e12+1,lines:[{pts:q,layer:D}],poly:null});}
    } else {
      const rg=Math.max(model.W*0.28,0.25*sc),q=[];for(let i=0;i<=72;i++){const a=i/72*6.283,r=rg*(1+0.06*Math.sin(5*a+1)+0.04*Math.sin(9*a));q.push(proj(v,[Math.cos(a)*r,0,Math.sin(a)*r]).s);}
      let i=0;while(i<72){const len=Math.round(U(R,5,12));items.push({d:-1e12,lines:[{pts:q.slice(i,Math.min(73,i+len)),layer:C2}],poly:null,ground:true});i+=len+Math.round(U(R,1,3));}
      for(let k=0;k<10;k++){const a=U(R,0,6.283),r=rg*U(R,0.6,1.05),pb=proj(v,[Math.cos(a)*r,0,Math.sin(a)*r]);tuft(pb.s[0],pb.s[1],Math.round(U(R,2,5)),pb.d);}
      if(!model.rocks)for(let k=0;k<4;k++){const b=proj(v,[N(R)*0.05,0,N(R)*0.05]).s;tuft(b[0],b[1],3);}
    }
  }
  if(v==="planta"){const r=Math.max(0.02,model.W*0.01);items.push({d:1e9,lines:[{pts:[[-r,0],[r,0]],layer:D},{pts:[[0,-r],[0,r]],layer:D}],poly:null});}
  items.sort((a,b)=>b.d-a.d);
  let bb=[Infinity,Infinity,-Infinity,-Infinity];
  for(const it of items){for(const L of it.lines)for(const q of L.pts){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}
    if(it.poly)for(const q of it.poly){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}}
  const crownP=model.crown?model.crown.map(c=>{const pr=proj(v,[c.x,c.y,c.z]),[rx,ry]=clumpRadii(v,c);return fringe(pr.s[0],pr.s[1],rx*1.18,ry*1.18,c.seed+5,0.6);}):[];
  for(const cp of crownP)for(const q of cp){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}
  for(const {poly} of litter)for(const q of poly){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}
  const maxd=Math.max(bb[2]-bb[0],bb[3]-bb[1]),res=maxd/1500;
  // Hiedra: el perímetro sigue sus grupos reales de hojas y tallos. Solo se unen hojas a menos
  // de ~4 cm entre sí, sin rellenar los huecos ni inventar una envolvente.
  const ivy=p.mode==="hiedra";
  const thinM=ivy||p.mode==="graminea"||p.mode==="palmera",fillH=thinM&&!ivy;
  const closeR=model.leafless?2:ivy?Math.max(2,Math.round(0.02/res)):(p.mode==="graminea"||p.mode==="palmera")?Math.round(0.035*maxd/res):Math.max(3,Math.round(0.004*maxd/res));
  const pad=res*(6+closeR);
  const M=new Mask([bb[0]-pad,bb[1]-pad,bb[2]+pad,bb[3]+pad],res);M.minHole=ivy?Math.pow(0.05,2):Math.pow(maxd*(model.leafless?0.012:0.03),2);
  for(const it of items){for(const L of it.lines){M.clip(L.pts,L.layer,it.ground);if(thinM&&L.layer==="VEG_CONTORNO*"&&!it.ground&&!it.root)M.stroke2(L.pts,1);}if(it.poly)M.fill(it.poly,it.root?'r':it.ground);}
  for(const cp of crownP)M.fill(cp,'p');
  M.close2(closeR,fillH);
  let lines=classify(M,true);
  const per=lines.filter(l=>l.layer==="VEG_PERIMETRO"&&l.outer),holesL=lines.filter(l=>l.layer==="VEG_PERIMETRO"&&!l.outer);
  if(v==="planta"&&p.simple){const r=Math.max(0.1,model.W*0.07);lines=lines.filter(l=>l.layer==="VEG_PERIMETRO").concat([{pts:[[-r,0],[r,0]],layer:"VEG_CONTORNO"},{pts:[[0,-r],[0,r]],layer:"VEG_CONTORNO"}]);}
  const white=p.relleno?per.map(l=>({outer:l.pts,holes:holesL.filter(h=>pip(h.pts[0],l.pts)).map(h=>h.pts)})):[];
  const shadow=p.sombraP?castShadow(model,p,v,per):[];
  if(litter.length)lines=addLitter(litter,M,lines,white,shadow,p,v,res);
  for(const L of shadow)for(const q of L){bb[0]=Math.min(bb[0],q[0]);bb[1]=Math.min(bb[1],q[1]);bb[2]=Math.max(bb[2],q[0]);bb[3]=Math.max(bb[3],q[1]);}
  return {lines,bb,white,shadow};
}

/* ---------- hojarasca de otoño (planta e isométrica) ---------- */
// Cada hoja visible entra completa: perímetro cerrado, nervios, relleno y sombra.
// Las que caen bajo la copa (o detrás, en isométrica) no se ven y se descartan.
function addLitter(litter,M,lines,white,shadow,p,v,res){
  const hidden=(x,y)=>M.covered(x,y)||M.at(M.m2,x,y);
  const vis=litter.filter(({poly})=>{
    let cx=0,cy=0;for(const q of poly){if(hidden(q[0],q[1]))return false;cx+=q[0];cy+=q[1];}
    return !hidden(cx/poly.length,cy/poly.length);
  });
  if(!vis.length)return lines;
  // las líneas de suelo que pasan por debajo de una hoja se cortan
  let lb=[Infinity,Infinity,-Infinity,-Infinity];
  for(const {poly} of vis)for(const q of poly){lb[0]=Math.min(lb[0],q[0]);lb[1]=Math.min(lb[1],q[1]);lb[2]=Math.max(lb[2],q[0]);lb[3]=Math.max(lb[3],q[1]);}
  const LM=new Mask([lb[0]-res*4,lb[1]-res*4,lb[2]+res*4,lb[3]+res*4],res);
  for(const {poly} of vis)LM.fill(poly);
  const out=[];
  for(const l of lines){
    if(l.layer==="VEG_PERIMETRO"||l.pts.every(q=>q[0]<lb[0]||q[0]>lb[2]||q[1]<lb[1]||q[1]>lb[3])){out.push(l);continue;}
    LM.out=[];LM.clip(l.pts,l.layer);for(const r of LM.out)out.push({pts:r.pts,layer:l.layer});
  }
  const th=p.sdir*Math.PI/180,el=p.salt*Math.PI/180,dx=Math.cos(th),dz=-Math.sin(th),ct=1/Math.tan(el);
  for(const {lf,poly} of vis){
    const ring=poly.concat([poly[0].slice()]);
    out.push({pts:ring,layer:"VEG_CONTORNO",closed:true,litter:true});
    for(const vn of lf.veins)out.push({pts:vn.map(q=>proj(v,q).s),layer:"VEG_DETALLE",litter:true});
    if(p.relleno)white.push({outer:ring,holes:[],litter:true});
    if(p.sombraP){const sh=lf.outline.map(q=>proj(v,[q[0]+lf.h*ct*dx,0,q[2]+lf.h*ct*dz]).s);sh.push(sh[0].slice());sh.litter=true;shadow.push(sh);}
  }
  return out;
}

export {proj,drawView,layerOf,weightOf,dpLoop,bridge,earclip,pip};
