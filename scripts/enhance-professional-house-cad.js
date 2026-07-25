#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const dir=path.join(root,'assets','quote-builder','whole-house-cad');
fs.mkdirSync(dir,{recursive:true});
const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
const T=(x,y,s,c='txt',a='start',r='')=>`<text x="${x}" y="${y}" class="${c}" text-anchor="${a}"${r?` transform="rotate(${r} ${x} ${y})"`:''}>${esc(s)}</text>`;
const L=(x1,y1,x2,y2,c='thin')=>`<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="${c}"/>`;
const R=(x,y,w,h,c='thin',rx=0)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" class="${c}"/>`;
const C=(x,y,r,c='thin')=>`<circle cx="${x}" cy="${y}" r="${r}" class="${c}"/>`;
const P=(d,c='thin')=>`<path d="${d}" class="${c}"/>`;
const PL=(pts,c='thin')=>`<polyline points="${pts}" class="${c}"/>`;
const dimH=(x1,x2,y,o,s)=>L(x1,y,x1,y+o,'ext')+L(x2,y,x2,y+o,'ext')+L(x1,y+o,x2,y+o,'dimline')+T((x1+x2)/2,y+o-7,s,'dim','middle');
const dimV=(x,y1,y2,o,s)=>L(x,y1,x+o,y1,'ext')+L(x,y2,x+o,y2,'ext')+L(x+o,y1,x+o,y2,'dimline')+T(x+o-7,(y1+y2)/2,s,'dim','middle',-90);
const bubble=(x,y,s)=>C(x,y,15,'bubble')+T(x,y+4,s,'bubbletxt','middle');
const leader=(x1,y1,x2,y2,s,tx=x1,ty=y1-8,a='start')=>L(x1,y1,x2,y2,'leader')+T(tx,ty,s,'tiny',a);
const defs=`<defs><marker id="arr" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#111"/></marker><marker id="oa" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto"><path d="M8 1L1 4.5L8 8" fill="none" stroke="#111"/></marker><pattern id="concrete" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="1"/><circle cx="13" cy="12" r="1"/><path d="M2 15l4-2M11 3l4-2" stroke="#666" stroke-width=".8"/></pattern><pattern id="wood" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0M-3 3L3-3M9 15L15 9" stroke="#777" stroke-width=".7"/></pattern><pattern id="insul" width="28" height="14" patternUnits="userSpaceOnUse"><path d="M0 7Q7-2 14 7T28 7" fill="none" stroke="#777" stroke-width="1"/></pattern><pattern id="earth" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 10Q5 2 10 10T20 10" fill="none" stroke="#777" stroke-width=".8"/></pattern><pattern id="roof" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 9L7 2M7 9L14 2" stroke="#777" stroke-width=".7"/></pattern></defs>`;
const css=`<style>.border{fill:#fff;stroke:#111;stroke-width:3}.inner{fill:none;stroke:#111;stroke-width:1}.cut{fill:#fff;stroke:#050505;stroke-width:5}.heavy{fill:none;stroke:#050505;stroke-width:4}.outline{fill:none;stroke:#111;stroke-width:2.2}.object{fill:none;stroke:#111;stroke-width:1.4}.thin{fill:none;stroke:#333;stroke-width:1}.hair{fill:none;stroke:#777;stroke-width:.6}.ext{fill:none;stroke:#666;stroke-width:.75}.hidden{fill:none;stroke:#555;stroke-width:1;stroke-dasharray:7 5}.center{fill:none;stroke:#777;stroke-width:.8;stroke-dasharray:13 4 2 4}.erase{stroke:#fff;stroke-width:11}.doorarc{fill:none;stroke:#555;stroke-width:1}.dimline{fill:none;stroke:#111;stroke-width:.8;marker-start:url(#oa);marker-end:url(#oa)}.leader{stroke:#111;stroke-width:1;marker-end:url(#arr)}.bubble{fill:#fff;stroke:#111;stroke-width:1.4}.bubbletxt{font:700 12px Arial}.txt{font:11px Arial}.tiny{font:8.5px Arial}.small{font:10px Arial}.dim{font:9px Arial}.room{font:700 13px Arial;letter-spacing:.04em}.title{font:700 20px Arial}.sub{font:11px Arial;fill:#333}.tb{font:9px Arial}.tbhead{font:700 12px Arial}.sheetno{font:700 34px Arial}.warn{font:700 10px Arial;fill:#8c1d1d}.window{stroke:#111;stroke-width:1.4}.glass{fill:#fff;stroke:#111;stroke-width:1.2}.muntin{stroke:#555;stroke-width:.7}.fixture{fill:#fff;stroke:#111;stroke-width:1.2}.furniture{fill:#fff;stroke:#555;stroke-width:1}.casework{fill:#fff;stroke:#111;stroke-width:1.2}.hot{fill:none;stroke:#ba2b2b;stroke-width:2}.cold{fill:none;stroke:#16729e;stroke-width:2}.waste{fill:none;stroke:#444;stroke-width:3}.duct{fill:none;stroke:#69468a;stroke-width:3}.grade{fill:none;stroke:#286a3e;stroke-width:2}.concrete{fill:url(#concrete);stroke:#111}.wood{fill:url(#wood);stroke:#111}.insul{fill:url(#insul);stroke:#111}.earth{fill:url(#earth);stroke:#111}.roof{fill:url(#roof);stroke:#111}.fillgray{fill:#eee;stroke:#111}.filldark{fill:#ddd;stroke:#111}.sectionmark{fill:#fff;stroke:#111;stroke-width:2}.material{font:700 8px Arial;letter-spacing:.04em}</style>`;
function frame(num,title,scale,classif,body,notes){let ns='';notes.forEach((n,i)=>ns+=T(70,875+i*20,`${i+1}. ${n}`,'tiny'));return `<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="17in" height="11in" viewBox="0 0 1700 1100" role="img"><title>${esc(num+' '+title)}</title>${defs}${css}${R(25,25,1650,1050,'border')}${R(45,45,1610,1010,'inner')}${T(70,75,num+' — '+title,'title')}${T(70,97,`${scale} · ${classif} · REV E · REPRESENTATIVE / FIELD VERIFY`,'sub')}${body}${L(45,845,1655,845,'outline')}${ns}${titleBlock(num,title,scale,classif)}</svg>`;}
function titleBlock(n,title,scale,classif){return R(1160,845,495,210,'inner')+L(1160,915,1655,915,'inner')+L(1430,845,1430,1055,'inner')+L(1160,985,1655,985,'inner')+T(1175,870,'HIGHWAY 38 SOLUTIONS','tbhead')+T(1175,889,'Universal Quote Builder Demonstration','tb')+T(1175,906,'Whole-House Renovation & Property Improvement','tb')+T(1445,870,'SHEET','tb')+T(1540,895,n,'sheetno','middle')+T(1175,940,title,'tbhead')+T(1175,958,`Scale: ${scale}`,'tb')+T(1175,976,classif,'tb')+T(1445,940,'REVISION','tb')+T(1540,965,'E','sheetno','middle')+T(1175,1010,'Prepared by H38 Quote Builder','tb')+T(1175,1028,'Issue: 2026-07-25','tb')+T(1445,1010,'NOT FOR CONSTRUCTION','warn')+T(1445,1028,'Field verification required','tb');}
function doorH(x,y,w,right=true){return L(x,y,x+w,y,'erase')+L(right?x:x+w,y,right?x:x+w,y-w,'object')+P(`M${right?x:x+w} ${y-w}A${w} ${w} 0 0 ${right?1:0} ${right?x+w:x} ${y}`,'doorarc');}
function doorV(x,y,h,down=true){return L(x,y,x,y+h,'erase')+L(x,down?y:y+h,x+h,down?y:y+h,'object')+P(`M${x+h} ${down?y:y+h}A${h} ${h} 0 0 ${down?0:1} ${x} ${down?y+h:y}`,'doorarc');}
function winH(x,y,w,tag=''){let s=L(x,y-6,x+w,y-6,'window')+L(x,y+6,x+w,y+6,'window')+L(x,y-11,x,y+11)+L(x+w,y-11,x+w,y+11);if(tag)s+=T(x+w/2,y-16,tag,'tiny','middle');return s;}
function winV(x,y,h,tag=''){let s=L(x-6,y,x-6,y+h,'window')+L(x+6,y,x+6,y+h,'window')+L(x-11,y,x+11,y)+L(x-11,y+h,x+11,y+h);if(tag)s+=T(x+16,y+h/2,tag,'tiny','start',-90);return s;}
function roomTag(x,y,name,size,finish){return T(x,y,name,'room','middle')+T(x,y+18,size,'small','middle')+T(x,y+34,finish,'tiny','middle');}
function sectionMarker(x,y,label,dir='right'){const dx=dir==='right'?35:-35;return C(x,y,17,'sectionmark')+T(x,y+4,label,'bubbletxt','middle')+L(x,y,x+dx,y,'heavy')+PL(`${x+dx},${y} ${x+dx-(dir==='right'?10:-10)},${y-7} ${x+dx-(dir==='right'?10:-10)},${y+7} ${x+dx},${y}`,'heavy');}
function elevationMarker(x,y,num,sheet){return C(x,y,20,'sectionmark')+L(x-20,y,x+20,y,'thin')+T(x,y-4,num,'bubbletxt','middle')+T(x,y+13,sheet,'tiny','middle');}
function furnitureSofa(x,y,w,h){return R(x,y,w,h,'furniture',8)+R(x+8,y+8,w-16,18,'furniture',5)+L(x+w/3,y+8,x+w/3,y+h-8)+L(x+2*w/3,y+8,x+2*w/3,y+h-8);}
function detailedPlan(){const x=205,y=135,w=960,h=640;let b='';
[['A',x],['B',x+340],['C',x+610],['D',x+790],['E',x+w]].forEach(g=>b+=L(g[1],95,g[1],810,'center')+bubble(g[1],100,g[0])+bubble(g[1],810,g[0]));
[['1',y],['2',y+300],['3',y+475],['4',y+h]].forEach(g=>b+=L(165,g[1],1210,g[1],'center')+bubble(170,g[1],g[0])+bubble(1205,g[1],g[0]));
b+=R(x,y,w,h,'cut')+R(x+12,y+12,w-24,h-24,'outline');const v1=x+340,v2=x+610,v3=x+790,mid=y+300,low=y+475;
[[v1,y+12,v1,mid],[v2,y+12,v2,y+h-12],[v3,y+12,v3,y+h-12],[x+12,mid,x+w-12,mid],[x+12,low,v1,low]].forEach(q=>b+=L(...q,'cut'));
[[v1+8,y+12,v1+8,mid],[v2+8,y+12,v2+8,y+h-12],[v3+8,y+12,v3+8,y+h-12],[x+12,mid+8,x+w-12,mid+8],[x+12,low+8,v1,low+8]].forEach(q=>b+=L(...q,'outline'));
// exterior openings
b+=doorH(x+445,y+h-12,90,true)+doorV(x+w-12,y+115,86,true)+doorV(v1,y+175,72,true)+doorV(v2,y+370,72,true)+doorV(v3,y+365,72,true);
b+=winH(x+62,y,116,'W1')+winH(x+220,y,96,'W2')+winH(x+700,y,116,'W1')+winH(x+835,y,92,'W2')+winV(x,y+60,110,'W1')+winV(x,y+390,100,'W2')+winV(x+w,y+55,112,'W1')+winV(x+w,y+365,112,'W1');
// front porch and rear deck
b+=R(x+330,y+h,300,62,'wood')+L(x+360,y+h,x+360,y+h+62,'outline')+L(x+600,y+h,x+600,y+h+62,'outline')+T(x+480,y+h+35,'COVERED FRONT PORCH','tiny','middle');
b+=R(x+w,y+85,100,210,'wood')+T(x+w+50,y+195,'REAR DECK','tiny','middle',-90);
// Kitchen detailed casework
b+=R(x+28,y+28,285,50,'casework')+R(x+28,y+102,48,150,'casework')+R(x+236,y+102,77,150,'casework')+R(x+118,y+142,150,78,'casework');
[0,55,110,165,220].forEach(d=>L(x+40+d,y+28,x+40+d,y+78));
b+=R(x+115,y+28,70,50,'fixture')+T(x+150,y+57,'SINK','tiny','middle')+R(x+218,y+28,55,50,'fixture')+T(x+245,y+57,'RANGE','tiny','middle')+R(x+28,y+105,48,65,'fixture')+T(x+52,y+140,'REF','tiny','middle',-90)+R(x+150,y+160,55,45,'fixture')+T(x+177,y+187,'MW','tiny','middle');
// dining table/chairs
b+=R(v1+88,y+112,110,62,'furniture',10)+C(v1+80,y+102,10,'furniture')+C(v1+206,y+102,10,'furniture')+C(v1+80,y+184,10,'furniture')+C(v1+206,y+184,10,'furniture');
// living furniture
b+=furnitureSofa(v2+32,y+80,115,55)+R(v2+72,y+185,82,42,'furniture',8)+R(v2+165,y+90,30,95,'furniture',5);
// flex room desk
b+=R(v3+28,y+55,115,38,'furniture')+R(v3+45,y+180,85,38,'furniture')+T(v3+85,y+78,'DESK','tiny','middle');
// office furniture
b+=R(x+45,mid+50,145,52,'furniture')+R(x+225,mid+80,72,35,'furniture')+T(x+118,mid+80,'DESK / WORKBENCH','tiny','middle');
// stair
for(let i=0;i<11;i++)b+=L(v1+50,mid+34+i*16,v2-38,mid+34+i*16,'thin');b+=P(`M${v1+72} ${low-20}L${v2-62} ${mid+45}`,'leader')+T((v1+v2)/2,mid+130,'UP','tbhead','middle');
// laundry/mech/bath fixtures
b+=R(v2+30,mid+48,45,45,'fixture')+C(v2+52,mid+70,14,'thin')+T(v2+52,mid+105,'W','tiny','middle')+R(v2+86,mid+48,45,45,'fixture')+C(v2+108,mid+70,14,'thin')+T(v2+108,mid+105,'D','tiny','middle');
b+=R(v3+30,low+35,58,38,'fixture')+C(v3+132,low+58,20,'fixture')+R(v3+185,low+32,80,54,'fixture');
// room tags
b+=roomTag(x+170,y+267,'KITCHEN','17′-0″ × 15′-0″','F-1 / W-1 / C-1')+roomTag(v1+145,y+250,'DINING','13′-6″ × 15′-0″','F-1 / W-1 / C-1')+roomTag(v2+92,y+250,'LIVING','9′-0″ × 15′-0″','F-2 / W-1 / C-1')+roomTag(v3+82,y+250,'SUN / FLEX','8′-6″ × 15′-0″','F-2 / W-1 / C-1');
b+=roomTag(x+165,mid+155,'OFFICE / SHOP','17′-0″ × 8′-9″','F-2 / W-1 / C-1')+roomTag((v1+v2)/2,low+90,'FOYER / STAIR','13′-6″ × 8′-3″','F-3 / W-1 / C-1')+roomTag((v2+v3)/2,mid+165,'MUD / LAUNDRY','9′-0″ × 8′-9″','F-3 / W-1 / C-1')+roomTag(v3+84,mid+165,'BATH / MECH','8′-6″ × 8′-9″','F-3 / W-2 / C-1');
// wall, door, window tags
b+=bubble(x+330,y+100,'W1')+leader(x+345,y+100,x+312,y+75,'EXTERIOR WALL TYPE W1',x+350,y+92);
b+=bubble(v2+15,mid+35,'P1')+leader(v2+30,mid+35,v2+5,mid+15,'INTERIOR PARTITION P1',v2+35,mid+27);
b+=bubble(x+445,y+h-35,'D1')+bubble(x+w-40,y+115,'D2');
// section/elevation markers
b+=sectionMarker(x+120,y+110,'A','right')+sectionMarker(x+w-120,y+110,'A','left');
b+=elevationMarker(x+15,y+20,'1','A-201')+elevationMarker(x+w-15,y+20,'3','A-201');
// dimensions
b+=dimH(x,x+w,y+h,80,'48′-0″ OVERALL')+dimH(x,v1,y+h,116,'17′-0″')+dimH(v1,v2,y+h,116,'13′-6″')+dimH(v2,v3,y+h,116,'9′-0″')+dimH(v3,x+w,y+h,116,'8′-6″');
b+=dimV(x,y,y+h,-55,'32′-0″ OVERALL')+dimV(x,y,mid,-92,'15′-0″')+dimV(x,mid,low,-92,'8′-9″')+dimV(x,low,y+h,-92,'8′-3″');
// north, notes/schedules
b+=P('M1490 190V115L1468 150M1490 115L1512 150','outline')+T(1490,104,'N','tbhead','middle');
b+=R(1285,230,325,355,'inner')+T(1305,258,'KEYED PLAN NOTES','tbhead');['Verify bearing and existing wall conditions before demolition.','Maintain 42″ minimum kitchen work aisles and appliance clearances.','Coordinate new rear patio door header, flashing, deck landing, and guards.','Maintain 36″ minimum stair and egress clear width.','Provide blocking for cabinets, rails, fixtures, equipment, and wall-mounted items.','Coordinate HVAC, plumbing, electrical, lighting, low-voltage, and firestopping before close-in.'].forEach((s,i)=>b+=bubble(1322,293+i*45,i+1)+T(1345,297+i*45,s,'tiny'));
b+=R(1285,610,325,185,'inner')+T(1305,637,'DOOR / WINDOW SCHEDULE','tbhead');[['D1','3′-0″ × 6′-8″','INSULATED ENTRY'],['D2','6′-0″ × 6′-8″','GLAZED PATIO'],['W1','3′-0″ × 5′-0″','DOUBLE-HUNG'],['W2','2′-6″ × 4′-0″','CASEMENT']].forEach((r,i)=>{const yy=670+i*29; b+=L(1285,yy-16,1610,yy-16,'thin')+T(1300,yy,r[0],'tbhead')+T(1350,yy,r[1],'tiny')+T(1450,yy,r[2],'tiny');});
return frame('A-101','Proposed Main-Floor Plan — Detailed','1/4″ = 1′-0″','Estimating / Field Layout',b,['All dimensions and opening sizes are representative and must be field verified before ordering, permit submission, or construction.','Furniture and equipment are shown for clearance and coordination only.','See A-301 for section/details, A-401 for kitchen, and trade sheets for final routing.']);}
function windowElevation(x,y,w,h,cols=2,rows=2){let s=R(x,y,w,h,'glass');for(let i=1;i<cols;i++)s+=L(x+w*i/cols,y,x+w*i/cols,y+h,'muntin');for(let j=1;j<rows;j++)s+=L(x,y+h*j/rows,x+w,y+h*j/rows,'muntin');return s;}
function detailedElevations(){let b='';
function front(ox,oy,W,H,label,kind){let s=R(ox,oy,W,H,'inner')+T(ox+12,oy+24,label,'tbhead');const gx=ox+55,gy=oy+H-43,bw=W-110,eave=gy-142,ridge=eave-92;s+=L(gx-20,gy,gx+bw+20,gy,'grade')+R(gx,gy-22,bw,22,'concrete')+R(gx,eave,bw,gy-eave-22,'outline')+PL(`${gx-25},${eave+5} ${gx+bw/2},${ridge} ${gx+bw+25},${eave+5}`,'roof');s+=L(gx,eave,gx+bw,eave,'heavy')+L(gx-20,eave+6,gx+bw+20,eave+6,'outline');
for(let yy=eave+15;yy<gy-22;yy+=13)s+=L(gx,yy,gx+bw,yy,'hair');
if(kind==='front'){
 // porch roof/posts/deck
 s+=R(gx+110,gy-32,bw-220,32,'wood')+PL(`${gx+90},${eave+76} ${gx+bw/2},${eave+26} ${gx+bw-90},${eave+76}`,'roof')+L(gx+105,eave+76,gx+bw-105,eave+76,'heavy');
 [gx+130,gx+bw/2-65,gx+bw/2+65,gx+bw-130].forEach(px=>s+=R(px,eave+76,12,gy-eave-108,'outline'));
 s+=R(gx+bw/2-30,gy-108,60,86,'outline')+L(gx+bw/2,gy-108,gx+bw/2,gy-22,'muntin');
 s+=windowElevation(gx+55,eave+40,58,70,2,2)+windowElevation(gx+175,eave+40,58,70,2,2)+windowElevation(gx+bw-233,eave+40,58,70,2,2)+windowElevation(gx+bw-113,eave+40,58,70,2,2);
 // upper windows/dormer
 s+=windowElevation(gx+82,eave-8,54,55,2,2)+windowElevation(gx+bw-136,eave-8,54,55,2,2)+R(gx+bw/2-55,eave-54,110,60,'outline')+PL(`${gx+bw/2-65},${eave-48} ${gx+bw/2},${eave-92} ${gx+bw/2+65},${eave-48}`,'roof')+windowElevation(gx+bw/2-22,eave-38,44,40,2,2);
 } else if(kind==='rear'){
 s+=R(gx+160,gy-28,bw-320,28,'wood')+L(gx+175,gy-70,gx+175,gy,'outline')+L(gx+bw-175,gy-70,gx+bw-175,gy,'outline')+L(gx+175,gy-70,gx+bw-175,gy-70,'outline');
 s+=R(gx+bw/2-38,gy-115,76,93,'outline')+windowElevation(gx+65,eave+40,62,70,2,2)+windowElevation(gx+180,eave+40,62,70,2,2)+windowElevation(gx+bw-242,eave+40,62,70,2,2)+windowElevation(gx+bw-127,eave+40,62,70,2,2)+windowElevation(gx+90,eave-10,58,58,2,2)+windowElevation(gx+bw-148,eave-10,58,58,2,2);
 s+=R(gx+bw-80,ridge+65,28,eave-ridge-45,'outline')+T(gx+bw-66,ridge+55,'CHIMNEY','tiny','middle');
 } else {
 s+=windowElevation(gx+100,eave+42,58,68,2,2)+windowElevation(gx+bw-158,eave+42,58,68,2,2)+windowElevation(gx+100,eave-8,52,55,2,2)+windowElevation(gx+bw-152,eave-8,52,55,2,2);
 if(kind==='east')s+=R(gx+bw-90,gy-112,52,90,'outline')+T(gx+bw-64,gy-66,'SERVICE','tiny','middle',-90);
 if(kind==='west')s+=R(gx+48,ridge+65,28,eave-ridge-45,'outline');
 }
 // fascia/soffit/foundation and datums
 s+=L(gx,eave+12,gx+bw,eave+12,'thin')+L(gx,gy-22,gx+bw,gy-22,'heavy')+T(gx+5,gy+17,'FIN. GRADE 100′-0″','tiny');
 s+=dimH(gx,gx+bw,gy,27,kind==='front'||kind==='rear'?'48′-0″':'32′-0″')+dimV(gx,eave,gy,-27,'18′-0″ EAVE')+dimV(gx,ridge,gy,-55,'24′-6″ RIDGE')+T(gx+bw/2,ridge+18,'8:12','tiny','middle');
 s+=leader(gx+bw-30,eave-8,gx+bw-80,eave-25,'ASPHALT SHINGLES / METAL DRIP EDGE',gx+bw-20,eave-18,'end');
 s+=leader(gx+35,eave+45,gx+95,eave+60,'LAP SIDING + 5/4 TRIM',gx+25,eave+35);
 return s;}
b+=front(62,120,775,330,'SOUTH / FRONT ELEVATION','front')+front(863,120,775,330,'NORTH / REAR ELEVATION','rear')+front(62,475,775,330,'EAST / RIGHT ELEVATION','east')+front(863,475,775,330,'WEST / LEFT ELEVATION','west');
// elevation keyed notes
b+=bubble(440,190,'1')+L(455,190,485,225,'leader')+bubble(1215,350,'2')+L(1200,350,1150,368,'leader')+bubble(435,650,'3')+L(450,650,515,675,'leader')+bubble(1215,565,'4')+L(1200,565,1150,585,'leader');
return frame('A-201','Exterior Elevations — Detailed Four Views','1/8″ = 1′-0″','Estimating / Field Verification',b,['1. Verify roof framing, pitch, overhangs, ventilation, flashing, gutters, and all penetrations.','2. Rear deck/porch, patio door, ledger, guards, stairs, and grade require final coordinated design.','3. Verify electrical, gas, HVAC, water, sewer, camera, and communication service locations.','4. Window/door units, trim, siding, foundation exposure, and finish grades require field verification and approved schedules.']);}
function detailedSection(){let b='';
// main building section
b+=T(65,124,'BUILDING SECTION A-A — THROUGH PORCH / KITCHEN / STAIR','tbhead')+R(65,138,930,660,'inner');const x=150,slab=690,w=760,wallTop=355,upper=510,ridge=155;
// earth/footings/foundation
b+=R(x-25,slab,810,80,'earth')+R(x+15,slab-42,730,42,'concrete')+R(x+35,slab-135,34,95,'concrete')+R(x+w-69,slab-135,34,95,'concrete')+R(x+10,slab-28,740,18,'concrete');
// walls floors roof
b+=R(x+35,wallTop,34,slab-135-wallTop,'insul')+R(x+w-69,wallTop,34,slab-135-wallTop,'insul')+R(x+55,upper-12,w-110,24,'wood')+R(x+55,slab-150,w-110,24,'wood');
b+=PL(`${x+5},${wallTop+5} ${x+w/2},${ridge} ${x+w-5},${wallTop+5}`,'roof')+PL(`${x+25},${wallTop+15} ${x+w/2},${ridge+22} ${x+w-25},${wallTop+15}`,'outline');
// rafters/trusses
for(let i=0;i<8;i++){const xx=x+80+i*85;b+=L(x+w/2,ridge+22,xx,wallTop+15,'thin');}
// ceiling insulation and interior partitions
b+=R(x+60,wallTop+20,w-120,20,'insul')+L(x+260,upper+12,x+260,slab-150,'outline')+L(x+500,upper+12,x+500,slab-150,'outline')+L(x+350,wallTop+40,x+350,upper-12,'outline');
// stairs in section
for(let i=0;i<10;i++)b+=PL(`${x+300+i*20},${slab-150-i*16} ${x+320+i*20},${slab-150-i*16} ${x+320+i*20},${slab-166-i*16}`,'outline');
// front porch section
b+=R(x-70,slab-70,95,18,'wood')+R(x-55,slab-52,10,52,'outline')+PL(`${x-95},${wallTop+100} ${x-20},${wallTop+50} ${x+55},${wallTop+100}`,'roof')+L(x-72,wallTop+100,x+30,wallTop+100,'heavy')+R(x-60,wallTop+100,10,slab-wallTop-170,'outline');
// material labels/callouts
b+=leader(x+450,ridge+10,x+520,ridge-18,'8:12 ROOF — SHINGLES / UNDERLAYMENT / SHEATHING',x+530,ridge-22);
b+=leader(x+w-50,wallTop+100,x+w+80,wallTop+75,'2×6 WALL + INSULATION + WRB + SIDING',x+w+90,wallTop+78);
b+=leader(x+600,upper,x+w+80,upper-20,'ENGINEERED FLOOR SYSTEM / SUBFLOOR',x+w+90,upper-16);
b+=leader(x+600,slab-140,x+w+80,slab-120,'FIRST-FLOOR SYSTEM / AIR SEAL',x+w+90,slab-116);
b+=leader(x+70,slab-80,x-60,slab-115,'FOUNDATION / FOOTING — VERIFY',x-70,slab-120,'end');
// dimensions/datums
b+=dimV(x,slab-135,upper,-45,'9′-0″')+dimV(x,upper,wallTop,-45,'9′-0″')+dimV(x,ridge,slab,-76,'24′-6″')+T(x-15,slab+5,'T.O. SLAB 100′-0″','tiny','end')+T(x-15,upper+5,'SECOND FLOOR 109′-0″','tiny','end')+T(x-15,wallTop+5,'EAVE 118′-0″','tiny','end');
// detail 1 wall section
b+=T(1040,124,'DETAIL 1 — EXTERIOR WALL / EAVE','tbhead')+R(1040,138,590,315,'inner');
b+=R(1090,185,26,220,'outline')+R(1116,185,44,220,'wood')+R(1160,185,78,220,'insul')+R(1238,185,18,220,'outline')+R(1070,185,20,220,'outline');
b+=PL('1070,185 1090,185 1116,185 1160,185 1238,185 1256,185','heavy');
[['1/2″ GYPSUM BOARD',1256,205],['2×6 STUD + R-21 INSULATION',1238,245],['7/16″ SHEATHING',1160,285],['WRB / FLASHING PLANE',1116,325],['LAP SIDING / TRIM',1090,365]].forEach((r,i)=>b+=L(r[1],r[2]-4,1430,r[2]-4,'leader')+T(1440,r[2],r[0],'tiny'));
b+=R(1090,170,166,15,'insul')+PL('1080,170 1165,115 1270,170','roof')+L(1090,170,1270,170,'heavy')+leader(1270,145,1430,125,'VENTED SOFFIT / ICE BARRIER / DRIP EDGE',1440,129);
// detail 2 window
b+=T(1040,475,'DETAIL 2 — WINDOW OPENING / FLASHING','tbhead')+R(1040,490,285,310,'inner');
b+=R(1110,555,100,145,'glass')+R(1094,540,132,177,'outline')+PL('1080,535 1160,515 1240,535','outline')+PL('1090,710 1160,735 1230,710','outline');
b+=leader(1215,540,1285,520,'HEAD FLASHING BEHIND WRB',1295,524)+leader(1220,705,1285,735,'SLOPED PAN + END DAMS',1295,739)+leader(1100,620,1055,620,'BACKER ROD + SEALANT',1045,624,'end');
// detail 3 ledger
b+=T(1350,475,'DETAIL 3 — DECK LEDGER / FLASHING','tbhead')+R(1350,490,280,310,'inner');
b+=R(1385,545,38,175,'wood')+R(1423,570,135,32,'wood')+R(1423,642,175,28,'wood')+PL('1415,555 1550,520','outline')+R(1460,602,24,68,'outline')+C(1470,585,6)+C(1518,585,6)+P('M1423 560L1555 525L1565 540L1430 578Z','fillgray');
b+=leader(1550,525,1605,515,'CONTINUOUS METAL FLASHING',1615,519,'end')+leader(1518,585,1605,575,'STRUCTURAL FASTENERS',1615,579,'end')+leader(1480,655,1605,660,'JOIST HANGER / LEDGER',1615,664,'end')+leader(1420,690,1365,735,'AIR / WATER SEAL AT WALL',1355,739,'end');
return frame('A-301','Building Sections & Envelope Details — Detailed','1/4″ = 1′-0″ / 1 1/2″ = 1′-0″','Professional Review Required',b,['Section assemblies are representative and must be reconciled with verified existing construction.','Roof framing, headers, beams, foundations, deck ledger/footings, guards, stairs, and structural modifications require final engineering/code review.','Maintain continuous drainage, air, vapor, thermal, flashing, and firestopping layers at all transitions.']);}
function cabinetDoor(x,y,w,h,style='shaker'){let s=R(x,y,w,h,'casework');if(style==='shaker')s+=R(x+8,y+8,w-16,h-16,'thin');return s;}
function detailedKitchen(){let b='';const x=70,y=135,w=760,h=600;
b+=T(70,117,'ENLARGED KITCHEN PLAN','tbhead')+R(x,y,w,h,'cut')+R(x+10,y+10,w-20,h-20,'outline');
// north run base cabinet boxes and countertop
const units=[['B18',50],['SB36',105],['DW24',70],['B30',86],['R36',105],['B24',70],['PAN24',70],['REF36',104]];let cx=x+25;units.forEach(u=>{b+=R(cx,y+38,u[1],58,'casework')+T(cx+u[1]/2,y+70,u[0],'tiny','middle');cx+=u[1];});b+=L(x+22,y+34,x+w-22,y+34,'heavy');
// side runs and island
b+=R(x+25,y+120,58,280,'casework')+R(x+w-112,y+120,87,280,'casework')+R(x+240,y+265,310,125,'casework')+R(x+230,y+255,330,145,'outline');
// appliances/sink details
b+=R(x+130,y+42,92,50,'fixture')+C(x+158,y+67,12)+C(x+194,y+67,12)+T(x+176,y+88,'DOUBLE SINK','tiny','middle');
b+=R(x+385,y+42,100,50,'fixture')+[0,1,2,3].map(i=>C(x+405+(i%2)*55,y+58+Math.floor(i/2)*23,7)).join('')+T(x+435,y+88,'RANGE','tiny','middle');
b+=R(x+653,y+122,70,150,'fixture')+L(x+653,y+196,x+723,y+196)+T(x+688,y+183,'REF','tbhead','middle');
// island sink/outlets/seating
b+=R(x+270,y+282,95,55,'fixture')+T(x+317,y+314,'PREP SINK','tiny','middle')+C(x+420,y+275,6)+C(x+500,y+275,6)+R(x+270,y+390,65,18,'furniture')+R(x+365,y+390,65,18,'furniture')+R(x+460,y+390,65,18,'furniture');
// dimensions and clearances
b+=dimH(x+240,x+550,y+390,48,'9′-0″')+dimV(x+240,y+265,y+390,-40,'3′-9″')+dimV(x+83,y+96,y+265,-48,'42″ MIN. AISLE')+dimV(x+550,y+96,y+265,55,'42″ MIN. AISLE')+dimH(x+25,x+w-25,y+96,45,'22′-0″ CASEWORK RUN')+dimH(x,x+w,y+h,55,'22′-0″ ROOM')+dimV(x,y,y+h,-45,'16′-0″ ROOM');
// door/windows and notes
b+=doorH(x+335,y+h-10,82)+winH(x+65,y,120,'W1')+winH(x+505,y,120,'W1')+bubble(x+225,y+155,'1')+L(x+240,y+155,x+190,y+95,'leader')+bubble(x+400,y+225,'2')+L(x+400,y+240,x+400,y+265,'leader')+bubble(x+690,y+440,'3')+L(x+690,y+425,x+690,y+400,'leader');
// north elevation
function elevBox(ox,oy,W,H,title){return R(ox,oy,W,H,'inner')+T(ox+12,oy+23,title,'tbhead')+L(ox+30,oy+H-38,ox+W-30,oy+H-38,'heavy');}
b+=elevBox(865,135,760,285,'NORTH CABINET ELEVATION — SINK / RANGE WALL');const ey=172,base=ey+182,counter=base-100;let ex=900;
const widths=[70,130,86,105,78,105,78];widths.forEach((ww,i)=>{b+=cabinetDoor(ex,counter,ww,100)+cabinetDoor(ex,ey+40,ww,60);ex+=ww;});
b+=L(895,counter-8,1585,counter-8,'heavy')+R(1025,counter+18,105,50,'fixture')+T(1077,counter+48,'SINK','tiny','middle')+R(1250,counter+10,105,90,'fixture')+T(1302,counter+55,'RANGE','tiny','middle')+R(1250,ey+40,105,60,'fixture')+T(1302,ey+75,'HOOD','tiny','middle')+R(895,counter-28,690,20,'fillgray');
b+=dimV(885,ey+40,base,-18,'8′-0″')+dimV(1595,counter-8,base,18,'36″')+dimV(1595,ey+40,counter-8,45,'54″ AFF');
// west elevation
b+=elevBox(865,455,760,285,'WEST / TALL CABINET ELEVATION — PANTRY / OVENS / REFRIGERATOR');ex=920;[['PANTRY',120],['OVEN',140],['REFRIG.',170],['B30',105],['APPLIANCE GAR.',130]].forEach((u,i)=>{b+=cabinetDoor(ex,510,u[1],175);T; if(i===1)b+=R(ex+22,548,u[1]-44,70,'fixture')+T(ex+u[1]/2,590,'DBL OVEN','tiny','middle');if(i===2)b+=R(ex+10,520,u[1]-20,160,'fixture')+L(ex+10,600,ex+u[1]-10,600)+T(ex+u[1]/2,585,'REFRIGERATOR','tiny','middle');ex+=u[1];});b+=dimV(900,510,685,-18,'8′-0″')+dimH(920,1585,685,30,'18′-0″ TALL RUN');
// schedule
b+=R(70,755,760,72,'inner')+T(88,779,'CABINET / APPLIANCE ORDER HOLD POINTS','tbhead')+T(88,801,'Verified walls/floors · approved shop drawings · appliance cut sheets · filler/scribe plan · rough-ins · hood discharge · countertop template · finish selections','tiny');
b+=R(865,755,760,72,'inner')+T(883,779,'KEYED NOTES','tbhead')+T(883,801,'1 Sink/window alignment  ·  2 Island utilities / pendants / seating  ·  3 Tall cabinet and refrigerator service clearances','tiny');
return frame('A-401','Kitchen Plan & Interior Elevations — Detailed','1/2″ = 1′-0″','Subcontractor Bidding / Field Layout',b,['Cabinet dimensions are representative; approved supplier shop drawings and appliance cut sheets govern final fabrication.','Verify fillers, scribes, panels, clearances, accessibility, support, service access, plumbing, electrical, gas, ventilation, and lighting.','Countertop templates occur only after cabinets are installed, secured, leveled, and accepted.']);}
const outputs={
 'A-101.svg':detailedPlan(),
 'A-201.svg':detailedElevations(),
 'A-301.svg':detailedSection(),
 'A-401.svg':detailedKitchen()
};
for(const [file,svg] of Object.entries(outputs))fs.writeFileSync(path.join(dir,file),svg,'utf8');
let html=fs.readFileSync(path.join(root,'whole-house-quote-package.html'),'utf8');html=html.replace(/Revision D/g,'Revision E').replace(/REV D/g,'REV E').replace(/Revision:<\/strong> D/g,'Revision:</strong> E').replace(/H38-UQB-WH-REV-D/g,'H38-UQB-WH-REV-E').replace(/A-101 — Proposed Main-Floor Plan/g,'A-101 — Proposed Main-Floor Plan — Detailed').replace(/A-201 — Exterior Elevations — Four Views/g,'A-201 — Exterior Elevations — Detailed Four Views').replace(/A-301 — Building Sections & Envelope Details/g,'A-301 — Building Sections & Envelope Details — Detailed').replace(/A-401 — Kitchen Plan & Interior Elevations/g,'A-401 — Kitchen Plan & Interior Elevations — Detailed');fs.writeFileSync(path.join(root,'whole-house-quote-package.html'),html,'utf8');
console.log('Enhanced A-101, A-201, A-301, and A-401 to revision E.');
