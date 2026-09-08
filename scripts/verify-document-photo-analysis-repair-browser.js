const path=require('path');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const repairPath=path.join(root,'commercial-app','document-photo-analysis-repair.js');
function assert(condition,message){if(!condition)throw new Error(message);console.log('PASS:',message);}
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Wl9sAAAAASUVORK5CYII=','base64');
(async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    for(const viewport of [{width:1440,height:900},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      await page.setContent(`<!doctype html><html><body>
        <dialog id="h38SmartDocumentDialog" open>
          <input id="h38SmartFiles" type="file" accept="image/*">
          <select id="h38SmartCustomer"><option value="">Unassigned</option><option value="C-1">North Shop</option></select>
          <select id="h38SmartJob"><option value="">No job</option><option value="J-1">Garage heater repair</option></select>
          <div id="h38SmartAnalysis" hidden></div>
          <button id="h38AnalyzePhoto" type="button">Analyze first photo</button>
        </dialog>
        <div id="toast"></div>
      </body></html>`);
      await page.evaluate(()=>{
        window.state={businessId:'B-1',snapshot:{
          customers:[{'Customer ID':'C-1','Customer Name':'North Shop','Address':'38 Highway'}],
          jobs:[{'Job ID':'J-1','Customer ID':'C-1','Project Title':'Garage heater repair','Status':'Open'}]
        }};
        window.esc=s=>String(s==null?'':s);
        window.newId=prefix=>`${prefix}-TEST`;
        window.prepareFile=async file=>({fileName:file.name,mimeType:'image/jpeg',fileSize:12,base64Data:'/9j/4AAQSkZJRgABAQAAAQABAAD/2Q=='});
        window.__oldCalled=false;document.getElementById('h38AnalyzePhoto').onclick=()=>{window.__oldCalled=true;throw new Error('Edge Function returned a non-2xx status code');};
        window.__mode='success';window.__invocations=[];window.__writes=[];window.__toasts=[];
        window.toast=(message,bad)=>window.__toasts.push({message:String(message),bad:!!bad});
        window.queueOperation=async(...args)=>{window.__writes.push(args);return{status:'PASS'};};
        const fn={invoke:async(name,options)=>{
          window.__invocations.push({name,body:options.body});
          if(window.__mode==='fail')return{data:null,error:{message:'Edge Function returned a non-2xx status code',context:{clone:()=>({json:async()=>({status:'FAIL',message:'Photo analysis returned no result.'})})}}};
          return{error:null,data:{status:'PASS',mode:'photo_intake',summary:'Visible unit-heater label and service condition.',extractedText:'REZNOR UDAP-75',observedFacts:[{fact:'Visible heater model label',confidence:.98,needsVerification:true}],likelyCustomer:{id:'C-1',name:'North Shop',confidence:.9,reason:'Address and job context support this match.'},likelyJob:{id:'J-1',title:'Garage heater repair',confidence:.9,reason:'Equipment and project title match.'},model:'gpt-5.6-luna'}};
        }};
        window.H38_SUPABASE_SHARED_CLIENT={ensure:()=>({functions:fn})};
      });
      await page.addScriptTag({path:repairPath});
      await page.setInputFiles('#h38SmartFiles',{name:'heater.png',mimeType:'image/png',buffer:png});
      await page.locator('#h38AnalyzePhoto').click();
      await page.waitForFunction(()=>document.getElementById('h38SmartAnalysis').textContent.includes('Visible unit-heater label'));
      const success=await page.evaluate(()=>({old:window.__oldCalled,invocations:window.__invocations,writes:window.__writes,toasts:window.__toasts,panel:document.getElementById('h38SmartAnalysis').innerText}));
      assert(success.old===false,`repair replaces failing legacy Analyze first photo handler at ${viewport.width}px`);
      assert(success.invocations.length===1&&success.invocations[0].name==='h38-document-photo-analysis',`dedicated photo function is invoked at ${viewport.width}px`);
      assert(String(success.invocations[0].body.photoData).startsWith('data:image/jpeg;base64,'),`prepared image payload is sent at ${viewport.width}px`);
      assert(success.invocations[0].body.candidates.customers[0].id==='C-1'&&success.invocations[0].body.candidates.jobs[0].id==='J-1',`candidate matching is tenant-snapshot bounded at ${viewport.width}px`);
      assert(success.writes.some(args=>args[0]==='SAVE_ENTITY'&&args[1]==='Document Photo Analysis'),`successful analysis saves internal evidence at ${viewport.width}px`);
      assert(/needs verification/i.test(success.panel),`observed photo facts remain unverified at ${viewport.width}px`);
      await page.locator('[data-h38-photo-job="J-1"]').click();
      assert(await page.locator('#h38SmartCustomer').inputValue()==='C-1',`job suggestion only stages existing customer selection at ${viewport.width}px`);
      assert((await page.evaluate(()=>window.__invocations.length))===1,`suggestion selection performs no external call at ${viewport.width}px`);
      await page.evaluate(()=>{window.__mode='fail';window.__toasts=[];document.getElementById('h38SmartAnalysis').textContent='';});
      await page.locator('#h38AnalyzePhoto').click();
      await page.waitForFunction(()=>document.getElementById('h38SmartAnalysis').textContent.includes('Photo analysis returned no result.'));
      const failure=await page.evaluate(()=>({panel:document.getElementById('h38SmartAnalysis').innerText,toasts:window.__toasts}));
      assert(failure.panel.includes('Photo analysis returned no result.'),`safe server failure detail replaces generic non-2xx error at ${viewport.width}px`);
      assert(!failure.panel.includes('Edge Function returned a non-2xx status code'),`generic non-2xx text is suppressed when server detail exists at ${viewport.width}px`);
      assert(failure.toasts.some(t=>t.message==='Photo analysis returned no result.'&&t.bad),`safe failure is surfaced in toast at ${viewport.width}px`);
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth+2);
      assert(!overflow,`repair introduces no page-level horizontal overflow at ${viewport.width}px`);
      await page.close();
    }
    console.log('Document photo analysis repair browser verification PASS');
  } finally {await browser.close();}
})().catch(error=>{console.error(error.stack||error);process.exit(1);});
