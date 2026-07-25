#!/usr/bin/env python3
from __future__ import annotations
import html, json, os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'assets' / 'quote-builder' / 'whole-house-cad'
OUT.mkdir(parents=True, exist_ok=True)
ISSUE = '2026-07-25'
PROJECT = 'New-Home Construction — Lot Clearing Through Final Completion'
REV = 'F'

CSS = r'''
<style>
.border{fill:#fff;stroke:#111;stroke-width:3}.inner{fill:none;stroke:#111;stroke-width:1}
.cut{fill:#fff;stroke:#050505;stroke-width:5}.heavy{fill:none;stroke:#050505;stroke-width:3.5}
.outline{fill:none;stroke:#111;stroke-width:2.2}.object{fill:none;stroke:#111;stroke-width:1.4}
.thin{fill:none;stroke:#333;stroke-width:1}.hair{fill:none;stroke:#777;stroke-width:.65}
.under{fill:none;stroke:#777;stroke-width:1.1}.underheavy{fill:none;stroke:#555;stroke-width:2.2}
.hidden{fill:none;stroke:#555;stroke-width:1;stroke-dasharray:7 5}.center{fill:none;stroke:#777;stroke-width:.8;stroke-dasharray:13 4 2 4}
.dimline{fill:none;stroke:#111;stroke-width:.8;marker-start:url(#oa);marker-end:url(#oa)}.ext{fill:none;stroke:#666;stroke-width:.75}
.leader{fill:none;stroke:#111;stroke-width:1;marker-end:url(#arr)}.grade{fill:none;stroke:#286a3e;stroke-width:2}
.property{fill:none;stroke:#111;stroke-width:2;stroke-dasharray:14 5}.setback{fill:none;stroke:#555;stroke-width:1;stroke-dasharray:6 4}
.clearing{fill:none;stroke:#865c20;stroke-width:2;stroke-dasharray:10 5}.silt{fill:none;stroke:#7c2222;stroke-width:2;stroke-dasharray:5 4}
.duct{fill:none;stroke:#69468a;stroke-width:3}.return{fill:none;stroke:#69468a;stroke-width:2.5;stroke-dasharray:7 4}
.hot{fill:none;stroke:#ba2b2b;stroke-width:2}.cold{fill:none;stroke:#16729e;stroke-width:2}.waste{fill:none;stroke:#444;stroke-width:3}.vent{fill:none;stroke:#444;stroke-width:1.2;stroke-dasharray:5 4}
.power{fill:none;stroke:#333;stroke-width:1.2}.circuit{fill:none;stroke:#777;stroke-width:1;stroke-dasharray:5 4}
.fillgray{fill:#eee;stroke:#111}.filllight{fill:#f7f7f7;stroke:#111}.filldark{fill:#ddd;stroke:#111}
.concrete{fill:url(#concrete);stroke:#111}.wood{fill:url(#wood);stroke:#111}.earth{fill:url(#earth);stroke:#111}.roof{fill:url(#roof);stroke:#111}.insul{fill:url(#insul);stroke:#111}
.bubble{fill:#fff;stroke:#111;stroke-width:1.4}.fixture{fill:#fff;stroke:#111;stroke-width:1.2}.casework{fill:#fff;stroke:#111;stroke-width:1.2}.glass{fill:#fff;stroke:#111;stroke-width:1.2}
.title{font:700 20px Arial}.sub{font:11px Arial;fill:#333}.txt{font:11px Arial}.small{font:10px Arial}.tiny{font:8.5px Arial}.dim{font:9px Arial}.room{font:700 13px Arial;letter-spacing:.04em}
.tb{font:9px Arial}.tbhead{font:700 12px Arial}.sheetno{font:700 34px Arial}.warn{font:700 10px Arial;fill:#8c1d1d}.bubbletxt{font:700 12px Arial}.material{font:700 8px Arial;letter-spacing:.04em}
</style>
'''
DEFS = r'''
<defs>
<marker id="arr" markerWidth="8" markerHeight="8" refX="5" refY="4" orient="auto"><path d="M0 0L8 4L0 8z" fill="#111"/></marker>
<marker id="oa" markerWidth="9" markerHeight="9" refX="4.5" refY="4.5" orient="auto"><path d="M8 1L1 4.5L8 8" fill="none" stroke="#111"/></marker>
<pattern id="concrete" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="4" cy="5" r="1"/><circle cx="13" cy="12" r="1"/><path d="M2 15l4-2M11 3l4-2" stroke="#666" stroke-width=".8"/></pattern>
<pattern id="wood" width="12" height="12" patternUnits="userSpaceOnUse"><path d="M0 12L12 0M-3 3L3-3M9 15L15 9" stroke="#777" stroke-width=".7"/></pattern>
<pattern id="insul" width="28" height="14" patternUnits="userSpaceOnUse"><path d="M0 7Q7-2 14 7T28 7" fill="none" stroke="#777" stroke-width="1"/></pattern>
<pattern id="earth" width="18" height="12" patternUnits="userSpaceOnUse"><path d="M0 10Q5 2 10 10T20 10" fill="none" stroke="#777" stroke-width=".8"/></pattern>
<pattern id="roof" width="14" height="10" patternUnits="userSpaceOnUse"><path d="M0 9L7 2M7 9L14 2" stroke="#777" stroke-width=".7"/></pattern>
</defs>
'''

def esc(s): return html.escape(str(s), quote=False)

def attrs(**kw):
    return ' '.join(f'{k.replace("_","-")}="{esc(v)}"' for k,v in kw.items() if v is not None)

class S:
    def __init__(self): self.a=[]
    def add(self,x): self.a.append(x); return x
    def line(self,x1,y1,x2,y2,cl='thin'): self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" class="{cl}"/>')
    def rect(self,x,y,w,h,cl='thin',rx=0): self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" class="{cl}"/>')
    def circle(self,x,y,r,cl='thin'): self.add(f'<circle cx="{x}" cy="{y}" r="{r}" class="{cl}"/>')
    def text(self,x,y,txt,cl='txt',anchor='start',rot=None):
        tr=f' transform="rotate({rot} {x} {y})"' if rot is not None else ''
        self.add(f'<text x="{x}" y="{y}" class="{cl}" text-anchor="{anchor}"{tr}>{esc(txt)}</text>')
    def poly(self,pts,cl='thin'): self.add(f'<polyline points="{pts}" class="{cl}"/>')
    def path(self,d,cl='thin'): self.add(f'<path d="{d}" class="{cl}"/>')
    def dimh(self,x1,x2,y,off,label):
        self.line(x1,y,x1,y+off,'ext'); self.line(x2,y,x2,y+off,'ext'); self.line(x1,y+off,x2,y+off,'dimline'); self.text((x1+x2)/2,y+off-7,label,'dim','middle')
    def dimv(self,x,y1,y2,off,label):
        self.line(x,y1,x+off,y1,'ext'); self.line(x,y2,x+off,y2,'ext'); self.line(x+off,y1,x+off,y2,'dimline'); self.text(x+off-7,(y1+y2)/2,label,'dim','middle',-90)
    def bubble(self,x,y,label): self.circle(x,y,15,'bubble'); self.text(x,y+4,label,'bubbletxt','middle')
    def leader(self,x1,y1,x2,y2,label,tx=None,ty=None,anchor='start'):
        self.line(x1,y1,x2,y2,'leader'); self.text(tx if tx is not None else x1,ty if ty is not None else y1-5,label,'tiny',anchor)
    def xml(self): return ''.join(self.a)


def title_block(s:S,num,title,scale,classification):
    short_titles={'G-001':'Project Definition / Index','A-101':'Main-Floor Plan','A-102':'Second Floor / Roof','A-201':'Exterior Elevations','A-301':'Section / Details','A-401':'Kitchen Plan / Elevations','M-101':'HVAC Plan','P-101':'Plumbing Plan','E-101':'Electrical Plan','C-S-L-101':'Clearing / Site / Grading'}
    tb_title=short_titles.get(num,title)
    s.line(45,845,1655,845,'outline'); s.rect(1160,845,495,210,'inner')
    s.line(1160,915,1655,915,'inner'); s.line(1430,845,1430,1055,'inner'); s.line(1160,985,1655,985,'inner')
    s.text(1175,870,'HIGHWAY 38 SOLUTIONS','tbhead'); s.text(1175,889,'Universal Quote Builder Demonstration','tb')
    s.text(1175,906,'Ground-Up New-Home Construction','tb'); s.text(1445,870,'SHEET','tb'); s.text(1540,895,num,'sheetno','middle')
    s.text(1175,940,tb_title,'tbhead'); s.text(1175,958,f'Scale: {scale}','tb'); s.text(1175,976,classification,'tb')
    s.text(1445,940,'REVISION','tb'); s.text(1540,965,REV,'sheetno','middle'); s.text(1175,1010,'Prepared by H38 Quote Builder','tb')
    s.text(1175,1028,f'Issue: {ISSUE}','tb'); s.text(1445,1010,'NOT FOR CONSTRUCTION','warn'); s.text(1445,1028,'Final design / permits required','tb')

def sheet(num,title,scale,classification,body:S,notes):
    s=S(); s.rect(25,25,1650,1050,'border'); s.rect(45,45,1610,1010,'inner')
    s.text(70,75,f'{num} — {title}','title'); s.text(70,97,f'{scale} · {classification} · REV {REV} · REPRESENTATIVE / VERIFY BEFORE CONSTRUCTION','sub')
    s.a.extend(body.a)
    for i,n in enumerate(notes): s.text(70,875+i*21,f'{i+1}. {n}','tiny')
    title_block(s,num,title,scale,classification)
    return f'<?xml version="1.0" encoding="UTF-8"?><svg xmlns="http://www.w3.org/2000/svg" width="17in" height="11in" viewBox="0 0 1700 1100" role="img"><title>{esc(num+" "+title)}</title>{DEFS}{CSS}{s.xml()}</svg>'

def wall(s,x1,y1,x2,y2,under=False): s.line(x1,y1,x2,y2,'underheavy' if under else 'cut')
def thinwall(s,x1,y1,x2,y2,under=False): s.line(x1,y1,x2,y2,'under' if under else 'outline')

def door_h(s,x,y,w,up=True,under=False):
    cl='under' if under else 'object'; arc='under' if under else 'thin'
    s.line(x,y,x+w,y,'hair'); s.line(x,y,x,y-w if up else y+w,cl)
    sweep=1 if up else 0; yy=y-w if up else y+w
    s.path(f'M{x} {yy} A{w} {w} 0 0 {sweep} {x+w} {y}',arc)

def door_v(s,x,y,h,right=True,under=False):
    cl='under' if under else 'object'; arc='under' if under else 'thin'
    s.line(x,y,x,y+h,'hair'); xx=x+h if right else x-h; s.line(x,y,xx,y,cl)
    sweep=0 if right else 1
    s.path(f'M{xx} {y} A{h} {h} 0 0 {sweep} {x} {y+h}',arc)

def window_h(s,x,y,w,under=False):
    cl='under' if under else 'object'; s.line(x,y-5,x+w,y-5,cl); s.line(x,y+5,x+w,y+5,cl); s.line(x,y-10,x,y+10,cl); s.line(x+w,y-10,x+w,y+10,cl)

def window_v(s,x,y,h,under=False):
    cl='under' if under else 'object'; s.line(x-5,y,x-5,y+h,cl); s.line(x+5,y,x+5,y+h,cl); s.line(x-10,y,x+10,y,cl); s.line(x-10,y+h,x+10,y+h,cl)

def plan_underlay(s:S,x,y,w,h,under=False,labels=True,fixtures=True):
    # Outer walls and fixed partitions for all coordinated sheets.
    cl='underheavy' if under else 'cut'; ol='under' if under else 'outline'
    s.rect(x,y,w,h,cl); s.rect(x+10,y+10,w-20,h-20,ol)
    vx1=x+w*.36; vx2=x+w*.64; vx3=x+w*.80; mid=y+h*.50; low=y+h*.74
    wall(s,vx1,y+10,vx1,mid,under); wall(s,vx2,y+10,vx2,y+h-10,under); wall(s,vx3,y+10,vx3,y+h-10,under)
    wall(s,x+10,mid,x+w-10,mid,under); wall(s,x+10,low,vx1,low,under)
    # Doors anchored in openings.
    door_h(s,x+w*.46,y+h-10,w*.08,True,under); door_v(s,vx1,y+h*.27,h*.10,True,under)
    door_v(s,vx2,y+h*.63,h*.10,True,under); door_v(s,vx3,y+h*.62,h*.10,True,under); door_v(s,x+w-10,y+h*.18,h*.10,False,under)
    # Windows anchored in exterior walls.
    for q in (.08,.22,.69,.84): window_h(s,x+w*q,y,w*.09,under)
    window_v(s,x,y+h*.12,h*.14,under); window_v(s,x,y+h*.60,h*.14,under)
    window_v(s,x+w,y+h*.10,h*.14,under); window_v(s,x+w,y+h*.58,h*.14,under)
    # Kitchen casework attached to top and left walls.
    if fixtures:
        c='under' if under else 'casework'; f='under' if under else 'fixture'
        s.rect(x+30,y+30,w*.28,35,c); s.rect(x+30,y+70,35,h*.29,c); s.rect(x+w*.17,y+h*.20,w*.14,h*.12,c)
        # Dining table / living furniture, all within rooms.
        s.rect(vx1+w*.07,y+h*.18,w*.15,h*.11,'under' if under else 'object')
        s.rect(vx2+w*.05,y+h*.16,w*.18,h*.09,'under' if under else 'object')
        # Laundry fixtures against partition; bath fixtures against walls.
        s.rect(vx2+w*.03,mid+h*.08,w*.05,h*.07,f); s.rect(vx2+w*.09,mid+h*.08,w*.05,h*.07,f)
        s.rect(vx3+w*.03,low-h*.15,w*.06,h*.07,f); s.circle(vx3+w*.12,low-h*.10,h*.035,f)
        # Stair anchored between first and second floor.
        sx=vx1+w*.045; sy=mid+h*.08; sw=w*.20; sh=h*.30
        for i in range(10): s.line(sx,sy+i*sh/10,sx+sw,sy+i*sh/10,'under' if under else 'thin')
        s.line(sx+sw*.10,sy+sh*.85,sx+sw*.88,sy+sh*.10,'under' if under else 'leader')
    if labels:
        col='small' if under else 'room'
        def lab(cx,cy,name): s.text(cx,cy,name,col,'middle')
        lab(x+w*.18,y+h*.42,'KITCHEN'); lab(vx1+w*.14,y+h*.34,'DINING'); lab(vx2+w*.18,y+h*.34,'LIVING')
        lab(x+w*.18,mid+h*.18,'OFFICE / FLEX'); lab(vx1+w*.14,low+h*.12,'FOYER / STAIR'); lab(vx2+w*.08,low+h*.12,'MUD / LAUNDRY'); lab(vx3+w*.10,low+h*.12,'BATH / MECH')
    return {'x':x,'y':y,'w':w,'h':h,'vx1':vx1,'vx2':vx2,'vx3':vx3,'mid':mid,'low':low}

def general_sheet():
    b=S(); b.text(70,130,'PROJECT DEFINITION — FIXED SCOPE','tbhead'); b.rect(70,145,1530,155,'inner')
    scope=[
      'GROUND-UP NEW-HOME CONSTRUCTION ON A VACANT / UNDEVELOPED LOT.',
      'PROJECT BEGINS WITH SURVEY, EROSION CONTROL, LOT CLEARING, GRUBBING, TOPSOIL STRIPPING, AND ROUGH GRADING.',
      'PROJECT CONTINUES THROUGH EXCAVATION, FOUNDATION, FRAMING, DRY-IN, ROUGH-INS, INSULATION, INTERIORS, SITE UTILITIES, FINAL GRADING, AND CLOSEOUT.',
      'THIS IS NOT A RENOVATION, REMODEL, DEMOLITION-OF-EXISTING-HOUSE, OR PROPERTY-IMPROVEMENT PACKAGE.'
    ]
    for i,tv in enumerate(scope): b.bubble(95,178+i*30,str(i+1)); b.text(122,182+i*30,tv,'small')
    b.text(70,340,'DRAWING INDEX','tbhead'); b.rect(70,355,760,420,'inner')
    idx=[('G-001','PROJECT DEFINITION, INDEX & GENERAL NOTES'),('A-101','PROPOSED MAIN-FLOOR PLAN'),('A-102','SECOND-FLOOR & ROOF PLAN'),('A-201','EXTERIOR ELEVATIONS — FOUR VIEWS'),('A-301','BUILDING SECTION & CONSTRUCTION DETAILS'),('A-401','KITCHEN PLAN & CABINET ELEVATIONS'),('M-101','HVAC PLAN ON ARCHITECTURAL UNDERLAY'),('P-101','PLUMBING PLAN ON ARCHITECTURAL UNDERLAY'),('E-101','ELECTRICAL PLAN ON ARCHITECTURAL UNDERLAY'),('C-S-L-101','CLEARING, SITE, UTILITIES, GRADING & LANDSCAPE')]
    for i,(n,d) in enumerate(idx):
        yy=382+i*38; b.line(70,yy-18,830,yy-18,'thin'); b.text(90,yy,n,'tbhead'); b.text(185,yy,d,'small')
    b.text(880,340,'GENERAL COORDINATION NOTES','tbhead'); b.rect(880,355,720,420,'inner')
    notes=['Use one coordinated building footprint and partition layout across architectural, HVAC, plumbing, and electrical sheets.','No symbol, fixture, register, device, cabinet, deck, roof, or utility may float without a wall, floor, grade, equipment, or route connection.','Verify survey, setbacks, soil, groundwater, frost depth, utility availability, septic/well requirements, and permit requirements before construction.','Final structural, energy, HVAC, plumbing, electrical, septic, well, and civil design requires applicable licensed-professional and authority review.','Do not scale drawings. Written dimensions and approved schedules govern.','Field verify and coordinate before ordering, excavation, rough-in, concealment, or inspection.']
    for i,n in enumerate(notes): b.bubble(905,390+i*58,str(i+1)); b.text(930,394+i*58,n,'tiny')
    return sheet('G-001','Project Definition, Drawing Index & General Notes','N.T.S.','Ground-Up Construction Scope Control',b,['This sheet is the controlling project-scope note for the demonstration.','Any future drawing or quote that describes this project as renovation or remodeling is a release-blocking defect.'])

def main_floor():
    b=S(); g=plan_underlay(b,210,145,900,610,False,True,True)
    # dimensions
    b.dimh(210,1110,755,55,'48′-0″ OVERALL'); b.dimv(210,145,755,-60,'32′-0″ OVERALL')
    b.dimh(210,g['vx1'],145,-28,'17′-3″'); b.dimh(g['vx1'],g['vx2'],145,-28,'13′-5″'); b.dimh(g['vx2'],1110,145,-28,'17′-4″')
    # porch/deck anchored to building walls
    b.rect(520,755,300,55,'wood'); b.text(670,786,'COVERED FRONT PORCH — 16′ × 6′','small','middle')
    b.rect(1110,245,65,230,'wood'); b.text(1142,360,'REAR DECK','small','middle',-90)
    # section line actually spans building
    b.line(320,110,320,780,'center'); b.bubble(320,120,'A'); b.bubble(320,770,'A')
    # Notes/schedules
    b.rect(1200,135,380,300,'inner'); b.text(1220,165,'KEYED PLAN NOTES','tbhead')
    notes=['Exterior walls: 2×6 wood framing; final assembly by energy/structural design.','Coordinate foundation, beams, bearing walls, stairs, and openings before framing release.','Provide blocking for cabinets, rails, fixtures, equipment, exterior decks, and porch roof.','Maintain code-required egress, stair width, landings, guards, and smoke/CO coverage.','All room dimensions are representative; final dimensioned permit set governs.']
    for i,n in enumerate(notes): b.bubble(1230,195+i*48,str(i+1)); b.text(1255,199+i*48,n,'tiny')
    b.rect(1200,460,380,240,'inner'); b.text(1220,490,'DOOR / WINDOW SCHEDULE','tbhead')
    rows=[('D1','3′-0″ × 6′-8″','INSULATED ENTRY'),('D2','6′-0″ × 6′-8″','GLAZED PATIO'),('W1','3′-0″ × 5′-0″','DOUBLE-HUNG'),('W2','2′-6″ × 4′-0″','CASEMENT')]
    for i,r in enumerate(rows):
        yy=525+i*38; b.line(1200,yy-18,1580,yy-18,'thin'); b.text(1220,yy,r[0],'tbhead'); b.text(1200,yy,r[1],'tiny'); b.text(1405,yy,r[2],'tiny')
    return sheet('A-101','Proposed Main-Floor Plan','1/4″ = 1′-0″','New Construction / Permit Coordination',b,['All dimensions are representative and require a final dimensioned permit set.','The porch, rear deck, doors, windows, stairs, cabinets, fixtures, and room equipment are anchored to the coordinated building geometry.'])

def second_floor():
    b=S(); x,y,w,h=150,150,900,560
    b.rect(x,y,w,h,'cut'); b.rect(x+10,y+10,w-20,h-20,'outline')
    v1=x+w*.36; v2=x+w*.66; mid=y+h*.52
    wall(b,v1,y+10,v1,y+h-10); wall(b,v2,y+10,v2,y+h-10); wall(b,x+10,mid,x+w-10,mid)
    door_h(b,v1-70,mid,60,False); door_h(b,v2+20,mid,60,False); door_v(b,v1,y+h*.20,65,True); door_v(b,v2,y+h*.20,65,True)
    for q in (.08,.24,.70,.84): window_h(b,x+w*q,y,w*.09)
    window_v(b,x,y+h*.12,h*.15); window_v(b,x+w,y+h*.12,h*.15); window_v(b,x,y+h*.66,h*.15); window_v(b,x+w,y+h*.66,h*.15)
    b.text(x+w*.18,y+h*.28,'PRIMARY BEDROOM','room','middle'); b.text(v1+w*.15,y+h*.28,'BEDROOM 2','room','middle'); b.text(v2+w*.17,y+h*.28,'BEDROOM 3','room','middle')
    b.text(x+w*.18,mid+h*.25,'PRIMARY BATH / CLOSET','room','middle'); b.text(v1+w*.15,mid+h*.25,'HALL / STAIR','room','middle'); b.text(v2+w*.17,mid+h*.25,'BATH / LINEN','room','middle')
    b.dimh(x,x+w,y+h,45,'48′-0″ OVERALL'); b.dimv(x,y,y+h,-45,'32′-0″ OVERALL')
    # Roof plan to right
    rx,ry,rw,rh=1130,170,390,300; b.text(rx,145,'ROOF PLAN','tbhead'); b.rect(rx,ry,rw,rh,'outline'); b.line(rx+rw/2,ry+25,rx+rw/2,ry+rh-25,'center')
    b.poly(f'{rx-20},{ry+rh/2} {rx+rw/2},{ry-20} {rx+rw+20},{ry+rh/2}','roof'); b.text(rx+rw/2,ry+35,'RIDGE','small','middle'); b.text(rx+95,ry+110,'8:12','small','middle'); b.text(rx+rw-95,ry+110,'8:12','small','middle')
    b.dimh(rx-20,rx+rw+20,ry+rh/2,55,'52′-0″ INCLUDING EAVES'); b.dimv(rx,ry-20,ry+rh/2,-35,'18′-0″ RUN + EAVE')
    b.rect(1130,520,390,190,'inner'); b.text(1150,550,'UPPER-FLOOR / ROOF NOTES','tbhead')
    for i,n in enumerate(['Verify egress-window clear openings and sill heights.','Coordinate truss profiles, attic access, ventilation, insulation, and mechanical clearances.','Provide continuous load path and approved uplift connections.','Final roof drainage, flashing, snow/ice protection, and penetrations by approved details.']): b.text(1150,585+i*30,f'{i+1}. {n}','tiny')
    return sheet('A-102','Second-Floor & Roof Plan','1/4″ = 1′-0″ / 1/8″ = 1′-0″','New Construction / Permit Coordination',b,['Coordinate upper-floor bearing, stair opening, plumbing stacks, ducts, trusses, and roof penetrations.','Final structural and energy design governs member sizes and assemblies.'])

def elevations():
    b=S()
    def front(ox,oy,W,H,label,rear=False,side=False):
        b.rect(ox,oy,W,H,'inner'); b.text(ox+12,oy+24,label,'tbhead')
        gx=ox+55; gy=oy+H-42; bw=W-110; wallh=120; eave=gy-wallh; ridge=eave-95
        b.line(gx,gy,gx+bw,gy,'grade'); b.rect(gx,eave,bw,wallh,'outline'); b.rect(gx,gy-18,bw,18,'concrete')
        b.poly(f'{gx-20},{eave+5} {gx+bw/2},{ridge} {gx+bw+20},{eave+5}','roof'); b.line(gx-20,eave+5,gx+bw+20,eave+5,'heavy')
        for yy in range(int(eave+12),int(gy),13): b.line(gx,yy,gx+bw,yy,'hair')
        if not side:
            for q in (.12,.34,.66,.86):
                wx=gx+bw*q-25; b.rect(wx,eave+35,50,62,'glass'); b.line(wx+25,eave+35,wx+25,eave+97,'hair'); b.line(wx,eave+66,wx+50,eave+66,'hair')
            if rear:
                # deck attached to wall with posts to grade
                dx=gx+bw*.30; dw=bw*.40; b.rect(dx,gy-18,dw,18,'wood'); b.line(dx+12,gy-18,dx+12,gy,'outline'); b.line(dx+dw-12,gy-18,dx+dw-12,gy,'outline'); b.text(dx+dw/2,gy-25,'REAR DECK ATTACHED AT LEDGER','tiny','middle')
                b.rect(gx+bw*.46,eave+22,60,98,'outline')
            else:
                # covered porch roof attached to exterior wall and posts to slab
                px=gx+bw*.22; pw=bw*.56; py=gy-38
                b.rect(px,py,pw,18,'wood'); b.poly(f'{px-12},{py} {px+pw/2},{py-58} {px+pw+12},{py}','roof'); b.line(px,py,px,gy,'outline'); b.line(px+pw,py,px+pw,gy,'outline'); b.rect(gx+bw*.47,eave+25,55,95,'outline'); b.text(px+pw/2,py-7,'COVERED FRONT PORCH','tiny','middle')
                # dormer anchored into roof plane
                dx=gx+bw*.44; dy=eave-60; b.rect(dx,dy,90,60,'outline'); b.poly(f'{dx-8},{dy+8} {dx+45},{dy-35} {dx+98},{dy+8}','roof'); b.rect(dx+30,dy+16,30,36,'glass')
            # chimney anchored through roof plane, not floating
            cx=gx+bw*.82; b.rect(cx,ridge+20,22,70,'outline'); b.text(cx+11,ridge+14,'CHIMNEY','tiny','middle')
        else:
            for q in (.28,.72):
                wx=gx+bw*q-25; b.rect(wx,eave+35,50,62,'glass'); b.line(wx+25,eave+35,wx+25,eave+97,'hair')
            b.rect(gx+bw*.84,eave+25,45,95,'outline'); b.text(gx+bw*.86,eave+82,'SERVICE','tiny','middle',-90)
        b.dimh(gx,gx+bw,gy,25,'48′-0″' if not side else '32′-0″'); b.dimv(gx,eave,gy,-27,'18′-0″ EAVE'); b.dimv(gx,ridge,gy,-52,'24′-6″ RIDGE')
        b.text(gx+bw/2,ridge+18,'8:12','tiny','middle'); b.text(gx+5,gy+20,'FINISHED GRADE 100′-0″','tiny')
    front(60,120,760,320,'SOUTH / FRONT ELEVATION',False,False); front(860,120,760,320,'NORTH / REAR ELEVATION',True,False)
    front(60,480,760,320,'EAST / RIGHT ELEVATION',False,True); front(860,480,760,320,'WEST / LEFT ELEVATION',False,True)
    return sheet('A-201','Exterior Elevations — Four Coordinated Views','1/8″ = 1′-0″','New Construction / Exterior Coordination',b,['All windows, doors, porch posts, deck posts, chimney, roof edges, and foundations are connected to wall, roof, slab, or grade geometry.','Final exterior materials, opening schedules, structural connections, flashing, and grade elevations require approved design.'])

def section_details():
    b=S(); b.text(60,122,'BUILDING SECTION A-A — THROUGH PORCH / KITCHEN / STAIR','tbhead'); b.rect(60,135,930,665,'inner')
    x=150; slab=690; bw=680; walltop=350; ridge=155
    b.rect(x-20,slab+20,bw+40,80,'earth'); b.rect(x,slab-15,bw,35,'concrete'); b.rect(x+25,slab-120,35,120,'concrete'); b.rect(x+bw-60,slab-120,35,120,'concrete')
    b.rect(x+45,walltop,bw-90,slab-walltop-15,'outline'); b.rect(x+45,walltop+145,bw-90,22,'wood'); b.rect(x+45,slab-165,bw-90,22,'wood')
    b.poly(f'{x+20},{walltop+10} {x+bw/2},{ridge} {x+bw-20},{walltop+10}','roof'); b.poly(f'{x+45},{walltop+25} {x+bw/2},{ridge+25} {x+bw-45},{walltop+25}','outline')
    # exterior walls with insulation
    b.rect(x+45,walltop+15,28,slab-walltop-30,'insul'); b.rect(x+bw-73,walltop+15,28,slab-walltop-30,'insul')
    # stairs anchored to both floor levels
    sx=x+300; sy=slab-165; stepw=22; steph=16
    pts=[]
    for i in range(11): pts.append((sx+i*stepw,sy-i*steph))
    for i in range(10): b.poly(f'{pts[i][0]},{pts[i][1]} {pts[i+1][0]},{pts[i][1]} {pts[i+1][0]},{pts[i+1][1]}','outline')
    # attached porch roof, ledger at wall, post to footing
    px=x-115; postx=x-75; porch_eave=520
    b.line(x+45,porch_eave-70,px+40,porch_eave,'heavy'); b.poly(f'{x+45},{porch_eave-70} {x-15},{porch_eave-125} {px},{porch_eave}','roof')
    b.line(postx,porch_eave,postx,slab,'outline'); b.rect(postx-18,slab,36,18,'concrete'); b.rect(px+10,slab-22,x-px+15,22,'wood')
    b.text(px+35,porch_eave-18,'ATTACHED PORCH ROOF','tiny'); b.text(postx-8,slab-40,'POST','tiny','middle',-90)
    b.dimh(x+45,x+bw-45,slab,42,'48′-0″'); b.dimv(x+45,walltop,slab,-40,'18′-0″ EAVE'); b.dimv(x+45,ridge,slab,-72,'24′-6″ RIDGE')
    b.leader(x+bw-20,walltop+80,840,300,'2×6 WALL / INSULATION / WRB / SIDING',850,304)
    b.leader(x+bw-20,walltop+155,840,375,'SECOND-FLOOR ASSEMBLY',850,379)
    b.leader(x+bw-20,slab-155,840,455,'FIRST-FLOOR ASSEMBLY',850,459)
    b.leader(x+bw-35,slab-35,840,555,'FOUNDATION / FOOTING — FINAL DESIGN',850,559)
    # details
    b.text(1030,122,'DETAIL 1 — EXTERIOR WALL / EAVE','tbhead'); b.rect(1030,135,570,250,'inner')
    b.rect(1080,185,25,150,'outline'); b.rect(1105,185,35,150,'wood'); b.rect(1140,185,75,150,'insul'); b.rect(1215,185,18,150,'outline'); b.poly('1060,185 1145,125 1245,185','roof'); b.line(1080,185,1245,185,'heavy')
    for yy,txt in [(180,'ROOF / DRIP EDGE / VENTED SOFFIT'),(220,'GYPSUM BOARD'),(260,'2×6 STUD + INSULATION'),(300,'SHEATHING + WRB'),(340,'SIDING / TRIM')]: b.line(1235,yy,1425,yy,'leader'); b.text(1435,yy+4,txt,'tiny')
    b.text(1030,420,'DETAIL 2 — WINDOW OPENING / FLASHING','tbhead'); b.rect(1030,435,270,340,'inner'); b.rect(1100,505,100,150,'glass'); b.rect(1085,490,130,180,'outline'); b.poly('1070,485 1150,465 1230,485','outline'); b.poly('1080,680 1150,705 1220,680','outline')
    b.leader(1215,490,1280,470,'HEAD FLASHING BEHIND WRB',1270,458,'end'); b.leader(1215,675,1280,715,'SILL PAN + END DAMS',1270,735,'end')
    b.text(1330,420,'DETAIL 3 — DECK LEDGER / FLASHING','tbhead'); b.rect(1330,435,270,340,'inner'); b.rect(1370,500,35,180,'wood'); b.rect(1405,535,145,28,'wood'); b.rect(1405,610,165,24,'wood'); b.poly('1395,505 1515,470 1540,490','outline'); b.circle(1450,548,5); b.circle(1490,548,5)
    b.leader(1540,490,1575,470,'CONTINUOUS METAL FLASHING',1570,456,'end'); b.leader(1570,622,1580,650,'JOIST HANGER / LEDGER',1570,670,'end'); b.leader(1370,660,1340,705,'AIR / WATER SEAL',1340,725)
    return sheet('A-301','Building Section & Construction Details','1/4″ = 1′-0″ / 1 1/2″ = 1′-0″','New Construction / Professional Review',b,['The porch roof, porch post, deck ledger, stairs, floors, walls, roof, foundation, and grade are physically connected in the drawing.','Final structural member sizes, footings, connections, flashing, insulation, and code compliance require approved design.'])

def kitchen_sheet():
    b=S(); x,y,w,h=60,130,760,600; b.text(60,115,'ENLARGED KITCHEN PLAN','tbhead'); b.rect(x,y,w,h,'cut'); b.rect(x+10,y+10,w-20,h-20,'outline')
    # anchored casework to north and west walls
    modules=[('B18',55),('SB36',110),('DW24',75),('B30',90),('R36',110),('B24',75),('PAN24',75),('REF36',100)]
    cx=x+25
    for name,mw in modules: b.rect(cx,y+35,mw,55,'casework'); b.text(cx+mw/2,y+68,name,'tiny','middle'); cx+=mw
    b.rect(x+25,y+105,55,270,'casework'); b.rect(x+w-125,y+105,100,270,'casework')
    b.rect(x+240,y+250,310,130,'casework'); b.rect(x+270,y+275,85,45,'fixture'); b.text(x+312,y+302,'PREP SINK','tiny','middle'); b.text(x+395,y+347,'ISLAND 9′-0″ × 3′-9″','tbhead','middle')
    b.dimh(x+240,x+550,y+380,42,'9′-0″'); b.dimv(x+240,y+250,y+380,-38,'3′-9″'); b.dimv(x+80,y+90,y+250,-55,'42″ MIN. AISLE'); b.dimv(x+550,y+90,y+250,55,'42″ MIN. AISLE')
    door_h(b,x+330,y+h-10,75,True); window_h(b,x+80,y,120); window_h(b,x+500,y,120)
    # elevations with modules sitting on finished floor line
    def elev(ox,oy,title,mods):
        b.rect(ox,oy,740,255,'inner'); b.text(ox+12,oy+24,title,'tbhead'); floor=oy+220; b.line(ox+30,floor,ox+710,floor,'heavy'); cx=ox+45
        for name,mw,upper in mods:
            b.rect(cx,floor-95,mw,95,'casework'); b.text(cx+mw/2,floor-45,name,'tiny','middle')
            if upper: b.rect(cx,oy+55,mw,70,'casework')
            cx+=mw
        b.dimv(ox+30,oy+55,floor,-20,'8′-0″')
    elev(850,130,'NORTH CABINET ELEVATION — SINK / RANGE WALL',[('B18',80,1),('SINK 36',140,1),('DW24',90,0),('RANGE 36',120,1),('B24',90,1),('PANTRY',100,0)])
    elev(850,455,'WEST / TALL CABINET ELEVATION — PANTRY / OVENS / REFRIGERATOR',[('PANTRY',115,0),('DBL OVEN',130,1),('REFRIG.',140,1),('B30',110,1),('END',100,0)])
    b.rect(850,735,740,75,'inner'); b.text(870,760,'CABINET / APPLIANCE ORDER HOLD POINTS','tbhead'); b.text(870,787,'Approved shop drawings · final appliance cut sheets · verified wall/floor dimensions · rough-ins · hood discharge · countertop template','tiny')
    return sheet('A-401','Kitchen Plan & Cabinet Elevations','1/2″ = 1′-0″','New Construction / Cabinet Coordination',b,['Cabinets, appliances, windows, doors, island, sinks, dimensions, and elevations are attached to the room and finished-floor geometry.','Approved supplier shop drawings and appliance specifications govern fabrication and rough-ins.'])

def hvac_sheet():
    b=S(); g=plan_underlay(b,70,135,1000,650,True,True,False)
    # Equipment anchored in bath/mech room.
    ahux=g['vx3']+40; ahuy=g['mid']+120; b.rect(ahux,ahuy,90,70,'filllight'); b.text(ahux+45,ahuy+30,'AHU-1','tbhead','middle'); b.text(ahux+45,ahuy+48,'FINAL SIZE BY MANUAL J/S','tiny','middle')
    # Main trunk and branches to exterior-wall registers, all connected.
    trunkx=g['vx2']+25; trunky=g['mid']+55; b.path(f'M{ahux} {ahuy+35} H{trunkx} V{g["y"]+85}','duct')
    regs=[(g['x']+120,g['y']+25),(g['x']+390,g['y']+25),(g['x']+720,g['y']+25),(g['x']+960,g['y']+25),(g['x']+25,g['mid']+110),(g['x']+25,g['low']+90),(g['x']+g['w']-25,g['mid']+95),(g['x']+g['w']-25,g['low']+90)]
    for i,(rx,ry) in enumerate(regs,1):
        b.rect(rx-22,ry-8,44,16,'filllight'); b.text(rx,ry+4,f'S{i}','tiny','middle')
        # orthogonal branch to trunk
        b.path(f'M{trunkx} {ry} H{rx}','duct')
    # Return grilles connected to return trunk.
    ret1=(g['vx1']+120,g['mid']-50); ret2=(g['vx2']+120,g['mid']+100)
    for idx,(rx,ry) in enumerate((ret1,ret2),1): b.rect(rx-28,ry-12,56,24,'filllight'); b.text(rx,ry+4,f'R{idx}','tiny','middle'); b.path(f'M{ahux+90} {ahuy+52} H{rx} V{ry}','return')
    # Condenser anchored outside east wall.
    cux=g['x']+g['w']+35; cuy=g['low']+55; b.rect(cux,cuy,60,60,'filllight'); b.text(cux+30,cuy+34,'CU-1','tiny','middle'); b.path(f'M{ahux+90} {ahuy+20} H{cux} V{cuy+30}','hidden')
    b.circle(g['vx2']+90,g['mid']-25,13,'bubble'); b.text(g['vx2']+90,g['mid']-21,'T','tbhead','middle')
    b.rect(1110,135,470,350,'inner'); b.text(1130,165,'EQUIPMENT / AIR DEVICE SCHEDULE','tbhead')
    rows=[('AHU-1','FURNACE / COIL','FINAL MANUAL J/S'),('CU-1','CONDENSER','MATCHED SYSTEM'),('ERV-1','ENERGY RECOVERY VENT.','FINAL VENTILATION DESIGN'),('S1–S8','SUPPLY REGISTERS','SIZE BY MANUAL D'),('R1–R2','RETURN GRILLES','SIZE BY MANUAL D')]
    for i,r in enumerate(rows): yy=205+i*52; b.line(1110,yy-18,1580,yy-18,'thin'); b.text(1130,yy,r[0],'tbhead'); b.text(1200,yy,r[1],'tiny'); b.text(1450,yy,r[2],'tiny')
    b.rect(1110,520,470,265,'inner'); b.text(1130,550,'HVAC COORDINATION NOTES','tbhead')
    for i,n in enumerate(['Complete Manual J, S, and D before equipment and duct release.','Keep trunks and branches within approved framing and soffit zones.','Coordinate bath exhaust, range hood, dryer exhaust, ERV, combustion air, condensate, and roof/wall penetrations.','Provide balancing dampers, access, firestopping, insulation, startup, and test records.']): b.text(1130,585+i*42,f'{i+1}. {n}','tiny')
    return sheet('M-101','HVAC Plan on Coordinated Architectural Underlay','1/4″ = 1′-0″','Licensed HVAC Design Required',b,['Every register, return, equipment item, thermostat, condenser, and duct route is tied to the coordinated room/wall plan.','Final capacities, duct sizes, routes, clearances, ventilation, exhaust, controls, and combustion requirements require licensed design.'])

def plumbing_sheet():
    b=S(); g=plan_underlay(b,70,135,1000,650,True,True,False)
    def fixture(x,y,label,shape='rect'):
        if shape=='circle': b.circle(x,y,18,'fixture')
        else: b.rect(x-22,y-14,44,28,'fixture')
        b.text(x,y+4,label,'tiny','middle')
    ks=(g['x']+150,g['y']+50); dw=(g['x']+225,g['y']+50)
    wm=(g['vx2']+60,g['mid']+80); lav=(g['vx3']+55,g['low']-70); wc=(g['vx3']+125,g['low']-70); sh=(g['vx3']+145,g['mid']+80); wh=(g['vx3']+60,g['mid']+155)
    for pt,label,shape in [(ks,'KS-1','rect'),(dw,'DW-1','rect'),(wm,'WM-1','rect'),(lav,'LAV-1','rect'),(wc,'WC-1','circle'),(sh,'SH-1','rect'),(wh,'WH-1','rect')]: fixture(pt[0],pt[1],label,shape)
    # Service enters through the east mechanical-room wall and connects directly to the water heater/manifold.
    sx=g['x']+g['w']; sy=g['low']+95
    b.circle(sx,sy,7,'fixture'); b.text(sx-10,sy-12,'WATER / SANITARY SERVICE ENTRY','tiny','end')
    b.path(f'M{sx} {sy} H{wh[0]} V{wh[1]}','cold')
    b.path(f'M{wh[0]-8} {wh[1]-12} V{g["y"]+50} H{ks[0]}','hot')
    b.path(f'M{wh[0]+8} {wh[1]+12} H{g["vx2"]+10} V{g["y"]+72} H{ks[0]}','waste')
    # Short, direct branches from coordinated mains to fixtures.
    for x,y in [ks,dw]:
        b.path(f'M{ks[0]} {g["y"]+50} H{x} V{y}','cold'); b.path(f'M{ks[0]} {g["y"]+44} H{x} V{y-5}','hot'); b.path(f'M{g["vx2"]+10} {g["y"]+72} H{x} V{y+8}','waste')
    for x,y in [wm,lav,wc,sh]:
        b.path(f'M{wh[0]} {wh[1]} H{x} V{y}','cold')
        if (x,y)!=wc: b.path(f'M{wh[0]-8} {wh[1]-12} H{x} V{y-5}','hot')
        b.path(f'M{wh[0]+8} {wh[1]+12} H{x} V{y+8}','waste')
    b.path(f'M{ks[0]} {ks[1]+8} V{g["y"]-18} M{lav[0]} {lav[1]+8} V{g["y"]-18}','vent')
    b.rect(1110,135,470,300,'inner'); b.text(1130,165,'DOMESTIC WATER / DWV RISER','tbhead')
    b.path('M1170 390V220H1515','waste'); b.path('M1210 390V242H1515','cold'); b.path('M1250 390V264H1515','hot')
    for i,(yy,lbl) in enumerate([(220,'KITCHEN GROUP'),(264,'BATH GROUP'),(308,'LAUNDRY / WATER HEATER')]):
        b.circle(1450,yy,15,'fixture'); b.text(1450,yy+4,str(i+1),'tiny','middle'); b.text(1480,yy+4,lbl,'tiny')
    b.rect(1110,470,470,315,'inner'); b.text(1130,500,'FIXTURE SCHEDULE','tbhead')
    rows=[('KS-1','KITCHEN SINK','1'),('DW-1','DISHWASHER','1'),('WM-1','WASHER BOX','1'),('LAV-1','LAVATORY','2'),('WC-1','WATER CLOSET','2'),('SH-1','SHOWER / TUB','2'),('WH-1','WATER HEATER','1')]
    for i,r in enumerate(rows):
        yy=535+i*32; b.line(1110,yy-18,1580,yy-18,'thin'); b.text(1130,yy,r[0],'tbhead'); b.text(1200,yy,r[1],'tiny'); b.text(1510,yy,r[2],'tiny')
    return sheet('P-101','Plumbing Plan on Coordinated Architectural Underlay','1/4″ = 1′-0″ / N.T.S.','Licensed Plumbing Design Required',b,['Every plumbing fixture and service route is anchored to the coordinated kitchen, laundry, bath/mechanical, wall, or service-entry geometry.','Final pipe sizes, slopes, vents, cleanouts, water heater, well/septic or municipal connections, testing, and permits require licensed design.'])

def electrical_sheet():
    b=S(); g=plan_underlay(b,70,135,1000,650,True,True,False)
    panel=(g['vx3']+75,g['mid']+155); b.rect(panel[0]-35,panel[1]-45,70,90,'filllight'); b.text(panel[0],panel[1]-5,'PANEL A','tbhead','middle'); b.text(panel[0],panel[1]+15,'200A MLO','tiny','middle')
    # Lights centered in actual rooms.
    lights=[(g['x']+g['w']*.18,g['y']+g['h']*.27),(g['vx1']+g['w']*.14,g['y']+g['h']*.27),(g['vx2']+g['w']*.18,g['y']+g['h']*.27),(g['x']+g['w']*.18,g['mid']+g['h']*.16),(g['vx1']+g['w']*.14,g['low']+g['h']*.10),(g['vx2']+g['w']*.08,g['low']+g['h']*.10),(g['vx3']+g['w']*.10,g['low']+g['h']*.10)]
    for i,(lx,ly) in enumerate(lights,1): b.circle(lx,ly,13,'fixture'); b.line(lx-9,ly-9,lx+9,ly+9,'thin'); b.line(lx-9,ly+9,lx+9,ly-9,'thin'); b.text(lx,ly+28,f'L{i}','tiny','middle'); b.path(f'M{panel[0]} {panel[1]} H{lx} V{ly}','circuit')
    # Receptacles sit on walls, switches at door jambs.
    outlets=[(g['x']+100,g['y']+18),(g['x']+290,g['y']+18),(g['vx1']+120,g['y']+18),(g['vx2']+120,g['y']+18),(g['x']+18,g['mid']+100),(g['x']+18,g['low']+80),(g['x']+g['w']-18,g['mid']+100),(g['x']+g['w']-18,g['low']+80)]
    for idx,(ox,oy) in enumerate(outlets,1): b.circle(ox,oy,9,'fixture'); b.line(ox-6,oy,ox+6,oy,'thin'); b.text(ox,oy+22,f'R{idx}','tiny','middle')
    switches=[(g['vx1']-18,g['mid']-30),(g['vx2']-18,g['low']-30),(g['vx3']-18,g['low']-30),(g['x']+g['w']-25,g['y']+145)]
    for idx,(sx,sy) in enumerate(switches,1): b.circle(sx,sy,10,'fixture'); b.text(sx,sy+4,'S','tiny','middle'); nearest=lights[min(idx-1,len(lights)-1)]; b.path(f'M{sx} {sy} H{nearest[0]} V{nearest[1]}','circuit')
    b.rect(1110,135,470,390,'inner'); b.text(1130,165,'PANEL A — REPRESENTATIVE SCHEDULE','tbhead')
    rows=[('1/3','KITCHEN SMALL APPLIANCE','20A 2P'),('5','REFRIGERATOR','20A 1P'),('7/9','RANGE','50A 2P'),('11','DISHWASHER','20A 1P'),('13','MICROWAVE / HOOD','20A 1P'),('15','LAUNDRY','20A 1P'),('17/19','DRYER','30A 2P'),('21','BATH GFCI','20A 1P'),('23','LIGHTING — MAIN','15A 1P'),('25','LIGHTING — UPPER','15A 1P'),('27/29','HVAC / AHU','30A 2P'),('31','EXTERIOR / GARAGE','20A 1P')]
    for i,r in enumerate(rows): yy=195+i*27; b.line(1110,yy-15,1580,yy-15,'thin'); b.text(1220,yy,r[0],'tiny'); b.text(1200,yy,r[1],'tiny'); b.text(1505,yy,r[2],'tiny')
    b.rect(1110,555,470,230,'inner'); b.text(1130,585,'ELECTRICAL NOTES','tbhead')
    for i,n in enumerate(['Complete service/load calculation and utility coordination.','Coordinate AFCI/GFCI, grounding, bonding, smoke/CO, lighting controls, exterior loads, HVAC, appliances, and low voltage.','Final circuiting, conductor sizes, panel, devices, clearances, permits, and inspections by licensed electrician.']): b.text(1130,620+i*45,f'{i+1}. {n}','tiny')
    return sheet('E-101','Electrical Plan on Coordinated Architectural Underlay','1/4″ = 1′-0″','Licensed Electrical Design Required',b,['Every light, switch, receptacle, panel, and circuit path is placed on or within the coordinated room and wall plan.','Final service, load, circuit, conductor, grounding, device, lighting-control, and inspection requirements require licensed design.'])

def site_sheet():
    b=S(); px,py,pw,ph=80,125,1050,650; b.rect(px,py,pw,ph,'property'); b.text(px+pw/2,py+ph+35,'120′-0″ REPRESENTATIVE LOT WIDTH','dim','middle'); b.text(px-35,py+ph/2,'180′-0″ REPRESENTATIVE LOT DEPTH','dim','middle',-90)
    # setbacks and clearing limit
    b.rect(px+80,py+65,pw-160,ph-125,'setback'); b.rect(px+110,py+90,pw-220,ph-175,'clearing'); b.text(px+125,py+112,'LIMITS OF CLEARING / GRUBBING','small')
    # silt fence along downgradient sides
    b.line(px+110,py+ph-95,px+pw-110,py+ph-95,'silt'); b.line(px+pw-110,py+210,px+pw-110,py+ph-95,'silt'); b.text(px+pw-260,py+ph-105,'SILT FENCE / SEDIMENT CONTROL','tiny')
    # construction entrance and driveway connected to house pad
    entx=px+70; enty=py+ph; b.rect(entx-25,enty-35,160,35,'fillgray'); b.text(entx+55,enty-12,'STABILIZED CONSTRUCTION ENTRANCE','tiny','middle')
    housex=px+365; housey=py+220; housew=420; househ=280; b.rect(housex,housey,housew,househ,'cut'); b.text(housex+housew/2,housey+househ/2,'48′ × 32′ HOUSE PAD / FOUNDATION','room','middle')
    b.poly(f'{entx+55},{enty-35} {entx+55},{housey+househ+75} {housex-55},{housey+househ+75} {housex-55},{housey+househ/2}','outline'); b.text(housex-140,housey+househ+65,'TEMPORARY / FINAL DRIVEWAY','tiny')
    # topsoil stockpile and staging, connected to clearing workflow
    b.circle(px+200,py+210,55,'earth'); b.text(px+200,py+215,'TOPSOIL','small','middle'); b.text(px+200,py+232,'STOCKPILE','tiny','middle')
    b.rect(px+170,py+360,150,90,'hidden'); b.text(px+245,py+405,'MATERIAL / EQUIPMENT STAGING','tiny','middle')
    # well and septic with service lines to house
    well=(px+880,py+140); b.circle(well[0],well[1],28,'fixture'); b.text(well[0],well[1]+4,'WELL','tiny','middle'); b.path(f'M{well[0]} {well[1]} H{housex+housew} V{housey+90}','cold')
    sep=(px+840,py+500); b.rect(sep[0]-90,sep[1]-45,180,90,'hidden'); b.text(sep[0],sep[1],'SEPTIC / DRAINFIELD','small','middle'); b.path(f'M{housex+housew} {housey+190} H{sep[0]-90} V{sep[1]}','waste')
    # electric utility
    pole=(px+930,py+300); b.circle(pole[0],pole[1],12,'fixture'); b.text(pole[0],pole[1]-20,'ELECTRIC / COMM.','tiny','middle'); b.path(f'M{pole[0]} {pole[1]} H{housex+housew} V{housey+140}','hidden')
    # grade arrows anchored from house pad outward
    for x1,y1,x2,y2 in [(housex,housey+30,housex-95,housey-40),(housex+housew,housey+30,housex+housew+95,housey-40),(housex,housey+househ-30,housex-95,housey+househ+45),(housex+housew,housey+househ-30,housex+housew+95,housey+househ+45)]: b.line(x1,y1,x2,y2,'leader')
    b.text(housex+housew/2,housey-18,'ROUGH GRADE HIGH POINT / DRAIN AWAY FROM FOUNDATION','tiny','middle')
    # tree protection outside clearing limits
    for tx,ty in [(px+130,py+125),(px+100,py+530),(px+970,py+100),(px+985,py+570)]: b.circle(tx,ty,26,'fixture'); b.circle(tx,ty,38,'clearing'); b.text(tx,ty+4,'TREE','tiny','middle')
    # deck/porch/patio attached to house
    b.rect(housex+housew*.32,housey+househ,housew*.36,55,'wood'); b.text(housex+housew*.50,housey+househ+32,'FRONT PORCH','tiny','middle')
    b.rect(housex+housew,housey+75,75,130,'wood'); b.text(housex+housew+38,housey+140,'REAR DECK','tiny','middle',-90)
    b.rect(1180,125,400,330,'inner'); b.text(1200,155,'GROUND-UP SITE CONSTRUCTION SEQUENCE','tbhead')
    seq=['Survey, stake property, setbacks, house, driveway, utilities, and clearing limits.','Install construction entrance, erosion controls, tree protection, and sediment controls.','Clear and grub only approved limits; remove stumps and unsuitable material.','Strip and stockpile topsoil; rough grade access and house pad.','Excavate foundation; manage groundwater; place footing/foundation/slab systems.','Install well/septic or municipal services, electric/communications, and utility trenches.','Backfill, compact, rough grade, build driveway/decks/flatwork, and route drainage.','Replace topsoil, final grade, seed/landscape, remove temporary controls after stabilization, and close out.']
    for i,n in enumerate(seq): b.bubble(1205,185+i*32,str(i+1)); b.text(1230,189+i*32,n,'tiny')
    b.rect(1180,485,400,290,'inner'); b.text(1200,515,'SITE RELEASE HOLD POINTS','tbhead')
    holds=['Verified survey / easements / setbacks','Approved erosion-control plan','Utility locates and service approvals','Soil, groundwater, frost, and bearing confirmation','Foundation inspection before backfill','Septic/well or municipal inspection','Compaction and drainage verification','Final stabilization and as-built closeout']
    for i,n in enumerate(holds): b.text(1200,550+i*28,f'□ {n}','tiny')
    return sheet('C-S-L-101','Lot Clearing, Site Utilities, Grading & Landscape Plan','1″ = 20′-0″','Ground-Up Site Construction / Professional Review',b,['The project starts with survey, erosion control, stabilized access, lot clearing, grubbing, topsoil stripping, and rough grading before foundation work.','Final civil, septic/well, utility, drainage, grading, driveway, deck, landscape, and erosion-control requirements require verified site data and applicable approvals.'])

def write_svg(name,content):
    (OUT/name).write_text(content,encoding='utf-8')

SHEETS={
 'G-001.svg':general_sheet,
 'A-101.svg':main_floor,
 'A-102.svg':second_floor,
 'A-201.svg':elevations,
 'A-301.svg':section_details,
 'A-401.svg':kitchen_sheet,
 'M-101.svg':hvac_sheet,
 'P-101.svg':plumbing_sheet,
 'E-101.svg':electrical_sheet,
 'C-S-L-101.svg':site_sheet,
}
for name,fn in SHEETS.items(): write_svg(name,fn())

# Update the public package when this script is run inside the repository.
pkg = ROOT / 'whole-house-quote-package.html'
if pkg.exists():
    text=pkg.read_text(encoding='utf-8')
    text=text.replace('Whole-House Renovation &amp; Property Improvement','New-Home Construction — Lot Clearing Through Final Completion')
    text=text.replace('Whole-House Renovation & Property Improvement','New-Home Construction — Lot Clearing Through Final Completion')
    text=text.replace('whole-house renovation/property-improvement','ground-up new-home construction')
    text=text.replace('renovation/property-improvement','ground-up new-home construction')
    text=text.replace('renovation and property improvement','ground-up new-home construction')
    text=text.replace('Whole-House Renovation and Property Improvement','Ground-Up New-Home Construction')
    text=text.replace('<h1>Whole-House Renovation<br>& Property Improvement</h1>','<h1>Ground-Up New Home<br>Lot Clearing Through Final Completion</h1>')
    text=text.replace('STANDALONE TRADE QUOTE','STANDALONE CONSTRUCTION PHASE QUOTE')
    text=text.replace('REVISION C','REVISION F')
    text=text.replace(' · REV C',' · REV F')
    text=text.replace('H38-UQB-WH-${q.n}','H38-UQB-NEW-HOME-${q.n}')
    text=text.replace('assumed 48′ × 32′ two-story residence, field verification required','representative vacant lot with a proposed 48′ × 32′ two-story residence; survey, soil, utilities, and final design required')
    text=re.sub(r'<h1>Whole-House Renovation<br>&amp; Property Improvement</h1>', '<h1>Ground-Up New Home<br>Lot Clearing Through Final Completion</h1>', text)
    text=text.replace('Revision:</strong> E',f'Revision:</strong> {REV}')
    text=text.replace('H38-UQB-WH-REV-E',f'H38-UQB-NEW-HOME-REV-{REV}')
    text=text.replace('Revision E',f'Revision {REV}')
    text=text.replace('REV E',f'REV {REV}')
    # Replace CAD section headings/descriptions consistently.
    headings={
      'G-001 — General Notes, Index & Symbols':'G-001 — Project Definition, Index & General Notes',
      'A-101 — Proposed Main-Floor Plan — Detailed':'A-101 — Proposed Main-Floor Plan',
      'A-102 — Second-Floor & Roof Plan':'A-102 — Second-Floor & Roof Plan',
      'A-201 — Exterior Elevations — Detailed Four Views':'A-201 — Exterior Elevations — Four Coordinated Views',
      'A-301 — Building Sections & Envelope Details — Detailed':'A-301 — Building Section & Construction Details',
      'A-401 — Kitchen Plan & Interior Elevations — Detailed':'A-401 — Kitchen Plan & Cabinet Elevations',
      'M-101 — HVAC Distribution & Equipment Plan':'M-101 — HVAC Plan on Coordinated Architectural Underlay',
      'P-101 — Plumbing Plan, Riser & Fixture Schedule':'P-101 — Plumbing Plan on Coordinated Architectural Underlay',
      'E-101 — Lighting, Power & Panel Schedule':'E-101 — Electrical Plan on Coordinated Architectural Underlay',
      'C-S-L-101 — Site, Deck, Concrete, Drainage & Landscape':'C-S-L-101 — Lot Clearing, Site Utilities, Grading & Landscape Plan',
    }
    for a,bv in headings.items(): text=text.replace(a,bv)
    # Replace quote definitions with a fixed 14-phase ground-up sequence while preserving a complete customer quote structure.
    quotes=[
      ('01','preconstruction','Preconstruction, Survey, Design & Permits',28500,'4–8 weeks','20% at authorization',['Boundary/topographic survey coordination and site verification','Architectural, structural, energy, civil, septic/well, and trade-design allowances','Permit matrix, selections schedule, construction documents, and revision control','Preconstruction coordination and release hold points'],[['Survey / site verification','1 allowance',5500,5500],['Design and engineering allowance','1 allowance',14500,14500],['Permits / reviews allowance','1 allowance',5000,5000],['Preconstruction coordination','28 hr',125,3500]],['Land purchase, financing, or legal services','Extraordinary agency fees beyond allowance'],['Vacant lot access is available','Final scope follows approved permit documents']),
      ('02','clearing','Lot Clearing, Erosion Control & Temporary Access',18750,'1–2 weeks','25% mobilization',['Stake clearing limits, construction entrance, erosion controls, and protected trees','Clear and grub approved limits; remove stumps and unsuitable debris','Strip and stockpile topsoil; establish temporary access and staging','Maintain sediment controls until final stabilization'],[['Mobilization / stabilized entrance','1 lot',3500,3500],['Clearing and grubbing','1 lot',9500,9500],['Topsoil stripping / stockpile','1 lot',3250,3250],['Erosion and tree protection','1 lot',2500,2500]],['Hazardous-material removal','Unmarked underground obstructions'],['Clearing limits are approved before mobilization','Burning is not included']),
      ('03','earthwork','Excavation, House Pad, Site Utilities & Rough Grading',42500,'2–4 weeks','25% before excavation',['Rough grade access and house pad; manage surface water','Excavate foundation and utility trenches; haul or place suitable material','Coordinate water, sanitary/septic, electric, communications, and sleeves','Backfill and compact after approved foundation and utility inspections'],[['Excavation / house pad','1 lot',16500,16500],['Granular fill / compaction','1 allowance',11000,11000],['Utility trenching / sleeves','1 allowance',9000,9000],['Rough grading / drainage','1 lot',6000,6000]],['Rock blasting or contaminated soil','Dewatering beyond normal allowance'],['Bearing and groundwater are verified','Utility routes are approved']),
      ('04','foundation','Footings, Foundation, Waterproofing & Slabs',58900,'3–5 weeks','30% before concrete',['Footings, foundation walls, pads, reinforcing, anchor bolts, and embedded items','Dampproofing/waterproofing, drainage, insulation, and foundation backfill coordination','Under-slab utilities, vapor barrier, insulation, reinforcing, and concrete slabs','Foundation inspection, elevation verification, and concealed-work documentation'],[['Footings and foundation walls','1 lot',31500,31500],['Waterproofing / drainage / insulation','1 lot',8500,8500],['Under-slab preparation','1 lot',6900,6900],['Concrete slabs','1 lot',12000,12000]],['Special foundations not shown','Winter conditions beyond allowance'],['Final structural drawings govern','Concrete access is available']),
      ('05','framing','Structural Framing, Sheathing, Trusses & Stairs',92000,'6–10 weeks','25% before material order',['Floor, wall, roof, porch, and stair framing per approved structural documents','Sheathing, connectors, blocking, fireblocking, and continuous load-path components','Roof truss/rafter installation and temporary/permanent bracing','Framing inspection coordination and concealed-work photo proof'],[['Lumber / trusses / engineered wood','1 allowance',52000,52000],['Framing labor','1 lot',31500,31500],['Connectors / blocking / hardware','1 lot',5500,5500],['Equipment / safety / cleanup','1 lot',3000,3000]],['Design changes after release','Unapproved field modifications'],['Foundation dimensions are accepted','Material lead times remain available']),
      ('06','exterior','Roofing, Siding, Windows & Exterior Doors',78500,'6–12 weeks','35% before order',['Roof underlayment, ice/water protection, shingles/metal accessories, flashings, and gutters','Windows, exterior doors, weather barriers, flashing, sealants, and exterior trim','Siding, soffit, fascia, vents, and exterior finish components','Water-management inspection and dry-in closeout'],[['Roofing system','1 lot',18500,18500],['Windows and exterior doors','1 allowance',28500,28500],['WRB / siding / trim','1 lot',27500,27500],['Gutters / sealants / closeout','1 lot',4000,4000]],['Premium upgrades beyond allowance','Storm damage after installation'],['Approved opening schedule governs','Colors and products selected before order']),
      ('07','plumbing','Plumbing, Water, Sanitary & Fixtures',38500,'4–8 weeks rough-in; 2 weeks trim','25% before rough-in',['Water service, distribution, shutoffs, water heater, and fixture supplies','Sanitary, waste, vent, cleanouts, and service/septic connection coordination','Kitchen, bath, laundry, exterior, and mechanical-room rough-ins','Fixtures, trim, testing, inspections, and owner orientation'],[['Underground / service plumbing','1 lot',8500,8500],['Rough plumbing','1 lot',15500,15500],['Fixture allowance','1 allowance',9500,9500],['Trim / test / inspection','1 lot',5000,5000]],['Well or septic equipment beyond separate allowance','Owner upgrades beyond fixture allowance'],['Licensed design and permits govern','Fixture selections are timely']),
      ('08','electrical','Electrical Service, Power, Lighting & Low Voltage',34500,'4–8 weeks rough-in; 2 weeks trim','25% before rough-in',['Utility/service coordination, meter, panel, grounding, bonding, and surge protection','Branch circuits, receptacles, switches, lighting, smoke/CO, appliances, and HVAC power','Exterior power/lighting and representative low-voltage pathways','Trim, labeling, testing, inspections, and panel directory'],[['Service / panel / grounding','1 lot',8500,8500],['Rough wiring / devices','1 lot',14500,14500],['Lighting / fixtures allowance','1 allowance',7500,7500],['Trim / testing / inspection','1 lot',4000,4000]],['Generator, solar, or specialty automation unless added','Utility-company charges'],['Licensed design and load calculation govern','Fixture schedule is approved']),
      ('09','hvac','HVAC, Ventilation, Exhaust & Controls',32800,'4–8 weeks','30% before equipment order',['Manual J/S/D-based equipment selection and duct design','Heating/cooling equipment, ductwork, registers, returns, filtration, and controls','ERV/fresh-air, bath exhaust, range/dryer exhaust coordination, and condensate','Startup, balancing, testing, inspection, and owner orientation'],[['Equipment allowance','1 allowance',14500,14500],['Ductwork / distribution','1 lot',10500,10500],['Ventilation / exhaust / controls','1 lot',4800,4800],['Startup / balance / closeout','1 lot',3000,3000]],['Fuel-service charges','Special zoning not shown'],['Licensed calculations govern','Envelope design remains coordinated']),
      ('10','enclosure','Insulation, Air Sealing, Drywall & Interior Prime',41250,'5–8 weeks','25% before material order',['Air sealing, firestopping, insulation, baffles, and thermal-bridge coordination','Energy-code inspections and blower-door coordination','Drywall hanging, finishing, sanding, and interior primer','Protection, cleanup, and deficiency correction'],[['Air sealing / firestopping','1 lot',5500,5500],['Insulation','1 lot',12500,12500],['Drywall / finishing','1 lot',19250,19250],['Primer / cleanup','1 lot',4000,4000]],['Special acoustic assemblies unless added','Decorative wall finishes'],['Building is dried in','Rough-ins and inspections are complete']),
      ('11','millwork','Cabinets, Countertops, Interior Doors & Millwork',46500,'8–14 weeks procurement; 3 weeks install','40% at order',['Kitchen, bath, laundry, and storage cabinet coordination and installation','Countertop template, fabrication, installation, and sink coordination','Interior doors, base, casing, shelving, rails, and finish carpentry','Final adjustment, punch work, and care orientation'],[['Cabinet package allowance','1 allowance',23500,23500],['Countertop allowance','1 allowance',8500,8500],['Interior doors / trim material','1 allowance',7500,7500],['Installation labor','1 lot',7000,7000]],['Custom furniture','Appliances unless listed elsewhere'],['Approved shop drawings govern','Walls/floors are within installation tolerance']),
      ('12','finishes','Flooring, Tile, Painting & Finish Hardware',52750,'5–9 weeks','25% before material order',['Tile waterproofing, shower/tub surrounds, backsplashes, and tile floors','Wood/LVP/carpet flooring allowances, preparation, transitions, and installation','Interior finish painting, touch-up, and final coatings','Finish hardware, accessories, mirrors, and punch completion'],[['Tile systems','1 allowance',14500,14500],['Flooring systems','1 allowance',18500,18500],['Interior painting','1 lot',14500,14500],['Finish hardware / accessories','1 allowance',5250,5250]],['Premium materials beyond allowance','Window treatments'],['Selections are approved on schedule','Moisture conditions are acceptable']),
      ('13','exteriorwork','Porches, Deck, Driveway, Concrete & Exterior Flatwork',36400,'3–6 weeks','30% before material order',['Covered front porch and rear deck framing, decking, stairs, guards, and footings','Driveway base/finish allowance and stabilized access conversion','Walks, stoops, patio/flatwork, drainage slopes, and exterior transitions','Inspection, cleanup, and final safety review'],[['Porch / deck systems','1 lot',16500,16500],['Driveway allowance','1 allowance',10500,10500],['Walks / stoops / patio','1 allowance',7200,7200],['Drainage / cleanup','1 lot',2200,2200]],['Retaining walls unless added','Decorative concrete upgrades'],['Final grades and elevations are coordinated','Structural details are approved']),
      ('14','closeout','Final Grading, Landscaping, Testing & Closeout',21600,'2–4 weeks','20% before final mobilization',['Replace topsoil, establish final grades, swales, drainage, and stabilization','Seed/sod, planting allowance, restoration, and removal of temporary controls','Final cleaning, systems testing, inspections, punch work, and corrections','Closeout package, warranties, manuals, photos, and owner orientation'],[['Final grading / topsoil','1 lot',6500,6500],['Landscape / stabilization allowance','1 allowance',6500,6500],['Final cleaning / testing / punch','1 lot',5100,5100],['Closeout documents / orientation','1 lot',3500,3500]],['Long-term landscape maintenance','Owner-requested additions after acceptance'],['Weather permits stabilization','Final inspections are scheduled']),
    ]
    qparts=[]
    for n,key,title,total,duration,deposit,scope,lines,ex,ass in quotes:
        js=lambda obj: json.dumps(obj,ensure_ascii=False,separators=(',',':'))
        qparts.append("{n:%s,key:%s,title:%s,total:%d,duration:%s,deposit:%s,scope:%s,lines:%s,ex:%s,ass:%s}"%(js(n),js(key),js(title),total,js(duration),js(deposit),js(scope),js(lines),js(ex),js(ass)))
    text=re.sub(r'const quotes=\[[\s\S]*?\];', 'const quotes=['+','.join(qparts)+'];', text, count=1)
    total=sum(q[3] for q in quotes)
    text=re.sub(r'<div class="total">\$[0-9,]+</div>', f'<div class="total">${total:,.0f}</div>', text, count=1)
    text=text.replace('fourteen independently printable trade quotes','fourteen independently printable ground-up construction phase quotes')
    text=text.replace('Complete coordinated master proposal, 10-sheet professional CAD-style coordination drawing set, and fourteen independently printable trade quotes.','Complete ground-up new-home proposal, coordinated 10-sheet construction drawing set, and fourteen independently printable construction phase quotes.')
    pkg.write_text(text,encoding='utf-8')

print(json.dumps({'status':'generated','revision':REV,'project':PROJECT,'sheets':list(SHEETS.keys())},indent=2))
