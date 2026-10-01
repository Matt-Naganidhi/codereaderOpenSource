/* ═══════════════════════════════════════════════════
   Code Architect — ui-tooltip.js
   Shared rich tooltip with:
   - Drag-around support (grab header to drag)
   - Tab key freeze/accumulate (tab again to dismiss all)
   - Click-to-edit inline with preserved syntax highlighting
   - Autocomplete suggestions dropdown
   ═══════════════════════════════════════════════════ */

const RichTooltip = {
  _instances: {},
  _frozenTooltips: [],
  _frozen: false,
  _dragState: null,

  create(containerId, id) {
    const container = document.getElementById(containerId);
    if (!container) return null;
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.className = 'rich-tooltip';
      container.appendChild(el);
    }
    const inst = {
      el, pinned: false, expanded: false, activeTab: 0,
      tabs: [], node: null, _searchFilter: '', _editMode: false, _editFile: null,
      _editContent: '', _editLine: null, _containerId: containerId,
    };
    this._instances[id] = inst;
    this._setupDrag(id, el);
    return inst;
  },

  /* ═══ DRAG SUPPORT ═══ */
  _setupDrag(id, el) {
    const onDown = (e) => {
      const isHeader = e.target.closest('.rt-header');
      if (!isHeader) return;
      if (e.target.closest('.rt-close') || e.target.closest('.rt-expand-btn')) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = el.getBoundingClientRect();
      const containerRect = el.parentElement.getBoundingClientRect();
      this._dragState = {
        id, el,
        offsetX: e.clientX - rect.left,
        offsetY: e.clientY - rect.top,
        containerLeft: containerRect.left,
        containerTop: containerRect.top,
      };
      el.classList.add('dragging');
    };
    el.addEventListener('mousedown', onDown);

    const onMove = (e) => {
      if (!this._dragState || this._dragState.id !== id) return;
      const ds = this._dragState;
      ds.el.style.left = Math.max(0, e.clientX - ds.containerLeft - ds.offsetX) + 'px';
      ds.el.style.top = Math.max(0, e.clientY - ds.containerTop - ds.offsetY) + 'px';
    };
    document.addEventListener('mousemove', onMove);

    const onUp = () => {
      if (this._dragState && this._dragState.id === id) {
        this._dragState.el.classList.remove('dragging');
        this._dragState = null;
      }
    };
    document.addEventListener('mouseup', onUp);
  },

  show(id, opts) {
    if (this._frozen) return;
    const inst = this._instances[id];
    if (!inst) return;
    inst.node = opts.node;
    inst.tabs = opts.tabs || [];
    inst.activeTab = 0;
    inst._searchFilter = '';
    inst._editMode = false;
    inst.expanded = false;
    inst.el.classList.remove('expanded');
    this._render(id);
    inst.el.classList.add('visible');
    inst.el.classList.remove('pinned');
    inst.pinned = false;
    this._position(id, opts.x, opts.y, opts.containerRect);
  },

  pin(id, opts) {
    const inst = this._instances[id];
    if (!inst) return;
    inst.node = opts.node;
    inst.tabs = opts.tabs || [];
    inst.activeTab = 0;
    inst._searchFilter = '';
    inst._editMode = false;
    this._render(id);
    inst.el.classList.add('visible', 'pinned');
    inst.pinned = true;
    this._position(id, opts.x, opts.y, opts.containerRect);
  },

  hide(id) {
    if (this._frozen) return;
    const inst = this._instances[id];
    if (!inst || inst.pinned) return;
    inst.el.classList.remove('visible');
  },

  dismiss(id) {
    const inst = this._instances[id];
    if (!inst) return;
    inst.pinned = false;
    inst._editMode = false;
    inst.el.classList.remove('visible', 'pinned', 'expanded', 'frozen');
  },

  isPinned(id) {
    return this._instances[id]?.pinned || false;
  },

  /* ═══ TAB KEY FREEZE / ACCUMULATE ═══ */
  handleGlobalTab(e) {
    if (e.key !== 'Tab') return;
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    if (e.target.closest('.rt-inline-editor')) return;
    if (e.target.closest('.rt-editor')) return;

    e.preventDefault();
    if (this._frozen) {
      this._unfreezeAll();
    } else {
      this._freezeAll();
    }
  },

  _freezeAll() {
    this._frozen = true;
    this._frozenTooltips = [];
    for (const [id, inst] of Object.entries(this._instances)) {
      if (inst.el.classList.contains('visible')) {
        inst.pinned = true;
        inst.el.classList.add('pinned', 'frozen');
        this._frozenTooltips.push(id);
      }
    }
    document.body.classList.add('tooltips-frozen');
  },

  _unfreezeAll() {
    this._frozen = false;
    for (const id of this._frozenTooltips) {
      const inst = this._instances[id];
      if (inst) {
        inst.pinned = false;
        inst.el.classList.remove('visible', 'pinned', 'frozen', 'expanded');
      }
    }
    this._frozenTooltips = [];
    document.body.classList.remove('tooltips-frozen');
  },

  _position(id, x, y, containerRect) {
    const inst = this._instances[id];
    if (!inst) return;
    const maxX = (containerRect?.width || 800) - inst.el.offsetWidth - 10;
    const maxY = (containerRect?.height || 600) - inst.el.offsetHeight - 10;
    inst.el.style.left = Math.max(8, Math.min(x + 14, maxX)) + 'px';
    inst.el.style.top = Math.max(8, Math.min(y - 12, maxY)) + 'px';
  },

  _render(id) {
    const inst = this._instances[id];
    if (!inst) return;
    const tabs = inst.tabs;
    const node = inst.node || {};
    const color = node.color || 'var(--cyan)';
    const title = node.title || node.fullLabel || node.label || node.name || '';
    const badge = node.badge || '';
    const badgeColor = node.badgeColor || color;
    const path = node.path || node.id || node.file || '';

    let html = `<div class="rt-header" style="cursor:grab">
      <div class="rt-title" style="color:${color}">${escapeHtml(title)}</div>
      ${badge ? `<span class="rt-badge" style="background:${badgeColor}25;color:${badgeColor}">${badge}</span>` : ''}
      <div class="rt-expand-btn" onclick="RichTooltip._toggleExpand('${id}')" title="Expand">⬡</div>
      ${inst.pinned ? `<div class="rt-close" onclick="RichTooltip.dismiss('${id}')">✕</div>` : ''}
    </div>`;

    if (path) html += `<div class="rt-path">${escapeHtml(path)}</div>`;

    if (node.stats && node.stats.length > 0) {
      html += `<div class="rt-stats">${node.stats.map(s =>
        `<span class="rt-stat"><span class="rt-stat-dot" style="background:${s.color}"></span>${s.label}</span>`
      ).join('')}</div>`;
    }

    if (tabs.length > 1) {
      html += `<div class="rt-tabs">${tabs.map((t, i) =>
        `<div class="rt-tab ${i === inst.activeTab ? 'active' : ''}" onclick="RichTooltip._switchTab('${id}',${i})">${t.label}</div>`
      ).join('')}</div>`;
    }

    html += '<div class="rt-body">';
    for (let i = 0; i < tabs.length; i++) {
      const tab = tabs[i];
      html += `<div class="rt-page ${i === inst.activeTab ? 'active' : ''}" data-tab-idx="${i}">`;

      if (tab.searchable) {
        html += `<div class="rt-search"><input placeholder="Search in ${tab.label}…" value="${inst._searchFilter}"
          oninput="RichTooltip._onSearch('${id}',this.value,${i})"></div>`;
      }

      if (tab.sections) {
        for (const section of tab.sections) {
          html += `<div class="rt-section">`;
          if (section.title) html += `<div class="rt-section-title">${section.title}</div>`;
          if (section.html) html += section.html;
          if (section.snippet) {
            if (tab.inlineEditable && section.filePath) {
              html += this._renderEditableSnippet(section.snippet, section.filePath, id);
            } else {
              html += this._renderSnippet(section.snippet, section.filePath);
            }
          }
          if (section.buttons) {
            html += `<div style="display:flex;flex-wrap:wrap;gap:2px;margin-top:4px">${section.buttons.map(b =>
              `<button class="rt-btn ${b.cls||''}" onclick="event.stopPropagation();${b.onclick}">${b.label}</button>`
            ).join('')}</div>`;
          }
          html += `</div>`;
        }
      }

      if (tab.expandSections) {
        for (let j = 0; j < tab.expandSections.length; j++) {
          const es = tab.expandSections[j];
          const esId = `${id}-exp-${i}-${j}`;
          html += `<div class="rt-expand-section">
            <button class="rt-expand-toggle" onclick="RichTooltip._toggleExpandSection('${esId}')">
              <span class="rt-arrow" id="${esId}-arrow">▸</span> ${es.title} ${es.count != null ? `<span style="color:var(--text-dim);font-weight:400">(${es.count})</span>` : ''}
            </button>
            <div class="rt-expand-content" id="${esId}-content">${es.html || ''}</div>
          </div>`;
        }
      }

      if (tab.editable) {
        const ef = tab.editFile || '';
        html += `<div class="rt-section">
          <button class="rt-btn nav-btn" onclick="RichTooltip._toggleEdit('${id}','${ef.replace(/'/g,"\\'")}')">
            ${inst._editMode ? '✕ Cancel Edit' : '✎ Edit Source'}
          </button>
          ${inst._editMode ? `<div class="rt-editor-wrap">
            <textarea class="rt-editor" id="${id}-editor" spellcheck="false">${escapeHtml(inst._editContent || APP.files[ef]?.content || '')}</textarea>
            <div class="rt-editor-actions">
              <button class="rt-save-btn" onclick="RichTooltip._saveEdit('${id}','${ef.replace(/'/g,"\\'")}')">Save & Re-parse</button>
              <button class="rt-cancel-btn" onclick="RichTooltip._toggleEdit('${id}','${ef.replace(/'/g,"\\'")}')">Cancel</button>
            </div>
          </div>` : ''}
        </div>`;
      }

      html += `</div>`;
    }
    html += '</div>';

    if (node.actions && node.actions.length > 0) {
      html += `<div class="rt-section" style="border-top:1px solid var(--border);padding:6px 14px">
        <div style="display:flex;flex-wrap:wrap;gap:4px">${node.actions.map(a =>
          `<button class="rt-btn ${a.cls||'nav-btn'}" onclick="event.stopPropagation();${a.onclick}">${a.label}</button>`
        ).join('')}</div>
      </div>`;
    }

    if (!inst.pinned) {
      html += `<div class="rt-hint">Click to pin · Drag header to move · Tab to freeze</div>`;
    }

    inst.el.innerHTML = html;
  },

  /* ═══ EDITABLE SNIPPET — Click line to edit inline ═══ */

  _renderEditableSnippet(lines, filePath, tooltipId) {
    if (!lines || lines.length === 0) return '';
    return `<div class="rt-snippet rt-editable-snippet" data-file="${filePath}" data-tooltip="${tooltipId}">
      ${lines.map(l => {
        const highlighted = highlightCodeSafe(l.text, filePath);
        return `<div class="snippet-line snippet-editable${l.highlight ? ' snippet-highlight' : ''}" data-line-num="${l.num}">` +
          `<span class="snippet-ln">${l.num}</span>` +
          `<span class="snippet-code" data-highlighted="${encodeURIComponent(highlighted)}" onclick="RichTooltip._startInlineEdit(event,'${filePath.replace(/'/g,"\\'")}',${l.num},'${tooltipId}')">${highlighted}</span></div>`;
      }).join('')}</div>`;
  },

  _startInlineEdit(event, filePath, lineNum, tooltipId) {
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

    // Store the highlighted version
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

    // Place cursor near click
    try {
      const range = document.createRange();
      const sel = window.getSelection();
      range.selectNodeContents(editor);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
    } catch(e) {}

    // Autocomplete state
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

      const matches = [...candidates]
        .filter(c => c.toLowerCase().startsWith(partial) && c.toLowerCase() !== partial)
        .sort((a, b) => a.length - b.length).slice(0, 6);

      if (matches.length === 0) { hideAc(); return; }

      if (!acDropdown) {
        acDropdown = document.createElement('div');
        acDropdown.className = 'rt-autocomplete';
        codeSpan.appendChild(acDropdown);
      }
      acDropdown.innerHTML = matches.map((m, i) =>
        `<div class="rt-ac-item${i === 0 ? ' active' : ''}" data-value="${escapeHtml(m)}">${escapeHtml(m)}</div>`
      ).join('');
      acDropdown.style.display = 'block';

      acDropdown.querySelectorAll('.rt-ac-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          applyAc(item.dataset.value);
        });
      });
    };

    const hideAc = () => {
      if (acDropdown) acDropdown.style.display = 'none';
    };

    const applyAc = (value) => {
      const text = editor.textContent;
      const cursorPos = window.getSelection()?.focusOffset || text.length;
      const before = text.substring(0, cursorPos);
      const wordMatch = before.match(/[\w.]+$/);
      if (!wordMatch) return;
      const wordStart = cursorPos - wordMatch[0].length;
      editor.textContent = text.substring(0, wordStart) + value + text.substring(cursorPos);
      try {
        const range = document.createRange();
        const sel = window.getSelection();
        const newPos = wordStart + value.length;
        if (editor.firstChild) {
          range.setStart(editor.firstChild, Math.min(newPos, editor.firstChild.length));
          range.collapse(true);
          sel.removeAllRanges();
          sel.addRange(range);
        }
      } catch(e) {}
      hideAc();
    };

    let debounce = null;
    editor.addEventListener('input', () => {
      clearTimeout(debounce);
      debounce = setTimeout(showAc, 200);
    });

    editor.addEventListener('blur', () => {
      clearTimeout(debounce);
      hideAc();
      const newText = editor.textContent;
      lines[lineIdx] = newText;
      setFileContent(filePath, lines.join('\n'));
      codeSpan.classList.remove('editing');
      codeSpan.innerHTML = highlightCodeSafe(newText, filePath);
      if (typeof reParseProject === 'function') reParseProject();
    });

    editor.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); editor.blur(); }
      if (e.key === 'Escape') {
        e.preventDefault();
        codeSpan.classList.remove('editing');
        codeSpan.innerHTML = savedHighlight;
        hideAc();
      }
      if (e.key === 'Tab') {
        e.stopPropagation();
        if (acDropdown && acDropdown.style.display === 'block') {
          e.preventDefault();
          const active = acDropdown.querySelector('.rt-ac-item.active');
          if (active) applyAc(active.dataset.value);
        }
      }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (acDropdown && acDropdown.style.display === 'block') {
          e.preventDefault();
          const items = acDropdown.querySelectorAll('.rt-ac-item');
          const active = acDropdown.querySelector('.rt-ac-item.active');
          let idx = [...items].indexOf(active);
          if (e.key === 'ArrowDown') idx = Math.min(idx + 1, items.length - 1);
          else idx = Math.max(idx - 1, 0);
          items.forEach((it, i) => it.classList.toggle('active', i === idx));
        }
      }
    });
  },

  /* ═══ STANDARD SNIPPET RENDERER ═══ */

  _renderSnippet(lines, filePath) {
    if (!lines || lines.length === 0) return '';
    return `<div class="rt-snippet">${lines.map(l => {
      const highlighted = highlightCodeSafe(l.text, filePath);
      return `<div class="snippet-line${l.highlight ? ' snippet-highlight' : ''}">` +
        `<span class="snippet-ln">${l.num}</span>` +
        `<span class="snippet-code">${highlighted}</span></div>`;
    }).join('')}</div>`;
  },

  _switchTab(id, idx) {
    const inst = this._instances[id];
    if (!inst) return;
    inst.activeTab = idx;
    inst.el.querySelectorAll('.rt-tab').forEach((t, i) => t.classList.toggle('active', i === idx));
    inst.el.querySelectorAll('.rt-page').forEach((p, i) => p.classList.toggle('active', i === idx));
  },

  _toggleExpand(id) {
    const inst = this._instances[id];
    if (!inst) return;
    inst.expanded = !inst.expanded;
    inst.el.classList.toggle('expanded', inst.expanded);
  },

  _toggleExpandSection(esId) {
    const content = document.getElementById(esId + '-content');
    const arrow = document.getElementById(esId + '-arrow');
    if (!content) return;
    const isOpen = content.classList.toggle('open');
    if (arrow) arrow.classList.toggle('open', isOpen);
  },

  _onSearch(id, val, tabIdx) {
    const inst = this._instances[id];
    if (!inst) return;
    inst._searchFilter = val;
    const q = val.toLowerCase();
    const page = inst.el.querySelector(`.rt-page[data-tab-idx="${tabIdx}"]`);
    if (!page) return;
    page.querySelectorAll('.rt-conn-item, .rt-expand-section').forEach(el => {
      const text = el.textContent.toLowerCase();
      el.style.display = !q || text.includes(q) ? '' : 'none';
    });
  },

  _toggleEdit(id, filePath) {
    const inst = this._instances[id];
    if (!inst) return;
    inst._editMode = !inst._editMode;
    inst._editFile = filePath;
    inst._editContent = APP.files[filePath]?.content || '';
    this._render(id);
    if (inst._editMode) {
      setTimeout(() => {
        const editor = document.getElementById(id + '-editor');
        if (editor) {
          editor.focus();
          editor.addEventListener('keydown', (e) => {
            if (e.key === 'Tab') {
              e.preventDefault();
              e.stopPropagation();
              const start = editor.selectionStart;
              const end = editor.selectionEnd;
              editor.value = editor.value.substring(0, start) + '  ' + editor.value.substring(end);
              editor.selectionStart = editor.selectionEnd = start + 2;
            }
          });
        }
      }, 50);
    }
  },

  _saveEdit(id, filePath) {
    const inst = this._instances[id];
    if (!inst) return;
    const editor = document.getElementById(id + '-editor');
    if (!editor || !filePath) return;
    const newContent = editor.value;
    setFileContent(filePath, newContent);
    inst._editMode = false;
    inst._editContent = newContent;
    this._render(id);
    if (typeof reParseProject === 'function') reParseProject();
  },
};

/* ═══ GLOBAL TAB KEY LISTENER ═══ */
document.addEventListener('keydown', (e) => RichTooltip.handleGlobalTab(e));

/* ═══ Helper: build tabs for a graph node ═══ */

function buildGraphTooltipTabs(node, edges, mode, tooltipId) {
  const incoming = edges.filter(ed => ed.target.id === node.id);
  const outgoing = edges.filter(ed => ed.source.id === node.id);

  let filePath = '';
  if (mode === 'file') {
    filePath = node.id;
  } else {
    const clsName = node.id.includes('.') ? node.id.split('.')[0] : node.id;
    const cls = APP.parsed.classes.find(c => c.name === clsName);
    if (cls) filePath = cls.file;
    if (!filePath) {
      const fn = APP.parsed.functions.find(f => f.name === clsName || f.name === node.id);
      if (fn) filePath = fn.file;
    }
  }

  // Tab 1: Overview with editable snippet
  const overviewSections = [];
  let mainSnippet = null;
  if (mode === 'file' && APP.files[node.id]) {
    const lines = APP.files[node.id].content.split('\n');
    mainSnippet = lines.slice(0, 12).map((t, i) => ({ num: i + 1, text: t, highlight: false }));
  } else if (mode === 'class') {
    const cls = APP.parsed.classes.find(c => c.name === node.id);
    if (cls) mainSnippet = getCodeSnippet(cls.file, cls.line, 5);
  } else if (mode === 'function' && node.id.includes('.')) {
    const [clsName, funcName] = node.id.split('.');
    const cls = APP.parsed.classes.find(c => c.name === clsName);
    if (cls) {
      const content = APP.files[cls.file]?.content || '';
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(funcName + '(') || lines[i].includes(`def ${funcName}`)) {
          mainSnippet = getCodeSnippet(cls.file, i + 1, 4);
          break;
        }
      }
    }
  }

  overviewSections.push({ title: 'PREVIEW (click to edit)', snippet: mainSnippet, filePath });

  // Tab 2: Imports
  const importSections = [];
  if (outgoing.length > 0) {
    let items = '';
    for (const ed of outgoing) {
      const targetLabel = ed.target.fullLabel || ed.target.label;
      let snipHtml = '';
      const sourceFile = mode === 'file' ? node.id : filePath;
      if (sourceFile && APP.files[sourceFile]) {
        const content = APP.files[sourceFile].content;
        const lines = content.split('\n');
        const targetName = ed.target.id.includes('.') ? ed.target.id.split('.').pop() : ed.target.id;
        let lineIdx = ed.fromLine ? ed.fromLine - 1 : -1;
        if (lineIdx < 0) for (let i = 0; i < lines.length; i++) if (lines[i].includes(targetName)) { lineIdx = i; break; }
        if (lineIdx >= 0) { const snip = getCodeSnippet(sourceFile, lineIdx + 1, 1); if (snip) snipHtml = RichTooltip._renderEditableSnippet(snip, sourceFile, tooltipId); }
      }
      const targetFile = mode === 'file' ? ed.target.id : (APP.parsed.classes.find(c => c.name === ed.target.id)?.file || APP.parsed.functions.find(f => f.name === ed.target.id)?.file || '');
      items += `<div class="rt-conn-item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:var(--import-color)">→</span>
          <span style="color:var(--text-bright);font-weight:600">${escapeHtml(targetLabel)}</span>
          <button class="rt-btn import-btn" style="margin-left:auto;padding:2px 6px;font-size:9px"
            onclick="event.stopPropagation();navigateToFile('${targetFile.replace(/'/g,"\\'")}',${ed.fromLine||1})">Open ↗</button>
        </div>${snipHtml}</div>`;
    }
    importSections.push({ title: `IMPORTS (${outgoing.length})`, html: items });
  } else {
    importSections.push({ html: '<div style="color:var(--text-dim);font-size:10px;padding:4px 0">No outgoing imports</div>' });
  }

  // Tab 3: Used By
  const exportSections = [];
  if (incoming.length > 0) {
    let items = '';
    for (const ed of incoming) {
      const sourceLabel = ed.source.fullLabel || ed.source.label;
      let snipHtml = '';
      const sourceFile = mode === 'file' ? ed.source.id : (APP.parsed.classes.find(c => c.name === ed.source.id)?.file || APP.parsed.functions.find(f => f.name === ed.source.id)?.file || '');
      if (sourceFile && APP.files[sourceFile]) {
        const content = APP.files[sourceFile].content;
        const lines = content.split('\n');
        const searchName = node.id.includes('.') ? node.id.split('.').pop() : node.id;
        let lineIdx = ed.fromLine ? ed.fromLine - 1 : -1;
        if (lineIdx < 0) for (let i = 0; i < lines.length; i++) if (lines[i].includes(searchName)) { lineIdx = i; break; }
        if (lineIdx >= 0) { const snip = getCodeSnippet(sourceFile, lineIdx + 1, 1); if (snip) snipHtml = RichTooltip._renderEditableSnippet(snip, sourceFile, tooltipId); }
      }
      items += `<div class="rt-conn-item" style="flex-direction:column;align-items:stretch">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="color:var(--export-color)">←</span>
          <span style="color:var(--text-bright);font-weight:600">${escapeHtml(sourceLabel)}</span>
          <button class="rt-btn export-btn" style="margin-left:auto;padding:2px 6px;font-size:9px"
            onclick="event.stopPropagation();navigateToFile('${(sourceFile||'').replace(/'/g,"\\'")}',${ed.fromLine||1})">Open ↗</button>
        </div>${snipHtml}</div>`;
    }
    exportSections.push({ title: `USED BY (${incoming.length})`, html: items });
  } else {
    exportSections.push({ html: '<div style="color:var(--text-dim);font-size:10px;padding:4px 0">Not imported by any file</div>' });
  }

  const tabs = [
    { label: 'Overview', sections: overviewSections, inlineEditable: true },
    { label: `Imports (${outgoing.length})`, sections: importSections, searchable: true },
    { label: `Used By (${incoming.length})`, sections: exportSections, searchable: true },
  ];

  if (filePath && APP.files[filePath]) {
    tabs.push({ label: '✎ Edit', editable: true, editFile: filePath, sections: [] });
  }

  return tabs;
}
