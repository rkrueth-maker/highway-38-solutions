/* H38 AI page — rebuilt 2026-10-11 as "Kit's Workspace" (dashboard, not chatbot).
 * renderAi() delegates to window.H38KitsWorkspace (kits-workspace.js).
 * The Ask Kit chat lives at the bottom of the workspace; askAi/toggleVoice
 * handlers below are kept and wired by the workspace module. */
function renderAi(){
  if (window.H38KitsWorkspace && typeof window.H38KitsWorkspace.render === 'function') {
    window.H38KitsWorkspace.render();
    return;
  }
  /* Fallback if the workspace module failed to load: simple chat. */
  const chat = (window.state && window.state.aiChat) || [];
  document.getElementById('mainContent').innerHTML =
    '<div class="kw-workspace"><section class="card kw-chat"><h2>Ask Hank</h2>' +
    '<div id="kwAiChat" class="ai-chat">' +
    (chat.length ? chat.map(function (m) {
      return '<div class="ai-bubble ' + esc(m.role) + '">' + esc(m.body) + '</div>';
    }).join('') : '<div class="ai-bubble assistant">Ask Hank anything about your business.</div>') +
    '</div><form id="kwAiForm"><label>Question</label>' +
    '<textarea name="question" required placeholder="What should I work on next?"></textarea>' +
    '<div class="actions"><button>Ask Hank</button></div></form></section></div>';
  var form = document.getElementById('kwAiForm');
  if (form) bindForm(form, askAi);
}
async function askAi(data,form){const question=requireValue(data.question,'Ask a question first.');state.aiChat.push({role:'user',body:question});form.reset();renderAi();let answer;if(navigator.onLine&&state.bridgeReady){try{const result=await state.bridge.request('aiAsk',{businessId:state.businessId,question,pageKey:state.page,aiConversationId:state.aiConversationId});state.aiConversationId=result.aiConversationId;answer=result.answer;}catch(error){answer=localAi(question);}}else answer=localAi(question);state.aiChat.push({role:'assistant',body:answer});renderAi();speak(answer);}
function localAi(question){const q=question.toLowerCase(),knowledge=records('aiKnowledge'),tokens=q.split(/\W+/).filter(token=>token.length>2),ranked=knowledge.map(row=>({row,score:tokens.reduce((sum,token)=>sum+(`${v(row,'Topic')} ${v(row,'Title')} ${v(row,'Content')}`.toLowerCase().includes(token)?1:0),0)})).sort((a,b)=>b.score-a.score);return ranked[0]?.score?ranked.slice(0,3).map(item=>`${v(item.row,'Title')}: ${v(item.row,'Content')}`).join('\n\n'):'I can still capture work offline. Product-specific cloud AI and provider actions require a connection.';}

function aiContext(){
  const pageLabel=PAGE_DEFS[state.page]?.[1]||'Business Office',context={shell:state.shell,pageKey:state.page,pageLabel,businessId:state.businessId};
  if(state.page==='quotes'){context.quoteId=state.quote?.quoteId||'';context.projectTitle=state.quote?.projectTitle||'';context.scope=state.quote?.scope||'';context.measurementNotes=state.quote?.measurementNotes||'';}
  if(state.selectedConversation)context.conversationId=state.selectedConversation;
  return context;
}
function aiContextLabel(){const context=aiContext();if(context.pageKey==='quotes')return context.projectTitle?`Quote Builder · ${context.projectTitle}`:'Quote Builder · new draft';return context.pageLabel;}
function openGlobalAi(){
  const dialog=$('globalAiDialog');if(!dialog)return;renderGlobalAi();if(!dialog.open)dialog.showModal();
}
function renderGlobalAi(){
  const body=$('globalAiBody');if(!body)return;
  const canOpenFull=allowedPages().includes('ai');
  body.innerHTML=`<div class="ai-drawer-shell"><header class="ai-drawer-head"><div><strong>✨ H38 AI</strong><small>Working with: ${esc(aiContextLabel())}</small></div><button id="closeGlobalAiButton" class="ai-drawer-close" type="button" aria-label="Close H38 AI">×</button></header><div class="ai-drawer-content">${state.snapshot?`<div class="ai-context">H38 keeps the current page, business and quote context while you ask.</div><div id="globalAiChat" class="ai-chat">${state.aiChat.length?state.aiChat.map(message=>`<div class="ai-bubble ${message.role}">${esc(message.body)}</div>`).join(''):`<div class="ai-bubble assistant">I am ready on ${esc(aiContextLabel())}. Ask what to do next, how to use this screen, or for help with the current quote.</div>`}</div><form id="globalAiForm"><label>Ask H38</label><textarea name="question" required placeholder="What should I do next on this screen?"></textarea><div class="actions"><button>Ask H38</button>${canOpenFull?'<button id="openFullAiButton" type="button" class="secondary">Open full H38 AI</button>':''}</div></form>`:'<div class="notice">Open the secure Business Office first, then H38 AI will use the active page and business context.</div>'}</div></div>`;
  $('closeGlobalAiButton').onclick=()=>$('globalAiDialog').close();
  if(state.snapshot){bindForm('globalAiForm',askGlobalAi);if(canOpenFull)$('openFullAiButton').onclick=()=>{$('globalAiDialog').close();openPage('ai');};}
}
async function askGlobalAi(data,form){
  const question=requireValue(data.question,'Ask a question first.'),context=aiContext();state.aiChat.push({role:'user',body:question});form.reset();renderGlobalAi();
  let answer;
  if(navigator.onLine&&state.bridgeReady){try{const result=await state.bridge.request('aiAsk',{businessId:state.businessId,question,pageKey:state.page,context,aiConversationId:state.aiConversationId});state.aiConversationId=result.aiConversationId;answer=result.answer;}catch(error){answer=localAi(question);}}
  else answer=localAi(question);
  state.aiChat.push({role:'assistant',body:answer});renderGlobalAi();
  const chat=$('globalAiChat');if(chat)chat.scrollTop=chat.scrollHeight;
}
