# LUCCCA Module Competitive Coding Brief

**Purpose:** Hand this file to Perplexity (or any coding agent) as the product + competitive ground truth for implementation work on EchoAurion / LUCCCA Framework.

**Source branch:** `claude/laughing-noether-lSZwe`  
**Repo:** `wmorrison76/Echo_Aurion-LUCCCA_Framework`  
**Date:** 2026-07-27  
**Owner:** William Morrison — Aurion Holdings, Inc. (dba EchoAurion)

---

## 0. How to use this brief (for the coding agent)

1. Do **not** invent modules, competitors, or rip-and-replace GTM. Follow this brief.
2. Prefer **wrap-not-replace** over displacing locked enterprise systems.
3. Implement **segment by segment** (not “the whole platform at once”).
4. When unsure, choose the conservative option and leave a `// TODO(echo):` note.
5. Ground code changes in existing paths:
   - Client modules: `client/modules/*`
   - Wrap doctrine: `docs/PUSH_3.13_WRAP_NOT_REPLACE.md`, `server/lib/wrap-not-replace/*`
   - Module gate: `server/lib/module-gate.ts`
   - Edition map: `docs/maestro/EDITION_MODULE_MAP.md`
   - Audit baseline: `scripts/module-audit-baseline.json`
6. Sidebar is already rationalized to ~8 groups — do **not** add 200+ nav items. Surface power via panels/search, not nav sprawl.
7. Colorblind / accessibility / no mock-in-prod rules from Company OS `CLAUDE.md` apply when building UI.

---

## 1. Strategic verdict (non-negotiable)

At Miccosukee / MGM / Caesars-class scale, Echo **cannot** rip out in year 1–3:

- Oracle OPERA / Agilysys PMS
- Oracle Simphony / Agilysys InfoGenesis POS
- BirchStreet (or equivalent P2P)
- Amadeus Delphi (Sales & Catering)
- HotSOS / Alice
- Book4Time / SpaSoft
- M3 (ownership accounting)
- UKG / Workday (payroll)
- Casino player CRM / loyalty (IGT / Aristocrat / Konami)

**Win condition:** Become the **System of Understanding** — culinary ↔ purchasing ↔ labor ↔ BEO ↔ guest ↔ forecast — that **wraps** those cores and **replaces** weak layers (recipes, pastry, wine, allergen spine, EchoFresh, AI copilots).

**GTM postures:**

| Posture | Meaning |
|---|---|
| `REPLACE` | Echo becomes system of record for this domain |
| `WRAP` | Connect, import, dual-run; incumbent stays SoR initially |
| `COMPLEMENT` | Fill gaps the incumbent leaves; join data across systems |

Existing platform machinery for this: incumbent registry, coexistence policy (`luccca` / `incumbent` / `dual_write` / `unassigned`), module state (`explore` → `active` → `deprecating` → `frozen`), adoption telemetry, graduation advisor.

---

## 2. Inventory totals

| Metric | Count |
|---|---:|
| Client product modules (`client/modules`, excl. `_shared` / `_stubs`) | **267** |
| Business segments used in this brief | **17** |
| Incumbents cataloged in wrap-not-replace | **52+** |
| Audit baseline entries (client + server packages) | **400** |

Largest client modules by LOC (approx.): Culinary, PurchasingReceiving, EchoAurum, EchoCanvasStudio, EchoEvents, Schedule, EchoEventStudio, MixologySommelier, Whiteboard, Pastry.

---

## 3. Priority legend

| Priority | Meaning |
|---|---|
| **P0** | Must-win for resort intelligence GTM — ship certification + depth here first |
| **P1** | Expand after P0 wedge is live and dual-running |
| **P2** | Important, but do not block P0 connectors / culinary SoR |

---

## 4. Segment coding specs

For each segment below:

- **Posture / Priority**
- **Direct competitors**
- **Cannot rip out**
- **Echo modules (complete list)**
- **#1 win moves** (implement these)
- **Coding acceptance criteria** (what “done” means)

---

### 4.1 Culinary / Recipes / Menu — REPLACE · P0 · 33 modules

**Competitors:** ChefTec / CorTec, Apicbase, Galley / GalleySolutions, MarginEdge recipes, CTUIT, Foodconnex recipe modules, BirchStreet recipe (when used as P2P SoR)

**Cannot rip out:** Nothing sacred if Excel/ChefTec is weak — prime wedge. Costs still must land in BirchStreet/GL.

**Echo modules:**
Culinary, EchoRecipePro, RecipeLibrary, RecipeSource, MenuCapture, MenuIngest, MenuDesignStudio, MenuEngineering, MenuRDStudio, AICookingAssistant, AllergenImpactViewer, AmuseBouche, DishAssembly, FlavorProfiles, FixMyMenu, FoodGallery, IngredientCostLookup, OutletMenus, PlateCostingDashboard, ProductionSheet, KitchenFire, KitchenRouting, KitchenWarRoom, KDS, FloorStation, ChefOutletDashboard, ChefDailyReport, CostManagement, Cafeteria, FarmToTable, FreshMealSystems, Commissary, IngestionPanel

**Win moves to implement:**
1. Theoretical vs actual COGS tied to POS depletion + banquet pulls
2. Multi-outlet recipe governance: central master → local variants → approval workflow
3. Allergen/nutrition as a spine flowing to menus, BEO, IRD, labels
4. Nested sub-recipes, butcher yields, production batches at 20–80 outlet scale

**Acceptance criteria:**
- [ ] Recipe is SoR for culinary costing when coexistence domain = `luccca`
- [ ] Allergen change on ingredient propagates to outlet menus + BEO items + IRD
- [ ] Import path from ChefTec / CraftBowl / Paprika / MarginEdge recipes documented + tested
- [ ] Menu sync contract to POS (Simphony/Toast) is adapter-shaped (read mapping tables, idempotent)
- [ ] No “Coming Soon” panels in Culinary critical path

---

### 4.2 Pastry / Bakery / Cake — REPLACE · P0 · 12 modules

**Competitors:** Excel bakery sheets, ChefTec/Apicbase production, niche bakery ERPs, FreshByte-class tools

**Cannot rip out:** Spreadsheets — high REPLACE potential.

**Echo modules:**
Pastry, PastryRDStudio, PastryStandalone, PatisserieCraft, MaitrisePatisserie, MasterBaker, EntremetBuilder, CakeViewer, EchoCanvasStudio, echo-canva-cake-order, echo-canva-design-editor, SketchToSnap

**Win moves:**
1. Forecast-driven batch production (breakfast pastry vs banquet dessert)
2. Formula scaling, bake loss, freezer pull, oven/deck capacity
3. Outlet transfer costing + allergen lot tracking
4. Guest-facing cake design → priced BEO/order (Canvas Studio)

**Acceptance criteria:**
- [ ] Batch plan generated from Chronos/cover forecast + banquet dessert demand
- [ ] Cake order path: design → price → deposit → production ticket
- [ ] Transfers to outlets create costed inventory movements
- [ ] Lot/allergen trace for pastry batches

---

### 4.3 Craft / Maîtrise / Training — COMPLEMENT · P1 · 15 modules

**Competitors:** Workday Learning, Cornerstone, SAP SuccessFactors, ServSafe, 7shifts/HotSchedules training modules

**Cannot rip out:** Corporate HR LMS for compliance — Echo owns station craft.

**Echo modules:**
MaitriseCuisine, MastersOfTheCraft, MasterButcher, CharcuterieProgram, FromagerProgram, CraftKitchen, CraftTechniques, CraftCalculators, CraftDiagnostic, LAccord, ChefCarissaTraining, ChefGioTraining, ChefMancusoTraining, MaitreDeMaison, QualityAssurance

**Win moves:**
1. Bind training to live recipe versions (not orphan LMS content)
2. Role curricula with station sign-off + allergen/HACCP expiry
3. Living craft corpus (charcuterie/fromager/butcher yields) as IP
4. WRAP corporate LMS for HR compliance; OWN kitchen skill mastery

**Acceptance criteria:**
- [ ] Completing a craft lesson links to current recipe version ID
- [ ] Sign-off records are audit-logged with actor + timestamp
- [ ] Expiry alerts for allergen/HACCP certs surface in manager workflow

---

### 4.4 Beverage / Wine / Mixology — REPLACE · P0 · 5 modules

**Competitors:** Accubar, Bevager, Craftable, BinWise, Capton, WISK, MarketMan beverage

**Cannot rip out:** POS beverage rings + purchasing contracts — cellar apps are replaceable.

**Echo modules:**
MixologySommelier, MixologyRDStudio, MixologyRDLab, WineSommelier, BeverageOps

**Win moves:**
1. Cellar: vintage, bin, par, theft/comp, allocation wines
2. Pairing tied to live menus + BEO wine packages
3. Depletion from POS + banquet pulls + tasting events
4. SommelierAI that writes to beverage ops (not chat-only)

**Acceptance criteria:**
- [ ] POS beverage depletion updates cellar pars
- [ ] BEO wine package pulls from cellar with cost impact
- [ ] Comp/theft variance report with shape+label status (not color-only)

---

### 4.5 Purchasing / Inventory / Supply — WRAP · P0 · 18 modules

**Competitors:** BirchStreet, Foodconnex, MarketMan, BlueCart, Sysco Shop, US Foods Online, Accubar (bar), CTUIT

**Cannot rip out:** BirchStreet (or equivalent P2P) at enterprise casino — auditors own it.

**Echo modules:**
PurchRec, Purchasing, PurchasingHub, PurchasingReceiving, OrderingInventory, InventoryAudit, InventoryReceiving, InvoiceOCR, SupplierCatalog, SupplierNetwork, SupplyChain, Vendors, VendorIntel, AP, WasteSheet, EchoWaste, YieldAlerts, DriverRoute

**Win moves:**
1. Culinary-driven requisitions on top of BirchStreet punch-out
2. 3-way match + catch-weight receiving with recipe cost feedback
3. Vendor scorecards: quality, yield, allergen accuracy (not just price)
4. Graduation path: dual-run → Echo SoR only where no P2P exists

**Acceptance criteria:**
- [ ] Coexistence: when purchasing domain = `incumbent`, Echo is read-only / requisition suggest only
- [ ] Culinary par / 86 events can draft a BirchStreet-ready requisition
- [ ] Receiving catch-weight updates theoretical recipe cost
- [ ] Adapter status for BirchStreet documented in incumbent registry
- [ ] Prefer canonical `PurchRec` over growing legacy `PurchasingReceiving` monolith unless migrating

---

### 4.6 Labor / Schedule / HR — WRAP · P1 · 13 modules

**Competitors:** Seventh (HotSchedules), 7shifts, Deputy, UKG/Kronos, Workday, Harri, When I Work

**Cannot rip out:** UKG/Workday payroll — Seventh/7shifts may stay as F&B front-end.

**Echo modules:**
Schedule, MySchedule, AutoScheduling, LaborCommandCenter, StaffMobile, StaffOptimization, PTOManagement, Phase9HRPayroll, PeopleAdmin, JobSharing, RoleAssigner, DailyStandup, ManagerWorkflow

**Win moves:**
1. Demand from covers/BEOs/occupancy → labor targets (Chronos spine)
2. Fair workweek, tip pooling, union rules as first-class
3. Multi-dept labor pools (F&B, HK, spa, engineering)
4. WRAP UKG payroll; own F&B schedule intelligence

**Acceptance criteria:**
- [ ] Chronos forecast publishes labor targets per outlet/dept
- [ ] Export/attest punches compatible with UKG/ADP shapes
- [ ] Predictive scheduling rule engine stubs for fair workweek jurisdictions
- [ ] Dual-run with Seventh/7shifts via wrap adapters

---

### 4.7 Events / Banquets / BEO — WRAP · P0 · 26 modules

**Competitors:** Amadeus Delphi, Tripleseat, Momentus/Ungerboeck, Social Tables / Cvent, MeetingBroker

**Cannot rip out:** Delphi at large convention/casino — sales commissions live there.

**Echo modules:**
EchoEvents, EchoEventStudio, EchoDocs, EchoLayout, EchoConductor, Maestro, MaestroBQT, MaestroBanquets, MaestroDashboard, BanquetMenuBuilder, BanquetIntelligence, BanquetRDStudio, BEOExecution, BEOMenuBuilder, BEOStandalone, BEOTimelineUI, BeoPlanner, ConventionManagement, EventBrief, EventCostTracker, GroupEventAttendee, GroupResume, ProspectToPlatePipeline, LiveLayout, VrWalkthrough, GlobalCalendar

**Win moves:**
1. Never lead with “replace Delphi” — wrap sales diary, own prospect→plate
2. EchoConductor records how every event actually ran (execution moat)
3. BEO → recipe → purchasing → labor pull in one graph
4. Role-aware mobile captain/server views

**Acceptance criteria:**
- [ ] Import BEO / function diary from Delphi (or file) into EchoEvents
- [ ] BEO item links to recipe IDs + cost + allergen
- [ ] EchoConductor stores planned vs actual (covers, fire times, waste, labor)
- [ ] Change log / versioning on BEO documents
- [ ] No GTM copy that claims “replaces Delphi” in UI

---

### 4.8 Guest / Concierge / CRM — COMPLEMENT · P1 · 22 modules

**Competitors:** Kipsu, Alice (Actabl), Canary, OPERA CX, Revinate, Salesforce Hospitality, Zingle

**Cannot rip out:** Casino player CRM/loyalty — integrate only.

**Echo modules:**
Guest360, GuestBooking, GuestCRM, GuestConcierge, GuestExperience, GuestIntelligence, GuestOrdering, GuestPrivacy, Concierge, ConciergeMobileAdmin, ConciergeQR, EchoConcierge, EchoConciergeMobile, EchoAurion, EchoAtrium, EchoNetwork, FrontDesk, VipAdmin, FOHConciergeHub, Waitlist, ActivityTimeline, LifestyleDashboard

**Win moves:**
1. Preference + journey intelligence across F&B/spa/IRD — not just inbox
2. Unify PMS + POS + spa + casino player profile (wrap player CRM)
3. Concierge itinerary with monetized upsell + folio posting
4. Consent / TCPA / multi-language at resort scale

**Acceptance criteria:**
- [ ] Guest profile joins PMS confirmation + F&B checks + spa bookings (read adapters)
- [ ] Allergy on guest profile surfaces to kitchen / IRD
- [ ] Privacy/consent flags block outbound messaging
- [ ] No attempt to replace casino player rating systems

---

### 4.9 Spa / Wellness — WRAP · P2 · 4 modules

**Competitors:** Book4Time (Agilysys), SpaSoft, Mindbody, Zenoti

**Cannot rip out:** Book4Time/SpaSoft once therapists and room-charge flows are live.

**Echo modules:** Spa, SpaBuilder, SpaWellness, ZenSpaSite

**Win moves:**
1. Deep OPERA/Agilysys room-charge + folio settlement
2. Therapist/room/equipment engine + packages/memberships
3. Link guest CRM + labor + retail inventory
4. Multi-property spa portfolio reporting

**Acceptance criteria:**
- [ ] Spa booking can post room charge via PMS adapter (or clear dual-run status)
- [ ] Labor demand from spa appointments feeds Schedule targets
- [ ] Guest CRM sees spa preferences

---

### 4.10 FOH / POS / IRD / Ordering — WRAP · P0 · 13 modules

**Competitors:** Simphony, InfoGenesis, Toast, HotSOS/Alice (tasking), Olo, Chowly, Qu

**Cannot rip out:** Simphony/InfoGenesis + PMS folio — IRD without folio is a toy.

**Echo modules:**
FOH, FOHOperations, POSConnector, POSMenuAnalytics, POSRouter, PosGlHub, MobileOrder, MinibarIRD, IRD, IRDBuilder, MicroMarket, RetailOps, QrScanner

**Win moves:**
1. Culinary master → POS menu sync with modifiers/course fire
2. IRD: course timing + runner dispatch + allergen-safe menus
3. Room-charge / player-comp tender paths certified
4. Never rip Simphony/InfoGenesis in year 1

**Acceptance criteria:**
- [ ] POS connector imports sales + item mix; writeback limited to approved mapping
- [ ] IRD menu inherits allergen spine from Culinary
- [ ] Tender matrix includes room charge + comp stubs for casino
- [ ] KDS fire remains POS-owned unless explicitly dual-running

---

### 4.11 Finance / Revenue / Accounting — COMPLEMENT · P1 · 15 modules

**Competitors:** M3, Avero, Oracle Hospitality Analytics, Duetto/IDeaS (rooms RMS), BirchStreet AP, MarginEdge

**Cannot rip out:** M3 ownership accounting + often Avero for F&B truth.

**Echo modules:**
EchoAurum, Financial, FinancialOps, FinanceExplainability, Budget, BudgetCenter, GLSync, ReconciliationDashboard, RevenueIntelligence, RevenueOps, SalesTracking, DynamicPricing, GMFlashReport, ExecutiveCommand, EnterpriseBISuite

**Win moves:**
1. USALI hotel P&L + F&B outlet P&Ls with audit-to-source
2. Cross-join PMS + POS + labor + purchasing daily flash
3. F&B/spa/events yield COMPLEMENT — do not replace rooms RMS
4. Invoice→recipe cost accuracy feeding M3/BirchStreet

**Acceptance criteria:**
- [ ] GM flash joins at least POS + labor + purchasing (even if PMS rooms is stubbed)
- [ ] Every KPI drill-down shows source system + timestamp
- [ ] No UI claiming Duetto/IDeaS replacement for rooms
- [ ] GL export shapes for M3 / Intacct / NetSuite documented

---

### 4.12 Engineering / HK / Facilities — WRAP · P2 · 8 modules

**Competitors:** HotSOS, Alice, Quore, Maximo, MaintainX, UpKeep, BMS (Honeywell/JCI/Siemens)

**Cannot rip out:** HotSOS/Alice + physical BMS contracts.

**Echo modules:**
Engineering, EngineeringDash, EngOps, EngWorkTickets, PredictiveMaintenance, EnergyTracking, Housekeeping, Relay

**Win moves:**
1. Predictive HK load from arrivals + events (Chronos)
2. IoT/energy → auto work tickets without replacing BMS
3. Guest-impact routing (AC → room move logic)
4. WRAP HotSOS/Alice; own predictive + cross-dept intelligence

**Acceptance criteria:**
- [ ] Arrivals + banquet volume produce HK staffing suggestion
- [ ] Work ticket create/read adapter for HotSOS or Alice (even if draft)
- [ ] BMS remains external; Echo only opens tickets / shows anomalies

---

### 4.13 AI / Intelligence / Forecasting — REPLACE (AI layer) · P0 · 29 modules

**Competitors:** IDeaS/Duetto (rooms), Avero (F&B analytics), Oracle/BirchStreet bolted-on AI, PreciTaste/Winnow (waste vision), generic LLMs

**Cannot rip out:** Systems of record — AI that cannot read/write them stays a demo.

**Echo modules:**
Echo, EchoAi3, EchoAi3Canvas, EchoActivityDrawer, EchoDataPoints, EchoResonance, EchoMomentum, Chronos, ChronosSignals, ChronosVitals, Forecast21Day, DemandForecasting, OpsForecast, WeatherForecast, Intelligence, AnalyticsEngine, CustomAnalytics, PerformanceIntelligence, CognitiveReplay, ConfidencePanel, TrustPanel, Zaro, ZAROGuardian, WhyChanged, VoiceCommands, PropertyPulse, DistrictBenchmarking, ScenarioPlanner, DataCollective

**Win moves:**
1. System of Understanding across rooms + F&B + events (joined schema)
2. Permission ladder: Observe → Suggest → Draft → Auto w/ undo → Safety (human authorizes)
3. Measurable ROI: food cost %, ticket time, OT hours — not chatbot demos
4. WRAP OPERA/POS; Chronos does **not** replace them

**Acceptance criteria:**
- [ ] EchoAi³ actions respect permission ladder + audit log
- [ ] Chronos forecast consumes PMS pickup + POS + BEO demand signals
- [ ] WhyChanged explains metric deltas with source references
- [ ] No autonomous writes into `incumbent`-owned domains

---

### 4.14 EchoFresh / Meal Prep — REPLACE · P1 · 2 modules (+ edition surface)

**Competitors:** Olo/Chowly rails, CookUnity/Factor-class ops, fragmented ghost-kitchen tools

**Cannot rip out:** Delivery aggregators / payment rails — replace the ops brain.

**Echo modules:** EchoFreshAdmin, EchoFreshStorefront  
*(Edition gated via `echofresh` module — default off for casino pilot.)*

**Win moves:**
1. Subscription cycles + dietary profiles + cold-chain + FSMA lots
2. Resort-native: employee meals + outlet + external delivery
3. Yield costing that protects F&B margins
4. Keep edition isolation from casino pilot

**Acceptance criteria:**
- [ ] `echofresh` remains opt-in; casino org never sees EchoFresh when disabled
- [ ] FSMA lot trace from pack → customer
- [ ] Subscription production batching from dietary profiles
- [ ] Server `requireModuleForOperators("echofresh")` preserved

---

### 4.15 Multi-Property / Portfolio — COMPLEMENT · P1 · 4 modules

**Competitors:** M3 Insight, Oracle Hospitality Analytics, Agilysys Analyze, HotStats, ProfitSword

**Cannot rip out:** Ownership accounting systems.

**Echo modules:** MultiProperty, Portfolio, ClientPortal, ClientImport

**Win moves:**
1. Corp roll-up with server-enforced resort scope
2. District benchmarking on ops metrics incumbents don’t join
3. Tribal/management-company portfolio views
4. Don’t fight M3 for ownership GL

**Acceptance criteria:**
- [ ] Cross-property queries enforce org/resort scope server-side
- [ ] Benchmark metrics cite joined culinary/labor/events sources
- [ ] No leakage of EchoFresh merchant data into casino portfolio views

---

### 4.16 Integrations / Connectivity — COMPLEMENT · P0 · 5 modules

**Competitors:** Oracle OHIP, Agilysys interfaces, Mews Connectors, SI middleware, SiteMinder (distribution)

**Cannot rip out:** Oracle/Agilysys interface certifications — join their ecosystems.

**Echo modules:**
EchoConnect, IntegrationCommandCenter, IntegrationControl, IntegrationSLA, InstallHub

**Win moves:**
1. Certify bi-directional: OPERA, Simphony, BirchStreet, Delphi, HotSOS
2. Idempotent eventing, dead-letter queues, property-level config
3. Menu/tender/department mapping tools
4. SI partner program readiness (mapping docs, not just code)

**Acceptance criteria:**
- [ ] Each P0 connector has adapter status in incumbent registry (`ready`/`beta`/`draft`/`planned`)
- [ ] Integration SLA panel shows last sync, lag, error rate with shape+label status
- [ ] Failed events land in dead-letter with replay
- [ ] Property-level credential vault — no hardcoded secrets

---

### 4.17 Admin / Platform / Ops Console — COMPLEMENT · P2 · 43 modules

**Competitors:** Asana/Monday (work), Miro/FigJam (whiteboard), generic admin consoles, horizontal ITSM

**Cannot rip out:** Operator habits — win by being the daily ops surface.

**Echo modules:**
AdminCommand, AdminConsole, AdminDailyDashboard, AdminOnboarding, Auth, AppearanceSettings, SettingsOverhaul, Onboarding, OpsConsole, EKGSystem, Notifications, Alerts, Support, HelpContentAdmin, SecurityCompliance, SafetyControls, Genesis, GoldenSeed, BranchExplorer, DemoConductor, D64Stubs, PanelSystemEnhancements, UXOptimization, TemplateMarketplace, OperatorTemplates, LucccaDashboard, ManagerDashboard, DeptDashboard, ReportsHub, TraceViewer, StickyNotes, SharedBoard, Collaboration, VideoConference, Whiteboard, UnifiedCanvas, EchoMascot, EchoTasks, EchoStratus, DailyBriefingAdmin, DailyBriefingMobile, MobileEnhancements, CounterpartyMessaging

**Win moves:**
1. Hospitality-native Whiteboard (cost/menu/staff overlays > Miro)
2. EchoMomentum as QMS-byproduct (not another project tool)
3. 3-click doctrine + wrap-not-replace module states in Admin
4. Support flywheel: crash → Knights → draft-PR (Company OS path)

**Acceptance criteria:**
- [ ] Module state machine visible in Admin (explore/active/deprecating/frozen)
- [ ] Whiteboard overlays pull live cost/feasibility signals
- [ ] Support/ticket path does not invent secrets; uses existing audit patterns

---

## 5. Recommended implementation sequence (casino / multi-system resort)

Code and ship in this order unless the operator has a hard dependency otherwise:

1. **Culinary SoR + allergen spine** → menu sync to POS (WRAP Simphony)
2. **PurchRec dual-run on BirchStreet** → culinary-driven requisitions
3. **BEO / EchoConductor wraps Delphi** → prospect→plate cost truth
4. **Chronos joins rooms + F&B + events** (WRAP OPERA pickups)
5. **Labor targets from Chronos** (WRAP Seventh/UKG)
6. **Guest journey + IRD allergen safety** (WRAP Kipsu/Alice + POS)
7. **Specialty REPLACE:** pastry, wine, EchoFresh (greenfield / weak incumbent only)
8. **Graduate domains** via wrap-not-replace telemetry — never force cutover

---

## 6. Wrap vs Own quick map

### WRAP forever (year 1–3)
OPERA / Agilysys PMS · Simphony / InfoGenesis POS · BirchStreet P2P · Delphi · HotSOS / Alice · Book4Time · M3 · UKG · Casino player CRM

### OWN / REPLACE (wedge)
Culinary recipe OS + allergen spine · Pastry + cake design→order · Wine/sommelier · EchoConductor event truth · Chronos / EchoAi³ copilots · EchoFresh meal-prep edition · Craft / Maîtrise corpus

### COMPLEMENT (expand)
Guest journey across outlets · Labor demand from Chronos · Aurum ops BI vs Avero/M3 · HK/eng predictive load · OHIP-certified integration bus · Hospitality whiteboard + QMS · Vendor quality scorecards

---

## 7. Incumbent registry domains (code must respect)

From `server/lib/wrap-not-replace/incumbent-systems.ts`:

`pos`, `inventory`, `recipes`, `scheduling`, `payroll`, `accounting`, `banquet`, `guest_engagement`, `reservations`, `event_mgmt`, `kitchen_display`, `ordering`, `hr`, `pms`, `purchasing`, `ap_invoicing`, `retail`, `spa`, `engineering`, `housekeeping`, `front_desk`

**Default SoR posture (ADR):** LUCCCA aims to own purchasing/receiving, inventory, recipes, costing, production, banquets, HK, front desk **over time**; **wrap** POS, PMS, payroll, AP OCR, retail, spa, CMMS initially. Enterprise casino deals may keep BirchStreet/Delphi/HotSOS as `incumbent` longer — code must honor coexistence flags.

Example incumbents already listed in product docs:
- POS: Toast, Square, Lightspeed K-Series, Oracle Micros Simphony, NCR Aloha, Clover
- Inventory/Recipes: MarginEdge, Restaurant365, Compeat, CrunchTime, ChefTec, CraftBowl, Paprika
- Scheduling: HotSchedules, 7shifts, Deputy, When I Work
- Payroll/HR: ADP, UKG Ready, Paychex, Gusto, Rippling
- Accounting: QuickBooks Online, Sage Intacct, Oracle NetSuite
- Banquet: Tripleseat, Caterease, Event Temple
- PMS: Oracle OPERA Cloud, Mews, Cloudbeds
- Reservations: OpenTable, Resy, SevenRooms
- Ordering: Olo, Chowly, Uber Eats Direct
- P2P/AP: BirchStreet, Coupa, Ottimate (Plate IQ), Stampli
- Retail: Lightspeed Retail, Shopify POS
- Spa: Zenoti, Book4Time, Mindbody
- CMMS: MaintainX, UpKeep, Limble
- Housekeeping: Optii, Flexkeeping, ALICE

---

## 8. Consolidation tax (do this before more features)

267 modules is product power **and** product risk.

**Coding rules:**
1. Do not add new critical monoliths (`scripts/audit-modules.ts --ci` gate).
2. Prefer deepening adapters for OPERA, Simphony, BirchStreet, Delphi over new UI modules.
3. Keep EchoFresh edition isolation intact (`docs/maestro/EDITION_MODULE_MAP.md`).
4. Decompose staleness-critical modules when touching them (Culinary, PurchasingReceiving, Chronos, etc.).
5. Sidebar stays rationalized — new capability goes to panel registry / search, not permanent nav.

---

## 9. Prompt template for Perplexity

Copy/paste:

```text
You are coding against EchoAurion LUCCCA Framework (repo wmorrison76/Echo_Aurion-LUCCCA_Framework, branch claude/laughing-noether-lSZwe).

Read and obey docs/LUCCCA_MODULE_COMPETITIVE_CODING_BRIEF.md (this file) and docs/PUSH_3.13_WRAP_NOT_REPLACE.md.

Task: <DESCRIBE THE SEGMENT OR FEATURE>

Constraints:
- Segment-first: improve this module/segment to be #1 on its own metrics
- Respect WRAP vs REPLACE posture in the brief
- Use coexistence policy before any write to shared domains
- No hardcoded secrets; no mock data in production paths
- Status UI must use shape + label, not color alone
- Do not claim we replace OPERA/Simphony/BirchStreet/Delphi/HotSOS/M3/UKG in UI copy
- Prefer adapters + dual-run + graduation advisor over rip-and-replace migrations
- Pass module audit CI if you touch client/modules or server packages under audit

Deliver:
1) Plan (files to touch)
2) Implementation
3) Tests for coexistence / adapter / allergen or forecast join as applicable
4) Short note on how this moves the segment toward #1 vs named competitors
```

---

## 10. File map for agents

| Need | Path |
|---|---|
| This brief | `docs/LUCCCA_MODULE_COMPETITIVE_CODING_BRIEF.md` (Company OS copy) **or** copy into LUCCCA `docs/` |
| Wrap doctrine | `docs/PUSH_3.13_WRAP_NOT_REPLACE.md` |
| Incumbent catalog | `server/lib/wrap-not-replace/incumbent-systems.ts` |
| Coexistence | `server/lib/wrap-not-replace/coexistence-policy.ts` |
| Module gate | `server/lib/module-gate.ts` |
| Editions | `docs/maestro/EDITION_MODULE_MAP.md` |
| Module list / staleness | `scripts/module-audit-baseline.json`, `docs/MODULE_AUDIT.md` |
| Client modules root | `client/modules/` |
| Sidebar / nav | `client/components/site/Sidebar.tsx` |
| Echo capabilities | `docs/ECHO_CAPABILITIES_DEEP_DIVE.md` |
| Tier model | `docs/TIER_MODEL.md` |

---

## 11. Segment → module count checksum

| Segment | Modules | Posture | Priority |
|---|---:|---|---|
| Culinary / Recipes / Menu | 33 | REPLACE | P0 |
| Pastry / Bakery / Cake | 12 | REPLACE | P0 |
| Craft / Maîtrise / Training | 15 | COMPLEMENT | P1 |
| Beverage / Wine / Mixology | 5 | REPLACE | P0 |
| Purchasing / Inventory / Supply | 18 | WRAP | P0 |
| Labor / Schedule / HR | 13 | WRAP | P1 |
| Events / Banquets / BEO | 26 | WRAP | P0 |
| Guest / Concierge / CRM | 22 | COMPLEMENT | P1 |
| Spa / Wellness | 4 | WRAP | P2 |
| FOH / POS / IRD / Ordering | 13 | WRAP | P0 |
| Finance / Revenue / Accounting | 15 | COMPLEMENT | P1 |
| Engineering / HK / Facilities | 8 | WRAP | P2 |
| AI / Intelligence / Forecasting | 29 | REPLACE* | P0 |
| EchoFresh / Meal Prep | 2 | REPLACE | P1 |
| Multi-Property / Portfolio | 4 | COMPLEMENT | P1 |
| Integrations / Connectivity | 5 | COMPLEMENT | P0 |
| Admin / Platform / Ops Console | 43 | COMPLEMENT | P2 |
| **Total** | **267** | | |

\*REPLACE the AI/intelligence layer while WRAPPING systems of record.

---

*End of coding brief — give this file to Perplexity as the product + competitive specification.*
