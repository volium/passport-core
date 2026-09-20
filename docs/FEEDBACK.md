# Application feedback

This contract applies to the reusable core in every consuming app and both layouts. Fly Washington supplies program content, not a separate notification implementation.

| Kind / surface | Lifetime and ownership |
| --- | --- |
| Import completion or cancellation | Five seconds in My passport, full content width below the backup buttons. Never route to whichever tab happens to be open when the operation finishes. |
| Export prepared | Five seconds below the initiating card's controls. My passport uses its full content width; Offline access uses the storage section width. |
| File chooser instructions | Visible until selection, cancellation, a detected opening error, or another import attempt. Do not infer failure from elapsed time. |
| Preparing export / importing | Visible until completion or failure. Disable the initiating action during asynchronous work. |
| Backup error | Visible until another attempt replaces it. Explain recovery without claiming success or guessing that private browsing is unsupported. |
| Visit saved / deleted | Existing approved four-second disabled button confirmation and live announcement; deletion then collapses the saved detail. Preserve unfinished fields. |
| Visit, storage, or renderer error | Remains while actionable; cleared by the owning workflow on retry or resolution. |
| Offline readiness, progress, storage protection | Persistent state, updated from actual lifecycle/capability results; never removed by a backup timer. Granted protection remains quiet. |

Each transient status owns its timer. Repeating an action replaces that status and resets its timer. Destroying the app clears timers. A timer must not erase a newer error or another action's message. Use polite live regions and keep focus on the user's controls; no alert dialogs or automatic focus changes for confirmations.

## Export wording and browser limits

Use: **Backup prepared. Save the file from your browser to keep a copy of your visits.**

The current portable export creates JSON and requests a download using an anchor. It cannot confirm that the user saved the file; cancelling the browser UI must never leave a claim that a backup was saved. Do not use download initiation as proof of backup completion. The [HTML download algorithm](https://html.spec.whatwg.org/multipage/links.html#downloading-resources) leaves download handling and possible cancellation to the browser; its automation hooks are not application JavaScript completion events.

## Import and private browsing

Activate the native file chooser synchronously from the user's button press, using a fresh file input's click method for each attempt. Delegate selection/cancellation events from the app root; detached inputs must not change feedback for a newer attempt. Show instructions immediately and catch opening errors. Handle file cancellation, invalid or oversized JSON, program/schema mismatch, file-read failure, and storage-write failure. Preserve the existing add-only atomic merge and allow retrying the same file. If the merge succeeded but refreshing the view failed, report that distinction instead of claiming no data changed.

The [HTML file-input specification](https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)) defines selection and cancellation; file-picker activation must stay in the user gesture. In the tested WebKit build, showPicker on a hidden input returned without a chooser, while click opened it; the implementation therefore uses click. A browser that silently refuses to open its native picker may supply neither cancellation nor an exception: retain the helpful chooser instructions, with a reminder to save unfinished visits before reloading, rather than inventing a successful import or a timeout failure.

## No-selection recovery (0.6.3)

Chrome iOS device testing shows an intermittent no-selection result after exporting and saving in both normal and Incognito modes, with reload restoring Import. Incognito is not a necessary trigger. Our former cancellation wording was misleading: the browser can return without a selected file even when the user did not press Cancel. Both a cancel event and an empty change result now show **No file selected. Try Import again. If the chooser stays closed, save unfinished visits before reloading.** This remains transient for five seconds.

Each explicit attempt creates a fresh input, preserving the rest of the app and any unfinished visits. Device testing confirmed that fresh inputs do not resolve the Chrome-on-iOS failure; they remain an implementation detail, not a browser workaround. There is no automatic retry or reload and no delay that could lose user activation. No visits are read or written on the no-selection path. Physical Chrome iOS verification of export/save/import is required before declaring the reported defect fixed.

## Audit and acceptance

Reviewed core app.ts (backup, visit, generic storage messages), offline-access.ts (map and protection statuses), and the consuming app src (no separate transient notification system). Import's unbounded success and tab-dependent routing were inconsistent. The existing four-second visit feedback is intentional; map readiness is persistent state, not a confirmation toast.

Verify desktop and mobile full-width backup feedback, five-second expiry, repeated attempts, cancellation, errors surviving the prior success timer, independent export surfaces, and imports completing after a tab change. Test a native chooser activation as well as injecting files. Browser automation uses isolated browser contexts; it does not establish that a physical iOS Chrome Incognito picker works. The physical Chrome-on-iOS failure was reproduced independently of core; automated passing results do not establish a fix.

## Investigation outcome

Testing on the owner's iPhone with Chrome on iOS 26 reproduced the failure in normal and Incognito modes after export/save. Sixteen import-only attempts did not reproduce it. Waiting more than 16 seconds after an export and retaining exported Blob URLs both still reproduced it. A standalone page using a dummy Blob download and a directly tapped visible file input also failed: after the fourth export, five picker attempts returned cancellation within 10-18 ms without focus transitions. This requires neither core, passport storage, hidden-input activation, fresh-input replacement, nor URL revocation.

The owner could not reproduce the issue in Safari, including in the consuming app. The evidence strongly points to Chrome-on-iOS download/picker integration, but does not identify the exact native component or establish that all versions are affected. No browser fix or export alternative has been validated. Keep normal ten-second export URL cleanup and the existing neutral no-selection/reload guidance. Do not infer browser failure from a cancellation event alone.

The temporary unpublished 0.6.4 diagnostics, query flags, in-app log panel, and URL-retention experiment have been removed. The consuming app retains a standalone reproducer outside its deployment assets for a possible browser report. Capture exact Chrome/iOS versions when preparing that report; do not include real passport files.
