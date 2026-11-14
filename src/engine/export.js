// Exportación a DXF (AutoCAD) y SVG (Illustrator).
import {earclip,dpLoop,bridge,layerOf,weightOf} from "./draw.js";
function blockName(p,v){const t=((p.species||p.tipo)+(p.estacion&&p.estacion!=="verano"?"_"+p.estacion.slice(0,3):"")).toUpperCase().replace(/[^A-Z0-9_]/g,"");const vv={alzado:"AL",planta:"PL",iso:"ISO"+(p.isoRot?p.isoRot:""),"3V":"3V"}[v];return ("VEG_"+vv+"_"+t+"_"+Math.round(p.H*100)+"CM_"+p.seed).replace(/[^A-Za-z0-9_\-$]/g,"_").slice(0,31);}
function makeDXF(p,vs,views){
  const o=[];const g=(c,v)=>o.push(c,v);
  g(0,"SECTION");g(2,"HEADER");g(9,"$ACADVER");g(1,"AC1009");g(9,"$INSBASE");g(10,0);g(20,0);g(30,0);g(0,"ENDSEC");
  g(0,"SECTION");g(2,"TABLES");
  g(0,"TABLE");g(2,"LTYPE");g(70,1);g(0,"LTYPE");g(2,"CONTINUOUS");g(70,0);g(3,"Solid line");g(72,65);g(73,0);g(40,"0.0");g(0,"ENDTAB");
  g(0,"TABLE");g(2,"LAYER");g(70,7);
  for(const [n,c] of [["VEG_SOMBRA",8],["VEG_RELLENO",255],["VEG_RAICES",94],["VEG_PERIMETRO",94],["VEG_CONTORNO",94],["VEG_DETALLE",94],["VEG_PLANTAS",7]]){g(0,"LAYER");g(2,n);g(70,0);g(62,c);g(6,"CONTINUOUS");}
  g(0,"ENDTAB");g(0,"ENDSEC");g(0,"SECTION");g(2,"BLOCKS");
  const names=[];
  for(const v of vs){
    const nm=blockName(p,v);names.push(nm);
    g(0,"BLOCK");g(8,"0");g(2,nm);g(70,0);g(10,0);g(20,0);g(30,0);g(3,nm);
    const Vw=views[v],tol=Math.max(Vw.bb[2]-Vw.bb[0],Vw.bb[3]-Vw.bb[1])/800;
    const solid=(t,ly)=>{g(0,"SOLID");g(8,ly);g(10,t[0][0].toFixed(4));g(20,t[0][1].toFixed(4));g(30,0);g(11,t[1][0].toFixed(4));g(21,t[1][1].toFixed(4));g(31,0);g(12,t[2][0].toFixed(4));g(22,t[2][1].toFixed(4));g(32,0);g(13,t[2][0].toFixed(4));g(23,t[2][1].toFixed(4));g(33,0);};
    for(const lp of (Vw.shadow||[])){for(const t of earclip(dpLoop(lp,tol)))solid(t,"VEG_SOMBRA");
      g(0,"POLYLINE");g(8,"VEG_SOMBRA");g(66,1);g(10,0);g(20,0);g(30,0);g(70,1);for(const q of lp.slice(0,-1)){g(0,"VERTEX");g(8,"VEG_SOMBRA");g(10,q[0].toFixed(4));g(20,q[1].toFixed(4));g(30,0);}g(0,"SEQEND");g(8,"VEG_SOMBRA");}
    for(const wp of (Vw.white||[])){const ring=bridge(dpLoop(wp.outer,tol),wp.holes.map(h=>dpLoop(h,tol)));for(const t of earclip(ring))solid(t,"VEG_RELLENO");}
    for(const l0 of views[v].lines){const ly=layerOf(l0,p);const wd=p.dxfw?(weightOf(ly,p)*p.escala/1000):0;
      const cl=!!l0.closed,vp=cl?l0.pts.slice(0,-1):l0.pts;
      g(0,"POLYLINE");g(8,ly);g(66,1);g(10,0);g(20,0);g(30,0);g(70,cl?1:0);if(wd>0){g(40,wd.toFixed(5));g(41,wd.toFixed(5));}
      for(const q of vp){g(0,"VERTEX");g(8,ly);g(10,q[0].toFixed(4));g(20,q[1].toFixed(4));g(30,0);}g(0,"SEQEND");g(8,ly);}
    g(0,"ENDBLK");g(8,"0");
  }
  g(0,"ENDSEC");g(0,"SECTION");g(2,"ENTITIES");
  let x=0;const gap=Math.max(1,p.W*0.35);
  vs.forEach((v,i)=>{const b=views[v].bb;const ix=x-b[0];g(0,"INSERT");g(8,"VEG_PLANTAS");g(2,names[i]);g(10,ix.toFixed(4));g(20,0);g(30,0);x+=b[2]-b[0]+gap;});
  g(0,"ENDSEC");g(0,"EOF");
  return o.join("\n")+"\n";
}
function makeSVG(p,vs,views){
  const k=1000/p.escala; // mm por metro
  const L=[];let x=0;const gap=Math.max(1,p.W*0.35);let bb=[Infinity,Infinity,-Infinity,-Infinity];
  vs.forEach(v=>{const b=views[v].bb;const dx=x-b[0];L.push({v,dx});bb[0]=Math.min(bb[0],b[0]+dx);bb[1]=Math.min(bb[1],b[1]);bb[2]=Math.max(bb[2],b[2]+dx);bb[3]=Math.max(bb[3],b[3]);x+=b[2]-b[0]+gap;});
  const m=0.2,W=(bb[2]-bb[0]+2*m),H=(bb[3]-bb[1]+2*m);
  const groups={VEG_RAICES:[],VEG_PERIMETRO:[],VEG_CONTORNO:[],VEG_DETALLE:[]};
  for(const o of L)for(const l of views[o.v].lines){groups[layerOf(l,p)].push('<path d="M'+(l.closed?l.pts.slice(0,-1):l.pts).map(q=>((q[0]+o.dx-bb[0]+m)*k).toFixed(2)+" "+((bb[3]-q[1]+m)*k).toFixed(2)).join(" L")+(l.closed?" Z":"")+'"/>');}
  const ink="#1f4a33";
  const fillPath=(loops,dx)=>loops.map(lp=>'M'+lp.slice(0,-1).map(q=>((q[0]+dx-bb[0]+m)*k).toFixed(2)+" "+((bb[3]-q[1]+m)*k).toFixed(2)).join(" L")+" Z").join(" ");
  let sh="",wh="";for(const o of L){const V=views[o.v];if(V.shadow&&V.shadow.length)sh+=fillPath(V.shadow,o.dx)+" ";if(V.white&&V.white.length)wh+=fillPath(V.white.flatMap(wp=>[wp.outer,...wp.holes]),o.dx)+" ";}
  return '<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="'+(W*k).toFixed(2)+'mm" height="'+(H*k).toFixed(2)+'mm" viewBox="0 0 '+(W*k).toFixed(2)+' '+(H*k).toFixed(2)+'">\n'+
  '<title>'+blockName(p,vs.length>1?"3V":vs[0])+' escala 1:'+p.escala+'</title>\n'+
  (sh?'<g id="VEG_SOMBRA"><path fill="#9f998b" stroke="none" d="'+sh+'"/></g>\n':'')+(wh?'<g id="VEG_RELLENO"><path fill="#ffffff" fill-rule="evenodd" stroke="none" d="'+wh+'"/></g>\n':'')+
  (groups.VEG_RAICES.length?'<g id="VEG_RAICES" fill="none" stroke="'+ink+'" stroke-width="'+p.gr+'" stroke-linecap="round" stroke-linejoin="round">\n'+groups.VEG_RAICES.join("\n")+'\n</g>\n':'')+
  '<g id="VEG_DETALLE" fill="none" stroke="'+ink+'" stroke-width="'+p.gd+'" stroke-linecap="round" stroke-linejoin="round">\n'+groups.VEG_DETALLE.join("\n")+'\n</g>\n'+
  '<g id="VEG_CONTORNO" fill="none" stroke="'+ink+'" stroke-width="'+p.gc+'" stroke-linecap="round" stroke-linejoin="round">\n'+groups.VEG_CONTORNO.join("\n")+'\n</g>\n'+
  (groups.VEG_PERIMETRO.length?'<g id="VEG_PERIMETRO" fill="none" stroke="'+ink+'" stroke-width="'+p.gp+'" stroke-linecap="round" stroke-linejoin="round">\n'+groups.VEG_PERIMETRO.join("\n")+'\n</g>\n':'')+'</svg>\n';
}
export {blockName,makeDXF,makeSVG};
