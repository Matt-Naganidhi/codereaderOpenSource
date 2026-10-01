/* ═══════════════════════════════════════════════════
   Code Architect — app.js
   Core state, file system access, universal project processing
   ═══════════════════════════════════════════════════ */

const APP = {
  files: {},      // path -> { content, size }
  parsed: {
    classes: [], imports: [], providers: [], enums: [], widgets: [],
    functions: [],
    packages: { deps: {}, devDeps: {}, flutterDeps: {} },
    projectName: '', dartVersion: '', projectType: 'unknown',
    classImports: [], funcImports: [],
  },
  tree: null,
};

const GRAPH_STATE = {
  level: 'file',
  selectedItems: new Set(),
  selectedNode: null,
};

/* ═══ FILE SYSTEM ACCESS ═══ */

async function openFolder() {
  if (!window.showDirectoryPicker) {
    document.getElementById('folder-input-hidden').click();
    return;
  }
  try {
    const handle = await window.showDirectoryPicker({ mode: 'read' });
    await loadFromHandle(handle);
  } catch (e) { if (e.name !== 'AbortError') console.error(e); }
}

function openFolderFromBrowse() {
  document.getElementById('folder-input-hidden').click();
}

async function handleFolderInput(event) {
  const files = event.target.files;
  if (!files || files.length === 0) return;
  showLoading();
  APP.files = {};
  let rootName = 'project';
  if (files[0]?.webkitRelativePath) rootName = files[0].webkitRelativePath.split('/')[0];

  const validExts = new Set(getParseableExtensions());

  for (const file of files) {
    const relPath = file.webkitRelativePath;
    if (!relPath) continue;
    const parts = relPath.split('/');
    parts.shift();
    const path = parts.join('/');
    if (!path) continue;
    const name = parts[parts.length - 1];
    // Skip hidden dirs and common build/vendor folders
    if (parts.some(p => p.startsWith('.') || ['build','.dart_tool','node_modules','.git',
        'ios','android','macos','linux','windows','web','__pycache__','.venv','venv',
        'env','dist','target','.next','.nuxt','coverage','vendor','bin','obj',
        '.idea','.vscode','.vs','Debug','Release','x64','x86'].includes(p))) continue;
    const ext = name.split('.').pop().toLowerCase();
    // Also accept files with no extension if they're common (Makefile, Dockerfile, etc.)
    const isSpecial = ['Makefile','Dockerfile','Vagrantfile','Gemfile','Rakefile','CMakeLists.txt'].some(s => name === s || name.endsWith(s));
    if (validExts.has(ext) || isSpecial) {
      try {
        const content = await file.text();
        APP.files[path] = { content, size: file.size };
        document.getElementById('loading-detail').textContent = path;
      } catch(e) {}
    }
  }
  processProject(rootName);
}

async function loadFromPath() {
  const pathInput = document.getElementById('path-input');
  const userPath = pathInput.value.trim();
  if (!userPath) { pathInput.style.borderColor = 'var(--red)'; setTimeout(() => pathInput.style.borderColor = '', 1500); return; }
  if (window.showDirectoryPicker) {
    try { const handle = await window.showDirectoryPicker({ mode: 'read' }); await loadFromHandle(handle); }
    catch(e) { if (e.name !== 'AbortError') document.getElementById('folder-input-hidden').click(); }
  } else {
    document.getElementById('folder-input-hidden').click();
  }
}

async function loadFromHandle(dirHandle) {
  showLoading();
  APP.files = {};
  await readDirectory(dirHandle, '', APP.files);
  saveLastProject(dirHandle);
  processProject(dirHandle.name);
}

async function readDirectory(handle, prefix, target) {
  target = target || APP.files;
  const validExts = new Set(getParseableExtensions());
  const skipDirs = new Set(['build','.dart_tool','node_modules','.git',
    'ios','android','macos','linux','windows','web','__pycache__','.venv','venv',
    'env','dist','target','.next','.nuxt','coverage','vendor','bin','obj',
    '.idea','.vscode','.vs','Debug','Release','x64','x86']);

  for await (const [name, entry] of handle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    if (name.startsWith('.') || skipDirs.has(name)) continue;
    if (entry.kind === 'file') {
      const ext = name.split('.').pop().toLowerCase();
      const isSpecial = ['Makefile','Dockerfile','CMakeLists.txt'].includes(name);
      if (validExts.has(ext) || isSpecial) {
        try {
          const file = await entry.getFile();
          const content = await file.text();
          target[path] = { content, size: file.size };
          document.getElementById('loading-detail').textContent = path;
        } catch(e) {}
      }
    } else if (entry.kind === 'directory') {
      await readDirectory(entry, path, target);
    }
  }
}

async function handleDrop(e) {
  e.preventDefault();
  document.getElementById('drop-zone').classList.remove('dragover');
  const items = [...e.dataTransfer.items];
  for (const item of items) {
    if (item.kind === 'file') {
      if (item.getAsFileSystemHandle) {
        const handle = await item.getAsFileSystemHandle();
        if (handle.kind === 'directory') { await loadFromHandle(handle); return; }
      }
      break;
    }
  }
}

/* ═══ PROCESS PROJECT (UNIVERSAL) ═══ */

function processProject(rootName) {
  const parsed = APP.parsed;
  parsed.classes = []; parsed.imports = []; parsed.providers = [];
  parsed.enums = []; parsed.widgets = []; parsed.functions = [];

  // Detect project type
  parsed.projectType = detectProjectType();

  // Parse project metadata files
  const pubspecPath = Object.keys(APP.files).find(p => p.endsWith('pubspec.yaml'));
  const packageJsonPath = Object.keys(APP.files).find(p => p.endsWith('package.json') && !p.includes('node_modules'));
  const requirementsPath = Object.keys(APP.files).find(p => p.endsWith('requirements.txt'));
  const pyprojectPath = Object.keys(APP.files).find(p => p.endsWith('pyproject.toml'));
  const pipfilePath = Object.keys(APP.files).find(p => p.endsWith('Pipfile'));
  const setupPyPath = Object.keys(APP.files).find(p => p.endsWith('setup.py'));

  if (pubspecPath) {
    const pub = parsePubspec(APP.files[pubspecPath].content);
    parsed.projectName = pub.name || rootName;
    parsed.dartVersion = pub.sdkVersion;
    parsed.packages = { deps: pub.deps, devDeps: pub.devDeps, flutterDeps: pub.flutterDeps };
  } else if (packageJsonPath) {
    const pkg = parsePackageJson(APP.files[packageJsonPath].content);
    parsed.projectName = pkg.name || rootName;
    parsed.dartVersion = pkg.version || '';
    parsed.packages = { deps: pkg.deps, devDeps: pkg.devDeps, flutterDeps: {} };
  } else if (requirementsPath) {
    const reqs = parseRequirementsTxt(APP.files[requirementsPath].content);
    parsed.projectName = rootName;
    parsed.packages = { deps: reqs.deps, devDeps: reqs.devDeps, flutterDeps: {} };
  } else if (pyprojectPath) {
    // Basic pyproject.toml extraction
    const content = APP.files[pyprojectPath].content;
    const nameMatch = content.match(/name\s*=\s*"([^"]+)"/);
    parsed.projectName = nameMatch ? nameMatch[1] : rootName;
    parsed.packages = { deps: {}, devDeps: {}, flutterDeps: {} };
    // Extract deps from [project.dependencies]
    const depSection = content.match(/\[(?:project\.)?dependencies\]\s*\n([\s\S]*?)(?:\n\[|$)/);
    if (depSection) {
      const depLines = depSection[1].split('\n');
      for (const line of depLines) {
        const m = line.match(/^(\w[\w-]*)\s*(?:[><=!~]|$)/);
        if (m) parsed.packages.deps[m[1]] = 'any';
      }
    }
    // Also try array format
    const depsArray = content.match(/dependencies\s*=\s*\[([\s\S]*?)\]/);
    if (depsArray) {
      const items = depsArray[1].match(/"([^"]+)"/g) || [];
      for (const item of items) {
        const name = item.replace(/"/g, '').split(/[><=!~\s]/)[0];
        if (name) parsed.packages.deps[name] = 'any';
      }
    }
  } else {
    parsed.projectName = rootName;
    parsed.packages = { deps: {}, devDeps: {}, flutterDeps: {} };
  }

  // Parse all code files (incremental — cached by content hash)
  parseAllFilesIncremental();
  buildClassDependencies();
  APP.tree = buildTree(Object.keys(APP.files));
  hideLoading();
  showApp();
}

/* ═══ UI MANAGEMENT ═══ */

function showLoading() { document.getElementById('loading-overlay').classList.add('active'); }
function hideLoading() { document.getElementById('loading-overlay').classList.remove('active'); }

function showApp() {
  document.getElementById('landing').style.display = 'none';
  document.getElementById('app').classList.add('active');
  renderAll();
}

function renderAll() {
  const p = APP.parsed;
  document.getElementById('project-name').textContent = p.projectName;
  updateTopbarStats();
  document.getElementById('bottom-tech').textContent = detectTech();
  document.getElementById('bottom-files').textContent = `${Object.keys(APP.files).length} total files`;
  // Render only the visible panel now; others render lazily on tab switch
  markPanelsDirty();
  renderPanelIfDirty(activeTabName());
}

/* ═══ TAB SWITCHING ═══ */

document.getElementById('tabbar').addEventListener('click', e => {
  const btn = e.target.closest('.tab-btn');
  if (!btn) return;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(`panel-${btn.dataset.tab}`).classList.add('active');
  const tab = btn.dataset.tab;
  // Canvas panels must re-render after becoming visible (need real dimensions)
  if (tab === 'graph') requestAnimationFrame(() => { renderGraph(); CORE.dirtyPanels.delete('graph'); });
  else if (tab === 'state') requestAnimationFrame(() => { renderStateFlow(); CORE.dirtyPanels.delete('state'); });
  else renderPanelIfDirty(tab);
});

/* ═══ NAVIGATE TO FILE ═══ */
function navigateToFile(path, lineNum) {
  document.querySelector('[data-tab="explorer"]').click();
  setTimeout(() => {
    viewFile(path, lineNum);
  }, 100);
}

/* ═══ EVENTS ═══ */

document.getElementById('btn-open-folder').addEventListener('click', openFolder);
document.getElementById('btn-browse-folder').addEventListener('click', openFolderFromBrowse);
document.getElementById('btn-load-path').addEventListener('click', loadFromPath);
document.getElementById('folder-input-hidden').addEventListener('change', handleFolderInput);
document.getElementById('btn-change-project').addEventListener('click', () => {
  document.getElementById('app').classList.remove('active');
  document.getElementById('landing').style.display = '';
});
document.getElementById('path-input').addEventListener('keydown', e => { if (e.key === 'Enter') loadFromPath(); });

const dropZone = document.getElementById('drop-zone');
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', handleDrop);

if (!window.showDirectoryPicker) {
  document.getElementById('btn-open-folder').textContent = 'Open Folder (Chrome/Edge)';
  document.getElementById('btn-open-folder').title = 'File System Access API requires Chrome, Edge, or Opera';
}

document.getElementById('btn-refresh-disk')?.addEventListener('click', refreshFromDisk);
initReopenLastProject();
