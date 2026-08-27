from pathlib import Path

# Build metadata
gradle = Path('reseller/build.gradle')
s = gradle.read_text()
assert "versionCode 82" in s and "versionName '2.5.2'" in s
s = s.replace('versionCode 82', 'versionCode 83', 1).replace("versionName '2.5.2'", "versionName '2.5.3'", 1)
gradle.write_text(s)

# Preserve the full geocoded city + state during the Facebook handoff. v200-discover
# currently takes the first comma-delimited segment; using spaces makes the complete
# disambiguated label one selector target (e.g. Grand Rapids Minnesota).
app = Path('reseller/src/main/assets/reseller/v200-app.js')
s = app.read_text()
assert 'H38_SCOUT_V252_FACEBOOK_LOCATION_REPAIR=true' in s
assert 'return priorOpenFacebookScan();' in s
s = s.replace(
    'window.H38_SCOUT_V252_FACEBOOK_LOCATION_REPAIR=true;',
    'window.H38_SCOUT_V252_FACEBOOK_LOCATION_REPAIR=true;\nwindow.H38_SCOUT_V253_FACEBOOK_CITY_STATE_STEERING=true;',
    1,
)
old = '        return priorOpenFacebookScan();'
new = "\n".join([
    '        const priorLabel=state.location.label;',
    "        const disambiguated=txt(r.label).replace(/,\\s*\\d{5}(?:-\\d{4})?\\s*$/,'').replace(/,\\s*/g,' ').replace(/\\s+/g,' ').trim();",
    '        if(disambiguated)state.location={...state.location,label:disambiguated};',
    '        try{return priorOpenFacebookScan();}',
    '        finally{state.location={...state.location,label:priorLabel};renderLocationStrip();}',
])
assert old in s
s = s.replace(old, new, 1)
app.write_text(s)

# Harden the authenticated Facebook WebView picker.
fb = Path('reseller/src/main/java/com/highway38/resellerscout/FacebookMarketplaceActivity.java')
s = fb.read_text()
old_where = 'String where=postal.isBlank()?"your selected Scout area":"ZIP "+postal;'
assert old_where in s
s = s.replace(old_where, 'String where=postal.isBlank()?"your selected Scout area":postal;', 1)
s = s.replace('H38ResellerScoutMarketplace/2.4.0', 'H38ResellerScoutMarketplace/2.5.3', 1)

old_candidate = '''  function exactLocationCandidate(){if(!desired)return null;var want=norm(desired),nodes=[].slice.call(document.querySelectorAll('[role=\\"option\\"],[role=\\"listbox\\"] [role=\\"button\\"],li,a,button,[role=\\"button\\"],[tabindex]'));return nodes.find(function(e){if(!visible(e))return false;var x=T(e).replace(/\\s+/g,' ').trim();if(x.length<3||x.length>120)return false;return norm(x).indexOf(want)>=0})||null}'''
new_candidate = '''  function exactLocationCandidate(){if(!desired)return null;var want=norm(desired),nodes=[].slice.call(document.querySelectorAll('body *')),hits=[];nodes.forEach(function(e){if(!visible(e))return;var x=T(e).replace(/\\s+/g,' ').trim();if(x.length<3||x.length>120)return;var got=norm(x);if(got===want||(got.indexOf(want)===0&&got.length-want.length<=4)){var r=e.getBoundingClientRect();hits.push({e:e,area:Math.max(1,r.width*r.height)})}});if(!hits.length)return null;hits.sort(function(a,b){return a.area-b.area});var e=hits[0].e;return(e.closest&&e.closest('button,a,[role=\\"button\\"],[role=\\"option\\"],[tabindex]'))||e}'''
assert old_candidate in s
s = s.replace(old_candidate, new_candidate, 1)

old_click = "  function clickExact(loc){var pick=exactLocationCandidate();if(!pick)return false;window.__h38LocActionAt=Date.now();reportFix(loc,'exact-suggestion',{location_selected_exact:true,selected_location_text:T(pick)});pick.click();setTimeout(scan,2600);return true}"
new_click = "\n".join([
    "  function clickApplyIfPresent(loc){var dialogs=[].slice.call(document.querySelectorAll('[role=\\\"dialog\\\"]')).filter(visible),root=dialogs.length?dialogs[dialogs.length-1]:document,buttons=[].slice.call(root.querySelectorAll('button,[role=\\\"button\\\"],[tabindex]')).filter(visible),b=buttons.find(function(e){var x=norm(T(e));return x==='apply'||x==='done'||x==='update'||x==='save'});if(!b)return false;window.__h38LocActionAt=Date.now();reportFix(loc,'location-apply',{location_apply_text:T(b)});b.click();return true}",
    "  function clickExact(loc){var pick=exactLocationCandidate();if(!pick)return false;window.__h38LocActionAt=Date.now();reportFix(loc,'exact-suggestion',{location_selected_exact:true,selected_location_text:T(pick)});pick.click();setTimeout(function(){clickApplyIfPresent(loc)},650);setTimeout(scan,3000);return true}",
])
assert old_click in s
s = s.replace(old_click, new_click, 1)

old_bridge = '''                if(p.optBoolean("location_selected_exact",false)){
                    String selected=p.optString("selected_location_text","");
                    if(!strictLocationRequired()||locationMatchesSelected(selected)){commitLocationProof();locationFixing=true;status.setText("Selected Marketplace location matched Scout. Waiting for Facebook to render that search area; wrong-area cards remain withheld.");return;}
                }'''
new_bridge = '''                if(p.optBoolean("location_selected_exact",false)){
                    String selected=p.optString("selected_location_text","");
                    if(!strictLocationRequired()||locationMatchesSelected(selected)){locationFixing=true;status.setText("Selected the exact Scout city/state in Marketplace. Waiting for Facebook to apply and render it; wrong-area cards remain withheld until the page itself proves the location.");return;}
                }'''
assert old_bridge in s
s = s.replace(old_bridge, new_bridge, 1)
fb.write_text(s)

print('PASS applied deterministic v2.5.3 Facebook city/state steering repair')
