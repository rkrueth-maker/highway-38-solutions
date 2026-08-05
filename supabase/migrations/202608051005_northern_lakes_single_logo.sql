-- Replace the collection-sheet logo reference with the approved single Northern Lakes diamond mark.
update public.businesses
set brand_config = jsonb_set(
      brand_config,
      '{logoUrl}',
      to_jsonb('https://highway38solutions.com/businesses/northern-lakes/assets/diamond-logo.svg?v=nl-site-portal-20260805'::text),
      true
    ),
    updated_at = now()
where business_key = 'northern-lakes';
