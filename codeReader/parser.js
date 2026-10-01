/* ═══════════════════════════════════════════════════
   Code Architect — parser.js
   Multi-language parser: Dart, Python, C, HTML,
   CSS, JavaScript, SQL
   ═══════════════════════════════════════════════════ */

/* ═══ LANGUAGE DETECTION ═══ */

function detectLanguage(path) {
  const ext = path.split('.').pop().toLowerCase();
  const map = {
    dart: 'dart',
    py: 'python', pyw: 'python', pyi: 'python',
    c: 'c', h: 'c', cpp: 'c', hpp: 'c', cc: 'c', cxx: 'c',
    html: 'html', htm: 'html', vue: 'html', svelte: 'html',
    css: 'css', scss: 'css', sass: 'css', less: 'css',
    js: 'javascript', jsx: 'javascript', ts: 'javascript', tsx: 'javascript', mjs: 'javascript', cjs: 'javascript',
    sql: 'sql',
    go: 'go', rs: 'rust',
    yaml: 'yaml', yml: 'yaml',
    json: 'json',
    md: 'markdown', txt: 'text',
    toml: 'toml', lock: 'text', arb: 'json',
  };
  return map[ext] || 'text';
}

function getCodeExtensions() {
  return ['dart','py','pyw','pyi','c','h','cpp','hpp','cc','cxx',
          'html','htm','vue','svelte','css','scss','sass','less',
          'js','jsx','ts','tsx','mjs','cjs','sql','go','rs',
          'java','kt','swift','rb','php','r','lua','zig','nim',
          'ex','exs','erl','hrl','sh','bat','ps1','pl','m','mm'];
}

function getParseableExtensions() {
  return getCodeExtensions().concat(['json','yaml','yml','toml','xml','md','txt','cfg','ini','env','lock','gradle','cmake']);
}

/* ═══ UNIVERSAL PARSE DISPATCHER ═══ */

function parseFile(path, content) {
  const lang = detectLanguage(path);
  switch (lang) {
    case 'dart': return parseDartFile(path, content);
    case 'python': return parsePythonFile(path, content);
    case 'c': return parseCFile(path, content);
    case 'html': return parseHtmlFile(path, content);
    case 'css': return parseCssFile(path, content);
    case 'javascript': return parseJavaScriptFile(path, content);
    case 'sql': return parseSqlFile(path, content);
    case 'go': return parseGoFile(path, content);
    case 'rust': return parseRustFile(path, content);
    default: return { imports: [], classes: [], enums: [], providers: [], functions: [] };
  }
}

/* ═══ DART PARSER (original) ═══ */

function parseDartFile(path, content) {
  const lines = content.split('\n');
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };

  for (let li = 0; li < lines.length; li++) {
    const m = lines[li].match(/^import\s+['"](.*)['"]/);
    if (m) result.imports.push({ raw: m[1], line: li + 1 });
  }

  const classRegex = /^(abstract\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+with\s+([\w\s,]+?))?(?:\s+implements\s+([\w\s,]+?))?\s*\{/gm;
  let cm;
  while ((cm = classRegex.exec(content))) {
    const cls = {
      name: cm[2], isAbstract: !!cm[1], superclass: cm[3] || null,
      mixins: cm[4] ? cm[4].split(',').map(s => s.trim()).filter(Boolean) : [],
      implements: cm[5] ? cm[5].split(',').map(s => s.trim()).filter(Boolean) : [],
      fields: [], methods: [], file: path, lang: 'dart',
      line: content.substring(0, cm.index).split('\n').length,
    };
    const sc = cls.superclass || '';
    if (sc.includes('StatelessWidget') || sc.includes('ConsumerWidget') || sc.includes('HookWidget') || sc.includes('HookConsumerWidget')) cls.widgetType = 'stateless';
    else if (sc.includes('StatefulWidget')) cls.widgetType = 'stateful';
    else if (sc.includes('State<')) cls.widgetType = 'state';
    else if (sc.includes('StateNotifier') || sc.includes('ChangeNotifier') || sc.includes('Notifier')) cls.widgetType = 'notifier';
    else if (sc.includes('Cubit') || sc.includes('Bloc')) cls.widgetType = 'bloc';
    result.classes.push(cls);
  }

  for (const cls of result.classes) {
    const startIdx = content.indexOf(`class ${cls.name}`);
    if (startIdx === -1) continue;
    let braceCount = 0, inClass = false, classBody = '';
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') { braceCount++; inClass = true; }
      if (content[i] === '}') braceCount--;
      if (inClass) classBody += content[i];
      if (inClass && braceCount === 0) break;
    }
    const fieldRegex = /(?:final\s+|static\s+(?:const\s+)?|const\s+|late\s+)?(\w[\w<>,?\s]*?)\s+(\w+)\s*[;=]/g;
    let fm;
    while ((fm = fieldRegex.exec(classBody))) {
      if (!['class','return','if','else','for','while','switch','case','void','final','var','const','await','async','try','catch'].includes(fm[1].trim())) {
        cls.fields.push({ type: fm[1].trim(), name: fm[2] });
      }
    }
    const methodRegex = /(?:@override\s+)?(?:static\s+)?(?:Future<[\w?<>]*>\s+|void\s+|[\w<>?]+\s+)(\w+)\s*\(/g;
    let mm;
    while ((mm = methodRegex.exec(classBody))) {
      if (!['if','for','while','switch','catch','class'].includes(mm[1])) {
        cls.methods.push(mm[1]);
      }
    }
    cls.fields = cls.fields.slice(0, 30);
    cls.methods = [...new Set(cls.methods)].slice(0, 30);
  }

  const enumRegex = /^enum\s+(\w+)\s*\{([^}]*)\}/gm;
  let em;
  while ((em = enumRegex.exec(content))) {
    result.enums.push({
      name: em[1],
      values: em[2].split(',').map(s => s.trim().split('(')[0].split('/')[0].replace(/\/\/.*/,'')).filter(Boolean),
      file: path,
    });
  }

  const provRegex = /final\s+(\w+)\s*=\s*(StateNotifierProvider|StateProvider|FutureProvider|StreamProvider|Provider|NotifierProvider|AsyncNotifierProvider)(?:\.family)?(?:<[^>]*>)?\s*\(/g;
  let pm;
  while ((pm = provRegex.exec(content))) {
    result.providers.push({ name: pm[1], type: pm[2], file: path, line: content.substring(0, pm.index).split('\n').length });
  }

  const blocRegex = /class\s+(\w+)\s+extends\s+(Cubit|Bloc)<(\w+)(?:,\s*(\w+))?>/g;
  let bm;
  while ((bm = blocRegex.exec(content))) {
    result.providers.push({ name: bm[1], type: bm[2], stateType: bm[3], eventType: bm[4], file: path, line: content.substring(0, bm.index).split('\n').length });
  }

  // Top-level functions (outside classes)
  const topFuncRegex = /^(?:(?:Future<[\w?<>]*>|void|[\w<>?]+)\s+)(\w+)\s*\([^)]*\)\s*(?:async\s*)?\{/gm;
  let tf;
  while ((tf = topFuncRegex.exec(content))) {
    const name = tf[1];
    const lineNum = content.substring(0, tf.index).split('\n').length;
    // check it's not inside a class
    const isInClass = result.classes.some(c => {
      const clsStart = content.indexOf(`class ${c.name}`);
      if (clsStart === -1) return false;
      let bc = 0, found = false;
      for (let i = clsStart; i < content.length; i++) {
        if (content[i] === '{') { bc++; found = true; }
        if (content[i] === '}') bc--;
        if (found && bc === 0) return tf.index > clsStart && tf.index < i;
      }
      return false;
    });
    if (!isInClass && !['if','for','while','switch','catch','class','main'].includes(name)) {
      result.functions.push({ name, file: path, line: lineNum, lang: 'dart' });
    }
  }

  return result;
}

/* ═══ PYTHON PARSER ═══ */

function parsePythonFile(path, content) {
  const lines = content.split('\n');
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };

  // Imports
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let m;
    // import module / import module as alias
    m = line.match(/^import\s+([\w.]+)/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'import' }); continue; }
    // from module import ...
    m = line.match(/^from\s+([\w.]+)\s+import\s+(.*)/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'from', names: m[2].split(',').map(s => s.trim().split(' ')[0]) }); continue; }
  }

  // Classes
  const classRegex = /^class\s+(\w+)\s*(?:\(([^)]*)\))?\s*:/gm;
  let cm;
  while ((cm = classRegex.exec(content))) {
    const lineNum = content.substring(0, cm.index).split('\n').length;
    const parents = cm[2] ? cm[2].split(',').map(s => s.trim()).filter(Boolean) : [];
    const cls = {
      name: cm[1], isAbstract: false, superclass: parents[0] || null,
      mixins: [], implements: parents.slice(1),
      fields: [], methods: [], file: path, lang: 'python',
      line: lineNum,
    };

    // Detect widget type for GUI frameworks
    for (const p of parents) {
      if (/QMainWindow|QWidget|QDialog|QFrame|QApplication/.test(p)) cls.widgetType = 'pyqt-widget';
      else if (/Tk|Frame|Toplevel|Canvas/.test(p)) cls.widgetType = 'tkinter-widget';
      else if (/View|APIView|ViewSet|ModelViewSet|GenericAPIView/.test(p)) cls.widgetType = 'django-view';
      else if (/Model|AbstractUser/.test(p)) cls.widgetType = 'django-model';
      else if (/Serializer|ModelSerializer/.test(p)) cls.widgetType = 'django-serializer';
      else if (/Resource|MethodView|Blueprint/.test(p)) cls.widgetType = 'flask-view';
      else if (/ABC|Protocol/.test(p)) cls.isAbstract = true;
    }

    // Extract methods (indented def inside class)
    const classStartLine = lineNum - 1;
    const classIndent = lines[classStartLine]?.search(/\S/) ?? 0;
    for (let j = classStartLine + 1; j < lines.length; j++) {
      const ln = lines[j];
      if (ln.trim() === '' || ln.trim().startsWith('#')) continue;
      const indent = ln.search(/\S/);
      if (indent <= classIndent && ln.trim() !== '') break;

      const defM = ln.match(/^\s+def\s+(\w+)\s*\(/);
      if (defM) {
        cls.methods.push(defM[1]);
      }
      // Fields from __init__ or class-level assignments
      const fieldM = ln.match(/^\s+self\.(\w+)\s*=/);
      if (fieldM && !cls.fields.find(f => f.name === fieldM[1])) {
        cls.fields.push({ type: 'auto', name: fieldM[1] });
      }
      const classFieldM = ln.match(/^\s{4}(\w+)\s*(?::\s*([\w\[\],\s|]+))?\s*=/);
      if (classFieldM && indent === classIndent + 4 && !classFieldM[1].startsWith('def') && !classFieldM[1].startsWith('class')) {
        if (!cls.fields.find(f => f.name === classFieldM[1])) {
          cls.fields.push({ type: classFieldM[2] || 'auto', name: classFieldM[1] });
        }
      }
    }

    cls.methods = [...new Set(cls.methods)].slice(0, 40);
    cls.fields = cls.fields.slice(0, 40);
    result.classes.push(cls);
  }

  // Top-level functions
  const funcRegex = /^def\s+(\w+)\s*\(/gm;
  let fm;
  while ((fm = funcRegex.exec(content))) {
    const name = fm[1];
    const lineNum = content.substring(0, fm.index).split('\n').length;
    result.functions.push({ name, file: path, line: lineNum, lang: 'python' });
  }

  // Detect state patterns (Django, Flask, FastAPI, etc.)
  // Django models → providers
  const djangoModelRegex = /class\s+(\w+)\s*\([^)]*Model[^)]*\)/g;
  let dm;
  while ((dm = djangoModelRegex.exec(content))) {
    result.providers.push({
      name: dm[1], type: 'DjangoModel', file: path,
      line: content.substring(0, dm.index).split('\n').length
    });
  }

  // Flask/FastAPI routes
  const routeRegex = /@(?:app|router|bp|blueprint)\s*\.\s*(route|get|post|put|delete|patch)\s*\(\s*['"]([^'"]*)['"]/g;
  let rm;
  while ((rm = routeRegex.exec(content))) {
    result.providers.push({
      name: `${rm[1].toUpperCase()} ${rm[2]}`, type: 'Route', file: path,
      line: content.substring(0, rm.index).split('\n').length,
    });
  }

  // PyQt signals
  const signalRegex = /(\w+)\s*=\s*(?:pyqtSignal|Signal)\s*\(/g;
  let sm;
  while ((sm = signalRegex.exec(content))) {
    result.providers.push({
      name: sm[1], type: 'Signal', file: path,
      line: content.substring(0, sm.index).split('\n').length,
    });
  }

  return result;
}

/* ═══ C PARSER ═══ */

function parseCFile(path, content) {
  const lines = content.split('\n');
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };

  // #include directives
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*#include\s*[<"]([^>"]+)[>"]/);
    if (m) result.imports.push({ raw: m[1], line: i + 1, type: lines[i].includes('<') ? 'system' : 'local' });
  }

  // Structs as "classes"
  const structRegex = /(?:typedef\s+)?struct\s+(\w+)\s*\{/g;
  let sm;
  while ((sm = structRegex.exec(content))) {
    const lineNum = content.substring(0, sm.index).split('\n').length;
    const cls = {
      name: sm[1], isAbstract: false, superclass: null,
      mixins: [], implements: [],
      fields: [], methods: [], file: path, lang: 'c',
      line: lineNum,
    };

    // Extract struct fields
    let braceCount = 0, inStruct = false, structBody = '';
    for (let i = sm.index; i < content.length; i++) {
      if (content[i] === '{') { braceCount++; inStruct = true; }
      if (content[i] === '}') braceCount--;
      if (inStruct) structBody += content[i];
      if (inStruct && braceCount === 0) break;
    }
    const fieldRegex = /(?:const\s+)?(\w[\w\s*]*?)\s+(\*?\w+)\s*[;,]/g;
    let fm;
    while ((fm = fieldRegex.exec(structBody))) {
      const type = fm[1].trim();
      if (!['struct','union','enum','return','if','else','for','while'].includes(type)) {
        cls.fields.push({ type, name: fm[2] });
      }
    }
    result.classes.push(cls);
  }

  // Enums
  const enumRegex = /(?:typedef\s+)?enum\s+(?:(\w+)\s*)?\{([^}]*)\}/g;
  let em;
  while ((em = enumRegex.exec(content))) {
    const name = em[1] || `enum_${result.enums.length}`;
    const values = em[2].split(',').map(s => s.trim().split('=')[0].split('/')[0].trim()).filter(Boolean);
    result.enums.push({ name, values, file: path });
  }

  // Functions
  const funcRegex = /^(?:static\s+)?(?:inline\s+)?(?:extern\s+)?(?:const\s+)?(\w[\w\s*]*?)\s+(\*?\w+)\s*\(([^)]*)\)\s*\{/gm;
  let fc;
  while ((fc = funcRegex.exec(content))) {
    const retType = fc[1].trim();
    const name = fc[2].replace(/^\*/, '');
    const lineNum = content.substring(0, fc.index).split('\n').length;
    if (!['if','for','while','switch','struct','enum','typedef'].includes(retType) && !['if','for','while','switch'].includes(name)) {
      result.functions.push({ name, file: path, line: lineNum, lang: 'c', returnType: retType });
    }
  }

  // #define as "providers" (macros)
  const defineRegex = /^#define\s+(\w+)(?:\([^)]*\))?\s+(.{1,60})/gm;
  let df;
  while ((df = defineRegex.exec(content))) {
    if (!['_H','_HPP','GUARD','INCLUDE'].some(s => df[1].includes(s))) {
      result.providers.push({
        name: df[1], type: 'Macro', file: path,
        line: content.substring(0, df.index).split('\n').length,
      });
    }
  }

  return result;
}

/* ═══ HTML PARSER ═══ */

function parseHtmlFile(path, content) {
  const lines = content.split('\n');
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };

  // Script and link imports
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let m;
    m = line.match(/<script[^>]+src=["']([^"']+)["']/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'script' }); continue; }
    m = line.match(/<link[^>]+href=["']([^"']+)["']/);
    if (m && line.includes('stylesheet')) { result.imports.push({ raw: m[1], line: i + 1, type: 'stylesheet' }); continue; }
    m = line.match(/import\s+.*from\s+['"]([^'"]+)['"]/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'es-import' }); continue; }
  }

  // Components/custom elements as "classes"
  const componentRegex = /class\s+(\w+)\s+extends\s+HTMLElement/g;
  let cm;
  while ((cm = componentRegex.exec(content))) {
    result.classes.push({
      name: cm[1], isAbstract: false, superclass: 'HTMLElement',
      mixins: [], implements: [], fields: [], methods: [],
      file: path, lang: 'html', widgetType: 'web-component',
      line: content.substring(0, cm.index).split('\n').length,
    });
  }

  // HTML structure nodes (semantic elements)
  const tagRegex = /<(header|nav|main|section|article|aside|footer|form)\b[^>]*(?:id=["']([^"']+)["'])?/gi;
  let tm;
  while ((tm = tagRegex.exec(content))) {
    const tag = tm[1].toLowerCase();
    const id = tm[2] || tag;
    result.providers.push({
      name: id, type: `<${tag}>`, file: path,
      line: content.substring(0, tm.index).split('\n').length,
    });
  }

  return result;
}

/* ═══ CSS PARSER ═══ */

function parseCssFile(path, content) {
  const lines = content.split('\n');
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };

  // @import
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/@import\s+(?:url\(\s*)?['"]?([^'"\s);]+)/);
    if (m) result.imports.push({ raw: m[1], line: i + 1, type: 'css-import' });
  }

  // CSS custom properties as "providers"
  const varRegex = /(--[\w-]+)\s*:\s*([^;]{1,60})/g;
  let vm;
  while ((vm = varRegex.exec(content))) {
    result.providers.push({
      name: vm[1], type: 'CSS Variable', value: vm[2].trim(), file: path,
      line: content.substring(0, vm.index).split('\n').length,
    });
  }

  // Major selectors as "classes" (class selectors)
  const selectorSet = new Set();
  const selectorRegex = /^\.([a-zA-Z][\w-]*)\s*(?:,|\{)/gm;
  let sr;
  while ((sr = selectorRegex.exec(content))) {
    if (!selectorSet.has(sr[1])) {
      selectorSet.add(sr[1]);
      result.classes.push({
        name: `.${sr[1]}`, isAbstract: false, superclass: null,
        mixins: [], implements: [], fields: [], methods: [],
        file: path, lang: 'css',
        line: content.substring(0, sr.index).split('\n').length,
      });
    }
  }

  // @keyframes as "functions"
  const kfRegex = /@keyframes\s+([\w-]+)/g;
  let kf;
  while ((kf = kfRegex.exec(content))) {
    result.functions.push({ name: `@keyframes ${kf[1]}`, file: path, line: content.substring(0, kf.index).split('\n').length, lang: 'css' });
  }

  // @media queries
  const mediaRegex = /@media\s+([^{]{1,60})/g;
  let mq;
  while ((mq = mediaRegex.exec(content))) {
    result.functions.push({ name: `@media ${mq[1].trim()}`, file: path, line: content.substring(0, mq.index).split('\n').length, lang: 'css' });
  }

  return result;
}

/* ═══ JAVASCRIPT / TYPESCRIPT PARSER ═══ */

function parseJavaScriptFile(path, content) {
  const lines = content.split('\n');
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };
  const isTS = /\.tsx?$/.test(path);

  // ES6 imports + require
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    let m;
    m = line.match(/import\s+.*?from\s+['"]([^'"]+)['"]/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'es-import' }); continue; }
    m = line.match(/import\s+['"]([^'"]+)['"]/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'es-import' }); continue; }
    m = line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/);
    if (m) { result.imports.push({ raw: m[1], line: i + 1, type: 'require' }); continue; }
  }

  // Classes
  const classRegex = /(?:export\s+)?(?:default\s+)?class\s+(\w+)(?:\s+extends\s+(\w+(?:\.\w+)?))?/g;
  let cm;
  while ((cm = classRegex.exec(content))) {
    const lineNum = content.substring(0, cm.index).split('\n').length;
    const cls = {
      name: cm[1], isAbstract: false, superclass: cm[2] || null,
      mixins: [], implements: [], fields: [], methods: [],
      file: path, lang: 'javascript', line: lineNum,
    };

    // Detect React/Vue component type
    if (cm[2]) {
      if (/Component|PureComponent/.test(cm[2])) cls.widgetType = 'react-class';
    }

    // Extract methods from class body
    const startIdx = cm.index;
    let braceCount = 0, inClass = false, classBody = '';
    for (let i = startIdx; i < content.length; i++) {
      if (content[i] === '{') { braceCount++; inClass = true; }
      if (content[i] === '}') braceCount--;
      if (inClass) classBody += content[i];
      if (inClass && braceCount === 0) break;
    }

    const methodRegex = /(?:async\s+)?(?:static\s+)?(?:get\s+|set\s+)?(\w+)\s*\([^)]*\)\s*\{/g;
    let mm;
    while ((mm = methodRegex.exec(classBody))) {
      if (!['if','for','while','switch','catch','function','return'].includes(mm[1])) {
        cls.methods.push(mm[1]);
      }
    }

    cls.methods = [...new Set(cls.methods)].slice(0, 40);
    result.classes.push(cls);
  }

  // Top-level functions (named function declarations + arrow/const)
  const namedFuncRegex = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s+(\w+)\s*\(/gm;
  let nf;
  while ((nf = namedFuncRegex.exec(content))) {
    const lineNum = content.substring(0, nf.index).split('\n').length;
    const isInClass = result.classes.some(c => {
      const ci = content.indexOf(`class ${c.name}`);
      if (ci === -1) return false;
      let bc = 0, f = false;
      for (let i = ci; i < content.length; i++) {
        if (content[i] === '{') { bc++; f = true; }
        if (content[i] === '}') bc--;
        if (f && bc === 0) return nf.index > ci && nf.index < i;
      }
      return false;
    });
    if (!isInClass) result.functions.push({ name: nf[1], file: path, line: lineNum, lang: 'javascript' });
  }

  // Arrow function / const func
  const arrowRegex = /^(?:export\s+)?(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(?/gm;
  let af;
  while ((af = arrowRegex.exec(content))) {
    const restOfLine = content.substring(af.index + af[0].length, content.indexOf('\n', af.index));
    if (restOfLine.includes('=>') || restOfLine.includes(') =') || restOfLine.includes(') {')) {
      const lineNum = content.substring(0, af.index).split('\n').length;
      result.functions.push({ name: af[1], file: path, line: lineNum, lang: 'javascript' });
    }
  }

  // React functional components (const X = () => { ... return <JSX ... })
  // These become "providers" of type ReactComponent
  const reactCompRegex = /(?:export\s+)?(?:const|function)\s+([A-Z]\w+)\s*(?:=\s*(?:\([^)]*\)|[\w]+)\s*=>|(?:\([^)]*\))\s*(?:=>|\{))/gm;
  let rc;
  while ((rc = reactCompRegex.exec(content))) {
    const name = rc[1];
    const after = content.substring(rc.index, Math.min(content.length, rc.index + 500));
    if (after.includes('return') || after.includes('jsx') || after.includes('<') || after.includes('React')) {
      // Already added as function, tag as React component
      const existing = result.functions.find(f => f.name === name);
      if (existing) existing.isComponent = true;
      result.providers.push({
        name, type: 'ReactComponent', file: path,
        line: content.substring(0, rc.index).split('\n').length,
      });
    }
  }

  // Express.js routes
  const expressRegex = /(?:app|router)\s*\.\s*(get|post|put|delete|patch|use)\s*\(\s*['"]([^'"]*)['"]/g;
  let er;
  while ((er = expressRegex.exec(content))) {
    result.providers.push({
      name: `${er[1].toUpperCase()} ${er[2]}`, type: 'ExpressRoute', file: path,
      line: content.substring(0, er.index).split('\n').length,
    });
  }

  // TypeScript interfaces & enums
  if (isTS) {
    const ifaceRegex = /(?:export\s+)?interface\s+(\w+)(?:\s+extends\s+([\w,\s]+))?\s*\{/g;
    let ir;
    while ((ir = ifaceRegex.exec(content))) {
      result.classes.push({
        name: ir[1], isAbstract: true, superclass: ir[2]?.split(',')[0]?.trim() || null,
        mixins: [], implements: [], fields: [], methods: [],
        file: path, lang: 'javascript', line: content.substring(0, ir.index).split('\n').length,
        widgetType: 'interface',
      });
    }

    const tsEnumRegex = /(?:export\s+)?enum\s+(\w+)\s*\{([^}]*)\}/g;
    let te;
    while ((te = tsEnumRegex.exec(content))) {
      result.enums.push({
        name: te[1],
        values: te[2].split(',').map(s => s.trim().split('=')[0].trim()).filter(Boolean),
        file: path,
      });
    }
  }

  return result;
}

/* ═══ SQL PARSER ═══ */

function parseSqlFile(path, content) {
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };
  const upper = content.toUpperCase();

  // Tables as "classes"
  const tableRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:TEMP(?:ORARY)?\s+)?TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s*\(/gi;
  let tm;
  while ((tm = tableRegex.exec(content))) {
    const lineNum = content.substring(0, tm.index).split('\n').length;
    const cls = {
      name: tm[1], isAbstract: false, superclass: null,
      mixins: [], implements: [], fields: [], methods: [],
      file: path, lang: 'sql', line: lineNum,
    };

    // Extract columns as fields
    let braceCount = 0, inTable = false, tableBody = '';
    for (let i = tm.index + tm[0].length - 1; i < content.length; i++) {
      if (content[i] === '(') { braceCount++; inTable = true; }
      if (content[i] === ')') { braceCount--; }
      if (inTable) tableBody += content[i];
      if (inTable && braceCount === 0) break;
    }

    const colLines = tableBody.replace(/^\(|\)$/g, '').split(',');
    for (const col of colLines) {
      const cm = col.trim().match(/^[`"']?(\w+)[`"']?\s+(\w+)/);
      if (cm && !['PRIMARY','UNIQUE','INDEX','CONSTRAINT','FOREIGN','CHECK','KEY'].includes(cm[1].toUpperCase())) {
        cls.fields.push({ type: cm[2], name: cm[1] });
      }
    }
    result.classes.push(cls);
  }

  // Views as "classes"
  const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+[`"']?(\w+)[`"']?\s+AS/gi;
  let vr;
  while ((vr = viewRegex.exec(content))) {
    result.classes.push({
      name: vr[1], isAbstract: false, superclass: 'VIEW',
      mixins: [], implements: [], fields: [], methods: [],
      file: path, lang: 'sql', widgetType: 'sql-view',
      line: content.substring(0, vr.index).split('\n').length,
    });
  }

  // Stored procedures/functions as functions
  const spRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+[`"']?(\w+)[`"']?\s*\(/gi;
  let sp;
  while ((sp = spRegex.exec(content))) {
    result.functions.push({
      name: sp[1], file: path,
      line: content.substring(0, sp.index).split('\n').length,
      lang: 'sql',
    });
  }

  // Triggers
  const triggerRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+[`"']?(\w+)[`"']?/gi;
  let tr;
  while ((tr = triggerRegex.exec(content))) {
    result.providers.push({
      name: tr[1], type: 'Trigger', file: path,
      line: content.substring(0, tr.index).split('\n').length,
    });
  }

  // Indexes
  const idxRegex = /CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?[`"']?(\w+)[`"']?\s+ON\s+[`"']?(\w+)[`"']?/gi;
  let ir;
  while ((ir = idxRegex.exec(content))) {
    result.providers.push({
      name: ir[1], type: 'Index', file: path,
      line: content.substring(0, ir.index).split('\n').length,
    });
  }

  // Foreign key references as imports
  const fkRegex = /REFERENCES\s+[`"']?(\w+)[`"']?\s*\(/gi;
  let fk;
  while ((fk = fkRegex.exec(content))) {
    result.imports.push({
      raw: fk[1], line: content.substring(0, fk.index).split('\n').length,
      type: 'fk-reference',
    });
  }

  return result;
}

/* ═══ GO PARSER ═══ */

function parseGoFile(path, content) {
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };
  const lineOf = idx => content.substring(0, idx).split('\n').length;

  // Single imports + import blocks
  const singleImp = /^import\s+(?:\w+\s+)?"([^"]+)"/gm;
  let m;
  while ((m = singleImp.exec(content))) result.imports.push({ raw: m[1], line: lineOf(m.index), type: 'system' });
  const blockImp = /^import\s*\(([\s\S]*?)\)/gm;
  while ((m = blockImp.exec(content))) {
    const blockStart = lineOf(m.index);
    m[1].split('\n').forEach((ln, i) => {
      const im = ln.match(/"([^"]+)"/);
      if (im) result.imports.push({ raw: im[1], line: blockStart + i, type: 'system' });
    });
  }

  // Structs + interfaces → classes
  const typeRegex = /^type\s+(\w+)\s+(struct|interface)\s*\{/gm;
  while ((m = typeRegex.exec(content))) {
    const cls = { name: m[1], isAbstract: m[2] === 'interface', superclass: null,
      mixins: [], implements: [], fields: [], methods: [], file: path, lang: 'go', line: lineOf(m.index) };
    // Struct fields
    let bc = 0, body = '';
    for (let i = m.index + m[0].length - 1; i < content.length; i++) {
      if (content[i] === '{') bc++;
      if (content[i] === '}') bc--;
      body += content[i];
      if (bc === 0) break;
    }
    const fieldRegex = /^\s+(\w+)\s+([\w\[\]\*\.]+)/gm;
    let fm;
    while ((fm = fieldRegex.exec(body))) {
      if (fm[1] !== 'func') cls.fields.push({ type: fm[2], name: fm[1] });
    }
    cls.fields = cls.fields.slice(0, 40);
    result.classes.push(cls);
  }

  // Methods (receiver funcs) attach to structs; plain funcs → functions
  const funcRegex = /^func\s+(?:\((\w+)\s+\*?(\w+)\)\s+)?(\w+)\s*\(([^)]*)\)/gm;
  while ((m = funcRegex.exec(content))) {
    if (m[2]) {
      const cls = result.classes.find(c => c.name === m[2]);
      if (cls) cls.methods.push(m[3]);
    } else if (m[3] !== 'init') {
      result.functions.push({ name: m[3], file: path, line: lineOf(m.index), lang: 'go',
        params: m[4].split(',').map(s => s.trim()).filter(Boolean) });
    }
  }

  // Consts blocks with iota → enums
  const constBlock = /const\s*\(([\s\S]*?)\)/g;
  while ((m = constBlock.exec(content))) {
    if (m[1].includes('iota')) {
      const values = m[1].split('\n').map(l => (l.match(/^\s*(\w+)/) || [])[1]).filter(v => v && v !== 'iota');
      if (values.length) result.enums.push({ name: values[0] + 'Enum', values, file: path });
    }
  }
  return result;
}

/* ═══ RUST PARSER ═══ */

function parseRustFile(path, content) {
  const result = { imports: [], classes: [], enums: [], providers: [], functions: [] };
  const lineOf = idx => content.substring(0, idx).split('\n').length;
  let m;

  const useRegex = /^use\s+([\w:]+)/gm;
  while ((m = useRegex.exec(content))) result.imports.push({ raw: m[1], line: lineOf(m.index), type: 'system' });

  // Structs, traits → classes
  const structRegex = /^(?:pub\s+)?(struct|trait)\s+(\w+)/gm;
  while ((m = structRegex.exec(content))) {
    result.classes.push({ name: m[2], isAbstract: m[1] === 'trait', superclass: null,
      mixins: [], implements: [], fields: [], methods: [], file: path, lang: 'rust', line: lineOf(m.index) });
  }

  // impl blocks → attach methods (impl Trait for X also captured)
  const implRegex = /^impl(?:<[^>]*>)?\s+(?:(\w+)\s+for\s+)?(\w+)/gm;
  while ((m = implRegex.exec(content))) {
    const cls = result.classes.find(c => c.name === m[2]);
    if (!cls) continue;
    if (m[1] && !cls.implements.includes(m[1])) cls.implements.push(m[1]);
    let bc = 0, started = false, body = '';
    for (let i = m.index; i < content.length; i++) {
      if (content[i] === '{') { bc++; started = true; }
      if (content[i] === '}') bc--;
      if (started) body += content[i];
      if (started && bc === 0) break;
    }
    const fnRegex = /fn\s+(\w+)/g;
    let fnM;
    while ((fnM = fnRegex.exec(body))) cls.methods.push(fnM[1]);
    cls.methods = [...new Set(cls.methods)].slice(0, 40);
  }

  // Enums
  const enumRegex = /^(?:pub\s+)?enum\s+(\w+)\s*\{([^}]*)\}/gm;
  while ((m = enumRegex.exec(content))) {
    result.enums.push({ name: m[1],
      values: m[2].split(',').map(s => s.trim().split('(')[0].split('{')[0]).filter(Boolean), file: path });
  }

  // Top-level fns (not inside impl — approximation: column 0 or pub at column 0)
  const fnRegex = /^(?:pub\s+)?(?:async\s+)?fn\s+(\w+)\s*\(([^)]*)\)/gm;
  while ((m = fnRegex.exec(content))) {
    result.functions.push({ name: m[1], file: path, line: lineOf(m.index), lang: 'rust',
      params: m[2].split(',').map(s => s.trim()).filter(Boolean) });
  }
  return result;
}

/* ═══ PUBSPEC / REQUIREMENTS / PACKAGE.JSON PARSERS ═══ */

function parsePubspec(content) {
  const result = { name: '', sdkVersion: '', deps: {}, devDeps: {}, flutterDeps: {} };
  try {
    const lines = content.split('\n');
    let section = '', indent = 0;
    for (const line of lines) {
      const trimmed = line.trimEnd();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const currentIndent = line.length - line.trimStart().length;
      if (trimmed.startsWith('name:')) result.name = trimmed.split(':')[1]?.trim().replace(/['"]/g, '') || '';
      if (trimmed.match(/^environment:/)) { section = 'env'; indent = currentIndent; continue; }
      if (trimmed.match(/^dependencies:/)) { section = 'deps'; indent = currentIndent; continue; }
      if (trimmed.match(/^dev_dependencies:/)) { section = 'devDeps'; indent = currentIndent; continue; }
      if (trimmed.match(/^flutter:/)) { section = 'flutter'; indent = currentIndent; continue; }
      if (currentIndent <= indent && trimmed.includes(':') && !trimmed.startsWith(' ')) { section = ''; continue; }
      if (section === 'env' && trimmed.includes('sdk:')) {
        result.sdkVersion = trimmed.split(':').slice(1).join(':').trim().replace(/['"]/g, '');
      }
      if ((section === 'deps' || section === 'devDeps') && currentIndent > indent) {
        const match = trimmed.match(/^\s+(\w[\w_-]*)\s*:/);
        if (match) {
          const pkg = match[1];
          const ver = trimmed.split(':').slice(1).join(':').trim().replace(/['"]/g, '') || 'any';
          if (pkg === 'flutter' || pkg === 'flutter_localizations') result.flutterDeps[pkg] = ver;
          else if (section === 'deps') result.deps[pkg] = ver;
          else result.devDeps[pkg] = ver;
        }
      }
    }
  } catch(e) {}
  return result;
}

function parseRequirementsTxt(content) {
  const deps = {}, devDeps = {};
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-')) continue;
    const m = trimmed.match(/^([\w-]+)(?:\[[\w,]+\])?\s*(?:[><=!~]+\s*([\d.*]+))?/);
    if (m) deps[m[1]] = m[2] || 'any';
  }
  return { deps, devDeps };
}

function parsePackageJson(content) {
  try {
    const pkg = JSON.parse(content);
    return {
      name: pkg.name || '',
      version: pkg.version || '',
      deps: pkg.dependencies || {},
      devDeps: pkg.devDependencies || {},
      scripts: pkg.scripts || {},
    };
  } catch(e) {
    return { name: '', version: '', deps: {}, devDeps: {}, scripts: {} };
  }
}

/* ═══ DEPENDENCY BUILDER (universal) ═══ */

function buildClassDependencies() {
  const p = APP.parsed;
  p.classImports = [];
  p.funcImports = [];
  const classFileMap = {};
  for (const cls of p.classes) classFileMap[cls.name] = cls.file;

  const codeFiles = Object.keys(APP.files).filter(f => {
    const ext = f.split('.').pop().toLowerCase();
    return getCodeExtensions().includes(ext);
  });

  for (const filePath of codeFiles) {
    const content = APP.files[filePath].content;
    const lang = detectLanguage(filePath);
    const fileClasses = p.classes.filter(c => c.file === filePath);

    for (const cls of fileClasses) {
      // Get class body
      let classBody = '';
      if (lang === 'python') {
        // Python: indentation-based class body
        const lines = content.split('\n');
        const classLine = cls.line - 1;
        const classIndent = lines[classLine]?.search(/\S/) ?? 0;
        for (let j = classLine + 1; j < lines.length; j++) {
          if (lines[j].trim() === '' || lines[j].trim().startsWith('#')) { classBody += lines[j] + '\n'; continue; }
          const indent = lines[j].search(/\S/);
          if (indent <= classIndent) break;
          classBody += lines[j] + '\n';
        }
      } else if (lang === 'sql') {
        // SQL: use content around the table definition
        const startIdx = content.indexOf(cls.name);
        classBody = content.substring(Math.max(0, startIdx - 50), Math.min(content.length, startIdx + 500));
      } else if (lang === 'css') {
        const ruleName = cls.name.replace(/^\./, '');
        const startIdx = content.indexOf(ruleName);
        if (startIdx !== -1) {
          let bc = 0, inRule = false;
          for (let i = startIdx; i < content.length; i++) {
            if (content[i] === '{') { bc++; inRule = true; }
            if (content[i] === '}') bc--;
            if (inRule) classBody += content[i];
            if (inRule && bc === 0) break;
          }
        }
      } else {
        // Brace-delimited languages (Dart, C, JS)
        const searchTerm = lang === 'c' ? `struct ${cls.name}` : `class ${cls.name}`;
        const startIdx = content.indexOf(searchTerm);
        if (startIdx === -1) continue;
        let braceCount = 0, inClass = false;
        for (let i = startIdx; i < content.length; i++) {
          if (content[i] === '{') { braceCount++; inClass = true; }
          if (content[i] === '}') braceCount--;
          if (inClass) classBody += content[i];
          if (inClass && braceCount === 0) break;
        }
      }

      // Find references to other classes — token-set membership instead of per-class regex
      const bodyTokens = _tokenSet(classBody);
      for (const otherCls of p.classes) {
        if (otherCls.name === cls.name && otherCls.file === cls.file) continue;
        const searchName = otherCls.name.replace(/^\./, '');
        if (searchName.length < 2) continue;
        if (bodyTokens.has(searchName)) {
          p.classImports.push({ fromFile: cls.file, fromClass: cls.name, toFile: otherCls.file, toClass: otherCls.name });
        }
      }

      // Method-level dependencies
      for (const method of cls.methods) {
        const methodBody = extractMethodBody(classBody, method, lang);
        if (!methodBody) continue;
        const methodTokens = _tokenSet(methodBody);
        for (const otherCls of p.classes) {
          if (otherCls.name === cls.name && otherCls.file === cls.file) continue;
          const searchName = otherCls.name.replace(/^\./, '');
          if (searchName.length < 2) continue;
          if (methodTokens.has(searchName)) {
            p.funcImports.push({ fromFile: cls.file, fromClass: cls.name, fromFunc: method, toFile: otherCls.file, toClass: otherCls.name });
          }
        }
      }
    }

    // Also build cross-file function dependencies (body extracted ONCE per fn, not per class)
    const fileFunctions = p.functions.filter(fn => fn.file === filePath);
    for (const fn of fileFunctions) {
      const fnBody = getFunctionBody(content, fn, lang);
      if (!fnBody) continue;
      const fnTokens = _tokenSet(fnBody);
      for (const otherCls of p.classes) {
        if (otherCls.file === filePath) continue;
        const searchName = otherCls.name.replace(/^\./, '');
        if (searchName.length < 2) continue;
        if (fnTokens.has(searchName)) {
          p.funcImports.push({ fromFile: filePath, fromClass: fn.name, fromFunc: fn.name, toFile: otherCls.file, toClass: otherCls.name });
        }
      }
    }
  }

  // Deduplicate
  const seen = new Set();
  p.classImports = p.classImports.filter(e => {
    const key = `${e.fromClass}->${e.toClass}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
  const seenFunc = new Set();
  p.funcImports = p.funcImports.filter(e => {
    const key = `${e.fromClass}.${e.fromFunc}->${e.toClass}`;
    if (seenFunc.has(key)) return false;
    seenFunc.add(key); return true;
  });
}

function extractMethodBody(classBody, methodName, lang) {
  if (lang === 'python') {
    const lines = classBody.split('\n');
    let methodBody = '', inMethod = false, methodIndent = -1;
    for (const line of lines) {
      if (!inMethod) {
        const m = line.match(new RegExp(`\\bdef\\s+${escapeRegexParser(methodName)}\\s*\\(`));
        if (m) {
          inMethod = true;
          methodIndent = line.search(/\S/);
          methodBody += line + '\n';
        }
      } else {
        if (line.trim() === '' || line.trim().startsWith('#')) { methodBody += line + '\n'; continue; }
        const indent = line.search(/\S/);
        if (indent <= methodIndent) break;
        methodBody += line + '\n';
      }
    }
    return methodBody || null;
  } else {
    // Brace-delimited
    const methodIdx = classBody.indexOf(methodName + '(');
    if (methodIdx === -1) return null;
    let mBrace = 0, inMethod = false, methodBody = '';
    for (let i = methodIdx; i < classBody.length; i++) {
      if (classBody[i] === '{') { mBrace++; inMethod = true; }
      if (classBody[i] === '}') mBrace--;
      if (inMethod) methodBody += classBody[i];
      if (inMethod && mBrace === 0) break;
    }
    return methodBody || null;
  }
}

function getFunctionBody(content, fn, lang) {
  if (lang === 'python') {
    const lines = content.split('\n');
    const startLine = fn.line - 1;
    let body = '', indent = lines[startLine]?.search(/\S/) ?? 0;
    for (let j = startLine + 1; j < lines.length; j++) {
      if (lines[j].trim() === '' || lines[j].trim().startsWith('#')) { body += lines[j] + '\n'; continue; }
      if (lines[j].search(/\S/) <= indent) break;
      body += lines[j] + '\n';
    }
    return body || null;
  } else {
    const searchRegex = new RegExp(`(?:function\\s+)?${escapeRegexParser(fn.name)}\\s*\\(`);
    const m = searchRegex.exec(content);
    if (!m) return null;
    let bc = 0, inF = false, body = '';
    for (let i = m.index; i < content.length; i++) {
      if (content[i] === '{') { bc++; inF = true; }
      if (content[i] === '}') bc--;
      if (inF) body += content[i];
      if (inF && bc === 0) break;
    }
    return body || null;
  }
}

function escapeRegexParser(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Extract all identifier-like tokens once — replaces O(classes) regex scans per body */
function _tokenSet(text) {
  const s = new Set();
  const re = /[A-Za-z_$][\w$-]*/g;
  let m;
  while ((m = re.exec(text))) s.add(m[0]);
  return s;
}

/* ═══ IMPORT RESOLUTION ═══ */

function resolveImport(dir, imp) {
  const parts = imp.split('/');
  let base = dir.split('/');
  for (const p of parts) {
    if (p === '..') base.pop();
    else if (p !== '.') base.push(p);
  }
  return base.join('/');
}

function resolveImportUniversal(dir, imp, lang) {
  // For Python, convert dotted imports to path
  if (lang === 'python') {
    if (imp.startsWith('.')) {
      // Relative import
      const dots = imp.match(/^\.+/)[0].length;
      const parts = dir.split('/');
      for (let i = 1; i < dots; i++) parts.pop();
      const rest = imp.slice(dots).replace(/\./g, '/');
      if (rest) parts.push(rest);
      // Try .py extension
      const resolved = parts.join('/') + '.py';
      if (APP.files[resolved]) return resolved;
      // Try as package (__init__.py)
      const pkg = parts.join('/') + '/__init__.py';
      if (APP.files[pkg]) return pkg;
      return null;
    } else {
      // Absolute import — try to find in project
      const pathPart = imp.replace(/\./g, '/');
      const candidates = [
        pathPart + '.py',
        pathPart + '/__init__.py',
      ];
      for (const c of candidates) {
        // Try from various roots
        for (const key of Object.keys(APP.files)) {
          if (key.endsWith(c)) return key;
        }
      }
      return null;
    }
  }

  // For JS/TS, resolve relative imports
  if (lang === 'javascript') {
    if (!imp.startsWith('.') && !imp.startsWith('/')) return null; // node_modules
    const resolved = resolveImport(dir, imp);
    // Try exact, then with extensions
    const exts = ['', '.js', '.jsx', '.ts', '.tsx', '/index.js', '/index.ts', '/index.jsx', '/index.tsx'];
    for (const ext of exts) {
      if (APP.files[resolved + ext]) return resolved + ext;
    }
    return null;
  }

  // For C, resolve #include "local.h"
  if (lang === 'c') {
    const resolved = resolveImport(dir, imp);
    if (APP.files[resolved]) return resolved;
    // Search all files for matching name
    const name = imp.split('/').pop();
    for (const key of Object.keys(APP.files)) {
      if (key.endsWith('/' + name) || key === name) return key;
    }
    return null;
  }

  // For CSS @import
  if (lang === 'css') {
    const resolved = resolveImport(dir, imp.replace(/['"]/g, ''));
    if (APP.files[resolved]) return resolved;
    return null;
  }

  // For HTML references (href/src), try relative resolution
  if (lang === 'html') {
    const resolved = resolveImport(dir, imp);
    if (APP.files[resolved]) return resolved;
    return null;
  }

  // Default (Dart style)
  return resolveImport(dir, imp);
}

/* ═══ TREE BUILDER ═══ */

function buildTree(paths) {
  const root = { name: '', children: {}, files: [] };
  for (const path of paths) {
    const parts = path.split('/');
    let node = root;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!node.children[parts[i]]) node.children[parts[i]] = { name: parts[i], children: {}, files: [] };
      node = node.children[parts[i]];
    }
    node.files.push({ name: parts[parts.length - 1], path });
  }
  return root;
}

/* ═══ TECHNOLOGY DETECTION ═══ */

function detectTech() {
  const projectType = APP.parsed.projectType || 'unknown';

  if (projectType === 'dart') {
    const deps = { ...APP.parsed.packages.deps, ...APP.parsed.packages.flutterDeps };
    const techs = [];
    if (deps.flutter_riverpod || deps.riverpod || deps.hooks_riverpod) techs.push('Riverpod');
    if (deps.flutter_bloc || deps.bloc) techs.push('Bloc');
    if (deps.provider) techs.push('Provider');
    if (deps.get || deps.get_it) techs.push('GetX/GetIt');
    if (deps.sqflite) techs.push('SQLite');
    if (deps.hive) techs.push('Hive');
    if (deps.firebase_core) techs.push('Firebase');
    if (deps.dio) techs.push('Dio');
    if (deps.http) techs.push('HTTP');
    if (deps.go_router) techs.push('GoRouter');
    if (deps.auto_route) techs.push('AutoRoute');
    return techs.join(' · ') || 'Flutter';
  }

  if (projectType === 'python') {
    const deps = APP.parsed.packages.deps;
    const techs = [];
    if (deps.django || deps.Django) techs.push('Django');
    if (deps.flask || deps.Flask) techs.push('Flask');
    if (deps.fastapi || deps.FastAPI) techs.push('FastAPI');
    if (deps['PyQt6'] || deps['PyQt5'] || deps.pyqt6 || deps.pyqt5) techs.push('PyQt');
    if (deps.tkinter) techs.push('Tkinter');
    if (deps.numpy) techs.push('NumPy');
    if (deps.pandas) techs.push('Pandas');
    if (deps.tensorflow || deps.keras) techs.push('TensorFlow');
    if (deps.sqlalchemy || deps.SQLAlchemy) techs.push('SQLAlchemy');
    if (deps.celery) techs.push('Celery');
    if (deps.requests) techs.push('Requests');
    if (deps.pytest) techs.push('Pytest');
    return techs.join(' · ') || 'Python';
  }

  if (projectType === 'javascript') {
    const deps = APP.parsed.packages.deps;
    const techs = [];
    if (deps.react || deps['react-dom']) techs.push('React');
    if (deps.vue) techs.push('Vue');
    if (deps.angular || deps['@angular/core']) techs.push('Angular');
    if (deps.svelte) techs.push('Svelte');
    if (deps.next) techs.push('Next.js');
    if (deps.express) techs.push('Express');
    if (deps.fastify) techs.push('Fastify');
    if (deps.nestjs || deps['@nestjs/core']) techs.push('NestJS');
    if (deps.prisma || deps['@prisma/client']) techs.push('Prisma');
    if (deps.mongoose) techs.push('Mongoose');
    if (deps.typescript) techs.push('TypeScript');
    if (deps.tailwindcss) techs.push('Tailwind');
    if (deps.electron) techs.push('Electron');
    return techs.join(' · ') || 'JavaScript';
  }

  if (projectType === 'c') return 'C/C++';
  if (projectType === 'web') return 'HTML/CSS/JS';
  if (projectType === 'sql') return 'SQL';
  if (projectType === 'mixed') {
    const langs = new Set(Object.keys(APP.files).map(f => detectLanguage(f)).filter(l => l !== 'text' && l !== 'unknown'));
    return [...langs].slice(0, 4).join(' · ') || 'Mixed';
  }

  return 'Project';
}

function detectProjectType() {
  const files = Object.keys(APP.files);
  const extCounts = {};
  for (const f of files) {
    const ext = f.split('.').pop().toLowerCase();
    extCounts[ext] = (extCounts[ext] || 0) + 1;
  }

  // Check for specific project files
  if (files.some(f => f.endsWith('pubspec.yaml'))) return 'dart';
  if (files.some(f => f.endsWith('package.json'))) return 'javascript';
  if (files.some(f => f.endsWith('requirements.txt') || f.endsWith('setup.py') || f.endsWith('pyproject.toml') || f.endsWith('Pipfile'))) return 'python';
  if (files.some(f => f.endsWith('Makefile') || f.endsWith('CMakeLists.txt') || f.endsWith('.vcxproj'))) return 'c';

  // Count by extension
  const dartCount = (extCounts.dart || 0);
  const pyCount = (extCounts.py || 0) + (extCounts.pyw || 0);
  const jsCount = (extCounts.js || 0) + (extCounts.jsx || 0) + (extCounts.ts || 0) + (extCounts.tsx || 0);
  const cCount = (extCounts.c || 0) + (extCounts.h || 0) + (extCounts.cpp || 0) + (extCounts.hpp || 0);
  const htmlCount = (extCounts.html || 0) + (extCounts.htm || 0);
  const cssCount = (extCounts.css || 0) + (extCounts.scss || 0);
  const sqlCount = (extCounts.sql || 0);

  const max = Math.max(dartCount, pyCount, jsCount, cCount, htmlCount + cssCount, sqlCount);
  if (max === 0) return 'unknown';
  if (max === dartCount) return 'dart';
  if (max === pyCount) return 'python';
  if (max === jsCount) return 'javascript';
  if (max === cCount) return 'c';
  if (max === sqlCount) return 'sql';
  if (max === htmlCount + cssCount) return 'web';
  return 'mixed';
}

/* ═══ HELPERS ═══ */

function escapeHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ═══ UNIVERSAL SYNTAX HIGHLIGHTER ═══ */
/* Token classes: syn-kw (keywords/control), syn-type (types/classes), syn-fn (function names),
   syn-str (strings), syn-num (numbers), syn-comment (comments), syn-annotation (decorators/preprocessor),
   syn-op (operators/punctuation), syn-const (constants/builtins), syn-param (params/variables),
   syn-tag (HTML tags), syn-attr (HTML/CSS attributes), syn-prop (CSS properties), syn-sel (CSS selectors),
   syn-regex (regex), syn-import (import paths) */

function highlightCode(line, filePath) {
  const lang = filePath ? detectLanguage(filePath) : 'text';
  switch (lang) {
    case 'dart': return highlightDart(line);
    case 'python': return highlightPython(line);
    case 'c': return highlightC(line);
    case 'javascript': return highlightJS(line);
    case 'html': return highlightHTML(line);
    case 'css': return highlightCSS(line);
    case 'sql': return highlightSQL(line);
    case 'go': return highlightGo(line);
    case 'rust': return highlightRust(line);
    default: return line;
  }
}

function highlightGo(line) {
  if (line.trimStart().startsWith('//')) return `<span class="syn-comment">${line}</span>`;
  line = line.replace(/(&quot;[^&]*?&quot;|`[^`]*`)/g, '<span class="syn-str">$1</span>');
  return _applyTokens(line, [
    [/\b(func|type|struct|interface|package|import|return|if|else|for|range|switch|case|default|go|defer|chan|select|map|var|const|break|continue|fallthrough|goto)\b/g, 'syn-kw'],
    [/\b(string|int|int8|int16|int32|int64|uint|uint8|uint16|uint32|uint64|float32|float64|bool|byte|rune|error|any)\b/g, 'syn-type'],
    [/\b(true|false|nil|iota)\b/g, 'syn-const'],
    [/\b(\d+\.?\d*)\b/g, 'syn-num'],
  ]);
}

function highlightRust(line) {
  if (line.trimStart().startsWith('//')) return `<span class="syn-comment">${line}</span>`;
  line = line.replace(/(&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  line = line.replace(/(#\[[^\]]*\])/g, '<span class="syn-annotation">$1</span>');
  return _applyTokens(line, [
    [/\b(fn|let|mut|pub|struct|enum|trait|impl|for|in|if|else|match|while|loop|return|use|mod|crate|self|Self|super|async|await|move|ref|where|dyn|static|const|unsafe|type|as|break|continue)\b/g, 'syn-kw'],
    [/\b(String|str|i8|i16|i32|i64|i128|u8|u16|u32|u64|u128|usize|isize|f32|f64|bool|char|Vec|Option|Result|Box|Rc|Arc|HashMap|HashSet)\b/g, 'syn-type'],
    [/\b(true|false|None|Some|Ok|Err)\b/g, 'syn-const'],
    [/\b(\d+\.?\d*)\b/g, 'syn-num'],
  ]);
}

/* ═══ SAFE HIGHLIGHT — takes RAW text, returns sanitized HTML ═══ */
/* This avoids the double-escape / broken span issues from calling
   escapeHtml() then highlightCode() when regex patterns interact
   with HTML entities and existing span tags. */
function highlightCodeSafe(rawText, filePath) {
  const escaped = escapeHtml(rawText);
  try {
    let highlighted = highlightCode(escaped, filePath);
    // Sanitize: repair any broken span nesting
    highlighted = _sanitizeSpans(highlighted);
    return highlighted;
  } catch(e) {
    return escaped; // Fallback to plain escaped text
  }
}

function _sanitizeSpans(html) {
  // Quick check: balanced span tags
  const opens = (html.match(/<span\s/g) || []).length;
  const closes = (html.match(/<\/span>/g) || []).length;
  if (opens === closes && opens > 0) {
    // Verify no broken tags by checking all <span have matching >
    // Look for <span ... that doesn't close with > before next < or end
    if (!/<span\s[^>]*$/.test(html) && !/<span\s[^>]*</.test(html)) {
      return html;
    }
  }
  // If unbalanced or broken, strip all spans and re-escape
  // Remove all complete span tags first, keep content
  let clean = html.replace(/<span\s+[^>]*>/g, '').replace(/<\/span>/g, '');
  // Remove any partial/broken tags
  clean = clean.replace(/<span[^>]*$/g, '').replace(/<\/span/g, '');
  // Remove any other stray < > that aren't HTML entities
  clean = clean.replace(/<(?!(?:&|\/?\w))/g, '&lt;');
  return clean;
}

/* Helper: apply regex-based token rules in order, skipping already-wrapped spans */
function _applyTokens(line, rules) {
  for (const [pattern, cls] of rules) {
    line = line.replace(pattern, (match, ...args) => {
      // Skip if inside a span already
      if (match.includes('class="syn-')) return match;
      return `<span class="${cls}">${match}</span>`;
    });
  }
  return line;
}

function highlightDart(line) {
  if (line.trimStart().startsWith('//')) return `<span class="syn-comment">${line}</span>`;
  // Strings first (preserve)
  line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  // Annotations / decorators
  line = line.replace(/(@\w+)/g, '<span class="syn-annotation">$1</span>');
  // Types (capitalized identifiers not already wrapped)
  line = line.replace(/\b([A-Z]\w*)\b(?![^<]*<\/span>)/g, (m) => {
    const kws = ['Future','Stream','Widget','State','BuildContext','Key','Text','Container','Column','Row','Scaffold','StatelessWidget','StatefulWidget','ConsumerWidget','HookWidget'];
    if (kws.includes(m)) return `<span class="syn-type">${m}</span>`;
    return `<span class="syn-type">${m}</span>`;
  });
  // Keywords
  const kws = ['import','export','class','enum','extends','implements','with','abstract','final','const','static','late','var','void','return','if','else','for','while','do','switch','case','break','continue','try','catch','finally','throw','async','await','required','super','this','new','dynamic','typedef','mixin','extension','on','get','set','factory','override','part','library','show','hide','as','is','yield'];
  for (const kw of kws) line = line.replace(new RegExp(`\\b(${kw})\\b(?![^<]*<\\/span>)`, 'g'), '<span class="syn-kw">$1</span>');
  // Constants
  line = line.replace(/\b(true|false|null)\b(?![^<]*<\/span>)/g, '<span class="syn-const">$1</span>');
  // Function calls: word followed by (
  line = line.replace(/\b([a-z_]\w*)\s*(?=\()(?![^<]*<\/span>)/g, '<span class="syn-fn">$1</span>');
  // Numbers
  line = line.replace(/\b(\d+\.?\d*)\b(?![^<]*<\/span>)/g, '<span class="syn-num">$1</span>');
  // Operators
  line = line.replace(/(=&gt;|[!=]==?|&lt;=?|&gt;=?|&amp;&amp;|\|\||[+\-*\/%]=?|\.\.\.?)/g, (m, _p, ofs, src) => {
    if (m.includes('class="syn-')) return m;
    const b = src.substring(0, ofs); if (b.lastIndexOf('<') > b.lastIndexOf('>')) return m;
    return `<span class="syn-op">${m}</span>`;
  });
  return line;
}

function highlightPython(line) {
  if (line.trimStart().startsWith('#')) return `<span class="syn-comment">${line}</span>`;
  // Strings (triple-quoted, then single/double)
  line = line.replace(/(&#39;&#39;&#39;[\s\S]*?&#39;&#39;&#39;|&quot;&quot;&quot;[\s\S]*?&quot;&quot;&quot;)/g, '<span class="syn-str">$1</span>');
  line = line.replace(/(f?&#39;[^&#]*?&#39;|f?&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  // Decorators
  line = line.replace(/(@\w[\w.]*)/g, '<span class="syn-annotation">$1</span>');
  // Keywords (control flow)
  const controlKws = ['if','elif','else','for','while','break','continue','try','except','finally','raise','with','yield','lambda','pass','assert','del','return','async','await','match','case'];
  for (const kw of controlKws) line = line.replace(new RegExp(`\\b(${kw})\\b(?![^<]*<\\/span>)`, 'g'), '<span class="syn-kw">$1</span>');
  // Definition keywords
  line = line.replace(/\b(import|from|as|class|def|global|nonlocal|in|not|and|or|is)\b(?![^<]*<\/span>)/g, '<span class="syn-import">$1</span>');
  // Constants
  line = line.replace(/\b(True|False|None|self|cls)\b(?![^<]*<\/span>)/g, '<span class="syn-const">$1</span>');
  // Builtin types/functions
  const builtins = ['print','range','len','isinstance','super','type','property','staticmethod','classmethod','int','str','float','bool','list','dict','tuple','set','frozenset','enumerate','zip','map','filter','sorted','reversed','any','all','abs','min','max','sum','round','open','input','hasattr','getattr','setattr','delattr','callable','iter','next','repr','format','Exception','ValueError','TypeError','KeyError','IndexError','RuntimeError','StopIteration','OSError','IOError'];
  for (const b of builtins) line = line.replace(new RegExp(`\\b(${b})\\b(?![^<]*<\\/span>)`, 'g'), '<span class="syn-type">$1</span>');
  // Function definitions/calls
  line = line.replace(/\b([a-z_]\w*)\s*(?=\()(?![^<]*<\/span>)/g, '<span class="syn-fn">$1</span>');
  // Numbers
  line = line.replace(/\b(\d+\.?\d*[jJ]?)\b(?![^<]*<\/span>)/g, '<span class="syn-num">$1</span>');
  // Operators
  line = line.replace(/(==|!=|&lt;=?|&gt;=?|\*\*|\/\/|[-+*\/%]=?|:=|-&gt;)/g, (m, _p, ofs, src) => {
    if (m.includes('class="syn-')) return m;
    const b = src.substring(0, ofs); if (b.lastIndexOf('<') > b.lastIndexOf('>')) return m;
    return `<span class="syn-op">${m}</span>`;
  });
  return line;
}

function highlightC(line) {
  if (line.trimStart().startsWith('//')) return `<span class="syn-comment">${line}</span>`;
  if (line.trimStart().startsWith('/*')) return `<span class="syn-comment">${line}</span>`;
  // Preprocessor directives
  if (line.trimStart().startsWith('#')) return `<span class="syn-annotation">${line}</span>`;
  // Strings and chars
  line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  // Type keywords
  const types = ['auto','char','double','float','int','long','short','signed','unsigned','void','bool','size_t','ptrdiff_t','int8_t','int16_t','int32_t','int64_t','uint8_t','uint16_t','uint32_t','uint64_t','FILE','wchar_t'];
  for (const t of types) line = line.replace(new RegExp(`\\b(${t})\\b(?![^<]*<\\/span>)`, 'g'), '<span class="syn-type">$1</span>');
  // Control flow keywords
  const kws = ['break','case','continue','default','do','else','for','goto','if','return','switch','while','typedef','struct','union','enum','extern','inline','register','restrict','sizeof','static','volatile','const','NULL','nullptr','true','false'];
  for (const kw of kws) line = line.replace(new RegExp(`\\b(${kw})\\b(?![^<]*<\\/span>)`, 'g'), '<span class="syn-kw">$1</span>');
  // Function calls
  line = line.replace(/\b([a-z_]\w*)\s*(?=\()(?![^<]*<\/span>)/g, '<span class="syn-fn">$1</span>');
  // Numbers
  line = line.replace(/\b(\d+\.?\d*[fFuUlL]*)\b(?![^<]*<\/span>)/g, '<span class="syn-num">$1</span>');
  // Operators
  line = line.replace(/(-&gt;|&lt;&lt;|&gt;&gt;|[!=]=|&lt;=?|&gt;=?|&amp;&amp;|\|\||[+\-*\/%&|^~]=?)/g, (m, _p, ofs, src) => {
    if (m.includes('class="syn-')) return m;
    const b = src.substring(0, ofs); if (b.lastIndexOf('<') > b.lastIndexOf('>')) return m;
    return `<span class="syn-op">${m}</span>`;
  });
  return line;
}

function highlightJS(line) {
  if (line.trimStart().startsWith('//')) return `<span class="syn-comment">${line}</span>`;
  // Strings (template literals, single, double)
  line = line.replace(/(`[^`]*`)/g, '<span class="syn-str">$1</span>');
  line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  // Decorators (TS)
  line = line.replace(/(@\w[\w.]*)/g, '<span class="syn-annotation">$1</span>');
  // JSX/TSX tags
  line = line.replace(/(&lt;\/?)([\w.]+)/g, (m, p1, p2) => {
    if (m.includes('class="syn-')) return m;
    if (p2[0] === p2[0].toUpperCase()) return `${p1}<span class="syn-type">${p2}</span>`;
    return `${p1}<span class="syn-tag">${p2}</span>`;
  });
  // Types (capitalized, not already wrapped)
  line = line.replace(/\b([A-Z]\w+)\b(?![^<]*<\/span>)/g, '<span class="syn-type">$1</span>');
  // Control flow keywords
  const controlKws = ['if','else','for','while','do','switch','case','break','continue','try','catch','finally','throw','return','yield','await','in','of','delete','instanceof','typeof'];
  for (const kw of controlKws) line = line.replace(new RegExp(`\\b(${kw})\\b(?![^<]*<\\/span>)`, 'g'), '<span class="syn-kw">$1</span>');
  // Declaration keywords
  line = line.replace(/\b(import|export|from|default|class|extends|constructor|function|const|let|var|async|new|this|super|static|get|set|interface|type|enum|implements|abstract|readonly|public|private|protected|module|require|as|void)\b(?![^<]*<\/span>)/g, '<span class="syn-import">$1</span>');
  // Constants
  line = line.replace(/\b(null|undefined|true|false|NaN|Infinity)\b(?![^<]*<\/span>)/g, '<span class="syn-const">$1</span>');
  // Builtin objects
  line = line.replace(/\b(console|document|window|Math|JSON|Array|Object|String|Number|Boolean|Promise|Map|Set|RegExp|Date|Error|Symbol|Proxy|Reflect|globalThis)\b(?![^<]*<\/span>)/g, '<span class="syn-type">$1</span>');
  // Function calls
  line = line.replace(/\b([a-z_$]\w*)\s*(?=\()(?![^<]*<\/span>)/g, '<span class="syn-fn">$1</span>');
  // Method calls (after dot)
  line = line.replace(/\.([a-z_$]\w*)\s*(?=\()(?![^<]*<\/span>)/g, '.<span class="syn-fn">$1</span>');
  // Numbers
  line = line.replace(/\b(\d+\.?\d*(?:e[+-]?\d+)?)\b(?![^<]*<\/span>)/g, '<span class="syn-num">$1</span>');
  // Operators
  line = line.replace(/(=&gt;|===?|!==?|&lt;=?|&gt;=?|&amp;&amp;|\|\||[+\-*\/%]=?|\?\?|\.\.\.|\?\.)/g, (m, _p, ofs, src) => {
    if (m.includes('class="syn-')) return m;
    const b = src.substring(0, ofs); if (b.lastIndexOf('<') > b.lastIndexOf('>')) return m;
    return `<span class="syn-op">${m}</span>`;
  });
  return line;
}

function highlightHTML(line) {
  if (line.includes('&lt;!--')) return `<span class="syn-comment">${line}</span>`;
  // Script/style tag contents (inline)
  if (line.trimStart().startsWith('&lt;script')) {
    line = line.replace(/(&lt;\/?)(script)/gi, '$1<span class="syn-tag">$2</span>');
    line = line.replace(/([\w-]+)(=)/g, '<span class="syn-attr">$1</span>$2');
    line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
    return line;
  }
  if (line.trimStart().startsWith('&lt;style')) {
    line = line.replace(/(&lt;\/?)(style)/gi, '$1<span class="syn-tag">$2</span>');
    line = line.replace(/([\w-]+)(=)/g, '<span class="syn-attr">$1</span>$2');
    line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
    return line;
  }
  // DOCTYPE
  line = line.replace(/(DOCTYPE)\b/gi, '<span class="syn-kw">$1</span>');
  // Tags
  line = line.replace(/(&lt;\/?)([\w-]+)/g, (m, p1, p2) => {
    return `<span class="syn-op">${p1}</span><span class="syn-tag">${p2}</span>`;
  });
  // Closing > and />
  line = line.replace(/(\/?&gt;)/g, '<span class="syn-op">$1</span>');
  // Attributes
  line = line.replace(/([\w-]+)(=)(?![^<]*<\/span>)/g, '<span class="syn-attr">$1</span><span class="syn-op">$2</span>');
  // Attribute values (strings)
  line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  // Class/id special highlighting inside strings
  // Entity references
  line = line.replace(/(&amp;\w+;)/g, '<span class="syn-const">$1</span>');
  return line;
}

function highlightCSS(line) {
  if (line.trimStart().startsWith('/*') || line.trimStart().startsWith('*')) return `<span class="syn-comment">${line}</span>`;
  // At-rules
  line = line.replace(/(@[\w-]+)/g, '<span class="syn-kw">$1</span>');
  // CSS variables
  line = line.replace(/(--[\w-]+)/g, '<span class="syn-annotation">$1</span>');
  // Selectors (class, id, pseudo)
  line = line.replace(/([.#][\w-]+)(?![^<]*<\/span>)/g, '<span class="syn-sel">$1</span>');
  // Pseudo-classes/elements
  line = line.replace(/(:{1,2}[\w-]+)(?![^<]*<\/span>)/g, '<span class="syn-sel">$1</span>');
  // Property names (word before colon)
  line = line.replace(/\b([\w-]+)\s*(?=:)(?![^<]*<\/span>)/g, '<span class="syn-prop">$1</span>');
  // Colors (hex)
  line = line.replace(/(#[\da-fA-F]{3,8})\b/g, '<span class="syn-num">$1</span>');
  // Numbers with units
  line = line.replace(/\b(\d+\.?\d*(?:px|em|rem|%|vh|vw|vmin|vmax|s|ms|deg|rad|turn|fr|ch|ex|cm|mm|in|pt|pc)?)\b(?![^<]*<\/span>)/g, '<span class="syn-num">$1</span>');
  // CSS functions
  const fns = ['var','calc','min','max','clamp','rgb','rgba','hsl','hsla','linear-gradient','radial-gradient','conic-gradient','url','translate','rotate','scale','skew','matrix','perspective','env','attr','counter','minmax','repeat','fit-content'];
  for (const fn of fns) line = line.replace(new RegExp(`\\b(${fn})\\s*(?=\\()(?![^<]*<\\/span>)`, 'g'), '<span class="syn-fn">$1</span>');
  // Important
  line = line.replace(/(!important)\b/g, '<span class="syn-const">$1</span>');
  // Strings
  line = line.replace(/(&#39;[^&#]*?&#39;|&quot;[^&]*?&quot;)/g, '<span class="syn-str">$1</span>');
  // Braces/semicolons
  line = line.replace(/([{}();,])/g, (m) => {
    if (m.includes('class="syn-')) return m;
    return `<span class="syn-op">${m}</span>`;
  });
  return line;
}

function highlightSQL(line) {
  if (line.trimStart().startsWith('--')) return `<span class="syn-comment">${line}</span>`;
  // Strings
  line = line.replace(/(&#39;[^&#]*?&#39;)/g, '<span class="syn-str">$1</span>');
  // SQL types
  const types = ['INTEGER','INT','VARCHAR','TEXT','BOOLEAN','FLOAT','DOUBLE','DECIMAL','DATE','TIMESTAMP','BLOB','REAL','NUMERIC','BIGINT','SMALLINT','CHAR','NVARCHAR','SERIAL','BYTEA','JSONB','UUID','ARRAY','XML','MONEY','INTERVAL','POINT','POLYGON','CIDR','INET','MACADDR','BIT','VARBIT'];
  for (const t of types) line = line.replace(new RegExp(`\\b(${t})\\b(?![^<]*<\\/span>)`, 'gi'), '<span class="syn-type">$1</span>');
  // DDL keywords
  const ddl = ['CREATE','ALTER','DROP','TABLE','VIEW','INDEX','TRIGGER','FUNCTION','PROCEDURE','SCHEMA','DATABASE','SEQUENCE','MATERIALIZED','EXTENSION','ROLE','USER','GRANT','REVOKE','PRIMARY','KEY','FOREIGN','REFERENCES','CONSTRAINT','DEFAULT','CHECK','UNIQUE','AUTO_INCREMENT','CASCADE','RESTRICT','CONFLICT'];
  for (const kw of ddl) line = line.replace(new RegExp(`\\b(${kw})\\b(?![^<]*<\\/span>)`, 'gi'), '<span class="syn-annotation">$1</span>');
  // DML / control keywords
  const kws = ['SELECT','FROM','WHERE','INSERT','INTO','UPDATE','SET','DELETE','BEGIN','END','IF','ELSE','THEN','CASE','WHEN','AND','OR','NOT','IN','EXISTS','BETWEEN','LIKE','ILIKE','IS','NULL','JOIN','INNER','LEFT','RIGHT','OUTER','FULL','CROSS','ON','AS','ORDER','BY','GROUP','HAVING','LIMIT','OFFSET','UNION','ALL','DISTINCT','VALUES','RETURNS','DECLARE','CURSOR','FETCH','COMMIT','ROLLBACK','SAVEPOINT','TRANSACTION','WITH','RECURSIVE','TEMPORARY','TEMP','REPLACE','EXCEPT','INTERSECT','VACUUM','EXPLAIN','ANALYZE','AFTER','BEFORE','FOR','EACH','ROW','EXECUTE','RETURN','RAISE','NOTICE','PERFORM','LOOP','WHILE','EXIT','CONTINUE','COALESCE','NULLIF','CAST','CONVERT'];
  for (const kw of kws) line = line.replace(new RegExp(`\\b(${kw})\\b(?![^<]*<\\/span>)`, 'gi'), '<span class="syn-kw">$1</span>');
  // Functions
  line = line.replace(/\b([a-z_]\w*)\s*(?=\()(?![^<]*<\/span>)/gi, '<span class="syn-fn">$1</span>');
  // Numbers
  line = line.replace(/\b(\d+\.?\d*)\b(?![^<]*<\/span>)/g, '<span class="syn-num">$1</span>');
  // Operators
  line = line.replace(/(::|\|\||&lt;&gt;|[!=]=|&lt;=?|&gt;=?)/g, (m) => {
    if (m.includes('class="syn-')) return m;
    return `<span class="syn-op">${m}</span>`;
  });
  return line;
}

/* ═══ FILE/CLASS COLORS ═══ */

function getFileColor(path) {
  const lang = detectLanguage(path);
  const p = path.toLowerCase();

  // Language-specific colors
  const langColors = {
    dart: '#22d3ee',
    python: '#f59e0b',
    c: '#60a5fa',
    javascript: '#fbbf24',
    html: '#f87171',
    css: '#a78bfa',
    sql: '#4ade80',
  };

  // Role-based overrides
  if (p.includes('screen') || p.includes('page') || p.includes('view') || p.includes('template') || p.includes('component')) return '#22d3ee';
  if (p.includes('model') || p.includes('entity') || p.includes('schema')) return '#f87171';
  if (p.includes('service') || p.includes('repository') || p.includes('api') || p.includes('route') || p.includes('controller')) return '#4ade80';
  if (p.includes('provider') || p.includes('notifier') || p.includes('bloc') || p.includes('cubit') || p.includes('store') || p.includes('reducer') || p.includes('context')) return '#a78bfa';
  if (p.includes('theme') || p.includes('style') || p.includes('color') || p.includes('.css') || p.includes('.scss')) return '#f472b6';
  if (p.includes('test') || p.includes('spec') || p.includes('__test')) return '#94a3b8';
  if (p.includes('util') || p.includes('helper') || p.includes('lib') || p.includes('common')) return '#fbbf24';

  return langColors[lang] || '#fbbf24';
}

function getClassColor(cls) {
  // Dart widget types
  if (cls.widgetType === 'stateless' || cls.widgetType === 'stateful' || cls.widgetType === 'state') return '#22d3ee';
  if (cls.widgetType === 'notifier' || cls.widgetType === 'bloc') return '#a78bfa';

  // Python GUI types
  if (cls.widgetType === 'pyqt-widget') return '#22d3ee';
  if (cls.widgetType === 'tkinter-widget') return '#22d3ee';
  if (cls.widgetType === 'django-view' || cls.widgetType === 'flask-view') return '#4ade80';
  if (cls.widgetType === 'django-model') return '#f87171';
  if (cls.widgetType === 'django-serializer') return '#f59e0b';

  // JS types
  if (cls.widgetType === 'react-class' || cls.widgetType === 'web-component') return '#22d3ee';
  if (cls.widgetType === 'interface') return '#94a3b8';
  if (cls.widgetType === 'sql-view') return '#4ade80';

  // Language fallbacks
  const langColors = { dart: '#fbbf24', python: '#f59e0b', c: '#60a5fa', javascript: '#fbbf24', sql: '#4ade80', css: '#a78bfa', html: '#f87171' };
  return langColors[cls.lang] || '#fbbf24';
}

function getFileIcon(path) {
  const ext = path.split('.').pop().toLowerCase();
  const icons = {
    dart: '🎯', py: '🐍', c: '⚙️', h: '⚙️', cpp: '⚙️', hpp: '⚙️',
    html: '🌐', htm: '🌐', css: '🎨', scss: '🎨', sass: '🎨',
    js: '📜', jsx: '⚛️', ts: '📘', tsx: '⚛️',
    sql: '🗄️', json: '📄', yaml: '📋', yml: '📋',
    md: '📝', txt: '📄', toml: '📋', lock: '🔒',
    sh: '🖥️', bat: '🖥️', svg: '🖼️', xml: '📰',
    go: '🔵', rs: '🦀', java: '☕', kt: '🟣', swift: '🧡',
    rb: '💎', php: '🐘', r: '📊', lua: '🌙',
  };
  return icons[ext] || '📄';
}
