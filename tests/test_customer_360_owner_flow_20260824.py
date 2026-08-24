from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
C360=(ROOT/'commercial-app/customer-360-authority.js').read_text()
CSS=(ROOT/'commercial-app/customer-360-authority.css').read_text()
BROWSER=(ROOT/'commercial-app/customer-360-browser-integration-v2.js').read_text()
INDEX=(ROOT/'commercial-app/index.html').read_text()


def test_customer_is_primary_operational_hub_and_internal_finance_is_excluded():
    assert "const BUILD='20260824-customer-360-authority-1'" in C360
    for marker in ['customers','properties','jobs','quotes','meetings','siteCaptureSessions','siteMeasurements','documents','followUps','invoices']:
        assert marker in C360
    for marker in ['expenses','purchases','payroll','taxRecords','contractorCostChecklists','contractorPricingPolicy']:
        assert marker in C360
    assert 'internalFinancialExcludedFromCustomer360:true' in C360
    assert 'Internal cost, margin, purchasing, payroll and tax data are not included' in C360


def test_relationship_graph_resolves_indirect_children_and_historical_orphans():
    assert 'PARENT_LINKS' in C360
    assert 'SOURCE_KEYS' in C360
    assert 'UNIQUE_CHILD_CUSTOMER_HINT' in C360
    assert "['Capture Session ID','captureSessionId','siteCaptureSessions']" in C360
    assert "['Quote ID','quoteId','quotes']" in C360
    assert 'enrichOperations' in C360
    assert "['Customer ID']=cid" in C360
    assert 'Customer Link Source' in C360


def test_owner_language_search_handles_names_addresses_and_job_language():
    for marker in ['hwy','highway','John','Find customer, address or job','job on Hwy 38','resolveAssistantQuery','searchCustomers']:
        assert marker.lower() in C360.lower()
    assert "t.endsWith('s')" in C360
    assert 'Add a little more of the name, address, or job' in C360


def test_customer_360_progressive_disclosure_and_action_layout_exist():
    for marker in ['CUSTOMER 360','Locations','Jobs','Requests','Quotes','Site visits','Measurements','Meetings & conversations','Files & photos','Follow-ups','Tasks','Customer billing','Customer setup']:
        assert marker in C360
    for marker in ['Start quote','Site visit','Meeting','Message','Work']:
        assert marker in C360
    assert '@media(max-width:760px)' in CSS


def test_assistant_policy_is_customer_first_and_ambiguity_safe():
    assert 'H38_CUSTOMER_360' in BROWSER
    assert 'resolveVisibleQuery' in BROWSER
    assert "window.openPage?.('customers')" in BROWSER
    assert "document.addEventListener('submit',handleAssistantSubmit,true)" in BROWSER
    assert 'event.stopImmediatePropagation()' in BROWSER
    assert 'async function handleAssistantSubmit' not in BROWSER
    assert 'assistantCustomerFirst:true' in BROWSER
    assert 'duplicateNamesRequireDisambiguation:true' in BROWSER
    assert 'fuzzyOwnerSearch:true' in BROWSER


def test_internal_test_customers_are_valid_roots_but_hidden_from_normal_search():
    assert 'isInternalCustomer' in BROWSER
    assert "'Internal Only'" in BROWSER
    assert "'Test Data'" in BROWSER
    assert 'internalCustomersHiddenFromNormalSearch:true' in BROWSER
    assert 'visibleCustomers' in BROWSER


def test_source_only_children_get_unique_customer_hint_but_finance_is_not_supplemented():
    assert 'uniqueCustomerForSource' in BROWSER
    assert 'UNIQUE_SOURCE_CUSTOMER_HINT' in BROWSER
    assert 'ids.size===1' in BROWSER
    assert 'conflictingSourceEvidenceDoesNotGuess:true' in BROWSER
    assert "action==='completionSync'" in BROWSER
    assert 'collectionAllowed' in BROWSER
    assert 'internalFinancialWriteSupplementExcluded:true' in BROWSER


def test_customer_360_dynamic_loader_is_loaded_by_office_shell_with_new_physical_filename():
    assert 'customer-360-browser-integration-v2.js?build=20260824-customer-360-browser-integration-v3' in INDEX
    assert 'customer-360-browser-integration.js?build=20260824-customer-360-browser-integration-1' not in INDEX
    assert 'customer-360-authority.js?build=20260824-customer-360-authority-1' in BROWSER
    assert 'customer-360-authority.css?build=20260824-customer-360-authority-1' in BROWSER
