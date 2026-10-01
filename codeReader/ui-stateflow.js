/* ═══════════════════════════════════════════════════
   Code Architect — ui-stateflow.js
   Interactive state flow: zoom in/out,
   arrow key navigation, syntax-highlighted snippets,
   universal GUI framework detection
   ═══════════════════════════════════════════════════ */

let sfSelectedNode = null;
let sfAllNodes = [];
let sfAllEdges = [];
let sfCanvas = null;
let sfNodeHitAreas = [];
let sfEdgeHitAreas = [];
let sfZoom = 1;
let sfPanX = 0;
let sfPanY = 0;
let sfSearchQuery = '';

function renderStateFlow() {
  const panel = document.getElementById('panel-state');
  const providers = APP.parsed.providers;
  const classes = APP.parsed.classes;
  const projectType = APP.parsed.projectType;

  // Detect state management items based on project type
  let stateItems = [];
  let widgetNodes = [];
  let serviceNodes = [];
  let layerLabels, emptyMsg;

  if (projectType === 'dart') {
    const notifiers = classes.filter(c => c.widgetType === 'notifier' || c.widgetType === 'bloc');
    stateItems = [
      ...providers.map(p => ({ name: p.name, type: p.type, kind: 'provider', file: p.file, line: p.line, methods: [] })),
      ...notifiers.map(n => ({ name: n.name, type: n.widgetType === 'bloc' ? 'Bloc' : 'Notifier', kind: 'notifier', file: n.file, line: n.line, methods: n.methods }))
    ];
    widgetNodes = APP.parsed.widgets.slice(0, 12).map(w => ({ name: w.name, file: w.file, line: w.line, kind: 'widget' }));
    layerLabels = ['UI LAYER (Widgets)', 'STATE LAYER (Providers / Notifiers)', 'DATA LAYER (Services)'];
    emptyMsg = 'Riverpod, Bloc, and Provider patterns are supported';

  } else if (projectType === 'python') {
    // PyQt/Tkinter: widgets are GUI classes; Django/Flask: views are the UI layer
    const guiWidgets = classes.filter(c => c.widgetType && (c.widgetType.startsWith('pyqt') || c.widgetType.startsWith('tkinter')));
    const djangoViews = classes.filter(c => c.widgetType === 'django-view');
    const djangoModels = classes.filter(c => c.widgetType === 'django-model');
    const djangoSerializers = classes.filter(c => c.widgetType === 'django-serializer');
    const flaskViews = classes.filter(c => c.widgetType === 'flask-view');
    const routes = providers.filter(p => p.type === 'Route');
    const signals = providers.filter(p => p.type === 'Signal');

    if (guiWidgets.length > 0) {
      // Desktop GUI app
      widgetNodes = guiWidgets.slice(0, 12).map(w => ({ name: w.name, file: w.file, line: w.line, kind: 'widget' }));
      stateItems = signals.map(s => ({ name: s.name, type: 'Signal', kind: 'signal', file: s.file, line: s.line, methods: [] }));
      layerLabels = ['UI LAYER (Windows / Widgets)', 'SIGNAL LAYER (pyqtSignal / Events)', 'DATA LAYER (Models / Services)'];
    } else if (djangoViews.length > 0 || routes.length > 0) {
      // Django/Flask web app
      widgetNodes = [...djangoViews, ...flaskViews].slice(0, 12).map(v => ({ name: v.name, file: v.file, line: v.line, kind: 'view' }));
      stateItems = [
        ...djangoSerializers.map(s => ({ name: s.name, type: 'Serializer', kind: 'serializer', file: s.file, line: s.line, methods: s.methods })),
        ...routes.map(r => ({ name: r.name, type: 'Route', kind: 'route', file: r.file, line: r.line, methods: [] })),
      ];
      layerLabels = ['VIEW LAYER (Views / Endpoints)', 'MIDDLEWARE (Serializers / Routes)', 'DATA LAYER (Models / Services)'];
    } else {
      widgetNodes = [];
      stateItems = providers.map(p => ({ name: p.name, type: p.type, kind: 'provider', file: p.file, line: p.line, methods: [] }));
      layerLabels = ['UI LAYER', 'STATE LAYER', 'DATA LAYER'];
    }
    emptyMsg = 'PyQt, Tkinter, Django, and Flask patterns are supported';

  } else if (projectType === 'javascript' || projectType === 'web') {
    // For web projects: group files by type (HTML, CSS, JS) into separate rows
    const allFiles = Object.keys(APP.files);
    const htmlFiles = allFiles.filter(f => ['html','htm','vue','svelte'].includes(f.split('.').pop().toLowerCase()));
    const cssFiles = allFiles.filter(f => ['css','scss','sass','less'].includes(f.split('.').pop().toLowerCase()));
    const jsFiles = allFiles.filter(f => ['js','jsx','ts','tsx','mjs','cjs'].includes(f.split('.').pop().toLowerCase()));

    const reactComponents = classes.filter(c => c.widgetType && c.widgetType.startsWith('react'));
    const reactFunctional = providers.filter(p => p.type === 'ReactComponent');
    const expressRoutes = providers.filter(p => p.type === 'ExpressRoute');
    const webComponents = classes.filter(c => c.widgetType === 'web-component');

    const allUIComponents = [
      ...reactComponents.map(c => ({ name: c.name, file: c.file, line: c.line, kind: 'component' })),
      ...reactFunctional.filter(rf => !reactComponents.find(rc => rc.name === rf.name))
        .map(rf => ({ name: rf.name, file: rf.file, line: rf.line, kind: 'component' })),
      ...webComponents.map(c => ({ name: c.name, file: c.file, line: c.line, kind: 'component' })),
    ];

    // If there are HTML+CSS+JS files, show them as file-based rows instead of class-based
    const hasMultiFileTypes = (htmlFiles.length > 0) + (cssFiles.length > 0) + (jsFiles.length > 0) >= 2;

    if (hasMultiFileTypes) {
      // File-based layer view similar to Dart's GUI/State/Data layers
      widgetNodes = htmlFiles.slice(0, 12).map(f => {
        const name = f.split('/').pop();
        return { name, file: f, line: 1, kind: 'markup' };
      });
      stateItems = cssFiles.slice(0, 12).map(f => {
        const name = f.split('/').pop();
        return { name, file: f, line: 1, kind: 'style', type: 'Stylesheet', methods: [] };
      });
      serviceNodes = jsFiles.slice(0, 12).map(f => {
        const name = f.split('/').pop();
        return { name, file: f, line: 1, kind: 'script' };
      });
      layerLabels = ['HTML / MARKUP LAYER', 'CSS / STYLE LAYER', 'JAVASCRIPT / LOGIC LAYER'];
      emptyMsg = 'HTML, CSS, and JavaScript files are grouped by type';
    } else {
      widgetNodes = allUIComponents.slice(0, 12);
      stateItems = expressRoutes.map(r => ({ name: r.name, type: 'Route', kind: 'route', file: r.file, line: r.line, methods: [] }));
      const hooks = providers.filter(p => p.type === 'Hook' || p.type === 'Context');
      stateItems.push(...hooks.map(h => ({ name: h.name, type: h.type, kind: 'hook', file: h.file, line: h.line, methods: [] })));
      layerLabels = ['UI LAYER (Components)', 'STATE / ROUTING LAYER', 'DATA LAYER (APIs / Services)'];
      emptyMsg = 'React, Vue, Express, and Web Component patterns are supported';
    }

  } else if (projectType === 'sql') {
    const tables = classes.filter(c => !c.widgetType || c.widgetType !== 'sql-view');
    const views = classes.filter(c => c.widgetType === 'sql-view');
    const triggers = providers.filter(p => p.type === 'Trigger');
    const indexes = providers.filter(p => p.type === 'Index');
    const procs = providers.filter(p => p.type === 'Procedure');

    widgetNodes = views.slice(0, 12).map(v => ({ name: v.name, file: v.file, line: v.line, kind: 'view' }));
    stateItems = [
      ...procs.map(p => ({ name: p.name, type: 'Procedure', kind: 'procedure', file: p.file, line: p.line, methods: [] })),
      ...triggers.map(t => ({ name: t.name, type: 'Trigger', kind: 'trigger', file: t.file, line: t.line, methods: [] })),
    ];
    layerLabels = ['VIEWS / QUERIES', 'PROCEDURES / TRIGGERS', 'TABLES / INDEXES'];
    emptyMsg = 'SQL tables, views, triggers, and stored procedures are detected';
    serviceNodes = tables.slice(0, 8).map(t => ({ name: t.name, file: t.file, line: t.line, kind: 'table' }));

  } else {
    stateItems = providers.map(p => ({ name: p.name, type: p.type, kind: 'provider', file: p.file, line: p.line, methods: [] }));
    widgetNodes = APP.parsed.widgets.slice(0, 12).map(w => ({ name: w.name, file: w.file, line: w.line, kind: 'widget' }));
    layerLabels = ['UI LAYER', 'STATE LAYER', 'DATA LAYER'];
    emptyMsg = 'State management patterns are detected automatically';
  }

  // Build service nodes (if not already set)
  if (!serviceNodes || serviceNodes.length === 0) {
    const serviceClasses = classes.filter(c =>
      c.file.toLowerCase().includes('service') || c.file.toLowerCase().includes('repository') ||
      c.file.toLowerCase().includes('api') || c.file.toLowerCase().includes('model') ||
      (projectType === 'python' && c.widgetType === 'django-model')
    ).slice(0, 8);
    serviceNodes = serviceClasses.map(s => ({ name: s.name, file: s.file, line: s.line, kind: 'service' }));
  }

  if (widgetNodes.length === 0 && stateItems.length === 0 && serviceNodes.length === 0) {
    panel.innerHTML = `<div class="diff-empty" style="height:100%"><div style="font-size:28px;opacity:0.3">◉</div>No state management detected<br><span style="font-size:11px;opacity:0.5">${emptyMsg}</span></div>`;
    return;
  }

  sfZoom = 1; sfPanX = 0; sfPanY = 0;

  panel.innerHTML = `
    <div class="stateflow-wrap">
      <div class="stateflow-toolbar">
        <span style="font-size:10px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);font-family:var(--font-mono)">STATE ARCHITECTURE</span>
        <div class="graph-toolbar-sep"></div>
        <div class="graph-selection-info" id="sf-selection-info">
          <span style="color:var(--text-dim)">Click a node to filter connections</span>
        </div>
        <div style="margin-left:auto;display:flex;gap:4px;align-items:center">
          <span style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">← ↑ ↓ → navigate</span>
        </div>
      </div>
      <div class="stateflow-main">
        <div class="stateflow-sidebar" id="sf-sidebar">
          <div class="search-bar" style="border-bottom:1px solid var(--border);margin:-12px -12px 8px;padding:8px 12px">
            <input class="search-input" placeholder="Filter nodes..." oninput="filterSfSidebar(this.value)">
          </div>
          ${widgetNodes.length > 0 ? `<div class="graph-selector-file-header">${layerLabels[0]}</div>
          ${widgetNodes.map(w => sfSidebarItemHtml(w, 'var(--cyan)')).join('')}` : ''}
          ${stateItems.length > 0 ? `<div class="graph-selector-file-header">${layerLabels[1]}</div>
          ${stateItems.map(s => sfSidebarItemHtml(s, 'var(--purple)')).join('')}` : ''}
          ${serviceNodes.length > 0 ? `<div class="graph-selector-file-header">${layerLabels[2]}</div>
          ${serviceNodes.map(s => sfSidebarItemHtml(s, 'var(--green)')).join('')}` : ''}
        </div>
        <div class="stateflow-content">
          <div class="stateflow-canvas-area" id="sf-canvas-area" tabindex="0" style="outline:none">
            <canvas id="state-canvas" style="display:block;width:100%;height:100%"></canvas>
            <div class="graph-controls" style="top:8px;right:8px">
              <button class="graph-ctrl-btn" onclick="sfZoomIn()" title="Zoom In">+</button>
              <button class="graph-ctrl-btn" onclick="sfZoomOut()" title="Zoom Out">−</button>
              <button class="graph-ctrl-btn" onclick="sfResetView()" title="Reset View">⟳</button>
            </div>
          </div>
          <div class="stateflow-detail" id="sf-detail">
            <div class="sf-detail-empty">Click a node to see import/export code snippets</div>
          </div>
        </div>
      </div>
    </div>`;

  RichTooltip.create('sf-canvas-area', 'sf-tooltip');
  setTimeout(() => drawStateFlowCanvas(widgetNodes, stateItems, serviceNodes, layerLabels), 50);
  setupSfKeyboardNav();
}

function sfSidebarItemHtml(item, color) {
  return `<div class="sf-sidebar-item" data-name="${item.name}" onclick="sfToggleSidebar('${item.name}')">
    <div class="item-dot" style="background:${color}"></div>
    ${item.name}
    <span class="item-count">${item.kind}</span>
  </div>`;
}

function filterSfSidebar(q) {
  sfSearchQuery = q.toLowerCase();
  document.querySelectorAll('.sf-sidebar-item').forEach(el => {
    const matches = !sfSearchQuery || el.dataset.name.toLowerCase().includes(sfSearchQuery);
    el.style.display = matches ? '' : 'none';
    el.classList.toggle('search-match', sfSearchQuery && matches);
  });
  redrawStateFlow();
}

function sfToggleSidebar(name) {
  if (sfSelectedNode === name) sfSelectedNode = null;
  else sfSelectedNode = name;
  document.querySelectorAll('.sf-sidebar-item').forEach(el =>
    el.classList.toggle('selected', el.dataset.name === sfSelectedNode)
  );
  updateSfSelectionInfo();
  redrawStateFlow();
  updateSfDetail();
}

function sfReset() {
  sfSelectedNode = null;
  sfSearchQuery = '';
  document.querySelectorAll('.sf-sidebar-item').forEach(el => { el.classList.remove('selected', 'search-match'); el.style.display = ''; });
  const searchInput = document.querySelector('#sf-sidebar .search-input');
  if (searchInput) searchInput.value = '';
  RichTooltip.dismiss('sf-tooltip');
  updateSfSelectionInfo();
  redrawStateFlow();
  updateSfDetail();
}

function sfResetView() { sfZoom = 1; sfPanX = 0; sfPanY = 0; sfReset(); }
function sfZoomIn() { sfZoom = Math.min(4, sfZoom * 1.25); redrawStateFlow(); }
function sfZoomOut() { sfZoom = Math.max(0.3, sfZoom * 0.8); redrawStateFlow(); }

function updateSfSelectionInfo() {
  const info = document.getElementById('sf-selection-info');
  if (!info) return;
  if (sfSelectedNode) {
    info.innerHTML = `Selected: <span style="color:var(--cyan);font-weight:700">${sfSelectedNode}</span>
      <button class="btn-clear-selection" onclick="sfReset()">Clear</button>`;
  } else {
    info.innerHTML = `<span style="color:var(--text-dim)">Click a node to filter connections</span>`;
  }
}

/* ═══ ARROW KEY NAVIGATION ═══ */

function setupSfKeyboardNav() {
  const area = document.getElementById('sf-canvas-area');
  if (!area) return;
  area.removeEventListener('keydown', handleSfKeydown);
  area.addEventListener('keydown', handleSfKeydown);
  area.addEventListener('mouseenter', () => area.focus());
}

function handleSfKeydown(e) {
  if (!sfAllNodes || sfAllNodes.length === 0) return;
  const key = e.key;
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) return;
  e.preventDefault();

  if (!sfSelectedNode) { sfToggleSidebar(sfAllNodes[0].name); return; }

  const current = sfAllNodes.find(n => n.name === sfSelectedNode);
  if (!current) return;

  let best = null, bestScore = Infinity;
  for (const n of sfAllNodes) {
    if (n.name === sfSelectedNode) continue;
    const dx = n.x - current.x, dy = n.y - current.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 1) continue;
    let match = false;
    if (key === 'ArrowRight' && dx > 10) match = true;
    if (key === 'ArrowLeft' && dx < -10) match = true;
    if (key === 'ArrowDown' && dy > 10) match = true;
    if (key === 'ArrowUp' && dy < -10) match = true;
    if (match) {
      let penalty = (key === 'ArrowRight' || key === 'ArrowLeft') ? Math.abs(dy) * 0.3 : Math.abs(dx) * 0.3;
      const score = dist + penalty;
      if (score < bestScore) { bestScore = score; best = n; }
    }
  }

  if (best) {
    sfToggleSidebar(best.name);
    const screenX = best.x * sfZoom + sfPanX;
    const screenY = best.y * sfZoom + sfPanY;
    const canvas = sfCanvas;
    if (canvas) {
      const W = canvas.width / 2, H = canvas.height / 2;
      const margin = 80;
      if (screenX < margin) sfPanX += (margin - screenX);
      if (screenX > W - margin) sfPanX -= (screenX - W + margin);
      if (screenY < margin) sfPanY += (margin - screenY);
      if (screenY > H - margin) sfPanY -= (screenY - H + margin);
      redrawStateFlow();
    }
  }
}

/* ═══ DRAW CANVAS ═══ */

function drawStateFlowCanvas(widgetNodes, stateItems, serviceNodes, layerLabels) {
  const canvas = document.getElementById('state-canvas');
  if (!canvas) return;
  sfCanvas = canvas;
  const wrap = canvas.parentElement;
  const W = wrap.clientWidth;
  const H = wrap.clientHeight || 400;

  const LAYER_Y = [60, Math.floor(H * 0.45), Math.floor(H * 0.8)];
  const layerItems = [widgetNodes, stateItems, serviceNodes];
  sfAllNodes = [];

  for (let layer = 0; layer < 3; layer++) {
    const items = layerItems[layer];
    const cols = Math.max(items.length, 1);
    const spacing = W / (cols + 1);
    items.forEach((item, i) => {
      sfAllNodes.push({ ...item, x: spacing * (i + 1), y: LAYER_Y[layer], layer });
    });
  }

  // Build edges by scanning actual code references
  sfAllEdges = [];
  const topNodes = sfAllNodes.filter(n => n.layer === 0);
  const midNodes = sfAllNodes.filter(n => n.layer === 1);
  const botNodes = sfAllNodes.filter(n => n.layer === 2);

  // Top → Mid: UI components referencing state/providers
  for (const wn of topNodes) {
    for (const sn of midNodes) {
      const wContent = APP.files[wn.file]?.content || '';
      if (wContent.includes(sn.name)) {
        sfAllEdges.push({ from: wn, to: sn, label: getEdgeLabel(wn, sn, 'watch'), type: 'watch' });
      }
    }
  }
  // Mid → Bot: State referencing services/data
  for (const sn of midNodes) {
    for (const sv of botNodes) {
      const sContent = APP.files[sn.file]?.content || '';
      if (sContent.includes(sv.name)) {
        sfAllEdges.push({ from: sn, to: sv, label: getEdgeLabel(sn, sv, 'call'), type: 'call' });
      }
    }
  }
  // Mid → Top: State notifying UI (reverse data flow)
  for (const sn of midNodes) {
    for (const wn of topNodes) {
      const wContent = APP.files[wn.file]?.content || '';
      if (wContent.includes(sn.name)) {
        sfAllEdges.push({ from: sn, to: wn, label: getEdgeLabel(sn, wn, 'notify'), type: 'notify' });
      }
    }
  }
  // Top → Bot: Direct data access (skipping middle layer)
  for (const wn of topNodes) {
    for (const sv of botNodes) {
      const wContent = APP.files[wn.file]?.content || '';
      if (wContent.includes(sv.name)) {
        sfAllEdges.push({ from: wn, to: sv, label: 'direct access', type: 'call' });
      }
    }
  }

  canvas.width = W * 2; canvas.height = H * 2;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';

  // Store layer labels for redraw
  sfCanvas._layerLabels = layerLabels || ['UI LAYER', 'STATE LAYER', 'DATA LAYER'];

  redrawStateFlow();
  setupSfCanvasEvents(canvas, W, H);
}

function getEdgeLabel(from, to, type) {
  const projectType = APP.parsed.projectType;
  if (projectType === 'dart') {
    if (type === 'watch') return 'ref.watch / ref.read';
    if (type === 'call') return 'calls / injects';
    return 'state → rebuild';
  }
  if (projectType === 'python') {
    if (type === 'watch') return 'signal / event';
    if (type === 'call') return 'queries / calls';
    return 'update → render';
  }
  if (projectType === 'javascript' || projectType === 'web') {
    if (type === 'watch') return 'references / links';
    if (type === 'call') return 'scripts / imports';
    return 'state → render';
  }
  if (type === 'watch') return 'references';
  if (type === 'call') return 'calls';
  return 'updates';
}

function redrawStateFlow() {
  if (!sfCanvas) return;
  const canvas = sfCanvas;
  const ctx = canvas.getContext('2d');
  const W = canvas.width / 2;
  const H = canvas.height / 2;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.scale(2, 2);
  ctx.translate(sfPanX, sfPanY);
  ctx.scale(sfZoom, sfZoom);

  // Layer backgrounds
  const layerLabelsArr = sfCanvas._layerLabels || ['UI LAYER', 'STATE LAYER', 'DATA LAYER'];
  const layerColors = ['#22d3ee', '#a78bfa', '#4ade80'];
  const layers = [...new Set(sfAllNodes.map(n => n.layer))].sort();
  for (const layer of layers) {
    const nodesInLayer = sfAllNodes.filter(n => n.layer === layer);
    if (nodesInLayer.length === 0) continue;
    const y = nodesInLayer[0].y;
    ctx.fillStyle = layerColors[layer] + '10';
    ctx.fillRect(8, y - 30, W/sfZoom - 16, 60);
    ctx.fillStyle = layerColors[layer] + '50';
    ctx.font = '700 9px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(layerLabelsArr[layer] || '', 16, y - 16);
  }

  // Draw edges
  sfEdgeHitAreas = [];
  for (const edge of sfAllEdges) {
    const isConnected = sfSelectedNode ?
      (edge.from.name === sfSelectedNode || edge.to.name === sfSelectedNode) : true;
    if (!isConnected && sfSelectedNode) continue;

    const edgeMatchesSearch = sfSearchQuery && (
      edge.from.name.toLowerCase().includes(sfSearchQuery) ||
      edge.to.name.toLowerCase().includes(sfSearchQuery)
    );

    const fx = edge.from.x, fy = edge.from.y;
    const tx = edge.to.x, ty = edge.to.y;
    const midX = (fx + tx) / 2, midY = (fy + ty) / 2;
    const cpX = midX + (edge.type === 'notify' ? 30 : -10);
    const cpY = midY;

    let color;
    if (edge.type === 'watch') color = '#22d3ee';
    else if (edge.type === 'call') color = '#4ade80';
    else color = '#a78bfa';

    let alpha;
    if (sfSearchQuery && !sfSelectedNode) {
      alpha = edgeMatchesSearch ? '80' : '08';
    } else {
      alpha = sfSelectedNode ? (isConnected ? '90' : '15') : '50';
    }

    ctx.beginPath();
    ctx.moveTo(fx, fy + 18);
    ctx.quadraticCurveTo(cpX, cpY, tx, ty - 18);
    ctx.strokeStyle = color + alpha;
    ctx.lineWidth = (isConnected && sfSelectedNode ? 3 : 2) / sfZoom;
    ctx.setLineDash(edge.type === 'notify' ? [4, 4] : []);
    ctx.stroke();
    ctx.setLineDash([]);

    const angle = Math.atan2(ty - 18 - cpY, tx - cpX);
    const ax = tx, ay = ty - 18;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - 8 * Math.cos(angle - 0.4), ay - 8 * Math.sin(angle - 0.4));
    ctx.lineTo(ax - 8 * Math.cos(angle + 0.4), ay - 8 * Math.sin(angle + 0.4));
    ctx.closePath();
    ctx.fillStyle = color + alpha;
    ctx.fill();

    if (!sfSelectedNode || isConnected) {
      ctx.fillStyle = color + '80';
      ctx.font = '500 8px JetBrains Mono';
      ctx.textAlign = 'center';
      ctx.fillText(edge.label, midX, midY - 4);
    }

    const sx = midX * sfZoom + sfPanX;
    const sy = midY * sfZoom + sfPanY;
    sfEdgeHitAreas.push({ x: sx - 40, y: sy - 12, w: 80, h: 24, edge });
  }

  // Draw nodes
  sfNodeHitAreas = [];
  const NW = 110, NH = 36;
  for (const node of sfAllNodes) {
    const color = node.layer === 0 ? '#22d3ee' : node.layer === 2 ? '#4ade80' : '#a78bfa';
    const isSelected = node.name === sfSelectedNode;
    const isSearchMatch = sfSearchQuery && node.name.toLowerCase().includes(sfSearchQuery);
    const isConnected = sfSelectedNode ? sfAllEdges.some(e =>
      (e.from.name === sfSelectedNode && e.to.name === node.name) ||
      (e.to.name === sfSelectedNode && e.from.name === node.name) ||
      node.name === sfSelectedNode
    ) : true;

    let nodeAlpha;
    if (sfSearchQuery && !sfSelectedNode) {
      nodeAlpha = isSearchMatch ? 1 : 0.15;
    } else {
      nodeAlpha = (!sfSelectedNode || isConnected) ? 1 : 0.25;
      if (sfSearchQuery && isSearchMatch && !isConnected) nodeAlpha = 0.85;
    }
    ctx.globalAlpha = nodeAlpha;

    // Search match glow
    if (isSearchMatch && !isSelected) {
      ctx.save();
      ctx.shadowColor = color;
      ctx.shadowBlur = 16;
      ctx.fillStyle = color + '25';
      ctx.beginPath();
      roundRect(ctx, node.x - NW/2 - 3, node.y - NH/2 - 3, NW + 6, NH + 6, 10);
      ctx.fill();
      ctx.restore();
    }

    if (isSelected) {
      ctx.fillStyle = color + '20';
      ctx.beginPath();
      roundRect(ctx, node.x - NW/2 - 4, node.y - NH/2 - 4, NW + 8, NH + 8, 12);
      ctx.fill();
    }

    ctx.fillStyle = color + '18';
    ctx.strokeStyle = isSelected ? color : color + '80';
    ctx.lineWidth = (isSelected ? 2.5 : 1.5) / sfZoom;
    ctx.beginPath();
    roundRect(ctx, node.x - NW/2, node.y - NH/2, NW, NH, 8);
    ctx.fill(); ctx.stroke();

    const fontSize = Math.max(7, Math.min(10, 10 / sfZoom));
    ctx.fillStyle = color;
    ctx.font = `700 ${fontSize}px JetBrains Mono`;
    ctx.textAlign = 'center';
    const maxLabelLen = Math.floor(14 / sfZoom * 1.5);
    const lbl = node.name.length > maxLabelLen ? node.name.slice(0, maxLabelLen - 1) + '…' : node.name;
    ctx.fillText(lbl, node.x, node.y - 2);

    ctx.fillStyle = '#586882';
    ctx.font = `500 ${Math.max(6, fontSize - 2)}px JetBrains Mono`;
    ctx.fillText(node.kind.toUpperCase(), node.x, node.y + 11);
    ctx.globalAlpha = 1;

    const sx = (node.x - NW/2) * sfZoom + sfPanX;
    const sy = (node.y - NH/2) * sfZoom + sfPanY;
    sfNodeHitAreas.push({ x: sx, y: sy, w: NW * sfZoom, h: NH * sfZoom, node });
  }

  ctx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.moveTo(x+r,y); ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}

/* ═══ Canvas Events ═══ */

function setupSfCanvasEvents(canvas, W, H) {
  let isDragging = false, lastMouse = null;

  canvas.onmousemove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    if (isDragging && lastMouse) {
      sfPanX += (mx - lastMouse.x);
      sfPanY += (my - lastMouse.y);
      lastMouse = { x: mx, y: my };
      redrawStateFlow();
      return;
    }

    for (const na of sfNodeHitAreas) {
      if (mx >= na.x && mx <= na.x + na.w && my >= na.y && my <= na.y + na.h) {
        canvas.style.cursor = 'pointer';
        showSfHoverTooltip(na.node, e);
        return;
      }
    }
    for (const ea of sfEdgeHitAreas) {
      if (mx >= ea.x && mx <= ea.x + ea.w && my >= ea.y && my <= ea.y + ea.h) {
        canvas.style.cursor = 'pointer';
        showSfEdgeTooltip(ea.edge, e);
        return;
      }
    }
    RichTooltip.hide('sf-tooltip');
    canvas.style.cursor = isDragging ? 'grabbing' : 'default';
  };

  canvas.onmousedown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const na of sfNodeHitAreas) {
      if (mx >= na.x && mx <= na.x + na.w && my >= na.y && my <= na.y + na.h) {
        sfToggleSidebar(na.node.name);
        return;
      }
    }
    isDragging = true;
    lastMouse = { x: mx, y: my };
    canvas.style.cursor = 'grabbing';
  };

  canvas.onmouseup = () => { isDragging = false; lastMouse = null; canvas.style.cursor = 'default'; };

  canvas.onclick = (e) => {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (const na of sfNodeHitAreas) {
      if (mx >= na.x && mx <= na.x + na.w && my >= na.y && my <= na.y + na.h) return;
    }
    sfReset();
  };

  canvas.onmouseleave = () => {
    isDragging = false; lastMouse = null;
    RichTooltip.hide('sf-tooltip');
    canvas.style.cursor = 'default';
  };

  canvas.onwheel = (e) => {
    e.preventDefault();
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const oldZoom = sfZoom;
    sfZoom = Math.max(0.3, Math.min(4, sfZoom * (e.deltaY > 0 ? 0.9 : 1.1)));
    sfPanX = mx - (mx - sfPanX) * (sfZoom / oldZoom);
    sfPanY = my - (my - sfPanY) * (sfZoom / oldZoom);
    redrawStateFlow();
  };
}

function showSfHoverTooltip(node, e) {
  const containerRect = document.getElementById('sf-canvas-area').getBoundingClientRect();
  const rx = e.clientX - containerRect.left;
  const ry = e.clientY - containerRect.top;
  const color = node.layer === 0 ? 'var(--cyan)' : node.layer === 2 ? 'var(--green)' : 'var(--purple)';

  const connIn = sfAllEdges.filter(ed => ed.to.name === node.name);
  const connOut = sfAllEdges.filter(ed => ed.from.name === node.name);

  let snippetLines = null;
  if (APP.files[node.file]) snippetLines = getCodeSnippet(node.file, node.line || 1, 3);

  RichTooltip.show('sf-tooltip', {
    x: rx, y: ry, containerRect,
    node: {
      title: node.name, path: node.file, color, badge: node.kind.toUpperCase(), badgeColor: color,
      stats: [
        { label: `${connOut.length} outgoing`, color: 'var(--import-color)' },
        { label: `${connIn.length} incoming`, color: 'var(--export-color)' },
      ],
    },
    tabs: [{
      label: 'Preview', inlineEditable: true, sections: [
        { title: 'CODE PREVIEW (click to edit)', snippet: snippetLines, filePath: node.file },
        { html: `<div style="font-size:9px;color:var(--text-dim);margin-top:4px">Click to filter connections</div>` },
      ]
    }],
  });
}

function showSfEdgeTooltip(edge, e) {
  const containerRect = document.getElementById('sf-canvas-area').getBoundingClientRect();
  const rx = e.clientX - containerRect.left;
  const ry = e.clientY - containerRect.top;

  let snippetLines = null;
  const fromContent = APP.files[edge.from.file]?.content || '';
  const fromLines = fromContent.split('\n');
  for (let i = 0; i < fromLines.length; i++) {
    if (fromLines[i].includes(edge.to.name)) {
      snippetLines = getCodeSnippet(edge.from.file, i + 1, 1);
      break;
    }
  }

  RichTooltip.show('sf-tooltip', {
    x: rx, y: ry, containerRect,
    node: {
      title: `${edge.from.name} → ${edge.to.name}`, color: 'var(--text-bright)',
      badge: edge.type.toUpperCase(),
      badgeColor: edge.type === 'watch' ? 'var(--cyan)' : edge.type === 'call' ? 'var(--green)' : 'var(--purple)',
      stats: [
        { label: `Pattern: ${edge.type === 'watch' ? 'Reactive' : edge.type === 'call' ? 'DI' : 'Push'}`, color: 'var(--amber)' },
      ],
    },
    tabs: [{
      label: 'Connection', inlineEditable: true, sections: [
        { title: 'DATA FLOW', html: `<div style="font-size:10px;color:var(--text-dim);line-height:1.6">
          <div><span style="color:var(--green)">Pattern:</span> ${edge.label}</div>
          <div><span style="color:var(--amber)">Type:</span> ${edge.type}</div>
        </div>` },
        snippetLines ? { title: 'REFERENCE CODE (click to edit)', snippet: snippetLines, filePath: edge.from.file } : null,
      ].filter(Boolean),
    }],
  });
}

/* ═══ Bottom Detail Panel ═══ */

function updateSfDetail() {
  const detail = document.getElementById('sf-detail');
  if (!detail) return;

  if (!sfSelectedNode) {
    detail.innerHTML = `<div class="sf-detail-empty">Click a node to see import/export code snippets</div>`;
    return;
  }

  const node = sfAllNodes.find(n => n.name === sfSelectedNode);
  if (!node) return;

  const connOut = sfAllEdges.filter(ed => ed.from.name === sfSelectedNode);
  const connIn = sfAllEdges.filter(ed => ed.to.name === sfSelectedNode);

  detail.innerHTML = `
    <div class="sf-detail-tabs">
      <div class="sf-detail-tab active" data-sftab="imports" onclick="switchSfDetailTab('imports')">→ Imports (${connOut.length})</div>
      <div class="sf-detail-tab" data-sftab="exports" onclick="switchSfDetailTab('exports')">← Used By (${connIn.length})</div>
      <div class="sf-detail-tab" data-sftab="api" onclick="switchSfDetailTab('api')">API / Fields</div>
      <span style="flex:1"></span>
      <button style="padding:4px 10px;font-size:10px;font-family:var(--font-mono);color:var(--cyan);font-weight:700;cursor:pointer"
        onclick="navigateToFile('${node.file}',${node.line||1})">Open Source ↗</button>
    </div>
    <div class="sf-detail-content" id="sf-detail-content">
      ${renderSfImportsTab(connOut, node)}
    </div>`;
}

function switchSfDetailTab(tab) {
  document.querySelectorAll('.sf-detail-tab').forEach(t => t.classList.toggle('active', t.dataset.sftab === tab));
  const content = document.getElementById('sf-detail-content');
  if (!content) return;
  const node = sfAllNodes.find(n => n.name === sfSelectedNode);
  if (!node) return;

  const connOut = sfAllEdges.filter(ed => ed.from.name === sfSelectedNode);
  const connIn = sfAllEdges.filter(ed => ed.to.name === sfSelectedNode);

  if (tab === 'imports') content.innerHTML = renderSfImportsTab(connOut, node);
  else if (tab === 'exports') content.innerHTML = renderSfExportsTab(connIn, node);
  else content.innerHTML = renderSfApiTab(node);
}

function renderSfImportsTab(connOut, node) {
  if (connOut.length === 0) return '<div style="color:var(--text-dim);font-size:11px">No outgoing connections</div>';
  return `<div class="sf-detail-snippet-grid">${connOut.map(edge => {
    const fromContent = APP.files[node.file]?.content || '';
    const fromLines = fromContent.split('\n');
    let snippetHtml = '';
    for (let i = 0; i < fromLines.length; i++) {
      if (fromLines[i].includes(edge.to.name)) {
        const snip = getCodeSnippet(node.file, i + 1, 2);
        if (snip) snippetHtml = renderEditableSnippetHtml(snip, node.file);
        break;
      }
    }
    const color = edge.type === 'watch' ? 'var(--cyan)' : edge.type === 'call' ? 'var(--green)' : 'var(--purple)';
    return `<div class="sf-detail-snippet-card">
      <div class="sf-detail-snippet-header">
        <span style="color:var(--import-color)">→</span>
        <span style="color:var(--text-bright);font-weight:700">${edge.to.name}</span>
        <span style="margin-left:auto;font-size:8px;padding:1px 5px;border-radius:3px;background:${color}20;color:${color}">${edge.label}</span>
      </div>
      ${snippetHtml || '<div style="padding:6px 10px;font-size:10px;color:var(--text-dim)">No code reference found</div>'}
    </div>`;
  }).join('')}</div>`;
}

function renderSfExportsTab(connIn, node) {
  if (connIn.length === 0) return '<div style="color:var(--text-dim);font-size:11px">No incoming connections</div>';
  return `<div class="sf-detail-snippet-grid">${connIn.map(edge => {
    const fromContent = APP.files[edge.from.file]?.content || '';
    const fromLines = fromContent.split('\n');
    let snippetHtml = '';
    for (let i = 0; i < fromLines.length; i++) {
      if (fromLines[i].includes(node.name)) {
        const snip = getCodeSnippet(edge.from.file, i + 1, 2);
        if (snip) snippetHtml = renderEditableSnippetHtml(snip, edge.from.file);
        break;
      }
    }
    return `<div class="sf-detail-snippet-card">
      <div class="sf-detail-snippet-header">
        <span style="color:var(--export-color)">←</span>
        <span style="color:var(--text-bright);font-weight:700">${edge.from.name}</span>
        <span style="margin-left:auto;font-size:8px;color:var(--text-dim)">${edge.from.kind}</span>
      </div>
      ${snippetHtml || '<div style="padding:6px 10px;font-size:10px;color:var(--text-dim)">No code reference found</div>'}
    </div>`;
  }).join('')}</div>`;
}

function renderSfApiTab(node) {
  const cls = APP.parsed.classes.find(c => c.name === node.name);
  if (!cls) {
    const prov = APP.parsed.providers.find(p => p.name === node.name);
    if (prov) {
      const snip = getCodeSnippet(prov.file, prov.line, 5);
      const snippetHtml = snip ? renderEditableSnippetHtml(snip, prov.file) : '';
      return `<div>
        <div style="font-size:10px;font-family:var(--font-mono);color:var(--purple);margin-bottom:6px">${prov.type} · ${prov.file}</div>
        ${snippetHtml}
      </div>`;
    }
    return '<div style="color:var(--text-dim);font-size:11px">No API details available</div>';
  }

  let html = '';
  if (cls.fields.length > 0) {
    html += `<div style="margin-bottom:12px">
      <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:4px;font-family:var(--font-mono)">FIELDS (${cls.fields.length})</div>
      ${cls.fields.map(f => `<div style="display:flex;gap:8px;padding:3px 0;font-size:11px;font-family:var(--font-mono)">
        <span style="color:var(--green)">${f.type}</span> <span style="color:var(--text-bright)">${f.name}</span>
      </div>`).join('')}
    </div>`;
  }
  if (cls.methods.length > 0) {
    html += `<div>
      <div style="font-size:9px;font-weight:700;letter-spacing:1.5px;color:var(--text-dim);margin-bottom:4px;font-family:var(--font-mono)">METHODS (${cls.methods.length})</div>
      <div style="display:flex;flex-wrap:wrap;gap:4px">
        ${cls.methods.map(m => `<span style="padding:3px 8px;border-radius:4px;font-size:10px;font-family:var(--font-mono);background:var(--bg-input);color:var(--cyan)">${m}()</span>`).join('')}
      </div>
    </div>`;
  }
  return html || '<div style="color:var(--text-dim);font-size:11px">No API details available</div>';
}
