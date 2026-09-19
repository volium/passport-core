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

Activate the native file chooser synchronously from the user's button press, using the input's click method. Show instructions immediately and catch opening errors. Handle file cancellation, invalid or oversized JSON, program/schema mismatch, file-read failure, and storage-write failure. Preserve the existing add-only atomic merge and allow retrying the same file. If the merge succeeded but refreshing the view failed, report that distinction instead of claiming no data changed.

The [HTML file-input specification](https://html.spec.whatwg.org/multipage/input.html#file-upload-state-(type=file)) defines selection and cancellation; file-picker activation must stay in the user gesture. In the tested WebKit build, showPicker on a hidden input returned without a chooser, while click opened it; the implementation therefore uses click. A browser that silently refuses to open its native picker may supply neither cancellation nor an exception: retain the helpful chooser instructions, with a regular-tab fallback, rather than inventing a successful import or a timeout failure.

## Audit and acceptance

Reviewed core app.ts (backup, visit, generic storage messages), offline-access.ts (map and protection statuses), and the consuming app src (no separate transient notification system). Import's unbounded success and tab-dependent routing were inconsistent. The existing four-second visit feedback is intentional; map readiness is persistent state, not a confirmation toast.

Verify desktop and mobile full-width backup feedback, five-second expiry, repeated attempts, cancellation, errors surviving the prior success timer, independent export surfaces, and imports completing after a tab change. Test a native chooser activation as well as injecting files. Browser automation uses isolated browser contexts; it does not establish that a physical iOS Chrome Incognito picker works. That reported device-specific failure remains subject to reproduction.
