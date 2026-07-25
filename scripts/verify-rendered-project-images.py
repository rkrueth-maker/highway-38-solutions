#!/usr/bin/env python3
from pathlib import Path
from PIL import Image, ImageStat
import json, sys

root=Path(sys.argv[1] if len(sys.argv)>1 else 'browser-artifacts/project-images')
meta=json.loads((root/'metadata.json').read_text())
records=meta.get('records',[])
errors=[]
if len(records)!=16:
    errors.append(f'expected 16 rendered project images, found {len(records)}')
rasters={'.png','.jpg','.jpeg','.webp'}
for record in records:
    src=record.get('src','').split('?')[0]
    if Path(src).suffix.lower() not in rasters:
        errors.append(f'photographic project image is not direct raster: {src}')
    if not record.get('complete') or record.get('naturalWidth',0)<200 or record.get('naturalHeight',0)<100:
        errors.append(f'broken rendered image: {src} {record.get("naturalWidth")}x{record.get("naturalHeight")}')
    image=Image.open(root/record['file']).convert('RGB')
    stat=ImageStat.Stat(image)
    if max(stat.stddev)<8:
        errors.append(f'near-blank rendered image: {record["file"]} stddev={stat.stddev}')
    small=image.resize((64,36))
    colors=small.getcolors(maxcolors=2304)
    if colors is not None and len(colors)<32:
        errors.append(f'insufficient visual detail: {record["file"]} colors={len(colors)}')
    pixels=list(small.getdata())
    background=sum(1 for r,g,b in pixels if abs(r-237)<12 and abs(g-242)<12 and abs(b-245)<12)/len(pixels)
    if background>.88:
        errors.append(f'page-background-dominant image: {record["file"]} ratio={background:.3f}')
if len(records)>=2:
    before=Image.open(root/records[0]['file']).convert('RGB').resize((240,135)).crop((0,0,240,62))
    after=Image.open(root/records[1]['file']).convert('RGB').resize((240,135)).crop((0,0,240,62))
    difference=sum(abs(x-y) for pa,pb in zip(before.getdata(),after.getdata()) for x,y in zip(pa,pb))/(240*62*3)
    if difference>72:
        errors.append(f'flower same-property continuity failed: upper-scene difference {difference:.2f}')
for name in ('project-examples-desktop.png','project-examples-mobile.png'):
    path=root/name
    if not path.exists() or path.stat().st_size<10000:
        errors.append(f'missing full-page evidence: {name}')
print(json.dumps({'status':'HOLD' if errors else 'PASS','images':len(records),'errors':errors},indent=2))
if errors:
    raise SystemExit(1)
