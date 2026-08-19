from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JAVA = ROOT / 'native/h38-site-scanner/android-app/reseller/src/main/java/com/highway38/resellerscout/MainActivity.java'
MANIFEST = ROOT / 'native/h38-site-scanner/android-app/reseller/src/main/AndroidManifest.xml'
GRADLE = ROOT / 'native/h38-site-scanner/android-app/reseller/build.gradle'
WORKFLOW = ROOT / '.github/workflows/private-reseller-scout-apk.yml'
BUILD_MARKER = ROOT / 'native/h38-site-scanner/android-app/reseller/BUILD-MARKER.txt'


def replace_once(text, old, new, label):
    if old not in text:
        raise SystemExit(f'missing patch anchor: {label}')
    return text.replace(old, new, 1)

# Version bump.
gradle = GRADLE.read_text()
gradle = replace_once(gradle, "versionCode 18", "versionCode 19", "versionCode")
gradle = replace_once(gradle, "versionName '0.1.17'", "versionName '0.1.18'", "versionName")
GRADLE.write_text(gradle)

# Android share target for Marketplace/auction/listing text.
manifest = MANIFEST.read_text()
share_filter = '''            <intent-filter>\n                <action android:name="android.intent.action.SEND" />\n                <category android:name="android.intent.category.DEFAULT" />\n                <data android:mimeType="text/plain" />\n            </intent-filter>\n'''
manifest = replace_once(
    manifest,
    '''            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n''',
    '''            <intent-filter>\n                <action android:name="android.intent.action.MAIN" />\n                <category android:name="android.intent.category.LAUNCHER" />\n            </intent-filter>\n''' + share_filter,
    'share intent filter')
MANIFEST.write_text(manifest)

java = JAVA.read_text()
java = replace_once(java,
    '    private static final String STOCK_UI_MARKER = "LOCAL_STOCK_DISPLAY_V1";\n',
    '    private static final String STOCK_UI_MARKER = "LOCAL_STOCK_DISPLAY_V1";\n'
    '    private static final String OPPORTUNITY_ENGINE_MARKER = "OPPORTUNITY_ENGINE_V1";\n'
    '    private static final String MARKETPLACE_SHARE_MARKER = "MARKETPLACE_SHARE_IN_V1";\n',
    'new markers')

runtime = r'''
    private static final String OPPORTUNITY_RUNTIME = """
            <style>
            .h38-opportunity-deck{margin:10px 0;padding:10px;border:1px solid #cbd7df;border-radius:12px;background:#f8fbfd}
            .h38-opportunity-deck h3{margin:0 0 7px;font-size:14px}.h38-opportunity-actions{display:flex;gap:7px;flex-wrap:wrap}
            .h38-opportunity-actions button{padding:8px 10px}.h38-watch-chips{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
            .h38-watch-chip{font-size:11px;padding:4px 7px;border-radius:999px;background:#e7eef3}.h38-source-note{margin:8px 12px 12px;padding:9px;border-radius:9px;background:#f4f7f9;font-size:12px}
            .h38-rank{display:inline-block;margin-left:5px;padding:3px 6px;border-radius:999px;font-size:10px;font-weight:800;background:#e7eef3}
            .h38-shared-card{padding:9px;border:1px solid #d6e0e7;border-radius:9px;margin-top:7px;background:white}.h38-shared-card a{word-break:break-all}
            </style>
            <script>
            (function(){
              'use strict';
              var WATCH_KEY='h38_reseller_watch_terms_v1',SHARED_KEY='h38_reseller_shared_opportunities_v1';
              function esc(v){return String(v||'').replace(/[&<>\"']/g,function(c){return({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'})[c]})}
              function load(key){try{var x=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(x)?x:[]}catch(e){return[]}}
              function save(key,x){try{localStorage.setItem(key,JSON.stringify(x))}catch(e){}}
              function query(){var e=document.getElementById('itemSearch');return e?String(e.value||'').trim():''}
              function openUrl(url){window.location.href=url}
              function sourceUrl(kind,q){
                q=encodeURIComponent(q||'tools');
                if(kind==='marketplace')return 'https://www.facebook.com/marketplace/search/?query='+q;
                if(kind==='hibid')return 'https://hibid.com/lots?q='+q;
                if(kind==='craigslist')return 'https://www.craigslist.org/search/sss?query='+q;
                return 'https://www.google.com/search?q='+q;
              }
              function sourceFrom(text){var s=String(text||'').toLowerCase();if(s.indexOf('facebook.com')>=0||s.indexOf('marketplace')>=0)return 'Facebook Marketplace';if(s.indexOf('hibid')>=0)return 'HiBid';if(s.indexOf('auction')>=0)return 'Online auction';return 'Shared listing'}
              function firstUrl(text){var m=String(text||'').match(/https?:\/\/[^\s]+/i);return m?m[0]:''}
              function renderShared(){
                var host=document.getElementById('h38SharedList');if(!host)return;var rows=load(SHARED_KEY).slice(0,12);
                if(!rows.length){host.innerHTML='<div class="muted small">Share a Marketplace or auction listing to H38 Reseller Scout and it will be kept here for review.</div>';return}
                host.innerHTML=rows.map(function(x){return '<div class="h38-shared-card"><strong>'+esc(x.source)+'</strong><div class="small">'+esc(x.text).slice(0,500)+'</div>'+(x.url?'<div class="actions"><button data-shared-open="'+esc(x.url)+'">Open source</button></div>':'')+'</div>'}).join('');
                host.querySelectorAll('[data-shared-open]').forEach(function(b){b.onclick=function(){openUrl(b.dataset.sharedOpen)}});
              }
              function renderWatches(){var host=document.getElementById('h38WatchChips');if(!host)return;host.innerHTML=load(WATCH_KEY).map(function(x){return '<span class="h38-watch-chip">'+esc(x)+'</span>'}).join('')||'<span class="muted small">No watch terms yet.</span>'}
              function addWatch(){var q=query();if(!q)return;var x=load(WATCH_KEY);if(!x.some(function(v){return v.toLowerCase()===q.toLowerCase()})){x.unshift(q);x=x.slice(0,20);save(WATCH_KEY,x)}renderWatches()}
              function installDeck(){
                if(document.getElementById('h38OpportunityDeck'))return;var list=document.getElementById('storeList');if(!list)return;
                var d=document.createElement('section');d.id='h38OpportunityDeck';d.className='card h38-opportunity-deck';
                d.innerHTML='<h3>Opportunity sources</h3><div class="muted small">Retail leads stay inside Scout. External sources open in their own site/app; H38 does not fake local inventory.</div><div class="h38-opportunity-actions"><button id="h38AddWatch">Watch current search</button><button data-h38-source="hibid">Search auctions</button><button data-h38-source="marketplace">Search Marketplace</button><button data-h38-source="craigslist">Search Craigslist</button></div><div id="h38WatchChips" class="h38-watch-chips"></div><h3 style="margin-top:10px">Shared opportunities</h3><div id="h38SharedList"></div>';
                list.parentNode.insertBefore(d,list);document.getElementById('h38AddWatch').onclick=addWatch;d.querySelectorAll('[data-h38-source]').forEach(function(b){b.onclick=function(){openUrl(sourceUrl(b.dataset.h38Source,query()))}});renderWatches();renderShared();
              }
              function rankLead(lead){
                if(!lead||lead.querySelector('[data-h38-rank]'))return;var text=(lead.textContent||'').toLowerCase(),label='VERIFY';
                if(lead.querySelector('[data-h38-local-penny]'))label='BUY NOW';
                else if(text.indexOf('deep ')>=0&&text.indexOf('% off')>=0)label='GOOD BUY';
                else if(lead.querySelector('.pill.penny'))label='VERIFY STORE';
                var title=lead.querySelector('.lead-title');if(title){var s=document.createElement('span');s.className='h38-rank';s.setAttribute('data-h38-rank','1');s.textContent=label;title.appendChild(s)}
              }
              function decorateStores(){
                document.querySelectorAll('details[data-store-key]').forEach(function(d){
                  d.querySelectorAll('.lead').forEach(rankLead);
                  var hasLead=!!d.querySelector('.lead'),note=d.querySelector('[data-h38-source-note]');
                  if(!hasLead&&!note){note=document.createElement('div');note.className='h38-source-note';note.setAttribute('data-h38-source-note','1');note.innerHTML='<strong>Store found.</strong> No automatic deal feed is connected for this store right now. Use <b>Add my find</b>/barcode scan, or search auctions and Marketplace above.';var summary=d.querySelector('summary');if(summary)summary.insertAdjacentElement('afterend',note)}
                  else if(hasLead&&note)note.remove();
                });
              }
              window.H38SharedOpportunity=function(text){
                text=String(text||'').trim();if(!text)return false;var rows=load(SHARED_KEY),url=firstUrl(text);rows.unshift({id:Date.now(),source:sourceFrom(text),text:text,url:url,at:new Date().toISOString()});save(SHARED_KEY,rows.slice(0,50));
                var search=document.getElementById('itemSearch');if(search){var cleaned=text.replace(/https?:\/\/[^\s]+/ig,' ').replace(/\s+/g,' ').trim().slice(0,140);if(cleaned){search.value=cleaned;localStorage.setItem('h38_reseller_item_search_v1',cleaned);search.dispatchEvent(new Event('input',{bubbles:true}))}}
                installDeck();renderShared();return true;
              };
              var marker='OPPORTUNITY_ENGINE_V1',shareMarker='MARKETPLACE_SHARE_IN_V1';installDeck();decorateStores();
              var list=document.getElementById('storeList');var obs=list?new MutationObserver(function(){installDeck();decorateStores()}):null;if(obs)obs.observe(list,{childList:true});
            })();
            </script>
            """;

'''
java = replace_once(java, '    private WebView webView;\n', runtime + '    private WebView webView;\n    private String pendingSharedText;\n', 'opportunity runtime')
java = replace_once(java,
    'settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.17-retention-stores");',
    'settings.setUserAgentString(settings.getUserAgentString() + " H38ResellerScoutAndroid/0.1.18-opportunity-engine");',
    'user agent')
java = replace_once(java,
    '            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {',
    '            @Override\n            public void onPageFinished(WebView view, String url) { super.onPageFinished(view, url); deliverSharedText(); }\n\n            @Override\n            public boolean shouldOverrideUrlLoading(WebView view, android.webkit.WebResourceRequest request) {',
    'page finished share delivery')
java = replace_once(java, '        loadEmbeddedApp();\n    }\n', '        loadEmbeddedApp();\n        captureSharedText(getIntent());\n    }\n\n    @Override\n    protected void onNewIntent(Intent intent) {\n        super.onNewIntent(intent);\n        setIntent(intent);\n        captureSharedText(intent);\n    }\n', 'incoming share lifecycle')
java = replace_once(java,
    '            html = html.replace("</body>", STOCK_RUNTIME + "\\n</body>");',
    '            html = html.replace("</body>", STOCK_RUNTIME + "\\n" + OPPORTUNITY_RUNTIME + "\\n</body>");',
    'runtime injection')
share_methods = r'''
    private void captureSharedText(Intent intent) {
        if (intent == null || !Intent.ACTION_SEND.equals(intent.getAction())) return;
        String type = intent.getType();
        if (type != null && !type.startsWith("text/")) return;
        String text = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (text == null || text.trim().isEmpty()) text = intent.getStringExtra(Intent.EXTRA_SUBJECT);
        if (text != null && !text.trim().isEmpty()) {
            pendingSharedText = text.trim();
            deliverSharedText();
        }
    }

    private void deliverSharedText() {
        if (webView == null || pendingSharedText == null || pendingSharedText.isEmpty()) return;
        String text = pendingSharedText;
        String encoded = JSONObject.quote(text);
        webView.post(() -> webView.evaluateJavascript(
                "(window.H38SharedOpportunity ? window.H38SharedOpportunity(" + encoded + ") : false)",
                result -> { if ("true".equals(result)) pendingSharedText = null; }));
    }

'''
java = replace_once(java, '    private void requestLocationPermissionOrDeliver() {\n', share_methods + '    private void requestLocationPermissionOrDeliver() {\n', 'share methods')
java = replace_once(java,
    '@JavascriptInterface public String build() { return "20260819-retention-allstores-parts-lm-v017"; }',
    '@JavascriptInterface public String build() { return "20260819-opportunity-engine-sharein-v018"; }',
    'build marker')
JAVA.write_text(java)

# Permanent build gate now validates v0.1.18 and new private-only functionality.
wf = WORKFLOW.read_text()
wf = wf.replace('v0.1.17', 'v0.1.18').replace('versionCode 18', 'versionCode 19')
wf = wf.replace("'all-stores-parts-lm-v1'", "'all-stores-parts-lm-fast-v2'")
anchor = "            'obs.observe(list,{childList:true})'; do\n"
extra = "            'obs.observe(list,{childList:true})' \\\n            'OPPORTUNITY_ENGINE_V1' \\\n            'MARKETPLACE_SHARE_IN_V1' \\\n            'h38_reseller_shared_opportunities_v1' \\\n            'Search auctions' \\\n            'Search Marketplace'; do\n"
wf = replace_once(wf, anchor, extra, 'workflow markers')
wf = replace_once(wf,
    "          grep -Fq '<title>H38 Reseller Scout</title>' reseller/src/main/assets/reseller/index.html\n",
    "          grep -Fq '<title>H38 Reseller Scout</title>' reseller/src/main/assets/reseller/index.html\n          grep -Fq 'android.intent.action.SEND' reseller/src/main/AndroidManifest.xml\n",
    'manifest gate')
WORKFLOW.write_text(wf)

BUILD_MARKER.write_text('''H38 Reseller Scout private owner build\nVersion: v0.1.18\nversionCode: 19\nMarkers: OPPORTUNITY_ENGINE_V1, MARKETPLACE_SHARE_IN_V1, REOPEN_RETENTION_STORE_MERGE_V1, ALL_STORES_PARTS_LM_V1\nScope: agent/private-reseller-scout only\nPhysical Android remains final acceptance authority.\n''')

print('v0.1.18 private patch staged successfully')
