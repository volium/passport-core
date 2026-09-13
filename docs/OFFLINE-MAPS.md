# Offline map API — core 0.5.0

This is an implementation candidate, pending the deployment and physical-device release gates recorded in the consuming application's map decision record. Core can build and run domain, storage, and browser tests without a program repository or downloaded regional basemap.

## Ownership and dependencies

Core owns MapLibre GL JS 6.9.0, PMTiles 4.5.0, incremental SHA-256 through hash-wasm 4.12.0, IndexedDB through idb, and default styles from @protomaps/basemaps 5.7.2. The self-contained MapLibre worker is built with esbuild and distributed in the core package; consumers do not configure a renderer worker or import MapLibre themselves. Browser-only initialization is deferred until mounting. Vitest, Playwright, Vite, and esbuild are development tools.

Applications own geographic archives, coverage/detail choices, map release metadata, asset licensing/provenance, generation/release scripts, program data, appearance overrides, and the PWA shell/deployment. The dependency points from the app to core. Core has no imports, build hooks, credentials, fixtures, or CI checkout requirements tied to Fly Washington. The optional M0 harness accepts an explicitly supplied manifest for experiments; its default application tests use synthetic data.

## Configuration

`PassportProgram.map` now contains `center`, `zoom`, optional `markerDetailZoom`, and required `package: OfflineMapPackage`. See [contracts.ts](../src/map/contracts.ts) for the exact public types. The package declares stable identity, immutable version, archive URL/bytes/SHA-256, exact bounds, minimum/native maximum zoom, source/schema identifiers, attribution, license resources, and a complete resource inventory with light/dark style IDs. URLs can be relative to the deployment document base. Use immutable URLs under a versioned directory.

`defaultBasemapStyle(theme, archiveUrl, resourceBase, attribution)` generates reusable light/dark Protomaps schema-v4 styles. Applications can publish their own compatible style JSON as overrides. Styles may reference only the declared basemap vector source. Sprite sheets require both pixel densities and JSON indexes. Every font stack requires all 256 BMP glyph ranges; this intentionally trades a small resource overhead for predictable offline coverage. Extra formatted-text fonts, external style imports, and undeclared resources fail installation. The defaults flatten labels to their English or local name to keep font dependencies explicit. UI text uses the platform font stack; basemap labels use bundled glyphs, with local ideograph generation disabled.

Attribution stays visible on the map. License notices are verified package resources, independent of online attribution links. Public resource URLs must work at the app's repository subpath, with browser CORS permission if hosted on another origin. An online archive host must serve HTTP byte ranges; installing a full archive requires an ordinary complete HTTP 200 response.

## Lifecycle and storage

`OfflineMapManager`, `IndexedMapStorage`, `browserMapEnvironment`, and the relevant manifest/storage types are exported. Applications normally use the lifecycle UI supplied by `PassportApp`; they must not reimplement it.

The map database is `passport-maps:<encoded program ID>:<encoded package ID>`, separate from `aviation-passport:<programId>` and its schema-v1 visits. Immutable generations contain 1 MiB chunks plus installed metadata. Downloading streams bytes into chunks, incrementally hashes them, verifies exact sizes, checks all local resources and style dependencies, and validates archive format/zoom/bounds before atomically switching the inventory pointer. It does not hold an entire archive in browser memory. Random reads use a single IndexedDB transaction and a bounded buffer of at most 32 MiB. Concurrent reads can continue while a replacement downloads; mutation operations are serialized with program/package-scoped Web Locks. Generation-specific source keys and resource URLs prevent mixing versions. BroadcastChannel and visibility checks refresh other tabs. Missing bytes cause an explicit unavailable state.

Startup/foreground checks inspect the actual installed bytes, including integrity verification; metadata alone is not proof of availability. Verification can take several seconds for a regional archive while the airport list and passport remain usable. Unreferenced interrupted generations are cleaned during checks. An interrupted download is discarded and retried from the beginning, without pretending to support resumption.

Downloading is explicit and displays total bytes and progress, cancellation, failure/retry, and storage status. Persistent storage is requested when supported, and denial is reported without preventing an otherwise feasible install. Quota estimation reserves the new package plus 15% and 2 MiB of headroom beyond current usage; actual writes still handle quota failure. An existing map is retained during staging and failed replacement. One previous version remains available for explicit verified rollback. A further update may temporarily require three generations. After activation, older unreferenced generations are removed. Deleting a map clears its generations and metadata; it never clears visits, preferences, backups, or another program's map.

Cleanup reports its last reclaimed payload byte count through `OfflineMapStatus.reclaimedBytes` and the status UI; this excludes browser database overhead. Unsupported Web Locks disable safe package mutations with an explanation. Unavailable WebGL leaves the list, details, and passport operational. Storage persistence, quota, and browser eviction remain browser-controlled; a successful install is not a promise that the browser will retain data indefinitely.

Local sprites are decoded from data URLs and returned as `HTMLImageElement` through MapLibre's [custom image protocol path](https://github.com/maplibre/maplibre-gl-js/blob/v6.9.0/src/util/image_request.ts). This avoids the Blob-based image decoding failure observed in automated offline WebKit without requesting remote images. Renderer software notices are distributed in `dist/notices.txt` and must be precached with the shell.

## PWA integration and migration

Consumers precache the small app shell, program bundle, CSS, renderer, and worker, explicitly excluding regional archives and their separately managed resources. The optional `PassportApp` option `offlineShellReady: () => Promise<boolean>` supplies deployment-owned shell readiness. Core displays shell restart readiness, loaded program data, passport storage, and map availability separately. It never infers full offline readiness from `navigator.onLine`.

Version 0.5.0 replaces the raster `tileUrl`, `darkTileUrl`, attribution/style-selector configuration with the package contract. Update the program before consuming this release. Old provider preferences are ignored; appearance uses a program-scoped key with a read fallback for the old global preference. Visit IDs, date-only semantics, data storage, and backup schema are unchanged. Selection, hollow/filled region markers, label priority, quarter-step fitting, filters, map/list behavior, mobile previews, accessibility, appearance, and unfinished visit fields remain renderer-independent behavior.

## Verification and primary references

Run `npm ci`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `npm run test:browser` in this repository alone. Install Playwright Chromium first. Browser fixtures verify rendering, lifecycle, program isolation, draft/visit preservation, and the WebGL fallback without a final application.

Technical references: [MapLibre v6 worker integration](https://maplibre.org/maplibre-gl-js/docs/), [MapLibre API](https://maplibre.org/maplibre-gl-js/docs/API/classes/Map/), [PMTiles Source API](https://pmtiles.io/typedoc/interfaces/Source.html), [Protomaps basemap integration](https://docs.protomaps.com/basemaps/maplibre), [Web Locks](https://developer.mozilla.org/en-US/docs/Web/API/Web_Locks_API), and [browser storage quotas and eviction](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria). API capability checks are authoritative at runtime; automated desktop browser evidence does not establish physical iPhone/Android support.
