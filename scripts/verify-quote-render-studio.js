#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const need=(text,marker,label)=>{if(!text.includes(marker))throw new Error(`Missing ${label}: ${marker}`)};
const reject=(text,marker,label)=>{if(text.includes(marker))throw new Error(`Forbidden ${label}: ${marker}`)};
const scripts=text=>[...text.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(match=>match[1]);

const index=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Index.html');
const client=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Render_Studio_Client.html');
const server=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Render_Studio.gs');
const proposalServer=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Render_Proposal.gs');
const proposal=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Proposal.html');
const mobile=read('apps-script/business-office/BusinessOffice_QuoteBuilder_Mobile_AI_Fix.html');

need(index,"boInclude_('BusinessOffice_QuoteBuilder_Render_Studio_Client')",'Render Studio client include');
if(index.indexOf('BusinessOffice_QuoteBuilder_Render_Studio_Client')<index.indexOf('BusinessOffice_QuoteBuilder_EditExisting_Client'))throw new Error('Render Studio must load after saved-draft editing so it can retain the active quote connection.');
need(mobile,"document.querySelectorAll('.qb-ai-panel').forEach",'duplicate mobile AI panels remain hidden');

need(client,'H38 Render Studio','integrated studio title');
need(client,'Project type','guided project type');
need(client,'Materials and products','material controls');
need(client,'Colors and finishes','color controls');
need(client,'Must remain unchanged','protected-area controls');
need(client,'1 concept','one-concept option');
need(client,'2 concepts','two-concept option');
need(client,'3 concepts','three-concept option');
need(client,'Before — original jobsite photo','before comparison');
need(client,'Proposed concept','proposed comparison');
need(client,"direct('boCreateAiRenderStudioConcept'",'structured concept generation');
need(client,"direct('boApproveAiCompletionVisualForQuote'",'explicit owner attachment');
need(client,'Approve Selected & Attach to Quote','owner approval action');
need(client,"window.H38_QB_ACTIVE_QUOTE_ID",'saved quote connection');
need(client,'Nothing is sent or attached until you explicitly approve a concept.','no automatic attachment boundary');
need(client,'not proof of completed work','concept-only warning');
reject(client,'fetch(','browser fetch in Render Studio photo preparation');
reject(client,'.click()','programmatic picker click in Render Studio');

need(server,'function boCreateAiRenderStudioConcept','Render Studio server entry');
need(server,'boCreateAiCompletionVisual_','existing protected image engine reuse');
need(server,'Create concept ','multiple concept variation');
need(server,'QUOTE SCOPE:','quote scope prompt context');
need(server,'KNOWN DIMENSIONS AND ASSUMPTIONS:','known measurement prompt context');
need(server,'QUOTED WORK AND MATERIAL CONTEXT:','quote-line prompt context');
need(server,'MUST REMAIN UNCHANGED:','preservation prompt');
need(server,'Preserve perspective, dimensions, openings, permanent structures','geometry preservation');
need(server,'function boApproveAiCompletionVisualForQuote','owner attachment server entry');
need(server,"Status:'Owner Approved for Proposal'",'proposal approval status');
need(server,'includeInProposal:true','proposal inclusion flag');
need(server,'quoteVersion:quoteVersion','exact quote-version lock');
need(server,'customerReleaseRequired:true','customer release boundary');
need(server,'proofOfCompletion:false','not-proof boundary');
need(server,'Nothing was sent.','no automatic send confirmation');
need(server,"boProof_('APPROVE AI COMPLETION VISUAL'",'approval proof record');

need(proposalServer,'function boCustomerProposalConcepts','token-scoped customer concept endpoint');
need(proposalServer,'boQuoteCommercialFindByToken_','existing proposal-token validation');
need(proposalServer,'state.share.approvedVersion === quoteVersion','proposal version lock');
need(proposalServer,"['Shared','Viewed']",'customer proposal lifecycle boundary');
need(proposalServer,"row.Status === H38_QB_RENDER_PROPOSAL.APPROVED_STATUS",'owner-approved status filter');
need(proposalServer,'details.includeInProposal !== true','explicit proposal inclusion filter');
need(proposalServer,'details.customerReleaseRequired !== true','customer release filter');
need(proposalServer,'details.proofOfCompletion !== false','not-proof filter');
need(proposalServer,'Number(details.quoteVersion || 0)','concept version comparison');
need(proposalServer,'originalDataUrl:original.dataUrl','private original embedded for customer');
need(proposalServer,'visualDataUrl:visual.dataUrl','private concept embedded for customer');
need(proposalServer,'MAX_IMAGE_BYTES:3145728','bounded proposal images');
need(proposalServer,'return [{','latest single approved concept');

need(proposal,'Proposed completion concept','proposal concept section');
need(proposal,'Before — original jobsite photo','proposal before image');
need(proposal,'Proposed appearance concept','proposal rendered image');
need(proposal,'The written scope and quote lines control the work.','written-scope priority');
need(proposal,'not a measurement, blueprint, engineering approval','proposal concept boundary');
need(proposal,'boCustomerProposalConcepts(token)','customer token concept load');
need(proposal,"boOwnerProposalConcepts(quote['Quote ID'])",'owner preview concept load');
need(proposal,'.concept-card{break-inside:avoid}','print PDF concept protection');
need(proposal,'Download / Print PDF','existing customer PDF control');

scripts(client).forEach(body=>new Function(body));
scripts(proposal).slice(1).forEach(body=>new Function(body));
new Function(server);
new Function(proposalServer);
console.log('PASS — H38 Render Studio uses the existing Quote Builder and image engine with guided concepts, before/after review, explicit owner attachment, exact quote-version locking, token-scoped customer release, and printed proposal inclusion without automatic sending.');
