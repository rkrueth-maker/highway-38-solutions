from pathlib import Path

APP = Path('reseller/src/main/assets/reseller/v240-data.js')
GRADLE = Path('reseller/build.gradle')

s = APP.read_text()
if 'window.H38_SCOUT_V328_SOURCE_QUALITY=true;' in s:
    raise SystemExit('v3.0.28 source-quality layer already installed')
if 'window.H38_SCOUT_V327_CLEAN_SOURCING=true;' not in s:
    raise SystemExit('expected v3.0.27 clean sourcing marker missing')

s = s.replace(
    '// v3.0.27 consolidated sourcing-quality reconstruction.\n// Physical-PASS login/native shell is intentionally untouched.\nwindow.H38_SCOUT_V327_CLEAN_SOURCING=true;',
    '// v3.0.28 source-quality hardening.\n// Physical-PASS login/native shell is intentionally untouched.\nwindow.H38_SCOUT_V328_SOURCE_QUALITY=true;'
)

old_bad = "function badTitle(v){const s=txt(v).replace(/\\s+/g,' ').trim();return !s||s.length<4||/^(?:dollar general(?: inventory checker)?|inventory checker|search|clearance|penny|item|product|unknown|n\\/a)$/i.test(s)||/href\\s*=|<\\/?[a-z][^>]*>|(?:search|clearance|penny)\\s*[|–—:-]\\s*dollar general/i.test(s)}"
new_bad = "function badTitle(v){const s=txt(v).replace(/\\s+/g,' ').trim(),n=norm(s);return !s||s.length<4||/^(?:dollar general(?: inventory checker)?|inventory checker|search|clearance|penny|item|product|unknown|n\\/a)$/i.test(s)||/^(?:1\\s*(?:¢|cent|cents?)|one cent)$/i.test(s)||/^first seen at (?:a )?penny(?:\\b|\\s*[·|–—:-])/i.test(s)||/^penny date unknown$/i.test(s)||/^(?:today|yesterday|\\d+\\s+(?:minutes?|hours?|days?|weeks?)\\s+ago)$/i.test(s)||/href\\s*=|<\\/?[a-z][^>]*>|(?:search|clearance|penny)\\s*[|–—:-]\\s*dollar general/i.test(s)||/^(?:first seen|seen)\\s+at\\s+(?:a\\s+)?penny/.test(n)}"
if old_bad not in s:
    raise SystemExit('v3.0.27 badTitle function not found')
s = s.replace(old_bad, new_bad)

anchor = "const authRe=/(?:session expired|jwt(?: token)? expired|invalid jwt|sign in again|not authenticated|unauthorized|http\\s*401|\\b401\\b)/i;"
quality = r'''
  const rawPenny=isPenny,rawNearPenny=isNearPenny,baseSignalLabel=signalLabel,baseHuntArtifact=huntArtifact;
  function rawPennySignal(r){return rawPenny(r)||Number(r?.current_price)===.01||Number(r?.price)===.01}
  function pennyPriceProof(r){return [r?.buy_price,r?.current_price,r?.price,r?.store_price,r?.register_price].some(v=>Number(v)===.01)}
  function pennyDateProof(r){return [r?.pennied_at,r?.penny_date,r?.penny_start_date].some(v=>!!huntAbsoluteDate(v))}
  function pennyLocalProof(r){if(r?.location_verified===true||r?.store_verified===true||r?.exact_store===true||r?.local_verified===true||r?.register_verified===true)return true;const d=Number(r?.distance_miles);return Number.isFinite(d)&&d>=0&&d<=Number(state.radius||50)&&!!txt(r?.store_key||r?.store_number||r?.store_id||r?.store_address)}
  function pennyStatusProof(r){return /(?:confirmed|verified|exact|register)/i.test(txt(r?.evidence_status||r?.verification_status||r?.proof_status||r?.penny_status))}
  function confirmedPenny(r){return rawPennySignal(r)&&pennyPriceProof(r)&&(pennyDateProof(r)||pennyLocalProof(r)||pennyStatusProof(r))}
  function pennyCandidate(r){return rawPennySignal(r)&&!confirmedPenny(r)}
  isPenny=function(r){return confirmedPenny(r)};
  isNearPenny=function(r){return rawNearPenny(r)||pennyCandidate(r)};
  signalLabel=function(r){if(confirmedPenny(r))return{label:'PENNY',cls:'penny'};if(pennyCandidate(r))return{label:'CHECK STORE',cls:'warn'};return baseSignalLabel(r)};
  huntArtifact=function(r){const t=txt(r?.canonical_title||r?.title||r?.raw_title);return baseHuntArtifact(r)||badTitle(t)||/^(?:first seen at (?:a )?penny|penny date unknown|1\\s*(?:¢|cent|cents?))/i.test(t)};
  function localActionable(r){if(pennyLocalProof(r))return true;const d=Number(r?.distance_miles);return Number.isFinite(d)&&d>=0&&d<=Number(state.radius||50)&&!!txt(r?.location_label||r?.store_name)}
'''
if anchor not in s:
    raise SystemExit('auth anchor missing')
s = s.replace(anchor, anchor + quality)

old_panel = "function qualityPanel(){const p=$('huntPage');if(!p)return;let n=p.querySelector('[data-v327-quality]');if(!n){n=document.createElement('div');n.dataset.v327Quality='true';n.className='status-line';p.prepend(n)}n.innerHTML=`<span class=\"dot ${state.v327.dgImages?'live':''}\"></span><strong>DG QUALITY</strong> · ${state.v327.dgNamed} named · ${state.v327.dgImages} images · ${state.v327.dgRemoved} generic removed`}"
new_panel = "function qualityPanel(){const p=$('huntPage');if(!p)return;let n=p.querySelector('[data-v328-quality]');if(!n){n=document.createElement('div');n.dataset.v328Quality='true';n.className='status-line';p.prepend(n)}const rows=huntBaseRows(),confirmed=rows.filter(confirmedPenny).length,candidates=rows.filter(pennyCandidate).length,local=rows.filter(localActionable).length;n.innerHTML=`<span class=\"dot ${state.v327.dgImages?'live':''}\"></span><strong>SOURCE QUALITY</strong> · DG ${state.v327.dgNamed} named · ${state.v327.dgImages} exact photos · ${state.v327.dgRemoved} junk removed · ${confirmed} confirmed penny · ${candidates} check-store · ${local} local/actionable`}"
if old_panel not in s:
    raise SystemExit('v3.0.27 qualityPanel function not found')
s = s.replace(old_panel, new_panel)

# The current v3.0.27 DG cleaner calls badTitle through dgName. The strengthened
# predicate therefore removes pseudo-products rather than renaming/fabricating them.
# The global penny predicate replacement also corrects Hunt tabs, counts and badges
# for Dollar General, Home Depot and every other retailer in one boundary.

APP.write_text(s)

g = GRADLE.read_text()
if "versionCode 327" not in g or "versionName '3.0.27'" not in g:
    raise SystemExit('expected v3.0.27 version metadata missing')
g = g.replace('versionCode 327', 'versionCode 328').replace("versionName '3.0.27'", "versionName '3.0.28'")
GRADLE.write_text(g)
print('V328_SOURCE_QUALITY_RECONSTRUCTION_OK')
