from pathlib import Path


def replace_span(text, start_marker, end_marker, replacement):
    start = text.index(start_marker)
    end = text.index(end_marker, start)
    return text[:start] + replacement + text[end:]


# Build metadata
gradle = Path('reseller/build.gradle')
s = gradle.read_text()
assert "versionCode 82" in s and "versionName '2.5.2'" in s
s = s.replace('versionCode 82', 'versionCode 83', 1).replace("versionName '2.5.2'", "versionName '2.5.3'", 1)
gradle.write_text(s)

# Preserve the complete geocoded city + state during the Facebook handoff. The
# existing Discover launcher splits comma-delimited labels, so temporarily use a
# single selector phrase such as "Grand Rapids Minnesota" during the native call.
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
s = s.replace(old, new, 1)
app.write_text(s)

# Harden the authenticated Facebook WebView picker.
fb = Path('reseller/src/main/java/com/highway38/resellerscout/FacebookMarketplaceActivity.java')
s = fb.read_text()
old_where = 'String where=postal.isBlank()?"your selected Scout area":"ZIP "+postal;'
assert old_where in s
s = s.replace(old_where, 'String where=postal.isBlank()?"your selected Scout area":postal;', 1)
s = s.replace('H38ResellerScoutMarketplace/2.4.0', 'H38ResellerScoutMarketplace/2.5.3', 1)

new_candidate = r'''  function exactLocationCandidate(){if(!desired)return null;var want=norm(desired),nodes=[].slice.call(document.querySelectorAll('body *')),hits=[];nodes.forEach(function(e){if(!visible(e))return;var x=T(e).replace(/\s+/g,' ').trim();if(x.length<3||x.length>120)return;var got=norm(x);if(got===want||(got.indexOf(want)===0&&got.length-want.length<=4)){var r=e.getBoundingClientRect();hits.push({e:e,area:Math.max(1,r.width*r.height)})}});if(!hits.length)return null;hits.sort(function(a,b){return a.area-b.area});var e=hits[0].e;return(e.closest&&e.closest('button,a,[role="button"],[role="option"],[tabindex]'))||e}
'''
s = replace_span(s, '  function exactLocationCandidate()', '  function itemId(', new_candidate)

new_click = "\n".join([
    r'''  function clickApplyIfPresent(loc){var dialogs=[].slice.call(document.querySelectorAll('[role="dialog"]')).filter(visible),root=dialogs.length?dialogs[dialogs.length-1]:document,buttons=[].slice.call(root.querySelectorAll('button,[role="button"],[tabindex]')).filter(visible),b=buttons.find(function(e){var x=norm(T(e));return x==='apply'||x==='done'||x==='update'||x==='save'});if(!b)return false;window.__h38LocActionAt=Date.now();reportFix(loc,'location-apply',{location_apply_text:T(b)});b.click();return true}''',
    r'''  function clickExact(loc){var pick=exactLocationCandidate();if(!pick)return false;window.__h38LocActionAt=Date.now();reportFix(loc,'exact-suggestion',{location_selected_exact:true,selected_location_text:T(pick)});pick.click();setTimeout(function(){clickApplyIfPresent(loc)},650);setTimeout(scan,3000);return true}''',
    '',
])
s = replace_span(s, '  function clickExact(loc)', '  function steer()', new_click)

bridge_start = '                if(p.optBoolean("location_selected_exact",false)){'
bridge_end = '                if(p.optBoolean("location_fixing",false))'
new_bridge = '''                if(p.optBoolean("location_selected_exact",false)){
                    String selected=p.optString("selected_location_text","");
                    if(!strictLocationRequired()||locationMatchesSelected(selected)){locationFixing=true;status.setText("Selected the exact Scout city/state in Marketplace. Waiting for Facebook to apply and render it; wrong-area cards remain withheld until the page itself proves the location.");return;}
                }
'''
s = replace_span(s, bridge_start, bridge_end, new_bridge)
fb.write_text(s)

print('PASS applied deterministic v2.5.3 Facebook city/state steering repair')
