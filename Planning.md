# Aviation Passport Platform
## Architecture, Requirements, and Implementation Plan

**Status:** Full Washington airport roster integrated and locally tested; WebKit offline caveat remains (2026-09-06)

**Primary repositories:** `passport-core` (called `core-passport` below), `fly-washington`

**Future reference implementation:** `explore-oregon`

Core 0.4.2: approved legend uses equal-sized hollow/filled CSS circles inside the existing rounded box; Export/Import controls share typography, sizing, and alignment. Single-provider map errors no longer suggest switching styles. Fly Washington now configures CARTO only, with its existing key and native light/dark appearance. Core remains provider-independent.

## Implementation status — 2026-09-06

Approved map update (core 0.4.1): the initial map fits participating airport bounds to the measured viewport with marker/control padding and quarter-step zoom precision. Show all matches uses the same fitting logic; subsequent navigation is preserved. Map visits use hollow/filled region-colored circles without airplane/checkmark glyphs, retaining selected outlines and accessible visited labels. Browser coverage checks initial marker visibility across desktop/mobile sizes and visited appearance. Physical mobile acceptance follows deployment.

Explorer layout update: the owner approved the desktop approach in core 0.4.0. Persistent Explore / My passport tabs now control the content beside the anchored desktop map. The compact header holds overall progress and Appearance. Airport browsing, details, and passport content scroll independently. My passport contains regional completion, Export/Import, and program information; switching tabs preserves selection and unfinished visit fields. On mobile, the same tabs control the main content beneath the header, restoring Map/List state when returning to Explore. My passport is not a modal; airport details remain a full-screen mobile panel. Tests and packaging can proceed following desktop approval; physical mobile acceptance is planned after the next deployment.

Map preference update: core 0.3.0 supports program-configured map styles with optional native dark tiles, a saved per-program choice, and live appearance switching. Fly Washington offers OpenStreetMap and, when a dedicated CARTO Basemaps key is configured, CARTO Positron/Dark Matter as in the earlier `volium/fwpp` app. Provider configuration stays in the app; tile switching does not change map position, airport selection, or unfinished visits. Map tiles remain outside service-worker caching. CARTO setup and validation are documented in the app development notes.

UX update: clicking empty map space clears airport selection and closes details while preserving map position, zoom, region styling, and visited status. Dragging and zooming preserve selection; another marker click switches airports. This behavior belongs to the shared core; the app consumes the refreshed package and owns browser regression coverage.

The first runnable slice now spans both independent repositories. The long-term requirements below remain the roadmap, not a claim that every feature has been delivered.

- Core: TypeScript package `@passport/core` 0.4.2, public models/API, program validation, viewport-height explorer and My passport panel, Leaflet map with selectable styles, synchronized selection and alias-aware filters, IndexedDB schema v1, date-only visits, notes/edit/delete, regional progress, and validated JSON restore. Optional airport reference fields support identifiers, addresses, runways, cautions, and dated source links.
- App: full 115-airport program-map roster in seven regions, matched uniquely to OurAirports, 153 runway records, source stamp instructions including genuine multiple locations, deterministic generation and reconciliation report, light/dark/system appearance, PWA caching, and gated Pages workflow. The original five airport IDs are preserved. Source coordinates remain distinct from precise GPS targets.
- Maps: Fly Washington uses Leaflet with CARTO light/dark raster tiles and a dedicated Basemaps key. Core accepts program-configured providers. The worker does not cache or prefetch map tiles. Offline airport/passport functions are available after the production shell is cached; detailed offline basemaps are not promised. See app development notes for provider policy.
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
│   └── ...
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

The mechanism may use:

- npm link;
- a local package reference;
- a local packed npm package;
- another standard package-development mechanism.

Production builds and CI must **not** dynamically consume whichever core happens to be latest.

They must depend on an explicit version of `@passport/core`.

Example:

```json
{
  "dependencies": {
    "@passport/core": "^0.4.0"
  }
}
```

Core upgrades should therefore occur through normal dependency updates.

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

Conceptually:

```ts
interface MapConfig {
    initialView: {
        latitude: number;
        longitude: number;
        zoom: number;
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

Once installed/loaded appropriately, the application must continue to provide its core functionality without Internet access.

Offline capabilities include:

- opening the application;
- viewing static airport data;
- viewing the map to the extent locally cached map technology permits;
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

---

# 33. Map Tiles and Offline Caveat

Application functionality and airport data must be offline-first.

Third-party map basemap imagery/tiles may have separate caching, licensing, and offline limitations depending on the map provider selected.

The architecture must not make passport data inaccessible merely because basemap tiles are unavailable.

The selected map library/provider must therefore be evaluated specifically for:

- GitHub Pages compatibility;
- PWA behavior;
- offline/cache behavior;
- licensing;
- cost;
- marker customization;
- TypeScript support.

Map library selection remains an implementation decision.

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

---

# 66. Performance

The target dataset is small enough that premature optimization is unnecessary.

However, the architecture should avoid obvious inefficient patterns.

Requirements:

- avoid unnecessary rerendering of all map markers;
- filters should feel immediate;
- user data writes should not block UI unnecessarily;
- images should be resized asynchronously;
- initial bundle size should be monitored;
- airport data should not require network round trips after installation.

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
```

The following remain implementation choices and should be selected deliberately:

```text
frontend framework
map library
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

---

# 78. Immediate Next Steps

Implementation can begin with the repositories that now exist.

## `core-passport`

Create the initial foundation:

```text
TypeScript/package setup
src/models
src/app
src/map
src/persistence
tests
CI
public package API
```

Implement the initial models for:

```text
PassportProgram
RegionDefinition
AirportDefinition
StampLocationDefinition
CheckIn
```

Implement only enough application behavior to render a small program configuration.

## `fly-washington`

Create:

```text
src/program/program.ts
src/program/regions.ts
src/program/airports.ts
src/program/stamp-locations.ts
src/main.ts
tests/program
tests/integration
```

Begin with:

```text
2 regions
3–5 airports
at least one airport with multiple stamp locations
```

Do not yet enter the complete Washington dataset.

The first milestone is complete when the application can:

```text
load Fly Washington configuration
        ↓
render airports on the map
        ↓
select an airport
        ↓
open airport details
        ↓
create a local check-in
        ↓
persist it
        ↓
show the airport as visited
        ↓
update progress
```

At that point, the architectural foundation has been validated sufficiently to expand functionality and data.

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
