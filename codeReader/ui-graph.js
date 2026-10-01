/* ═══════════════════════════════════════════════════
   Code Architect — ui-graph.js
   Import graph: hill/magnet repulsion physics,
   arrow key navigation, universal syntax highlighting,
   fixed import/export location for all entity types
   ═══════════════════════════════════════════════════ */

let graphData = null;
let graphSearchQuery = '';

function renderGraph() {
  const panel = document.getElementById('panel-graph');
  const level = GRAPH_STATE.level;
  panel.innerHTML = `
    <div class="graph-wrapper">
      <div class="graph-toolbar">
        <button class="graph-level-btn ${level==='file'?'active':''}" onclick="switchGraphLevel('file')">◎ Source Files</button>
        <button class="graph-level-btn ${level==='class'?'active':''}" onclick="switchGraphLevel('class')">◆ Classes</button>
        <button class="graph-level-btn ${level==='function'?'active':''}" onclick="switchGraphLevel('function')">⨍ Functions</button>
        <div class="graph-toolbar-sep"></div>
        <div class="graph-search-bar" style="display:flex;align-items:center;gap:4px">
          <input class="search-input graph-search-input" id="graph-search-input" placeholder="Search nodes…"
            value="${graphSearchQuery}" oninput="graphSearchHighlight(this.value)"
            style="width:140px;height:24px;font-size:10px;padding:2px 8px">
          ${graphSearchQuery ? `<button class="btn-clear-selection" onclick="graphSearchHighlight('');document.getElementById('graph-search-input').value=''">✕</button>` : ''}
        </div>
        <div class="graph-toolbar-sep"></div>
        <div class="graph-selection-info" id="graph-selection-info"></div>
        <div style="margin-left:auto;display:flex;gap:6px;align-items:center">
          <button class="graph-level-btn" onclick="exportGraphPng()" title="Download graph as PNG image">⬇ PNG</button>
          <span style="font-size:9px;color:var(--text-dim);font-family:var(--font-mono)">← ↑ ↓ → navigate</span>
        </div>
      </div>
      <div class="graph-with-sidebar">
        ${(level==='class'||level==='function')?`<div class="graph-selector" id="graph-selector"></div>`:''}
        <div class="graph-container" id="graph-container" tabindex="0" style="outline:none">
          <canvas class="graph-canvas" id="graph-canvas"></canvas>
          <div class="graph-controls">
            <button class="graph-ctrl-btn" onclick="graphZoom(1.2)" title="Zoom In">+</button>
            <button class="graph-ctrl-btn" onclick="graphZoom(0.8)" title="Zoom Out">−</button>
            <button class="graph-ctrl-btn" onclick="graphReset()" title="Reset">⟳</button>
          </div>
          <div class="graph-legend" id="graph-legend"></div>
        </div>
      </div>
    </div>`;
  RichTooltip.create('graph-container', 'graph-tooltip');
  if (level==='file') renderFileGraph();
  else if (level==='class') { renderClassSelector(); renderClassGraph(); }
  else { renderFunctionSelector(); renderFunctionGraph(); }
  updateGraphLegend();
  setupGraphKeyboardNav();
}

function exportGraphPng() {
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;
  // Composite onto an opaque background so the PNG isn't transparent
  const out = document.createElement('canvas');
  out.width = canvas.width; out.height = canvas.height;
  const octx = out.getContext('2d');
  octx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-deep').trim() || '#0a0e1a';
  octx.fillRect(0, 0, out.width, out.height);
  octx.drawImage(canvas, 0, 0);
  out.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${APP.parsed.projectName || 'project'}-${GRAPH_STATE.level}-graph.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

function switchGraphLevel(level) {
  GRAPH_STATE.level = level;
  GRAPH_STATE.selectedItems.clear();
  GRAPH_STATE.selectedNode = null;
  graphSearchQuery = '';
  renderGraph();
}

function updateGraphLegend() {
  const legend = document.getElementById('graph-legend');
  if (!legend) return;
  legend.innerHTML = `
    <div class="legend-item"><div class="legend-line" style="background:var(--import-color)"></div> Imports →</div>
    <div class="legend-item"><div class="legend-line" style="background:var(--export-color)"></div> ← Used by</div>
    <div class="legend-item" style="opacity:0.3">|</div>
    <div class="legend-item"><div class="legend-dot" style="background:#fbbf24"></div> Parent folder</div>
    <div class="legend-item"><div class="legend-dot" style="background:#60a5fa"></div> Sub folder</div>
    <div class="legend-item" style="opacity:0.3">|</div>
    <div class="legend-item" style="color:var(--text-dim);font-style:italic">Click node to inspect · Drag header to move</div>`;
}

function updateSelectionInfo() {
  const info = document.getElementById('graph-selection-info');
  if (!info) return;
  const sel = GRAPH_STATE.selectedNode;
  const count = GRAPH_STATE.selectedItems.size;
  let html = '';
  if (sel) {
    html = `Selected: <span>${sel}</span> <button class="btn-clear-selection" onclick="clearNodeSelection()">Clear</button>`;
  } else if (count > 0) {
    html = `<span>${count}</span> filtered <button class="btn-clear-selection" onclick="clearGraphSelection()">Clear</button>`;
  } else {
    html = `<span style="color:var(--text-dim)">Click nodes or sidebar to focus</span>`;
  }
  info.innerHTML = html;
}

function clearNodeSelection() {
  GRAPH_STATE.selectedNode = null;
  RichTooltip.dismiss('graph-tooltip');
  if (graphData) drawGraph();
  updateSelectionInfo();
}

function clearGraphSelection() {
  GRAPH_STATE.selectedItems.clear();
  GRAPH_STATE.selectedNode = null;
  RichTooltip.dismiss('graph-tooltip');
  document.querySelectorAll('.graph-selector-item').forEach(el=>el.classList.remove('selected'));
  renderCurrentGraphLevel();
  updateSelectionInfo();
}

function renderCurrentGraphLevel() {
  if (GRAPH_STATE.level==='class') renderClassGraph();
  else if (GRAPH_STATE.level==='function') renderFunctionGraph();
  else renderFileGraph();
}

/* ═══ ARROW KEY NAVIGATION FOR GRAPH ═══ */

function setupGraphKeyboardNav() {
  const container = document.getElementById('graph-container');
  if (!container) return;
  container.removeEventListener('keydown', handleGraphKeydown);
  container.addEventListener('keydown', handleGraphKeydown);
  container.addEventListener('mouseenter', () => container.focus());
}

function handleGraphKeydown(e) {
  if (!graphData || !graphData.nodes || graphData.nodes.length === 0) return;
  const key = e.key;
  if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(key)) return;
  e.preventDefault();

  const sel = GRAPH_STATE.selectedNode;
  const nodes = graphData.nodes;

  if (!sel) {
    const cx = graphData.W / 2, cy = graphData.H / 2;
    let closest = nodes[0], closestD = Infinity;
    for (const n of nodes) {
      const d = Math.hypot(n.x - cx, n.y - cy);
      if (d < closestD) { closestD = d; closest = n; }
    }
    GRAPH_STATE.selectedNode = closest.id;
    drawGraph(); updateSelectionInfo(); return;
  }

  const current = nodes.find(n => n.id === sel);
  if (!current) return;

  let best = null, bestScore = Infinity;
  for (const n of nodes) {
    if (n.id === sel) continue;
    const dx = n.x - current.x, dy = n.y - current.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 1) continue;

    let match = false;
    if (key === 'ArrowRight' && dx > 10) match = true;
    if (key === 'ArrowLeft' && dx < -10) match = true;
    if (key === 'ArrowDown' && dy > 10) match = true;
    if (key === 'ArrowUp' && dy < -10) match = true;

    if (match) {
      let penalty = 0;
      if (key === 'ArrowRight' || key === 'ArrowLeft') penalty = Math.abs(dy) * 0.5;
      else penalty = Math.abs(dx) * 0.5;
      const score = dist + penalty;
      if (score < bestScore) { bestScore = score; best = n; }
    }
  }

  if (best) {
    GRAPH_STATE.selectedNode = best.id;
    const screenX = best.x * graphData.zoom + graphData.panX;
    const screenY = best.y * graphData.zoom + graphData.panY;
    const margin = 100;
    if (screenX < margin) graphData.panX += (margin - screenX);
    if (screenX > graphData.W - margin) graphData.panX -= (screenX - graphData.W + margin);
    if (screenY < margin) graphData.panY += (margin - screenY);
    if (screenY > graphData.H - margin) graphData.panY -= (screenY - graphData.H + margin);
    drawGraph(); updateSelectionInfo();
  }
}

/* ═══ FILE LEVEL ═══ */
function renderFileGraph() {
  const imports = APP.parsed.imports;
  if (imports.length === 0) { drawEmptyGraph('No file-level imports detected'); return; }
  const edges = imports.map(e => ({ from: e.from, to: e.to, fromLine: e.fromLine }));

  // Build folder hierarchy from all file paths
  const allPaths = Object.keys(APP.files);
  const folderSet = new Set();
  const parentFolderSet = new Set(); // folders that contain other folders
  for (const p of allPaths) {
    const parts = p.split('/');
    for (let i = 1; i < parts.length; i++) {
      const folder = parts.slice(0, i).join('/');
      folderSet.add(folder);
    }
  }
  // Determine which folders are parents (contain subfolders)
  const folderArr = [...folderSet];
  for (const f of folderArr) {
    for (const f2 of folderArr) {
      if (f2 !== f && f2.startsWith(f + '/') && !f2.substring(f.length + 1).includes('/')) {
        parentFolderSet.add(f);
      }
    }
  }

  // Add folder-to-file containment edges
  const folderEdges = [];
  const filesInGraph = new Set();
  edges.forEach(e => { filesInGraph.add(e.from); filesInGraph.add(e.to); });

  for (const filePath of filesInGraph) {
    const parts = filePath.split('/');
    if (parts.length > 1) {
      const parentFolder = parts.slice(0, -1).join('/');
      if (folderSet.has(parentFolder)) {
        folderEdges.push({ from: parentFolder, to: filePath, isFolder: true });
      }
    }
  }

  // Store folder info for drawing
  GRAPH_STATE._folderInfo = { folderSet, parentFolderSet, folderEdges };
  initGraphCanvas([...edges, ...folderEdges], 'file');
}

/* ═══ CLASS LEVEL ═══ */
function renderClassSelector() {
  const selector = document.getElementById('graph-selector');
  if (!selector) return;
  const classes = APP.parsed.classes;
  const classImports = APP.parsed.classImports;
  const byFile = {};
  for (const cls of classes) { if (!byFile[cls.file]) byFile[cls.file]=[]; byFile[cls.file].push(cls); }
  let html = `<div class="search-bar" style="border-bottom:1px solid var(--border);margin:-12px -12px 8px;padding:8px 12px">
    <input class="search-input" placeholder="Filter classes..." oninput="filterGraphSelector(this.value)"></div>`;
  for (const [file, clsList] of Object.entries(byFile)) {
    const icon = getFileIcon(file);
    html += `<div class="graph-selector-file-header">${icon} ${file.split('/').pop()}</div>`;
    for (const cls of clsList) {
      const conns = classImports.filter(e=>e.fromClass===cls.name||e.toClass===cls.name).length;
      const color = getClassColor(cls);
      const isSel = GRAPH_STATE.selectedItems.has(cls.name);
      html += `<div class="graph-selector-item ${isSel?'selected':''}" data-name="${cls.name}" onclick="toggleGraphItem('${cls.name}')">
        <div class="item-dot" style="background:${color}"></div>${cls.name}<span class="item-count">${conns}</span></div>`;
    }
  }
  selector.innerHTML = html;
  updateSelectionInfo();
}

function renderClassGraph() {
  const classImports = APP.parsed.classImports;
  const selected = GRAPH_STATE.selectedItems;
  let edges = selected.size === 0 ? classImports : classImports.filter(e=>selected.has(e.fromClass)||selected.has(e.toClass));
  if (edges.length === 0) { drawEmptyGraph(selected.size>0?'No connections for selected':'No class-level connections'); return; }
  const mapped = edges.map(e => ({ from: e.fromClass, to: e.toClass }));
  initGraphCanvas(mapped, 'class');
}

/* ═══ FUNCTION LEVEL ═══ */
function renderFunctionSelector() {
  const selector = document.getElementById('graph-selector');
  if (!selector) return;
  const classes = APP.parsed.classes;
  const byFile = {};
  for (const cls of classes) { if (cls.methods.length===0) continue; if (!byFile[cls.file]) byFile[cls.file]=[]; byFile[cls.file].push(cls); }
  let html = `<div class="search-bar" style="border-bottom:1px solid var(--border);margin:-12px -12px 8px;padding:8px 12px">
    <input class="search-input" placeholder="Filter classes..." oninput="filterGraphSelector(this.value)"></div>`;
  for (const [file, clsList] of Object.entries(byFile)) {
    const icon = getFileIcon(file);
    html += `<div class="graph-selector-file-header">${icon} ${file.split('/').pop()}</div>`;
    for (const cls of clsList) {
      const isSel = GRAPH_STATE.selectedItems.has(cls.name);
      html += `<div class="graph-selector-item ${isSel?'selected':''}" data-name="${cls.name}" onclick="toggleGraphItem('${cls.name}')">
        <div class="item-dot" style="background:${getClassColor(cls)}"></div>${cls.name}<span class="item-count">${cls.methods.length}m</span></div>`;
    }
  }
  selector.innerHTML = html;
  updateSelectionInfo();
}

function renderFunctionGraph() {
  const funcImports = APP.parsed.funcImports;
  const selected = GRAPH_STATE.selectedItems;
  let edges = selected.size === 0 ? funcImports : funcImports.filter(e=>selected.has(e.fromClass));
  if (edges.length === 0) { drawEmptyGraph(selected.size>0?'No function connections for selected':'Select classes to see function deps'); return; }
  const seen = new Set();
  const mapped = [];
  for (const e of edges) {
    const key = `${e.fromClass}.${e.fromFunc}->${e.toClass}`;
    if (!seen.has(key)) { seen.add(key); mapped.push({ from: `${e.fromClass}.${e.fromFunc}`, to: e.toClass }); }
  }
  initGraphCanvas(mapped, 'function');
}

function filterGraphSelector(q) {
  q = q.toLowerCase();
  document.querySelectorAll('.graph-selector-item').forEach(el => {
    el.style.display = !q || el.dataset.name.toLowerCase().includes(q) ? '' : 'none';
  });
}

function toggleGraphItem(name) {
  if (GRAPH_STATE.selectedItems.has(name)) GRAPH_STATE.selectedItems.delete(name);
  else GRAPH_STATE.selectedItems.add(name);
  document.querySelectorAll('.graph-selector-item').forEach(el=>el.classList.toggle('selected',GRAPH_STATE.selectedItems.has(el.dataset.name)));
  GRAPH_STATE.selectedNode = null;
  RichTooltip.dismiss('graph-tooltip');
  renderCurrentGraphLevel();
  updateSelectionInfo();
}

function drawEmptyGraph(msg) {
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width*2; canvas.height = rect.height*2;
  canvas.style.width = rect.width+'px'; canvas.style.height = rect.height+'px';
  const ctx = canvas.getContext('2d'); ctx.scale(2,2);
  ctx.fillStyle='#586882'; ctx.font='13px Outfit'; ctx.textAlign='center';
  ctx.fillText(msg, rect.width/2, rect.height/2);
}

/* ═══ Helper: strip file extension for labels ═══ */
function stripExtForLabel(id) {
  return id.split('/').pop().replace(/\.\w+$/, '');
}

/* ═══ UNIFIED GRAPH CANVAS — Hill/Magnet Repulsion ═══ */

function initGraphCanvas(rawEdges, mode) {
  const canvas = document.getElementById('graph-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width*2; canvas.height = rect.height*2;
  canvas.style.width = rect.width+'px'; canvas.style.height = rect.height+'px';
  ctx.scale(2,2);
  const W = rect.width, H = rect.height;

  const nodeSet = new Set();
  rawEdges.forEach(e => { nodeSet.add(e.from); nodeSet.add(e.to); });

  const nodeArr = [...nodeSet];
  const folderInfo = GRAPH_STATE._folderInfo || { folderSet: new Set(), parentFolderSet: new Set() };
  const nodes = nodeArr.map((id, idx) => {
    const edgeCount = rawEdges.filter(e=>e.from===id||e.to===id).length;
    let color, label, isFolder = false, isFolderParent = false;
    if (mode==='file') {
      if (folderInfo.folderSet.has(id)) {
        isFolder = true;
        isFolderParent = folderInfo.parentFolderSet.has(id);
        color = isFolderParent ? '#fbbf24' : '#60a5fa'; // yellow parent, blue sub
        label = '📁 ' + id.split('/').pop();
      } else {
        color=getFileColor(id);
        label=stripExtForLabel(id);
      }
    } else if (mode==='class') {
      const cls=APP.parsed.classes.find(c=>c.name===id);
      color=cls?getClassColor(cls):'#fbbf24';
      label=id;
    } else {
      if(id.includes('.')) { color='#22d3ee'; label=id; }
      else { const cls=APP.parsed.classes.find(c=>c.name===id); color=cls?getClassColor(cls):'#fbbf24'; label=id; }
    }
    const angle = (idx / nodeArr.length) * Math.PI * 2;
    const radius = Math.min(W, H) * 0.3;
    return {
      id, label: label.length>22?label.slice(0,20)+'…':label, fullLabel:label,
      x: W/2 + Math.cos(angle)*radius,
      y: H/2 + Math.sin(angle)*radius,
      vx:0, vy:0, color, isFolder, isFolderParent,
      radius: isFolder ? 12 + Math.min(edgeCount * 2, 10) : 8 + Math.min(edgeCount * 2, 14),
    };
  });

  const nodeMap = {};
  nodes.forEach(n=>nodeMap[n.id]=n);
  const edges = rawEdges.map(e=>({ source:nodeMap[e.from], target:nodeMap[e.to], fromLine:e.fromLine, isFolder:e.isFolder||false })).filter(e=>e.source&&e.target);

  graphData = { nodes, edges, zoom:1, panX:0, panY:0, dragNode:null, W, H, canvas, ctx, mode, rawEdges };
  GRAPH_STATE.selectedNode = null;

  let tickCount = 0;
  const maxTicks = 250;
  function tick() {
    if (tickCount > maxTicks) return;
    tickCount++;
    const alpha = Math.max(0.005, 1 - tickCount / maxTicks);

    for (let i=0;i<nodes.length;i++) for (let j=i+1;j<nodes.length;j++) {
      let dx = nodes[j].x - nodes[i].x;
      let dy = nodes[j].y - nodes[i].y;
      let d = Math.sqrt(dx*dx + dy*dy) || 0.1;
      const combinedRadius = nodes[i].radius + nodes[j].radius;
      const peakDist = combinedRadius + 60;
      const maxForce = 3.5;
      const normD = d / peakDist;
      const hillForce = normD * Math.exp(1 - normD);
      let f = hillForce * maxForce * alpha;
      let fx = (dx/d) * f;
      let fy = (dy/d) * f;
      nodes[i].vx -= fx; nodes[i].vy -= fy;
      nodes[j].vx += fx; nodes[j].vy += fy;
    }

    for (const e of edges) {
      let dx=e.target.x-e.source.x, dy=e.target.y-e.source.y, d=Math.sqrt(dx*dx+dy*dy)||1;
      const idealDist = 120 + nodes.length * 2;
      let f=(d-idealDist)*0.005*alpha;
      let fx=dx/d*f, fy=dy/d*f;
      e.source.vx+=fx; e.source.vy+=fy; e.target.vx-=fx; e.target.vy-=fy;
    }

    for (const n of nodes) {
      n.vx+=(W/2-n.x)*0.0008*alpha;
      n.vy+=(H/2-n.y)*0.0008*alpha;
      n.vx*=0.75; n.vy*=0.75;
      const maxV = 8;
      n.vx = Math.max(-maxV, Math.min(maxV, n.vx));
      n.vy = Math.max(-maxV, Math.min(maxV, n.vy));
      n.x+=n.vx; n.y+=n.vy;
      n.x=Math.max(40,Math.min(W-40,n.x));
      n.y=Math.max(40,Math.min(H-40,n.y));
    }
    drawGraph();
    requestAnimationFrame(tick);
  }

  let mouseDown=false, lastMouse=null;
  const HIT_PADDING = 8;

  canvas.onmousedown = e => {
    const {x,y} = canvasCoords(e);
    let hitNode = null;
    for (const n of nodes) if (Math.hypot(n.x-x,n.y-y) < n.radius + HIT_PADDING) { hitNode=n; break; }

    if (hitNode) {
      if (e.shiftKey) {
        graphData.dragNode = hitNode;
      } else {
        if (GRAPH_STATE.selectedNode === hitNode.id) {
          GRAPH_STATE.selectedNode = null;
          RichTooltip.dismiss('graph-tooltip');
        } else {
          GRAPH_STATE.selectedNode = hitNode.id;
          showPinnedGraphTooltip(hitNode, e);
        }
        drawGraph();
        updateSelectionInfo();
      }
    } else {
      lastMouse = { x: e.clientX, y: e.clientY };
      RichTooltip.dismiss('graph-tooltip');
      GRAPH_STATE.selectedNode = null;
      drawGraph();
      updateSelectionInfo();
    }
    mouseDown = true;
  };

  canvas.onmousemove = e => {
    const {x,y} = canvasCoords(e);
    if (graphData.dragNode && mouseDown) {
      graphData.dragNode.x=x; graphData.dragNode.y=y;
      graphData.dragNode.vx=0; graphData.dragNode.vy=0;
      drawGraph();
    } else if (mouseDown && lastMouse) {
      graphData.panX+=e.clientX-lastMouse.x; graphData.panY+=e.clientY-lastMouse.y;
      lastMouse = {x:e.clientX, y:e.clientY}; drawGraph();
    }

    if (!RichTooltip.isPinned('graph-tooltip')) {
      let hit=null;
      for (const n of nodes) if (Math.hypot(n.x-x,n.y-y) < n.radius + HIT_PADDING) { hit=n; break; }
      if (hit) {
        showHoverGraphTooltip(hit, e);
        canvas.style.cursor = 'pointer';
      } else {
        RichTooltip.hide('graph-tooltip');
        canvas.style.cursor = mouseDown ? 'grabbing' : 'default';
      }
    }
  };

  canvas.onmouseup = () => { graphData.dragNode=null; mouseDown=false; lastMouse=null; canvas.style.cursor='default'; };
  canvas.onmouseleave = () => {
    graphData.dragNode=null; mouseDown=false; lastMouse=null;
    if(!RichTooltip.isPinned('graph-tooltip')) RichTooltip.hide('graph-tooltip');
  };
  canvas.onwheel = e => { e.preventDefault(); graphData.zoom=Math.max(0.2,Math.min(4,graphData.zoom*(e.deltaY>0?0.93:1.07))); drawGraph(); };

  function canvasCoords(e) {
    const r=canvas.getBoundingClientRect();
    return { x:(e.clientX-r.left-graphData.panX)/graphData.zoom, y:(e.clientY-r.top-graphData.panY)/graphData.zoom };
  }

  function showHoverGraphTooltip(node, e) {
    const incoming = edges.filter(ed=>ed.target.id===node.id);
    const outgoing = edges.filter(ed=>ed.source.id===node.id);
    const containerRect = canvas.parentElement.getBoundingClientRect();
    const rx = e.clientX - containerRect.left;
    const ry = e.clientY - containerRect.top;

    const overviewSnippet = getQuickSnippet(node, mode);
    const filePath = resolveNodeFilePath(node, mode);
    RichTooltip.show('graph-tooltip', {
      x: rx, y: ry, containerRect,
      node: {
        ...node, title: node.fullLabel || node.label, path: node.id,
        badge: mode.toUpperCase(), badgeColor: node.color,
        stats: [
          { label: `→ ${outgoing.length} imports`, color: 'var(--import-color)' },
          { label: `← ${incoming.length} used by`, color: 'var(--export-color)' },
        ],
      },
      tabs: [{ label: 'Preview', inlineEditable: true, sections: [{ title: 'CODE PREVIEW (click to edit)', snippet: overviewSnippet, filePath }] }],
    });
  }

  function showPinnedGraphTooltip(node, e) {
    const containerRect = canvas.parentElement.getBoundingClientRect();
    const rx = e.clientX - containerRect.left;
    const ry = e.clientY - containerRect.top;

    const tabs = buildGraphTooltipTabs(node, edges, mode, 'graph-tooltip');
    const filePath = resolveNodeFilePath(node, mode);

    RichTooltip.pin('graph-tooltip', {
      x: rx, y: ry, containerRect,
      node: {
        ...node, title: node.fullLabel || node.label, path: node.id,
        badge: mode.toUpperCase(), badgeColor: node.color,
        stats: [
          { label: `→ ${edges.filter(ed=>ed.source.id===node.id).length} imports`, color: 'var(--import-color)' },
          { label: `← ${edges.filter(ed=>ed.target.id===node.id).length} used by`, color: 'var(--export-color)' },
        ],
        actions: [
          { label: 'Open in Explorer ↗', cls: 'nav-btn', onclick: `navigateToFile('${filePath.replace(/'/g,"\\'")}')` },
        ],
      },
      tabs,
    });
  }

  tick();
}

/* ═══ Resolve file path for any node type ═══ */
function resolveNodeFilePath(node, mode) {
  if (mode === 'file') return node.id;
  // Try class lookup
  const clsName = node.id.includes('.') ? node.id.split('.')[0] : node.id;
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  if (cls) return cls.file;
  // Try function lookup
  const fn = APP.parsed.functions.find(f => f.name === clsName || f.name === node.id);
  if (fn) return fn.file;
  return '';
}

function getQuickSnippet(node, mode) {
  if (mode === 'file' && APP.files[node.id]) {
    const lines = APP.files[node.id].content.split('\n');
    return lines.slice(0, 6).map((t, i) => ({ num: i+1, text: t, highlight: false }));
  } else if (mode === 'class') {
    const cls = APP.parsed.classes.find(c => c.name === node.id);
    if (cls) return getCodeSnippet(cls.file, cls.line, 3);
  } else if (mode === 'function' && node.id.includes('.')) {
    const [clsName, funcName] = node.id.split('.');
    const cls = APP.parsed.classes.find(c => c.name === clsName);
    if (cls) {
      const content = APP.files[cls.file]?.content || '';
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].includes(funcName + '(') || lines[i].includes(`def ${funcName}`)) {
          return getCodeSnippet(cls.file, i+1, 3);
        }
      }
    }
  }
  return null;
}

/* ═══ DRAW GRAPH ═══ */

function drawGraph() {
  if (!graphData) return;
  const { ctx, nodes, edges, zoom, panX, panY, W, H } = graphData;
  const selNode = GRAPH_STATE.selectedNode;

  ctx.clearRect(0,0,W,H);
  ctx.save();
  ctx.translate(panX,panY);
  ctx.scale(zoom,zoom);

  for (const e of edges) {
    const dx=e.target.x-e.source.x, dy=e.target.y-e.source.y;
    const dist=Math.sqrt(dx*dx+dy*dy)||1;
    const angle=Math.atan2(dy,dx);
    const isFolder = e.isFolder;
    const sourceMatchesSearch = graphSearchQuery && (
      e.source.id.toLowerCase().includes(graphSearchQuery) ||
      (e.source.fullLabel || e.source.label || '').toLowerCase().includes(graphSearchQuery)
    );
    const targetMatchesSearch = graphSearchQuery && (
      e.target.id.toLowerCase().includes(graphSearchQuery) ||
      (e.target.fullLabel || e.target.label || '').toLowerCase().includes(graphSearchQuery)
    );
    const edgeMatchesSearch = sourceMatchesSearch || targetMatchesSearch;
    let lineColor, arrowColor;
    if (selNode) {
      if (e.source.id === selNode) { lineColor = 'rgba(248, 113, 113, 0.8)'; arrowColor = 'rgba(248, 113, 113, 0.95)'; }
      else if (e.target.id === selNode) { lineColor = 'rgba(74, 222, 128, 0.8)'; arrowColor = 'rgba(74, 222, 128, 0.95)'; }
      else { lineColor = 'rgba(88, 104, 130, 0.12)'; arrowColor = 'rgba(88, 104, 130, 0.2)'; }
    } else if (graphSearchQuery) {
      if (edgeMatchesSearch) {
        lineColor = 'rgba(251, 191, 36, 0.6)'; arrowColor = 'rgba(251, 191, 36, 0.8)';
      } else {
        lineColor = 'rgba(88, 104, 130, 0.06)'; arrowColor = 'rgba(88, 104, 130, 0.08)';
      }
    } else {
      if (isFolder) { lineColor = 'rgba(251, 191, 36, 0.25)'; arrowColor = 'rgba(251, 191, 36, 0.35)'; }
      else { lineColor = 'rgba(88, 104, 130, 0.3)'; arrowColor = 'rgba(88, 104, 130, 0.5)'; }
    }
    ctx.setLineDash(isFolder ? [4, 4] : []);
    ctx.beginPath(); ctx.moveTo(e.source.x, e.source.y); ctx.lineTo(e.target.x, e.target.y);
    ctx.strokeStyle = lineColor; ctx.lineWidth = selNode && (e.source.id===selNode||e.target.id===selNode) ? 3 : (isFolder ? 1 : 1.5); ctx.stroke();
    ctx.setLineDash([]);
    if (!isFolder) {
      const arrowSize = selNode && (e.source.id===selNode||e.target.id===selNode) ? 12 : 8;
      const ax = e.source.x + (dist - e.target.radius - 6) * Math.cos(angle);
      const ay = e.source.y + (dist - e.target.radius - 6) * Math.sin(angle);
      ctx.beginPath(); ctx.moveTo(ax, ay);
      ctx.lineTo(ax - arrowSize*Math.cos(angle-0.35), ay - arrowSize*Math.sin(angle-0.35));
      ctx.lineTo(ax - arrowSize*Math.cos(angle+0.35), ay - arrowSize*Math.sin(angle+0.35));
      ctx.closePath(); ctx.fillStyle = arrowColor; ctx.fill();
    }
  }

  for (const n of nodes) {
    let nodeAlpha = 1, isSelected = n.id === selNode, isConnected = false;
    const isSearchMatch = graphSearchQuery && (
      n.id.toLowerCase().includes(graphSearchQuery) ||
      (n.fullLabel || n.label || '').toLowerCase().includes(graphSearchQuery)
    );
    if (selNode) {
      isConnected = edges.some(e => (e.source.id===selNode&&e.target.id===n.id)||(e.target.id===selNode&&e.source.id===n.id));
      if (!isSelected && !isConnected) nodeAlpha = isSearchMatch ? 0.9 : 0.2;
    } else if (graphSearchQuery && !isSearchMatch) {
      nodeAlpha = 0.15;
    }
    ctx.globalAlpha = nodeAlpha;

    // Search match glow
    if (isSearchMatch && !isSelected) {
      ctx.save();
      ctx.shadowColor = n.color;
      ctx.shadowBlur = 18;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.radius + 6, 0, Math.PI*2);
      ctx.fillStyle = n.color + '30'; ctx.fill();
      ctx.restore();
    }

    if (isSelected) { ctx.beginPath(); ctx.arc(n.x, n.y, n.radius+10, 0, Math.PI*2); ctx.fillStyle = n.color + '20'; ctx.fill(); }

    if (n.isFolder) {
      // Draw folder as rounded rectangle
      const fw = n.radius * 2.5, fh = n.radius * 1.8;
      ctx.beginPath();
      const rx = n.x - fw/2, ry = n.y - fh/2, rr = 4;
      ctx.moveTo(rx+rr,ry); ctx.lineTo(rx+fw-rr,ry); ctx.arcTo(rx+fw,ry,rx+fw,ry+rr,rr);
      ctx.lineTo(rx+fw,ry+fh-rr); ctx.arcTo(rx+fw,ry+fh,rx+fw-rr,ry+fh,rr);
      ctx.lineTo(rx+rr,ry+fh); ctx.arcTo(rx,ry+fh,rx,ry+fh-rr,rr);
      ctx.lineTo(rx,ry+rr); ctx.arcTo(rx,ry,rx+rr,ry,rr); ctx.closePath();
      ctx.fillStyle = n.color + (isSelected ? '40' : '18'); ctx.strokeStyle = n.color;
      ctx.lineWidth = isSelected ? 3 : 2; ctx.fill(); ctx.stroke();
      // Folder tab
      ctx.beginPath();
      ctx.moveTo(rx, ry+4); ctx.lineTo(rx, ry-3); ctx.lineTo(rx+fw*0.35, ry-3); ctx.lineTo(rx+fw*0.42, ry);
      ctx.strokeStyle = n.color; ctx.lineWidth = 1.5; ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI*2);
      ctx.fillStyle = n.color + (isSelected ? '50' : '25'); ctx.strokeStyle = n.color;
      ctx.lineWidth = isSelected ? 3 : 2; ctx.fill(); ctx.stroke();
    }
    ctx.fillStyle = isSelected ? '#ffffff' : '#d4dae8';
    ctx.font = (isSelected ? '700 ' : '600 ') + '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center'; ctx.fillText(n.label, n.x, n.y + n.radius + 16);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function graphZoom(factor) {
  if (!graphData) return;
  graphData.zoom = Math.max(0.2, Math.min(4, graphData.zoom * factor));
  drawGraph();
}

function graphSearchHighlight(q) {
  graphSearchQuery = q.trim().toLowerCase();
  // Also highlight matching items in the sidebar
  document.querySelectorAll('.graph-selector-item').forEach(el => {
    const name = el.dataset.name?.toLowerCase() || '';
    if (graphSearchQuery && name.includes(graphSearchQuery)) {
      el.classList.add('search-match');
    } else {
      el.classList.remove('search-match');
    }
  });
  drawGraph();
}

function graphReset() {
  if (!graphData) return;
  graphData.zoom=1; graphData.panX=0; graphData.panY=0;
  GRAPH_STATE.selectedNode = null;
  graphSearchQuery = '';
  RichTooltip.dismiss('graph-tooltip');
  renderGraph();
}
