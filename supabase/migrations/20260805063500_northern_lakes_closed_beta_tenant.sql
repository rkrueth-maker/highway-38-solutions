-- Provision the approved Northern Lakes closed-beta tenant through the reusable
-- Supabase installer. This creates isolated Supabase records only.
-- It does not import Google records, send an invitation, change Apps Script,
-- activate external actions, or activate the tenant automatically.

do $$
declare
  v_platform_owner uuid;
  v_result jsonb;
begin
  select membership.auth_user_id
    into v_platform_owner
  from public.business_memberships membership
  join public.businesses business on business.id = membership.business_id
  where business.business_key = 'highway38'
    and business.status = 'active'
    and membership.role = 'owner'
    and membership.status = 'active'
    and membership.auth_user_id is not null
  order by membership.accepted_at nulls last, membership.created_at
  limit 1;

  if v_platform_owner is null then
    raise exception 'The active Highway 38 Owner membership is required before provisioning Northern Lakes.';
  end if;

  v_result := private.provision_client_business_internal(
    v_platform_owner,
    'northern-lakes',
    'Northern Lakes Property Maintenance LLC',
    'Northern Lakes Property Maintenance LLC',
    'northernlakesproperty@gmail.com',
    'America/Chicago',
    jsonb_build_object(
      'currency', 'USD',
      'industryPack', 'property-maintenance',
      'industryPacks', jsonb_build_array('property-maintenance', 'snow-removal', 'lawn-care', 'grading'),
      'logoUrl', 'https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.svg?v=rendered-photo-pass-20260726',
      'primaryColor', '#113b2e',
      'secondaryColor', '#f4efe5',
      'accentColor', '#9a632f',
      'neutralColor', '#20221f',
      'publicEmail', 'northernlakesproperty@gmail.com',
      'publicPhone', '+1-218-326-2506',
      'websiteUrl', 'https://highway38solutions.com/businesses/northern-lakes/',
      'ownerLoginUrl', 'https://highway38solutions.com/businesses/northern-lakes/owner-login.html',
      'customerPortalUrl', 'https://highway38solutions.com/businesses/northern-lakes/customer-portal.html'
    ),
    array[
      'today', 'customers', 'jobs', 'tasks', 'quotes', 'measure', 'schedule',
      'communications', 'field', 'daily-logs', 'checklists', 'time',
      'inventory', 'fleet', 'money', 'documents', 'social', 'ai', 'settings',
      'people', 'accounting', 'payroll-prep', 'tax-prep', 'controls', 'reports',
      'storage-providers'
    ],
    'northern-lakes-closed-beta',
    'mandakw55@gmail.com'
  );

  if coalesce(v_result ->> 'status', '') <> 'PASS' then
    raise exception 'Northern Lakes provisioning did not return PASS.';
  end if;

  update public.businesses
     set module_config = module_config || jsonb_build_object(
       'betaBusiness', true,
       'betaStage', 'closed',
       'publicIntakeEnabled', true,
       'customerPortalReleaseEnabled', false,
       'directPaymentProcessing', false,
       'directPayrollFunding', false,
       'directTaxFiling', false,
       'bulkMessagingEnabled', false,
       'automaticTriggersEnabled', false,
       'ownerApprovalRequired', true,
       'legacyGoogleOffice', jsonb_build_object(
         'status', 'rollback-only',
         'deploymentId', 'AKfycbzQVvg-1E0ofK5QuBseKjTdJ5NhEjtArvbHxVCO_W329BbZxfSO0F6ENJd5zgvMLGaL',
         'changedByThisMigration', false
       )
     ),
         updated_at = now()
   where business_key = 'northern-lakes';

  insert into public.business_records (
    business_id, collection, record_key, payload, created_by, updated_by
  )
  select
    business.id,
    'setupChecklist',
    'NORTHERN-LAKES-CLOSED-BETA-LAUNCH',
    jsonb_build_object(
      'Setup Checklist ID', 'NORTHERN-LAKES-CLOSED-BETA-LAUNCH',
      'Business ID', business.id::text,
      'Title', 'Northern Lakes closed beta launch',
      'Status', 'Ready for activation',
      'Owner Email', 'northernlakesproperty@gmail.com',
      'Implementation Account', 'highway38solutions@gmail.com',
      'Storage Provider', 'Supabase private storage',
      'Google Drive Deferred', true,
      'Google Records Imported', false,
      'Legacy Google Office', 'Rollback only',
      'External Actions Enabled', false,
      'Steps', jsonb_build_array(
        'Activate tenant after database and browser acceptance',
        'Owner requests the secure invitation email',
        'Owner opens the link on the same device and signs in',
        'Install the Office on Android and Chromebook',
        'Invite one real staff account',
        'Complete one real customer-to-invoice-draft workflow',
        'Run sign-out and cross-tenant isolation acceptance'
      ),
      'Created Time', now(),
      'Updated Time', now(),
      'Record Version', 1
    ),
    v_platform_owner,
    v_platform_owner
  from public.businesses business
  where business.business_key = 'northern-lakes'
  on conflict (business_id, collection, record_key) do update
    set payload = excluded.payload,
        record_status = 'active',
        updated_at = now();

  insert into public.business_proof_log (
    business_id, actor_user_id, action_type, entity_type, entity_id,
    result, details, external_action_occurred
  )
  select
    business.id,
    v_platform_owner,
    'NORTHERN_LAKES_CLOSED_BETA_PROVISIONED',
    'Business',
    business.id,
    'PASS',
    jsonb_build_object(
      'businessKey', 'northern-lakes',
      'businessStatus', business.status,
      'ownerInvitationPrepared', true,
      'invitationEmailSent', false,
      'storageProvider', 'supabase',
      'googleDriveDeferred', true,
      'googleDataImported', false,
      'legacyGoogleOfficePreserved', true,
      'appsScriptChanged', false,
      'externalActionsEnabled', false,
      'automaticActivation', false
    ),
    false
  from public.businesses business
  where business.business_key = 'northern-lakes';
end
$$;
