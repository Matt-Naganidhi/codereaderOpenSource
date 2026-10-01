/* ═══════════════════════════════════════════════════
   Code Architect — ui-classes.js
   Enhanced class map with hierarchical dropdown:
   Source Files → Classes → Functions (Reddit-style)
   Universal language support
   ═══════════════════════════════════════════════════ */

let selectedClass = null;
let classViewLevel = 'class';

function renderClasses() {
  const panel = document.getElementById('panel-classes');
  const classes = APP.parsed.classes;
  const enums = APP.parsed.enums;

  if (classes.length === 0 && enums.length === 0) {
    panel.innerHTML = `<div class="diff-empty" style="height:100%"><div style="font-size:28px;opacity:0.3">◆</div>No classes found</div>`;
    return;
  }

  panel.innerHTML = `
    <div class="classmap">
      <div class="classmap-sidebar">
        <div class="search-bar" style="border-bottom:1px solid var(--border);margin:-12px -12px 8px -12px;padding:8px 12px">
          <input class="search-input" placeholder="Filter…" id="class-search" oninput="filterClasses(this.value)">
        </div>
        <div style="display:flex;gap:4px;margin-bottom:8px;padding:0 2px">
          <button class="graph-level-btn ${classViewLevel==='file'?'active':''}" onclick="switchClassViewLevel('file')" style="flex:1;padding:4px 6px;font-size:9px">◎ Files</button>
          <button class="graph-level-btn ${classViewLevel==='class'?'active':''}" onclick="switchClassViewLevel('class')" style="flex:1;padding:4px 6px;font-size:9px">◆ Classes</button>
          <button class="graph-level-btn ${classViewLevel==='function'?'active':''}" onclick="switchClassViewLevel('function')" style="flex:1;padding:4px 6px;font-size:9px">⨍ Methods</button>
        </div>
        <div id="class-sidebar-content"></div>
      </div>
      <div class="classmap-detail" id="class-detail">
        <div class="source-empty"><div class="source-empty-icon">◆</div>Select a class to inspect</div>
      </div>
    </div>`;
  renderClassSidebar();
}

function switchClassViewLevel(level) {
  classViewLevel = level;
  renderClassSidebar();
}

function getClassTypeLabel(cls) {
  if (cls.lang === 'c') return 'STRUCT';
  if (cls.lang === 'sql') return cls.widgetType === 'sql-view' ? 'VIEW' : 'TABLE';
  if (cls.lang === 'css') return 'SELECTOR';
  if (cls.lang === 'html') return cls.widgetType === 'web-component' ? 'COMPONENT' : 'ELEMENT';
  if (cls.widgetType) {
    const labels = {
      stateless:'STATELESS', stateful:'STATEFUL', state:'STATE',
      notifier:'NOTIFIER', bloc:'BLOC',
      'pyqt-widget':'PYQT WIDGET', 'tkinter-widget':'TKINTER',
      'django-view':'VIEW', 'django-model':'MODEL', 'django-serializer':'SERIALIZER',
      'flask-view':'FLASK VIEW', 'react-class':'REACT CLASS', 'react-functional':'REACT FC',
      'web-component':'WEB COMPONENT', 'interface':'INTERFACE', 'sql-view':'SQL VIEW',
    };
    return labels[cls.widgetType] || cls.widgetType.toUpperCase();
  }
  if (cls.isAbstract) return 'ABSTRACT';
  return 'CLASS';
}

function getTypeColor(cls) {
  const typeColors = {
    stateless:'var(--cyan)', stateful:'var(--green)', state:'var(--green)',
    notifier:'var(--purple)', bloc:'var(--amber)',
    'pyqt-widget':'var(--cyan)', 'tkinter-widget':'var(--cyan)',
    'django-view':'var(--green)', 'django-model':'var(--red)', 'django-serializer':'var(--amber)',
    'flask-view':'var(--green)', 'react-class':'var(--cyan)', 'react-functional':'var(--cyan)',
    'web-component':'var(--cyan)', 'interface':'var(--text-dim)', 'sql-view':'var(--green)',
  };
  if (cls.widgetType && typeColors[cls.widgetType]) return typeColors[cls.widgetType];
  const langColors = { dart:'var(--text-dim)', python:'#f59e0b', c:'#60a5fa', javascript:'#fbbf24', sql:'#4ade80', css:'#a78bfa', html:'#f87171' };
  return langColors[cls.lang] || 'var(--text-dim)';
}

function renderClassSidebar() {
  const container = document.getElementById('class-sidebar-content');
  if (!container) return;
  const classes = APP.parsed.classes;
  const enums = APP.parsed.enums;

  if (classViewLevel === 'file') {
    const byFile = {};
    for (const cls of classes) {
      if (!byFile[cls.file]) byFile[cls.file] = [];
      byFile[cls.file].push(cls);
    }
    let html = '';
    for (const [file, clsList] of Object.entries(byFile)) {
      const shortFile = file.split('/').pop();
      const icon = getFileIcon(file);
      html += `<div class="hierarchy-group" data-name="${shortFile.toLowerCase()}">
        <div class="hierarchy-file-header" onclick="toggleHierarchy(this)">
          <span class="hierarchy-arrow">▸</span>
          <span class="file-icon">${icon}</span>
          <span style="font-weight:600;color:var(--text-bright)">${shortFile}</span>
          <span style="margin-left:auto;font-size:9px;color:var(--text-dim)">${clsList.length}c</span>
        </div>
        <div class="hierarchy-children collapsed">`;
      for (const cls of clsList) {
        const color = getTypeColor(cls);
        html += `<div class="hierarchy-class-row" data-name="${cls.name.toLowerCase()}">
          <div class="hierarchy-class-header" onclick="toggleHierarchy(this); showClassDetail(findClassByName('${cls.name}'), event)">
            <span class="hierarchy-arrow">▸</span>
            <div class="item-dot" style="background:${color}"></div>
            <span style="font-weight:600;color:${color}">${cls.name}</span>
            <span style="margin-left:auto;font-size:9px;color:var(--text-dim)">${cls.methods.length}m</span>
          </div>
          <div class="hierarchy-children collapsed">
            ${cls.methods.map(m => `
              <div class="hierarchy-method-item" onclick="showClassDetail(findClassByName('${cls.name}'), event); setTimeout(()=>scrollToMethod('${m}'),100)">
                <span style="color:var(--cyan);font-size:10px">⨍</span>
                <span style="color:var(--text)">${m}()</span>
              </div>
            `).join('')}
            ${cls.methods.length === 0 ? '<div style="padding:4px 8px 4px 28px;font-size:9px;color:var(--text-dim)">No methods</div>' : ''}
          </div>
        </div>`;
      }
      html += `</div></div>`;
    }
    container.innerHTML = html;

  } else if (classViewLevel === 'class') {
    let html = '';
    const widgets = APP.parsed.widgets;
    if (widgets.length > 0) {
      html += `<div class="tree-header">UI COMPONENTS (${widgets.length})</div><div id="class-widgets-inner"></div>`;
    }
    html += `<div class="tree-header" style="margin-top:12px">ALL CLASSES (${classes.length})</div><div id="class-list-inner"></div>`;
    if (enums.length > 0) {
      html += `<div class="tree-header" style="margin-top:12px">ENUMS (${enums.length})</div><div id="enum-list-inner"></div>`;
    }
    container.innerHTML = html;

    const wc = document.getElementById('class-widgets-inner');
    if (wc) for (const cls of widgets) wc.appendChild(createClassCard(cls, getTypeColor(cls)));
    const lc = document.getElementById('class-list-inner');
    if (lc) for (const cls of classes.filter(c => !APP.parsed.widgets.includes(c))) lc.appendChild(createClassCard(cls, getTypeColor(cls)));
    const ec = document.getElementById('enum-list-inner');
    if (ec) for (const en of enums) {
      const card = document.createElement('div');
      card.className = 'class-card'; card.dataset.name = en.name.toLowerCase();
      card.innerHTML = `<div class="class-name">${en.name}</div><div class="class-type" style="color:var(--amber)">ENUM · ${en.values.length} values</div>`;
      card.onclick = () => showEnumDetail(en);
      ec.appendChild(card);
    }

  } else if (classViewLevel === 'function') {
    let html = '';
    const byFile = {};
    for (const cls of classes) {
      if (cls.methods.length === 0) continue;
      if (!byFile[cls.file]) byFile[cls.file] = [];
      byFile[cls.file].push(cls);
    }
    for (const [file, clsList] of Object.entries(byFile)) {
      const shortFile = file.split('/').pop();
      const icon = getFileIcon(file);
      html += `<div class="hierarchy-group" data-name="${shortFile.toLowerCase()}">
        <div class="hierarchy-file-header" onclick="toggleHierarchy(this)">
          <span class="hierarchy-arrow open">▸</span>
          <span class="file-icon">${icon}</span>
          <span style="font-weight:600;color:var(--text-bright)">${shortFile}</span>
        </div>
        <div class="hierarchy-children">`;
      for (const cls of clsList) {
        const color = getTypeColor(cls);
        html += `<div class="hierarchy-class-row" data-name="${cls.name.toLowerCase()}">
          <div style="padding:2px 8px 2px 16px;font-size:9px;font-weight:700;letter-spacing:1px;color:${color};font-family:var(--font-mono)">${cls.name}</div>`;
        for (const m of cls.methods) {
          html += `<div class="hierarchy-method-item" onclick="showClassDetail(findClassByName('${cls.name}'), event); setTimeout(()=>scrollToMethod('${m}'),100)">
            <span style="color:var(--cyan);font-size:10px">⨍</span>
            <span style="color:var(--text)">${m}()</span>
          </div>`;
        }
        html += `</div>`;
      }
      html += `</div></div>`;
    }
    container.innerHTML = html;
  }
}

function toggleHierarchy(header) {
  const children = header.nextElementSibling;
  if (!children || !children.classList.contains('hierarchy-children')) {
    const parent = header.parentElement;
    const ch = parent.querySelector('.hierarchy-children');
    if (ch) ch.classList.toggle('collapsed');
  } else {
    children.classList.toggle('collapsed');
  }
  const arrow = header.querySelector('.hierarchy-arrow');
  if (arrow) arrow.classList.toggle('open');
}

function findClassByName(name) {
  return APP.parsed.classes.find(c => c.name === name);
}

function scrollToMethod(methodName) {
  const cards = document.querySelectorAll('.class-method-card');
  for (const card of cards) {
    const nameEl = card.querySelector('.class-method-name');
    if (nameEl && nameEl.textContent.includes(methodName)) {
      const body = card.querySelector('.class-method-body');
      const arrow = card.querySelector('.class-method-arrow');
      if (body && !body.classList.contains('open')) {
        body.classList.add('open');
        if (arrow) arrow.classList.add('open');
      }
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      card.style.boxShadow = '0 0 0 2px var(--cyan)';
      setTimeout(() => card.style.boxShadow = '', 2000);
      return;
    }
  }
}

function createClassCard(cls, color) {
  const card = document.createElement('div');
  card.className = 'class-card'; card.dataset.name = cls.name.toLowerCase();
  const typeLabel = getClassTypeLabel(cls);
  const langBadge = cls.lang && cls.lang !== 'dart' ? ` <span style="opacity:0.4;font-size:8px">${cls.lang.toUpperCase()}</span>` : '';
  card.innerHTML = `<div class="class-name">${cls.name}</div>
    <div class="class-type" style="color:${color}">${typeLabel}${cls.superclass?` → ${cls.superclass}`:''}${langBadge}</div>
    <div class="class-info">${cls.fields.length} fields · ${cls.methods.length} methods</div>`;
  card.onclick = (e) => showClassDetail(cls, e);
  return card;
}

function filterClasses(q) {
  q = q.toLowerCase();
  document.querySelectorAll('.class-card').forEach(c => {
    c.style.display = !q || (c.dataset.name&&c.dataset.name.includes(q)) ? '' : 'none';
  });
  document.querySelectorAll('.hierarchy-group').forEach(g => {
    const items = g.querySelectorAll('.hierarchy-class-row, .hierarchy-method-item');
    let hasMatch = false;
    items.forEach(item => {
      const name = item.dataset?.name || item.textContent.toLowerCase();
      const match = !q || name.includes(q);
      if (match) hasMatch = true;
    });
    g.style.display = hasMatch || !q ? '' : 'none';
  });
}

function showClassDetail(cls, e) {
  if (!cls) return;
  selectedClass = cls;
  document.querySelectorAll('.class-card').forEach(c=>c.classList.remove('active'));
  e?.target?.closest('.class-card')?.classList.add('active');
  const detail = document.getElementById('class-detail');
  const color = getTypeColor(cls);
  const typeLabel = getClassTypeLabel(cls);

  const classImports = APP.parsed.classImports;
  const outgoing = classImports.filter(e => e.fromClass === cls.name);
  const incoming = classImports.filter(e => e.toClass === cls.name);

  const fileContent = APP.files[cls.file]?.content || '';
  const methodSnippets = extractMethodSnippets(cls, fileContent);

  detail.innerHTML = `
    <div class="class-detail-top">
      <div class="class-detail-title" style="color:${color}">${cls.name}</div>
      <div class="class-detail-path" style="cursor:pointer" onclick="navigateToFile('${cls.file}',${cls.line})">${cls.file} : line ${cls.line} ↗</div>
      <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:8px">
        <span style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);background:${color}15;color:${color}">${typeLabel}</span>
        ${cls.lang ? `<span style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);background:var(--bg-input);color:var(--text-dim)">${cls.lang.toUpperCase()}</span>` : ''}
        ${cls.superclass?`<span style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);background:var(--purple-glow);color:var(--purple)">extends ${cls.superclass}</span>`:''}
        ${cls.mixins.map(m=>`<span style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);background:var(--cyan-glow);color:var(--cyan)">with ${m}</span>`).join('')}
        ${cls.implements.map(m=>`<span style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);background:var(--amber-glow);color:var(--amber)">impl ${m}</span>`).join('')}
      </div>
      <div style="display:flex;gap:16px;font-size:10px;font-family:var(--font-mono)">
        <span style="color:var(--import-color)">→ ${outgoing.length} deps</span>
        <span style="color:var(--export-color)">← ${incoming.length} used by</span>
        <span style="color:var(--text-dim)">${cls.fields.length} fields</span>
        <span style="color:var(--text-dim)">${cls.methods.length} methods</span>
      </div>
      <div style="margin-top:8px;display:flex;gap:6px">
        <button class="rt-btn nav-btn" onclick="navigateToFile('${cls.file}',${cls.line})">View Source ↗</button>
      </div>
    </div>
    <div class="class-detail-body">
      <div class="class-detail-body-inner">

        ${outgoing.length > 0 || incoming.length > 0 ? `
        <div class="members-section">
          <div class="members-title">DEPENDENCIES</div>
          ${outgoing.length > 0 ? `<div style="margin-bottom:8px">
            <div style="font-size:9px;color:var(--import-color);font-weight:700;letter-spacing:1px;margin-bottom:4px">IMPORTS (${outgoing.length})</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${outgoing.map(d => `<span class="class-method-dep-chip" onclick="scrollToClassByName('${d.toClass}')">${d.toClass}</span>`).join('')}
            </div>
          </div>` : ''}
          ${incoming.length > 0 ? `<div>
            <div style="font-size:9px;color:var(--export-color);font-weight:700;letter-spacing:1px;margin-bottom:4px">USED BY (${incoming.length})</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px">
              ${incoming.map(d => `<span class="class-method-dep-chip" style="background:var(--green-glow);color:var(--green)" onclick="scrollToClassByName('${d.fromClass}')">${d.fromClass}</span>`).join('')}
            </div>
          </div>` : ''}
        </div>` : ''}

        ${cls.fields.length > 0 ? `
        <div class="members-section">
          <div class="members-title">FIELDS (${cls.fields.length})</div>
          ${cls.fields.map(f => `
            <div class="member-row" onclick="highlightFieldInFile('${cls.file}','${f.name}')">
              <span class="member-badge" style="background:var(--green-glow);color:var(--green)">F</span>
              <span class="member-name">${f.name}</span>
              <span class="member-type">${f.type}</span>
            </div>`).join('')}
        </div>` : ''}

        <div class="members-section">
          <div class="members-title">METHODS (${cls.methods.length})</div>
          ${cls.methods.length === 0 ? '<div style="font-size:11px;color:var(--text-dim);padding:4px 0">No methods detected</div>' :
            cls.methods.map((m, idx) => {
              const snippet = methodSnippets[m];
              const deps = findMethodDeps(m, cls, fileContent);
              return `
              <div class="class-method-card">
                <div class="class-method-header" onclick="toggleMethodBody('method-body-${idx}','method-arrow-${idx}')">
                  <span class="class-method-arrow" id="method-arrow-${idx}">▸</span>
                  <span class="class-method-name">${m}()</span>
                  ${snippet ? `<span style="margin-left:auto;font-size:9px;color:var(--text-dim)">${snippet.lineCount} lines</span>` : ''}
                </div>
                <div class="class-method-body" id="method-body-${idx}">
                  ${snippet ? `<div class="class-method-snippet">
                    ${snippet.lines.map(l => `
                      <div class="source-line">
                        <span class="source-line-num">${l.num}</span>
                        <span class="source-line-text">${highlightCodeSafe(l.text, cls.file)}</span>
                      </div>`).join('')}
                  </div>` : '<div style="padding:8px 12px;font-size:10px;color:var(--text-dim)">Method body not extractable</div>'}
                  ${deps.length > 0 ? `<div class="class-method-deps">
                    <span style="font-size:9px;color:var(--text-dim);font-weight:700">REFS:</span>
                    ${deps.map(d => `<span class="class-method-dep-chip" onclick="scrollToClassByName('${d}')">${d}</span>`).join('')}
                  </div>` : ''}
                </div>
              </div>`;
            }).join('')}
        </div>
      </div>
    </div>`;
}

function showEnumDetail(en) {
  document.querySelectorAll('.class-card').forEach(c=>c.classList.remove('active'));
  document.getElementById('class-detail').innerHTML = `
    <div class="class-detail-top">
      <div class="class-detail-title" style="color:var(--amber)">${en.name}</div>
      <div class="class-detail-path">${en.file}</div>
    </div>
    <div class="class-detail-body">
      <div class="class-detail-body-inner">
        <div class="members-section"><div class="members-title">VALUES (${en.values.length})</div>
          ${en.values.map(v=>`<div class="member-row"><span class="member-badge" style="background:var(--amber-glow);color:var(--amber)">E</span><span class="member-name">${v}</span></div>`).join('')}
        </div>
      </div>
    </div>`;
}

/* ═══ Method Snippet Extraction (universal) ═══ */

function extractMethodSnippets(cls, content) {
  const snippets = {};
  const lines = content.split('\n');
  const lang = cls.lang || 'dart';

  if (lang === 'python') {
    // Python: find `def method_name(` at correct indentation
    const classLine = cls.line - 1;
    const classIndent = lines[classLine]?.search(/\S/) ?? 0;
    for (const method of cls.methods) {
      for (let i = classLine + 1; i < lines.length; i++) {
        const indent = lines[i].search(/\S/);
        if (indent <= classIndent && lines[i].trim() !== '' && !lines[i].trim().startsWith('#')) break;
        const defMatch = lines[i].match(new RegExp(`^\\s+def\\s+${method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*\\(`));
        if (defMatch) {
          // Find end of method (next def at same indent or class end)
          const methodIndent = indent;
          let endLine = i + 1;
          for (; endLine < lines.length; endLine++) {
            const li = lines[endLine];
            if (li.trim() === '' || li.trim().startsWith('#')) continue;
            const ei = li.search(/\S/);
            if (ei <= methodIndent) break;
          }
          const methodLines = lines.slice(i, endLine);
          snippets[method] = {
            lineCount: methodLines.length,
            lines: methodLines.map((text, j) => ({ num: i + j + 1, text, highlight: j === 0 })),
          };
          break;
        }
      }
    }
    return snippets;
  }

  // Brace-delimited languages (Dart, JS, C)
  const classSearchTerm = lang === 'c' ? `struct ${cls.name}` : `class ${cls.name}`;
  const classStartIdx = content.indexOf(classSearchTerm);
  if (classStartIdx === -1) return snippets;

  let braceCount = 0, inClass = false, classStart = -1, classEnd = -1;
  for (let i = classStartIdx; i < content.length; i++) {
    if (content[i] === '{') { braceCount++; if (!inClass) { inClass = true; classStart = i; } }
    if (content[i] === '}') { braceCount--; }
    if (inClass && braceCount === 0) { classEnd = i; break; }
  }
  if (classStart === -1 || classEnd === -1) return snippets;

  const classBody = content.substring(classStart, classEnd + 1);
  const classBodyStartLine = content.substring(0, classStart).split('\n').length;

  for (const method of cls.methods) {
    const escapedMethod = method.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const methodPattern = lang === 'javascript'
      ? new RegExp(`(?:async\\s+)?(?:static\\s+)?(?:get\\s+|set\\s+)?${escapedMethod}\\s*\\(`)
      : new RegExp(`(?:@\\w+\\s+)?(?:static\\s+)?(?:Future<[\\w?<>]*>\\s+|void\\s+|[\\w<>?]+\\s+)${escapedMethod}\\s*\\(`);
    const match = methodPattern.exec(classBody);
    if (!match) continue;

    const methodStartInBody = match.index;
    let mBrace = 0, inMethod = false, methodBodyStart = -1, methodBodyEnd = -1;
    for (let i = methodStartInBody; i < classBody.length; i++) {
      if (classBody[i] === '{') { mBrace++; if (!inMethod) { inMethod = true; methodBodyStart = i; } }
      if (classBody[i] === '}') { mBrace--; }
      if (inMethod && mBrace === 0) { methodBodyEnd = i; break; }
    }
    if (methodBodyStart === -1 || methodBodyEnd === -1) continue;

    const beforeMethod = classBody.substring(0, methodStartInBody);
    const methodLineInBody = beforeMethod.split('\n').length - 1;
    const startLine = classBodyStartLine + methodLineInBody;
    const methodText = classBody.substring(methodStartInBody, methodBodyEnd + 1);
    const methodLines = methodText.split('\n');

    snippets[method] = {
      lineCount: methodLines.length,
      lines: methodLines.map((text, i) => ({ num: startLine + i, text, highlight: i === 0 })),
    };
  }
  return snippets;
}

function findMethodDeps(methodName, cls, content) {
  const deps = [];
  const lang = cls.lang || 'dart';

  if (lang === 'python') {
    const lines = content.split('\n');
    const classLine = cls.line - 1;
    const classIndent = lines[classLine]?.search(/\S/) ?? 0;
    let inMethod = false, methodIndent = -1, methodBody = '';
    for (let i = classLine + 1; i < lines.length; i++) {
      const indent = lines[i].search(/\S/);
      if (indent <= classIndent && lines[i].trim() !== '' && !lines[i].trim().startsWith('#')) break;
      if (!inMethod) {
        if (lines[i].includes(`def ${methodName}(`)) {
          inMethod = true;
          methodIndent = indent;
          methodBody += lines[i] + '\n';
        }
      } else {
        if (lines[i].trim() === '' || lines[i].trim().startsWith('#')) { methodBody += lines[i] + '\n'; continue; }
        if (lines[i].search(/\S/) <= methodIndent) break;
        methodBody += lines[i] + '\n';
      }
    }
    for (const otherCls of APP.parsed.classes) {
      if (otherCls.name === cls.name && otherCls.file === cls.file) continue;
      if (new RegExp(`\\b${otherCls.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(methodBody)) deps.push(otherCls.name);
    }
    return deps;
  }

  // Brace-delimited
  const searchTerm = lang === 'c' ? `struct ${cls.name}` : `class ${cls.name}`;
  const classStartIdx = content.indexOf(searchTerm);
  if (classStartIdx === -1) return deps;

  let braceCount = 0, inClass = false, classBody = '';
  for (let i = classStartIdx; i < content.length; i++) {
    if (content[i] === '{') { braceCount++; inClass = true; }
    if (content[i] === '}') braceCount--;
    if (inClass) classBody += content[i];
    if (inClass && braceCount === 0) break;
  }

  const methodIdx = classBody.indexOf(methodName + '(');
  if (methodIdx === -1) return deps;

  let mBrace = 0, inMethod = false, methodBody = '';
  for (let i = methodIdx; i < classBody.length; i++) {
    if (classBody[i] === '{') { mBrace++; inMethod = true; }
    if (classBody[i] === '}') mBrace--;
    if (inMethod) methodBody += classBody[i];
    if (inMethod && mBrace === 0) break;
  }

  for (const otherCls of APP.parsed.classes) {
    if (otherCls.name === cls.name && otherCls.file === cls.file) continue;
    const searchName = otherCls.name.replace(/^\./, '');
    if (searchName.length < 2) continue;
    if (new RegExp(`\\b${searchName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(methodBody)) deps.push(otherCls.name);
  }
  return deps;
}

/* ═══ Interaction Helpers ═══ */

function toggleMethodBody(bodyId, arrowId) {
  const body = document.getElementById(bodyId);
  const arrow = document.getElementById(arrowId);
  if (!body) return;
  const isOpen = body.classList.toggle('open');
  if (arrow) arrow.classList.toggle('open', isOpen);
}

function scrollToClassByName(name) {
  const cls = APP.parsed.classes.find(c => c.name === name);
  if (!cls) return;
  const cards = document.querySelectorAll('.class-card');
  for (const card of cards) {
    if (card.dataset.name === name.toLowerCase()) {
      card.click();
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
  }
  showClassDetail(cls, null);
}

function highlightFieldInFile(filePath, fieldName) {
  const content = APP.files[filePath]?.content;
  if (!content) return;
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes(fieldName)) { navigateToFile(filePath, i + 1); return; }
  }
  navigateToFile(filePath);
}
