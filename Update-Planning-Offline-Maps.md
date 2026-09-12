# Codex Implementation Brief: Update `Planning.md` for Offline Maps

## Objective

Update the existing architecture and implementation plan in [`passport-core/Planning.md`](https://github.com/volium/passport-core/blob/main/Planning.md) so that it adopts a self-hosted, downloadable offline basemap based on **MapLibre GL JS + PMTiles + an OpenStreetMap-derived Protomaps basemap**.

This task is a documentation change only. Do not implement the map migration in this task unless separately requested. The updated planning document must be sufficiently explicit that a later coding agent can implement the feature across `passport-core` and `fly-washington` without rediscovering the architectural decisions.

## Repository and terminology note

The Git repository is named `passport-core`, while the existing planning document sometimes calls it `core-passport`. Preserve the document's established terminology unless correcting it comprehensively and consistently is intentionally included in the change. Do not introduce a third name.

## Settled architecture decisions

Treat the following as approved decisions, not open alternatives:

1. **MapLibre GL JS replaces Leaflet as the shared map renderer.**
2. **An OSM-derived Protomaps basemap stored as PMTiles is the default and primary basemap.**
3. **The same PMTiles basemap is used online and offline.** There is no online CARTO/offline PMTiles visual split.
4. **CARTO is no longer required by Fly Washington.** Remove CARTO API-key setup and CARTO caching assumptions from the target architecture. Hosted providers may remain a future optional `BasemapProvider` extension point, but they are not part of the initial implementation or a requirement for the abstraction.
5. **Each program owns its map package, coverage, version metadata, and program-specific appearance.** The shared core owns generic rendering, PMTiles integration, download/storage lifecycle, availability checks, and reusable default styling.
6. **Airports, passport regions, stamp locations, visits, and marker state do not belong in the PMTiles basemap.** Keep them as program data and dynamic MapLibre sources/layers. Airport identity and accuracy must remain independent of OSM basemap contents.
7. **Fly Washington initially uses a Washington extract with a 25–50 mile geographic buffer**, so areas near Oregon, Idaho, British Columbia, and the coast do not end abruptly at the state boundary.
8. **Start with maximum native basemap zoom 12 as an experimental target.** This is not a final size/quality commitment. Generate and compare real extracts before locking the shipping zoom.
9. **The offline map is an explicit, user-downloadable package**, not a mandatory large precache during PWA installation. The app shell and program data remain small and are cached independently.
10. **The browser must request persistent storage where supported and report real offline-map availability.** Browser-managed storage can be evicted, so a successful historical download must not be treated as proof that the package still exists.
11. **GitHub Pages remains the deployment target.** Online PMTiles reads use static hosting and HTTP Range requests; no tile server, proxy, database, API key, or application backend is introduced.
12. **Basemap releases are versioned independently from application data.** Updating airport or passport data must not require rebuilding the basemap, and updating the basemap must not alter user passport data.

## Required changes to `Planning.md`

Revise the document as a coherent whole. Do not merely append a new proposal while leaving contradictory decisions in earlier sections.

### 1. Update the status and current-state summary

Preserve the distinction between what is implemented today and what is newly approved but not yet implemented.

- Keep accurate historical/current implementation facts, including the current Leaflet/CARTO implementation, but label them clearly as the existing state to be migrated.
- Add an approved offline-map architecture update with the date of the edit.
- State that the migration implementation and validation remain pending.
- Do not falsely claim that MapLibre, PMTiles downloads, persistent storage, or the new offline UI already exist.
- Resolve or reframe statements such as:
  - “Fly Washington now configures CARTO only”;
  - “Map tiles remain outside service-worker caching”;
  - “detailed offline basemaps are not promised”;
  - “map library selection remains an implementation decision.”

The status section should make the transition legible: **current implementation = Leaflet/CARTO; approved target = MapLibre/PMTiles**.

### 2. Refine architectural principles and repository ownership

Update Sections 3 and 4 as needed so the ownership model is explicit.

`passport-core` / `@passport/core` owns:

- MapLibre renderer integration;
- registration and use of the PMTiles protocol;
- a typed basemap/offline-package contract;
- generic map-package download, update, delete, and availability behavior;
- browser storage estimation and persistence requests;
- reusable offline-map status UI and error states;
- default basemap styling that programs may override;
- rendering program overlays above the basemap;
- testable storage abstractions rather than browser-global logic scattered through UI code.

`fly-washington` owns:

- Washington map-package metadata;
- the generated/versioned Washington PMTiles artifact or its release location;
- geographic bounds and buffer;
- selected zoom/detail policy after evaluation;
- Washington-specific style overrides;
- airports and regions as separate JSON/GeoJSON program data;
- build/release automation that produces or publishes the Washington extract;
- app-level integration and E2E coverage.

Ensure the suggested repository layouts reflect these responsibilities. Use names that communicate intent; for example:

```text
passport-core/
└── src/map/
    ├── renderer/
    ├── basemap/
    ├── offline/
    └── style/

fly-washington/
├── src/program/
│   ├── airports.*
│   ├── regions.*
│   └── map.*
├── public/maps/
│   └── washington.pmtiles
└── scripts/ or tooling/
    └── map-package generation
```

This is illustrative; align it with the repositories' actual layout rather than forcing unnecessary moves.

### 3. Expand the program configuration contract

Update `PassportProgram` / `MapConfig` with a typed, program-supplied offline map-package definition. The final naming may follow established code conventions, but the contract must cover at least:

```ts
interface OfflineMapPackage {
    id: string;
    name: string;
    url: string;
    version: string;
    sizeBytes: number;
    bounds: Bounds;
    minZoom?: number;
    maxNativeZoom: number;
    attribution: string;
}
```

Also document:

- stable package identity;
- package version comparison/update detection;
- display size before download;
- attribution and licensing metadata;
- default basemap style plus program overrides;
- optional future provider extensibility without overengineering a multi-provider system now;
- validation failures for malformed configuration.

Keep semantic state separate from visual presentation. Region colors, visited/unvisited markers, selected markers, and completion styling remain program-controlled overlays and must survive the renderer migration.

### 4. Replace the map and offline caveat sections

Rewrite Sections 16, 17, 32, and 33 so the target behavior is unambiguous.

The revised requirements must state:

- the map is usable on the first offline launch **after the user has downloaded the program's offline package**;
- app-shell readiness, program-data readiness, user-data readiness, and basemap readiness are separate states;
- airports and passport features continue to work even if the basemap is absent or was evicted;
- when online and the complete package has not been downloaded, MapLibre may read required PMTiles byte ranges from static hosting;
- explicit download stores a complete verified package locally for offline use;
- the UI never labels the basemap “available offline” solely because some HTTP ranges or previously viewed areas may remain in cache;
- partial or interrupted downloads are not considered installed;
- an update should become active only after the replacement package is complete and validated, so a failed update does not destroy the last known-good package;
- users can retry, update, or delete a downloaded package;
- the system detects eviction/missing bytes and returns to “download required” rather than failing silently;
- the app requests `navigator.storage.persist()` where available and uses `navigator.storage.estimate()` for capacity/usage information;
- unsupported APIs or denied persistence degrade honestly and do not block core passport use.

Do not describe opportunistic service-worker caching of CARTO tiles as the offline solution. Do not require bulk downloading from public OpenStreetMap tile servers.

### 5. Define the map package contents

Document the initial basemap content policy:

Include useful orientation context such as:

- land and water;
- state/international boundaries;
- major rivers and geographic features;
- interstate, US, and state highways;
- major local roads appropriate to the chosen zoom;
- cities and towns;
- parks and national forests where useful.

Exclude or heavily reduce data with little value to an aviation-passport map:

- buildings and addresses;
- businesses and general POIs;
- parcels and house numbers;
- parking lots;
- high-detail residential streets, paths, and transit detail.

Explicitly state that participating airports are authoritative program data, not basemap features.

### 6. Add the pre-implementation map-size experiment

Add a concrete implementation phase before committing to the production package:

1. Extract Washington plus the agreed border buffer from a pinned Protomaps build.
2. Produce comparable PMTiles archives at maximum zooms 9, 10, 11, 12, and 13.
3. Record exact archive size, source/build date, bounds, zoom range, and generation command.
4. Compare visual quality and orientation usefulness statewide and around representative airports.
5. Test mobile rendering performance, range-request behavior on GitHub Pages, full-package download, offline reload, and storage usage.
6. Select the lowest-detail package that meets the product need; z11 or z12 is the expected likely outcome, not a predetermined result.
7. Prefer an initial target under 100 MB, but treat usefulness and measured browser behavior as the decision criteria.

Uniform statewide coverage is the V1 strategy. Higher zoom only around airports may be listed as a V2 optimization if uniform coverage is too large.

### 7. Specify package generation and release reproducibility

The plan must require:

- a pinned Protomaps source build/version or date;
- a checked-in generation script or documented reproducible command;
- explicit bounding box/polygon and buffer;
- explicit min/max zoom;
- deterministic output metadata where practical;
- generated archive checksum and byte size;
- license/attribution preservation for OpenStreetMap and Protomaps-derived content;
- separation of generated large artifacts from normal source history where repository/file limits make that appropriate;
- validation that the production static host supports byte-range requests;
- a documented release/rollback process.

Do not prescribe committing a large binary directly to Git unless its measured size and the repository's hosting limits make that intentional. The implementation agent should choose an appropriate static artifact location compatible with GitHub Pages and document it.

### 8. Update technology decisions

Move the following from “implementation choices” to approved technology decisions:

```text
Map renderer: MapLibre GL JS
Basemap archive: PMTiles
Basemap source: OSM-derived Protomaps basemap
Basemap hosting: static HTTP hosting compatible with GitHub Pages and Range requests
Offline package storage: browser-managed persistent-capable storage behind a core abstraction
```

Do not select MBTiles for the PWA. It would require browser-side SQLite or a translation/server layer and is not the target architecture.

### 9. Add testing requirements

Extend unit, integration, and E2E expectations to include:

- offline-package config/schema validation;
- package version and update detection;
- download progress and cancellation/interruption behavior;
- atomic install/update behavior;
- checksum or equivalent integrity failure;
- insufficient-quota and network-failure handling;
- persistence granted, denied, and unsupported cases;
- storage eviction or missing-package detection;
- deletion and redownload;
- MapLibre rendering with program overlays;
- preservation of marker selection, fit-to-airports behavior, map/list synchronization, filters, visited styling, labels, light/dark appearance, unfinished visit state, and accessibility behavior currently covered by tests;
- online PMTiles range loading from GitHub Pages;
- offline startup with a fully downloaded package;
- offline core workflow without a downloaded basemap;
- physical-device validation on iPhone/iPad Safari and Android/Chromium where available.

Browser-specific test limitations must be documented narrowly. Do not weaken the product requirement merely because one automated WebKit test environment is unreliable.

### 10. Update implementation phases and immediate next steps

Because the current document records an already-running vertical slice, do not rewrite history as though the repository were empty. Add a migration phase that sequences the work safely:

1. Generate/evaluate PMTiles candidates and record the decision.
2. Introduce typed map-package configuration and core storage abstractions.
3. Add MapLibre + PMTiles rendering while preserving program overlay behavior.
4. Implement download/status/update/delete UI and persistent-storage handling.
5. Configure and publish the Washington package.
6. Migrate Fly Washington from Leaflet/CARTO.
7. Update unit/integration/E2E coverage and documentation.
8. Remove obsolete Leaflet/CARTO dependencies, secrets, configuration, and setup instructions only after migration tests pass.

The plan must identify cross-repository versioning: publish/package the changed core, then update the checked-in core tarball consumed by Fly Washington according to the existing workflow.

## User-facing offline map states

Document a small, explicit state model. It should support at least:

```text
Not downloaded
Checking storage
Downloading (bytes and percentage when known)
Installed / available offline
Update available
Insufficient storage
Download interrupted or failed
Integrity check failed
Missing or evicted
Persistence granted / not granted / unavailable
```

The UI should present a concise readiness summary, for example:

```text
Offline availability
Application shell        Ready
Passport data            Ready
Washington basemap       68 MB · Available offline
User data                Stored locally
```

Exact wording is not fixed, but statuses must be accurate, accessible, and understandable without technical vocabulary.

## Important implementation constraints to preserve

The planning update must not regress or discard these existing decisions:

- separate program repositories and a reusable core;
- no required application backend or account;
- GitHub Pages static deployment;
- program-configured appearance and regions;
- dynamic visited/unvisited/selected airport styling;
- airport/list synchronization;
- responsive desktop and mobile behavior;
- local IndexedDB passport data and portable export/import;
- accessibility requirements;
- current fit-to-airports behavior and selection semantics;
- program data remaining usable if the basemap is unavailable;
- explicit core release and consuming-app tarball workflow.

The renderer migration may require rewriting map-specific internals and tests. It must not change these product behaviors unless the planning document clearly identifies and justifies a deliberate change.

## Assumptions to validate during implementation

The planning document should identify these as validation items rather than silently treating them as guaranteed:

- GitHub Pages serves the selected PMTiles artifact with correct byte-range behavior.
- The chosen browser storage mechanism can store and retrieve the measured archive reliably across target browsers.
- A complete archive can be downloaded without holding the entire file in memory.
- MapLibre/PMTiles can read the locally installed archive through the chosen storage adapter.
- Service-worker routing does not accidentally substitute a partial HTTP cache entry for an installed package.
- The app can keep the previous version usable during a failed update within realistic quota constraints.
- Required glyphs, sprites, styles, fonts, and other MapLibre resources are also locally available; a downloaded `.pmtiles` file alone is not sufficient if its style references remote assets.

If an assumption fails, the implementation should stop and revise the architecture explicitly rather than adding an undocumented workaround.

## Out of scope for the initial migration

- downloading tiles from `tile.openstreetmap.org`;
- CARTO tile prefetching or long-term caching;
- MBTiles in the browser;
- a tile server or application backend;
- delta/patch updates between PMTiles versions;
- automatic background download of large map packages without user action;
- per-airport high-zoom coverage optimization;
- multiple simultaneously selectable hosted basemap providers;
- embedding airport/passport program data in the basemap archive.

These may be reconsidered later through a documented architectural change.

## Source and licensing references

Use primary documentation when refining technical details:

- [MapLibre GL JS documentation](https://maplibre.org/maplibre-gl-js/docs/)
- [MapLibre PMTiles example](https://maplibre.org/maplibre-gl-js/docs/examples/pmtiles/)
- [PMTiles documentation](https://docs.protomaps.com/pmtiles/)
- [Protomaps basemap downloads](https://docs.protomaps.com/basemaps/downloads)
- [Protomaps basemap layers](https://docs.protomaps.com/basemaps/layers)
- [Protomaps static/cloud hosting guidance](https://docs.protomaps.com/pmtiles/cloud-storage)
- [MDN storage quotas and eviction criteria](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria)
- [OpenStreetMap tile usage policy](https://operations.osmfoundation.org/policies/tiles/)
- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)

Verify current APIs, browser support, licensing, attribution, GitHub limits, and hosting behavior during implementation. Do not copy estimates from the earlier discussion into the plan as measured facts.

## Required deliverable

Commit an updated `Planning.md` that:

1. contains no unresolved contradictions between the old CARTO/Leaflet approach and the approved MapLibre/PMTiles target;
2. distinguishes existing implementation from approved future work;
3. defines repository ownership and typed cross-repository contracts;
4. specifies offline-package lifecycle, honest readiness states, storage/eviction behavior, and update safety;
5. includes the measured-extract experiment and acceptance criteria;
6. updates technology choices, testing, implementation phases, invariants, review questions, and immediate next steps;
7. preserves unrelated requirements and the historical implementation record;
8. updates any directly affected repository documentation references identified during the edit, or records explicit follow-up tasks for them.

Before finishing, search the entire revised document for `Leaflet`, `CARTO`, `OpenStreetMap`, `tile`, `map library`, `offline`, `service worker`, `cache`, and `provider`. Every remaining occurrence must either describe the historical implementation, an explicitly optional future extension, a prohibited approach, or the approved target architecture accurately.

## Acceptance criteria

The documentation task is complete when another coding agent can answer all of the following from `Planning.md` alone:

- What renders the map?
- Where does the basemap data come from?
- Who owns the generic machinery and who owns the Washington package?
- How does online use differ from a complete offline installation?
- What must a user download, and how does the app know it is still present?
- What happens if storage is denied, full, interrupted, corrupted, or evicted?
- How are map updates versioned and installed safely?
- Which data remains outside PMTiles and why?
- How will z9–z13 candidates be generated and evaluated?
- What existing map behaviors must remain unchanged during migration?
- How will the implementation be tested on GitHub Pages and target mobile browsers?
- Which work happens in `passport-core` versus `fly-washington`?

If any answer remains “implementation decision” without a bounded validation task and ownership assignment, the planning update is not complete.
