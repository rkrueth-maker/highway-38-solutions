import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const HARDENED_MARKER = "H38_EXISTING_USER_MAGIC_LINK_V1";
const SUPABASE_URL = "https://jqukmwtsgcsaruucnqja.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_XrF41kGmTC2SmSTgPvo5OQ_vqcBd0N1";
const REDIRECT_TO = "https://highway38solutions.com/commercial-app/";

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Highway 38 Sign In</title><style>body{font-family:system-ui;background:#eef5f9;margin:0;padding:24px;color:#10243a}.card{max-width:560px;margin:10vh auto;background:white;padding:28px;border-radius:20px;box-shadow:0 12px 40px #0001}h1{margin-top:0}input,button{width:100%;box-sizing:border-box;padding:16px;border-radius:12px;font-size:18px;margin-top:12px}input{border:1px solid #b9cbd8}button{border:0;background:#155b87;color:white;font-weight:800}.msg{margin-top:16px;line-height:1.5}</style></head>
<body><main class="card"><h1>Business Office sign in</h1><p>Enter an existing Business Office account email and we’ll send a secure sign-in link.</p><label>Email address<input id="email" type="email" autocomplete="email"></label><button id="send" type="button">Send secure sign-in link</button><div id="msg" class="msg" aria-live="polite"></div></main>
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script><script>const marker=${JSON.stringify(HARDENED_MARKER)};const client=supabase.createClient(${JSON.stringify(SUPABASE_URL)},${JSON.stringify(PUBLISHABLE_KEY)},{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'pkce'}});const email=document.getElementById('email'),msg=document.getElementById('msg'),btn=document.getElementById('send');btn.onclick=async()=>{const value=email.value.trim().toLowerCase();if(!value){msg.textContent='Enter your Business Office email address.';return;}btn.disabled=true;msg.textContent='Requesting a secure sign-in link…';const {error}=await client.auth.signInWithOtp({email:value,options:{emailRedirectTo:${JSON.stringify(REDIRECT_TO)},shouldCreateUser:false}});btn.disabled=false;msg.textContent=error?'A secure sign-in link could not be requested.':'If this address has an existing account, check your email for the newest Highway 38 sign-in link.';};</script></body></html>`;

Deno.serve((request: Request) => {
  if (request.method !== "GET") {
    return new Response("Method not allowed", { status: 405, headers: { allow: "GET" } });
  }
  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store",
      "content-security-policy": `default-src 'none'; script-src https://cdn.jsdelivr.net; style-src 'unsafe-inline'; connect-src ${SUPABASE_URL}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
    },
  });
});
