# Location-assisted check-in (core 0.8.0)

The persistent Check in action beside Explore / My passport opens the same core-owned flow as Record a visit / Add another visit in airport details. It is an action outside the tablist. First use explains local evidence storage, export inclusion and the absence of continuous tracking. Later explicit check-in actions acquire a fresh location immediately; the browser may still request permission. An explanation preference is not a permission grant.

## Airport proximity policy

Programs opt in with checkIn: version, radiusMeters, maxAccuracyMeters, maxAgeMs, timeoutMs and timeZone. AirportDefinition.checkInRadiusMeters optionally overrides the default. Validate configuration at mount. Core has no Washington dependency. Airport coordinates are airport-level reference points; physical stamp locations remain independent instructions. No precise stamp coordinates are required. The selected airport must participate in the current program.

An acceptable fix must have valid coordinates, nonnegative finite accuracy no worse than the configured limit, and a timestamp no older than maxAgeMs and not in the future. The great-circle distance plus reported accuracy must fit inside the radius. This conservative boundary rule still relies on a browser-reported estimate; it is not proof of physical stamp collection, landing, identity, or official award validation. Poor accuracy is not suspicious behavior. Overlapping ranges produce a distance-sorted list and always require explicit airport selection. Outside-range and boundary uncertainty produce different explanations.

Acquire only during an explicit check-in request, with high accuracy requested, maximumAge zero, a bounded watch and a separate deadline (including permission waiting). Stop on the first usable fix, cancellation, error, timeout, hidden document or destruction. Ignore late callbacks. Reopening after cancellation starts a new attempt; no automatic background or foreground retry. No backend, reverse geocoding, map API or basemap installation is needed for local evaluation. Offline acquisition depends on the device/browser; manual fallback remains available.

## Interaction and drafts

First-use explanation → locating → one or more eligible airports → user selects airport → date/time, evidence summary and optional notes → explicit Save check-in. A manual airport search is always available; manual selection can subsequently request location against that airport. Permission denial, unavailable location, timeout and insecure context have actionable messages, Retry and manual fallback. Selection alone never writes a visit.

GPS date/time reflects location acquisition, not a later save. The form identifies the program timezone and permits switching to a manual date entry. The user can spend time writing notes without falsely stamping the save time as the visit time. Existing stamped airports indicate another visit is being added. Same-day duplicate warnings, earlier-visit choices and stamp-date correction confirmation reuse the existing saveRecord path. GPS does not rewrite a previously saved manual visit as verified.

Close/Escape stops acquisition, confirms discarding entered notes and restores focus. Saving disables duplicate submissions and closing. Storage/concurrency errors retain the form and notes; the original revision prevents stale overwrites. Existing Explore drafts survive the shortcut. Successful saving closes the dialog, updates progress/collection and shows existing transient feedback without moving the map or switching tabs.

## Data, ordering, editing and portability

visitedAt remains an ISO calendar date. Manual records retain timeKnown:false, no capturedAt/timeZone, and unverified status. Timed records have timeKnown:true, capturedAt (UTC instant), timeZone, and geolocation evidence: reported coordinates, accuracy, capture/check timestamps, airport target ID, a copy of target coordinates, calculated distance and the applied policy. Timezone determines the stored visit day, independently of the phone setting. Device location and clock are not trusted cryptographic evidence.

Database v4 retains existing stores and records, while preventing v3 writers from dropping timed evidence. Export schema v4 carries evidence and ordering; readers still accept v1–v3 backups. Older apps cannot open the upgraded database/read v4 exports. Imports validate evidence structure, coordinates, policy, target identity, timestamp/date consistency and distance against the saved target; never reinterpret old evidence using a changed roster. Existing add-only merge, program isolation and conflict checks remain. A valid imported claim is not an authenticated claim.

Notes-only edits preserve evidence. Changing the date asks before removing capture time, timezone and evidence, then saves a manual record using the existing stamp-move confirmations. Deleting a visit also deletes its attached evidence. Map lifecycle changes do not affect visits.

Fully timed, unconfirmed date groups default to capture-time order only when this preserves the relative order of existing members. Explicit confirmed order always wins; mixed manual/timed groups preserve existing order and append new entries deterministically. Unknown times stay unknown, and reordering never changes timestamps. Collection numbers continue to derive from collection dates and saved order, not an immutable ordinal on each visit.

## Validation and physical acceptance

Core synthetic tests cover radius/accuracy, stale/future fixes, per-airport overrides, withdrawn airports, timezone midnight/DST, migration, evidence validation, order and backup round trips. Browser coverage includes saving offline, multiple matches, permission denial, poor accuracy, outside range, cancellation/focus, date edits and mobile draft retention. Real-device acceptance must include iOS Chrome, Safari and installed PWA; Android Chrome/PWA remains a separate device check. Test airplane mode, denied/revoked permissions, approximate location, backgrounding, multiple nearby airports, long runways/reference points, duplicate same-day visits, export/import and reload.

Physical-phone testing needs HTTPS; an ordinary LAN HTTP address is not a secure context. Desktop localhost is useful for browser simulations. Installing a PWA does not guarantee permanent or shared permission. Local UI/state checks are not evidence of physical GPS accuracy or platform permission lifetime.

Primary API references: [W3C Geolocation](https://www.w3.org/TR/geolocation/) (source independence, reported accuracy, permission lifetime, watch/clearWatch, options), [Chrome secure-context requirement](https://developer.chrome.com/blog/geolocation-on-secure-contexts-only). API permission is separate from storage persistence.

## Unified airport recording action

Airport details has one Record a visit / Add another visit button. It always opens the shared dialog with the airport selected and Check in here / Add a manual visit choices, even after permission has been granted. Opening the chooser never acquires location. The manual choice uses the same modal date/notes form as the global shortcut after airport selection. There is no airport-specific manual-entry callback. Edit remains in Visit history. Secondary actions have a visible theme-colored surface and border at rest, with hover and keyboard focus feedback. The global Check in shortcut retains its nearby-airport flow. Recording and dialog action buttons share the primary action typography.

Button presentation uses the shared app action styles: semibold type, consistent padding, border radius and minimum touch size. Primary actions are filled; secondary actions remain outlined and visible at rest. Manual entry offers "Check in with GPS" to request GPS without saving immediately.
