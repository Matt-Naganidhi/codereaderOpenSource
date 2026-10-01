/* ═══════════════════════════════════════════════════
   Code Architect — ui-dashboard.js
   Universal dashboard panel rendering
   ═══════════════════════════════════════════════════ */

function renderDashboard() {
  const p = APP.parsed;
  const codeExts = new Set(getCodeExtensions());
  const codeFiles = Object.keys(APP.files).filter(f => codeExts.has(f.split('.').pop().toLowerCase()));
  const totalLines = codeFiles.reduce((sum, f) => sum + APP.files[f].content.split('\n').length, 0);
  const totalSize = Object.values(APP.files).reduce((s, f) => s + f.size, 0);
  const depCount = Object.keys(p.packages.deps).length;
  const devDepCount = Object.keys(p.packages.devDeps).length;
  const funcCount = p.functions ? p.functions.length : 0;

  // Language breakdown
  const langCounts = {};
  for (const f of codeFiles) {
    const lang = detectLanguage(f);
    langCounts[lang] = (langCounts[lang] || 0) + 1;
  }
  const langSorted = Object.entries(langCounts).sort((a, b) => b[1] - a[1]);

  const langColors = {
    dart: '#22d3ee', python: '#f59e0b', c: '#60a5fa', javascript: '#fbbf24',
    html: '#f87171', css: '#a78bfa', sql: '#4ade80', json: '#94a3b8',
    yaml: '#f472b6', markdown: '#d4dae8', text: '#586882', toml: '#94a3b8',
  };

  const langIcons = {
    dart: '🎯', python: '🐍', c: '⚙️', javascript: '📜',
    html: '🌐', css: '🎨', sql: '🗄️', json: '📄',
    yaml: '📋', markdown: '📝', text: '📄', toml: '📋',
  };

  const projectTypeLabel = {
    dart: 'Flutter / Dart', python: 'Python', javascript: 'JavaScript / TypeScript',
    c: 'C / C++', web: 'Web (HTML/CSS/JS)', sql: 'SQL', mixed: 'Multi-Language', unknown: 'Project',
  };

  document.getElementById('panel-dashboard').innerHTML = `<div class="dash">
    <div class="dash-grid">
      <div class="stat-card"><div class="stat-label">CODE FILES</div><div class="stat-value" style="color:var(--cyan)">${codeFiles.length}</div><div class="stat-sub">${Object.keys(APP.files).length} total files · ${langSorted.length} languages</div></div>
      <div class="stat-card"><div class="stat-label">LINES OF CODE</div><div class="stat-value" style="color:var(--green)">${totalLines.toLocaleString()}</div><div class="stat-sub">${(totalSize/1024).toFixed(1)} KB total</div></div>
      <div class="stat-card"><div class="stat-label">CLASSES / STRUCTS</div><div class="stat-value" style="color:var(--purple)">${p.classes.length}</div><div class="stat-sub">${p.widgets.length} UI components · ${p.enums.length} enums</div></div>
      <div class="stat-card"><div class="stat-label">FUNCTIONS</div><div class="stat-value" style="color:var(--amber)">${funcCount}</div><div class="stat-sub">${p.imports.length} import edges</div></div>
      <div class="stat-card"><div class="stat-label">DEPENDENCIES</div><div class="stat-value" style="color:var(--pink)">${depCount}</div><div class="stat-sub">${devDepCount} dev deps</div></div>
      <div class="stat-card"><div class="stat-label">PROJECT TYPE</div><div class="stat-value" style="color:var(--text-bright);font-size:16px">${projectTypeLabel[p.projectType] || 'Project'}</div><div class="stat-sub">${p.projectName}${p.dartVersion ? ' · ' + p.dartVersion : ''}</div></div>
    </div>

    ${langSorted.length > 0 ? `<div class="dash-section-title">LANGUAGE BREAKDOWN</div>
    <div style="display:flex;gap:4px;margin-bottom:16px;height:8px;border-radius:4px;overflow:hidden">
      ${langSorted.map(([lang, count]) => {
        const pct = (count / codeFiles.length * 100).toFixed(1);
        return `<div style="flex:${count};background:${langColors[lang] || '#586882'};min-width:3px" title="${lang}: ${count} files (${pct}%)"></div>`;
      }).join('')}
    </div>
    <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px">
      ${langSorted.map(([lang, count]) => {
        const pct = (count / codeFiles.length * 100).toFixed(1);
        const color = langColors[lang] || '#586882';
        const icon = langIcons[lang] || '📄';
        return `<div style="display:flex;align-items:center;gap:6px;padding:4px 10px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border)">
          <span>${icon}</span>
          <span style="font-size:11px;font-weight:600;color:${color}">${lang}</span>
          <span style="font-size:10px;color:var(--text-dim)">${count} files (${pct}%)</span>
        </div>`;
      }).join('')}
    </div>` : ''}

    ${depCount > 0 ? `<div class="dash-section-title">DEPENDENCIES</div><div class="dep-list">
      ${Object.keys(p.packages.flutterDeps || {}).map(d=>`<div class="dep-chip flutter">${d}</div>`).join('')}
      ${Object.entries(p.packages.deps).map(([k,v])=>`<div class="dep-chip pub">${k} <span style="opacity:0.4;margin-left:4px">${v}</span></div>`).join('')}
    </div>` : ''}
    ${devDepCount > 0 ? `<div class="dash-section-title">DEV DEPENDENCIES</div><div class="dep-list">
      ${Object.entries(p.packages.devDeps).map(([k])=>`<div class="dep-chip dev">${k}</div>`).join('')}
    </div>` : ''}
    <div class="dash-section-title">FILE BREAKDOWN</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:8px">
      ${getFileBreakdown(codeFiles).map(b=>`
        <div style="display:flex;align-items:center;gap:8px;padding:8px 12px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border)">
          <div style="width:32px;height:32px;border-radius:6px;background:${b.color}15;display:flex;align-items:center;justify-content:center;font-size:14px;color:${b.color}">${b.icon}</div>
          <div><div style="font-size:12px;font-weight:600;color:var(--text-bright)">${b.label}</div><div style="font-size:10px;color:var(--text-dim)">${b.count} files · ${b.lines.toLocaleString()} lines</div></div>
        </div>`).join('')}
    </div>
    ${renderCodeHealthHtml()}

    ${p.enums.length > 0 ? `<div class="dash-section-title">ENUMS</div><div class="dep-list">
      ${p.enums.map(e=>`<div class="dep-chip" style="color:var(--amber);border-color:rgba(251,191,36,0.2)">${e.name} <span style="opacity:0.4;margin-left:4px">(${e.values.length})</span></div>`).join('')}
    </div>` : ''}
    ${p.providers.length > 0 ? `<div class="dash-section-title">STATE / PROVIDERS / ROUTES</div><div class="dep-list">
      ${p.providers.slice(0, 40).map(pv => {
        const typeColors = { Signal: 'var(--purple)', Route: 'var(--green)', ExpressRoute: 'var(--green)', ReactComponent: 'var(--cyan)', DjangoModel: 'var(--red)', Trigger: 'var(--amber)', Macro: 'var(--text-dim)', Index: 'var(--text-dim)' };
        const c = typeColors[pv.type] || 'var(--purple)';
        return `<div class="dep-chip" style="color:${c};border-color:${c}30">${pv.name} <span style="opacity:0.4;margin-left:4px">${pv.type}</span></div>`;
      }).join('')}
    </div>` : ''}
  </div>`;
}

/* ═══ CODE HEALTH — dead code + complexity outliers ═══ */

function renderCodeHealthHtml() {
  const dead = computeDeadCode();
  const metrics = computeMetrics();
  const navAttr = (file, line) => `onclick="navigateToFile('${file.replace(/'/g, "\\'")}', ${line || 1})" style="cursor:pointer"`;

  const topComplex = metrics.functions.filter(f => f.complexity >= 8).slice(0, 10);
  const topFiles = metrics.files.slice(0, 6);
  const deadTotal = dead.classes.length + dead.functions.length;

  return `
    <div class="dash-section-title">CODE HEALTH</div>
    <div class="dash-grid" style="margin-bottom:12px">
      <div class="stat-card"><div class="stat-label">POSSIBLY UNUSED</div>
        <div class="stat-value" style="color:${deadTotal ? 'var(--amber)' : 'var(--green)'}">${deadTotal}</div>
        <div class="stat-sub">${dead.classes.length} classes · ${dead.functions.length} functions</div></div>
      <div class="stat-card"><div class="stat-label">COMPLEX FUNCTIONS</div>
        <div class="stat-value" style="color:${topComplex.length ? 'var(--red)' : 'var(--green)'}">${topComplex.length}</div>
        <div class="stat-sub">cyclomatic complexity ≥ 8</div></div>
      <div class="stat-card"><div class="stat-label">TOTAL BRANCHES</div>
        <div class="stat-value" style="color:var(--cyan)">${metrics.totalComplexity.toLocaleString()}</div>
        <div class="stat-sub">if / loop / case / catch points</div></div>
    </div>
    ${deadTotal > 0 ? `
    <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">Not referenced anywhere outside their own file (entry points, tests &amp; reflective uses excluded heuristically — verify before deleting):</div>
    <div class="dep-list" style="margin-bottom:12px">
      ${dead.classes.slice(0, 25).map(c => `<div class="dep-chip" ${navAttr(c.file, c.line)} title="${c.file}" style="color:var(--amber);border-color:rgba(251,191,36,0.25)">◆ ${c.name}</div>`).join('')}
      ${dead.functions.slice(0, 25).map(f => `<div class="dep-chip" ${navAttr(f.file, f.line)} title="${f.file}" style="color:var(--text-dim)">⨍ ${f.name}</div>`).join('')}
    </div>` : ''}
    ${topComplex.length > 0 ? `
    <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">Highest-complexity functions (branches + nesting — refactor candidates):</div>
    <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:6px;margin-bottom:12px">
      ${topComplex.map(f => `<div ${navAttr(f.file, f.line)} style="display:flex;align-items:center;gap:8px;padding:6px 10px;border-radius:6px;background:var(--bg-card);border:1px solid var(--border)">
        <span style="font-family:var(--font-mono);font-size:11px;color:var(--red);font-weight:700;min-width:24px">${f.complexity}</span>
        <span style="font-size:11px;color:var(--text-bright);font-weight:600">${f.name}()</span>
        <span style="font-size:9px;color:var(--text-dim);margin-left:auto">${f.loc} loc · depth ${f.maxDepth}</span>
      </div>`).join('')}
    </div>` : ''}
    <div style="font-size:10px;color:var(--text-dim);margin-bottom:6px">Largest files:</div>
    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:4px">
      ${topFiles.map(f => `<div class="dep-chip" ${navAttr(f.path, 1)} title="${f.path}">${f.path.split('/').pop()} <span style="opacity:0.5;margin-left:4px">${f.loc.toLocaleString()} loc</span></div>`).join('')}
    </div>`;
}

function getFileBreakdown(codeFiles) {
  const cats = {
    models:{l:'Models/Entities',i:'◆',c:'var(--red)',files:[]},
    screens:{l:'Screens/Views',i:'◈',c:'var(--cyan)',files:[]},
    services:{l:'Services/APIs',i:'◎',c:'var(--green)',files:[]},
    state:{l:'State/Providers',i:'◉',c:'var(--purple)',files:[]},
    components:{l:'Components',i:'◇',c:'var(--amber)',files:[]},
    styles:{l:'Styles/Themes',i:'◐',c:'var(--pink)',files:[]},
    tests:{l:'Tests',i:'◑',c:'#94a3b8',files:[]},
    other:{l:'Other',i:'○',c:'var(--text-dim)',files:[]}
  };
  for (const f of codeFiles) {
    const fl = f.toLowerCase();
    if (fl.includes('test') || fl.includes('spec') || fl.includes('__test')) cats.tests.files.push(f);
    else if (fl.includes('model') || fl.includes('entity') || fl.includes('dto') || fl.includes('schema') || fl.endsWith('.sql')) cats.models.files.push(f);
    else if (fl.includes('screen') || fl.includes('page') || fl.includes('template') || (fl.includes('view') && !fl.includes('viewmodel'))) cats.screens.files.push(f);
    else if (fl.includes('service') || fl.includes('repository') || fl.includes('api') || fl.includes('client') || fl.includes('datasource') || fl.includes('route') || fl.includes('endpoint')) cats.services.files.push(f);
    else if (fl.includes('provider') || fl.includes('notifier') || fl.includes('bloc') || fl.includes('cubit') || fl.includes('controller') || fl.includes('store') || fl.includes('viewmodel') || fl.includes('reducer') || fl.includes('context') || fl.includes('state')) cats.state.files.push(f);
    else if (fl.includes('widget') || fl.includes('component') || fl.includes('button') || fl.includes('card') || fl.includes('tile') || fl.includes('dialog') || fl.endsWith('.jsx') || fl.endsWith('.tsx') || fl.endsWith('.vue') || fl.endsWith('.svelte')) cats.components.files.push(f);
    else if (fl.includes('theme') || fl.includes('style') || fl.includes('color') || fl.endsWith('.css') || fl.endsWith('.scss') || fl.endsWith('.sass') || fl.endsWith('.less')) cats.styles.files.push(f);
    else cats.other.files.push(f);
  }
  return Object.values(cats).filter(c=>c.files.length>0).map(c=>({
    label:c.l, icon:c.i, color:c.c, count:c.files.length,
    lines: c.files.reduce((s,f)=>s+APP.files[f].content.split('\n').length,0)
  }));
}
