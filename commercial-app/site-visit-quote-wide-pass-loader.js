(function(){
'use strict';
const BUILD='20260825-site-visit-quote-wide-pass-loader-19-phone-authority';
const PREVIOUS_BUILD='20260824-site-visit-quote-wide-pass-loader-18-quote-agent';
const LEGACY_REVISION_BUILD='20260823-site-visit-quote-wide-pass-loader-16-revision';
const ASSET_BUILD='20260825-phone-authority-polish-1';
const REVISION_ASSET_BUILD='20260823-quote-revision-polish-1';
const PREVIOUS_ASSET_BUILD='20260824-quote-agent-walkthrough-acceptance-1';
const LEGACY_ASSET_BUILD='20260823-quote-reproduction-polish-2';
const PREVIOUS_REGRESSION_BUILD='20260823-quote-regression-runner-3-base-draft-isolation';
const LEGACY_REGRESSION_BUILD='20260823-quote-regression-runner-1';
const LEGACY_SPOKEN_BUILD='20260823-spoken-measurement-authority-final-1';
const LEGACY_DEEP_POLISH_BUILD='20260823-site-visit-deep-polish-1';
// RETIRED POLICY MARKER ONLY: spokenDimensionsDefaultVerified:true
if(window.H38_SITE_VISIT_QUOTE_WIDE_PASS_LOADER)return;
window.H38_ASSET_BUILD=ASSET_BUILD;
document.documentElement.dataset.h38AssetBuild=ASSET_BUILD;
const scripts=[
  ['./quote-runtime-authority.js','20260822-quote-runtime-authority-2-machine','H38_QUOTE_RUNTIME_AUTHORITY'],
  ['./site-visit-quote-handoff-final.js','20260822-site-visit-quote-handoff-final-5-machine','H38_FIELD_VISIT_QUOTE_HANDOFF'],
  ['./measurement-verification-final.js','20260821-measurement-verification-final-1','H38_MEASUREMENT_VERIFICATION_FINAL'],
  ['./site-visit-work-dedupe-final.js','20260822-site-visit-work-dedupe-final-8-phone','H38_SITE_VISIT_WORK_DEDUPE_FINAL'],
  ['./site-visit-identity-write-fence-final.js','20260821-site-visit-identity-write-fence-final-1','H38_SITE_VISIT_IDENTITY_WRITE_FENCE_FINAL'],
  ['./job-followup-idempotency-final.js','20260821-followup-idempotency-final-1','H38_JOB_FOLLOWUP_IDEMPOTENCY_FINAL'],
  ['./quote-action-picture-final.js','20260821-quote-action-picture-final-1','H38_QUOTE_ACTION_PICTURE_FINAL'],
  ['./quote-direction-options.js','20260821-quote-direction-options-1','H38_QUOTE_DIRECTION_OPTIONS'],
  ['./site-visit-wide-acceptance-final.js','20260821-site-visit-wide-acceptance-final-3-phone','H38_SITE_VISIT_WIDE_ACCEPTANCE_FINAL'],
  ['./spoken-measurement-authority-final.js','20260825-spoken-measurement-authority-final-2-persisted-only','H38_SPOKEN_MEASUREMENT_AUTHORITY_FINAL'],
  ['./quote-reproduction-authority.js','20260823-quote-reproduction-authority-1','H38_QUOTE_REPRODUCTION_AUTHORITY_BOOT'],
  ['./quote-revision-authority.js','20260823-quote-revision-authority-1','H38_QUOTE_REVISION_AUTHORITY'],
  ['./site-visit-deep-polish.js','20260825-site-visit-deep-polish-3-phone','H38_SITE_VISIT_DEEP_POLISH'],
  ['./quote-rerender-source-picker.js','20260823-quote-rerender-source-picker-1','H38_QUOTE_RERENDER_SOURCE_PICKER'],
  ['./quote-historical-assets-polish.js','20260823-quote-historical-assets-polish-1','H38_QUOTE_HISTORICAL_ASSETS_POLISH'],
  ['./quote-regression-runner.js','20260823-quote-regression-runner-3-base-draft-isolation','H38_QUOTE_REGRESSION_RUNNER'],
  ['./quote-agent-contract.js','20260824-quote-agent-contract-1','H38_QUOTE_AGENT_CONTRACT']
];
function load(entry){return new Promise((resolve,reject)=>{const[path,build,global]=entry;if(window[global])return resolve();const existing=document.querySelector(`script[data-h38-wide-pass="${global}"]`);if(existing){existing.addEventListener('load',resolve,{once:true});existing.addEventListener('error',reject,{once:true});return;}const script=document.createElement('script');script.src=`${path}?build=${build}`;script.async=false;script.dataset.h38WidePass=global;script.addEventListener('load',resolve,{once:true});script.addEventListener('error',()=>reject(new Error(`Could not load ${path}`)),{once:true});document.head.appendChild(script);});}
async function boot(){for(const entry of scripts){try{await load(entry);}catch(error){console.error('[H38 wide pass loader]',error);}}window.dispatchEvent(new CustomEvent('h38:site-visit-quote-wide-pass-ready',{detail:{build:BUILD,assetBuild:ASSET_BUILD}}));}
window.H38_SITE_VISIT_QUOTE_WIDE_PASS_LOADER=Object.freeze({enabled:true,build:BUILD,previousBuild:PREVIOUS_BUILD,legacyRevisionBuild:LEGACY_REVISION_BUILD,assetBuild:ASSET_BUILD,revisionAssetBuild:REVISION_ASSET_BUILD,previousAssetBuild:PREVIOUS_ASSET_BUILD,legacyAssetBuild:LEGACY_ASSET_BUILD,previousRegressionBuild:PREVIOUS_REGRESSION_BUILD,legacyRegressionBuild:LEGACY_REGRESSION_BUILD,legacySpokenBuild:LEGACY_SPOKEN_BUILD,legacyDeepPolishBuild:LEGACY_DEEP_POLISH_BUILD,scripts:scripts.map(([path,build,global])=>({path,build,global})),legacyLoadsFirst:true,finalAuthoritiesLoadSequentially:true,sharedQuoteRepairMachine:true,reproductionAuthorityLoadsBeforeCanonicalAgent:true,canonicalQuoteAgentLoadsLast:true,legacyQuoteWrappersCannotRetakeAuthority:true,allQuotesShareRepairMachine:true,historicalQuotesShareRepairMachine:true,savedQuoteEvidenceHydration:true,savedImagesReused:true,ownerActionStartsMachine:true,spokenDimensionsDefaultVerified:false,spokenDimensionsRequirePersistedOperatorVerification:true,persistedVerifiedMeasurementsAreFieldAuthority:true,spokenDimensionsAreFieldAuthority:false,zeroSavedMeasurementsCannotDisplayVerifiedWalkthroughCandidate:true,customerSiteVisitContinuationsGrouped:true,customerGroupingIsPresentationOnly:true,explicitUncertaintyKeepsSpokenDimensionUnverified:true,deviceMeasurementsRemainSeparateAuthority:true,contentChangeOnlyQuoteRevisions:true,immutableQuoteRevisionSnapshots:true,internalPrebuildDoesNotBumpRevision:true,changedSaveCreatesRevision:true,changedSendCreatesRevision:true,unchangedSaveKeepsRevision:true,historicalRerenderSourcePicker:true,historicalPublicAssetsCanBecomePrivateActionPictures:true,quoteFilesHistoricalReferences:true,planReferencesNotMisrepresentedAsCad:true,noAutomaticRerenderImageSelection:true,automaticDraftRepair:true,automaticFailureRecovery:true,automaticMeasurementHydration:true,automaticDirectionsAfterBaseDraft:true,directionsDoNotBlockBaseQuote:true,siteVisitIdentityAuthority:true,linkedQuoteIdentityWriteFence:true,unifiedWideAcceptanceAuthority:true,physicalPhoneRepair:true,measurementStateHydration:true,cameraEstimateSupersession:true,canonicalQuoteReopen:true,canonicalQuoteHandoff:true,lateJobsAliasReconciliation:true,localSnapshotAliasSuppression:true,poisonedLocalDatasetSuppression:true,boundedQuoteDraftResponse:true,savedActionPictureRenderAuthority:true,takeAnotherActionPhoto:true,offlineEvidenceRecovery:true,staleAudioRetryQuarantine:true,quoteRegressionRunner:true,quoteRegressionCleanVsFallbackVisible:true,quoteRegressionBulkDirectionsSuppressed:true,legacyManualRenderGateBypassed:true,savedBaselineDeterministic:true,providerTimeoutCannotBreakSavedBaseline:true,quoteFingerprint:true,visualQuantityManifest:true,tradeAppropriateVisualMode:true,automaticApproval:false,automaticCustomerSending:false,automaticPurchase:false,automaticPayment:false,automaticScheduling:false});
void boot();
})();
