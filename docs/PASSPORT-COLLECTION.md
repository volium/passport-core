# Passport collection and same-day ordering

Status: implemented locally in the uncommitted core 0.7.0 testing candidate (2026-09-26), following owner authorization after the planning commits. Physical phone and screen-reader acceptance remain pending. GPS date/time capture remains future work. No implementation commit, push, or deployment has been performed.

## Ownership and scope

passport-core owns reusable regional/collection views, visit editing, ordering interaction, persistence/migrations, backup validation, accessibility, and feedback. Programs supply airport IDs, display names/identifiers, region definitions/order/colors, and completion rules. No Washington-specific logic or basemap dependency belongs in this feature. fly-washington integrates a tested core package and validates its real roster and responsive layouts. Core tests use synthetic program data and run independently.

Keep overall progress in the existing page header; do not add a duplicate overall summary in My passport. Preserve the regional progress cards as the default Passport view. The companion My stamps view presents the collected-airport list. Both work without a downloaded or functioning basemap and independently of Explore search/region/visited filters.

## Regional view

Each region card retains its name, progress, and program color, and gains an accessible expand/collapse control. Expanded regions list all participating airports in that region alphabetically by airport name, using the existing displayed airport identifier. Clearly distinguish visited/collected and not visited with text and icons, not color alone. Preserve the program-defined region order. Allow more than one region to remain expanded.

Airport rows expose stamp date and repeat-visit information where applicable. Expanding an airport shows its individual visit history and notes with existing unverified status. Provide reusable Edit, Delete, Add another visit, and explicit Show on map actions. Reviewing or expanding a row must not switch tabs or move the map. Show on map deliberately switches to Explore and selects the participating airport, clearing incompatible Explore filters so its marker is visible; navigation must preserve unfinished fields rather than replace a draft silently. Reuse date validation, add-only visit import, storage operations, and feedback rules instead of introducing competing editors.

Keep regional cards prominent; this supersedes the earlier proposal to lead with a flat visited-airport list. Existing program information, backup controls, and full-width backup feedback remain accessible. Desktop retains the Passport panel beside the map; mobile uses the existing full-width Passport view. Preserve view/sort, expanded rows, scroll position, and drafts across tab navigation. Sorting is presentation and must not discard edits.

## My stamps view and sorting

List each collected airport once, with identifier/name, region, collection date, and repeat-visit count. Offer Airport name (alphabetical) and Collection order. Collection order is chronological by collection date, oldest first, with a separate group per calendar date. Same-day ordering represents the sequence of stamp collection, not multiple completion credits. Region browsing already lives in the regional view; it need not be duplicated as another flat-list grouping control.

The no-visits state explains that collected stamps will appear after the first visit and offers Explore airports. Regional view still shows all regions and unvisited airports. Keep recorded history when an airport stops participating; exclude it from current completion as configured, but keep it accessible in My stamps with a clear participation label. Records missing current metadata remain accessible in My stamps under their stable airport ID with an explanation. Nonparticipating or missing airports have no Show on map action, and do not add completion credit.

## Stamp collection versus repeat visits

For this phase, the first chronological visit to an airport means its stamp was collected. There is no separate physical-stamp checkbox. Each airport contributes at most one stamp to current completion under the existing program rules. All repeat visits and notes remain individual records; later visits do not duplicate the stamp or change its collection position.

When a new visit or date edit predates the current collection date, require confirmation before committing the change: 'This visit predates your recorded stamp collection. Saving it will move this airport's stamp to September 10. Your other visits will be kept.' Use the actual affected date, with Save and move stamp and Cancel. Cancellation preserves the entered draft and leaves persisted records/order unchanged. Saving moves the single stamp to the earlier date, initially last in that day's group, and removes its old order reference atomically. Other visits remain intact. This confirmation is intentional, not an ordinary transient toast.

A repeat visit on the collection date does not itself create another stamp or reorder the airport. Adding a later historical visit that is not earlier than collection follows ordinary visit behavior. Changing a visit date is the only route for moving between date groups; dragging never changes dates.

## Reorder within one date

A date group with multiple collected airports has a Reorder action. Entering this mode reveals drag handles, a visible insertion indicator, and Save order / Cancel. Permit only one active ordering draft at a time; do not silently discard it when another group or view is requested. There are no visible Move earlier / Move later buttons. A group with one stamp needs no reorder action.

Drag starts from the handle. On touch devices, ordinary scrolling continues outside the handle. Clearly show the lifted item and valid insertion position. Restrict destinations to the same date group; another date is not a valid drop target, and dropping outside a valid target restores the draft position. Escape/pointer cancellation abandons the current drag without saving. Save order persists the entire group atomically; Cancel restores the order from before entering reorder mode. Do not write on each pointer movement.

The handle is also keyboard accessible: Space/Enter picks up and drops an item, arrow keys move within the same date, and Escape cancels the active move. Focus follows the moved entry. Announce the airport, date, position, allowed movement, and completion/cancellation to screen readers. Keep focus visible, preserve sufficiently large touch targets, and respect reduced motion. This keyboard path replaces visible up/down controls; it does not remove the accessible non-pointer interaction.

New manual stamps append to their date group by default. Show brief local feedback such as 'Stamp added last for September 12. You can change its order.' This is a default placement, not evidence of the actual travel sequence. Existing same-day records have unconfirmed order and may initially display alphabetically with that qualification; never infer actual travel order from createdAt, record IDs, import order, or database iteration. Saving a deliberate order confirms the user's chosen sequence. A date-level confirmed flag records whether its full sequence was explicitly saved; appending a new stamp makes the date unconfirmed while retaining the relative order of existing entries.

## Persistence, portability, and concurrency

Current CheckIn stores an ISO calendar date and timeKnown: false. Do not invent midnight or use record creation time as a visit timestamp. Store collection ordering separately from visit timestamps, scoped by program and date, using stable airport/visit identities, not array positions in the program roster or names.

The implemented representation is a per-program/date ordered list of airport IDs plus a confirmed boolean. The decisions below specify corrections, deletion, and merges. The authoritative model must produce one collection entry per airport from visit history, permit no duplicate IDs or cross-date membership, and keep order consistent when visits change. An unchanged group must retain its order when an unrelated visit is saved.

Ordering belongs in the passport IndexedDB database, not map storage or localStorage. The version-2 database migration adds orders and meta stores without rewriting checkIns. Legacy groups have no saved order and display alphabetically by airport name until reconciled; generated persisted defaults use stable airport IDs and remain unconfirmed. Map installation/deletion must never affect ordering. An order-save failure keeps the draft and shows an actionable local error rather than claiming success. Detect changes from another tab or an import while reordering; do not overwrite newly added/deleted visits with a stale ordering draft.

Backups must preserve explicit order and confirmation metadata through export/import. Legacy schema-v1 backups remain readable and must not fabricate confirmed order. Version the new export contract deliberately; do not write new required fields into an unchanged v1 contract. Validate program identity, dates, duplicates, membership, size limits, and order references before an atomic merge. An old backup without ordering must not erase the user's existing explicit order. Conflicting explicit orders and imports that move collection dates require an explicit import confirmation; confirmed local order wins. Preserve the existing duplicate-visit-ID and add-only safety guarantees.

## Future GPS check-in

GPS check-in may capture date/time and verification evidence later. Known times may establish a default sequence, but manual placement remains separate metadata and never rewrites a captured timestamp. A manual entry can be positioned among timed entries on the same collection date. Do not implement GPS capture in this phase. Define timezone/calendar-day grouping before mixing GPS timestamps with manual calendar dates.

## Acceptance and implementation sequence

1. Review the persistent ordering/confirmation model and backup version, including the decisions below. Specify migration and merge behavior before touching stored data.
2. Implement core grouping/projection, unique-airport completion, date corrections, ordering transactions, migration, and versioned backup tests using synthetic programs.
3. Build expandable regions and My stamps, reusable visit-history/editing UI, date-restricted drag handles and keyboard support. Preserve drafts, focus, scroll, Explore filters, map position, and existing local feedback behavior.
4. Cover desktop/mobile interaction, pointer cancellation, invalid cross-date drops, Save/Cancel, legacy unconfirmed ordering, repeat visits, earlier-visit confirmation, last-visit deletion, import conflicts, storage failure, and stale cross-tab drafts. Check escaped notes/names and accessible announcements.
5. Validate reload and backup round trips preserve order, and Passport browsing/editing work with no basemap. Integrate the packaged core in Fly Washington and test actual region/airport data. Physical phone dragging, scrolling, and screen-reader behavior need acceptance; desktop automation is not sufficient evidence.

Do not declare completion solely because drag animation works: saved order, migration, restore, and correction behavior are part of the feature.

## Implemented storage and conflict decisions

- Database version 2 keeps checkIns unchanged, adds orders keyed by ISO date ({date, airportIds, confirmed}), and a meta revision counter. Databases remain isolated by program ID. The migration is additive. A blocked upgrade explains that older tabs must be closed before reloading.
- One read/write transaction updates visits, reconciles all collection memberships, and increments the revision. Removing an earliest visit moves the stamp to the next chronological visit; tied visits on that date retain membership. Removing the last visit removes the stamp. Deletion confirmation describes the resulting stamp change. Moving to a different day appends the stamp, and adding a member marks that day's order unconfirmed without changing the existing relative sequence. Removing a member alone retains a confirmed remaining sequence.
- Reorder drafts capture a revision. A stale save is rejected rather than overwriting changes; Cancel reveals the latest collection. Visit drafts are retained across view switches and unrelated updates. A draft concerning an airport changed elsewhere is kept but cannot overwrite that update; cancel/reopen after reviewing the conflict. Explore also provides Cancel draft.
- Export schemaVersion 2 requires an orders array covering every collected airport exactly once on its derived collection date. Dates, membership, duplicates, confirmation flags, program identity and size limits are validated before import. V1 backups remain supported and cannot erase explicit local order. V2 can retain visits to airports no longer in the current roster. Old version-1 readers cannot read v2 exports.
- Import remains add-only by visit ID. Existing confirmed local date order wins over incoming order. With no confirmed local date order, the imported sequence is used for compatible members, followed by remaining members. A date is confirmed only if the imported confirmed sequence covers the entire resulting group. Earlier-date changes and differing confirmed orders show a review dialog before the atomic merge; Cancel changes nothing. New default positions are explicitly unconfirmed.
- The app's revision check runs inside the storage transaction. Foreground refresh reads passport records only, without rechecking the basemap. Order is never stored in map databases, and there is no new dependency on the Washington app.

## Local acceptance checklist

Before testing a storage upgrade, keep a JSON export of existing visits. An older core build requesting database version 1 cannot open an upgraded version-2 database; use the updated app and its portable backups rather than downgrading the stored database.

1. Open My passport, expand multiple regions, and check visited/unvisited rows. Explore filters must not reduce this list.
2. Add and edit visits within a row. Switch views/tabs while writing notes and verify the draft remains. Test repeat visits and an earlier historical visit, including cancelling its confirmation.
3. Open My stamps and switch between Airport name and Collection order. Enter Reorder on a date with several airports; drag only by a handle within that date. Check Save order, Cancel, an invalid drop, normal scrolling outside handles, and keyboard Space/arrows/Escape.
4. Reload and confirm the saved order remains. Export/import it and confirm v2 ordering survives; import an older backup and confirm existing explicit order is preserved.
5. Check desktop and physical mobile layouts, touch dragging, light/dark appearance, focus and screen-reader announcements. Test without a basemap. Report any friction before committing this implementation.

The regression suites cover storage migration/reconciliation, stale transactions, versioned backups, UI confirmation, pointer/touch/keyboard interaction, and existing app behavior. Physical-device and assistive-technology acceptance are still required.

API references: [IndexedDB transactions](https://developer.mozilla.org/en-US/docs/Web/API/IDBDatabase/transaction) and [pointer capture](https://developer.mozilla.org/en-US/docs/Web/API/Element/setPointerCapture).
