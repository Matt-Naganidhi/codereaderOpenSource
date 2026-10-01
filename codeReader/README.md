# Code Architect — Architecture Reference

## Purpose
Browser-based project analyzer: drop a folder → parse → visualize architecture, dependencies, classes, state flow, and generate/edit code. No server, all client-side JS.

## Module Map (load order matters)

| File | Role | Key exports/globals |
|---|---|---|
| `parser.js` | Multi-lang parser + syntax highlighter (Dart, Python, C, JS/TS, HTML, CSS, SQL, Go, Rust) | `parseFile()`, `highlightCode()`, `detectLanguage()`, `detectProjectType()`, `getFileColor()`, `getClassColor()`, `getFileIcon()`, `escapeHtml()`, `buildTree()`, `buildClassDependencies()`, `getCodeExtensions()`, `resolveImportUniversal()`, `_tokenSet()` |
| `core.js` | Incremental parse cache, change tracking, metrics, dead-code detection, IndexedDB persistence, dirty-panel rendering | `CORE`, `parseAllFilesIncremental()`, `setFileContent()`, `spliceFile()`, `computeMetrics()`, `computeDeadCode()`, `computeLineDiff()`, `refreshFromDisk()`, `markPanelsDirty()`, `renderPanelIfDirty()`, `updateTopbarStats()` |
| `ui-visual.js` | Visual no-code editor: Flutter widget-tree editing + Python class structure editing, span-spliced into real source | `renderVisual()`, `parseDartWidget()`, `findBuildWidgetTree()`, `VIS` |
| `testgen-dart.js` | Flutter/Dart test-suite generator (stack detection + IAP-grade templates) | `detectDartTestTargets()`, `generateDartTestBundle()` |
| `testgen-generic.js` | Python (pytest) + JS (vitest) scaffolds, dependency-free ZIP builder | `detectPythonTestTargets()`, `generatePythonTestBundle()`, `detectJsTestTargets()`, `generateJsTestBundle()`, `buildZip()` |
| `ui-testing.js` | Test Lab panel: suite toggles, preview, save-to-folder (readwrite picker) / zip download | `renderTesting()`, `TESTLAB` |
| `ui-tooltip.js` | Shared tooltip component (drag, freeze, inline edit, autocomplete) | `RichTooltip` singleton, `buildGraphTooltipTabs()` |
| `ui-dashboard.js` | Overview stats panel | `renderDashboard()` |
| `ui-explorer.js` | File tree + code editor + search | `renderExplorer()`, `viewFile()`, `reParseProject()`, `getCodeSnippet()`, `renderSnippetHtml()` |
| `ui-graph.js` | Canvas-based dependency graph (file/class/function levels) | `renderGraph()`, `drawGraph()`, `initGraphCanvas()`, `GRAPH_STATE` |
| `ui-classes.js` | Class inspector panel | `renderClasses()` |
| `ui-stateflow.js` | State architecture visualization (3-layer canvas) | `renderStateFlow()`, `redrawStateFlow()` |
| `ui-codegen.js` | Code generation panel | `renderCodeGen()` |
| `ui-export.js` | Export modal (tree, API docs, graph, summary) | `openExportModal()`, `runExport()` |
| `app.js` | Core state + file I/O + tab switching | `APP` (global state), `processProject()`, `renderAll()`, `navigateToFile()` |

## Core Data Model (`APP` global)

```
APP.files = { "path/file.dart": { content: "...", size: 1234 } }
APP.parsed = {
  projectName, projectType,    // "dart"|"python"|"javascript"|"c"|"sql"|"web"|"unknown"
  classes: [{ name, file, line, lang, superclass, widgetType, methods:[], fields:[], mixins:[], implements:[] }],
  functions: [{ name, file, line, params:[] }],
  imports: [{ from: "path/a.js", to: "path/b.js", fromLine }],
  providers: [{ name, type, file, line }],    // hooks, routes, context, signals
  enums: [{ name, file, values:[] }],
  classImports: [{ fromClass, toClass }],     // built by buildClassDependencies()
  funcImports: [{ fromClass, fromFunc, toClass }],
  packages: { deps:{}, devDeps:{}, flutterDeps:{} },
  widgets: []   // subset of classes with GUI role
}
APP.tree = { name, children:{}, files:[{ name, path }] }  // built by buildTree()
```

## Data Flow

```
User drops folder
  → readDirectory() / handleFolderInput()  →  APP.files populated
  → processProject()
      → detectProjectType()
      → parseFile() for each code file  →  classes, imports, functions, providers
      → buildClassDependencies()         →  classImports, funcImports
      → buildTree()                      →  APP.tree
  → renderAll()
      → each render*() reads APP.parsed/APP.files, writes to DOM
```

## Editing Flow
- ALL content mutations go through `setFileContent(path, content)` (core.js) — tracks `original` for diffs and sets `modified` flag.
- Explorer: viewFile() shows a VIRTUALIZED read view (only visible lines in DOM, fixed 19px line height). Multi-file tabs (`openTabs`). toggleEditorMode() switches to textarea. saveEditorContent() → reParseProject().
- `reParseProject()` is INCREMENTAL: `parseAllFilesIncremental()` re-parses only files whose content hash changed (CORE.parseCache), then marks non-explorer panels dirty — they re-render lazily on tab switch.
- Δ Diff button (modified files): line diff vs original + revert. Export modal can emit a unified patch of all changes.
- Visual Editor tab: no-code editing (see below) — every action is a span splice into real source.
- Quick-open: Ctrl+P (files), Ctrl+Shift+O (symbols). Search bar has Text / Regex / Symbols modes.

## Visual Editor (`ui-visual.js`)
- Dart/Flutter: `findBuildWidgetTree()` brace/string/comment-aware parses the `build()` return expression into a widget tree with exact source spans. Tree renders as nested cards: edit literal props (enum dropdowns for MainAxisAlignment/Colors/etc.), wrap (⊕), unwrap (⊖), reorder (↑↓), delete (✕), add child (＋). Each edit = `spliceFile()` on the span → incremental re-parse → tree re-renders from fresh source. Code pane shows the selected node's source; "✎ code" edits the subtree text directly (code → visual).
- Python: class structure editor — add/delete attributes (inserted into `__init__`) and methods (indentation-aware spans), rename member (file-scope) or class (project-wide), inline method body editing. Falls back to this editor for any language with parsed classes.
- Call hierarchy (uses/used-by from `classImports`) shown in the code pane.

## Session persistence & refresh (`core.js`)
- Directory handle saved to IndexedDB on open → landing page shows "↻ Reopen …" (permission re-requested).
- Topbar "⟳ Refresh" re-reads the folder from disk, updates changed/added/removed files, incremental re-parse.

## Test Lab (`ui-testing.js` + `testgen-*.js`)
- Detects the loaded project's stack from `APP.parsed`/`APP.files`: package name (pubspec), IAP layer (products class with `static const String` ids, service with `purchaseStream`), promo codes, Riverpod, sqflite, screens, `main.dart`.
- Generates a tailored bundle: helpers (fake `InAppPurchasePlatform`), unit (catalog invariants built from the ACTUAL discovered product ids), component (IAP pipeline: replay guard, verification gate, restored semantics), widget smokes per `*Screen`, real-SQLite integration, on-device e2e, plus runner script / CI yaml / TESTING.md.
- Suites appear only when their stack is detected; Python projects get pytest scaffolds, JS gets vitest.
- Delivery: "Save into project folder…" writes via a `readwrite` directory picker (files go to `test/`, `integration_test/`, project root — never into `lib/`), or "Download .zip" (dependency-free store-method zip in `buildZip()`).
- Baked-in rules: no `pumpAndSettle` (bounded pumps), construct services before registering the fake platform, delta-based DB assertions, I18n-key finders.

## Code health (dashboard)
- `computeDeadCode()`: classes/functions never referenced outside their own file (entry-point/test heuristics excluded).
- `computeMetrics()`: per-function cyclomatic complexity, nesting depth, LOC; largest files. Click-through navigation.

## Parser Architecture (`parser.js`)
- `parseFile()` dispatches to `parseDartFile()`, `parsePythonFile()`, `parseCFile()`, `parseHtmlFile()`, `parseCssFile()`, `parseJavaScriptFile()`, `parseSqlFile()`.
- Each returns `{ imports:[], classes:[], enums:[], providers:[], functions:[] }`.
- `highlightCode(escapedHtml, filePath)` dispatches to per-lang highlighter. Returns HTML with `<span class="syn-*">` tokens.
- Syntax token classes: `syn-kw` (keyword), `syn-type` (type/class), `syn-fn` (function), `syn-str` (string), `syn-num` (number), `syn-comment`, `syn-annotation` (decorator/preprocessor), `syn-op` (operator), `syn-const` (constant), `syn-import` (import/definition keyword), `syn-tag` (HTML tag), `syn-attr` (attribute), `syn-prop` (CSS property), `syn-sel` (CSS selector).

## Graph System (`ui-graph.js`)
- 3 levels: file, class, function. Stored in `GRAPH_STATE.level`.
- `initGraphCanvas(rawEdges, mode)` builds force-directed layout with hill/magnet repulsion physics.
- Folder nodes rendered as rounded rectangles. Parent folders = yellow `#fbbf24`, sub-folders = blue `#60a5fa`.
- Arrow keys navigate between nodes. Click pins tooltip. Shift+drag repositions node.

## Tooltip System (`ui-tooltip.js`)
- `RichTooltip` singleton manages instances by ID.
- Features: drag header to move, Tab key to freeze/accumulate (Tab again unfreezes all), click snippet lines to inline-edit with autocomplete dropdown.
- Tabs support: `inlineEditable` (click-to-edit snippets), `editable` (full textarea), `searchable` (filter items).

## State Flow (`ui-stateflow.js`)
- 3-layer canvas: UI → State → Data. Layers depend on `projectType`.
- For web/JS projects with HTML+CSS+JS files: shows markup/style/logic layers.
- For Dart: widgets / providers+notifiers / services.
- Edges built by scanning code references between layer nodes.

## Export System (`ui-export.js`)
- Modal with checkboxes for: file tree, API docs, dependency graph, project summary.
- Formats: plain text, markdown, JSON.
- Each section built independently by `buildExport*()` functions.

## How to Add a Feature
1. **New panel/tab**: Add button in `index.html` tabbar, panel div, render function, call from `renderAll()`.
2. **New parser language**: Add extension mapping in `detectLanguage()`, implement `parseFooFile()`, add case in `parseFile()`, add `highlightFoo()` + case in `highlightCode()`.
3. **New graph level**: Add button in `renderGraph()`, implement `renderFooGraph()` + `renderFooSelector()`.
4. **New export section**: Add checkbox in `openExportModal()`, implement `buildExportFoo()`, call from `runExport()`.

## CSS Variables (key theme tokens)
`--bg-deep`, `--bg-card`, `--bg-panel`, `--bg-input`, `--bg-hover`, `--border`, `--text`, `--text-bright`, `--text-dim`, `--cyan`, `--green`, `--purple`, `--amber`, `--pink`, `--red`, `--import-color`, `--export-color`, `--cyan-glow`, `--amber-glow`, `--green-glow`, `--red-glow`, `--font-body` (Outfit), `--font-mono` (JetBrains Mono).
