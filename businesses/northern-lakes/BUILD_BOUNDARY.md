# Northern Lakes Property Services — Production Build Boundary

## Authority
Build the Northern Lakes Property Services website, Customer Portal, Owner Portal, Business Office, approved image library, and marketing asset system.

## Isolation rule
Northern Lakes may reuse the Highway 38 shared Core only through isolated business configuration and approved shared interfaces. This build must not interrupt or replace the live Highway 38 business system.

Protected Highway 38 production elements:
- production URLs
- Apps Script project and deployment IDs
- authentication and roles
- Highway 38 customer and business data
- external-action approval locks
- customer isolation and proposal security
- production routing and accepted doGet
- rollback and version controls

## Northern Lakes namespace
All Northern Lakes-specific website, configuration, assets, documents, deployment records, and tests belong under `businesses/northern-lakes/` unless a separately reviewed shared-Core change is approved.

## Approved visual source
- Northern Lakes approved logo set
- Northern Lakes approved website page-design sheet
- approved AI Image Library
- owner-approved company photographs

No random stock photography, placeholder substitutions, or unapproved vehicles/equipment.

Approved equipment imagery:
- Chevrolet Duramax trucks
- Boss snow plows

## Current production base
Highway 38 main baseline at build start:
`502de199036e76dfb1fd4eb2c1ede44d78b73b99`

## Build branch
`agent/northern-lakes-production-build`
