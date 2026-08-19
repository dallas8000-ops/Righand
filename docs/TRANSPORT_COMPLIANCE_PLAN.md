# Transport Compliance Expansion Plan

Research date: 2026-08-19

## Goal

Expand RigHand from a mainly US trucking expense and fleet app into a transport compliance assistant for Uganda, Kenya, Rwanda, and the EU region. The app should let an operator select a country or region, upload related documents, and receive jurisdiction-specific compliance guidance, missing-record prompts, and operational checklists.

This feature is an operational compliance assistant, not legal advice. Each rule pack should link to official sources and record the date it was reviewed.

## Non-Negotiable Product Guardrails

- Do not remove or degrade existing RigHand functions: expense tracking, income tracking, receipt capture, offline storage, sync queue, reports, IFTA/tax views, trip tracking, load packets, maintenance automation, HOS clocks, fleet dispatch, GPS sharing, subscriptions, admin controls, theme support, voice capture, and mobile/Capacitor behavior must keep working.
- Country or region selection must change the app's behavior, not only its text. The selected jurisdiction should drive required fields, document checklists, warning rules, route prompts, driver/vehicle compliance cards, upload matching, and future dispatch-readiness alerts.
- Compliance additions must improve the day-to-day UI/UX. They should reduce driver/dispatcher uncertainty, surface the next required action, and fit into existing workflows for loads, vehicles, drivers, trips, expenses, reports, and fleet dispatch.
- New compliance UI must be additive and contextual. Avoid replacing the existing dashboard with a legal document library; use checklists, status cards, upload findings, and workflow prompts that help users complete transport work faster.
- Existing US-oriented features should remain available. Where a field is US-specific, such as IFTA state fuel tracking, the app should either preserve it for US-style use or adapt labels/options based on the selected jurisdiction without deleting historical data.
- Do not hardcode numeric axle-load limits, special-load thresholds, or COMESA Yellow Card implementation status as permanent law. These vary by country and change over time, so the app should store verified source references, review dates, and editable profile fields instead of frozen constants.

## Region Selection Behavior

When the user selects a region, the app should update:

- compliance checklist groups
- document upload matching rules
- required driver fields
- required vehicle fields
- route and border prompts
- editable country-specific axle/load source references
- COMESA Yellow Card or equivalent cross-border insurance evidence
- inspection, permit, and licence expiry alerts
- load packet compliance prompts
- fleet/dispatcher compliance summary cards
- terminology, such as state, country, border post, operator licence, community licence, PSV, tachograph, weighbridge, customs bond, or seal number

The app should remember the selected jurisdiction per user or fleet and allow different vehicles/routes to carry different jurisdiction profiles where needed.

## Confirmed Source Baseline

### Uganda

Official Uganda sources confirmed or supplied for planning:

- Uganda Ministry of Works and Transport policies and regulations page.
- The Roads (Vehicle Dimensions, Vehicle Load Control and Enforcement Measures) Regulations 2026, posted by MoWT on 2026-07-24.
- The Roads (Management of Public Roads) Regulations, 2026, posted by MoWT on 2026-07-24.
- The Roads (Ferry Development and Management) Regulations 2026, posted by MoWT on 2026-07-24.
- MoWT eServices: Operator Licence, Driving Licence, Driving School Licence, Motor Vehicle Inspection, Manufacturer's Licence, vehicle inspection booking retrieval, payment/application tracking.
- MoWT/UNRA Special Load Permit System.
- Uganda Traffic and Road Safety laws and regulations category, including 2023 amendments for safety belts, prohibited drugs/alcohol limits, post-crash emergency care, goods-vehicle and PSV driver tests, driving schools/instructors, digital networks, demerit points, and appeals.
- Parliament of Uganda report dated 2026-07-21: MoWT proposed electronic clocking-in/monitoring for PSV drivers after July 2026 crashes.
- User-supplied Parliament of Uganda Traffic and Road Safety (Amendment) Bill, 2026, dated 2026-03-27, including proposed restrictions on importing motor vehicles more than 13 years old and environmental levy changes.

Uganda must be treated as a high-priority jurisdiction because the 2026 accident-response material affects driver monitoring, PSV compliance, vehicle verification, mechanical condition, and enforcement workflows.

### Kenya

Confirmed official-source areas:

- National Transport and Safety Authority (NTSA): operator licensing, driver licensing, inspection, road-safety services.
- Kenya Revenue Authority (KRA): customs, iCMS, cargo/import/export documentation, PIN/TCC verification, case-status checking, and online service validation.
- Kenya Law should be used for current Traffic Act and NTSA Act text, but some PDFs/pages may require manual download because automated extraction can be blocked.
- Kenya National Highways Authority / road agencies should be used for axle-load and weighbridge rules; some pages may require manual review because automated extraction was blocked.

### Rwanda

Confirmed official-source areas:

- Rwanda Revenue Authority and Rwanda Trade Portal: import, export, transit, customs services, tariff/procedure guidance, motor vehicle levy for road maintenance, tax clearance, Electronic Single Window, and procedure/form repositories.
- Rwanda National Police traffic safety, Rwanda Transport Development Agency, and RURA should be reviewed for driver, vehicle, road-safety, and transport-service licensing rules. Some official pages may rate-limit automated extraction, so manual review may be needed.

### East African Community Overlay

Confirmed official-source areas:

- EAC Customs Union objectives include harmonised customs documentation, customs regulations, and procedures.
- EAC Acts and customs documents include the East African Community Customs Management Act and amendments.
- EAC Trade Information Portal and customs tools should be linked for cross-border cargo movement.
- COMESA Yellow Card or equivalent cross-border third-party insurance evidence should be treated as editable evidence because digitization and country participation/status may change.

This overlay should apply when routes cross Uganda, Kenya, Rwanda, or other EAC borders.

### EU Region

Confirmed official-source areas:

- Regulation (EC) No 561/2006: driving time, breaks, daily rest, weekly rest, weekly and fortnightly driving limits.
- Regulation (EU) No 165/2014: tachographs, driver cards, manual entries, downloads, smart tachograph obligations.
- Directive 2002/15/EC: mobile road-transport working time, including 48-hour average working week, possible 60-hour week where the average remains 48 hours over four months, breaks after six hours, and night-work limits.
- Directive 96/53/EC and amendments: weights and dimensions for heavy-duty vehicles.
- Mobility Package I: posting rules, market rules, cabotage, driving/rest updates, enforcement, IMI/posting declarations, evidence of cabotage operations, and cooling-off periods.
- Dangerous goods should be based on ADR / UNECE and EU dangerous-goods guidance.

## Uganda Product Requirements

Uganda should have the richest initial pack.

### Vehicle and Load Control

Track and validate:

- vehicle registration
- motor vehicle inspection status
- vehicle age and import/levy flags after the 2026 Bill is manually reviewed
- vehicle dimensions
- gross vehicle mass
- axle-load records
- verified source/date for the current country-specific axle/load limit or enforcement threshold
- weighbridge tickets
- overload notices
- special-load permits
- route approvals where needed
- road-use or enforcement notices

### Driver and PSV Safety

Track and validate:

- driver licence validity
- driver accreditation or authorisation where applicable
- goods-vehicle or PSV driver test requirements
- driver medical examination status, including vision and colour-blindness where applicable
- driver clock-in / journey records
- driving hours within 24 hours
- rest periods
- speeding and trip accountability signals
- fatigue risk flags
- demerit-point notices
- alcohol/drug compliance notices

### Bus, School Bus, and PSV Checks

Track and validate:

- vehicle licence verification
- accredited driver assignment
- mechanical condition / defect records
- safety-belt compliance
- school-bus standardisation checklist once exact rules are confirmed
- incident and post-crash emergency-care records
- night-travel risk prompts if required by future rules or guidance

### Customs and Cross-Border

Track and validate:

- URA customs entries
- cargo manifests
- transit/bond references
- seal numbers
- border-crossing dates
- EAC customs documents

## Kenya Product Requirements

Kenya should focus on NTSA operating compliance, road safety, vehicle inspection, axle/load control, and KRA customs readiness.

### Operator and Driver Compliance

Track and validate:

- NTSA operator or transport service credentials after manual source confirmation
- driver licence class and expiry
- driver assignment to vehicle/load
- inspection or road-safety notices
- insurance and registration documents
- traffic offence or enforcement notices
- driver/vehicle verification references where available

### Vehicle and Load Compliance

Track and validate:

- vehicle registration
- inspection status
- roadworthiness records
- gross weight and axle-load records
- verified source/date for the current country-specific axle/load limit or enforcement threshold
- weighbridge tickets
- overload notices and penalties
- abnormal-load permits where required
- route or corridor restrictions after official source confirmation

### Customs and Cargo Compliance

Track and validate:

- KRA PIN and tax compliance certificate references where relevant to business operations
- KRA/iCMS customs entries
- import/export declarations
- cargo manifests
- bond references
- seal numbers
- border crossing and release dates
- advance cargo declaration references when applicable

## Rwanda Product Requirements

Rwanda should focus on vehicle/driver road-safety records, transport service authorisation, RRA customs, trade-portal procedures, and EAC transit readiness.

### Driver, Vehicle, and Operator Compliance

Track and validate:

- driver licence validity
- vehicle registration
- roadworthiness or inspection records after official source confirmation
- transport-service authorisation or RURA/RTDA references after manual review
- insurance records
- traffic enforcement or road-safety notices
- motor vehicle levy for road maintenance where applicable

### Customs and Transit Compliance

Track and validate:

- RRA customs entries
- Electronic Single Window references
- Rwanda Trade Portal import/export/transit procedure requirements
- tax clearance references where relevant
- import/export permits
- transit declarations
- seal numbers
- border crossing and release dates
- cargo documents listed by Rwanda Trade Portal procedure/form repositories

## EAC Cross-Border Product Requirements

The EAC layer should turn on when a route crosses Uganda, Kenya, Rwanda, or another EAC partner state.

Track and validate:

- origin country, destination country, and transit countries
- border posts and crossing dates
- customs declaration numbers
- COMESA Yellow Card or equivalent cross-border insurance references
- regional customs bond or national bond references
- cargo manifest and seal numbers
- EAC customs procedure documents
- import/export permits required by commodity
- axle-load / weighbridge records across corridors
- verified source/date for country-specific axle/load limits on each corridor segment
- special-load or abnormal-load permits where countries require them
- one-stop border post readiness notes where applicable

## EU Product Requirements

The EU pack should be more rules-engine heavy because many requirements are time-window, document-evidence, and tachograph based.

### Driver Time, Rest, and Working Time

Track and validate:

- daily driving time, normally 9 hours with allowed extensions where applicable
- weekly and fortnightly driving totals
- 45-minute break after 4.5 hours of driving, including split-break cases
- daily rest and reduced daily rest
- weekly rest and reduced weekly rest compensation
- mobile-worker working time, including 48-hour average and 60-hour maximum condition
- night-work limits
- periods of availability and other work

### Tachograph and Driver Card

Track and validate:

- tachograph download files
- driver card data and expiry
- manual entries
- missing days
- calibration/inspection evidence
- smart tachograph obligations
- vehicle mass threshold, including light commercial vehicle international transport changes from 2026 where applicable

### Market Access, Cabotage, and Posting

Track and validate:

- community licence / operator authority
- incoming international carriage evidence
- cabotage operation count and dates
- 7-day cabotage period
- 4-day cooling-off period
- proof of operations carried out before the international carriage when needed
- posting declarations through the EU posting declaration portal / IMI interface
- documents requested by Member State authorities

### Vehicle, Load, and Dangerous Goods

Track and validate:

- weights and dimensions under Directive 96/53/EC and amendments
- oversize/overweight permit evidence where national rules require it
- ADR dangerous goods transport document
- UN number / hazard class fields
- driver ADR certificate
- placarding and safety equipment checklist

## Data Model Proposal

Add a compliance layer that can operate before full backend AI is available.

Core objects:

- `Jurisdiction`: code, name, region, regulator, official portal.
- `RegulationSource`: jurisdiction, title, citation, URL, effective date, review date, status.
- `ComplianceRule`: source, topic, summary, applicability, required fields, keywords, severity, actions.
- `ComplianceDocument`: file metadata, extracted text, jurisdiction, document type, linked driver/vehicle/load/fleet, scan result.
- `ComplianceFinding`: document, rule, status, confidence, missing fields, action required.
- `DriverComplianceProfile`: licences, accreditations, medical exams, driver clock-in/rest records.
- `VehicleComplianceProfile`: registration, inspection, dimensions, age/import flags, special permits, mechanical defects.
- `RouteComplianceProfile`: countries, borders, permits, customs documents, load-control checks.

## AI Upload Flow

1. User selects jurisdiction: Uganda, Kenya, Rwanda, EU, or EAC cross-border.
2. User uploads a document: permit, licence, vehicle inspection, customs entry, weighbridge ticket, tachograph file, trip sheet, accident report, PSV record, etc.
3. App extracts basic text and metadata.
4. App classifies the document type.
5. App matches keywords and fields against the selected jurisdiction's rules.
6. App shows findings:
   - matched rules
   - missing fields
   - expiry dates
   - driver/vehicle/load linkage
   - recommended next action
7. App saves the document and findings to the backend for live accounts, with local fallback for demo/offline use.
8. Text and selectable-text PDF uploads are classified immediately. Image uploads are stored as OCR-required until an OCR service is connected.

## UX Proposal

Add a `Compliance` tab with four sections:

- `Jurisdiction`: country/region selector and active official-source summary.
- `Documents`: upload and scan documents.
- `Checklist`: rule cards grouped by driver, vehicle, load, route, customs, incident.
- `Findings`: missing/expired/problem items ranked by urgency.

Uganda-specific dashboard cards:

- PSV driver monitoring readiness.
- Vehicle inspection and licence status.
- Load-control and special-permit readiness.
- Driver medical / accreditation status.
- Accident-response and post-crash records.

## Implementation Phases

### Current Build Status

Implemented as of 2026-08-19:

- Static Uganda, Kenya, Rwanda, EAC, and EU frontend rule packs.
- Compliance tab with jurisdiction selector, official-source links, checklist cards, upload findings, and local fallback storage.
- Backend compliance document and finding tables created through the existing unmanaged-table schema bootstrap.
- Authenticated compliance API endpoints for summary, document list/create/detail/delete.
- Server-side multipart upload path for text files and selectable-text PDFs.
- Backend keyword classifier aligned with the selected jurisdiction.
- Deterministic structured extraction for dates, permit/reference IDs, vehicle plates, seal numbers, weights, driver names, and border posts.
- Review alerts for expired/soon-expiring extracted dates and weight records that are not linked to vehicle IDs.
- Frontend upload now tries backend extraction first for live accounts, then falls back to local filename/text scanning when offline or in demo mode.
- Compliance findings panel shows extracted fields from uploaded backend-scanned documents.
- Load Packets now show a jurisdiction-specific trip compliance readiness panel, so the selected region affects dispatch workflow context.
- Driver, vehicle, and route compliance profiles now persist through the backend for live accounts with local fallback in demo/offline mode.
- Compliance tab now includes reusable profile capture cards, so selected-region readiness can live outside a single uploaded document.
- Latest extracted upload fields can prefill driver, vehicle, and route profile forms, and stale profiles can be removed from the Compliance tab.
- Backend summary API now returns selected-jurisdiction profile counts and fleet dispatch readiness alerts.
- Compliance tab now shows fleet dispatch readiness rollups, and load packet cards surface selected-region compliance warnings before dispatch.
- Compliance summary now returns a dispatch policy, and load packet release is blocked when critical compliance findings are open.
- Load Packets now show a cross-border customs or EU movement-evidence checklist when EAC/EU is selected or route evidence exists.

Still pending:

- OCR service for images and scanned PDFs.
- AI-assisted extraction beyond deterministic patterns, including confidence scoring and document-specific review.
- Fleet/team rollups beyond the current per-user profile and finding summary.
- Admin-configurable dispatch policy rules beyond the current critical-finding hard block.

### Phase 1: Planning Lock

- Manually review the Uganda Traffic and Road Safety (Amendment) Bill, 2026 PDF.
- Manually review the Uganda 2026 Roads vehicle dimensions/load-control PDF.
- Manually review the Uganda 2026 public-roads management PDF.
- Confirm Kenya Traffic Act / NTSA Act current sources.
- Confirm Rwanda transport licensing and road-safety sources.
- Confirm EU ADR dangerous-goods source path.

### Phase 2: Frontend MVP

- Status: complete for the first release slice.
- Add static, versioned jurisdiction rule packs.
- Add Compliance tab to Dashboard.
- Add country/region selector.
- Add upload flow with basic text extraction and keyword/rule matching.
- Add Uganda high-priority checklist groups.
- Persist selected jurisdiction and scans locally.
- Surface selected-region compliance in the Load Packets workflow.

### Phase 3: Backend Persistence

- Status: partially complete.
- Completed: compliance document/finding models and tables.
- Completed: reusable driver, vehicle, and route profile persistence through a generic compliance profile table.
- Completed: API endpoints for compliance summaries, document uploads, persisted scan findings, list/detail/delete.
- Completed: API endpoints for compliance profile list/create/detail/update/delete.
- Completed: live-account sync for compliance documents and findings per user.
- Pending: source-pack API and fleet tenant rollups.

### Phase 4: AI Extraction

- Status: partially complete.
- Completed: backend text extraction for plain-text files.
- Completed: backend selectable-text PDF extraction through `pypdf`.
- Completed: deterministic jurisdiction keyword classifier.
- Completed: deterministic structured extraction for dates, IDs, plates, weights, seals, drivers, and border posts.
- Completed: first-pass review alerts for extracted date and vehicle-linkage risks.
- Pending: OCR for scanned PDFs/images.
- Pending: AI document classifier.
- Pending: AI-enhanced structured extraction for more document-specific fields such as licence classes, axle groups, expiry-risk interpretation, customs procedure codes, and tachograph windows.
- Add confidence scoring and human review states.

### Phase 5: Alerts and Fleet Operations

- Status: partially complete.
- Completed: fleet dispatch readiness rollup for selected jurisdiction profile coverage.
- Completed: load packet cards show selected-region compliance warnings when readiness alerts are open.
- Completed: expiry/review alerts from uploaded document extraction surface in compliance findings and readiness context.
- Completed: critical uploaded-document findings can hard-block load release from the Load Packets workflow.
- Completed: cross-border customs and EU movement-evidence checklist surfaces from route profiles and latest extracted upload fields.
- Pending: configurable blocking rules for missing critical Uganda documents before any matching upload exists.
- Add PSV/driver fatigue reminders.
- Expand cross-border checklist into document-specific required-field validation by commodity and corridor.
- Add owner/dispatcher views for compliance health.

## Open Questions Before Build

- Does the first release target freight trucks only, or should PSV/school-bus compliance be visible immediately because of the Uganda accident-response rules?
- Should compliance be a Pro/Fleet feature, or should basic country selection be available to all users?
- Will uploaded legal/compliance documents remain local-only at first, or should they sync to production immediately?
- Which AI provider should be used for OCR and document classification when backend AI is added?
- Should dispatch be blocked when a finding is critical, or should the app only warn?

## Recommended First Build Slice

Start with a frontend-only Compliance MVP:

- static Uganda, Kenya, Rwanda, EAC, and EU rule packs
- Uganda 2026 accident-response and load-control topics treated as priority
- jurisdiction selector
- document upload and keyword scan
- findings panel
- local persistence

This gives users immediate value without waiting on backend AI infrastructure, while preserving a clean path to OCR, backend storage, and fleet-level alerts.