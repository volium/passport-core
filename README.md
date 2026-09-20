# @passport/core

Program-independent TypeScript implementation for local aviation passports. This repository is named `passport-core`; earlier sections of [Planning.md](Planning.md) call it `core-passport`. Both refer to this repository, publishing as `@passport/core`.

## Offline access (0.6.0)

The approved Offline access card is implemented with persistent numeric progress, reusable installation guidance, automatic storage-protection checking, and independent renderer recovery. Browser downloads remain manual; eligible standalone launches prepare the initial map automatically with Cancel and retained retry suppression. See [offline API and lifecycle documentation](docs/OFFLINE-MAPS.md). This revision is awaiting physical-device acceptance and deployment.

## Chrome on iOS import limitation

Each Import attempt uses a fresh file input and neutral no-selection feedback. This preserves visits and unfinished forms, ignores events from detached inputs, and does not automatically reload or retry. Physical-device testing reproduced the export/save followed by picker failure in Chrome on iOS, including on a standalone page without core. The owner could not reproduce it in Safari, including in the consuming app. Fresh inputs do not fix this issue; its exact browser/native cause remains unconfirmed. Save unfinished visits before reloading if the picker stops opening. See [the feedback contract](docs/FEEDBACK.md).

## Backup feedback (0.6.2)

Backup messages follow the [application feedback contract](docs/FEEDBACK.md). My passport export feedback spans the card content width. Import confirmations and cancellation expire after five seconds; chooser, progress, and error feedback remain local to their controls. Export says the backup was prepared, since the portable download API cannot confirm a file was saved. Native chooser activation and failure feedback are covered by browser tests; the reported physical-device Incognito issue still requires reproduction.

## Previous UI fixes (0.6.1)

Export preparation feedback appears beneath the initiating button for five seconds; export errors stay there until retried, independently of import/general notices. The offline card title retains announcement focus without a decorative outline, while keyboard controls keep visible focus. The map card displays download size without asking users to check storage headroom; quota checks and actionable errors remain. Full saved-package startup verification is unchanged and is being investigated separately.

## Development

Requires Node.js 24 LTS and npm. From this repository:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

The public API is `src/index.ts`. The browser application is `new PassportApp({ program }).mount('#app')`; consumers also import `@passport/core/styles.css`. Pure domain functions can be imported in Node without a browser. Call `destroy()` before replacing a mounted app.

The implementation uses TypeScript, browser DOM components, MapLibre/PMTiles, and the `idb` wrapper over IndexedDB. Program identity, airport and stamp facts, regions, completion rules, geographic map packages, branding, and editorial content belong to the consuming app. No Washington-specific imports or program-name branches belong here.

## Current milestone

Core 0.5.1 fixes wheel and pinch zoom over airport hit targets by mounting the overlay in MapLibre's canvas container. Map gestures keep page scale unchanged; page pinch-zoom remains available outside the map. Standalone browser regressions cover wheel zoom, touch zoom, and marker activation.

Core 0.5.0 adds explicit verified offline-map downloads, a local-resource MapLibre renderer, separate map storage, safe updates/rollback/deletion, and independent browser fixtures. See [the offline map contract and migration guide](docs/OFFLINE-MAPS.md). This is an unpublished implementation candidate; actual map-host and physical-device acceptance remain release gates.


Implemented: typed configuration, validation, responsive map/list/details, light/dark/system appearance, region/search/visit filters, date-only check-ins, repeat visits, notes, edit/delete, IndexedDB, unique-airport progress, and JSON backup/restore. Core 0.2.0 adds optional identifier aliases, addresses, runway reference data, cautions, and dated source links to `AirportDefinition`; search includes aliases and details render the reference information. The 0.2.0 additions were compatible; 0.5.0 requires the new map package contract. No visit/backup migration is required. Applications own their PWA shell, manifest, source-derived datasets, and integration tests; core owns its independent generic browser tests.

Storage database: `aviation-passport:<programId>`, schema version 1, `checkIns` object store keyed by visit ID. Dates are ISO calendar dates with `timeKnown: false`; creation/update instants are ISO timestamps. Repeat visits remain separate records. Progress counts participating airports once, excluding unrelated programs. Empty regions are never complete. Count and percentage rules do not assume 100% completion.

Backup format: `{ format: 'aviation-passport', schemaVersion: 1, programId, exportedAt, checkIns, attachments: [] }`. The importer accepts at most 5 MB / 10,000 visits, validates identity, references, dates, notes, and duplicate IDs before writing, and adds new IDs in one transaction. Existing IDs are preserved even if imported records differ. Photos and ZIP backups are not implemented; nonempty attachments are rejected.

## Cross-repository workflow

Programs may set `map.markerDetailZoom` to use compact markers and hover labels below a zoom level. Washington uses 9 to keep the statewide roster legible; selected airports retain detailed markers and labels.

Clicking empty map space clears airport selection and closes details without changing the map position or zoom. Markers retain their region and visited styling. Dragging or zooming preserves selection, and clicking another marker selects that airport directly. On mobile, the full-screen details retain the All airports button and Escape dismissal.

Historical raster contract (0.3.0-0.4.5, replaced in 0.5.0): core 0.3.0 added optional `map.styles: MapStyleDefinition[]`. Each style has a stable `id`, display `name`, `tileUrl`, and provider `attribution`; `darkTileUrl` optionally supplies native dark tiles. The first style is the default. A selector appears when more than one style is configured, and remembers the choice in localStorage under `passport:<programId>:map-style`. Missing/unavailable preferences fall back to the first style. Configurations without `styles` keep using the existing `map.tileUrl` and `map.attribution` fields.

In that historical renderer, style changes replaced only the tile layer and attribution, preserving map position, zoom, selection, and in-progress forms. Native dark tiles follow light/dark/system appearance without additional CSS dimming. Provider URLs and browser-safe credentials belong in the consuming program. Preferences are optional and are not part of passport backups; storage schema and backup format remain version 1.

Core 0.4.0 uses a viewport-height explorer with a compact header for overall progress and Appearance. Persistent Explore / My passport tabs sit above the sidebar content; desktop airport browsing/details and regional progress scroll independently beside a fully visible map. My passport contains regional progress, Export/Import, and program information. Switching tabs preserves airport selection and unfinished visit fields. On mobile, the tabs sit beneath the header; My passport replaces the main content area, while Explore restores its Map/List choice, filters, and map position. My passport is a regular tabpanel, with no Close button or modal focus trap. Arrow keys and Home/End switch tabs. Airport details remain full-screen on mobile with focus containment, inactive background controls, and Escape dismissal. Short mobile viewports allow page scrolling to keep controls reachable. The app root receives the `passport-app` class for layout.

The sibling app consumes an explicit `vendor/passport-core-0.5.0.tgz` archive, checked into the app repository so CI does not need this checkout or an unpublished registry package.

After changing this core, run its checks, then from `../fly-washington` run:

```powershell
npm run core:pack
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Commit the app archive and lockfile together with consuming changes. Increment versions for distinct milestones rather than replacing earlier committed artifacts; refresh only the current unpublished version while developing it. Publishing and switching to a registry dependency remain deliberate later steps.

## Historical implementation and handoff

See [Planning.md](Planning.md), especially the implementation status near the top, and the app's `docs/DEVELOPMENT.md`. The full captured Washington roster is integrated; remaining work includes dated award eligibility, precise stamp targets, richer configurable filters, GPS evidence, photos, achievements, and Oregon validation. Update the implementation status and relevant contract documentation in every feature change.

Core 0.4.1 fits all participating airports to the initial map viewport, with padding for markers and controls. Show all matches fits the filtered roster; later map navigation stays under user control. Unvisited markers are hollow region-colored circles and visited markers are filled, with accessible status labels and a separate selection outline.

Historical core 0.4.2: approved legend uses equal-sized hollow/filled CSS circles inside the existing rounded box; Export/Import controls share typography, sizing, and alignment. Single-provider map errors no longer suggest switching styles. Fly Washington then configured CARTO only, with its existing key and native light/dark appearance. Core remains provider-independent.

Core 0.4.3: approved visit feedback stays out of the map. Save confirmation uses a gray disabled button for four seconds with a screen-reader announcement. Deleted visits retain their details with a disabled confirmation, then collapse after four seconds (respecting reduced motion). Deletion updates history in place and preserves unfinished form entries. General feedback appears in the sidebar; backup feedback stays in My passport. Errors remain visible.

Core 0.4.4: airport cards, map labels, accessible marker names, and detail headings display the FAA identifier when supplied, falling back to the stable airport ID otherwise. Internal IDs, visits, backups, and alias search remain unchanged. That renderer used dedicated Leaflet panes for the selected marker and label above ordinary markers and labels; selection changes transfer that priority for every airport.

Core 0.4.5: mobile marker taps open a compact airport preview with name, visit status, region, and an explicit View details action. List selections and desktop selections open details directly. Mobile hides zoom buttons and uses 1.5px marker/legend outlines; desktop uses 3px. General labels appear together for visible airports when spacing permits from two zoom levels earlier; crowded views suppress general labels while preserving the selected label. Panning recomputes label visibility.

Saved visit confirmations keep the active button's green visual identity in a muted light/dark treatment while remaining disabled for four seconds. Deleted-visit confirmations retain their neutral disabled styling.
