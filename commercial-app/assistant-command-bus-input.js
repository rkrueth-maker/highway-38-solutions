(function(){
'use strict';
const BUILD='20260824-assistant-command-input-2';
const text=v=>String(v==null?'':v).trim();
const routed=[];
let observedChat=null;
function render(){const chat=document.getElementById('paChat');if(!chat)return;chat.querySelectorAll('[data-h38-command-bus-chat]').forEach(node=>node.remove());for(const message of routed.slice(-12)){const bubble=document.createElement('div');bubble.className=`pa-bubble ${message.role}`;bubble.dataset.h38CommandBusChat='1';bubble.textContent=message.body;chat.appendChild(bubble);}chat.scrollTop=chat.scrollHeight;}
async function run(command){const bus=window.H38_ASSISTANT_COMMAND_BUS;if(!bus?.canHandle?.(command))return false;routed.push({role:'user',body:command});render();let answer='';try{answer=await bus.handle(command,{source:'personal-assistant'});}catch(error){answer=`I could not complete that command: ${text(error?.message||error)}`;}routed.push({role:'assistant',body:text(answer)||'I opened the relevant Office workflow.'});render();try{if('speechSynthesis'in window){window.speechSynthesis.cancel();const u=new SpeechSynthesisUtterance(text(answer).slice(0,1200));window.speechSynthesis.speak(u);}}catch(_){}return true;}
document.addEventListener('submit',event=>{const form=event.target;if(!(form instanceof HTMLFormElement)||form.id!=='paCommandForm')return;const command=text(new FormData(form).get('command'));if(!window.H38_ASSISTANT_COMMAND_BUS?.canHandle?.(command))return;event.preventDefault();event.stopImmediatePropagation();form.reset();void run(command);},true);
function syncChatMount(){const chat=document.getElementById('paChat');if(chat===observedChat)return;observedChat=chat||null;if(chat)render();}
new MutationObserver(syncChatMount).observe(document.documentElement,{childList:true,subtree:true});
syncChatMount();
window.H38_ASSISTANT_COMMAND_INPUT=Object.freeze({enabled:true,build:BUILD,run,routedChat:true,specialistDispatch:true,nonRecursiveMountObserver:true});
})();
