/* ═══════════════════════════════════════════════════
   Code Architect — ui-visual.js
   Visual no-code editor.
   • Dart/Flutter: build() parsed into an editable widget
     tree — edit props, wrap, unwrap, add, remove, reorder.
   • Python: class structure editor — attributes, methods,
     renames, stubs.
   All edits are SPAN SPLICES into the real source file, so
   visual ⇄ code stay perfectly in sync (re-parsed each edit).
   ═══════════════════════════════════════════════════ */

const VIS = { target: null, selectedPath: null, codeEditOpen: false };

/* ─────────────────────────── ENTRY ─────────────────────────── */

function renderVisual() {
  const panel = document.getElementById('panel-visual');
  const pt = APP.parsed.projectType;

  if (pt === 'dart') { renderVisualDart(panel); return; }
  if (pt === 'python') { renderVisualPython(panel); return; }

  // Other project types: python-style structure editor works for any parsed classes
  if (APP.parsed.classes.length > 0) { renderVisualPython(panel); return; }
  panel.innerHTML = `<div class="source-empty" style="height:100%"><div class="source-empty-icon">⬡</div>
    Visual editing is optimized for Flutter/Dart and Python projects.<br>No editable structures found in this project.</div>`;
}

/* ══════════════════════ DART SOURCE SCANNER ══════════════════════ */
/* Balanced-span helpers that skip strings & comments — the foundation
   that makes span-splicing safe. */

function _skipStr(src, i) {
  const q = src[i]; i++;
  while (i < src.length) {
    if (src[i] === '\\') { i += 2; continue; }
    if (src[i] === '$' && src[i + 1] === '{') { const m = _findMatch(src, i + 1); i = m === -1 ? i + 2 : m + 1; continue; }
    if (src[i] === q) return i;
    i++;
  }
  return i;
}

function _findMatch(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"') { i = _skipStr(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && src[i + 1] === '*') { i += 2; while (i < src.length - 1 && !(src[i] === '*' && src[i + 1] === '/')) i++; i++; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') { depth--; if (depth === 0) return i; }
  }
  return -1;
}

function _splitTopLevel(src, start, end) {
  const parts = []; let depth = 0, segStart = start;
  for (let i = start; i < end; i++) {
    const c = src[i];
    if (c === "'" || c === '"') { i = _skipStr(src, i); continue; }
    if (c === '/' && src[i + 1] === '/') { while (i < end && src[i] !== '\n') i++; continue; }
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 0) { parts.push([segStart, i]); segStart = i + 1; }
  }
  if (end > segStart) parts.push([segStart, end]);
  return parts.filter(([s, e]) => src.slice(s, e).trim().length > 0);
}

/* ══════════════════════ DART WIDGET TREE PARSER ══════════════════════ */

const _WIDGET_CTOR_RE = /^(?:const\s+)?([A-Z][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*(?:<[^>()]*>)?\s*\(/;

function parseDartValue(src, start, end) {
  const text = src.slice(start, end);
  const trimmed = text.trim();
  const tStart = start + (text.length - text.trimStart().length);
  const tEnd = tStart + trimmed.length;

  if (trimmed.startsWith('[')) {
    const close = _findMatch(src, tStart);
    if (close !== -1) {
      const items = _splitTopLevel(src, tStart + 1, close).map(([s, e]) => parseDartValue(src, s, e));
      return { kind: 'list', start: tStart, end: close + 1, items };
    }
  }
  const m = trimmed.match(_WIDGET_CTOR_RE);
  if (m) {
    const node = parseDartWidget(src, tStart);
    if (node) return node;
  }
  if (/^r?['"]/.test(trimmed) && /['"]$/.test(trimmed) && !trimmed.includes('\n')) {
    return { kind: 'lit', litType: 'string', start: tStart, end: tEnd, text: trimmed };
  }
  if (/^-?\d+\.?\d*$/.test(trimmed)) return { kind: 'lit', litType: 'number', start: tStart, end: tEnd, text: trimmed };
  if (/^(true|false)$/.test(trimmed)) return { kind: 'lit', litType: 'bool', start: tStart, end: tEnd, text: trimmed };
  if (/^[A-Z][\w$]*\.[a-zA-Z_$][\w$]*$/.test(trimmed)) return { kind: 'lit', litType: 'enum', start: tStart, end: tEnd, text: trimmed };
  return { kind: 'opaque', start: tStart, end: tEnd, text: trimmed };
}

function parseDartWidget(src, pos) {
  // pos points at 'const'? or ctor identifier
  let i = pos;
  const constM = src.slice(i, i + 8).match(/^const\s+/);
  if (constM) i += constM[0].length;
  const rest = src.slice(i);
  const nameM = rest.match(/^([A-Z][\w$]*(?:\.[a-zA-Z_$][\w$]*)?)\s*(?:<[^>()]*>)?\s*\(/);
  if (!nameM) return null;
  const openIdx = i + nameM[0].length - 1;
  const closeIdx = _findMatch(src, openIdx);
  if (closeIdx === -1) return null;

  const args = _splitTopLevel(src, openIdx + 1, closeIdx).map(([s, e]) => {
    const argText = src.slice(s, e);
    const named = argText.match(/^(\s*)([a-z_$][\w$]*)\s*:/);
    if (named) {
      const vStart = s + named[0].length;
      return { name: named[2], start: s, end: e, value: parseDartValue(src, vStart, e) };
    }
    return { name: null, start: s, end: e, value: parseDartValue(src, s, e) };
  });

  return { kind: 'widget', name: nameM[1], start: pos, end: closeIdx + 1, args };
}

function findBuildWidgetTree(content, cls) {
  const clsIdx = content.indexOf(`class ${cls.name}`);
  if (clsIdx === -1) return null;
  const braceIdx = content.indexOf('{', clsIdx);
  if (braceIdx === -1) return null;
  const clsEnd = _findMatch(content, braceIdx);
  if (clsEnd === -1) return null;

  const buildM = /Widget\s+build\s*\([^)]*\)\s*(?:async\s*)?\{/g;
  buildM.lastIndex = braceIdx;
  const bm = buildM.exec(content);
  if (!bm || bm.index > clsEnd) return null;
  const bodyOpen = bm.index + bm[0].length - 1;
  const bodyClose = _findMatch(content, bodyOpen);
  if (bodyClose === -1) return null;

  const retM = /return\s+/g;
  retM.lastIndex = bodyOpen;
  const rm = retM.exec(content);
  if (!rm || rm.index > bodyClose) return null;
  const exprStart = rm.index + rm[0].length;
  const node = parseDartWidget(content, exprStart);
  if (node) node._buildSpan = [bodyOpen, bodyClose];
  return node;
}

/* ══════════════════════ VISUAL: DART PANEL ══════════════════════ */

const _WRAPPERS_SINGLE = ['Container', 'Padding', 'Center', 'Expanded', 'Flexible', 'SizedBox', 'Card', 'GestureDetector', 'InkWell', 'ClipRRect', 'Align', 'Opacity', 'SafeArea', 'SingleChildScrollView'];
const _WRAPPERS_MULTI = ['Column', 'Row', 'Stack', 'Wrap', 'ListView'];
const _CHILD_TEMPLATES = {
  'Text': `Text('New text')`,
  'Container': `Container()`,
  'Icon': `Icon(Icons.star)`,
  'SizedBox (spacer)': `SizedBox(height: 8)`,
  'ElevatedButton': `ElevatedButton(onPressed: () {}, child: Text('Button'))`,
  'Row': `Row(children: [])`,
  'Column': `Column(children: [])`,
  'Image.network': `Image.network('https://')`,
  'Divider': `Divider()`,
  'Spacer': `Spacer()`,
};
/* ── Widget category colours (node headers + borders) ── */
const _WIDGET_CATEGORIES = [
  { re: /^(Column|Row|Stack|Wrap|Flex|Expanded|Flexible|Spacer|Align|Center|Positioned|Padding|SizedBox|Container|ConstrainedBox|FittedBox|AspectRatio|SafeArea|Table)$/, color: '#60a5fa', label: 'layout' },
  { re: /^(Text|RichText|TextSpan|DefaultTextStyle|SelectableText)$/, color: '#4ade80', label: 'text' },
  { re: /^(ElevatedButton|TextButton|OutlinedButton|IconButton|FloatingActionButton|GestureDetector|InkWell|TextField|TextFormField|Checkbox|Switch|Slider|Radio|DropdownButton)/, color: '#fbbf24', label: 'input' },
  { re: /^(Image|Icon|CircleAvatar|FadeInImage|DecoratedBox|CustomPaint|ClipRRect|ClipOval|Opacity|BackdropFilter|ShaderMask)/, color: '#f472b6', label: 'visual' },
  { re: /^(ListView|GridView|SingleChildScrollView|PageView|CustomScrollView|Sliver|ListTile|ReorderableList)/, color: '#a78bfa', label: 'scroll' },
  { re: /^(Scaffold|AppBar|Drawer|BottomNavigationBar|TabBar|MaterialApp|CupertinoApp|Dialog|AlertDialog|SnackBar|BottomSheet|NavigationBar)/, color: '#f87171', label: 'structure' },
  { re: /^(AnimatedContainer|AnimatedOpacity|AnimatedBuilder|Hero|TweenAnimationBuilder|AnimatedSwitcher|FadeTransition|SlideTransition)/, color: '#2dd4bf', label: 'animation' },
];

function widgetCategoryColor(name) {
  const base = name.split('.')[0];
  for (const cat of _WIDGET_CATEGORIES) if (cat.re.test(base)) return cat.color;
  return 'var(--cyan)'; // custom / unknown widgets
}

/* ── Flutter colour values → real CSS colours (for swatches) ── */
const _FLUTTER_COLORS = {
  red: '#f44336', pink: '#e91e63', purple: '#9c27b0', deepPurple: '#673ab7',
  indigo: '#3f51b5', blue: '#2196f3', lightBlue: '#03a9f4', cyan: '#00bcd4',
  teal: '#009688', green: '#4caf50', lightGreen: '#8bc34a', lime: '#cddc39',
  yellow: '#ffeb3b', amber: '#ffc107', orange: '#ff9800', deepOrange: '#ff5722',
  brown: '#795548', grey: '#9e9e9e', blueGrey: '#607d8b',
  black: '#000000', white: '#ffffff', transparent: 'transparent',
  black87: 'rgba(0,0,0,0.87)', black54: 'rgba(0,0,0,0.54)',
  black38: 'rgba(0,0,0,0.38)', black26: 'rgba(0,0,0,0.26)', black12: 'rgba(0,0,0,0.12)',
  white70: 'rgba(255,255,255,0.70)', white54: 'rgba(255,255,255,0.54)',
  white38: 'rgba(255,255,255,0.38)', white24: 'rgba(255,255,255,0.24)', white12: 'rgba(255,255,255,0.12)',
};

/** 'Colors.red' / 'Colors.red.shade200' / 'Color(0xFF12AB34)' → css colour or null */
function dartColorToCss(text) {
  if (!text) return null;
  const t = text.trim();
  const hexM = t.match(/^(?:const\s+)?Color\s*\(\s*0x([0-9A-Fa-f]{8})\s*\)$/);
  if (hexM) {
    const a = parseInt(hexM[1].slice(0, 2), 16) / 255;
    const r = parseInt(hexM[1].slice(2, 4), 16);
    const g = parseInt(hexM[1].slice(4, 6), 16);
    const b = parseInt(hexM[1].slice(6, 8), 16);
    return `rgba(${r},${g},${b},${a.toFixed(2)})`;
  }
  const colM = t.match(/^Colors\.(\w+)(?:\.shade(\d+))?$/);
  if (colM && _FLUTTER_COLORS[colM[1]]) {
    // shades approximated: lighter <500, darker >500 via opacity mix
    return _FLUTTER_COLORS[colM[1]];
  }
  return null;
}

function colorSwatchHtml(cssColor, id) {
  return `<span class="vis-swatch" ${id ? `id="${id}"` : ''} style="background:${cssColor};${cssColor === 'transparent' ? 'background-image:repeating-conic-gradient(#666 0 25%, #999 0 50%);background-size:6px 6px;' : ''}" title="${cssColor}"></span>`;
}

const _ENUM_OPTIONS = {
  mainAxisAlignment: ['MainAxisAlignment.start', 'MainAxisAlignment.center', 'MainAxisAlignment.end', 'MainAxisAlignment.spaceBetween', 'MainAxisAlignment.spaceAround', 'MainAxisAlignment.spaceEvenly'],
  crossAxisAlignment: ['CrossAxisAlignment.start', 'CrossAxisAlignment.center', 'CrossAxisAlignment.end', 'CrossAxisAlignment.stretch', 'CrossAxisAlignment.baseline'],
  textAlign: ['TextAlign.left', 'TextAlign.center', 'TextAlign.right', 'TextAlign.justify'],
  fontWeight: ['FontWeight.normal', 'FontWeight.bold', 'FontWeight.w300', 'FontWeight.w500', 'FontWeight.w600', 'FontWeight.w700'],
  fit: ['BoxFit.contain', 'BoxFit.cover', 'BoxFit.fill', 'BoxFit.fitWidth', 'BoxFit.fitHeight'],
  color: ['Colors.red', 'Colors.blue', 'Colors.green', 'Colors.amber', 'Colors.purple', 'Colors.teal', 'Colors.orange', 'Colors.grey', 'Colors.black', 'Colors.white'],
};

function renderVisualDart(panel) {
  const widgets = APP.parsed.classes.filter(c => c.lang === 'dart' &&
    (c.widgetType === 'stateless' || c.widgetType === 'stateful' || c.widgetType === 'state'));
  if (!VIS.target || !widgets.find(w => w.name === VIS.target)) VIS.target = widgets[0]?.name || null;

  panel.innerHTML = `
    <div class="visual">
      <div class="visual-sidebar">
        <div class="tree-header">FLUTTER WIDGETS</div>
        ${widgets.map(w => `<div class="vis-target ${w.name === VIS.target ? 'active' : ''}" onclick="visPickTarget('${w.name}')">
          <span style="color:var(--cyan)">◈</span> ${w.name}
          <span class="vis-target-sub">${w.widgetType}</span></div>`).join('') ||
          '<div style="padding:12px;font-size:11px;color:var(--text-dim)">No widget classes with build() found</div>'}
        <div class="tree-header" style="margin-top:12px">OTHER CLASSES</div>
        ${APP.parsed.classes.filter(c => c.lang === 'dart' && !widgets.includes(c)).slice(0, 30).map(c =>
          `<div class="vis-target" onclick="visShowClassOps('${c.name}')"><span style="color:var(--purple)">◆</span> ${c.name}</div>`).join('')}
      </div>
      <div class="visual-main" id="visual-main"></div>
      <div class="visual-code" id="visual-code"></div>
    </div>`;
  visRenderDartTree();
}

function visPickTarget(name) { VIS.target = name; VIS.selectedPath = null; VIS.codeEditOpen = false; renderVisual(); }

function visRenderDartTree() {
  const main = document.getElementById('visual-main');
  if (!main) return;
  const cls = APP.parsed.classes.find(c => c.name === VIS.target);
  if (!cls) { main.innerHTML = '<div class="source-empty"><div class="source-empty-icon">⬡</div>Select a widget</div>'; return; }
  const content = APP.files[cls.file]?.content || '';
  const tree = findBuildWidgetTree(content, cls);
  if (!tree) {
    main.innerHTML = `<div class="source-empty"><div class="source-empty-icon">⬡</div>
      Couldn't parse the build() return expression of <b>&nbsp;${cls.name}&nbsp;</b>.<br>
      Complex builds (conditionals, builders) need the code editor.
      <button class="code-search-btn" style="margin-top:10px" onclick="navigateToFile('${cls.file.replace(/'/g, "\\'")}', ${cls.line})">Open in Explorer ↗</button></div>`;
    document.getElementById('visual-code').innerHTML = '';
    return;
  }
  VIS._tree = tree; VIS._file = cls.file;
  main.innerHTML = `
    <div class="vis-toolbar">
      <span style="font-weight:700;color:var(--cyan);font-size:12px">◈ ${cls.name} → build()</span>
      <span style="font-size:9px;color:var(--text-dim);margin-left:auto">click node to inspect · every action edits real code</span>
    </div>
    <div class="vis-tree">${visNodeHtml(tree, 'r')}</div>`;
  visRenderCodePane();
}

function visNodeHtml(node, path) {
  if (!node) return '';
  if (node.kind === 'list') {
    return node.items.map((it, i) => visNodeHtml(it, `${path}.${i}`)).join('');
  }
  if (node.kind !== 'widget') {
    return `<div class="vis-node vis-node-opaque" onclick="visSelect(event,'${path}')">
      <span class="vis-opaque-text">${escapeHtml((node.text || '').slice(0, 60))}${(node.text || '').length > 60 ? '…' : ''}</span></div>`;
  }
  const sel = VIS.selectedPath === path ? ' selected' : '';
  const litProps = node.args.filter(a => a.name && a.value.kind === 'lit');
  const childArgs = node.args.filter(a => a.value.kind === 'widget' || (a.value.kind === 'list' && a.value.items.some(x => x.kind === 'widget')));

  const catColor = widgetCategoryColor(node.name);
  return `<div class="vis-node${sel}" data-vp="${path}" style="border-left:3px solid ${catColor}">
    <div class="vis-node-head" onclick="visSelect(event,'${path}')">
      <span class="vis-node-dot" style="background:${catColor}"></span>
      <span class="vis-node-name" style="color:${catColor}">${node.name}</span>
      <span class="vis-node-ops" onclick="event.stopPropagation()">
        <select class="vis-op-select" onchange="visWrap('${path}', this.value); this.value=''" title="Wrap this widget">
          <option value="">⊕ wrap</option>
          <optgroup label="Single child">${_WRAPPERS_SINGLE.map(w => `<option>${w}</option>`).join('')}</optgroup>
          <optgroup label="Multi child">${_WRAPPERS_MULTI.map(w => `<option>${w}</option>`).join('')}</optgroup>
        </select>
        <button class="vis-op-btn" onclick="visUnwrap('${path}')" title="Remove this widget, keep its child">⊖</button>
        <button class="vis-op-btn" onclick="visMove('${path}', -1)" title="Move up in list">↑</button>
        <button class="vis-op-btn" onclick="visMove('${path}', 1)" title="Move down in list">↓</button>
        <button class="vis-op-btn vis-op-danger" onclick="visDelete('${path}')" title="Delete from list">✕</button>
      </span>
    </div>
    ${litProps.length ? `<div class="vis-props">${litProps.map(a => visPropHtml(a, path)).join('')}</div>` : ''}
    ${childArgs.map(a => `
      <div class="vis-child-label">${a.name || ''}</div>
      <div class="vis-children">
        ${visNodeHtml(a.value, `${path}.a${node.args.indexOf(a)}`)}
        ${a.value.kind === 'list' ? `<select class="vis-op-select vis-add-child" onchange="visAddChild('${path}', ${node.args.indexOf(a)}, this.value); this.value=''">
          <option value="">＋ add child…</option>
          ${Object.keys(_CHILD_TEMPLATES).map(t => `<option>${t}</option>`).join('')}
        </select>` : ''}
      </div>`).join('')}
  </div>`;
}

function visPropHtml(arg, path) {
  const v = arg.value;
  const argIdx = `'${path}', ${visArgIndex(path, arg)}`;
  const enumOpts = _ENUM_OPTIONS[arg.name] || (v.litType === 'enum' && v.text.startsWith('Colors.') ? _ENUM_OPTIONS.color : null);
  const cssColor = dartColorToCss(v.text);
  const swatch = cssColor ? colorSwatchHtml(cssColor) : '';
  let input;
  if (v.litType === 'bool') {
    input = `<input type="checkbox" ${v.text === 'true' ? 'checked' : ''} onchange="visSetProp(${argIdx}, this.checked ? 'true' : 'false')">`;
  } else if (enumOpts) {
    const opts = enumOpts.includes(v.text) ? enumOpts : [v.text, ...enumOpts];
    const isColorSelect = enumOpts === _ENUM_OPTIONS.color || opts.some(o => o.startsWith('Colors.'));
    input = `${swatch}<select class="vis-prop-input" onchange="visSetProp(${argIdx}, this.value)">${opts.map(o => {
      const oc = dartColorToCss(o);
      return `<option ${o === v.text ? 'selected' : ''}${oc && isColorSelect ? ` style="color:${oc}"` : ''}>${o}</option>`;
    }).join('')}</select>`;
  } else if (v.litType === 'number') {
    input = `<input class="vis-prop-input" type="number" step="any" value="${v.text}" onchange="visSetProp(${argIdx}, this.value)">`;
  } else if (v.litType === 'string') {
    const inner = v.text.replace(/^r?['"]|['"]$/g, '');
    input = `<input class="vis-prop-input" type="text" value="${escapeHtml(inner)}" data-quote="${v.text[0] === '"' ? 'd' : 's'}" onchange="visSetPropString(${argIdx}, this)">`;
  } else {
    input = `${swatch}<input class="vis-prop-input" type="text" value="${escapeHtml(v.text)}" onchange="visSetProp(${argIdx}, this.value)">`;
  }
  const isColorProp = /color|Color$/i.test(arg.name || '');
  return `<label class="vis-prop"><span class="vis-prop-name" ${isColorProp && cssColor ? `style="color:${cssColor === 'transparent' ? 'var(--text-dim)' : cssColor}"` : ''}>${arg.name}</span>${input}</label>`;
}

function visArgIndex(path, arg) {
  const node = visNodeAt(path);
  return node ? node.args.indexOf(arg) : -1;
}

/* Resolve a path like "r.a2.0.a1" to a node in VIS._tree */
function visNodeAt(path) {
  if (!VIS._tree) return null;
  const parts = path.split('.');
  let node = VIS._tree;
  for (let i = 1; i < parts.length; i++) {
    const p = parts[i];
    if (p.startsWith('a')) {
      const arg = node.args?.[parseInt(p.slice(1))];
      node = arg ? arg.value : null;
    } else {
      node = node.items?.[parseInt(p)];
    }
    if (!node) return null;
  }
  return node;
}

function visParentInfo(path) {
  // Returns { listNode, index } if node is an element of a children list
  const parts = path.split('.');
  const last = parts[parts.length - 1];
  if (last.startsWith('a')) return null;
  const parentPath = parts.slice(0, -1).join('.');
  const listNode = visNodeAt(parentPath);
  if (!listNode || listNode.kind !== 'list') return null;
  return { listNode, index: parseInt(last) };
}

/* ─────── DART VISUAL OPS — all splice real source ─────── */

function visSetProp(path, argIdx, newText) {
  const node = visNodeAt(path);
  const arg = node?.args?.[argIdx];
  if (!arg) return;
  spliceFile(VIS._file, arg.value.start, arg.value.end, newText);
  visRenderDartTree();
}

function visSetPropString(path, argIdx, inputEl) {
  const q = inputEl.dataset.quote === 'd' ? '"' : "'";
  const escaped = inputEl.value.replace(new RegExp(q, 'g'), '\\' + q);
  visSetProp(path, argIdx, q + escaped + q);
}

function visWrap(path, wrapper) {
  if (!wrapper) return;
  const node = visNodeAt(path);
  if (!node) return;
  const content = APP.files[VIS._file].content;
  const src = content.slice(node.start, node.end);
  const wrapped = _WRAPPERS_MULTI.includes(wrapper)
    ? `${wrapper}(children: [${src}])`
    : `${wrapper}(child: ${src})`;
  VIS.selectedPath = path;
  spliceFile(VIS._file, node.start, node.end, wrapped);
  visRenderDartTree();
}

function visUnwrap(path) {
  const node = visNodeAt(path);
  if (!node || node.kind !== 'widget') return;
  const content = APP.files[VIS._file].content;
  // Find single widget child (child: X, or children:[X] with one widget)
  let child = null;
  for (const a of node.args) {
    if (a.value.kind === 'widget') { child = a.value; break; }
    if (a.value.kind === 'list') {
      const ws = a.value.items.filter(x => x.kind === 'widget');
      if (ws.length === 1) { child = ws[0]; break; }
    }
  }
  if (!child) return;
  spliceFile(VIS._file, node.start, node.end, content.slice(child.start, child.end));
  visRenderDartTree();
}

function visMove(path, dir) {
  const info = visParentInfo(path);
  if (!info) return;
  const { listNode, index } = info;
  const j = index + dir;
  if (j < 0 || j >= listNode.items.length) return;
  const content = APP.files[VIS._file].content;
  const items = listNode.items.map(it => content.slice(it.start, it.end).trim());
  [items[index], items[j]] = [items[j], items[index]];
  spliceFile(VIS._file, listNode.start, listNode.end, '[' + items.join(', ') + ']');
  visRenderDartTree();
}

function visDelete(path) {
  const info = visParentInfo(path);
  if (!info) { visUnwrap(path); return; }
  const { listNode, index } = info;
  const content = APP.files[VIS._file].content;
  const items = listNode.items.map(it => content.slice(it.start, it.end).trim());
  items.splice(index, 1);
  VIS.selectedPath = null;
  spliceFile(VIS._file, listNode.start, listNode.end, '[' + items.join(', ') + ']');
  visRenderDartTree();
}

function visAddChild(path, argIdx, templateKey) {
  if (!templateKey) return;
  const node = visNodeAt(path);
  const arg = node?.args?.[argIdx];
  if (!arg || arg.value.kind !== 'list') return;
  const content = APP.files[VIS._file].content;
  const items = arg.value.items.map(it => content.slice(it.start, it.end).trim());
  items.push(_CHILD_TEMPLATES[templateKey]);
  spliceFile(VIS._file, arg.value.start, arg.value.end, '[' + items.join(', ') + ']');
  visRenderDartTree();
}

function visSelect(event, path) {
  event.stopPropagation();
  VIS.selectedPath = VIS.selectedPath === path ? null : path;
  VIS.codeEditOpen = false;
  document.querySelectorAll('.vis-node').forEach(n => n.classList.toggle('selected', n.dataset.vp === VIS.selectedPath));
  visRenderCodePane();
}

/* ─────── CODE PANE — the visual ⇄ code bridge ─────── */

function visRenderCodePane() {
  const pane = document.getElementById('visual-code');
  if (!pane) return;
  const node = VIS.selectedPath ? visNodeAt(VIS.selectedPath) : VIS._tree;
  if (!node) { pane.innerHTML = ''; return; }
  const content = APP.files[VIS._file]?.content || '';
  const src = content.slice(node.start, node.end);
  const startLine = content.slice(0, node.start).split('\n').length;

  const hierarchy = visCallHierarchyHtml();

  if (VIS.codeEditOpen) {
    pane.innerHTML = `
      <div class="vis-code-head">
        <span>✎ EDITING ${node.kind === 'widget' ? node.name : 'selection'}</span>
        <button class="code-search-btn" style="background:var(--green)" onclick="visCommitCodeEdit()">Save → Visual</button>
        <button class="vis-op-btn" onclick="VIS.codeEditOpen=false;visRenderCodePane()">✕</button>
      </div>
      <textarea class="source-editor" id="vis-code-editor" spellcheck="false" style="flex:1">${escapeHtml(src)}</textarea>`;
    return;
  }

  pane.innerHTML = `
    <div class="vis-code-head">
      <span>${node.kind === 'widget' ? node.name : 'selection'} · line ${startLine}</span>
      <button class="vis-op-btn" title="Edit this code directly" onclick="VIS.codeEditOpen=true;visRenderCodePane()">✎ code</button>
      <button class="vis-op-btn" title="Open in Explorer" onclick="navigateToFile('${(VIS._file || '').replace(/'/g, "\\'")}', ${startLine})">↗</button>
    </div>
    <div class="vis-code-body source-code">${src.split('\n').slice(0, 400).map((l, i) =>
      `<div class="source-line"><span class="source-line-num">${startLine + i}</span>
       <span class="source-line-text">${highlightCodeSafe(l, VIS._file)}</span></div>`).join('')}</div>
    ${hierarchy}`;
}

function visCommitCodeEdit() {
  const editor = document.getElementById('vis-code-editor');
  const node = VIS.selectedPath ? visNodeAt(VIS.selectedPath) : VIS._tree;
  if (!editor || !node) return;
  VIS.codeEditOpen = false;
  spliceFile(VIS._file, node.start, node.end, editor.value);
  visRenderDartTree();
}

/* ─────── CALL HIERARCHY (works for any project type) ─────── */

function visCallHierarchyHtml() {
  const clsName = VIS.target;
  if (!clsName) return '';
  const p = APP.parsed;
  const uses = [...new Set((p.classImports || []).filter(e => e.fromClass === clsName).map(e => e.toClass))];
  const usedBy = [...new Set((p.classImports || []).filter(e => e.toClass === clsName).map(e => e.fromClass))];
  if (!uses.length && !usedBy.length) return '';
  const chip = n => `<span class="dep-chip" style="cursor:pointer" onclick="visJumpToClass('${n}')">${n}</span>`;
  return `<div class="vis-hierarchy">
    ${usedBy.length ? `<div class="vis-hier-label">← used by</div><div class="dep-list">${usedBy.slice(0, 15).map(chip).join('')}</div>` : ''}
    ${uses.length ? `<div class="vis-hier-label">→ uses</div><div class="dep-list">${uses.slice(0, 15).map(chip).join('')}</div>` : ''}
  </div>`;
}

function visJumpToClass(name) {
  const cls = APP.parsed.classes.find(c => c.name === name);
  if (cls) navigateToFile(cls.file, cls.line);
}

function visShowClassOps(name) {
  const cls = APP.parsed.classes.find(c => c.name === name);
  if (cls) navigateToFile(cls.file, cls.line);
}

/* ══════════════════════ PYTHON STRUCTURE EDITOR ══════════════════════ */

function renderVisualPython(panel) {
  const classes = APP.parsed.classes;
  if (!VIS.target || !classes.find(c => c.name === VIS.target)) VIS.target = classes[0]?.name || null;
  const isPy = c => c.lang === 'python';

  panel.innerHTML = `
    <div class="visual">
      <div class="visual-sidebar">
        <div class="tree-header">CLASSES</div>
        ${classes.slice(0, 80).map(c => `<div class="vis-target ${c.name === VIS.target ? 'active' : ''}" onclick="visPickTarget('${c.name}')">
          <span style="color:${c.widgetType ? 'var(--cyan)' : 'var(--purple)'}">${c.widgetType ? '◈' : '◆'}</span> ${c.name}
          <span class="vis-target-sub">${c.widgetType || c.lang}</span></div>`).join('') ||
          '<div style="padding:12px;font-size:11px;color:var(--text-dim)">No classes found</div>'}
      </div>
      <div class="visual-main" id="visual-main"></div>
      <div class="visual-code" id="visual-code"></div>
    </div>`;
  visRenderPyClass();
}

function _pyClassLines(cls) {
  const content = APP.files[cls.file]?.content || '';
  const lines = content.split('\n');
  const startIdx = cls.line - 1;
  const classIndent = lines[startIdx]?.search(/\S/) ?? 0;
  let endIdx = lines.length;
  for (let j = startIdx + 1; j < lines.length; j++) {
    const t = lines[j].trim();
    if (t === '' || t.startsWith('#')) continue;
    if (lines[j].search(/\S/) <= classIndent) { endIdx = j; break; }
  }
  return { lines, startIdx, endIdx, classIndent };
}

function _pyReplaceLines(cls, newLines) {
  setFileContent(cls.file, newLines.join('\n'));
  reParseProject();
  renderVisual();
}

function visRenderPyClass() {
  const main = document.getElementById('visual-main');
  const codePane = document.getElementById('visual-code');
  if (!main) return;
  const cls = APP.parsed.classes.find(c => c.name === VIS.target);
  if (!cls) { main.innerHTML = '<div class="source-empty"><div class="source-empty-icon">⬡</div>Select a class</div>'; return; }
  const isPython = cls.lang === 'python';
  VIS._file = cls.file;

  main.innerHTML = `
    <div class="vis-toolbar">
      <span style="font-weight:700;color:var(--purple);font-size:12px">◆ ${cls.name}</span>
      ${cls.superclass ? `<span style="font-size:10px;color:var(--text-dim)">extends ${cls.superclass}</span>` : ''}
      <button class="vis-op-btn" style="margin-left:auto" onclick="visRenameClass('${cls.name}')" title="Rename everywhere">✎ rename</button>
      <button class="vis-op-btn" onclick="navigateToFile('${cls.file.replace(/'/g, "\\'")}', ${cls.line})" title="Open source">↗</button>
    </div>

    <div class="vis-section">
      <div class="vis-section-title">ATTRIBUTES <span style="color:var(--text-dim);font-weight:400">(${cls.fields.length})</span></div>
      ${cls.fields.map(f => `<div class="vis-row">
        <span class="vis-row-type">${escapeHtml(f.type || '')}</span>
        <span class="vis-row-name">${f.name}</span>
        <span style="flex:1"></span>
        <button class="vis-op-btn" onclick="visRenameMember('${cls.name}', '${f.name}')" title="Rename in this file">✎</button>
        ${isPython ? `<button class="vis-op-btn vis-op-danger" onclick="visPyDeleteField('${cls.name}', '${f.name}')" title="Delete assignment">✕</button>` : ''}
      </div>`).join('') || '<div class="vis-empty-row">none</div>'}
      <div class="vis-add-row">
        <input class="vis-prop-input" id="vis-new-field-name" placeholder="name" style="width:110px">
        <input class="vis-prop-input" id="vis-new-field-type" placeholder="${isPython ? 'type hint' : 'Type'}" style="width:90px">
        <input class="vis-prop-input" id="vis-new-field-default" placeholder="default" style="width:80px">
        <button class="code-search-btn" onclick="visAddField('${cls.name}')">＋ Add</button>
      </div>
    </div>

    <div class="vis-section">
      <div class="vis-section-title">METHODS <span style="color:var(--text-dim);font-weight:400">(${cls.methods.length})</span></div>
      ${cls.methods.map(m => `<div class="vis-row vis-row-click" onclick="visShowPyMethod('${cls.name}', '${m}')">
        <span class="vis-row-name" style="color:var(--green)">${m}()</span>
        <span style="flex:1"></span>
        <button class="vis-op-btn" onclick="event.stopPropagation();visRenameMember('${cls.name}', '${m}')" title="Rename in this file">✎</button>
        ${isPython ? `<button class="vis-op-btn vis-op-danger" onclick="event.stopPropagation();visPyDeleteMethod('${cls.name}', '${m}')" title="Delete method">✕</button>` : ''}
      </div>`).join('') || '<div class="vis-empty-row">none</div>'}
      <div class="vis-add-row">
        <input class="vis-prop-input" id="vis-new-method-name" placeholder="method_name" style="width:140px">
        <input class="vis-prop-input" id="vis-new-method-params" placeholder="params" style="width:120px">
        <button class="code-search-btn" onclick="visAddMethod('${cls.name}')">＋ Add</button>
      </div>
    </div>`;

  if (codePane) codePane.innerHTML = `
    <div class="vis-code-head"><span>${cls.name} · ${cls.file.split('/').pop()}:${cls.line}</span></div>
    <div class="vis-code-body source-code">${(getCodeSnippet(cls.file, cls.line, 12) || []).map(l =>
      `<div class="source-line${l.highlight ? ' snippet-highlight' : ''}"><span class="source-line-num">${l.num}</span>
       <span class="source-line-text">${highlightCodeSafe(l.text, cls.file)}</span></div>`).join('')}</div>
    ${visCallHierarchyHtml()}`;
}

function visShowPyMethod(clsName, method) {
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  if (!cls) return;
  const { lines, startIdx, endIdx } = _pyClassLines(cls);
  const codePane = document.getElementById('visual-code');
  if (cls.lang !== 'python') {
    // Brace language: just find and show
    for (let j = startIdx; j < endIdx; j++) {
      if (lines[j].includes(method + '(')) { navigateToFile(cls.file, j + 1); return; }
    }
    return;
  }
  let mStart = -1, mIndent = 0;
  const defRe = new RegExp(`^(\\s*)def\\s+${escapeRegexParser(method)}\\s*\\(`);
  for (let j = startIdx; j < endIdx; j++) {
    const m = lines[j].match(defRe);
    if (m) { mStart = j; mIndent = m[1].length; break; }
  }
  if (mStart === -1) return;
  let mEnd = endIdx;
  for (let j = mStart + 1; j < endIdx; j++) {
    const t = lines[j].trim();
    if (t === '' || t.startsWith('#')) continue;
    if (lines[j].search(/\S/) <= mIndent) { mEnd = j; break; }
  }
  VIS._pyMethod = { clsName, method, mStart, mEnd };
  const body = lines.slice(mStart, mEnd).join('\n');
  codePane.innerHTML = `
    <div class="vis-code-head">
      <span>${method}() · line ${mStart + 1}</span>
      <button class="code-search-btn" style="background:var(--green)" onclick="visCommitPyMethod()">Save → Visual</button>
      <button class="vis-op-btn" onclick="visRenderPyClass()">✕</button>
    </div>
    <textarea class="source-editor" id="vis-py-method-editor" spellcheck="false" style="flex:1">${escapeHtml(body)}</textarea>`;
}

function visCommitPyMethod() {
  const st = VIS._pyMethod;
  const editor = document.getElementById('vis-py-method-editor');
  if (!st || !editor) return;
  const cls = APP.parsed.classes.find(c => c.name === st.clsName);
  if (!cls) return;
  const { lines } = _pyClassLines(cls);
  const newLines = [...lines.slice(0, st.mStart), ...editor.value.split('\n'), ...lines.slice(st.mEnd)];
  VIS._pyMethod = null;
  _pyReplaceLines(cls, newLines);
}

function visAddField(clsName) {
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  const name = document.getElementById('vis-new-field-name')?.value?.trim();
  if (!cls || !name) return;
  const type = document.getElementById('vis-new-field-type')?.value?.trim();
  const def = document.getElementById('vis-new-field-default')?.value?.trim();

  if (cls.lang === 'python') {
    const { lines, startIdx, endIdx, classIndent } = _pyClassLines(cls);
    const bodyIndent = ' '.repeat(classIndent + 4);
    // Prefer inserting into __init__
    let initIdx = -1, initIndent = 0;
    for (let j = startIdx; j < endIdx; j++) {
      const m = lines[j].match(/^(\s*)def\s+__init__\s*\(/);
      if (m) { initIdx = j; initIndent = m[1].length; break; }
    }
    let newLines;
    if (initIdx !== -1) {
      const assign = ' '.repeat(initIndent + 4) + `self.${name}${type ? `: ${type}` : ''} = ${def || 'None'}`;
      newLines = [...lines.slice(0, initIdx + 1), assign, ...lines.slice(initIdx + 1)];
    } else {
      const annot = bodyIndent + `${name}${type ? `: ${type}` : ''} = ${def || 'None'}`;
      newLines = [...lines.slice(0, startIdx + 1), annot, ...lines.slice(startIdx + 1)];
    }
    _pyReplaceLines(cls, newLines);
  } else {
    // Brace language (Dart etc): insert after class opening brace
    const content = APP.files[cls.file].content;
    const clsIdx = content.indexOf(`class ${cls.name}`);
    const braceIdx = content.indexOf('{', clsIdx);
    if (braceIdx === -1) return;
    const line = `\n  final ${type || 'dynamic'} ${name}${def ? ` = ${def}` : ''};`;
    spliceFile(cls.file, braceIdx + 1, braceIdx + 1, line);
    renderVisual();
  }
}

function visAddMethod(clsName) {
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  const name = document.getElementById('vis-new-method-name')?.value?.trim();
  if (!cls || !name) return;
  const params = document.getElementById('vis-new-method-params')?.value?.trim() || '';

  if (cls.lang === 'python') {
    const { lines, endIdx, classIndent } = _pyClassLines(cls);
    const ind = ' '.repeat(classIndent + 4);
    const stub = ['', `${ind}def ${name}(self${params ? ', ' + params : ''}):`, `${ind}    pass`];
    const newLines = [...lines.slice(0, endIdx), ...stub, ...lines.slice(endIdx)];
    _pyReplaceLines(cls, newLines);
  } else {
    const content = APP.files[cls.file].content;
    const clsIdx = content.indexOf(`class ${cls.name}`);
    const braceIdx = content.indexOf('{', clsIdx);
    const closeIdx = _findMatch(content, braceIdx);
    if (closeIdx === -1) return;
    const stub = `\n  void ${name}(${params}) {\n    // TODO\n  }\n`;
    spliceFile(cls.file, closeIdx, closeIdx, stub);
    renderVisual();
  }
}

function visPyDeleteField(clsName, fieldName) {
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  if (!cls) return;
  const { lines, startIdx, endIdx } = _pyClassLines(cls);
  const re = new RegExp(`^\\s*(?:self\\.)?${escapeRegexParser(fieldName)}\\s*(?::[^=]+)?=`);
  for (let j = startIdx; j < endIdx; j++) {
    if (re.test(lines[j])) {
      _pyReplaceLines(cls, [...lines.slice(0, j), ...lines.slice(j + 1)]);
      return;
    }
  }
}

function visPyDeleteMethod(clsName, method) {
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  if (!cls) return;
  const { lines, startIdx, endIdx } = _pyClassLines(cls);
  const defRe = new RegExp(`^(\\s*)def\\s+${escapeRegexParser(method)}\\s*\\(`);
  for (let j = startIdx; j < endIdx; j++) {
    const m = lines[j].match(defRe);
    if (m) {
      const mIndent = m[1].length;
      let mEnd = endIdx;
      for (let k = j + 1; k < endIdx; k++) {
        const t = lines[k].trim();
        if (t === '' || t.startsWith('#')) continue;
        if (lines[k].search(/\S/) <= mIndent) { mEnd = k; break; }
      }
      _pyReplaceLines(cls, [...lines.slice(0, j), ...lines.slice(mEnd)]);
      return;
    }
  }
}

function visRenameClass(oldName) {
  const newName = prompt(`Rename class "${oldName}" across the whole project:`, oldName);
  if (!newName || newName === oldName || !/^[A-Za-z_]\w*$/.test(newName)) return;
  const re = new RegExp(`\\b${escapeRegexParser(oldName)}\\b`, 'g');
  for (const path of Object.keys(APP.files)) {
    const c = APP.files[path].content;
    if (re.test(c)) { re.lastIndex = 0; setFileContent(path, c.replace(re, newName)); }
    re.lastIndex = 0;
  }
  VIS.target = newName;
  reParseProject();
  renderVisual();
}

function visRenameMember(clsName, oldName) {
  const cls = APP.parsed.classes.find(c => c.name === clsName);
  if (!cls) return;
  const newName = prompt(`Rename "${oldName}" (within ${cls.file.split('/').pop()}):`, oldName);
  if (!newName || newName === oldName || !/^[A-Za-z_]\w*$/.test(newName)) return;
  const re = new RegExp(`\\b${escapeRegexParser(oldName)}\\b`, 'g');
  setFileContent(cls.file, APP.files[cls.file].content.replace(re, newName));
  reParseProject();
  renderVisual();
}
