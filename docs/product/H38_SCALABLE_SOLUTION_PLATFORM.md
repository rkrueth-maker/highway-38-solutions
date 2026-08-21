# Highway 38 Scalable Solution Platform

## Decision

Highway 38 will be redesigned as one scalable product platform built from the existing shared Core Engine, Business Pack, Business Office, Quote Builder, and customer-isolation architecture.

The approved H38 logo remains unchanged.

The redesign is not a competing application. It is a product and experience reorganization of the existing reusable platform.

## Product model

### 1. H38 Solution Builder

The customer-facing and contractor-facing problem-solving engine.

Inputs:

- photos
- video
- voice notes
- measurements
- aerial and satellite imagery
- parcel and GIS context
- customer goals
- existing-condition problems

Outputs:

- existing-condition analysis
- concept options
- before-and-after visual concepts
- plan, elevation, section, route, flow, and zone sketches
- preliminary measurements
- material takeoffs
- labor and equipment assumptions
- permit, survey, engineering, licensing, and inspection triggers
- Good / Better / Best options
- conceptual investment ranges
- contractor-ready handoff packages

The Quote Builder remains a module inside the Solution Builder workflow and the full Business Office. It also remains independently packageable from the same shared codebase.

### 2. H38 Business Office

The complete business backend for:

- leads and intake
- customers, contacts, and properties
- files, photos, video, and documents
- concepts, quotes, proposals, and approvals
- vendors and subcontractors
- work orders, jobs, schedules, and change orders
- purchases, materials, expenses, invoices, and payments
- payroll, accounting, and tax-preparation support
- communication history
- users, roles, approvals, Proof Log, Error Log, backups, reporting, and recovery

### 3. H38 Contractor Network

Approval-gated routing of customer-approved concept packages to approved contractors and vendors.

Rules:

- no automatic forwarding
- minimum necessary customer information
- customer or owner authorization
- conceptual-work disclaimer
- vendor performs site verification and final pricing
- no automatic award
- compensation or referral terms disclosed where required
- every handoff logged

### 4. H38 Knowledge Engine

Shared sanitized libraries of:

- project types
- customer problems
- solution patterns
- intake questions
- capture checklists
- measurement methods
- formulas and quantity rules
- material assemblies
- labor and equipment assumptions
- professional-review triggers
- rendering prompts
- proposal sections
- vendor handoff templates
- completed-project lessons and regression cases

Raw customer data, private pricing, proprietary contractor methods, and customer-identifying information remain isolated by business.

## Initial solution-library scope

### Property and outdoor

- landscaping
- drainage
- grading
- sprinkler and irrigation systems
- fences and gates
- gravel, asphalt, and concrete driveways
- culverts
- retaining walls
- patios and walkways
- fire pits and outdoor kitchens
- decks, pergolas, sheds, docks, and shoreline concepts
- snow-management layouts
- tree and brush clearing
- exterior lighting and cameras

### Building and remodeling

- garages, pole buildings, additions, porches
- roofs, siding, windows, and doors
- kitchens, bathrooms, basements, mudrooms, laundry rooms, and closets
- accessibility improvements
- flooring, insulation, moisture correction, and foundation concepts

### Mechanical and utilities

- electrical systems
- HVAC and garage heating
- ventilation and dust collection
- plumbing and water heaters
- wells, water treatment, generators, solar, battery backup, and EV charging
- compressed air, shop utilities, and pumps

### Garage, shop, and industrial

- garage organization
- workbenches and tool storage
- machine placement
- material flow
- welding and CNC cells
- automation and robot cells
- conveyors, guarding, lighting, air lines, dust and fume control
- 5S, receiving, warehouse, and maintenance layouts

### Business problem solving

- intake
- quoting
- scheduling
- job tracking
- purchasing and inventory
- billing and document control
- employee workflows
- approvals
- digital filing
- automation and AI-assisted processes
- dashboards and reporting

## End-to-end record flow

Problem → intake → capture → measurement → concept → sketch → quantities → conceptual estimate → customer selection → approved-vendor request → verified quote → proposal → approval → work order → job → purchasing → completion → invoice → payment → lessons learned.

Information is entered once and reused downstream. Measurements, quantities, assumptions, approvals, and files remain linked to the same project record.

## Pricing architecture

Every price-book item supports:

- low, typical, and high values
- retail, vendor, contractor, and business-specific values
- material, labor, equipment, subcontractor, disposal, delivery, permit, engineering, tax, waste, and contingency components
- geography
- season
- effective and verified dates
- source
- confidence level
- business-private override

Completed projects compare estimated, quoted, purchased, used, invoiced, and actual values to improve future estimates without sharing private business data across installations.

## Measurement architecture

Supported methods:

- tape and laser field measurement
- reference-object photos
- guided photo capture
- narrated walkthrough video
- photogrammetry and 3D reconstruction
- drone imagery where lawful
- satellite and aerial imagery
- GIS and parcel context
- LiDAR and elevation data
- water pressure and flow tests
- thermal imaging
- electrical panel and load survey
- HVAC load survey

Every measurement stores its method, confidence, source, date, and required verification. Satellite-, photo-, or video-derived measurements remain conceptual until verified.

## Website redesign direction

The public website will be rebuilt around the customer journey rather than a flat product catalog.

### Primary website flow

1. See the problem-solving promise.
2. Choose a problem category.
3. View a before / concept / sketch / estimate example.
4. Understand the deliverable.
5. Select Concept Package, Quote Builder, or Complete Business Office.
6. Start with photos, video, address, measurements, or a guided intake.
7. Receive an approval-gated next step.

### Primary navigation

- Solutions
- How It Works
- Examples
- For Contractors
- Business Office
- Pricing
- Start a Project
- Sign In

### Homepage sections

1. Hero: turn a real problem into a visual plan and realistic next step.
2. Interactive problem-category selector.
3. Before → concept → plan → estimate demonstration.
4. Solution categories.
5. Deliverables.
6. Contractor and business pathways.
7. Business Office overview.
8. Sample projects and proof.
9. Good / Better / Best pricing pathways.
10. Trust, approvals, privacy, and professional-review safeguards.
11. Final start-project call to action.

### Image system

Preserve the H38 logo. Replace random imagery with a controlled image system:

- authentic northern Minnesota property and shop context
- existing-condition photos
- matched visual concepts
- plan and measurement overlays
- material and scope cards
- completed-result examples
- no owner photos unless separately approved

Each major category should have a repeatable four-image sequence:

1. Existing problem
2. Concept rendering
3. Planning sketch or mapped overlay
4. Material, scope, and estimate output

## Scalable packaging

- H38 Visual Solution Package
- H38 Quote Builder
- H38 Business Office
- H38 Complete Business System
- H38 Contractor Network participation
- white-label business packs from the same shared core

Modules are enabled by configuration and entitlement, not copied into separate architectures.

## Implementation workstreams

### Workstream A — Library foundation

Create structured shared data for project types, problems, solutions, capture requirements, formulas, materials, labor, professional triggers, rendering prompts, proposal outputs, and sanitized lessons.

### Workstream B — Solution Builder workflow

Connect intake, media capture, property mapping, concepts, quantities, conceptual estimates, approval, and vendor handoff inside the existing Quote Builder and Business Office.

### Workstream C — Product packaging

Define module entitlements and standalone/full-system routes without duplicating code.

### Workstream D — Website redesign

Rebuild the public website flow, navigation, page hierarchy, image system, category pages, examples, pricing paths, and calls to action while preserving the H38 logo and existing approved controls.

### Workstream E — Validation

Validate mobile and desktop, accessibility, customer isolation, approvals, pricing dates, professional triggers, performance, regression tests, production deployment, and rollback evidence.

## Non-negotiable controls

- preserve the approved H38 logo
- preserve shared-core architecture
- preserve customer isolation
- preserve owner approval gates
- do not present conceptual estimates as binding contractor bids
- require licensed or professional verification where applicable
- do not forward customer information without authorization
- log privileged access, handoffs, approvals, and changes
- keep external actions disabled until explicitly approved
