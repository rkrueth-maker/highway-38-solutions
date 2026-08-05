(function () {
  'use strict';
  const auth = window.H38_SUPABASE_AUTH;
  if (!auth || typeof auth.getState !== 'function') return;
  const readState = auth.getState.bind(auth);
  auth.getState = function () {
    const result = readState() || {};
    const scopedUserId = window.H38DB?.getUserScope?.() || '';
    const activeBusinessCount = Number(result.activeBusinessCount || 0);
    return {
      ...result,
      userId: scopedUserId || result.userId || '',
      selectedBusinessId: scopedUserId && activeBusinessCount > 0 ? String(result.selectedBusinessId || '') : ''
    };
  };
})();
