import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const BUILD = "20260911-controlled-office-passwordless-login";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "https://jqukmwtsgcsaruucnqja.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1";
const REDIRECT_TO = "https://highway38solutions.com/commercial-app/";

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") return new Response("Method not allowed", { status: 405 });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Highway 38 Business Office Sign In</title><meta name="robots" content="noindex,nofollow"><style>body{font-family:system-ui;background:#eef5f9;margin:0;padding:24px;color:#10243a}.card{max-width:560px;margin:10vh auto;background:white;padding:28px;border-radius:20px;box-shadow:0 12px 40px #0001}h1{margin-top:0}input,button{width:100%;box-sizing:border-box;padding:16px;border-radius:12px;font-size:18px;margin-top:12px}input{border:1px solid #b9cbd8}button{border:0;background:#155b87;color:white;font-weight:800}button:disabled{opacity:.65}.msg{margin-top:16px;line-height:1.5}</style></head><body><main class="card"><h1>Business Office sign in</h1><p>Enter an approved Highway 38 Business Office email address. New accounts must be created through the Office invitation flow.</p><label for="email">Email address</label><input id="email" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"><button id="send" type="button">Send secure sign-in link</button><div id="msg" class="msg" role="status" aria-live="polite"></div></main><script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>const client=supabase.createClient(${JSON.stringify(SUPABASE_URL)},${JSON.stringify(PUBLISHABLE_KEY)},{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});const email=document.getElementById('email'),msg=document.getElementById('msg'),btn=document.getElementById('send');async function send(){const value=email.value.trim().toLowerCase();if(!value){msg.textContent='Enter your approved Office email address.';email.focus();return;}btn.disabled=true;msg.textContent='Sending secure sign-in link…';const {error}=await client.auth.signInWithOtp({email:value,options:{emailRedirectTo:${JSON.stringify(REDIRECT_TO)},shouldCreateUser:false}});btn.disabled=false;msg.textContent=error?'If this email is approved, use the normal Office invitation or sign-in flow.':'Check your email for the newest Highway 38 Business Office sign-in link.';}btn.addEventListener('click',send);email.addEventListener('keydown',event=>{if(event.key==='Enter')send();});</script></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
      "referrer-policy": "no-referrer",
      "x-h38-build": BUILD,
    },
  });
});
