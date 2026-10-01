/* ═══════════════════════════════════════════════════
   Code Architect — core.js
   Incremental parse cache, change tracking, code
   metrics, dead-code detection, session persistence
   (IndexedDB), dirty-panel rendering.
   Loads after parser.js, before all ui-* modules.
   ═══════════════════════════════════════════════════ */

const CORE = {
  parseCache: {},        // path -> { hash, result, tokens }
  dirtyPanels: new Set(),
  metrics: null,         // computed lazily, invalidated on parse
  deadCode: null,
  dirHandle: null,       // FileSystemDirectoryHandle of current project
};

/* ═══ HASHING ═══ */

function _hashStr(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return h + ':' + s.length;
}

/* ═══ CENTRAL FILE MUTATION — tracks original content for diffs ═══ */

function setFileContent(path, newContent) {
  const f = APP.files[path];
  if (!f) return;
  if (f.original === undefined) f.original = f.content;
  f.content = newContent;
  f.size = newContent.length;
  f.modified = newContent !== f.original;
}

function getModifiedFiles() {
  return Object.keys(APP.files).filter(p => APP.files[p].modified);
}

/* ═══ INCREMENTAL PARSE — only re-parses files whose content hash changed ═══ */

function parseAllFilesIncremental() {
  const parsed = APP.parsed;
  parsed.classes = []; parsed.imports = []; parsed.providers = [];
  parsed.enums = []; parsed.functions = [];

  const codeExts = new Set(getCodeExtensions());
  const allCodeFiles = Object.keys(APP.files).filter(f => codeExts.has(f.split('.').pop().toLowerCase()));

  // Prune cache entries for files that no longer exist
  for (const k of Object.keys(CORE.parseCache)) if (!APP.files[k]) delete CORE.parseCache[k];

  for (const path of allCodeFiles) {
    const content = APP.files[path].content;
    const hash = _hashStr(content);
    let entry = CORE.parseCache[path];
    if (!entry || entry.hash !== hash) {
      entry = { hash, result: parseFile(path, content), tokens: _tokenSet(content) };
      CORE.parseCache[path] = entry;
    }
    const result = entry.result;
    parsed.classes.push(...result.classes);
    parsed.enums.push(...result.enums);
    parsed.providers.push(...result.providers);
    if (result.functions) parsed.functions.push(...result.functions);

    // Resolve imports to project files
    const lang = detectLanguage(path);
    for (const imp of result.imports) {
      if (lang === 'dart' && (imp.raw.startsWith('package:') || imp.raw.startsWith('dart:'))) continue;
      if (lang === 'c' && imp.type === 'system') continue;
      if (lang === 'go' || lang === 'rust') continue; // module systems not path-mapped
      if (lang === 'javascript' && !imp.raw.startsWith('.') && !imp.raw.startsWith('/')) continue;
      if (lang === 'python' && !imp.raw.startsWith('.') && imp.type === 'import') {
        const resolved = resolveImportUniversal('', imp.raw, lang);
        if (resolved && APP.files[resolved]) parsed.imports.push({ from: path, to: resolved, fromLine: imp.line });
        continue;
      }
      const dir = path.split('/').slice(0, -1).join('/');
      const resolved = resolveImportUniversal(dir, imp.raw, lang);
      if (resolved && APP.files[resolved]) parsed.imports.push({ from: path, to: resolved, fromLine: imp.line });
    }
  }

  rebuildWidgets();
  CORE.metrics = null;
  CORE.deadCode = null;
}

function rebuildWidgets() {
  const p = APP.parsed;
  if (p.projectType === 'dart') {
    p.widgets = p.classes.filter(c => c.widgetType && c.widgetType !== 'notifier' && c.widgetType !== 'bloc');
  } else if (p.projectType === 'python') {
    p.widgets = p.classes.filter(c =>
      c.widgetType && (c.widgetType.startsWith('pyqt') || c.widgetType.startsWith('tkinter') ||
      c.widgetType.startsWith('django') || c.widgetType.startsWith('flask')));
  } else if (p.projectType === 'javascript') {
    p.widgets = p.classes.filter(c => c.widgetType && (c.widgetType.startsWith('react') || c.widgetType === 'web-component'));
    const reactComps = p.providers.filter(pr => pr.type === 'ReactComponent');
    for (const rc of reactComps) {
      if (!p.widgets.find(w => w.name === rc.name)) {
        p.widgets.push({ name: rc.name, file: rc.file, line: rc.line, widgetType: 'react-functional',
          lang: 'javascript', methods: [], fields: [], isAbstract: false, superclass: null, mixins: [], implements: [] });
      }
    }
  } else {
    p.widgets = p.classes.filter(c => c.widgetType);
  }
}

/* ═══ DIRTY-PANEL RENDERING — render only what's visible ═══ */

function corePanelRenderers() {
  return {
    dashboard: typeof renderDashboard === 'function' ? renderDashboard : null,
    explorer:  typeof renderExplorer  === 'function' ? renderExplorer  : null,
    graph:     typeof renderGraph     === 'function' ? renderGraph     : null,
    classes:   typeof renderClasses   === 'function' ? renderClasses   : null,
    state:     typeof renderStateFlow === 'function' ? renderStateFlow : null,
    codegen:   typeof renderCodeGen   === 'function' ? renderCodeGen   : null,
    visual:    typeof renderVisual    === 'function' ? renderVisual    : null,
    testing:   typeof renderTesting   === 'function' ? renderTesting   : null,
  };
}

function markPanelsDirty(names) {
  const all = names || Object.keys(corePanelRenderers());
  for (const n of all) CORE.dirtyPanels.add(n);
}

function renderPanelIfDirty(tab) {
  if (!tab || !CORE.dirtyPanels.has(tab)) return;
  const fn = corePanelRenderers()[tab];
  if (fn) { fn(); CORE.dirtyPanels.delete(tab); }
}

function activeTabName() {
  return document.querySelector('.tab-btn.active')?.dataset.tab || null;
}

function updateTopbarStats() {
  const p = APP.parsed;
  const codeExts = new Set(getCodeExtensions());
  const codeFiles = Object.keys(APP.files).filter(f => codeExts.has(f.split('.').pop().toLowerCase()));
  const totalLines = codeFiles.reduce((sum, f) => sum + APP.files[f].content.split('\n').length, 0);
  const statsEl = document.getElementById('topbar-stats');
  if (statsEl) {
    statsEl.innerHTML = `
      <span>${codeFiles.length} files</span><span style="opacity:0.3">|</span>
      <span>${p.classes.length} classes</span><span style="opacity:0.3">|</span>
      <span>${p.functions.length} functions</span><span style="opacity:0.3">|</span>
      <span>${totalLines.toLocaleString()} lines</span>`;
  }
}

/* ═══ CODE METRICS (complexity, size outliers) ═══ */

function computeMetrics() {
  if (CORE.metrics) return CORE.metrics;
  const p = APP.parsed;
  const branchRe = /\b(if|for|while|case|catch|elif|except|when|switch)\b|&&|\|\||\?\?/g;
  const fileMetrics = [];
  const codeExts = new Set(getCodeExtensions());

  for (const path of Object.keys(APP.files)) {
    if (!codeExts.has(path.split('.').pop().toLowerCase())) continue;
    const content = APP.files[path].content;
    const loc = content.split('\n').length;
    const complexity = (content.match(branchRe) || []).length;
    fileMetrics.push({ path, loc, complexity, density: loc > 0 ? complexity / loc : 0 });
  }

  const fnMetrics = [];
  for (const fn of p.functions) {
    const content = APP.files[fn.file]?.content;
    if (!content) continue;
    const body = getFunctionBody(content, fn, detectLanguage(fn.file));
    if (!body) continue;
    const loc = body.split('\n').length;
    const complexity = 1 + (body.match(branchRe) || []).length;
    let depth = 0, maxDepth = 0;
    for (const ch of body) {
      if (ch === '{' || ch === '[') { depth++; if (depth > maxDepth) maxDepth = depth; }
      else if (ch === '}' || ch === ']') depth--;
    }
    fnMetrics.push({ name: fn.name, file: fn.file, line: fn.line, loc, complexity, maxDepth });
  }

  CORE.metrics = {
    files: fileMetrics.sort((a, b) => b.loc - a.loc),
    functions: fnMetrics.sort((a, b) => b.complexity - a.complexity),
    totalComplexity: fileMetrics.reduce((s, f) => s + f.complexity, 0),
  };
  return CORE.metrics;
}

/* ═══ DEAD CODE DETECTION — inverts the dependency data ═══ */

function computeDeadCode() {
  if (CORE.deadCode) return CORE.deadCode;
  const p = APP.parsed;
  const referenced = new Set();
  for (const e of p.classImports || []) referenced.add(e.toClass);
  for (const e of p.funcImports || []) referenced.add(e.toClass);
  for (const c of p.classes) {
    if (c.superclass) referenced.add(c.superclass.replace(/<.*/, ''));
    (c.mixins || []).forEach(m => referenced.add(m));
    (c.implements || []).forEach(m => referenced.add(m));
  }

  const entryHints = /main|app|index|routes|urls|test|spec/i;

  const deadClasses = p.classes.filter(c => {
    if (referenced.has(c.name)) return false;
    if (entryHints.test(c.file) || entryHints.test(c.name)) return false;
    // referenced anywhere outside its own file?
    for (const [path, entry] of Object.entries(CORE.parseCache)) {
      if (path === c.file) continue;
      if (entry.tokens && entry.tokens.has(c.name)) return false;
    }
    return true;
  });

  const deadFunctions = p.functions.filter(fn => {
    if (entryHints.test(fn.file) || entryHints.test(fn.name)) return false;
    if (fn.name.startsWith('_') && fn.name !== '_') { /* private — still check own file */ }
    for (const [path, entry] of Object.entries(CORE.parseCache)) {
      if (path === fn.file) continue;
      if (entry.tokens && entry.tokens.has(fn.name)) return false;
    }
    // used more than once in its own file? (definition + at least one call)
    const own = APP.files[fn.file]?.content || '';
    const count = (own.match(new RegExp(`\\b${escapeRegexParser(fn.name)}\\b`, 'g')) || []).length;
    return count <= 1;
  });

  CORE.deadCode = { classes: deadClasses, functions: deadFunctions };
  return CORE.deadCode;
}

/* ═══ LINE DIFF (for the Changes view) ═══ */

function computeLineDiff(aText, bText) {
  const a = aText.split('\n'), b = bText.split('\n');
  // Trim common prefix/suffix for speed
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let sufA = a.length, sufB = b.length;
  while (sufA > pre && sufB > pre && a[sufA - 1] === b[sufB - 1]) { sufA--; sufB--; }

  const ops = [];
  for (let i = 0; i < pre; i++) ops.push({ type: 'same', text: a[i], aLine: i + 1, bLine: i + 1 });

  const midA = a.slice(pre, sufA), midB = b.slice(pre, sufB);
  if (midA.length * midB.length <= 250000) {
    // LCS DP on the changed middle region
    const m = midA.length, n = midB.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) for (let j = n - 1; j >= 0; j--)
      dp[i][j] = midA[i] === midB[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    let i = 0, j = 0;
    while (i < m && j < n) {
      if (midA[i] === midB[j]) { ops.push({ type: 'same', text: midA[i], aLine: pre + i + 1, bLine: pre + j + 1 }); i++; j++; }
      else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ type: 'del', text: midA[i], aLine: pre + i + 1 }); i++; }
      else { ops.push({ type: 'add', text: midB[j], bLine: pre + j + 1 }); j++; }
    }
    while (i < m) { ops.push({ type: 'del', text: midA[i], aLine: pre + i + 1 }); i++; }
    while (j < n) { ops.push({ type: 'add', text: midB[j], bLine: pre + j + 1 }); j++; }
  } else {
    // Too large — coarse block diff
    midA.forEach((t, i) => ops.push({ type: 'del', text: t, aLine: pre + i + 1 }));
    midB.forEach((t, j) => ops.push({ type: 'add', text: t, bLine: pre + j + 1 }));
  }

  for (let k = 0; k < a.length - sufA; k++)
    ops.push({ type: 'same', text: a[sufA + k], aLine: sufA + k + 1, bLine: sufB + k + 1 });
  return ops;
}

/* ═══ SESSION PERSISTENCE (IndexedDB stores the directory handle) ═══ */

function _idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('code-architect', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(key, val) {
  try {
    const db = await _idbOpen();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(val, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) { /* persistence is best-effort */ }
}

async function idbGet(key) {
  try {
    const db = await _idbOpen();
    return new Promise((resolve) => {
      const tx = db.transaction('kv', 'readonly');
      const req = tx.objectStore('kv').get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(undefined);
    });
  } catch (e) { return undefined; }
}

async function saveLastProject(handle) {
  CORE.dirHandle = handle;
  await idbPut('lastDirHandle', handle);
  const refreshBtn = document.getElementById('btn-refresh-disk');
  if (refreshBtn) refreshBtn.style.display = '';
}

async function initReopenLastProject() {
  const area = document.getElementById('reopen-area');
  if (!area || !window.showDirectoryPicker) return;
  const handle = await idbGet('lastDirHandle');
  if (!handle || !handle.name) return;
  area.innerHTML = `<button class="btn-secondary" id="btn-reopen-last" style="margin-top:12px">↻ Reopen "${escapeHtml(handle.name)}"</button>`;
  document.getElementById('btn-reopen-last').addEventListener('click', async () => {
    try {
      const perm = await handle.requestPermission({ mode: 'read' });
      if (perm === 'granted') await loadFromHandle(handle);
    } catch (e) { console.error(e); area.innerHTML = ''; }
  });
}

/* ═══ REFRESH FROM DISK — re-reads changed files, incremental re-parse ═══ */

async function refreshFromDisk() {
  if (!CORE.dirHandle) return;
  const btn = document.getElementById('btn-refresh-disk');
  if (btn) { btn.disabled = true; btn.textContent = '⟳ …'; }
  try {
    const fresh = {};
    await readDirectory(CORE.dirHandle, '', fresh);
    let changed = 0;
    // Update & add
    for (const [path, f] of Object.entries(fresh)) {
      const cur = APP.files[path];
      if (!cur) { APP.files[path] = f; changed++; }
      else if (cur.content !== f.content) {
        // Disk wins; clear local modification tracking for this file
        APP.files[path] = f;
        changed++;
      }
    }
    // Remove deleted
    for (const path of Object.keys(APP.files)) {
      if (!fresh[path]) { delete APP.files[path]; changed++; }
    }
    if (changed > 0) {
      parseAllFilesIncremental();
      buildClassDependencies();
      APP.tree = buildTree(Object.keys(APP.files));
      updateTopbarStats();
      markPanelsDirty();
      renderPanelIfDirty(activeTabName());
    }
    if (btn) { btn.textContent = changed > 0 ? `⟳ ${changed} updated` : '⟳ Up to date'; setTimeout(() => { btn.textContent = '⟳ Refresh'; btn.disabled = false; }, 1500); }
  } catch (e) {
    console.error(e);
    if (btn) { btn.textContent = '⟳ Refresh'; btn.disabled = false; }
  }
}

/* ═══ SHARED EDIT ENTRY POINT for visual editor & inline edits ═══ */

function spliceFile(path, start, end, replacement) {
  const f = APP.files[path];
  if (!f) return;
  setFileContent(path, f.content.slice(0, start) + replacement + f.content.slice(end));
  if (typeof reParseProject === 'function') reParseProject();
}
