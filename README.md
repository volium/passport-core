# @passport/core

Program-independent TypeScript implementation for local aviation passports. This repository is named `passport-core`; earlier sections of [Planning.md](Planning.md) call it `core-passport`. Both refer to this repository, publishing as `@passport/core`.

## Development

Requires Node.js 24 LTS and npm. From this repository:

```powershell
npm ci
npm run lint
npm run typecheck
npm test
npm run build
```

The public API is `src/index.ts`. The browser application is `new PassportApp({ program }).mount('#app')`; consumers also import `@passport/core/styles.css`. Pure domain functions can be imported in Node without a browser. Call `destroy()` before replacing a mounted app.

The implementation uses TypeScript, browser DOM components, Leaflet, and the `idb` wrapper over IndexedDB. Program identity, airport and stamp facts, regions, completion rules, map provider, branding, and editorial content belong to the consuming app. No Washington-specific imports or program-name branches belong here.

## Current milestone

Implemented: typed configuration, validation, responsive map/list/details, light/dark/system appearance, region/search/visit filters, date-only check-ins, repeat visits, notes, edit/delete, IndexedDB, unique-airport progress, and JSON backup/restore. Core 0.2.0 adds optional identifier aliases, addresses, runway reference data, cautions, and dated source links to `AirportDefinition`; search includes aliases and details render the reference information. Existing program configurations remain compatible, and no visit/backup migration is required. The app repository owns its PWA shell, manifest, full source-derived airport dataset, and browser tests.

Storage database: `aviation-passport:<programId>`, schema version 1, `checkIns` object store keyed by visit ID. Dates are ISO calendar dates with `timeKnown: false`; creation/update instants are ISO timestamps. Repeat visits remain separate records. Progress counts participating airports once, excluding unrelated programs. Empty regions are never complete. Count and percentage rules do not assume 100% completion.

Backup format: `{ format: 'aviation-passport', schemaVersion: 1, programId, exportedAt, checkIns, attachments: [] }`. The importer accepts at most 5 MB / 10,000 visits, validates identity, references, dates, notes, and duplicate IDs before writing, and adds new IDs in one transaction. Existing IDs are preserved even if imported records differ. Photos and ZIP backups are not implemented; nonempty attachments are rejected.

## Cross-repository workflow

Programs may set `map.markerDetailZoom` to use compact markers and hover labels below a zoom level. Washington uses 9 to keep the statewide roster legible; selected airports retain detailed markers and labels.

The sibling app consumes an explicit `vendor/passport-core-0.2.0.tgz` archive, checked into the app repository so CI does not need this checkout or an unpublished registry package.

After changing this core, run its checks, then from `../fly-washington` run:

```powershell
npm run core:pack
npm run lint
npm run typecheck
npm test
npm run test:e2e
```

Commit the app archive and lockfile together with consuming changes. Increment versions for distinct milestones rather than replacing earlier committed artifacts; refresh only the current unpublished version while developing it. Publishing and switching to a registry dependency remain deliberate later steps.

## Handoff

See [Planning.md](Planning.md), especially the implementation status near the top, and the app's `docs/DEVELOPMENT.md`. The full captured Washington roster is integrated; remaining work includes dated award eligibility, precise stamp targets, richer configurable filters, GPS evidence, photos, achievements, and Oregon validation. Update the implementation status and relevant contract documentation in every feature change.
