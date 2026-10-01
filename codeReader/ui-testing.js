/* ═══════════════════════════════════════════════════
   Code Architect — ui-testing.js
   Test Lab panel, two modes:
     ▶ RUN CHECKS  — contract tests that execute IN THE APP against the
       loaded source, with live green/red visualization, progress bar,
       jump-to-source on failures, and a NO-CODE custom-check builder.
     ⬇ EXPORT BUNDLE — generates runnable flutter/pytest/vitest suites
       for the project (save-to-folder or zip), see testgen-*.js.
   ═══════════════════════════════════════════════════ */

const TESTLAB = {
  view: 'checks',          // 'checks' | 'bundle'
  targets: null,
  bundle: [],
  enabledSuites: new Set(),
  selectedFile: null,
  // checks state
  checkResults: null,      // [{check, result, ms}]
  running: false,
  disabledChecks: new Set(JSON.parse(localStorage.getItem('ca_disabled_checks') || '[]')),
};

const _SUITE_META = {
  helpers:        { label: 'Test helpers / fakes', icon: '🧰' },
  unit:           { label: 'Unit tests', icon: '◆' },
  component:      { label: 'Component tests', icon: '◈' },
  widget:         { label: 'Widget smokes', icon: '◇' },
  integration_db: { label: 'DB integration', icon: '🗄' },
  e2e:            { label: 'End-to-end journey', icon: '⚡' },
  harness:        { label: 'Runner · CI · docs', icon: '⚙' },
};

function renderTesting() {
  const panel = document.getElementById('panel-testing');
  panel.innerHTML = `
    <div class="testlab-mode-bar">
      <button class="graph-level-btn ${TESTLAB.view === 'checks' ? 'active' : ''}"
        onclick="testlabSwitchView('checks')">▶ Run Checks</button>
      <button class="graph-level-btn ${TESTLAB.view === 'bundle' ? 'active' : ''}"
        onclick="testlabSwitchView('bundle')">⬇ Export Test Bundle</button>
      <span style="margin-left:auto;font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">
        ${TESTLAB.view === 'checks'
          ? 'checks run instantly in-app against the loaded source'
          : 'runnable flutter test / pytest / vitest suites'}</span>
    </div>
    <div id="testlab-body" style="flex:1;overflow:hidden;display:flex"></div>`;
  if (TESTLAB.view === 'checks') renderChecksView();
  else renderBundleView();
}

function testlabSwitchView(v) { TESTLAB.view = v; renderTesting(); }

/* ═════════════════════ CHECKS VIEW ═════════════════════ */

function renderChecksView() {
  const body = document.getElementById('testlab-body');
  const checks = collectAllChecks();
  const bySuite = {};
  for (const c of checks) (bySuite[c.suite] = bySuite[c.suite] || []).push(c);

  const res = TESTLAB.checkResults;
  const summary = res ? {
    pass: res.filter(r => r.result.status === 'pass' && !TESTLAB.disabledChecks.has(r.check.id)).length,
    fail: res.filter(r => r.result.status === 'fail' && !TESTLAB.disabledChecks.has(r.check.id)).length,
    skip: res.filter(r => r.result.status === 'skip' && !TESTLAB.disabledChecks.has(r.check.id)).length,
  } : null;

  body.innerHTML = `
    <div class="testlab-sidebar">
      <button class="btn-primary testlab-btn" id="btn-run-checks"
        onclick="testlabRunChecks()" ${TESTLAB.running ? 'disabled' : ''}>
        ${TESTLAB.running ? '⏳ Running…' : '▶ Run all checks'}</button>
      <div class="check-progress"><div class="check-progress-fill" id="check-progress-fill"></div></div>
      <div class="check-summary" id="check-summary">
        ${summary ? `
          <span class="check-pill check-pill-pass">✓ ${summary.pass}</span>
          <span class="check-pill check-pill-fail">✗ ${summary.fail}</span>
          <span class="check-pill check-pill-skip">− ${summary.skip}</span>`
        : `<span style="color:var(--text-dim);font-size:10px">${checks.length} checks ready</span>`}
      </div>
      ${summary ? `<div class="check-verdict ${summary.fail ? 'bad' : 'good'}">
        ${summary.fail ? `${summary.fail} CONTRACT${summary.fail > 1 ? 'S' : ''} BROKEN` : 'ALL CONTRACTS HOLD'}
      </div>` : ''}
      <div class="tree-header" style="margin-top:14px">ADD CHECK (NO CODE)</div>
      <div class="testlab-note" style="margin-top:4px">Define a new contract with a form — it runs alongside the built-ins and is saved in this browser.</div>
      <button class="btn-secondary testlab-btn" style="margin-top:8px" onclick="openCheckBuilder()">＋ New custom check</button>
    </div>
    <div class="check-results" id="check-results">
      ${Object.entries(bySuite).map(([suite, list]) => `
        <div class="check-suite">
          <div class="check-suite-head" id="suite-head-${_slug(suite)}">
            <span class="check-suite-name">${suite}</span>
            <span class="check-suite-stat" id="suite-stat-${_slug(suite)}">${list.length} checks</span>
          </div>
          ${list.map(c => testlabCheckRowHtml(c)).join('')}
        </div>`).join('')}
    </div>`;
  if (res) testlabPaintResults(res);
}

function _slug(s) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-'); }

function testlabCheckRowHtml(check) {
  const disabled = TESTLAB.disabledChecks.has(check.id);
  return `
    <div class="check-row ${disabled ? 'check-disabled' : ''}" id="check-row-${check.id.replace(/\./g, '-')}">
      <span class="check-state" id="check-state-${check.id.replace(/\./g, '-')}">●</span>
      <div class="check-main">
        <div class="check-name">${escapeHtml(check.name)}</div>
        <div class="check-why">${escapeHtml(check.why || '')}</div>
        <div class="check-detail" id="check-detail-${check.id.replace(/\./g, '-')}"></div>
      </div>
      <div class="check-row-ops">
        <button class="vis-op-btn" title="${disabled ? 'Enable' : 'Disable'} this check"
          onclick="testlabToggleCheck('${check.id}')">${disabled ? '◌' : '◉'}</button>
        ${check.isCustom ? `<button class="vis-op-btn vis-op-danger" title="Delete custom check"
          onclick="deleteCustomCheck('${check.id}');renderTesting()">✕</button>` : ''}
      </div>
    </div>`;
}

async function testlabRunChecks() {
  if (TESTLAB.running) return;
  TESTLAB.running = true;
  const checks = collectAllChecks().filter(c => !TESTLAB.disabledChecks.has(c.id));
  const allChecks = collectAllChecks();

  // Reset visuals
  for (const c of allChecks) {
    const el = document.getElementById(`check-state-${c.id.replace(/\./g, '-')}`);
    if (el) { el.textContent = '●'; el.className = 'check-state'; }
    const d = document.getElementById(`check-detail-${c.id.replace(/\./g, '-')}`);
    if (d) d.innerHTML = '';
  }
  const btn = document.getElementById('btn-run-checks');
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Running…'; }
  const fill = document.getElementById('check-progress-fill');

  const results = await runAllChecks(checks, (done, total, entry) => {
    if (fill) fill.style.width = `${(done / total) * 100}%`;
    testlabPaintOne(entry);
  });

  TESTLAB.checkResults = results;
  TESTLAB.running = false;
  renderChecksView(); // re-render for the summary pills + verdict banner
}

function testlabPaintResults(results) {
  const suiteAgg = {};
  for (const entry of results) {
    testlabPaintOne(entry);
    const s = entry.check.suite;
    suiteAgg[s] = suiteAgg[s] || { pass: 0, fail: 0, skip: 0 };
    suiteAgg[s][entry.result.status]++;
  }
  for (const [suite, agg] of Object.entries(suiteAgg)) {
    const el = document.getElementById(`suite-stat-${_slug(suite)}`);
    if (el) {
      el.innerHTML =
        `<span style="color:var(--green)">✓${agg.pass}</span>` +
        (agg.fail ? ` <span style="color:var(--red)">✗${agg.fail}</span>` : '') +
        (agg.skip ? ` <span style="color:var(--text-dim)">−${agg.skip}</span>` : '');
      const head = document.getElementById(`suite-head-${_slug(suite)}`);
      if (head) head.classList.toggle('suite-failed', agg.fail > 0);
    }
  }
}

function testlabPaintOne(entry) {
  const id = entry.check.id.replace(/\./g, '-');
  const state = document.getElementById(`check-state-${id}`);
  const detail = document.getElementById(`check-detail-${id}`);
  const row = document.getElementById(`check-row-${id}`);
  if (!state) return;
  const st = entry.result.status;
  state.textContent = st === 'pass' ? '✓' : st === 'fail' ? '✗' : '−';
  state.className = `check-state check-${st}`;
  if (row) row.classList.toggle('check-row-failed', st === 'fail');
  if (detail) {
    const locs = (entry.result.locations || []).slice(0, 6).map(l =>
      `<span class="check-loc" onclick="navigateToFile('${l.file.replace(/'/g, "\\'")}', ${l.line || 1})">↗ ${l.file.split('/').pop()}:${l.line || 1}</span>`).join(' ');
    detail.innerHTML = `<span class="check-detail-${st}">${escapeHtml(entry.result.detail || '')}</span> ${locs}`;
  }
}

function testlabToggleCheck(id) {
  if (TESTLAB.disabledChecks.has(id)) TESTLAB.disabledChecks.delete(id);
  else TESTLAB.disabledChecks.add(id);
  try { localStorage.setItem('ca_disabled_checks', JSON.stringify([...TESTLAB.disabledChecks])); } catch (e) {}
  renderChecksView();
}

/* ── No-code custom check builder ── */

function openCheckBuilder() {
  document.getElementById('check-builder-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'check-builder-overlay';
  overlay.className = 'export-modal-overlay';
  overlay.innerHTML = `
    <div class="export-modal" style="max-width:460px">
      <div class="export-modal-header"><span>＋ New Custom Check</span>
        <div class="rt-close" onclick="document.getElementById('check-builder-overlay').remove()">✕</div></div>
      <div class="export-modal-body" style="display:flex;flex-direction:column;gap:10px">
        <div class="form-group"><label class="form-label">CHECK NAME</label>
          <input class="form-input" id="cb-name" placeholder="e.g. Shop must never hardcode prices"></div>
        <div class="form-group"><label class="form-label">TYPE</label>
          <select class="form-input" id="cb-type" onchange="checkBuilderTypeChanged()">
            <option value="contains">File(s) MUST contain pattern</option>
            <option value="absent">File(s) must NOT contain pattern</option>
            <option value="entityExists">Entity must exist (class / function / enum)</option>
            <option value="classHasMethod">Class must have method</option>
            <option value="maxLines">File size budget (max lines)</option>
          </select></div>
        <div id="cb-fields"></div>
        <div class="form-group"><label class="form-label">WHY (shown under the check)</label>
          <input class="form-input" id="cb-why" placeholder="optional rationale"></div>
        <button class="btn-primary" style="padding:8px" onclick="checkBuilderSave()">Save check</button>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
  checkBuilderTypeChanged();
}

function checkBuilderTypeChanged() {
  const type = document.getElementById('cb-type')?.value;
  const fields = document.getElementById('cb-fields');
  if (!fields) return;
  const fileField = `
    <div class="form-group"><label class="form-label">FILE FILTER (path substring, empty = all code files)</label>
      <input class="form-input" id="cb-file" placeholder="e.g. iap_service or features/shop"></div>`;
  if (type === 'contains' || type === 'absent') {
    fields.innerHTML = fileField + `
      <div class="form-group"><label class="form-label">PATTERN</label>
        <input class="form-input" id="cb-pattern" placeholder="text to look for"></div>
      <label class="export-opt" style="font-size:11px"><input type="checkbox" id="cb-regex"> Treat pattern as regular expression</label>`;
  } else if (type === 'entityExists') {
    fields.innerHTML = `
      <div class="form-group"><label class="form-label">KIND</label>
        <select class="form-input" id="cb-kind"><option>class</option><option>function</option><option>enum</option><option>provider</option></select></div>
      <div class="form-group"><label class="form-label">NAME</label>
        <input class="form-input" id="cb-entity" placeholder="e.g. IAPService"></div>`;
  } else if (type === 'classHasMethod') {
    const opts = APP.parsed.classes.slice(0, 200).map(c => `<option>${c.name}</option>`).join('');
    fields.innerHTML = `
      <div class="form-group"><label class="form-label">CLASS</label>
        <select class="form-input" id="cb-class">${opts}</select></div>
      <div class="form-group"><label class="form-label">METHOD NAME</label>
        <input class="form-input" id="cb-method" placeholder="e.g. dispose"></div>`;
  } else if (type === 'maxLines') {
    fields.innerHTML = fileField + `
      <div class="form-group"><label class="form-label">MAX LINES</label>
        <input class="form-input" id="cb-max" type="number" value="500"></div>`;
  }
}

function checkBuilderSave() {
  const type = document.getElementById('cb-type').value;
  const displayName = document.getElementById('cb-name')?.value?.trim() || null;
  const def = {
    type,
    why: document.getElementById('cb-why')?.value?.trim() || '',
    filePattern: document.getElementById('cb-file')?.value?.trim() || '',
    pattern: document.getElementById('cb-pattern')?.value ?? '',
    isRegex: document.getElementById('cb-regex')?.checked || false,
    kind: document.getElementById('cb-kind')?.value || 'class',
  };
  if (type === 'contains' || type === 'absent') {
    if (!def.pattern) return;
    def.displayName = displayName ||
      `${type === 'contains' ? 'Must contain' : 'Must not contain'} "${def.pattern}"`;
  } else if (type === 'entityExists') {
    def.name = document.getElementById('cb-entity')?.value?.trim(); // engine reads def.name as target
    if (!def.name) return;
    def.displayName = displayName || `${def.kind} "${def.name}" exists`;
  } else if (type === 'classHasMethod') {
    def.className = document.getElementById('cb-class')?.value;
    def.methodName = document.getElementById('cb-method')?.value?.trim();
    if (!def.methodName) return;
    def.displayName = displayName || `${def.className}.${def.methodName}() exists`;
  } else if (type === 'maxLines') {
    def.max = parseInt(document.getElementById('cb-max')?.value || '500', 10);
    def.displayName = displayName || `Files ≤ ${def.max} lines`;
  }
  addCustomCheck(def);
  document.getElementById('check-builder-overlay')?.remove();
  TESTLAB.checkResults = null;
  renderTesting();
}

/* ═════════════════════ BUNDLE VIEW (export) ═════════════════════ */

function renderBundleView() {
  const body = document.getElementById('testlab-body');
  const pt = APP.parsed.projectType;

  let targets, fullBundle;
  if (pt === 'dart') { targets = detectDartTestTargets(); fullBundle = generateDartTestBundle(targets); }
  else if (pt === 'python') { targets = detectPythonTestTargets(); fullBundle = generatePythonTestBundle(targets); }
  else if (pt === 'javascript' || pt === 'web') { targets = detectJsTestTargets(); fullBundle = generateJsTestBundle(targets); }
  else {
    body.innerHTML = `<div class="source-empty" style="flex:1"><div class="source-empty-icon">⚗</div>
      No bundle generator for project type "${pt}" — use Run Checks instead.</div>`;
    return;
  }

  TESTLAB.targets = targets;
  const suites = [...new Set(fullBundle.map(f => f.suite))];
  if (TESTLAB.enabledSuites.size === 0) suites.forEach(s => TESTLAB.enabledSuites.add(s));
  TESTLAB.bundle = fullBundle.filter(f => TESTLAB.enabledSuites.has(f.suite));
  if (!TESTLAB.bundle.find(f => f.path === TESTLAB.selectedFile)) {
    TESTLAB.selectedFile = TESTLAB.bundle[0]?.path || null;
  }
  const totalLines = TESTLAB.bundle.reduce((s, f) => s + f.content.split('\n').length, 0);

  body.innerHTML = `
      <div class="testlab-sidebar">
        <div class="tree-header">DETECTED STACK</div>
        <div class="testlab-stack">${testlabStackHtml(targets)}</div>
        <div class="tree-header" style="margin-top:12px">SUITES</div>
        ${suites.map(s => {
          const meta = _SUITE_META[s] || { label: s, icon: '•' };
          const count = fullBundle.filter(f => f.suite === s).length;
          return `<label class="testlab-suite">
            <input type="checkbox" ${TESTLAB.enabledSuites.has(s) ? 'checked' : ''}
              onchange="testlabToggleSuite('${s}', this.checked)">
            <span>${meta.icon} ${meta.label}</span>
            <span class="testlab-suite-count">${count}</span>
          </label>`;
        }).join('')}
        <div class="testlab-actions">
          <button class="btn-primary testlab-btn" onclick="testlabSaveToFolder()"
            title="Writes test files next to lib/ — never inside it">💾 Save into project folder…</button>
          <button class="btn-secondary testlab-btn" onclick="testlabDownloadZip()">⬇ Download .zip</button>
        </div>
        <div class="testlab-note">
          ${TESTLAB.bundle.length} files · ${totalLines.toLocaleString()} lines<br>
          Generated files never touch your source — they live in
          <b>test/</b>, <b>integration_test/</b> &amp; project root.
        </div>
      </div>
      <div class="testlab-files">
        <div class="tree-header" style="padding:10px 12px 4px">GENERATED BUNDLE</div>
        ${TESTLAB.bundle.map(f => `
          <div class="testlab-file ${f.path === TESTLAB.selectedFile ? 'active' : ''}"
               onclick="testlabSelectFile('${f.path.replace(/'/g, "\\'")}')">
            <span class="file-icon">${f.path.endsWith('.md') ? '📝' : f.path.endsWith('.yml') ? '📋' : f.path.endsWith('.ps1') || f.path.endsWith('.sh') ? '⚙️' : '🧪'}</span>
            <span class="testlab-file-name">${f.path}</span>
            <span class="testlab-file-lines">${f.content.split('\n').length}</span>
          </div>`).join('')}
      </div>
      <div class="testlab-preview" id="testlab-preview"></div>`;
  testlabRenderPreview();
}

function testlabStackHtml(t) {
  const chip = (label, on, color) =>
    `<div class="dep-chip" style="color:${on ? (color || 'var(--green)') : 'var(--text-dim)'};${on ? '' : 'opacity:0.45'}">${on ? '✓' : '○'} ${label}</div>`;
  if (t.lang === 'dart') {
    return `
      <div class="dep-chip" style="color:var(--cyan)">📦 ${escapeHtml(t.packageName || '?')}</div>
      ${chip('in_app_purchase', t.hasInAppPurchase, 'var(--amber)')}
      ${chip(`IAP service${t.iapServiceClass ? ': ' + t.iapServiceClass.name : ''}`, !!t.iapServiceClass, 'var(--amber)')}
      ${chip(`Products${t.productsClass ? ` (${t.productsClass.constants.length} ids)` : ''}`, !!t.productsClass, 'var(--amber)')}
      ${chip('Promo codes', !!t.promoServiceClass)}
      ${chip('Riverpod', t.hasRiverpod)}
      ${chip('sqflite', t.hasSqflite)}
      ${chip(`DB facade${t.dbServiceClass ? ': ' + t.dbServiceClass.name : ''}`, !!t.dbServiceClass)}
      ${chip(`${t.screens.length} screens`, t.screens.length > 0, 'var(--purple)')}`;
  }
  if (t.lang === 'python') {
    return `
      ${chip(`${t.classes.length} classes`, t.classes.length > 0)}
      ${chip(`${t.functions.length} functions`, t.functions.length > 0)}
      ${chip('Django', t.hasDjango)}
      ${chip('Flask/routes', t.hasFlask)}`;
  }
  return `
    ${chip(`${t.classes.length} classes`, t.classes.length > 0)}
    ${chip(`${t.functions.length} functions`, t.functions.length > 0)}
    ${chip('React', t.isReact)}`;
}

function testlabToggleSuite(suite, on) {
  if (on) TESTLAB.enabledSuites.add(suite);
  else TESTLAB.enabledSuites.delete(suite);
  renderBundleView();
}

function testlabSelectFile(path) {
  TESTLAB.selectedFile = path;
  document.querySelectorAll('.testlab-file').forEach(el =>
    el.classList.toggle('active', el.querySelector('.testlab-file-name')?.textContent === path));
  testlabRenderPreview();
}

function testlabRenderPreview() {
  const pane = document.getElementById('testlab-preview');
  if (!pane) return;
  const file = TESTLAB.bundle.find(f => f.path === TESTLAB.selectedFile);
  if (!file) { pane.innerHTML = '<div class="source-empty"><div class="source-empty-icon">🧪</div>Select a file</div>'; return; }
  const fakePath = file.path.endsWith('.dart') ? 'x.dart'
    : file.path.endsWith('.py') ? 'x.py'
    : /\.(jsx?|tsx?)$/.test(file.path) ? 'x.js'
    : file.path.endsWith('.yml') || file.path.endsWith('.yaml') ? 'x.yaml'
    : 'x.txt';
  const lines = file.content.split('\n');
  const todoCount = (file.content.match(/TODO/g) || []).length;
  pane.innerHTML = `
    <div class="vis-code-head">
      <span>${file.path} · ${lines.length} lines${todoCount ? ` · <span style="color:var(--amber)">${todoCount} TODO</span>` : ''}</span>
      <button class="vis-op-btn" onclick="testlabCopyFile()" title="Copy file content">⧉ copy</button>
    </div>
    <div class="vis-code-body source-code">${lines.slice(0, 1200).map((l, i) =>
      `<div class="source-line"><span class="source-line-num">${i + 1}</span>` +
      `<span class="source-line-text">${highlightCodeSafe(l, fakePath)}</span></div>`).join('')}
    ${lines.length > 1200 ? '<div style="padding:8px 12px;color:var(--text-dim);font-size:10px">… preview truncated</div>' : ''}</div>`;
}

function testlabCopyFile() {
  const file = TESTLAB.bundle.find(f => f.path === TESTLAB.selectedFile);
  if (file) navigator.clipboard?.writeText(file.content);
}

async function testlabSaveToFolder() {
  if (!TESTLAB.bundle.length) return;
  if (!window.showDirectoryPicker) { testlabDownloadZip(); return; }
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    let written = 0;
    for (const f of TESTLAB.bundle) {
      const parts = f.path.split('/');
      let handle = dir;
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i], { create: true });
      }
      const fileHandle = await handle.getFileHandle(parts[parts.length - 1], { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(f.content);
      await writable.close();
      written++;
    }
    testlabFlash(`✓ ${written} files written to "${dir.name}"`);
  } catch (e) {
    if (e.name !== 'AbortError') { console.error(e); testlabFlash('✕ Save failed — see console', true); }
  }
}

function testlabDownloadZip() {
  if (!TESTLAB.bundle.length) return;
  const blob = buildZip(TESTLAB.bundle);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const name = (TESTLAB.targets?.packageName || APP.parsed.projectName || 'project').replace(/[^\w-]/g, '_');
  a.download = `${name}-tests.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  testlabFlash(`✓ ${TESTLAB.bundle.length} files zipped`);
}

function testlabFlash(msg, isError) {
  const note = document.querySelector('.testlab-note');
  if (!note) return;
  const el = document.createElement('div');
  el.style.cssText = `margin-top:6px;font-weight:700;color:${isError ? 'var(--red)' : 'var(--green)'}`;
  el.textContent = msg;
  note.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
