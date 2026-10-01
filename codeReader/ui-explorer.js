/* ═══════════════════════════════════════════════════
   Code Architect — ui-explorer.js
   File explorer, code editor with multi-select
   (Ctrl+Shift+L = all instances, Ctrl+D = next),
   working code search, universal syntax highlighting
   ═══════════════════════════════════════════════════ */

let currentViewFile = null;
let editorSaveTimer = null;
let searchResults = [];
let multiSelectState = { selections: [], query: '', files: [], currentIdx: -1 };

function renderExplorer() {
  const panel = document.getElementById('panel-explorer');
  panel.innerHTML = `
    <div class="explorer">
      <div class="explorer-tree">
        <div class="search-bar" style="border-bottom:1px solid var(--border);margin:-12px -12px 8px;padding:8px 12px">
          <input class="search-input" placeholder="Filter files..." id="tree-search" oninput="filterTree(this.value)">
        </div>
        <div class="tree-header">PROJECT FILES</div>
        <div id="tree-root"></div>
      </div>
      <div class="source-viewer" id="source-viewer">
        <div class="code-search-bar">
          <select id="code-search-mode" class="code-search-mode" title="Search mode">
            <option value="text">Text</option>
            <option value="regex">Regex</option>
            <option value="symbol">Symbols</option>
          </select>
          <input class="code-search-input" id="code-search-input" placeholder="Search across all files… (Ctrl+P: files · Ctrl+Shift+O: symbols)"
                 onkeydown="if(event.key==='Enter')runCodeSearch()">
          <button class="code-search-btn" onclick="runCodeSearch()">Search</button>
          <button class="code-search-btn multi-select-btn" onclick="openMultiEdit()" title="Multi-select edit (Ctrl+Shift+L)">⊞ Multi-Edit</button>
          <span class="code-search-count" id="code-search-count"></span>
        </div>
        <div class="search-results-panel" id="search-results-panel" style="display:none"></div>
        <div class="multi-edit-panel" id="multi-edit-panel" style="display:none"></div>
        <div class="source-empty" id="source-empty"><div class="source-empty-icon">◑</div>Click a file to view &amp; edit source</div>
        <div id="source-content" style="display:none;flex-direction:column;overflow:hidden;flex:1"></div>
      </div>
    </div>`;
  renderTreeNode(APP.tree, document.getElementById('tree-root'), 0);
}

function renderTreeNode(node, container, depth) {
  const folders = Object.values(node.children).sort((a,b)=>a.name.localeCompare(b.name));
  const files = (node.files||[]).sort((a,b)=>a.name.localeCompare(b.name));
  for (const folder of folders) {
    const div = document.createElement('div');
    div.className = 'tree-folder-group';
    div.dataset.name = folder.name.toLowerCase();
    const btn = document.createElement('div');
    btn.className = 'tree-folder';
    btn.style.paddingLeft = (depth*12+6)+'px';
    btn.innerHTML = `<span class="arrow open">▸</span> 📁 ${folder.name}`;
    const childDiv = document.createElement('div');
    childDiv.className = 'tree-children';
    btn.onclick = () => { childDiv.classList.toggle('collapsed'); btn.querySelector('.arrow').classList.toggle('open'); };
    div.appendChild(btn); div.appendChild(childDiv);
    container.appendChild(div);
    renderTreeNode(folder, childDiv, depth+1);
  }
  for (const file of files) {
    const div = document.createElement('div');
    div.className = 'tree-file';
    div.dataset.path = file.path;
    div.dataset.name = file.name.toLowerCase();
    div.style.paddingLeft = (depth*12+28)+'px';
    const icon = getFileIcon(file.path);
    div.innerHTML = `<span class="file-icon">${icon}</span> ${file.name}`;
    div.onclick = () => viewFile(file.path);
    container.appendChild(div);
  }
}

function filterTree(query) {
  const q = query.toLowerCase();
  document.querySelectorAll('.tree-file').forEach(el => {
    el.style.display = !q || el.dataset.name.includes(q) ? '' : 'none';
  });
  document.querySelectorAll('.tree-folder-group').forEach(el => {
    const hasVisible = el.querySelectorAll('.tree-file:not([style*="display: none"])').length > 0;
    el.style.display = !q || hasVisible || el.dataset.name.includes(q) ? '' : 'none';
    if (q && hasVisible) el.querySelector('.tree-children')?.classList.remove('collapsed');
  });
}

/* ═══ VIRTUALIZED SOURCE VIEW + FILE TABS ═══ */

let openTabs = [];              // [{ path, scrollTop }]
const VIRT = { lineH: 19, buf: 40, path: null, lines: [], start: -1, end: -1 };

function viewFile(path, scrollToLine) {
  const file = APP.files[path];
  if (!file) return;

  // Save scroll position of the tab we're leaving
  if (currentViewFile && currentViewFile !== path) {
    const prevTab = openTabs.find(t => t.path === currentViewFile);
    const rv = document.getElementById('source-read-view');
    if (prevTab && rv) prevTab.scrollTop = rv.scrollTop;
  }

  currentViewFile = path;
  if (!openTabs.find(t => t.path === path)) openTabs.push({ path, scrollTop: 0 });
  document.querySelectorAll('.tree-file').forEach(f => f.classList.toggle('active', f.dataset.path === path));

  const emptyEl = document.getElementById('source-empty');
  const contentEl = document.getElementById('source-content');
  if (emptyEl) emptyEl.style.display = 'none';
  if (contentEl) { contentEl.style.display = 'flex'; contentEl.style.flexDirection = 'column'; contentEl.style.overflow = 'hidden'; contentEl.style.flex = '1'; }

  const lines = file.content.split('\n');
  VIRT.path = path; VIRT.lines = lines; VIRT.start = -1; VIRT.end = -1;
  const pathParts = path.split('/');
  const fileName = pathParts.pop();
  const dirPath = pathParts.join('/');

  contentEl.innerHTML = `
    ${renderFileTabsHtml()}
    <div class="source-header">
      <span class="source-path">${dirPath}/</span>
      <span class="source-path-file">${fileName}</span>
      <div class="source-meta">
        <span>${lines.length} lines</span>
        <span>${(file.size/1024).toFixed(1)} KB</span>
        <button id="btn-view-diff" style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);font-weight:600;border:1px solid var(--border);color:var(--amber);cursor:pointer;display:${file.modified ? '' : 'none'}" onclick="toggleDiffView()">Δ Diff</button>
        <button style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);font-weight:600;border:1px solid var(--border);color:var(--cyan);cursor:pointer" onclick="toggleEditorMode()">
          Edit ✎
        </button>
      </div>
    </div>
    <div id="source-read-view" style="overflow:auto;flex:1;position:relative" onscroll="renderVirtWindow()">
      <div class="source-code" id="virt-spacer" style="position:relative;height:${lines.length * VIRT.lineH}px"></div>
    </div>
    <div id="source-diff-view" style="display:none;overflow:auto;flex:1"></div>
    <div id="source-edit-view" style="display:none;flex:1;overflow:hidden;flex-direction:column">
      <textarea class="source-editor" id="source-editor" spellcheck="false">${escapeHtml(file.content)}</textarea>
      <div class="editor-status">
        <span id="editor-save-status" class="saved">● Saved</span>
        <span style="flex:1"></span>
        <span style="color:var(--text-dim);font-size:10px;font-family:var(--font-mono)">Ctrl+D: select next · Ctrl+Shift+L: select all · Tab for indent</span>
      </div>
    </div>`;

  const readView = document.getElementById('source-read-view');
  const tab = openTabs.find(t => t.path === path);
  if (scrollToLine) {
    readView.scrollTop = Math.max(0, (scrollToLine - 1) * VIRT.lineH - readView.clientHeight / 2);
  } else if (tab && tab.scrollTop) {
    readView.scrollTop = tab.scrollTop;
  }
  renderVirtWindow();

  if (scrollToLine) {
    requestAnimationFrame(() => {
      const lineEl = document.getElementById(`src-line-${scrollToLine}`);
      if (lineEl) {
        lineEl.style.background = 'var(--amber-glow)';
        setTimeout(() => lineEl.style.background = '', 2000);
      }
    });
  }
}

/* Render only the visible window of lines (+ buffer). ~100 DOM nodes max. */
function renderVirtWindow() {
  const readView = document.getElementById('source-read-view');
  const spacer = document.getElementById('virt-spacer');
  if (!readView || !spacer || !VIRT.path) return;

  const first = Math.max(0, Math.floor(readView.scrollTop / VIRT.lineH) - VIRT.buf);
  const last = Math.min(VIRT.lines.length, Math.ceil((readView.scrollTop + readView.clientHeight) / VIRT.lineH) + VIRT.buf);
  if (first === VIRT.start && last === VIRT.end) return;
  VIRT.start = first; VIRT.end = last;

  const path = VIRT.path;
  let html = '';
  for (let i = first; i < last; i++) {
    html += `<div class="source-line virt-line" id="src-line-${i+1}" style="top:${i * VIRT.lineH}px">` +
      `<span class="source-line-num">${i+1}</span>` +
      `<span class="source-line-text">${highlightCodeSafe(VIRT.lines[i], path)}</span></div>`;
  }
  spacer.innerHTML = html;
}

function renderFileTabsHtml() {
  if (openTabs.length === 0) return '';
  return `<div class="file-tabs">${openTabs.map(t => {
    const name = t.path.split('/').pop();
    const esc = t.path.replace(/'/g, "\\'");
    const mod = APP.files[t.path]?.modified ? '<span class="file-tab-dot">●</span>' : '';
    return `<div class="file-tab ${t.path === currentViewFile ? 'active' : ''}" onclick="viewFile('${esc}')" title="${t.path}">` +
      `<span class="file-icon">${getFileIcon(t.path)}</span> ${name}${mod}` +
      `<span class="file-tab-close" onclick="closeFileTab(event, '${esc}')">✕</span></div>`;
  }).join('')}</div>`;
}

function closeFileTab(e, path) {
  e.stopPropagation();
  const idx = openTabs.findIndex(t => t.path === path);
  if (idx !== -1) openTabs.splice(idx, 1);
  if (currentViewFile === path) {
    const next = openTabs[Math.max(0, idx - 1)];
    if (next) { viewFile(next.path); return; }
    currentViewFile = null;
    const contentEl = document.getElementById('source-content');
    const emptyEl = document.getElementById('source-empty');
    if (contentEl) contentEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = '';
  } else {
    viewFile(currentViewFile);
  }
}

/* ═══ DIFF VIEW — current content vs original (on-load) content ═══ */

function toggleDiffView() {
  const readView = document.getElementById('source-read-view');
  const diffView = document.getElementById('source-diff-view');
  if (!readView || !diffView || !currentViewFile) return;
  const file = APP.files[currentViewFile];

  if (diffView.style.display === 'none') {
    const ops = computeLineDiff(file.original ?? file.content, file.content);
    const changed = ops.filter(o => o.type !== 'same').length;
    diffView.innerHTML = `
      <div style="padding:6px 12px;font-size:10px;font-family:var(--font-mono);color:var(--text-dim);border-bottom:1px solid var(--border);display:flex;gap:12px">
        <span style="color:var(--green)">+${ops.filter(o => o.type === 'add').length}</span>
        <span style="color:var(--red)">−${ops.filter(o => o.type === 'del').length}</span>
        <span>${changed} changed lines vs. original</span>
        <span style="flex:1"></span>
        <span style="cursor:pointer;color:var(--amber)" onclick="revertFileToOriginal()">↩ Revert file</span>
      </div>
      <div class="source-code">${ops.slice(0, 4000).map(o => {
        const cls = o.type === 'add' ? 'diff-line-add' : o.type === 'del' ? 'diff-line-del' : '';
        const num = o.type === 'del' ? (o.aLine || '') : (o.bLine || '');
        const sign = o.type === 'add' ? '+' : o.type === 'del' ? '−' : ' ';
        return `<div class="source-line ${cls}"><span class="source-line-num">${num}</span>` +
          `<span class="source-line-text"><span style="opacity:0.5;margin-right:6px">${sign}</span>${highlightCodeSafe(o.text, currentViewFile)}</span></div>`;
      }).join('')}${ops.length > 4000 ? '<div style="padding:8px 12px;color:var(--text-dim);font-size:10px">… diff truncated</div>' : ''}</div>`;
    diffView.style.display = 'block';
    readView.style.display = 'none';
  } else {
    diffView.style.display = 'none';
    readView.style.display = '';
  }
}

function revertFileToOriginal() {
  const file = APP.files[currentViewFile];
  if (!file || file.original === undefined) return;
  setFileContent(currentViewFile, file.original);
  reParseProject();
  viewFile(currentViewFile);
}

function toggleEditorMode() {
  const readView = document.getElementById('source-read-view');
  const editView = document.getElementById('source-edit-view');
  if (!readView || !editView) return;

  if (editView.style.display === 'none') {
    editView.style.display = 'flex';
    readView.style.display = 'none';
    const editor = document.getElementById('source-editor');
    editor.addEventListener('input', onEditorInput);
    editor.addEventListener('keydown', handleEditorKeys);
    editor.focus();
  } else {
    // Cancel any pending auto-save timer and flush immediately first,
    // BEFORE viewFile() rebuilds the textarea with old content.
    clearTimeout(editorSaveTimer);
    editorSaveTimer = null;
    const editor = document.getElementById('source-editor');
    if (editor && currentViewFile) {
      setFileContent(currentViewFile, editor.value);
    }
    editView.style.display = 'none';
    readView.style.display = '';
    if (currentViewFile) viewFile(currentViewFile);
    reParseProject();
  }
}

function onEditorInput(e) {
  const statusEl = document.getElementById('editor-save-status');
  if (statusEl) { statusEl.textContent = '● Unsaved'; statusEl.className = 'unsaved'; }
  clearTimeout(editorSaveTimer);
  editorSaveTimer = setTimeout(() => saveEditorContent(), 800);
}

function handleEditorKeys(e) {
  const editor = e.target;
  if (e.key === 'Tab') {
    e.preventDefault();
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
    editor.selectionStart = editor.selectionEnd = start + 2;
    onEditorInput();
  }
  // Ctrl+D: select next occurrence of selected text
  if (e.ctrlKey && e.key === 'd') {
    e.preventDefault();
    const selText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    if (!selText) return;
    const afterSel = editor.value.indexOf(selText, editor.selectionEnd);
    if (afterSel !== -1) {
      editor.selectionStart = afterSel;
      editor.selectionEnd = afterSel + selText.length;
    }
  }
  // Ctrl+Shift+L: select all and open multi-edit modal
  if (e.ctrlKey && e.shiftKey && e.key === 'L') {
    e.preventDefault();
    const selText = editor.value.substring(editor.selectionStart, editor.selectionEnd);
    if (selText) {
      openMultiEditWithQuery(selText);
    }
  }
}

function saveEditorContent() {
  if (!currentViewFile) return;
  const editor = document.getElementById('source-editor');
  if (!editor) return;
  const newContent = editor.value;
  setFileContent(currentViewFile, newContent);

  const statusEl = document.getElementById('editor-save-status');
  if (statusEl) { statusEl.textContent = '● Saved'; statusEl.className = 'saved'; }

  reParseProject();
}

/* ═══ UNIVERSAL RE-PARSE ═══ */

function reParseProject() {
  // Incremental: only files whose content hash changed are re-parsed (core.js cache)
  parseAllFilesIncremental();
  buildClassDependencies();

  // Mark all data-dependent panels dirty; they re-render lazily on tab switch.
  // Explorer is NOT re-rendered (would reset the editor and lose cursor position).
  markPanelsDirty(['dashboard', 'graph', 'classes', 'state', 'codegen', 'visual']);
  const active = activeTabName();
  if (active && active !== 'explorer') renderPanelIfDirty(active);

  updateTopbarStats();
  updateModifiedMarkers();
}

/* Update the "modified" dots in the file tree + diff button visibility */
function updateModifiedMarkers() {
  document.querySelectorAll('.tree-file').forEach(el => {
    el.classList.toggle('modified', !!APP.files[el.dataset.path]?.modified);
  });
  const diffBtn = document.getElementById('btn-view-diff');
  if (diffBtn && currentViewFile) {
    diffBtn.style.display = APP.files[currentViewFile]?.modified ? '' : 'none';
  }
}

/* ═══ CODE SEARCH (fixed & enhanced) ═══ */

function runCodeSearch() {
  const input = document.getElementById('code-search-input');
  const query = input?.value?.trim();
  if (!query) return;
  const mode = document.getElementById('code-search-mode')?.value || 'text';

  searchResults = [];

  if (mode === 'symbol') {
    // Search parsed entities: classes, functions, providers, enums
    const p = APP.parsed;
    const q = query.toLowerCase();
    const push = (name, file, line, kind) => {
      if (name.toLowerCase().includes(q)) searchResults.push({ file, line: line || 1, text: `${kind}  ${name}`, col: 0 });
    };
    p.classes.forEach(c => push(c.name, c.file, c.line, c.isAbstract ? 'abstract class' : 'class'));
    p.functions.forEach(f => push(f.name, f.file, f.line, 'function'));
    p.providers.forEach(pr => push(pr.name, pr.file, pr.line, pr.type || 'provider'));
    p.enums.forEach(e => push(e.name, e.file, e.line, 'enum'));
  } else {
    let matcher;
    if (mode === 'regex') {
      try { matcher = new RegExp(query, 'i'); }
      catch (e) {
        const countEl = document.getElementById('code-search-count');
        if (countEl) countEl.textContent = 'invalid regex';
        return;
      }
    }
    for (const filePath of Object.keys(APP.files)) {
      const lines = APP.files[filePath].content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let idx = -1;
        if (mode === 'regex') {
          const m = matcher.exec(lines[i]);
          if (m) idx = m.index;
        } else {
          idx = lines[i].toLowerCase().indexOf(query.toLowerCase());
        }
        if (idx !== -1) {
          searchResults.push({ file: filePath, line: i + 1, text: lines[i].trim(), col: idx });
          if (searchResults.length > 2000) break;
        }
      }
      if (searchResults.length > 2000) break;
    }
  }

  const countEl = document.getElementById('code-search-count');
  if (countEl) countEl.textContent = `${searchResults.length} results`;

  const panel = document.getElementById('search-results-panel');
  if (!panel) return;

  if (searchResults.length === 0) {
    panel.style.display = 'block';
    panel.innerHTML = `<div style="padding:12px;color:var(--text-dim);font-size:11px">No results found for "${escapeHtml(query)}"</div>`;
    return;
  }

  // Group results by file
  const byFile = {};
  for (const r of searchResults) {
    if (!byFile[r.file]) byFile[r.file] = [];
    byFile[r.file].push(r);
  }

  panel.style.display = 'block';
  let html = '';
  for (const [file, results] of Object.entries(byFile)) {
    const shortFile = file.split('/').pop();
    const icon = getFileIcon(file);
    html += `<div class="search-result-file-group">
      <div class="search-result-file-header" onclick="this.nextElementSibling.classList.toggle('collapsed')">
        <span style="margin-right:4px">${icon}</span>
        <span class="search-result-file">${shortFile}</span>
        <span style="color:var(--text-dim);font-size:9px;margin-left:4px">${file}</span>
        <span style="margin-left:auto;color:var(--amber);font-size:9px">${results.length} matches</span>
      </div>
      <div class="search-result-file-items">`;
    for (const r of results.slice(0, 50)) {
      const highlighted = escapeHtml(r.text).replace(
        new RegExp(`(${escapeRegex(query)})`, 'gi'),
        '<mark>$1</mark>'
      );
      html += `<div class="search-result-item" onclick="viewFile('${r.file}', ${r.line})">
        <span class="search-result-line-num">:${r.line}</span>
        <span class="search-result-text">${highlighted}</span>
      </div>`;
    }
    html += `</div></div>`;
  }

  if (searchResults.length > 200) {
    html += `<div style="padding:8px 12px;color:var(--text-dim);font-size:10px">… and ${searchResults.length - 200} more results</div>`;
  }
  panel.innerHTML = html;
}

/* ═══ MULTI-SELECT EDIT (Ctrl+Shift+L / Ctrl+D style) ═══ */

function openMultiEdit() {
  const input = document.getElementById('code-search-input');
  const query = input?.value?.trim();
  if (query) {
    openMultiEditWithQuery(query);
  } else {
    const panel = document.getElementById('multi-edit-panel');
    if (!panel) return;
    panel.style.display = 'block';
    panel.innerHTML = `
      <div class="multi-edit-header">
        <span style="font-weight:700;color:var(--cyan)">⊞ Multi-Select Edit</span>
        <button class="rt-close" onclick="closeMultiEdit()">✕</button>
      </div>
      <div style="padding:12px">
        <div style="font-size:11px;color:var(--text-dim);margin-bottom:8px">Enter variable/symbol name to find and replace across all files:</div>
        <div style="display:flex;gap:6px">
          <input class="form-input" id="multi-edit-query" placeholder="Variable or symbol name..." style="flex:1"
            onkeydown="if(event.key==='Enter')runMultiFind()">
          <button class="code-search-btn" onclick="runMultiFind()">Find All</button>
        </div>
      </div>`;
    document.getElementById('multi-edit-query')?.focus();
  }
}

function openMultiEditWithQuery(query) {
  const panel = document.getElementById('multi-edit-panel');
  if (!panel) return;
  panel.style.display = 'block';

  const occurrences = [];
  const allFiles = Object.keys(APP.files);
  for (const filePath of allFiles) {
    const lines = APP.files[filePath].content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      let idx = -1;
      while ((idx = lines[i].indexOf(query, idx + 1)) !== -1) {
        occurrences.push({ file: filePath, line: i + 1, col: idx, text: lines[i].trim() });
      }
    }
  }

  multiSelectState = { query, occurrences, currentIdx: 0 };

  const byFile = {};
  for (const o of occurrences) {
    if (!byFile[o.file]) byFile[o.file] = [];
    byFile[o.file].push(o);
  }

  let previewHtml = '';
  for (const [file, occs] of Object.entries(byFile)) {
    const shortFile = file.split('/').pop();
    const icon = getFileIcon(file);
    previewHtml += `<div class="multi-edit-file-group">
      <div style="padding:4px 8px;font-size:10px;font-family:var(--font-mono);color:var(--cyan);font-weight:700;background:var(--bg-deep);border-bottom:1px solid var(--border)">${icon} ${shortFile} <span style="color:var(--text-dim);font-weight:400">(${occs.length})</span></div>`;
    for (const o of occs.slice(0, 10)) {
      const highlighted = escapeHtml(o.text).replace(
        new RegExp(`(${escapeRegex(query)})`, 'g'),
        '<mark>$1</mark>'
      );
      previewHtml += `<div class="search-result-item" onclick="viewFile('${o.file}', ${o.line})">
        <span class="search-result-line-num">:${o.line}</span>
        <span class="search-result-text">${highlighted}</span>
      </div>`;
    }
    if (occs.length > 10) previewHtml += `<div style="padding:3px 12px;font-size:9px;color:var(--text-dim)">…${occs.length - 10} more</div>`;
    previewHtml += `</div>`;
  }

  panel.innerHTML = `
    <div class="multi-edit-header">
      <span style="font-weight:700;color:var(--cyan)">⊞ Multi-Select Edit</span>
      <span style="font-size:10px;color:var(--amber);margin-left:8px">${occurrences.length} occurrences in ${Object.keys(byFile).length} files</span>
      <span style="flex:1"></span>
      <button class="rt-close" onclick="closeMultiEdit()">✕</button>
    </div>
    <div style="padding:8px 12px;border-bottom:1px solid var(--border);display:flex;gap:6px;align-items:center">
      <span style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">Find:</span>
      <input class="form-input" id="multi-edit-find" value="${escapeHtml(query)}" style="flex:1;padding:4px 8px;font-size:11px" readonly>
      <span style="font-size:10px;color:var(--text-dim);font-family:var(--font-mono)">Replace:</span>
      <input class="form-input" id="multi-edit-replace" placeholder="New name…" style="flex:1;padding:4px 8px;font-size:11px"
        onkeydown="if(event.key==='Enter')executeMultiReplace()">
      <button class="code-search-btn" onclick="executeMultiReplace()" style="background:var(--green);white-space:nowrap">Replace All</button>
    </div>
    <div style="max-height:200px;overflow:auto">${previewHtml}</div>
    <div style="padding:6px 12px;font-size:9px;color:var(--text-dim);border-top:1px solid var(--border)">
      Ctrl+D: step through matches · Enter: replace all · Esc: cancel
    </div>`;

  document.getElementById('multi-edit-replace')?.focus();
}

function runMultiFind() {
  const query = document.getElementById('multi-edit-query')?.value?.trim();
  if (!query) return;
  openMultiEditWithQuery(query);
}

function executeMultiReplace() {
  const findText = document.getElementById('multi-edit-find')?.value;
  const replaceText = document.getElementById('multi-edit-replace')?.value;
  if (!findText || replaceText === undefined || replaceText === null) return;

  let totalReplaced = 0;
  for (const filePath of Object.keys(APP.files)) {
    const original = APP.files[filePath].content;
    const updated = original.split(findText).join(replaceText);
    if (updated !== original) {
      setFileContent(filePath, updated);
      totalReplaced += (original.split(findText).length - 1);
    }
  }

  reParseProject();

  const panel = document.getElementById('multi-edit-panel');
  if (panel) {
    panel.innerHTML = `<div style="padding:16px;text-align:center">
      <div style="font-size:14px;color:var(--green);font-weight:700;margin-bottom:4px">✓ Replaced ${totalReplaced} occurrences</div>
      <div style="font-size:11px;color:var(--text-dim)">"${escapeHtml(findText)}" → "${escapeHtml(replaceText)}"</div>
      <button class="code-search-btn" onclick="closeMultiEdit()" style="margin-top:8px">Done</button>
    </div>`;
  }

  if (currentViewFile) setTimeout(() => viewFile(currentViewFile), 100);
}

function closeMultiEdit() {
  const panel = document.getElementById('multi-edit-panel');
  if (panel) panel.style.display = 'none';
  multiSelectState = { selections: [], query: '', files: [], currentIdx: -1 };
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* ═══ Snippet helper (used by graph tooltips) ═══ */

function getCodeSnippet(filePath, lineNum, contextLines) {
  contextLines = contextLines || 1;
  const file = APP.files[filePath];
  if (!file) return null;
  const lines = file.content.split('\n');
  const start = Math.max(0, lineNum - 1 - contextLines);
  const end = Math.min(lines.length, lineNum + contextLines);
  const snippetLines = [];
  for (let i = start; i < end; i++) {
    snippetLines.push({ num: i + 1, text: lines[i], highlight: i === lineNum - 1 });
  }
  return snippetLines;
}

function renderSnippetHtml(snippetLines, filePath) {
  if (!snippetLines) return '';
  return `<div class="tip-snippet">${snippetLines.map(l =>
    `<div class="snippet-line${l.highlight ? ' snippet-highlight' : ''}">` +
    `<span class="snippet-ln">${l.num}</span>` +
    `<span class="snippet-code">${highlightCodeSafe(l.text, filePath)}</span></div>`
  ).join('')}</div>`;
}

/* ═══ EDITABLE SNIPPET — Standalone click-to-edit (for detail panels) ═══ */
function renderEditableSnippetHtml(snippetLines, filePath) {
  if (!snippetLines) return '';
  const safeFile = filePath.replace(/'/g, "\\'");
  return `<div class="tip-snippet rt-editable-snippet" data-file="${filePath}">${snippetLines.map(l => {
    const highlighted = highlightCodeSafe(l.text, filePath);
    return `<div class="snippet-line snippet-editable${l.highlight ? ' snippet-highlight' : ''}" data-line-num="${l.num}">` +
      `<span class="snippet-ln">${l.num}</span>` +
      `<span class="snippet-code" onclick="startStandaloneEdit(event,'${safeFile}',${l.num})">${highlighted}</span></div>`;
  }).join('')}</div>`;
}

/* ═══ STANDALONE INLINE EDIT — For detail panels outside RichTooltip ═══ */
function startStandaloneEdit(event, filePath, lineNum) {
  event.stopPropagation();
  const snippetLine = event.target.closest('.snippet-line');
  if (!snippetLine) return;
  const codeSpan = snippetLine.querySelector('.snippet-code');
  if (!codeSpan || codeSpan.querySelector('.rt-inline-editor')) return;

  const file = APP.files[filePath];
  if (!file) return;
  const lines = file.content.split('\n');
  const lineIdx = lineNum - 1;
  if (lineIdx < 0 || lineIdx >= lines.length) return;
  const originalText = lines[lineIdx];
  const savedHighlight = codeSpan.innerHTML;

  const editor = document.createElement('div');
  editor.className = 'rt-inline-editor';
  editor.contentEditable = 'true';
  editor.spellcheck = false;
  editor.textContent = originalText;
  codeSpan.innerHTML = '';
  codeSpan.appendChild(editor);
  codeSpan.classList.add('editing');
  editor.focus();

  try {
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(editor);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch(e) {}

  let acDropdown = null;

  const showAc = () => {
    const text = editor.textContent;
    const cursorPos = window.getSelection()?.focusOffset || text.length;
    const before = text.substring(0, cursorPos);
    const wordMatch = before.match(/[\w.]+$/);
    if (!wordMatch || wordMatch[0].length < 2) { hideAc(); return; }
    const partial = wordMatch[0].toLowerCase();
    const candidates = new Set();
    APP.parsed.classes.forEach(c => candidates.add(c.name));
    APP.parsed.functions.forEach(f => candidates.add(f.name));
    APP.parsed.providers.forEach(p => candidates.add(p.name));
    APP.parsed.classes.forEach(c => c.methods.forEach(m => candidates.add(m)));
    const matches = [...candidates].filter(c => c.toLowerCase().startsWith(partial) && c.toLowerCase() !== partial).sort((a, b) => a.length - b.length).slice(0, 6);
    if (matches.length === 0) { hideAc(); return; }
    if (!acDropdown) { acDropdown = document.createElement('div'); acDropdown.className = 'rt-autocomplete'; codeSpan.appendChild(acDropdown); }
    acDropdown.innerHTML = matches.map((m, i) => `<div class="rt-ac-item${i === 0 ? ' active' : ''}" data-value="${escapeHtml(m)}">${escapeHtml(m)}</div>`).join('');
    acDropdown.style.display = 'block';
    acDropdown.querySelectorAll('.rt-ac-item').forEach(item => { item.addEventListener('mousedown', (e) => { e.preventDefault(); applyAc(item.dataset.value); }); });
  };

  const hideAc = () => { if (acDropdown) acDropdown.style.display = 'none'; };

  const applyAc = (value) => {
    const text = editor.textContent;
    const cursorPos = window.getSelection()?.focusOffset || text.length;
    const before = text.substring(0, cursorPos);
    const wordMatch = before.match(/[\w.]+$/);
    if (!wordMatch) return;
    const wordStart = cursorPos - wordMatch[0].length;
    editor.textContent = text.substring(0, wordStart) + value + text.substring(cursorPos);
    try { const range = document.createRange(); const sel = window.getSelection(); const newPos = wordStart + value.length; if (editor.firstChild) { range.setStart(editor.firstChild, Math.min(newPos, editor.firstChild.length)); range.collapse(true); sel.removeAllRanges(); sel.addRange(range); } } catch(e) {}
    hideAc();
  };

  let debounce = null;
  editor.addEventListener('input', () => { clearTimeout(debounce); debounce = setTimeout(showAc, 200); });

  editor.addEventListener('blur', () => {
    clearTimeout(debounce); hideAc();
    const newText = editor.textContent;
    lines[lineIdx] = newText;
    setFileContent(filePath, lines.join('\n'));
    codeSpan.classList.remove('editing');
    codeSpan.innerHTML = highlightCodeSafe(newText, filePath);
    if (typeof reParseProject === 'function') reParseProject();
  });

  editor.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); editor.blur(); }
    if (e.key === 'Escape') { e.preventDefault(); codeSpan.classList.remove('editing'); codeSpan.innerHTML = savedHighlight; hideAc(); }
    if (e.key === 'Tab') {
      e.stopPropagation();
      if (acDropdown && acDropdown.style.display === 'block') { e.preventDefault(); const active = acDropdown.querySelector('.rt-ac-item.active'); if (active) applyAc(active.dataset.value); }
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (acDropdown && acDropdown.style.display === 'block') {
        e.preventDefault();
        const items = acDropdown.querySelectorAll('.rt-ac-item');
        const active = acDropdown.querySelector('.rt-ac-item.active');
        let idx = [...items].indexOf(active);
        if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1); else idx = Math.max(idx - 1, 0);
        items.forEach((it, i) => it.classList.toggle('active', i === idx));
      }
    }
  });
}

/* ═══ QUICK-OPEN PALETTE — Ctrl+P (files) / Ctrl+Shift+O (symbols) ═══ */

let paletteState = { mode: 'files', items: [], filtered: [], idx: 0 };

function openPalette(mode) {
  closePalette();
  paletteState.mode = mode;
  if (mode === 'files') {
    paletteState.items = Object.keys(APP.files).map(p => ({ label: p.split('/').pop(), detail: p, file: p, line: 1, icon: getFileIcon(p) }));
  } else {
    const p = APP.parsed;
    paletteState.items = [
      ...p.classes.map(c => ({ label: c.name, detail: `class · ${c.file}`, file: c.file, line: c.line, icon: '◆' })),
      ...p.functions.map(f => ({ label: f.name, detail: `fn · ${f.file}`, file: f.file, line: f.line, icon: '⨍' })),
      ...p.providers.map(pr => ({ label: pr.name, detail: `${pr.type || 'provider'} · ${pr.file}`, file: pr.file, line: pr.line || 1, icon: '◉' })),
    ];
  }
  const overlay = document.createElement('div');
  overlay.id = 'palette-overlay';
  overlay.innerHTML = `
    <div class="palette-box">
      <input class="palette-input" id="palette-input" placeholder="${mode === 'files' ? 'Jump to file…' : 'Jump to symbol…'}" autocomplete="off">
      <div class="palette-list" id="palette-list"></div>
    </div>`;
  overlay.addEventListener('mousedown', e => { if (e.target === overlay) closePalette(); });
  document.body.appendChild(overlay);
  const input = document.getElementById('palette-input');
  input.addEventListener('input', () => filterPalette(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closePalette(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); paletteState.idx = Math.min(paletteState.idx + 1, paletteState.filtered.length - 1); renderPaletteList(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteState.idx = Math.max(paletteState.idx - 1, 0); renderPaletteList(); }
    else if (e.key === 'Enter') { e.preventDefault(); pickPaletteItem(paletteState.idx); }
  });
  input.focus();
  filterPalette('');
}

function filterPalette(q) {
  const ql = q.toLowerCase();
  // Simple fuzzy: all query chars in order
  const fuzzy = (s) => {
    if (!ql) return true;
    let i = 0;
    for (const ch of s.toLowerCase()) { if (ch === ql[i]) i++; if (i === ql.length) return true; }
    return false;
  };
  const starts = [], contains = [], fuzz = [];
  for (const item of paletteState.items) {
    const l = item.label.toLowerCase();
    if (ql && l.startsWith(ql)) starts.push(item);
    else if (ql && l.includes(ql)) contains.push(item);
    else if (fuzzy(item.label)) fuzz.push(item);
  }
  paletteState.filtered = [...starts, ...contains, ...fuzz].slice(0, 50);
  paletteState.idx = 0;
  renderPaletteList();
}

function renderPaletteList() {
  const list = document.getElementById('palette-list');
  if (!list) return;
  list.innerHTML = paletteState.filtered.map((item, i) =>
    `<div class="palette-item ${i === paletteState.idx ? 'active' : ''}" onclick="pickPaletteItem(${i})">
      <span class="palette-icon">${item.icon}</span>
      <span class="palette-label">${escapeHtml(item.label)}</span>
      <span class="palette-detail">${escapeHtml(item.detail)}</span>
    </div>`).join('') || '<div style="padding:12px;color:var(--text-dim);font-size:11px">No matches</div>';
  list.querySelector('.palette-item.active')?.scrollIntoView({ block: 'nearest' });
}

function pickPaletteItem(i) {
  const item = paletteState.filtered[i];
  closePalette();
  if (item) navigateToFile(item.file, item.line);
}

function closePalette() {
  document.getElementById('palette-overlay')?.remove();
}

document.addEventListener('keydown', e => {
  if (!document.getElementById('app')?.classList.contains('active')) return;
  if (e.ctrlKey && !e.shiftKey && e.key === 'p') { e.preventDefault(); openPalette('files'); }
  if (e.ctrlKey && e.shiftKey && (e.key === 'O' || e.key === 'o')) { e.preventDefault(); openPalette('symbols'); }
});
