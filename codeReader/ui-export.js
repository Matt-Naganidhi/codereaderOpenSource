/* ═══════════════════════════════════════════════════
   Code Architect — ui-export.js
   Export: file tree, API docs, graph data
   Each export type has a checkbox/settings toggle
   ═══════════════════════════════════════════════════ */

let exportModalOpen = false;

function openExportModal() {
  exportModalOpen = true;
  const existing = document.getElementById('export-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'export-modal';
  modal.className = 'export-modal-overlay';
  modal.innerHTML = `
    <div class="export-modal">
      <div class="export-modal-header">
        <span>⤓ Export Project</span>
        <div class="rt-close" onclick="closeExportModal()">✕</div>
      </div>
      <div class="export-modal-body">
        <div class="export-section">
          <label class="export-check">
            <input type="checkbox" id="exp-tree" checked> <span class="export-check-label">📁 File / Folder Structure</span>
          </label>
          <div class="export-opts" id="exp-tree-opts">
            <label class="export-opt"><input type="checkbox" id="exp-tree-sizes" checked> Include file sizes</label>
            <label class="export-opt"><input type="checkbox" id="exp-tree-lines" checked> Include line counts</label>
            <label class="export-opt"><input type="checkbox" id="exp-tree-depth"> Flat list (no tree)</label>
          </div>
        </div>

        <div class="export-section">
          <label class="export-check">
            <input type="checkbox" id="exp-api" checked> <span class="export-check-label">◆ API Documentation</span>
          </label>
          <div class="export-opts" id="exp-api-opts">
            <label class="export-opt"><input type="checkbox" id="exp-api-classes" checked> Classes & methods</label>
            <label class="export-opt"><input type="checkbox" id="exp-api-functions" checked> Top-level functions</label>
            <label class="export-opt"><input type="checkbox" id="exp-api-providers" checked> Providers / hooks / routes</label>
            <label class="export-opt"><input type="checkbox" id="exp-api-imports" checked> Import map</label>
            <label class="export-opt"><input type="checkbox" id="exp-api-fields"> Fields & signatures</label>
          </div>
        </div>

        <div class="export-section">
          <label class="export-check">
            <input type="checkbox" id="exp-graph"> <span class="export-check-label">◎ Dependency Graph</span>
          </label>
          <div class="export-opts" id="exp-graph-opts">
            <label class="export-opt"><input type="checkbox" id="exp-graph-file" checked> File-level edges</label>
            <label class="export-opt"><input type="checkbox" id="exp-graph-class" checked> Class-level edges</label>
            <label class="export-opt"><input type="checkbox" id="exp-graph-mermaid"> Mermaid diagram format</label>
          </div>
        </div>

        <div class="export-section">
          <label class="export-check">
            <input type="checkbox" id="exp-changes"> <span class="export-check-label">Δ Changed Files (patch)</span>
          </label>
          <div class="export-opts">
            <label class="export-opt" style="color:var(--text-dim)">Unified diff of every file edited in this session</label>
          </div>
        </div>

        <div class="export-section">
          <label class="export-check">
            <input type="checkbox" id="exp-summary" checked> <span class="export-check-label">📋 Project Summary</span>
          </label>
          <div class="export-opts">
            <label class="export-opt"><input type="checkbox" id="exp-summary-stats" checked> Stats (files, lines, classes)</label>
            <label class="export-opt"><input type="checkbox" id="exp-summary-tech" checked> Tech stack / dependencies</label>
          </div>
        </div>
      </div>
      <div class="export-modal-footer">
        <select id="exp-format" class="export-format-select">
          <option value="txt">Plain Text (.txt)</option>
          <option value="md">Markdown (.md)</option>
          <option value="json">JSON (.json)</option>
        </select>
        <button class="btn-primary" onclick="runExport()" style="padding:8px 20px;font-size:12px">Export ⤓</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeExportModal(); });
}

function closeExportModal() {
  exportModalOpen = false;
  const modal = document.getElementById('export-modal');
  if (modal) modal.remove();
}

function runExport() {
  const format = document.getElementById('exp-format').value;
  const sections = [];

  // Summary
  if (ck('exp-summary')) sections.push(buildExportSummary(format));
  // Tree
  if (ck('exp-tree')) sections.push(buildExportTree(format));
  // API
  if (ck('exp-api')) sections.push(buildExportAPI(format));
  // Graph
  if (ck('exp-graph')) sections.push(buildExportGraph(format));
  // Changed files patch
  if (ck('exp-changes')) sections.push(buildExportChanges(format));

  let output;
  if (format === 'json') {
    const jsonObj = {};
    sections.forEach(s => Object.assign(jsonObj, s.json || {}));
    output = JSON.stringify(jsonObj, null, 2);
  } else {
    output = sections.map(s => s.text).join('\n\n');
  }

  downloadExport(output, format);
  closeExportModal();
}

function ck(id) { return document.getElementById(id)?.checked; }

/* ═══ CHANGED FILES → unified-diff-style patch ═══ */

function buildExportChanges(format) {
  const modified = getModifiedFiles();
  let text = format === 'md' ? '## Changed Files\n\n' : '=== CHANGED FILES ===\n\n';
  const json = { changes: {} };
  if (modified.length === 0) {
    text += '(no files modified this session)\n';
    return { text, json };
  }
  for (const path of modified) {
    const f = APP.files[path];
    const ops = computeLineDiff(f.original ?? '', f.content);
    const adds = ops.filter(o => o.type === 'add').length;
    const dels = ops.filter(o => o.type === 'del').length;
    let patch = `--- a/${path}\n+++ b/${path}\n`;
    // Emit hunks: contiguous non-same runs with 2 lines of context
    let i = 0;
    while (i < ops.length) {
      if (ops[i].type === 'same') { i++; continue; }
      let start = i;
      while (start > 0 && ops[start - 1].type === 'same' && i - start < 2) start--;
      let end = i;
      let sameRun = 0;
      while (end < ops.length && sameRun < 3) {
        if (ops[end].type === 'same') sameRun++; else sameRun = 0;
        end++;
      }
      const aStart = ops[start].aLine || ops[start].bLine || 1;
      const bStart = ops[start].bLine || ops[start].aLine || 1;
      patch += `@@ -${aStart} +${bStart} @@\n`;
      for (let k = start; k < end; k++) {
        const o = ops[k];
        patch += (o.type === 'add' ? '+' : o.type === 'del' ? '-' : ' ') + o.text + '\n';
      }
      i = end;
    }
    text += (format === 'md' ? `### ${path} (+${adds} −${dels})\n\n\`\`\`diff\n${patch}\`\`\`\n\n` : `${path} (+${adds} -${dels})\n${patch}\n`);
    json.changes[path] = { additions: adds, deletions: dels, patch };
  }
  return { text, json };
}

/* ═══ EXPORT BUILDERS ═══ */

function buildExportSummary(format) {
  const p = APP.parsed;
  const codeExts = new Set(getCodeExtensions());
  const codeFiles = Object.keys(APP.files).filter(f => codeExts.has(f.split('.').pop().toLowerCase()));
  const totalLines = codeFiles.reduce((s, f) => s + APP.files[f].content.split('\n').length, 0);
  const tech = detectTech();

  const stats = {
    project: p.projectName,
    type: p.projectType,
    tech,
    totalFiles: Object.keys(APP.files).length,
    codeFiles: codeFiles.length,
    totalLines,
    classes: p.classes.length,
    functions: p.functions.length,
    imports: p.imports.length,
  };

  if (format === 'json') return { json: { summary: stats } };

  const md = format === 'md';
  let text = md ? '# Project Summary\n\n' : '=== PROJECT SUMMARY ===\n\n';
  text += `Project: ${stats.project}\n`;
  text += `Type: ${stats.type}\n`;
  text += `Tech: ${stats.tech}\n`;
  text += `Files: ${stats.codeFiles} code / ${stats.totalFiles} total\n`;
  text += `Lines: ${stats.totalLines.toLocaleString()}\n`;
  text += `Classes: ${stats.classes} | Functions: ${stats.functions} | Imports: ${stats.imports}\n`;

  if (ck('exp-summary-tech')) {
    const deps = Object.keys(p.packages.deps);
    const devDeps = Object.keys(p.packages.devDeps);
    if (deps.length > 0) text += `\nDependencies: ${deps.join(', ')}\n`;
    if (devDeps.length > 0) text += `Dev Dependencies: ${devDeps.join(', ')}\n`;
  }

  return { text };
}

function buildExportTree(format) {
  const paths = Object.keys(APP.files).sort();
  const showSizes = ck('exp-tree-sizes');
  const showLines = ck('exp-tree-lines');
  const flat = ck('exp-tree-depth');

  if (format === 'json') {
    const tree = paths.map(p => {
      const entry = { path: p };
      if (showSizes) entry.size = APP.files[p].size;
      if (showLines) entry.lines = APP.files[p].content.split('\n').length;
      return entry;
    });
    return { json: { fileTree: tree } };
  }

  const md = format === 'md';
  let text = md ? '## File Structure\n\n```\n' : '=== FILE STRUCTURE ===\n\n';

  if (flat) {
    for (const p of paths) {
      let suffix = '';
      if (showLines) suffix += ` (${APP.files[p].content.split('\n').length} lines)`;
      if (showSizes) suffix += ` [${(APP.files[p].size/1024).toFixed(1)}KB]`;
      text += `${p}${suffix}\n`;
    }
  } else {
    // Tree format like `tree /f`
    const tree = {};
    for (const p of paths) {
      const parts = p.split('/');
      let node = tree;
      for (let i = 0; i < parts.length - 1; i++) {
        if (!node[parts[i]]) node[parts[i]] = {};
        node = node[parts[i]];
      }
      node['__file__' + parts[parts.length - 1]] = APP.files[p];
    }
    text += renderTreeText(tree, '', true, showSizes, showLines);
  }

  if (md) text += '```\n';
  return { text };
}

function renderTreeText(node, prefix, isRoot, showSizes, showLines) {
  let result = '';
  const entries = Object.keys(node).sort((a, b) => {
    const aIsFile = a.startsWith('__file__');
    const bIsFile = b.startsWith('__file__');
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return a.localeCompare(b);
  });

  for (let i = 0; i < entries.length; i++) {
    const key = entries[i];
    const isLast = i === entries.length - 1;
    const connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
    const childPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');

    if (key.startsWith('__file__')) {
      const name = key.replace('__file__', '');
      let suffix = '';
      if (showLines) suffix += ` (${node[key].content.split('\n').length}L)`;
      if (showSizes) suffix += ` [${(node[key].size/1024).toFixed(1)}K]`;
      result += `${prefix}${connector}${name}${suffix}\n`;
    } else {
      result += `${prefix}${connector}📁 ${key}/\n`;
      result += renderTreeText(node[key], childPrefix, false, showSizes, showLines);
    }
  }
  return result;
}

function buildExportAPI(format) {
  const p = APP.parsed;
  const sections = {};

  if (ck('exp-api-classes') && p.classes.length > 0) {
    sections.classes = p.classes.map(c => {
      const entry = { name: c.name, file: c.file, line: c.line, lang: c.lang };
      if (c.superclass) entry.extends = c.superclass;
      if (c.widgetType) entry.type = c.widgetType;
      if (c.methods.length > 0) entry.methods = c.methods;
      if (ck('exp-api-fields') && c.fields.length > 0) {
        entry.fields = c.fields.map(f => ({ name: f.name, type: f.type }));
      }
      return entry;
    });
  }

  if (ck('exp-api-functions') && p.functions.length > 0) {
    sections.functions = p.functions.map(f => ({
      name: f.name, file: f.file, line: f.line, params: f.params || [],
    }));
  }

  if (ck('exp-api-providers') && p.providers.length > 0) {
    sections.providers = p.providers.map(pr => ({
      name: pr.name, type: pr.type, file: pr.file, line: pr.line,
    }));
  }

  if (ck('exp-api-imports') && p.imports.length > 0) {
    sections.imports = p.imports.map(i => ({ from: i.from, to: i.to }));
  }

  if (format === 'json') return { json: { api: sections } };

  const md = format === 'md';
  let text = md ? '## API Documentation\n\n' : '=== API DOCUMENTATION ===\n\n';

  if (sections.classes) {
    text += md ? '### Classes\n\n' : '--- Classes ---\n\n';
    for (const c of sections.classes) {
      text += md ? `**${c.name}**` : c.name;
      if (c.extends) text += ` extends ${c.extends}`;
      if (c.type) text += ` [${c.type}]`;
      text += `  (${c.file}:${c.line})\n`;
      if (c.methods && c.methods.length > 0) {
        text += `  methods: ${c.methods.join(', ')}\n`;
      }
      if (c.fields && c.fields.length > 0) {
        text += `  fields: ${c.fields.map(f => `${f.type} ${f.name}`).join(', ')}\n`;
      }
      text += '\n';
    }
  }

  if (sections.functions) {
    text += md ? '### Functions\n\n' : '--- Functions ---\n\n';
    for (const f of sections.functions) {
      text += `${f.name}(${(f.params||[]).join(', ')})  (${f.file}:${f.line})\n`;
    }
    text += '\n';
  }

  if (sections.providers) {
    text += md ? '### Providers / Hooks / Routes\n\n' : '--- Providers / Hooks / Routes ---\n\n';
    for (const pr of sections.providers) {
      text += `${pr.name} [${pr.type}]  (${pr.file}:${pr.line})\n`;
    }
    text += '\n';
  }

  if (sections.imports) {
    text += md ? '### Import Map\n\n' : '--- Import Map ---\n\n';
    const byFile = {};
    for (const i of sections.imports) {
      if (!byFile[i.from]) byFile[i.from] = [];
      byFile[i.from].push(i.to);
    }
    for (const [from, tos] of Object.entries(byFile)) {
      text += `${from} → ${tos.join(', ')}\n`;
    }
    text += '\n';
  }

  return { text };
}

function buildExportGraph(format) {
  const p = APP.parsed;
  const useMermaid = ck('exp-graph-mermaid');
  const result = {};

  if (ck('exp-graph-file') && p.imports.length > 0) {
    if (useMermaid) {
      let mermaid = 'graph LR\n';
      for (const imp of p.imports) {
        const fromId = imp.from.replace(/[^a-zA-Z0-9]/g, '_');
        const toId = imp.to.replace(/[^a-zA-Z0-9]/g, '_');
        const fromLabel = imp.from.split('/').pop();
        const toLabel = imp.to.split('/').pop();
        mermaid += `  ${fromId}["${fromLabel}"] --> ${toId}["${toLabel}"]\n`;
      }
      result.fileGraph = mermaid;
    } else {
      result.fileEdges = p.imports.map(i => ({ from: i.from, to: i.to }));
    }
  }

  if (ck('exp-graph-class') && p.classImports && p.classImports.length > 0) {
    if (useMermaid) {
      let mermaid = 'graph LR\n';
      for (const ci of p.classImports) {
        mermaid += `  ${ci.fromClass} --> ${ci.toClass}\n`;
      }
      result.classGraph = mermaid;
    } else {
      result.classEdges = p.classImports.map(ci => ({ from: ci.fromClass, to: ci.toClass }));
    }
  }

  if (format === 'json') return { json: { graph: result } };

  const md = format === 'md';
  let text = md ? '## Dependency Graph\n\n' : '=== DEPENDENCY GRAPH ===\n\n';

  if (result.fileGraph) {
    text += md ? '### File Dependencies (Mermaid)\n\n```mermaid\n' + result.fileGraph + '```\n\n' : result.fileGraph + '\n';
  } else if (result.fileEdges) {
    text += md ? '### File Dependencies\n\n' : '--- File Dependencies ---\n\n';
    for (const e of result.fileEdges) text += `${e.from} → ${e.to}\n`;
    text += '\n';
  }

  if (result.classGraph) {
    text += md ? '### Class Dependencies (Mermaid)\n\n```mermaid\n' + result.classGraph + '```\n\n' : result.classGraph + '\n';
  } else if (result.classEdges) {
    text += md ? '### Class Dependencies\n\n' : '--- Class Dependencies ---\n\n';
    for (const e of result.classEdges) text += `${e.from} → ${e.to}\n`;
    text += '\n';
  }

  return { text };
}

/* ═══ DOWNLOAD ═══ */

function downloadExport(content, format) {
  const name = APP.parsed.projectName || 'project';
  const ext = format === 'json' ? 'json' : format === 'md' ? 'md' : 'txt';
  const mime = format === 'json' ? 'application/json' : 'text/plain';
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name}-export.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
}
