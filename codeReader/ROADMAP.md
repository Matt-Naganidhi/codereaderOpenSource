# Code Architect — Feature & Performance Roadmap

Based on a review of the current codebase (July 2026).

---

## Part 1: Performance Improvements

### P1. Incremental re-parse (highest impact)
`reParseProject()` (ui-explorer.js:225) re-parses **every file** on each editor auto-save (800ms debounce). On a 500-file project, one keystroke pause triggers hundreds of regex passes.

**Fix:** Cache parse results per file keyed by content hash. On save, re-parse only the edited file, splice its entities out of `APP.parsed` arrays, and merge new results. Only `buildClassDependencies()` needs a wider rebuild — and it can be limited to classes referencing the edited file's classes.

```
APP.parseCache = { "path": { hash, result } }
reParseFile(path) → splice old entities → parseFile → merge → rebuildDepsFor(path)
```

### P2. Virtualized source view
`viewFile()` (ui-explorer.js:100) builds a DOM node per line with syntax highlighting for the entire file upfront. A 10k-line file = 30k+ DOM nodes and a multi-second freeze.

**Fix:** Render only visible lines + buffer (~100 rows), swap on scroll. Fixed line height makes this simple: one spacer div sized `lines × lineHeight`, absolutely position the rendered window. Highlight lines lazily as they enter view.

### P3. Parse in a Web Worker
All parsing runs on the main thread — the loading overlay updates but the UI is frozen during `processProject()`. Move `parser.js` into a Worker; post files in chunks, receive parsed entities, keep the overlay animating with real progress (n/total files).

### P4. Cheaper dependency building
`buildClassDependencies()` scans every file's content for every class name — O(files × classes) regex work, re-run in full on each save. Pre-tokenize identifiers once per file into a `Set`; membership checks replace regex scans. Combined with P1, edits become near-free.

### P5. Micro-fixes (quick wins)
- **Bug:** `getParseableExtensions()` is defined **twice** in parser.js (lines 27 and 45); the second silently overrides the first. Delete the first.
- `new Blob([content]).size` on every auto-save → use `content.length` or TextEncoder once on demand.
- `renderAll()` re-renders all six panels even when only one is visible → render the active panel, mark others dirty, render on tab switch.
- Graph physics: stop the simulation once movement falls below epsilon instead of running while idle (verify in `initGraphCanvas`).
- Tab-switch `setTimeout(render, 50)` → use `requestAnimationFrame`.

---

## Part 2: New Features

### F1. Global project search (high value, builds on existing pieces)
Search across all files: plain text + regex, results grouped by file with highlighted snippets, click → `navigateToFile(path, line)`. Explorer search only covers the tree today; this is the most-missed feature for a code reader. Index identifiers during parse (shared with P4) for instant symbol search (`Ctrl+P` file jump, `Ctrl+Shift+O` symbol jump).

### F2. Dead code / unreferenced entity detector
You already have `classImports` and `funcImports` — invert them: any class/function with zero inbound references and not an entry point gets flagged. New dashboard card + filter toggle in the Classes panel. Very cheap to build, high perceived value.

### F3. Code metrics panel
Per file/class/function: LOC, cyclomatic complexity (count branch keywords — regex-friendly), max nesting depth, parameter counts. Highlight outliers ("top 10 largest functions"). Fits the existing dashboard card pattern.

### F4. Watch mode / refresh from disk
File System Access handles can be retained: store the directory handle, add a "⟳ Refresh" button that re-reads changed files (compare `lastModified`) and incrementally re-parses (uses P1). Optionally poll every few seconds for a live-updating graph while the user edits in their real editor.

### F5. Session persistence
Store the directory handle in IndexedDB (handles are structured-cloneable). On revisit: "Reopen last project?" → `handle.requestPermission()` → instant reload. Also persist UI state (active tab, graph level, pinned tooltips) in localStorage.

### F6. Graph export as image + Mermaid
Canvas graph → `canvas.toBlob()` PNG download button. Also add a Mermaid `graph TD` section to the export modal — pastes straight into GitHub/Notion. Both are small additions to the existing export system.

### F7. Diff view for edits
Track original content alongside edited content (`APP.files[p].original`). Add a "Changes" indicator per modified file in the tree and a side-by-side/unified diff tab. Export modal gains "changed files as patch".

### F8. Call hierarchy view
For a selected function: who calls it (up) and what it calls (down), as an expandable tree in the tooltip or Classes panel. Data mostly exists in `funcImports`; needs call-site line capture in the parsers.

### F9. More language parsers
`getCodeExtensions()` already accepts go/rs/java/kt/swift/rb/php, but `parseFile()` falls through to empty results for them. Go and Rust are the easiest wins (regex-friendly declarations). Follow the README's documented recipe: `parseFooFile()` + `highlightFoo()`.

### F10. Multi-file tabs in Explorer
Open files as tabs above the source view (like an IDE), preserving scroll/edit state per tab. Pairs well with P2 since state per tab is just `{path, scrollTop, editing}`.

---

## Suggested Order

| Phase | Items | Rationale |
|---|---|---|
| 1 | P5 (bugfix + quick wins), P1 | Foundation; everything edit-related speeds up |
| 2 | P2, F1 | Big UX wins for large projects |
| 3 | P3, P4, F2, F3 | Scale + insight features on the new parse cache |
| 4 | F4, F5, F6 | Persistence & workflow polish |
| 5 | F7–F10 | IDE-grade extras |
