/** Ordered Business Office client manifest. Keep one deterministic include list. */
var H38_BO_CLIENT_MANIFEST = [
  'BusinessOffice_UX_Client',
  'BusinessOffice_QuoteBuilder_Client',
  'BusinessOffice_Unified_Client',
  'BusinessOffice_QuoteBuilder_Completion',
  'BusinessOffice_QuoteBuilder_AI_Visual_Client',
  'BusinessOffice_Equipment_Client',
  'BusinessOffice_Polish_Client',
  'BusinessOffice_AI_Assistant_Client',
  'BusinessOffice_Logo_Client'
];

function boRenderClientIncludes_() {
  const seen = {};
  return H38_BO_CLIENT_MANIFEST.map(function (fileName) {
    boAssert_(!seen[fileName], 'Duplicate Business Office client include: ' + fileName);
    seen[fileName] = true;
    return boInclude_(fileName);
  }).join('');
}
