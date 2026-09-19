# Aviation Passport Platform

> Implementation update (2026-09-13): the owner reports the MapLibre/PMTiles application deployed and working. Core 0.5.1 and the consuming tarball include the marker wheel/pinch fix, confirmed locally on desktop and mobile and committed in both repositories. Deployment of that patch is not inferred. Offline onboarding and readiness improvements below are planned only; reported installed-PWA download/status inconsistencies remain unresolved. Earlier release records are historical, not current readiness claims.

## Architecture, Requirements, and Implementation Plan

**Status:** MapLibre/PMTiles and chunked IndexedDB offline packages are implemented. This documentation update plans the next offline UX work before implementation. Section 32.3 records the proposed browser-manual/PWA-automatic setup direction; Sections 32.4-32.5, 34.1, 58.2, and Phase U1 define feedback, recovery, installed-app behavior, and acceptance. No implementation, commit, or deployment is authorized by this planning record alone.

**Primary repositories:** `passport-core` (called `core-passport` below), `fly-washington`

**Future reference implementation:** `explore-oregon`

## Approved offline-map architecture update — 2026-09-12

MapLibre GL JS has replaced Leaflet in the implemented migration. A program-owned, self-hosted PMTiles archive of the OpenStreetMap-derived Protomaps basemap will supply the same basemap online and offline, with local light/dark styling. Fly Washington no longer requires CARTO, an API key, or a hosted-provider selector. GitHub Pages remains the deployment target; no backend or tile server is introduced.

The shared core owns rendering, PMTiles integration, package contracts, storage abstractions, lifecycle, readiness UI, and default styling. Fly Washington owns the Washington extract, coverage, independent map versions, generation/release process, and visual overrides. Airport/passport data and user visits remain separate from the basemap.

The implemented migration includes MapLibre rendering, verified downloads, persistence requests, and offline-map status UI. Sections 16–17 and 32–34 remain the architectural requirements; Section 70 records the migration sequence. The required z9–z13 experiment produced measured archive sizes of 9,237,767; 18,741,196; 36,902,403; 81,779,500; and 191,831,101 bytes respectively. Z12 is the implementation candidate, with 11,230,824 additional resource bytes. These measurements supersede the original z11/z12 and sub-100 MB expectations. The owner subsequently reported deployment; complete installed-PWA acceptance remains open and is not implied by desktop/mobile gesture acceptance. The app's map release record contains provenance, commands, comparison evidence, and remaining acceptance work.

## Historical pre-migration release record

The following release notes describe the released Leaflet system before the 0.5.0 migration. Their renderer/provider details are historical; their product behavior remains required.

Core 0.4.2: approved legend uses equal-sized hollow/filled CSS circles inside the existing rounded box; Export/Import controls share typography, sizing, and alignment. Single-provider map errors no longer suggest switching styles. At this milestone, Fly Washington switched to CARTO only, with its existing key and native light/dark appearance. The implemented core retains program-configured raster-provider support.

Core 0.4.3: approved visit feedback stays out of the map. Save confirmation uses a gray disabled button for four seconds with a screen-reader announcement. Deleted visits retain their details with a disabled confirmation, then collapse after four seconds (respecting reduced motion). Deletion updates history in place and preserves unfinished form entries. General feedback appears in the sidebar; backup feedback stays in My passport. Errors remain visible.

Core 0.4.4: airport cards, map labels, accessible marker names, and detail headings display the FAA identifier when supplied, falling back to the stable airport ID otherwise. Internal IDs, visits, backups, and alias search remain unchanged. The selected marker and label use dedicated Leaflet panes above ordinary markers and labels; selection changes transfer that priority for every airport.

Core 0.4.5: mobile marker taps open a compact airport preview with name, visit status, region, and an explicit View details action. List selections and desktop selections open details directly. Mobile hides zoom buttons and uses 1.5px marker/legend outlines; desktop uses 3px. General labels appear together for visible airports when spacing permits from two zoom levels earlier; crowded views suppress general labels while preserving the selected label. Panning recomputes label visibility.

## Historical implementation status — 2026-09-06

Approved map update (core 0.4.1): the initial map fits participating airport bounds to the measured viewport with marker/control padding and quarter-step zoom precision. Show all matches uses the same fitting logic; subsequent navigation is preserved. Map visits use hollow/filled region-colored circles without airplane/checkmark glyphs, retaining selected outlines and accessible visited labels. Browser coverage checks initial marker visibility across desktop/mobile sizes and visited appearance. Physical mobile acceptance follows deployment.

Explorer layout update: the owner approved the desktop approach in core 0.4.0. Persistent Explore / My passport tabs now control the content beside the anchored desktop map. The compact header holds overall progress and Appearance. Airport browsing, details, and passport content scroll independently. My passport contains regional completion, Export/Import, and program information; switching tabs preserves selection and unfinished visit fields. On mobile, the same tabs control the main content beneath the header, restoring Map/List state when returning to Explore. My passport is not a modal; airport details remain a full-screen mobile panel. Tests and packaging can proceed following desktop approval; physical mobile acceptance is planned after the next deployment.

Historical map preference update (core 0.3.0): program-configured raster styles added optional native dark tiles, a saved per-program choice, and live appearance switching. Fly Washington then offered OpenStreetMap and keyed CARTO Positron/Dark Matter as in the earlier `volium/fwpp` app; core 0.4.2 subsequently configured CARTO only. Provider configuration stayed in the app; tile switching preserved map position, selection, and unfinished visits. In this implemented system, map tiles remain outside service-worker caching. The app development notes document the current CARTO setup, to be retired after migration tests pass.

UX update: clicking empty map space clears airport selection and closes details while preserving map position, zoom, region styling, and visited status. Dragging and zooming preserve selection; another marker click switches airports. This behavior belongs to the shared core; the app consumes the refreshed package and owns browser regression coverage.

The first runnable slice now spans both independent repositories. The long-term requirements below remain the roadmap, not a claim that every feature has been delivered.

- Core: TypeScript package `@passport/core` 0.4.5, public models/API, program validation, viewport-height explorer and My passport panel, Leaflet map with selectable styles, synchronized selection and alias-aware filters, IndexedDB schema v1, date-only visits, notes/edit/delete, regional progress, and validated JSON restore. Optional airport reference fields support identifiers, addresses, runways, cautions, and dated source links.
- App: full 115-airport program-map roster in seven regions, matched uniquely to OurAirports, 153 runway records, source stamp instructions including genuine multiple locations, deterministic generation and reconciliation report, light/dark/system appearance, PWA caching, and gated Pages workflow. The original five airport IDs are preserved. Source coordinates remain distinct from precise GPS targets.
- Maps (historical implementation at this milestone): Fly Washington uses Leaflet with CARTO light/dark raster tiles and a dedicated Basemaps key. Core accepts program-configured providers. The worker does not cache or prefetch map tiles. Offline airport/passport functions are available after the production shell is cached; this implementation has no complete offline basemap. The approved replacement must provide first offline startup with a usable basemap after explicit package installation, as specified in Sections 32–33.
- Package workflow: the app consumes a checked-in versioned core tarball, so app builds do not require an adjacent checkout. `npm run core:pack` explicitly refreshes local changes. Publishing to a registry is deferred.
- Tests: core domain/storage tests and app configuration tests pass. Desktop/mobile Chromium and mobile WebKit cover the main workflow; Chromium also passes offline reload/save. Remote CI failed in WebKit offline reload with the same internal navigation error seen locally. The app now tests open-app offline saving separately on every browser and conditionally skips only that exact WebKit offline reload error after checking service-worker control and cached HTML. Physical iPhone offline startup verification and a successful remote rerun remain open. See app handoff notes for details.
- Coordinate review: the owner approved the program map position for Copalis and the OurAirports position for Port of Whitman. Both source disagreements remain documented as resolved in the app's reconciliation report; missing region values use their source map layers.
- Not yet complete: dated award eligibility, precise stamp targets, GPS, photos, ZIP archives, advanced filters, achievements, Oregon app, registry publication, and deployment. Physical-device testing remains a user acceptance step. The complete captured roster is now integrated; source gaps remain explicit rather than guessed.

The first slice deliberately includes basic notes and JSON transfer earlier than the broader photo/ZIP phases to make local testing useful and portable. `passport-core/README.md` and `fly-washington/docs/DEVELOPMENT.md` describe current commands, contracts, and next work. Keep these documents and this status section current as development proceeds.

---

# 1. Purpose

This document defines the initial architecture, functional requirements, repository structure, data model, UX behavior, testing strategy, CI/CD expectations, and implementation sequence for the Aviation Passport Platform.

The first supported program is the **Fly Washington Passport Program**, implemented in the `fly-washington` repository.

The architecture must, however, support additional aviation passport programs without embedding Washington-specific assumptions into the shared implementation. **Explore Oregon** is the primary expected second program and should be used as an architectural validation target because its rules differ meaningfully from Fly Washington.

This document is intended to be detailed enough that implementation can begin without requiring the implementer to rediscover architectural decisions.

The design should continue to evolve as implementation reveals new requirements. Changes to architectural invariants or cross-repository contracts should be reflected in this document.

---

# 2. Product Vision

The platform provides pilots with a modern, installable, offline-capable digital companion for aviation passport programs.

Each aviation passport program should feel like its own application:

- its own branding;
- its own website;
- its own installable PWA;
- its own program rules;
- its own airport dataset;
- its own map appearance;
- its own achievements;
- and its own releases.

At the same time, the majority of application behavior should come from a reusable shared core.

The core should make it possible to create a new passport program primarily by defining:

1. program configuration;
2. airports;
3. regions;
4. verification requirements;
5. achievements;
6. visual assets;
7. program-specific content.

Creating a new program should not require copying the implementation of an existing program.

---

# 3. Architectural Principles

The following principles are architectural requirements, not suggestions.

## 3.1 Programs are independent applications

Fly Washington, Explore Oregon, and future programs are separate applications.

A pilot participating only in Washington should not need to install or interact with an application containing unrelated Oregon functionality.

Each program may be hosted independently and installed independently as a PWA.

---

## 3.2 Shared behavior belongs in the core

Generic functionality should live in `core-passport`.

Examples include:

- map interaction;
- airport selection;
- filtering;
- check-ins;
- progress calculation;
- achievement evaluation;
- local persistence;
- attachment handling abstractions;
- offline behavior;
- import/export;
- generic UI components;
- PWA support.

Program-specific facts and rules belong in the program repository.

For the approved map migration, generic functionality includes MapLibre rendering, PMTiles protocol registration, typed package validation, download/update/delete and availability behavior, storage estimation and persistence requests, reusable status/error UI, default basemap styles, and program overlays. Browser storage operations belong behind testable core abstractions, not scattered through UI code.

---

## 3.3 The core must not know about specific programs

`core-passport` must never import code from `fly-washington`, `explore-oregon`, or another program.

Code such as the following is prohibited:

```ts
if (program.id === "fly-washington") {
    // Washington-specific behavior
}
```

If behavior differs between programs, the difference must normally be expressed through:

- configuration;
- rules;
- interfaces;
- adapters;
- callbacks;
- program-owned composition.

A truly unique program feature may remain implemented in the program application rather than being generalized prematurely.

---

## 3.4 No monorepo

The repositories are intentionally independent.

Initial repository structure:

```text
core-passport
fly-washington
```

Expected future repository:

```text
explore-oregon
```

Additional programs should normally receive their own repositories.

The repositories may be opened together in a VS Code multi-root workspace for convenience, but they remain separate Git repositories with independent history, releases, CI, and deployments.

---

## 3.5 Local-first and offline-first

The application must function without a backend service.

A user must be able to:

- install/open the application;
- view airports;
- use filters;
- inspect progress;
- create check-ins;
- add notes;
- use locally stored photos;
- review visit history;
- earn locally computable achievements;
- export their data;

without requiring an application-owned server.

The initial architecture does **not** include a required `passport-backend` service.

Cloud functionality may be added later as an optional adapter or enhancement, but the application must not depend on it.

Cache the small application shell and program data independently. A complete basemap is installed through the discoverable setup flow in Section 32.3, including every required local rendering resource. Section 32.3 defines manual browser download and bounded automatic standalone preparation; the UX must not rely on finding a maintenance button in My passport. Shell, program data, user data, and basemap readiness must be reported separately. An absent map package must not prevent airport/passport use (Sections 32–34).

---

## 3.6 No account is required

Users must be able to use the application without creating an account.

Local-only use must be a first-class supported configuration.

Authentication must not be required to access the fundamental passport experience.

---

## 3.7 User data belongs to the user

Passport/check-in data should live on the user's device unless the user explicitly chooses an export or future cloud synchronization feature.

The application must provide portable export and import capability.

The user should not be locked into a particular device or storage provider.

---

## 3.8 Semantic state and visual presentation must remain separate

The core may determine:

```text
airport = KXYZ
region = coast
visited = true
selected = false
```

The program decides how those states appear.

For example, program configuration may determine:

- region color;
- unvisited marker;
- visited marker;
- selected marker;
- completed-region appearance;
- progress bar styling.

This separation prevents the shared core from imposing one program's visual model on another.

Airports, passport regions, stamp locations, visits, and marker state must never be embedded in PMTiles. Program JSON/GeoJSON and local passport records drive dynamic MapLibre sources/layers above the basemap. Airport identity and coordinate accuracy remain independent of OpenStreetMap features.

---

## 3.9 Defaults belong in the core; policy belongs in programs

The core may provide useful defaults.

Programs must be able to override them.

Examples include:

- map center;
- map zoom;
- marker icons;
- completion thresholds;
- verification methods;
- region styling;
- photo limits;
- progress presentation.

For basemaps, core supplies reusable light/dark styling and generic package lifecycle behavior. Programs supply coverage, versioned artifacts/resources, and visual overrides; Section 17 defines their typed contract.

---

# 4. Repository Responsibilities

# 4.1 `core-passport`

`core-passport` contains the reusable implementation.

Its published JavaScript/TypeScript package should initially be:

```text
@passport/core
```

The Git repository name and npm package name do not need to be identical.

The core should initially remain **one package**.

Do not split it into several npm packages until there is a demonstrated reason to do so.

Internally, functionality should still be divided into clear modules.

Suggested layout:

```text
core-passport/
├── src/
│   ├── app/
│   ├── airport/
│   ├── checkin/
│   ├── map/
│   │   ├── renderer/
│   │   ├── basemap/
│   │   ├── offline/
│   │   └── style/
│   ├── verification/
│   ├── progress/
│   ├── achievements/
│   ├── persistence/
│   ├── media/
│   ├── import-export/
│   ├── models/
│   └── index.ts
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── package.json
├── tsconfig.json
├── README.md
└── ...
```

Responsibilities include:

- application bootstrap;
- reusable responsive application shell;
- generic map behavior;
- airport marker rendering;
- airport list behavior;
- filtering;
- airport selection;
- check-in creation/editing/deletion;
- visit history;
- verification framework;
- progress calculation;
- achievement evaluation;
- local data persistence;
- offline application behavior;
- media/attachment abstractions;
- import/export;
- public TypeScript contracts;
- reusable UI states and components;
- PWA-related reusable infrastructure where appropriate.

The core must expose a deliberate public API from `src/index.ts`.

Consumers should not be encouraged to import arbitrary internal files.

The map modules own MapLibre/PMTiles integration, the typed offline-package contract, generic install/update/rollback/delete behavior, availability checks, browser storage adapters, status UI, and overridable default styling. This is a suggested growth layout: the current core uses flat `src/app.ts`, `src/models.ts`, and `src/persistence.ts`. Introduce modules as the migration needs them; unrelated file moves are not required.

---

# 4.2 `fly-washington`

`fly-washington` is the first actual application.

Suggested layout:

```text
fly-washington/
├── src/
│   ├── program/
│   │   ├── program.ts
│   │   ├── regions.ts
│   │   ├── airports.ts
│   │   ├── map.ts
│   │   ├── stamp-locations.ts
│   │   ├── achievements.ts
│   │   ├── verification.ts
│   │   └── filters.ts
│   ├── assets/
│   │   ├── icons/
│   │   ├── markers/
│   │   ├── branding/
│   │   └── ...
│   ├── content/
│   ├── main.ts
│   └── ...
├── public/
│   ├── manifest.webmanifest
│   ├── icons/
│   ├── maps/                  # generated deployment assets, not necessarily Git-tracked
│   │   └── <version>/         # Washington PMTiles and required map resources
│   └── ...
├── scripts/                  # reproducible map-package generation/release tooling
├── tests/
│   ├── program/
│   ├── integration/
│   └── e2e/
├── package.json
└── ...
```

The repository owns:

- Fly Washington branding;
- airport participation data;
- Washington regions;
- stamp-location data;
- program-specific filters and metadata;
- completion rules;
- awards;
- achievements;
- visual assets;
- PWA manifest;
- deployment configuration;
- Washington-specific tests;
- program-specific explanatory text.

The application should be thin.

Fly Washington also owns Washington map-package metadata in the existing `src/program/map.ts`, the generated PMTiles artifact or static release location, bounds and 25–50 mile buffer, measured zoom/detail policy, Washington style overrides, and package generation/release automation. Preserve the existing `airports.generated.json`, `regions.json`, and typed loaders as independent program data. The app owns deployment integration and E2E coverage; it must not duplicate core package-management logic. Section 33 defines release requirements; `public/maps/` illustrates deployment output, not a requirement to commit a large binary.

Its basic composition should resemble:

```ts
import { PassportApp } from "@passport/core";
import { flyWashingtonProgram } from "./program";

const app = new PassportApp({
    program: flyWashingtonProgram
});

app.mount("#app");
```

The exact API may evolve, but the ownership boundary should remain.

---

# 4.3 `explore-oregon`

`explore-oregon` is not required before Fly Washington development begins.

However, it should be created early enough to validate that the core is truly program-independent.

Explore Oregon is especially useful because it challenges Washington assumptions:

- five regions instead of Washington's seven application regions;
- region completion is not necessarily 100%;
- verification differs;
- physical stamps are not fundamental;
- membership requirements exist;
- airport cautions/seasonality differ.

When Oregon cannot be implemented cleanly through the core contracts, that is a signal to inspect the architecture for accidental Washington-specific assumptions.

---

# 5. Dependency Rules

The dependency graph must remain directional:

```text
fly-washington ─────────> @passport/core

explore-oregon ─────────> @passport/core
```

Prohibited dependencies:

```text
@passport/core ─X─> fly-washington
@passport/core ─X─> explore-oregon

fly-washington ─X─> explore-oregon
explore-oregon ─X─> fly-washington
```

Programs may share behavior only through the shared core unless another reusable package is deliberately introduced later.

---

# 6. Development Workflow

The expected Windows development layout is:

```text
C:\git\
├── core-passport\
├── fly-washington\
└── explore-oregon\
```

A VS Code multi-root workspace may include all repositories.

This provides convenient navigation while preserving repository independence.

During local development, `fly-washington` must be able to consume the developer's local checkout of `core-passport`.

The implemented mechanism is a checked-in versioned npm tarball. After core checks pass and the intended core version is set in the app dependency, run `npm run core:pack` in `fly-washington` to pack the sibling core and refresh the app install/lockfile. App CI must work without the sibling checkout. Other local-development mechanisms are optional, not replacements for the release workflow.

Production builds and CI must **not** dynamically consume whichever core happens to be latest.

They must depend on an explicit version of `@passport/core`.

Example:

```json
{
  "dependencies": {
    "@passport/core": "file:vendor/passport-core-0.5.1.tgz"
  }
}
```

Core upgrades should therefore occur through normal dependency updates.

For the map migration, package a new tested core version, then update the app dependency, checked-in tarball, and lockfile together with consuming changes. Registry publication remains deferred. Map-package versions are independent of core and airport-data versions; a basemap update must never rewrite user passport data.

Dependabot or Renovate should eventually be configured to create dependency upgrade pull requests automatically.

A core fix should propagate through:

```text
core change
    ↓
core CI
    ↓
new @passport/core version
    ↓
dependency-update PR in fly-washington
    ↓
Fly Washington CI
    ↓
merge
    ↓
deployment
```

This intentionally prevents an untested core change from silently changing production program applications.

---

# 7. Standard Repository Commands

Each repository should expose consistent developer commands where applicable:

```bash
npm test
npm run lint
npm run typecheck
npm run build
```

Additional useful commands may include:

```bash
npm run test:unit
npm run test:integration
npm run test:e2e
npm run validate:data
npm run dev
```

CI must execute the same scripts developers can execute locally.

Important behavior should not exist only as opaque CI configuration.

---

# 8. Program Configuration Contract

The primary mechanism for adapting the core to a particular aviation passport program should be a strongly typed program definition.

Conceptual starting point:

```ts
export interface PassportProgram {
    id: string;
    name: string;

    branding: BrandingConfig;
    map: MapConfig;

    regions: RegionDefinition[];
    airports: AirportDefinition[];

    verification: VerificationConfig;
    achievements: AchievementDefinition[];

    filters?: FilterDefinition[];
    media?: MediaConfig;
}
```

This interface is illustrative rather than frozen.

`PassportProgram.map` must carry the approved typed PMTiles package and styling contract in Section 17. These new fields describe the target API, not fields already accepted by core 0.4.5. Preserve existing program identity, region/airport models, and visual semantics when introducing them.

The implementation should favor explicit models over loosely structured generic objects.

Large static datasets may be stored in JSON or similar data files, but they should be validated against schemas or typed loaders before application use.

---

# 9. Program Identity

Each program must define stable identifiers.

Example:

```ts
{
    id: "fly-washington",
    name: "Fly Washington Passport"
}
```

IDs become part of stored user data and therefore should be treated as durable.

Renaming a display name must not require changing the program ID.

---

# 10. Region Model

Regions are first-class program entities.

The core must not assume:

- a fixed number of regions;
- a particular region name;
- that completion requires 100%;
- that every program uses colors in the same way.

Conceptual model:

```ts
interface RegionDefinition {
    id: string;
    name: string;
    description?: string;
    sortOrder?: number;

    appearance?: RegionAppearance;
    completion: RegionCompletionRule;
}
```

Appearance should be program-controlled.

Possible properties include:

```ts
interface RegionAppearance {
    primaryColor?: string;
    secondaryColor?: string;

    unvisitedMarker?: MarkerDefinition;
    visitedMarker?: MarkerDefinition;
    selectedMarker?: MarkerDefinition;

    progressStyle?: ProgressStyle;
    completedStyle?: RegionCompletedStyle;
}
```

The exact implementation can change.

The requirement is that programs can control their regional visual identity without changing shared core code.

---

# 11. Region Completion

Completion must be rule-driven.

The core must support at least:

### All participating airports

Example:

```text
complete when visited == participating airports
```

### Threshold count

Example:

```text
visit 16 of 18 airports
```

### Percentage threshold

Example:

```text
visit >= 90%
```

It should be possible to add additional rules later.

A completion rule might therefore conceptually resemble:

```ts
type RegionCompletionRule =
    | { type: "all" }
    | { type: "count"; required: number }
    | { type: "percentage"; required: number };
```

Do not hard-code Fly Washington's current rules into generic progress code.

---

# 12. Airport Model

Airports are first-class entities.

Conceptual model:

```ts
interface AirportDefinition {
    id: string;

    identifiers: {
        faa?: string;
        icao?: string;
        local?: string;
    };

    name: string;

    location: {
        latitude: number;
        longitude: number;
    };

    regionId: string;

    participation: ProgramParticipation;

    runways?: RunwayDefinition[];
    amenities?: AirportAmenities;

    stampLocations?: StampLocationDefinition[];

    tags?: string[];
    cautions?: AirportCaution[];

    metadata?: Record<string, unknown>;
}
```

Large real-world datasets may justify separating generic airport information from program participation information later.

For the first implementation, prioritize clarity and validation over premature normalization.

---

# 13. Program Airport Participation

An airport existing geographically does not necessarily mean that it participates in every program.

Participation should therefore be explicit.

Possible information includes:

```ts
interface ProgramParticipation {
    participating: boolean;

    effectiveFrom?: string;
    effectiveTo?: string;

    notes?: string;
}
```

This allows program datasets to evolve without rewriting historical user visits.

---

# 14. Stamp Locations

For programs using physical stamps, the stamp location must be modeled separately from the airport.

An airport may contain multiple stamp locations.

Conceptual model:

```ts
interface StampLocationDefinition {
    id: string;
    airportId: string;

    name: string;
    description?: string;

    location: {
        latitude: number;
        longitude: number;
    };

    verificationRadiusMeters?: number;

    access?: {
        type?: "always" | "business-hours" | "restricted" | "unknown";
        hoursText?: string;
        instructions?: string;
    };
}
```

This distinction is important because GPS verification should target a stamp location when appropriate rather than merely checking whether a pilot is somewhere within airport property.

The UI should communicate multiple stamp locations clearly.

For Fly Washington, a user does not need to collect multiple stamps merely because the airport provides multiple stamping locations.

---

# 15. Airport Amenities and Attributes

The model should support useful trip-planning attributes.

Expected categories include:

- runway length;
- runway surface;
- paved vs turf/grass;
- fuel availability;
- camping;
- overnight accommodations;
- crew car;
- bicycles;
- walkability;
- town access;
- nearby restaurant;
- seasonal availability;
- winter closure;
- stamp availability;
- 24/7 stamp access.

Not all attributes need to be populated immediately.

The model should allow missing or unknown data.

Unknown should not automatically mean false.

---

# 16. Map Requirements

The interactive map is the primary application interface.

On first meaningful use, the user should be taken to the map rather than a dashboard full of unrelated controls.

All participating airports should be visible or discoverable from the map.

The map must support:

- airport markers;
- region-based styling;
- visited/unvisited state;
- selected state;
- pan;
- zoom;
- marker selection;
- interaction with filters;
- interaction with airport list;
- program-controlled defaults.

## 16.1 Approved renderer and basemap

MapLibre GL JS is the selected map library. The default and primary basemap is a program-owned PMTiles archive derived from Protomaps/OpenStreetMap. Core registers and manages the PMTiles protocol and renders program overlays above the basemap. The documented integration uses MapLibre's custom protocol facility; implementation must pin compatible renderer, reader, style, and basemap-schema versions. See [MapLibre addProtocol](https://maplibre.org/maplibre-gl-js/docs/API/functions/addProtocol/) and [Protomaps MapLibre integration](https://docs.protomaps.com/pmtiles/maplibre).

Online without an installed package, read necessary PMTiles byte ranges from static hosting. Offline, read the complete verified installed archive through the core storage adapter. Both modes use the same archive content and style definition for the selected version; an installed older version may remain active until its replacement is validated. There is no online CARTO/offline PMTiles split. Range loading is documented in [PMTiles concepts](https://docs.protomaps.com/pmtiles/); it is not evidence of a complete offline installation.

## 16.2 Renderer migration must preserve product behavior

- Fit participating airports to the measured initial viewport with marker/control padding and the existing quarter-step zoom precision. Show all matches uses the same fit logic; later navigation stays under user control. Verify equivalent visible bounds in MapLibre rather than depending on Leaflet internals.
- Preserve region-colored hollow/filled visited markers, selected outlines, responsive marker/legend sizes, and completed-region styling. Keep selected markers and labels above ordinary ones; Leaflet panes were the historical mechanism; MapLibre layers and accessible overlay controls now provide this behavior.
- Keep FAA identifier display with stable-ID fallback, accessible marker names, compact/detail behavior, and viewport spacing rules for labels. Preserve the selected label in crowded views and recalculate general label visibility after panning/zooming.
- Empty-map clicks clear selection and close details without changing view or visit state. Dragging/zooming preserve selection; another marker switches it. Mobile marker taps open the compact preview with an explicit View details action; list and desktop selections open details directly.
- Preserve filters, matching counts, map/list synchronization, desktop anchored-map layout, mobile Map/List restoration, Explore/My passport tabs, focus management, keyboard operation, and non-color state indicators.
- Light/dark/system appearance changes restyle the same basemap and overlays while preserving view, selection, filters, and unfinished visit fields. Download, update, deletion, and basemap errors must also preserve unfinished visits and existing save/delete feedback behavior.

Basemap absence must leave airport overlays usable on a neutral map background, with list/details/visits available and an actionable status. If rendering itself is unavailable, the accessible list and passport workflow remain available. Section 58 defines regression and physical-device validation; this migration authorizes no change to these product behaviors.

---

# 17. Program Map Configuration

Each program should be able to configure:

- default center;
- default zoom;
- map bounds if appropriate;
- region colors;
- region boundary display;
- region boundary styling;
- unvisited airport marker;
- visited airport marker;
- selected airport marker;
- clustering behavior;
- marker size;
- completed-region visual treatment;
- legend appearance;
- deemphasis/muting behavior.

Approved target contract (illustrative types, extending existing `map.center`, `map.zoom`, and `markerDetailZoom` conventions):

```ts
interface Bounds {
    west: number;
    south: number;
    east: number;
    north: number;
}

interface MapResource {
    id: string;
    url: string;
    kind: "style" | "sprite" | "glyph" | "font" | "license" | "other";
    sizeBytes: number;
    sha256: string;
}

interface OfflineMapPackage {
    id: string;
    name: string;
    url: string;
    version: string;
    sizeBytes: number;          // archive bytes; additional resources counted separately
    bounds: Bounds;
    minZoom?: number;           // omitted means 0
    maxNativeZoom: number;
    attribution: string;
    sha256: string;
    sourceBuild: string;
    basemapSchemaVersion: string;
    licenses: { name: string; url: string; resourceId: string }[];
    resources: MapResource[];   // concrete files, not unresolved URL templates
}

interface BasemapStyleConfig {
    defaultStyleVersion: string;
    lightStyleResourceId: string;
    darkStyleResourceId: string;
    // Program-owned typed MapLibre style overrides, validated after composition.
    overrides?: {
        light?: import("maplibre-gl").StyleSpecification;
        dark?: import("maplibre-gl").StyleSpecification;
    };
}

interface MapConfig {
    center: { latitude: number; longitude: number };
    zoom: number;
    markerDetailZoom?: number;
    bounds?: Bounds;
    basemap: {
        type: "pmtiles";
        package: OfflineMapPackage;
        style: BasemapStyleConfig;
    };

    clustering?: ClusterConfig;
    legend?: LegendConfig;

    markers?: {
        defaultUnvisited?: MarkerDefinition;
        defaultVisited?: MarkerDefinition;
        selected?: MarkerDefinition;
    };

    regionBoundaries?: RegionBoundaryConfig;
}
```

The core supplies default light/dark style definitions and composes any program overrides into validated effective styles at build time. The resource IDs identify those resulting local styles. Complete style overrides may affect only basemap presentation and required resource declarations; they must not replace core-owned dynamic overlay sources or semantic state. The app publishes the resolved resource manifest with its map package. Core owns contract implementation and validation; Fly Washington supplies its values.

Package identity is stable within a program; storage keys include program ID, package ID, and version. Display names and URLs are not identity. Versions are opaque immutable release identifiers: inequality between installed and program-advertised versions signals an available replacement, not lexical or numeric ordering. The advertised release is authoritative, allowing a deliberate rollback to an earlier release. A change to archive bytes or required resources creates a new package version. Style resources may change without regenerating archive bytes; airport-data releases require neither operation.

Show archive size, total required resource size, and additional download/storage requirements before the user starts. Package metadata includes measured bytes, checksum, coverage, native zoom, pinned source, schema compatibility, attribution, and local license notices. Renderer zoom above native detail must not imply additional basemap detail or increase the archive's coverage.

Reject missing/duplicate IDs, empty versions, unsafe or unresolved URLs, invalid checksums, nonpositive archive sizes, invalid resource sizes, malformed or reversed bounds, out-of-range coordinates, noninteger or reversed zoom ranges, incompatible schemas/styles, missing attribution/licenses, and missing resource references. Validate overrides and their entire resource dependency set. CI must fail malformed program configuration; runtime errors remain actionable without damaging passport records.

The historical `tileUrl`, `darkTileUrl`, and raster `styles` contract belonged to Leaflet. Document its compatibility/deprecation path in the new core release, then remove the app's obsolete configuration after migration coverage passes. Retire saved provider preferences with a deterministic fallback to the default PMTiles style while preserving appearance preference and passport data. A future `BasemapProvider` extension may support hosted providers; implementing multiple providers or a provider selector is not required for this migration.

---

# 18. Map/List Interaction — Desktop and Tablet

Desktop and larger tablet layouts should make effective use of screen width.

The user should be able to see:

- the map;
- filters;
- and a matching airport list;

without constantly navigating between screens.

The airport list and map must remain synchronized.

Selecting an airport in the list should:

1. select the same airport on the map;
2. visually highlight the marker;
3. move the map when appropriate;
4. open the airport details.

Selecting an airport marker should similarly select or reveal the corresponding list entry.

---

# 19. Airport Detail — Desktop

Airport details should not normally navigate to an unrelated full-page route.

Instead, use an anchored side panel/drawer associated with the map.

The panel should:

- slide or appear from the side;
- leave the map visible;
- remain closable;
- be scrollable;
- contain the airport information;
- expose check-in prominently.

The detail panel may temporarily replace or overlay the airport list rather than creating a permanent three-column interface.

---

# 20. Mobile Layout

On smartphones, trying to display the full map and airport list side-by-side is not appropriate.

Mobile should provide a fast map/list toggle.

Typical model:

```text
[ Map ] [ List ]
```

Filters should open in a mobile-appropriate control such as:

- bottom sheet;
- slide-up panel;
- full-screen filter view.

Airport details should appear as a prominent modal or full-screen-ish overlay while retaining context that the user came from the map/list.

The check-in action must remain easy to find.

---

# 21. Filtering

Filtering should be handled generically by the core where possible.

Initial Fly Washington filters should support:

- region;
- visited;
- unvisited;
- stamp availability;
- 24/7 stamp;
- business-hours stamp;
- runway surface;
- paved runway;
- turf/grass runway;
- minimum runway length;
- fuel;
- camping;
- overnight;
- crew car;
- bicycles;
- walkable to town;
- nearby restaurant;
- seasonal;
- closed in winter.

Filter definitions should be capable of being program-configured because another program may expose different concepts.

Filtering must affect both:

- map markers;
- airport list.

The UI should provide the user with a clear count of matching airports where useful.

Example:

```text
18 airports
```

---

# 22. Check-In Model

The fundamental user-owned event is a check-in or visit.

Conceptual model:

```ts
interface CheckIn {
    id: string;

    programId: string;
    airportId: string;

    visitedAt: string;
    timeKnown: boolean;

    createdAt: string;
    updatedAt: string;

    notes?: string;

    verification?: VerificationEvidence;

    attachmentIds?: string[];
}
```

The exact representation of unknown time may change.

It must be possible to represent:

```text
Visited July 14, 2026
time unknown
```

without inventing a time.

---

# 23. Historical Visits

The application must support entering a visit that occurred in the past.

Check-in UI should default to current date/time but allow editing.

This is necessary for users who have already participated in a physical passport program before installing the application.

Historical check-ins may be unverified.

A user must not be prevented from recording them merely because GPS verification is unavailable after the fact.

---

# 24. Multiple Visits

The architecture should permit more than one check-in at the same airport.

Progress calculations normally care whether the airport has been visited at least once.

Visit history may nevertheless retain all visits.

This enables future features such as:

- repeat passport completions;
- flight history;
- visit notes;
- historical photo records.

---

# 25. Visit Ordering

The objective default ordering of visits should be chronological based on visit timestamps.

If a custom/personal ordering feature is added later, it must remain separate from the original timestamps.

The application must never rewrite historical timestamps merely to change display order.

Custom ordering is not required for the first vertical slice unless implementation needs it.

---

# 26. Notes

Each check-in should permit an optional free-form note.

Notes are expected to be small and should be stored directly in the local passport/check-in data.

Example uses:

- runway comments;
- restaurant recommendation;
- who the user flew with;
- stamp availability information;
- memorable details.

Notes do not require attachment storage.

---

# 27. Photos and Attachments

A check-in may contain a small, configurable number of photo attachments.

Do **not** store image data as base64 inside the primary passport JSON/document.

The main data model should store attachment metadata.

Conceptual model:

```ts
interface Attachment {
    id: string;
    checkInId: string;

    type: "image";

    filename: string;
    mimeType: string;
    sizeBytes: number;

    createdAt: string;

    storageRef: string;
}
```

Actual binary image data must be stored separately.

---

# 28. Photo Limits

The application should enforce conservative limits to prevent accidental storage growth.

Initial proposed defaults:

```text
maximum photos per check-in: 3
maximum processed image size: approximately 5 MB
```

These values should remain configurable.

Before persistence, the application should normally resize/compress very large camera images to a reasonable maximum resolution/size.

Exact image dimensions and compression settings can be decided during implementation.

---

# 29. Attachment Storage Abstraction

The core should expose an abstraction for attachment storage.

Conceptual interface:

```ts
interface AttachmentStorage {
    put(
        attachment: Attachment,
        data: Blob
    ): Promise<void>;

    get(
        storageRef: string
    ): Promise<Blob>;

    delete(
        storageRef: string
    ): Promise<void>;
}
```

Initial implementation:

```text
LocalDeviceStorage
```

Potential future implementation:

```text
GoogleDriveStorage
```

Potential future providers should not require rewriting check-in logic.

---

# 30. Local Persistence

Structured application/user data should be stored locally using browser storage designed for application data.

IndexedDB is the expected underlying technology unless implementation finds a compelling reason otherwise.

Do not use `localStorage` as the primary passport database.

Local persistence should contain concepts such as:

- program metadata/version;
- check-ins;
- verification evidence;
- attachment metadata;
- preferences;
- application state requiring persistence.

Static airport/program data may normally be bundled with the application rather than duplicated into the user database.

Large basemap archives use the separate core storage abstraction in Section 33. They are replaceable program assets, not passport records, and are excluded from passport JSON/ZIP backups. Map package deletion/update must not migrate or erase visit data.

---

# 31. Data Migration

Persistent schemas must have versions.

Example:

```ts
{
    schemaVersion: 1
}
```

When local data structures evolve, the application must use explicit migrations.

Avoid depending on browser storage layouts that cannot be upgraded deterministically.

Migration tests should be added when schema versions change.

---

# 32. Offline Requirements

After the small application shell and program data have been cached, the application must provide its core functionality without Internet access. After the complete program map package is installed through Section 32.3, the map must also be usable on the first offline launch, including areas never previously viewed within the package coverage. The installation event alone must not trigger a map download; first eligible standalone launch follows Section 32.3 independently of shell precaching.

Offline capabilities include:

- opening the application;
- viewing static airport data;
- viewing program overlays without a basemap, or the complete covered basemap after package installation;
- airport list;
- filters;
- airport details;
- progress;
- previous check-ins;
- adding/editing check-ins;
- notes;
- locally stored photos;
- achievement evaluation.

Program data should be distributed with the application so it does not require a runtime program-data server.

## 32.1 Independent readiness states

The core's reusable offline summary must report application-shell, program-data, user-data, and basemap readiness independently. A stored download flag, service-worker control, or previously viewed map area is not sufficient evidence of basemap availability. Show actual local-storage failures for user data independently of map errors; the map lifecycle must never delete user records to make room.

Illustrative wording (size is populated from measurements, not this example):

```text
Offline availability
Application shell        Ready
Passport data            Ready
Washington basemap       <measured size> · Available offline
User data                Stored locally
```

## 32.2 Offline-map status and actions

Installation state, update status, and persistence status are separate dimensions. For example, an installed working version can coexist with an available update or a failed replacement download.

| State | Meaning and available action |
| --- | --- |
| Not downloaded | No installed package; offer Download with measured size and coverage. |
| Checking storage | Verify bytes and required resources before claiming offline availability. |
| Downloading | Show received bytes and percentage when total is known; allow Cancel. |
| Installed / available offline | Complete validated package and required resources are currently readable locally. |
| Update available | Advertised version differs; offer Update and keep the usable installed version active. |
| Insufficient storage | Explain needed space and offer Retry after space is freed; retain the working map. Do not make deleting the active map the normal remedy. |
| Download interrupted or failed | Offer Retry; staged bytes do not count as installed. |
| Integrity check failed | Reject the candidate, explain failure, and offer a clean retry. |
| Missing or evicted | Previously installed bytes/resources are absent; return to download required and offer redownload. |
| Persistence granted / not granted / unavailable | Report storage protection separately; it does not prove package presence. |

Provide concise accessible status text, keyboard-operable Download/Cancel/Retry/Update controls, and screen-reader progress/completion/error announcements without excessive repetition. The planned normal UI does not offer deletion of a healthy installed map; core retains scoped removal for cleanup and recovery (Section 33.5). Missing basemap messages must not cover controls or prevent airport/list/passport use.

## 32.3 Discoverable setup and download policy (planned direction)

Owner direction (2026-09-13): browser tabs offer map download; an installed PWA starts its initial map download automatically with visible status and Cancel. On first mobile browser use, recommend home-screen installation and explain the platform-specific steps and storage implications before a large transfer. This supersedes the earlier undecided A-E comparison and the original migration's blanket exclusion of automatic large downloads only for the bounded standalone flow below. Implementation remains deferred until plan review is complete.

- **First use on mobile and desktop:** open the same dismissible, non-modal Offline access card used by the persistent navigation control (Section 32.4): **For the best experience, add this app to your Home Screen.** Offer platform/browser-specific steps, **Download map in this browser**, and **Not now**. Show measured total transfer size and mobile-data implications before browser download. Use the same card on desktop, with guidance appropriate to the selected platform/browser. Dismissal is remembered in the current context; installation help remains accessible later. Do not block visits or force installation.
- **Installation copy:** say **Open it there and the offline map (<total size in MB>) should start downloading automatically.** Derive the total from the manifest. Use **start downloading**, not **start preparing**, in user instructions. Pair the iOS Share-menu instruction with a recognizable square-and-up-arrow glyph and readable **Share** text; keep the glyph slightly smaller than the instruction line. It supplements the instruction and is decorative to screen readers. Retain connectivity, cancellation, and existing-package qualifications from this section.
- **iOS explanation:** before the browser transfer, explain that its map and visit storage do not transfer into the home-screen app; download in the installed app to avoid a duplicate map transfer. Existing visits use export/import. Say home-screen use helps the browser grant storage protection, not that only PWAs have guaranteed storage. Query the actual persistence result in either context; do not hard-code a grant or denial by platform.
- **Standalone first eligible launch:** check actual installed bytes and lifecycle metadata first. If a usable package exists, use it without another download, including an older valid version with an offered update. Otherwise start initial preparation automatically after configuration/capability/quota checks, without a separate confirmation tap. Detect the configured standalone display mode, with the iOS standalone fallback; an installation event alone is not a launch or readiness signal ([Google display-mode guidance](https://web.dev/learn/pwa/detection#detecting_display_mode)).
- Show **Downloading offline map - <total size>**, current progress, and **Cancel** immediately next to the map/status entry point. Data may transfer over cellular; do not promise Wi-Fi-only detection. The current Washington package is 93,010,324 bytes including supporting files, excluding storage overhead. All displayed numbers must come from the program manifest, not a Washington constant in core.
- **Offline first launch:** show Waiting for connection rather than a failed or installed state. Permit one deferred initial attempt when connectivity returns while the app is open and the user has not cancelled. Network events are hints; use actual request results. After a real failure, interruption, or integrity error, show an explicit Retry instead of an automatic retry loop. Do not promise continuation when the OS suspends the app or resumable partial downloads.
- **Cancellation and maintenance removal:** persist suppression per program/package in the current context before starting an attempt, and record cancelled/deleted/interrupted states. A subsequent launch must not restart a cancelled transfer or immediately recreate a deliberately deleted map. Explicit Retry/Download clears suppression. If this small control-state storage cannot be written, offer manual download rather than risk repeated automatic transfers. Cross-tab operations must allow only one candidate and use the existing locks. Partial candidates remain uninstalled and are cleaned safely.
- **Eviction:** if retained control metadata proves a previously installed package is now missing, offer recovery without a silent redownload. If the browser erased all origin data, the app cannot distinguish that from first use; in standalone mode a new initial automatic attempt may occur. State this limitation honestly; cancellation cannot survive deletion of all site data.
- **Updates:** remain explicit, show size, and retain the current working version during replacement. Standalone startup does not imply automatic updates or repeated refresh downloads. The small shell precache stays independent of all map transfers.

Core owns context-aware orchestration, scoped control state, persistence handling, and reusable setup/status UI. Program configuration supplies package identity, size, resources, and branding. App composition owns installation integration and may supply guidance through a narrow callback; no program-name checks, new backend, OPFS migration, or duplicated application-owned download logic are introduced.

## 32.4 One visible offline entry point (planned)

Replace the current connection-derived Local passport label with a keyboard/touch-operable **Offline access** control in the persistent application navigation on desktop and mobile. It must not disappear at the current 1,000px breakpoint. A compact mobile label may wrap or shorten presentation while preserving an accessible name and a visible text state; do not use a colored dot alone.

Activation opens one dedicated, dismissible Offline access card, independent of Explore and My passport. First use opens this same card; later activation always provides the map status, actions, and browser installation help, even after onboarding was dismissed or a map was downloaded. Use it on desktop and mobile with bounded, scrollable content. Center the card horizontally within the application on desktop; let it move left as the window narrows while preserving side gutters on mobile. Place focus deliberately in the card; Close and Escape dismiss it and restore focus to its opener (the Offline access control for initial presentation). Do not trap focus in this non-modal card. Opening or closing it must preserve the active tab, map/list view, filters, selection, map position, and unfinished visit fields. It may temporarily cover part of the map when opened, but must not become a persistent gesture-obscuring error overlay.

The control summarizes **map** state with qualified copy: Map not downloaded, Checking map, Downloading map (percentage), Verifying map, Map available offline, or Map needs attention. An installed working map with an update/failure retains its usable-map summary and a secondary update/error detail. Overall Offline ready may only be shown when shell, bundled program data, user storage, and the complete map are verified; map readiness alone must not imply cold app startup readiness.

The expanded card contains separate plain-language rows for opening the app offline, airport information, saved visits, and the map package. Home Screen setup, Repair options, and Storage protection use consistent collapsible sections with matching disclosure indicators and keyboard/touch operation. Activating the heading toggles both open and closed; use action buttons for operations such as Download, Cancel, and Retry. Storage-protection exceptions have a collapsed explanation; granted protection needs no visible message. Network state is separate from all of these. Replace Local passport copy with **Visits are saved in this browser/app. Export a backup to transfer them.** Explain iOS storage separation where relevant. Do not show IndexedDB/OPFS implementation names in the normal user flow.

### Storage protection indicator and declined requests

Check storage protection automatically. When granted, hide the protection indicator and explanation; keep map readiness visible independently. Otherwise show a subtle shield button alongside Offline access on both layouts, with an accessible name and tooltip such as **Storage protection: Not protected** or **Storage protection: Unknown**. Clicking it opens the same Offline access card with the protection explanation expanded. Opening the map card normally leaves this explanation collapsed. Avoid alarming error styling merely because persistence was declined. Never label data permanently safe or guaranteed.

Read persisted() automatically on opening and foreground checks. If not granted, make one automatic persist() request during initial setup in the current context, including browser users saving visits without downloading a map. No manual protection-check step is required. Remember that an attempt was made where storage permits; do not repeat declined requests on every launch or foreground event, or loop when attempt metadata cannot be saved. Unsupported/rejected checks are Unknown, not confirmed denial. A user-triggered retry after installation or changed browser settings is allowed without promising a grant.

A declined request does not stop a viable map download or visit workflow. Explain **Your data is saved, but the browser may remove it to free space. Export your passport as a backup and check offline availability before travel.** Offer Export passport, installation help when in a browser tab, and a low-emphasis retry when supported. There is no universal browser setting that forces approval; do not send users to invented permission controls or suggest clearing site data. Storage-write denial or quota failure is a separate actionable error. Map redownload is recovery for replaceable assets, not protection for irreplaceable visits.

On iOS, home-screen use is a factor in WebKit's persistence decision, not a guarantee and not evidence that browser tabs can never obtain it ([WebKit storage policy](https://webkit.org/blog/14403/updates-to-storage-policy/)). Both tabs and PWAs require actual checks, and users can still clear stored site data even when protected.

## 32.5 Progress, completion, and recovery feedback (planned)

- A tap or automatic standalone start must immediately show Starting/Downloading and expose adjacent status/progress and Cancel. Keep numerical progress visible in the persistent Offline access control on desktop and mobile while the user browses the map, list, or passport: for example **Map download 42%**, with a thin determinate progress bar. A remaining-MB label is an acceptable compact alternative. A spinner, icon, or generic Downloading label alone is insufficient once the manifest total is known. Expanded detail shows received/total MB and optionally remaining MB. Count archive plus supporting-file bytes, clamp displayed values, and avoid excessive decimal precision; use manifest totals and actual received bytes rather than elapsed-time guesses.
- Separate network transfer from verification: at 100% received, show **Download complete - verifying map** until resources are checked, activated, and locally reopened. Do not fabricate a verification percentage or leave a misleading 100% Downloading state. Announce completion once; keep **Map available offline** visible after navigating away and returning. Never display a false installed state because a request started or reached 100%.
- Group progress, status, and actions together at phone widths and enlarged text sizes. Keep the presentation subtle: compact navigation status, steady progress bar, no blocking modal, flashing indicator, repeated toast, or overlay obscuring map gestures. Cancel remains easy to reach from the progress control; cancelling stops only the current transfer and never removes a working installed map. Remove Delete map from the normal offline panel. Treat the basemap as a maintained part of the product, with **Retry** or **Repair map** only when needed; a repair must explain any full redownload and retain a usable version during replacement. Do not add an advanced delete menu in this iteration without a separate product decision.
- Keep installed package availability, current renderer health, shell readiness, and persistence protection as separate state. A temporary online style failure must not erase a valid package or imply that visits failed. A renderer error after verified installation must say the saved map could not be displayed and offer a renderer retry, not automatically prescribe a full redownload.
- Replace write-only generic basemap announcements with owned, reconciled map status. Clear a prior map warning only after the corresponding renderer/resource failure has recovered; do not clear unrelated save/import/storage errors. Ignore stale asynchronous results from earlier style/version requests. Retry a failed same-version style after recovery instead of treating its previous style key as successful. Preserve real missing-byte and unreadable-resource errors.
- Read persisted() at startup/foreground checks through the core environment abstraction, separately from requesting persist() during setup. Report granted/denied/unavailable/rejected checks honestly; an unknown result is not a denial. Protection is not evidence of package presence or a backup. The APIs are distinct in the [Storage Standard](https://storage.spec.whatwg.org/#storagemanager).
- Coalesce overlapping readiness checks so navigation/visibility events do not queue repeated full-package checks or overwrite a newer download/delete result. Retain complete integrity verification; performance tuning or OPFS migration requires separate evidence and planning.
- Provide polite, throttled screen-reader progress announcements, clear completion/error announcements, and stable keyboard focus. A failure remains visible with an actionable reason. The earlier missing-delete report remains historical diagnostic evidence about the old UI; hiding that control in the new design must not conceal an unresolved install/status failure.

---

# 33. Offline Map Package Architecture

The approved V1 solution is a complete downloadable PMTiles package with all resources needed to render it. Opportunistic HTTP or service-worker tile caching is not the offline solution. The historical Leaflet/CARTO limitations in the status record do not limit this implemented architecture.

## 33.1 Coverage and basemap contents

Fly Washington initially uses uniform statewide Washington coverage with a 25–50 mile geographic buffer covering adjoining Oregon, Idaho, British Columbia, and coastal areas. The app team records the exact buffer distance and bounding box/polygon during the Section 70 experiment. Airport data must remain available beyond the basemap boundary; the UI must accurately describe package coverage.

Include useful orientation context:

- land and water;
- state and international boundaries;
- major rivers and geographic features;
- interstate, US, and state highways;
- major local roads appropriate to the selected zoom;
- cities and towns;
- useful parks and national forests.

Exclude or heavily reduce buildings, addresses, businesses/general POIs, parcels, house numbers, parking lots, high-detail residential streets, paths, and transit detail. This is a content policy to validate against the pinned [Protomaps basemap layers](https://docs.protomaps.com/basemaps/layers). Hiding a layer only changes rendering; do not report size savings unless the generated archive actually removes or reduces its data. The app's experiment must document any required reproducible content filtering or generation work and resulting bytes.

Participating airports and their precise locations are authoritative program data. Airport identity, passport regions, stamp locations, visits, and marker state are excluded from PMTiles and rendered as dynamic overlays. Basemap aerodrome features, if present for context, must not be treated as participation or coordinate authority.

## 33.2 Complete local rendering resources

Install the archive plus the effective light/dark styles, sprite JSON/images and applicable resolution variants, glyph ranges/font stacks, fonts where used, other referenced assets, and attribution/license notices. Bundle MapLibre/PMTiles runtime code, CSS, and required workers with the locally cached application shell. Resolve every style reference to a declared locally available resource, including program overrides and labels anywhere in coverage; viewing an area online first must not be necessary.

Core provides default styling and dependency validation; the program's build/release process publishes the resolved resource set. Small shared resources may be cached with the shell, but basemap readiness must verify their presence and compatibility too. App-shell cache cleanup must not remove resources still needed by an installed or rollback package. Avoid runtime CDN dependencies. Appearance switching must work offline without downloading another basemap archive.

Protomaps documents self-hostable fontstack and sprite assets in [Basemaps for MapLibre](https://docs.protomaps.com/basemaps/maplibre). Validate the effective style against the [MapLibre style specification](https://maplibre.org/maplibre-style-spec/), including [glyphs](https://maplibre.org/maplibre-style-spec/glyphs/) and [sprites](https://maplibre.org/maplibre-style-spec/sprite/). A `.pmtiles` archive alone is not an offline-complete map.

## 33.3 Download, verification, and activation

1. Validate configuration and compare the advertised package version with any installed version. Show coverage, measured archive/resource bytes, and additional storage needed in the Section 32.3 setup flow before starting installation.
2. Estimate available storage and request persistence where supported (Section 33.4). Budget for the existing working package, full candidate, additional resources, verification workspace, and storage overhead. An estimate is advisory; handle write failures too.
3. Stream the download into isolated staging storage with bounded memory. Report received bytes and percentage when known, support cancellation, and keep the current map and passport UI usable. V1 retries may restart cleanly; resumable downloads are not required. Interrupted/cancelled candidates never become installed, and abandoned staging is reclaimed on restart.
4. Verify actual archive size and SHA-256 against the program manifest, validate PMTiles structure/header/metadata and schema/coverage/zoom compatibility, and verify each required resource's bytes, checksum, and style references. Hash incrementally or in bounded chunks; do not assume a whole-archive in-memory operation is viable on phones. Generation-time structure verification is separate from browser download integrity.
5. Only after all bytes/resources are durably stored and verified, atomically commit the installed manifest/active-version pointer. Keep staging distinct from installed data. Reads must see a complete old or new version, never a mixture. Serialize competing installs/deletes across tabs and recover safely after a crash at each activation boundary.
6. Confirm the activated package can be reopened through the local PMTiles reader before reporting Available offline. Invalidate reader caches by package version so bytes from different releases cannot mix. Failed activation restores the previous valid pointer; failed download or integrity checks discard/quarantine the candidate and retain the last known-good package.

Core owns this lifecycle behind a testable storage contract covering staging writes, bounded range reads, existence/length checks, verification, atomic manifest activation, enumeration/recovery, and scoped deletion. The PMTiles JavaScript [Source interface](https://pmtiles.io/typedoc/interfaces/Source.html) supports local or remote byte retrieval through `getBytes` and an archive key; core must prove its chosen browser adapter against the pinned reader version. No tile server or browser-side SQLite layer is introduced.

## 33.4 Storage capacity, persistence, and eviction

Core must feature-detect and call `navigator.storage.estimate()` for usage/quota information, query `navigator.storage.persisted()` at startup/foreground checks, and request `navigator.storage.persist()` during manual or automatic offline setup, where available. Handle promise rejection, a false persistence result, and missing APIs explicitly. These APIs require a secure context; estimates are approximate and a persistence request is not guaranteed to succeed. See MDN's [estimate](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/estimate) and [persist](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/persist) documentation.

Denied or unavailable persistence permits best-effort installation if writes work, with honest status. If storage itself is denied or unusable, report Download unavailable/failed and preserve core passport use to the extent its own storage is available. Never claim either map or user-data persistence that did not succeed.

Recheck installed manifests, actual archive presence/length, required resources, and readable local bytes at startup, when returning to the app, before declaring readiness, and after read failures. Missing/truncated content or integrity failure invalidates availability; reconcile stale metadata and show download required. Do not silently use cached HTTP ranges as an installed package. Detect subsequent corruption through read/verification failures and provide clean redownload.

Browser quotas and eviction operate at the origin level; program namespacing prevents accidental cross-program deletion but does not create independent quotas for Pages project paths. Best-effort data may be evicted; user clearing of browser data may remove persisted content too. The UI must not equate historical download success or persistence status with present bytes. See [MDN storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).

The current adapter is IndexedMapStorage: separate program/package databases hold immutable 1 MiB binary chunks and active/previous inventory metadata. Keep IndexedDB for this UX iteration. OPFS is a future measured comparison behind MapStorage, not part of this work; neither backend bypasses browser storage isolation or eviction. Preserve bounded-memory writes, random byte reads, integrity checks, crash-safe activation, and quota tests. Keep passport IndexedDB records and attachments logically separate from replaceable map packages; never automatically delete them to satisfy map quota.

## 33.5 Updates, rollback, cleanup, and deletion

Basemap versions are independent of application/core and airport-data releases. Check the program-advertised release when fresh configuration is available online; offline checks use the last available manifest and must not assert that it is the latest release. Updates are explicit user actions, not automatic large background downloads. Install replacements using Section 33.3 while the old version remains usable. Insufficient space must fail the update safely; never delete the working version automatically to make an update fit.

Retain the previous package through successful activation and local reopen. Only then may generic cleanup reclaim obsolete versions/resources that no active reader or retained manifest uses; record the retention policy and reclaimed bytes. If the previous version is retained, rollback verifies its resources and atomically reactivates it. Otherwise rollback requires a full verified download of the earlier published release. Do not promise offline rollback after its bytes have been reclaimed.

The following removal contract remains a core maintenance/recovery capability, not a requirement to expose a Delete map button in the planned normal UI. Cleanup may reclaim abandoned staging and obsolete unreferenced generations, but must preserve the active working map and the documented rollback policy. Browser-owned site-data clearing remains outside the app's control.

Scoped removal deletes the selected program package's archive, staging data, installed/version metadata, and unreferenced package resources, including retained versions when deleting the entire offline map. Coordinate open readers/tabs, report deletion failures, and recheck actual presence. Shared shell resources remain while referenced. Never delete check-ins, notes, photos, preferences, or program datasets. After deletion, online range use may continue with accurate Not downloaded status; offline overlays and the list remain usable. Offer redownload.

## 33.6 Reproducible generation and release

Fly Washington owns a checked-in script or documented reproducible command and release record containing:

- pinned Protomaps source build/version/date and source integrity reference;
- pinned generation/extraction tools and compatible basemap/style schema versions;
- explicit bounds/polygon, exact buffer, min/max zoom, and content policy;
- exact generation commands and deterministic output metadata where practical, documenting any nondeterminism;
- generated archive byte size and SHA-256, structural verification result, and resource manifest with sizes/checksums;
- preserved OpenStreetMap/Protomaps attribution, source provenance, and applicable data, code, font, sprite, and style license notices;
- measured hosting/browser validation results, immutable artifact URLs, release promotion steps, and rollback instructions.

Use a pinned copy/extract of a [Protomaps basemap build](https://docs.protomaps.com/basemaps/downloads), not runtime hotlinks to its moving download channel. The [PMTiles CLI](https://docs.protomaps.com/pmtiles/cli) documents bounds/region extraction, zoom limits, and structural verification. Record any additional content-generation step; extracting a geographic/zoom subset is not itself arbitrary feature filtering.

The Protomaps download documentation describes the basemap as an ODbL Produced Work; OpenStreetMap data licensing and attribution obligations still apply. Preserve visible OpenStreetMap contributor credit, Protomaps credit, and an ODbL notice/link offline as well as online. The app release owner must verify the exact transformed artifact and all bundled asset licenses, including any applicable derivative-database obligations; do not infer that a software license covers map data or fonts. See [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright).

Choose the static artifact location after measuring size and checking host/repository limits (Section 61). Prefer generated deployment artifacts over normal source history for large binaries; `public/maps/<version>/washington.pmtiles` may be populated during the Pages build from an immutable verified release artifact. Committing a binary requires an intentional documented size/hosting decision. A release download location is not automatically a validated browser Range endpoint.

Publish archive/resources before advertising their manifest. Verify the actual production URL's byte-range behavior and complete download, then promote the manifest. Keep prior immutable releases available for documented rollback; restore the earlier advertised manifest without altering passport data. App releases must preserve resources needed by compatible installed versions or explicitly offer a verified replacement before retiring compatibility.

## 33.7 V1 exclusions and validation gates

Do not add CARTO dependencies or tile prefetching, bulk downloads from public OpenStreetMap tile servers, MBTiles, a backend/proxy/tile server, delta updates, automatic browser-tab downloads or automatic transfers outside Section 32.3, multiple selectable hosted providers, per-airport high-zoom coverage, or airport/passport data embedded in PMTiles. Public OSM tile offline/bulk fetching is prohibited by its [tile usage policy](https://operations.osmfoundation.org/policies/tiles/); OSM-derived downloadable data is the selected source instead.

Section 70 must validate the actual Pages endpoint, storage mechanism, bounded-memory download/verification, local PMTiles reads, resource completeness, service-worker routing, and old/new coexistence under quota. If an assumption fails, stop the dependent migration step and revise this architecture explicitly; do not silently introduce an excluded workaround or weaken offline requirements.

---

# 34. PWA Requirements

Each program app must be installable independently.

Each program owns its own:

- manifest;
- application name;
- short name;
- theme/background metadata;
- icons;
- start URL;
- branding.

The application should behave appropriately when:

- opened as a normal browser tab;
- installed as a PWA;
- launched while offline.

The app owns service-worker/build routing and core owns reusable package behavior. Precache the small shell and bundled program data independently; exclude the large PMTiles archive from mandatory installation precache. Online archive Range requests must reach the static host without an HTML navigation fallback or an incorrectly substituted partial cache entry. Complete installed-package reads use the local storage adapter, independently of opportunistic HTTP caches.

Track locally required styles, sprites, glyphs, fonts, attribution, runtime workers, and their compatibility as specified in Section 33.2. Validate cold offline startup with all network access blocked after explicit installation. Worker updates/cache cleanup must preserve installed map resources and unfinished visit state; shell updates and map updates have distinct readiness and activation lifecycles.

## 34.1 Browser and installed-app storage contexts (planned UX)

A browser tab, a home-screen app, another origin, and another device must not be assumed to share installed maps, visit records, setup preferences, or storage protection. WebKit documents that iOS Add to Home Screen copies cookies but no other local storage and does not subsequently share website data; this includes installation from other iOS browsers ([WebKit, Login cookies](https://webkit.org/blog/14787/webkit-features-in-safari-17-2/#login-cookies)). Chrome on iOS 26 is the owner's reported test environment; do not equate it with Android Chrome.

For users intending home-screen use, explain **Add to Home Screen, open the installed app while connected, then make its map available offline** before downloading in the browser. On first standalone launch, inspect actual storage and run Section 32.3 if needed. Standalone display is a context hint, not proof of installation, shell caching, or shared browser bytes. Do not promise a PWA-install event or API can transfer IndexedDB/OPFS data. Existing visits transfer through export/import; never delete or reset the browser's passport during setup.

Validate the same-origin production URL, manifest start URL/scope, and app build when investigating apparently missing data. A phone's plain HTTP LAN address on port 5173 is a different origin from production and may lack secure-context capabilities; show unsupported storage/PWA operations explicitly. Localhost and HTTPS trust rules are defined by [Secure Contexts](https://www.w3.org/TR/secure-contexts/#is-origin-trustworthy). Do not infer a production failure from an unsupported LAN testing context.

The app owns deployment/build identity and shell readiness reporting; core consumes their adapter and owns map/persistence status. Test the exact built output served on port 5173 after packaging core: rebuilding dist-e2e alone does not update a preview serving dist. Existing service workers may need their normal update activation; preserve user data and do not require clearing all site storage to validate a UI change.

### First-load mobile installation guidance

Show instructions appropriate to the detected platform/browser, with a manual platform choice if detection is uncertain. Safari/Chrome on iOS use the share menu and Add to Home Screen; explain Open as Web App when offered and finish with opening the new icon. Android Chrome can use a supported browser install prompt initiated by a user action, with browser-menu instructions as fallback. Hide install promotion in standalone mode and remember Not now without removing later help. The notification describes automatic map preparation on first installed launch and its measured size, so that behavior is not a surprise.

Implementation must verify exact labels against the current [Chrome iOS instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DiOS&hl=en), [Chrome Android instructions](https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=en), and [WebKit iOS 26 web-app behavior](https://webkit.org/blog/17333/webkit-features-in-safari-26-0/). Do not claim the page can install itself or that a home-screen bookmark is necessarily a standalone PWA.

### Android Chrome behavior and validation

Chrome-installed Android PWAs (WebAPKs) use the installing Chrome profile's storage. For the same origin/profile, the browser and installed app share client-side data; a verified browser download should remain available after installation without another transfer ([Google WebAPK storage documentation](https://web.dev/articles/webapks#managing_storage_and_app_state)). This is documented platform behavior, not physical-device acceptance for this application. Do not generalize it to other browsers, profiles, origins, or embedded WebViews.

The iOS redownload explanation must be platform-specific. On Android Chrome, offer installation without suggesting that it invalidates an existing offline map. On every platform, check actual package bytes and shell readiness before claiming success or starting another download; installation itself is not a reason to erase or redownload a valid package. Shared storage also means explicitly clearing the site's data in Chrome affects the installed PWA.

The owner has no Android phone available. Retain desktop Chromium mobile-emulation coverage for layout, touch input, and lifecycle behavior, but label it as emulation: Playwright device settings do not execute Android or install a WebAPK ([Playwright emulation](https://playwright.dev/docs/emulation)). A planned Android Studio virtual device with a Google Play system image and Chrome can exercise the Android browser/home-screen flow where installation is supported ([Android virtual devices](https://developer.android.com/studio/run/managing-avds)); record installation limitations rather than counting a shortcut/tab as a tested installed PWA.

Android acceptance must exercise browser download, a saved visit, installation, launch from the home-screen icon, unchanged visit/map availability, no duplicate full-package requests, cold offline startup, unseen-area zoom, and shared-state reconciliation in the browser. Exercise scoped removal through a controlled test harness, not a normal Delete button. Also test install-first download, cancellation, and recovery. An emulator is useful intermediate evidence, not proof of real-phone storage pressure, memory, performance, or background suspension. Physical Android results remain pending until a borrowed device or suitable real-device testing service is available; no purchase, service signup, SDK installation, or implementation is authorized by this plan.

---

# 35. Check-In GPS Verification

GPS verification is intended as evidence that the user was physically near the relevant location.

It is not intended to be a cryptographic proof of presence.

No GPS-based system should be presented as impossible to spoof.

---

# 36. Verification UX

Expected flow:

```text
Airport detail
    ↓
Check In
    ↓
Verify I'm Here
    ↓
Request location permission
    ↓
Obtain location
    ↓
Compare to eligible stamp/location
    ↓
Show verification result
    ↓
Save check-in
```

Example successful result:

```text
Location verified
42 m from the FBO stamp location
```

A user should be able to understand what was actually verified.

---

# 37. Verification Target

Where the program defines physical stamp locations, verification should normally compare the user's position to the stamp location.

It should not merely check whether the user is somewhere within an airport boundary.

Programs that do not use physical stamp locations must be able to define different verification behavior.

---

# 38. Verification Evidence

Store useful evidence rather than only a Boolean.

Conceptual model:

```ts
interface VerificationEvidence {
    method: "gps";

    status:
        | "verified"
        | "unverified"
        | "suspicious";

    latitude?: number;
    longitude?: number;
    accuracyMeters?: number;

    timestamp?: string;

    targetId?: string;
    distanceMeters?: number;

    indicators?: VerificationIndicator[];
}
```

Possible future indicators:

```text
mock-location signal
unexpectedly poor accuracy
device integrity signal
impossible timing
```

Browser capability may limit available evidence.

The system must tolerate this.

---

# 39. Verification Failure

Failure to verify must not necessarily prevent the user from recording a check-in.

Examples:

- historical visit;
- denied location permission;
- poor GPS reception;
- browser limitation;
- stamp unavailable;
- airport data incorrect.

Such a visit may be saved as:

```text
Unverified
```

rather than discarded.

Individual programs may later choose stronger policy if needed.

---

# 40. Progress Engine

Progress calculation belongs in the core.

It must be based on:

```text
program configuration
+
user check-ins
```

The output should include at least:

- total participating airports;
- airports visited;
- percentage complete;
- regional progress;
- region completion status;
- achievement progress;
- completed achievements.

Progress functions should be deterministic and side-effect free where possible.

---

# 41. Achievement Engine

Achievements must be program-defined.

Examples include:

- complete a region;
- visit 90% of airports;
- visit every participating airport;
- repeat full-program completion;
- earn a jacket;
- earn a regional patch.

Conceptual model:

```ts
interface AchievementDefinition {
    id: string;
    name: string;
    description?: string;

    rule: AchievementRule;

    award?: AwardDefinition;
}
```

Avoid code such as:

```ts
if (visitedAirports.length === 115) {
    awardWings();
}
```

Instead, rules should evaluate program configuration.

---

# 42. Fly Washington Program Requirements

The Fly Washington dataset/configuration must support the current conceptual program structure:

- participating airports and seaplane bases;
- seven application regions: six geographic regions plus Seaplane Bases as its own region (owner decision, 2026-09-06);
- airport-specific stamp locations;
- multiple stamp locations where applicable;
- regional completion;
- whole-program progress;
- award thresholds;
- repeat completion.

Owner clarification (2026-09-06): Seaplane Bases is a regular region. Its airports count under the same rules as all other airports toward regional completion, Gold, Platinum, and repeat completion, including overall award denominators. Only its patch differs, expressed through program-owned award presentation. Do not introduce a separate seaplane progress or eligibility algorithm.

Program configuration must be able to represent:

```text
100% of a region → regional award

100% of participating airports → Wings

90% of total participating airports → Flight Jacket

additional whole-program completions → repeat-completion award
```

Program content and data must not assume these rules will always remain unchanged.

When official rules change, the program configuration/data should be versionable.

---

# 43. Program Rule Evolution

**Source review (2026-09-06):** Official Washington rules require retained withdrawn-airport credit, delayed new-airport requirements, and preserved region validations. See `fly-washington/docs/AWARDS.md` for sources and open questions. Current-participation-only progress is insufficient for award eligibility. Design generic dated eligibility and completion records before claiming official award calculations.

Passport programs change over time.

The data architecture should eventually be capable of representing effective dates.

Examples:

- airport joins the program;
- airport leaves the program;
- stamp moves;
- completion threshold changes;
- region boundaries change.

The initial implementation does not need a fully generalized temporal rules engine, but stored visit data must avoid depending on fragile array indexes or display text.

Stable IDs and schema versions are mandatory.

---

# 44. Portable Export

The user must be able to export their passport data.

Because photos are binary attachments, the preferred complete backup format is a bundle such as ZIP.

Example:

```text
fly-washington-passport.zip
├── passport.json
└── photos/
    ├── attachment-1.jpg
    ├── attachment-2.jpg
    └── ...
```

`passport.json` should remain human-inspectable and contain structured metadata rather than embedded binary images.

---

# 45. Export JSON

Conceptual shape:

```json
{
  "format": "aviation-passport",
  "schemaVersion": 1,
  "programId": "fly-washington",
  "exportedAt": "2026-09-06T18:00:00Z",
  "checkIns": [],
  "attachments": []
}
```

The actual schema should be formally documented and tested.

---

# 46. Import

The application must support restoring a compatible export.

Import should:

1. validate the archive;
2. validate the JSON schema;
3. verify program identity;
4. validate attachment references;
5. handle schema migrations if supported;
6. present useful errors;
7. avoid silently destroying existing user data.

Merge behavior should be explicitly designed.

At minimum, duplicate check-in IDs must not create duplicate records.

---

# 47. Optional Google Drive Support

Google Drive synchronization/backup may be added later.

It is not required for the first implementation.

It must not become a prerequisite for normal application use.

The architecture should treat Google Drive as a storage/sync provider.

A possible Drive layout:

```text
Fly Washington Passport/
├── passport.json
└── photos/
    ├── ...
```

The application should store stable Drive file identifiers when appropriate rather than relying only on filenames.

---

# 48. Google Authentication

If Google Drive support is implemented:

- sign-in must be optional;
- users who decline sign-in retain full local functionality;
- Drive authorization should request only permissions justified by the feature;
- Drive errors must not prevent access to local passport data;
- local data remains the authoritative usable copy unless a sync design explicitly defines otherwise.

A backend is not required merely to provide optional user-authorized Google Drive storage.

---

# 49. Future Synchronization

Synchronization is deliberately outside the initial implementation scope.

When added, it must address explicitly:

- local vs remote source of truth;
- conflict resolution;
- offline modifications;
- deleted records;
- duplicate records;
- concurrent devices;
- attachment conflicts;
- schema changes.

Do not implement simplistic "last write wins" synchronization accidentally while calling it backup/sync.

A basic user-triggered backup feature may precede true multi-device synchronization.

---

# 50. Application Privacy

Core application use should not require uploading the user's travel history to an application-operated server.

GPS coordinates collected for check-in verification should remain locally stored unless the user explicitly exports or synchronizes their data.

The UI should make location permission requests contextual.

Do not request continuous/background location access for normal check-ins.

---

# 51. Security

Relevant baseline requirements:

- sanitize user-generated text where necessary;
- validate imported files;
- validate program data;
- do not trust filenames in imported archives;
- avoid unsafe path extraction;
- limit attachment size;
- validate MIME/type expectations;
- do not include credentials/secrets in the frontend bundle;
- avoid persisting OAuth credentials insecurely;
- follow provider-recommended authentication flows for future Drive support.

---

# 52. Program Data Validation

Program data must be machine-validated in CI.

Validation should detect at least:

- duplicate program IDs;
- duplicate airport IDs;
- duplicate stamp-location IDs;
- unknown region references;
- invalid latitude;
- invalid longitude;
- invalid completion thresholds;
- invalid achievement references;
- missing required visual assets;
- broken stamp-location references;
- duplicate airport identifiers where prohibited;
- invalid effective dates;
- unsupported filter values.

Validate the Section 17 map contract, effective styles, complete resource references, package versions, byte sizes, checksums, bounds/zoom, source/schema compatibility, and attribution/license notices. App CI must also verify generated map metadata against the published candidate, separately from airport-data generation.

A broken program dataset should fail CI rather than deploy.

---

# 53. Core Unit Testing

The core should heavily test deterministic domain logic.

Representative tests:

```text
filterAirports(...)
calculateProgress(...)
calculateRegionProgress(...)
evaluateAchievement(...)
isInsideVerificationRadius(...)
sortVisits(...)
mergeVisitRecords(...)
validateImport(...)
```

These functions should be written so they can normally be tested without a browser.

Add pure offline-package tests for configuration validation, opaque-version replacement/rollback detection, readiness transitions, progress calculations, and resource-manifest completeness. Use testable adapters for browser capabilities rather than requiring browser globals in domain tests.

---

# 54. Persistence Tests

Persistence tests should verify:

- create;
- read;
- update;
- delete;
- schema initialization;
- migrations;
- attachment references;
- transaction behavior where important;
- restoration after reload.

Browser integration tests may use a test implementation of IndexedDB.

Map storage tests must exercise staged writes, cancellation/interruption, crash recovery, atomic install/update, checksum and truncated/missing-byte failures, quota/network failures, persistence granted/denied/unsupported/rejected cases, eviction reconciliation, deletion/redownload, and safe rollback. Assert that failed replacement leaves the last known-good version usable and that cleanup never removes passport data or resources referenced by an active package. Test doubles do not replace real browser storage validation with the measured archive.

---

# 55. Program Tests

`fly-washington` must contain tests specifically for the Washington configuration.

Examples:

```text
all airport IDs are unique
every airport references a real region
every stamp location references a real airport
all coordinates are valid
regional completion definitions are valid
achievement dependencies exist
required marker assets exist
program configuration can be loaded by @passport/core
```

Where official airport/program counts are intentionally asserted, tests should make the expectation obvious so that an official program update results in a deliberate code/data change.

Washington map-package fixtures must assert buffer/coverage, native zoom, immutable version metadata, measured bytes/checksum, compatible effective light/dark styles, and required local resources. Changing airport data must not require a basemap rebuild or change package identity.

---

# 56. Core Integration Tests

Core integration tests should verify major interactions across modules.

Examples:

```text
create check-in → progress changes

delete check-in → progress changes

verified check-in → evidence retained

import passport → records appear

attachment metadata → storage provider called

program config → map derives expected marker state
```

MapLibre integration coverage must verify program overlay sources/layers, selected-marker/label priority, style changes retaining overlays and state, installed-source byte reads, resource resolution, progress/cancellation UI, and missing-package recovery. Test that partial HTTP ranges cannot satisfy the installed-package readiness check and that failed updates keep the active source usable.

---

# 57. Program Integration Tests

Fly Washington integration tests should instantiate the real program configuration with the core.

This catches incompatibilities that isolated core tests cannot detect.

Representative scenarios:

```text
Washington program boots successfully

Washington airports appear

region filters work

visited airport state changes

regional progress is correct

Washington achievements evaluate correctly
```

Use the actual Washington package contract with the newly packed core to verify local resources, appearance overrides, readiness UI, update compatibility, and independent airport/map release versions. The app owns service-worker integration tests covering archive requests, navigation fallback exclusions, resource retention during shell upgrades, and scoped package deletion.

---

# 58. End-to-End Tests

Use a browser automation framework such as Playwright unless another option is deliberately chosen.

Representative E2E scenarios:

1. application starts;
2. map loads;
3. airport markers appear;
4. airport can be selected;
5. airport detail opens;
6. filter modifies matching airports;
7. check-in can be created;
8. airport changes to visited;
9. progress updates;
10. note can be added;
11. photo can be attached;
12. reload preserves data;
13. export succeeds;
14. import restores data;
15. appropriate functionality remains available offline.

GPS should be simulated through browser geolocation support in E2E tests.

Tests should include:

```text
inside allowed radius
outside allowed radius
poor accuracy
permission denied
```

## 58.1 Map migration acceptance

Fly Washington owns browser E2E coverage for every behavior in Section 16.2: initial and Show all matches fitting across viewport sizes, selection/deselection, pan/zoom preservation, mobile preview/details, map/list synchronization, filters, region/visited/selected styling, label identity/spacing/priority, responsive layouts, keyboard/focus/accessibility, light/dark/system appearance, and unfinished visit state. Rewrite renderer-specific assertions while preserving their product-level intent.

Add package scenarios for progress/cancel/retry, failed integrity, network interruption, insufficient quota, persistence granted/denied/unavailable, atomic replacement and rollback, missing/evicted bytes/resources, delete/redownload, and app/worker update compatibility. Assert no passport-record or draft loss.

Verify online PMTiles Range loading against the actual GitHub Pages production endpoint, full-package download, and cold offline launch with all network disabled and previously unviewed areas visible. Check labels, sprites, fonts, attribution, and both appearances offline. Separately test offline startup and core visits/filters/list/backup without a downloaded basemap, plus missing-package recovery. Mocked archives/resources support deterministic CI; they do not demonstrate real-host range behavior or mobile capacity.

Record browser/OS versions and results on physical iPhone/iPad Safari and Android/Chromium where available, in browser tabs and installed PWA mode where supported. Validate measured archive download, rendering performance, memory/storage usage, restart, and update headroom. Unavailable physical-device coverage remains an explicit pending acceptance item, never an inferred pass.

The historical WebKit internal-navigation-error exception in the status record is narrow: retain service-worker and cached-shell preconditions, skip only the identified error, and fail other errors/assertions. It does not waive first offline startup or establish Safari support. Record affected automation versions and complete physical-device verification before claiming target mobile acceptance.

## 58.2 Offline setup and status acceptance

Phase U1 must cover manual browser downloads and automatic initial standalone preparation, including retained suppression after cancel/delete, a deferred offline-first attempt, and the full-origin-erasure limitation in Section 32.3.

1. First use, setup acceptance/defer or the approved automatic trigger, installed-map bypass, and the agreed behavior after cancellation/deletion/failure. Verify actual request counts across reloads and tabs; preference storage failures must not create an automatic download loop.
2. Desktop and phone discoverability without scrolling: Offline access remains visible and opens the same independent card on first use and subsequent activation, preserving the active tab and Explore/map/list/draft state. Verify Close/Escape, focus restoration, non-modal keyboard navigation, and installation help after dismissal or download. Verify the smaller Share glyph has adjacent readable Share text, desktop card centering and narrow-screen gutters, and repeated click/Enter/Space expansion and collapse for each disclosure. Test narrow screens, enlarged text, keyboard, and VoiceOver where available.
3. Starting, byte progress, verification, completed installation, update failure with usable old map, and actionable errors. Assert numerical percentage or remaining MB stays visible on the map/list/passport layouts, with received/total MB in detail and a separate verification phase. A healthy installed map has no normal Delete action; cancelling an update preserves it. Test internal removal/cleanup separately.
4. Offline online-style failure followed by connectivity recovery and successful local installation: old warnings clear only after renderer recovery, unrelated notices survive, and stale requests cannot override newer success. Test a same-style retry and real missing resources separately.
5. persist() grant followed by reload and persisted() grant/false/unsupported/rejection. Availability and protection remain independent. Check/request happens automatically without requiring a manual action; granted protection shows no indicator, while denied/unknown results show a subtle accessible control with details only on expansion. Foreground/cross-tab events do not duplicate requests or regress current operation state.
6. Browser-first versus install-first flows on physical iOS, including Chrome iOS 26 and Safari, plus Android Chrome where available. Record OS/browser/build/URL, context, final status, and visible numeric progress/readiness. Separate browser/PWA storage is expected on iOS; repeated loss inside the same installed app after verified completion is a defect to investigate.
7. Complete real-package offline cold startup, pan/zoom to previously unviewed areas, both appearances, supporting resources, app restart readiness, and visit preservation. Network access stays blocked throughout assertions. Synthetic contexts can test logic but cannot prove iOS installation or suspension behavior.

---

# 59. CI — `core-passport`

Every pull request should run at minimum:

```text
dependency install
lint
typecheck
unit tests
integration tests
build
package validation
```

Publishing should only occur from an intentional release workflow.

A failing test must prevent publishing.

---

# 60. CI — `fly-washington`

Every pull request should run at minimum:

```text
dependency install
lint
typecheck
program data validation
unit/program tests
core integration tests
build
E2E tests
```

Deployment should only occur after required CI passes.

---

# 61. GitHub Pages Deployment

`fly-washington` is initially expected to deploy through GitHub Pages.

The application build must therefore support static hosting.

Avoid architectural assumptions that require:

- server-side rendering;
- application server routes;
- persistent server sessions;
- custom backend endpoints.

Client-side routing, if used, must be configured so GitHub Pages navigation and PWA startup behave correctly.

PMTiles online reads require correct HTTP Range responses from the selected static artifact URL. Protomaps lists GitHub Pages as a hosting option in its [static/cloud hosting guidance](https://docs.protomaps.com/pmtiles/cloud-storage), but the actual Washington artifact remains unvalidated. The app owner must test browser Range requests, `206` responses with matching `Content-Range` and requested bytes, complete downloads, correct content delivery without HTML fallbacks, base-path URLs, and CORS when resources use another origin. Test with and without service-worker control.

Use the response semantics in [MDN HTTP Range requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Range_requests) for these checks; a host listing or response header alone is not acceptance evidence. Technical references in this map update were reviewed on 2026-09-12; actual artifact/browser experiments remain pending.

Before choosing artifact placement, check current [GitHub Pages limits](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) and [GitHub large-file limits](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github). Published Pages sites are currently limited to 1 GB and have a soft 100 GB/month bandwidth limit; account for shell/resources and retained releases, not just one archive. Reverify limits at implementation/release time. A sub-100 MB archive is an experimental preference, not proof that deployment, bandwidth, or Git storage is suitable. Keep GitHub Pages and static HTTP hosting; failures require explicit architectural review, not a proxy or backend workaround.

---

# 62. Core Release Strategy

`@passport/core` must use semantic versioning.

Typical meaning:

```text
PATCH
bug fix compatible with current program applications

MINOR
new backwards-compatible capabilities

MAJOR
breaking public API/configuration changes
```

Until the architecture stabilizes, releases below `1.0.0` may change more rapidly, but breaking changes must still be clearly communicated.

Program applications should pin or constrain versions deliberately.

Package the MapLibre/offline-contract core change first, then update the app's explicit tarball dependency and lockfile using Section 6. Document breaking raster-map fields, style migration, and retired provider preferences. Basemap artifact versions and rollback remain independent (Section 33.5); do not couple a new airport dataset to a map rebuild.

---

# 63. Public Core API

`core-passport/src/index.ts` should define the supported consumer API.

Example:

```ts
export {
    PassportApp,
    createPassportApp
} from "./app";

export type {
    PassportProgram,
    MapConfig,
    OfflineMapPackage,
    AirportDefinition,
    RegionDefinition,
    CheckIn,
    Attachment,
    VerificationEvidence
} from "./models";
```

Do not expose every internal utility automatically.

A narrow public API reduces coupling and allows core internals to change safely.

---

# 64. UI Extensibility

Programs should not need to fork generic components merely to change appearance.

Reusable UI should consume semantic props/configuration.

Example:

```tsx
<AirportMarker
    region={airport.region}
    visited={visited}
    selected={selected}
/>
```

The rendering layer then consults program appearance configuration.

Where appropriate, the core may support program-provided render hooks/components for exceptional UI.

Do not begin with an overly generic plugin architecture.

Add extension points when real use cases require them.

---

# 65. Accessibility

The application should be usable without relying solely on marker color.

Visited/unvisited and region state should have additional indicators where practical.

Requirements include:

- keyboard-accessible controls;
- appropriate focus management;
- accessible names for map/list actions;
- reasonable contrast;
- non-color-only state indicators;
- labels for icon-only controls;
- touch targets suitable for mobile.

Accessibility should be included during component implementation, not treated solely as final polish.

MapLibre canvas layers must preserve equivalent accessible airport selection through core controls and the synchronized list; canvas rendering alone is not an accessible replacement for existing marker names/actions. Offline status/actions must be perceivable and operable without color or pointer input (Sections 16.2 and 32.2).

---

# 66. Performance

The airport dataset is small enough that premature optimization is unnecessary. The basemap archive has a separate measured storage, memory, and download budget.

However, the architecture should avoid obvious inefficient patterns.

Requirements:

- avoid unnecessary rerendering of all map markers;
- filters should feel immediate;
- user data writes should not block UI unnecessarily;
- images should be resized asynchronously;
- initial bundle size should be monitored;
- airport data should not require network round trips after installation.

Measure the z9–z13 candidates on target mobile hardware. Keep archive downloading, hashing, and local range reads bounded in memory; do not load the whole archive into JavaScript memory. Initial PWA precache must stay independent of the explicit map download. Choose shipping detail based on measured orientation quality, performance, and reliable installation/update behavior (Section 70).

---

# 67. Logging and Error Handling

User-facing errors should be actionable.

Examples:

Bad:

```text
Error 427
```

Better:

```text
Your location could not be determined. You can retry verification or save the visit without GPS verification.
```

Developer-facing logging should retain enough context to debug failures while avoiding unnecessary disclosure of private user data.

---

# 68. First Vertical Slice

**Historical foundation plan:** this slice now exists, and the full captured Washington roster is integrated. The original scope below is retained as implementation history, not an instruction to shrink the dataset or recreate the repositories. Remaining feature gaps are recorded in the status section; map migration follows Section 70.

Do **not** begin by loading every real Fly Washington airport and implementing every planned feature simultaneously.

The first goal is to prove the architecture.

## `core-passport`

Implement:

- program model;
- region model;
- airport model;
- minimal application bootstrap;
- basic responsive shell;
- basic map;
- marker state;
- basic airport selection;
- basic local persistence;
- basic check-in;
- basic progress calculation.

## `fly-washington`

Implement a small representative configuration:

```text
2 regions
3–5 airports
at least one airport with multiple stamp locations
```

Use actual program concepts where convenient, but the purpose is architectural validation.

The vertical slice should prove:

```text
program data
    ↓
shared core
    ↓
map
    ↓
airport selection
    ↓
check-in
    ↓
persistence
    ↓
visited marker
    ↓
updated progress
```

---

# 69. Second Architectural Validation

Shortly after the first Washington vertical slice works, create the minimal `explore-oregon` app.

It need only contain a handful of representative airports.

Its purpose is to prove:

- number of regions is configurable;
- stamps are not required;
- completion threshold can differ from 100%;
- styling can differ;
- verification rules can differ;
- the core contains no Washington-only assumptions.

The Oregon test application is an architectural canary, not a distraction from Washington development.

---

# 70. Recommended Implementation Phases

The next offline UX work is Phase U1 below; its responsive UX review is complete as recorded in Phase U1. M0/M1 retain the original migration sequence and evidence requirements; they are not instructions to reimplement the already deployed renderer.

Phases 0–9 below retain the original roadmap and exit criteria. Repository setup, the map/passport slice, basic filters, notes/JSON transfer, and the full captured roster are already implemented to the extent described in the status record; GPS, photos/ZIP, dated awards, advanced filters, achievements, and Oregon remain future work. Do not treat these phases as a blank-repository starting point or claim remote/device checks passed merely because tooling exists.

## Migration Phase M0 — Measure Washington Map Candidates

This approved migration begins before locking a production package. Fly Washington owns generation and the decision record; core owns the renderer/storage proof needed to evaluate candidates.

1. Pin a Protomaps build and extraction/tool versions. Record Washington's exact bounds/polygon and a chosen 25–50 mile buffer including border/coastal areas. Keep source, min zoom (initially 0), buffer, content policy, and styling comparable between candidates.
2. Generate PMTiles archives at maximum native zooms **9, 10, 11, 12, and 13**. Check in the reproducible script/commands and record source/build date, bounds, min/max zoom, exact archive bytes, resource bytes, checksums, and generation commands for each. Apply/record the Section 33.1 reduction policy consistently; distinguish extraction from any additional content filtering.
3. Compare statewide orientation and representative coastal, border, urban, rural, mountain, and seaplane airports, including label legibility, useful roads/towns, buffering, and detail when zoomed beyond native resolution. Program airports remain separate overlays in every comparison.
4. Measure mobile rendering performance and memory, real Pages Range responses, full-package download with bounded memory, local random reads, offline reload including all styles/sprites/glyphs/fonts/attribution, storage usage, and old/new coexistence during a failed update. Use the real candidate archive, not only a tiny fixture.
5. Select the lowest-detail uniform statewide package that meets those product needs. Start evaluation at z12; z11 or z12 is an expected likely result, not predetermined. Prefer an initial archive under 100 MB, but usefulness and measured browser behavior decide. Record separate archive, resource, installation, and update-space totals. The original planning edit contained expectations only; the implementation status and app release record now contain measured candidate sizes.
6. Record the chosen source/detail/buffer/content policy and measured acceptance evidence in the app's map-package decision record, with unresolved device coverage explicit. Uniform coverage is V1; higher zoom only around airports is a V2 optimization requiring a documented change if uniform coverage proves too large.

The core implementation owner must select and document the browser storage adapter only after demonstrating staged bounded-memory writes, incremental integrity checks, local PMTiles reads, crash-safe activation, persistence capability handling, and realistic update quota on target browsers. The app owner must validate the actual static endpoint and service-worker/resource routing. Failed assumptions block the dependent migration step until this plan is explicitly revised; they do not reopen MapLibre/PMTiles as an unbounded library comparison.

## Migration Phase M1 — Contracts, Rendering, and Offline Lifecycle

1. Core: introduce the Section 17 typed package/style contract, schema validation, and Section 33 storage abstractions based on M0 evidence.
2. Core: add MapLibre plus PMTiles integration and local default styles; preserve all dynamic overlays and product behaviors in Section 16.2. Add regression coverage while adapting renderer internals.
3. Core: implement explicit download/status/cancel/retry/update/delete UI, persistence/estimate handling, real availability checks, integrity verification, atomic activation, rollback, and cleanup. Validate full resource completeness.
4. Fly Washington: configure and publish the chosen versioned Washington package/resources and reproducible generation/release metadata; integrate app-shell routing and offline readiness.
5. Cross-repository: version and package the changed core after its checks, then update the app dependency, checked-in core tarball, and lockfile with `npm run core:pack`. Migrate Fly Washington from Leaflet/CARTO to the approved PMTiles config; CI must consume the packaged core independently.
6. Both repositories: complete unit/integration/E2E checks, real Pages and physical-device validation, and contract/development documentation. Record any narrow automated-browser limitation without reducing offline acceptance requirements.
7. Only after migration tests pass: remove obsolete Leaflet/CARTO dependencies, secrets, raster configuration, test intercepts, provider preferences, and setup instructions. Record the final implemented status separately from these approved requirements.

Exit criteria:

```text
measured Washington package and reproducible release record
    ↓
tested packaged core consumed by Fly Washington
    ↓
same PMTiles basemap online and fully offline after explicit installation
    ↓
honest readiness and safe failure/update/delete behavior
    ↓
existing airport/passport/appearance/accessibility behavior preserved
```

Migration phases record the map implementation and its remaining release gates; the original numbered roadmap follows for historical context and remaining non-map features.

## Phase U1 — Offline setup and trustworthy status (planned, not implemented)

Design-review artifact (2026-09-13): `fly-washington/docs/mockups/offline-access.html` is a self-contained interactive desktop/mobile mockup, with scenario controls and usage notes in its adjacent README. It demonstrates layout and simulated feedback only; production download/storage behavior is unchanged. Feedback revision (2026-09-19): one non-modal map card now serves first use and the persistent Offline access control on both layouts; installation help remains available, granted protection is hidden, and exception details expand on demand. Owner approval (2026-09-19): the revised desktop/mobile mockup is approved as the Phase U1 design baseline, including the centered responsive card, smaller Share glyph, consistent collapsible sections, numerical progress, cancellation, and subtle storage-protection feedback. This completes mockup design review; production implementation, lifecycle validation, and physical-device acceptance remain outstanding. No commit, push, or deployment is implied.

1. Follow the approved desktop/mobile mockups and Section 32.3 browser/PWA policy for first use, deferred setup, progress, verification, installed, failed, and missing-package states. Resolve the installed-app delete-control report using the actual final download status/build before assigning a cause.
2. Core: implement one readiness/state model, persistence rechecking, owned renderer-error recovery, and serialized/coalesced lifecycle refreshes; retain IndexedDB and current verification/update safety.
3. Core: implement the shared Offline access navigation control and reusable first-use/status card, grouped progress/actions, and accessible status UI in Sections 32.3-32.5. Test with synthetic programs independently of Fly Washington.
4. Fly Washington: integrate generic setup with app-owned installation guidance, shell readiness and build identification; use existing measured package metadata and release assets. No Washington storage logic moves into the app.
5. Complete Section 58.2 acceptance, package a new tested core version, update the consuming tarball/lockfile and documentation, and rebuild the actual local preview output. Physical installed-PWA testing must precede claims of full readiness. No commit, push, or deployment without the owner's instruction.

Exit criteria: users can discover and complete offline setup without searching My passport; they can see current progress and accurate readiness on both layouts; a verified package survives tested installed-app restart and supports all resources offline; stale warnings recover, healthy maps have no normal Delete action, and repair/cancellation are clear; saved visits and drafts remain intact.

## Phase 0 — Repository Foundation

### `core-passport`

- initialize TypeScript project;
- configure package build;
- configure lint;
- configure type checking;
- configure test runner;
- configure CI;
- establish public API;
- create initial models.

### `fly-washington`

- initialize frontend;
- add local `@passport/core` development dependency;
- configure lint/typecheck/tests;
- configure CI;
- configure GitHub Pages deployment;
- add placeholder branding/PWA manifest.

Exit criteria:

```text
both repositories build
both repositories run CI
fly-washington imports code from core-passport
```

---

## Phase 1 — Program/Map Vertical Slice

Implement:

- `PassportProgram`;
- regions;
- airports;
- map config;
- map rendering;
- airport markers;
- airport selection;
- airport detail panel;
- desktop/mobile structural layout.

Exit criteria:

```text
a small Washington dataset renders using only program configuration
```

---

## Phase 2 — Local Passport

Implement:

- IndexedDB persistence;
- check-in model;
- current/historical visits;
- edit visit;
- delete visit;
- visited airport state;
- visit history;
- progress calculation.

Exit criteria:

```text
check-in survives browser/application restart and updates progress
```

---

## Phase 3 — Filters and Trip Planning

Implement:

- filter architecture;
- map/list synchronization;
- Washington filter definitions;
- responsive filter UI;
- matching airport counts.

Exit criteria:

```text
filters consistently affect map and list on desktop and mobile
```

---

## Phase 4 — GPS Verification

Implement:

- browser geolocation service;
- stamp-location radius calculation;
- verification evidence;
- verified/unverified status;
- GPS E2E tests.

Exit criteria:

```text
check-ins may be verified against configured stamp locations but verification failure does not destroy user workflow
```

---

## Phase 5 — Notes and Photos

Implement:

- notes;
- attachment metadata;
- local attachment storage;
- image resize/compression;
- configurable attachment limit;
- photo display/delete.

Exit criteria:

```text
a visit can contain notes and photos across application restarts
```

---

## Phase 6 — Import and Export

Implement:

- documented JSON schema;
- ZIP export;
- attachment export;
- import validation;
- duplicate handling;
- restore flow.

Exit criteria:

```text
a user can export their passport, clear local data, import the backup, and recover equivalent passport state
```

---

## Phase 7 — Complete Fly Washington Dataset

Load and validate:

- all participating airports;
- all regions;
- stamp locations;
- available airport metadata;
- current award definitions;
- program-specific appearance;
- relevant filters.

Exit criteria:

```text
full dataset passes automated validation and application E2E
```

---

## Phase 8 — Oregon Architecture Validation

Create the initial `explore-oregon` repository.

Implement enough data/rules to ensure the core remains program-independent.

Refactor the core only where a genuinely reusable abstraction has emerged.

---

## Phase 9 — Optional Cloud Backup

Only after local/offline functionality is stable:

- optional Google authentication;
- Google Drive storage adapter;
- user-triggered backup;
- restore from Drive.

True multi-device synchronization should be treated as a separate feature.

---

# 71. Initial Technology Decisions

The following are architectural expectations:

```text
Language: TypeScript
Package system: npm-compatible
Shared code: @passport/core
Static hosting: GitHub Pages
Primary local structured storage: IndexedDB
Application form: PWA
Automated browser testing: Playwright or equivalent
Map renderer (approved migration): MapLibre GL JS
Basemap archive: PMTiles
Basemap source: OpenStreetMap-derived Protomaps basemap
Basemap hosting: static HTTP compatible with GitHub Pages and Range requests
Offline package storage: browser-managed persistent-capable storage behind a core abstraction
```

The current implementation uses TypeScript/DOM components, MapLibre GL JS, PMTiles, chunked IndexedDB via idb, Vitest, and Playwright. Leaflet/CARTO describes the historical released system. Map library selection is settled. The IndexedDB adapter has standalone lifecycle and browser coverage; physical-device storage/memory validation remains an M0 acceptance gate. MBTiles/browser SQLite is outside this architecture.

The original general library choices below remain areas for deliberate selection or evolution as needed; existing selections should not be reopened without a concrete requirement:

```text
frontend framework
IndexedDB wrapper
test runner
CSS/UI approach
schema validation library
ZIP library
image compression/resizing implementation
```

When choosing libraries, prefer:

- mature;
- well maintained;
- TypeScript-friendly;
- lightweight enough for a PWA;
- testable;
- usable on static hosting;
- permissively licensed;
- not dependent on a proprietary backend.

---

# 72. Definition of Done for Core Features

A feature is not complete merely because it works manually.

For a normal feature to be complete:

1. implementation exists;
2. TypeScript types are correct;
3. relevant unit tests exist;
4. relevant integration tests exist;
5. program configuration changes are validated;
6. E2E coverage exists where user-visible behavior warrants it;
7. lint passes;
8. typecheck passes;
9. build passes;
10. CI passes;
11. documentation/contracts are updated when public behavior changed.

---

# 73. Coding-Agent Instructions

For the next offline UX iteration, implement Phase U1 and Sections 32.3-32.5/34.1 only after the plan and download policy are approved. Use the bounded standalone automatic-download policy in Section 32.3; do not extend it to browser tabs, updates, cancelled attempts, or deliberately deleted maps. Treat the original offline brief as migration history where this dated plan explicitly refines UX. Preserve its package integrity and core/program boundaries.

Automated coding agents working in these repositories must preserve the architectural rules in this document.

Before implementing a feature, an agent should determine:

```text
Is this generic behavior?
    → core-passport

Is this a Washington fact, rule, dataset, asset, or appearance choice?
    → fly-washington

Is this only required by one program and not yet demonstrably reusable?
    → keep it in the program until reuse is established
```

Agents must not solve configuration shortcomings by adding program-name checks inside the core.

Agents should prefer adding a clearly typed capability to the program contract.

When adding a public core capability, agents must:

- add appropriate types;
- export only intended public APIs;
- add tests;
- update consuming integration tests;
- document any breaking behavior.

Agents must not introduce a backend dependency for functionality that can be provided locally.

Agents must not replace local-first behavior with cloud-only functionality.

For offline maps, follow the approved MapLibre/PMTiles design and Migration Phases M0/M1. Preserve current product semantics and independent airport/passport data. Keep Washington artifacts/policy in the app and generic renderer, storage lifecycle, status UI, and defaults in core. Do not substitute CARTO caching, public OpenStreetMap tile downloads, MBTiles, or a backend. Verify primary documentation for pinned APIs, asset/data licenses, browser support, and host limits; label expectations and experiments honestly.

Before declaring completion, prove local availability of the archive and every style/sprite/glyph/font/attribution resource, failed-update safety, eviction recovery, and the Section 58 behavior regressions. Update the public contract and consuming core tarball workflow. If an M0 assumption fails, stop the dependent work and document the architectural revision rather than adding an undocumented workaround. The earlier migration required Leaflet/CARTO removal only after migration tests passed; do not reintroduce that retired setup for Phase U1.

---

# 74. Architectural Review Questions

Whenever a significant new capability is proposed, evaluate it against the following:

### Repository ownership

```text
Which repository owns this?
Why?
```

### Program independence

```text
Does this introduce an assumption specific to Washington?
Would Oregon work without modifying the core?
```

### Offline behavior

```text
What happens with no network?
```

### User ownership

```text
Where is the user's data stored?
Can the user export it?
```

### Versioning

```text
What happens to existing stored data after this changes?
```

### Testing

```text
At what layer should this behavior be tested?
```

### UI configuration

```text
Is this semantic behavior or program-specific visual representation?
```

These questions should be used in code review as well as implementation planning.

### Offline-map acceptance

```text
Does MapLibre render the same program-owned Protomaps PMTiles basemap online/offline?
Are rendering/lifecycle/defaults in core and Washington artifacts/policy/releases in the app?
Are program airports, regions, stamps, visits, and marker state separate from PMTiles?
How does a first-time user discover offline setup, what starts the transfer, and what happens after defer/cancel/delete?
Which complete archive/resources are installed, and how is presence checked in this browser or installed-app context?
Is numerical progress continuously visible yet subtle on mobile and desktop, with verification separate from transfer?
Does the normal UI retain healthy maps and expose cancellation/repair without offering routine deletion?
Do recovered map errors clear without hiding unrelated failures, and is persistence rechecked?
Are shell, program data, user data, basemap, and persistence statuses independently accurate?
What happens on denied/full storage, interruption, corrupt bytes, eviction, and deletion?
Does a failed replacement keep the last known-good map and all passport data usable?
How are immutable map versions promoted/rolled back independently of core/airport data?
Where are the measured z9–z13 results, reproducible commands, and shipping-detail decision?
Are all Section 16.2 map behaviors and unfinished visits preserved?
Have actual Pages Range loading and complete cold offline startup been validated?
Which physical iPhone/iPad Safari and Android/Chromium results or pending checks exist?
Can the app build/test from the versioned core tarball without a sibling checkout?
```

Answers are specified in Sections 4, 6, 16–17, 32–34, 53–58, 61–62, and 70. An unresolved implementation choice requires a bounded validation task and named repository owner; it cannot substitute for these acceptance requirements.

---

# 75. Explicit Non-Goals for Initial Development

The following are not required for the initial product:

- mandatory user accounts;
- application-operated backend;
- server database;
- real-time multi-device sync;
- social networking;
- pilot leaderboards;
- continuous GPS tracking;
- cryptographically perfect location proof;
- native iOS application;
- native Android application;
- program administration backend;
- arbitrary third-party plugin system;
- splitting the core into many packages;
- combining all passport programs into one user-facing super-app.

Avoid building infrastructure for these until there is a concrete requirement.

The initial map migration also excludes the approaches listed in Section 33.7. In particular, no hosted-provider comparison/selector, per-airport high-zoom optimization, automatic browser-tab downloads or automatic transfers outside Section 32.3, or delta-update infrastructure is required.

---

# 76. Future Possibilities

The architecture should not prevent future features such as:

- Google Drive backup;
- multi-device synchronization;
- additional state programs;
- program administrator tools;
- downloadable updated airport datasets;
- flight-log integrations;
- digital award submission;
- richer anti-spoofing evidence;
- native application wrappers;
- shared pilot identity;
- program-specific notifications;
- temporary airport alerts.

These are future possibilities, not current requirements.

---

# 77. Architectural Invariants Summary

The following rules should remain easy to find because violating one generally indicates architectural drift.

1. **Each passport program is an independent application.**
2. **`core-passport` contains reusable behavior.**
3. **Program facts and rules belong to the program repository.**
4. **The core never depends on a program repository.**
5. **Programs do not depend on each other.**
6. **There is no required backend.**
7. **The application remains usable without an account.**
8. **Core passport functionality works offline.**
9. **The user's passport data is stored locally by default.**
10. **User data can be exported and restored.**
11. **Photos are attachments, not embedded into passport JSON.**
12. **Cloud storage is an optional adapter.**
13. **Regions, completion rules, verification, markers, and appearance are program-configurable.**
14. **The core must not assume Fly Washington's number of regions, completion percentages, physical stamps, or award rules.**
15. **Production program applications consume an explicit tested version of `@passport/core`.**
16. **Program data is validated automatically.**
17. **Important logic receives automated tests.**
18. **CI must pass before release/deployment.**
19. **Oregon should be used early to expose accidental Washington-specific design.**
20. **Do not generalize one-off behavior until a reusable pattern actually exists.**
21. **MapLibre GL JS and an OSM-derived Protomaps PMTiles basemap are the approved target; Leaflet/CARTO describes the historical system.**
22. **The same versioned basemap and effective local styles serve online and offline use.**
23. **Core owns generic map rendering/storage/lifecycle/status/defaults; programs own coverage, artifacts, versions, generation/releases, and visual overrides.**
24. **Airports, passport regions, stamps, visits, and marker state stay outside PMTiles.**
25. **Offline map availability requires complete verified bytes and all local rendering resources, not cached ranges or a historical download flag.**
26. **Map installation follows the discoverable Section 32.3 setup policy; updates remain explicit and shell/program precaching stays independent.**
27. **A failed update must retain the working map; map cleanup/deletion must never erase passport data.**
28. **Persistence requests, storage denial/quota, corruption, and eviction receive honest actionable states.**
29. **Basemap versions are independent of app/core and airport-data versions, with reproducible release/rollback records.**
30. **No backend, tile server, CARTO requirement, public OSM bulk tile download, or MBTiles solution is introduced.**
31. **Shipping detail/size is supported by the recorded z9–z13 experiment; its measured results supersede the original size/zoom expectations and do not imply complete device acceptance.**
32. **Renderer migration preserves selection, fitting, overlays, labels, filters, map/list behavior, responsive accessibility, appearance, and unfinished visits.**

---

# 78. Immediate Next Steps

Continue from the implemented MapLibre/PMTiles system and committed core 0.5.1 marker-gesture fix. The owner reports the application deployed and has confirmed desktop/mobile gestures locally; this is not complete installed-PWA offline acceptance. The next work is the planned Phase U1, not another renderer or storage migration.

## `core-passport`

1. Use the approved responsive Offline access design recorded in Phase U1 and the browser-manual/PWA-automatic direction in Section 32.3 as the implementation baseline.
2. Implement persistence rechecking, coherent readiness/renderer recovery, and visible setup/progress/maintenance actions through reusable core modules.
3. Add independent Section 58.2 regressions; preserve integrity, update/rollback, deletion isolation, and all Section 16.2 product behavior.
4. Package a new core version only after checks; do not overwrite the committed 0.5.1 archive to ship these changes.

## `fly-washington`

1. Reproduce the reported Chrome iOS 26 installed-app warning/delete inconsistency, recording build, URL, standalone context, and final download status. Keep browser-to-PWA storage separation distinct from an actual failed installation.
2. Integrate app-owned installation guidance and shell/build diagnostics with the reusable UI. Continue release-assets distribution and current Washington package; no archive regeneration is needed for this UX work.
3. Update the versioned core tarball and lockfile together; build/test without a sibling checkout. Rebuild the production preview served at port 5173 before physical testing.
4. Complete physical installed-app offline startup, unseen-area zoom, numerical progress/recovery/cancellation, internal cleanup safety, and visit transfer acceptance. Record remaining browser limitations honestly.

## Directly affected documentation follow-up

This edit changes planning only. Core/app READMEs, development notes, and offline-map API/release records must link to this plan and distinguish implemented manual downloads from planned setup. Their older unpublished/deployment-gate wording must be reconciled with verified release/device evidence during Phase U1. Preserve historical measurements and testing limitations rather than claiming unobserved acceptance.

Keep unrelated roadmap work visible: dated awards, precise stamp targets, GPS, advanced filters, photos/ZIP backup, achievements, Oregon validation, and registry publication remain separate. No production code, package contents, commit, push, or deployment changes are part of this documentation task.

---

# 79. Final Design Intent

The application should eventually make building a new aviation passport application feel much closer to configuring a product than forking an existing codebase.

Ideally, a new program repository supplies:

```text
branding
+
regions
+
airports
+
verification rules
+
completion rules
+
achievements
+
assets
```

and receives from `@passport/core`:

```text
PWA application
+
map
+
airport browsing
+
filters
+
check-ins
+
GPS verification
+
progress
+
achievements
+
offline persistence
+
notes/photos
+
import/export
```

That separation is the central architectural goal of the project.
