/* ═══════════════════════════════════════════════════
   Code Architect — testrun-checks.js
   In-app runnable contract checks: static tests that execute right in
   the browser against the loaded project (APP.files / APP.parsed) with
   pass/fail results. No compiler or device needed.

   Built-in packs (auto-enabled when their stack is detected):
     • Generic       — imports resolve, duplicate classes, oversized fns…
     • Dart IAP      — catalog completeness, replay guard, restore rules,
                       promo-code hashing, receipt-before-grant…
   Custom checks are defined via no-code forms (ui-testing.js) and
   persisted in localStorage.
   ═══════════════════════════════════════════════════ */

/* A check: { id, suite, name, why, appliesTo() → bool, run() → result }
   result: { status:'pass'|'fail'|'skip', detail, locations:[{file,line}] } */

const CHECKS = { custom: [] };

function _pass(detail) { return { status: 'pass', detail: detail || 'OK', locations: [] }; }
function _fail(detail, locations) { return { status: 'fail', detail, locations: locations || [] }; }
function _skip(detail) { return { status: 'skip', detail, locations: [] }; }

function _codeFiles(lang) {
  const exts = new Set(getCodeExtensions());
  return Object.keys(APP.files).filter(f => {
    if (!exts.has(f.split('.').pop().toLowerCase())) return false;
    return !lang || detectLanguage(f) === lang;
  });
}

function _methodBody(content, signatureRe) {
  const m = signatureRe.exec(content);
  if (!m) return null;
  const braceIdx = content.indexOf('{', m.index);
  if (braceIdx === -1) return null;
  const end = _findMatch(content, braceIdx); // from ui-visual.js (str/comment aware)
  return end === -1 ? null : content.slice(braceIdx, end + 1);
}

function _setLiteral(content, setName) {
  const m = new RegExp(`Set<String>\\s+${setName}\\s*=\\s*\\{`).exec(content);
  if (!m) return null;
  const open = content.indexOf('{', m.index + m[0].length - 1);
  const end = _findMatch(content, open);
  if (end === -1) return null;
  const body = content.slice(open + 1, end);
  const names = [];
  const re = /(?:^|[,\s{])(?:\.\.\.)?(\w+)\s*(?=,|$|\})/gm;
  let mm;
  while ((mm = re.exec(body))) names.push(mm[1]);
  return { names, body };
}

/* ═══ GENERIC PACK ═══ */

const GENERIC_CHECKS = [
  {
    id: 'gen.parse', suite: 'Project structure',
    name: 'Project parses into entities',
    why: 'Zero parsed entities usually means broken syntax or an unsupported layout.',
    appliesTo: () => true,
    run() {
      const p = APP.parsed;
      const total = p.classes.length + p.functions.length + p.providers.length;
      return total > 0
        ? _pass(`${p.classes.length} classes · ${p.functions.length} functions · ${p.providers.length} providers`)
        : _fail('No classes, functions, or providers were parsed from this project');
    },
  },
  {
    id: 'gen.imports', suite: 'Project structure',
    name: 'All relative imports resolve to real files',
    why: 'A broken relative import is a guaranteed build failure.',
    appliesTo: () => true,
    run() {
      const bad = [];
      for (const path of _codeFiles()) {
        const lang = detectLanguage(path);
        if (!['dart', 'javascript', 'python', 'c', 'css'].includes(lang)) continue;
        const entry = CORE.parseCache[path];
        if (!entry) continue;
        for (const imp of entry.result.imports || []) {
          const raw = imp.raw || '';
          const isRelative =
            (lang === 'dart' && !raw.startsWith('package:') && !raw.startsWith('dart:')) ||
            (lang === 'javascript' && (raw.startsWith('./') || raw.startsWith('../'))) ||
            (lang === 'python' && raw.startsWith('.'));
          if (!isRelative) continue;
          const dir = path.split('/').slice(0, -1).join('/');
          const resolved = resolveImportUniversal(dir, raw, lang);
          if (!resolved || !APP.files[resolved]) {
            bad.push({ file: path, line: imp.line || 1, raw });
          }
        }
      }
      return bad.length === 0
        ? _pass('every relative import points at an existing file')
        : _fail(`${bad.length} unresolved import(s): ` +
            bad.slice(0, 5).map(b => `"${b.raw}"`).join(', '),
            bad.map(b => ({ file: b.file, line: b.line })));
    },
  },
  {
    id: 'gen.dupclasses', suite: 'Project structure',
    name: 'No duplicate top-level class names',
    why: 'Two classes with one name make graphs, imports, and refactors ambiguous.',
    appliesTo: () => APP.parsed.classes.length > 0,
    run() {
      const seen = {};
      for (const c of APP.parsed.classes) (seen[c.name] = seen[c.name] || []).push(c);
      const dupes = Object.entries(seen).filter(([, v]) =>
        v.length > 1 && new Set(v.map(c => c.file)).size > 1);
      return dupes.length === 0
        ? _pass(`${APP.parsed.classes.length} class names are unique`)
        : _fail(`duplicated: ${dupes.slice(0, 6).map(([n]) => n).join(', ')}`,
            dupes.flatMap(([, v]) => v.map(c => ({ file: c.file, line: c.line }))));
    },
  },
  {
    id: 'gen.bigfn', suite: 'Code health',
    name: 'No function longer than 300 lines',
    why: 'Monster functions are where bugs hide; flag the worst offenders.',
    appliesTo: () => APP.parsed.functions.length > 0,
    run() {
      const big = computeMetrics().functions.filter(f => f.loc > 300);
      return big.length === 0
        ? _pass('largest function is within bounds')
        : _fail(big.map(f => `${f.name}() = ${f.loc} lines`).slice(0, 5).join(', '),
            big.map(f => ({ file: f.file, line: f.line })));
    },
  },
  {
    id: 'gen.deadcode', suite: 'Code health',
    name: 'Unreferenced code stays under 15% of classes',
    why: 'A rising dead-code ratio means abandoned features are accumulating.',
    appliesTo: () => APP.parsed.classes.length >= 5,
    run() {
      const dead = computeDeadCode();
      const ratio = dead.classes.length / APP.parsed.classes.length;
      return ratio <= 0.15
        ? _pass(`${dead.classes.length}/${APP.parsed.classes.length} possibly-unused classes`)
        : _fail(`${(ratio * 100).toFixed(0)}% of classes look unused: ` +
            dead.classes.slice(0, 5).map(c => c.name).join(', '),
            dead.classes.slice(0, 10).map(c => ({ file: c.file, line: c.line })));
    },
  },
];

/* ═══ DART / FLUTTER IAP PACK ═══ */
/* All checks re-detect lazily so they work on any loaded Dart project. */

function _iapT() {
  if (!CHECKS._iapT || CHECKS._iapTGen !== CORE.parseCache) {
    CHECKS._iapT = typeof detectDartTestTargets === 'function' ? detectDartTestTargets() : null;
    CHECKS._iapTGen = CORE.parseCache;
  }
  return CHECKS._iapT;
}

const DART_IAP_CHECKS = [
  {
    id: 'iap.sets', suite: 'IAP catalog',
    name: 'Every product constant is registered in a category set',
    why: 'A product missing from consumables/nonConsumables/subscriptions never reaches the store query.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.productsClass,
    run() {
      const t = _iapT();
      const content = APP.files[t.productsClass.file].content;
      const sets = ['consumables', 'nonConsumables', 'subscriptions']
        .map(n => _setLiteral(content, n)).filter(Boolean);
      if (!sets.length) return _skip('no category Set<String> literals found');
      const registered = new Set(sets.flatMap(s => s.names));
      const missing = t.productsClass.constants.filter(c => !registered.has(c.name));
      return missing.length === 0
        ? _pass(`${t.productsClass.constants.length} products all categorized`)
        : _fail(`unregistered: ${missing.map(c => c.name).join(', ')}`,
            [{ file: t.productsClass.file, line: t.productsClass ? APP.parsed.classes.find(c => c.name === t.productsClass.name)?.line || 1 : 1 }]);
    },
  },
  {
    id: 'iap.disjoint', suite: 'IAP catalog',
    name: 'Category sets are pairwise disjoint',
    why: 'A product that is both consumable and subscription gets double-handled on delivery.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.productsClass,
    run() {
      const t = _iapT();
      const content = APP.files[t.productsClass.file].content;
      const names = ['consumables', 'nonConsumables', 'subscriptions'];
      const sets = names.map(n => ({ n, lit: _setLiteral(content, n) })).filter(s => s.lit);
      if (sets.length < 2) return _skip('fewer than two category sets found');
      const overlaps = [];
      for (let i = 0; i < sets.length; i++) {
        for (let j = i + 1; j < sets.length; j++) {
          const inter = sets[i].lit.names.filter(x => sets[j].lit.names.includes(x));
          if (inter.length) overlaps.push(`${sets[i].n}∩${sets[j].n}: ${inter.join(',')}`);
        }
      }
      return overlaps.length === 0 ? _pass('no product sits in two categories')
        : _fail(overlaps.join(' · '), [{ file: t.productsClass.file, line: 1 }]);
    },
  },
  {
    id: 'iap.label', suite: 'IAP catalog',
    name: 'label() covers every product id',
    why: 'Uncovered ids show as raw product strings in the shop UI.',
    appliesTo: () => {
      const t = _iapT();
      return APP.parsed.projectType === 'dart' && !!t?.productsClass &&
        /static\s+String\s+label\s*\(/.test(APP.files[t.productsClass.file]?.content || '');
    },
    run() { return _switchCoverageCheck('label'); },
  },
  {
    id: 'iap.price', suite: 'IAP catalog',
    name: 'fallbackPrice() covers every product id',
    why: 'Products without a fallback price render "-" when the store is offline.',
    appliesTo: () => {
      const t = _iapT();
      return APP.parsed.projectType === 'dart' && !!t?.productsClass &&
        /static\s+String\s+fallbackPrice\s*\(/.test(APP.files[t.productsClass.file]?.content || '');
    },
    run() { return _switchCoverageCheck('fallbackPrice'); },
  },
  {
    id: 'iap.replay', suite: 'IAP delivery',
    name: 'Purchase delivery has a replay guard',
    why: 'Without deduping purchase ids, a crash-then-replay double-grants consumables.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.iapServiceClass,
    run() {
      const t = _iapT();
      const content = APP.files[t.iapServiceClass.file].content;
      const hasGuard = /(wasDelivered|alreadyDelivered|deliveredIds|_delivered)/i.test(content) &&
        /purchaseID/.test(content);
      return hasGuard
        ? _pass('delivered-purchase-id guard found in ' + t.iapServiceClass.name)
        : _fail('no delivered-purchase-id dedupe found near the delivery path',
            [{ file: t.iapServiceClass.file, line: t.iapServiceClass ? APP.parsed.classes.find(c => c.name === t.iapServiceClass.name)?.line || 1 : 1 }]);
    },
  },
  {
    id: 'iap.ack', suite: 'IAP delivery',
    name: 'Purchases are acknowledged (completePurchase)',
    why: 'Unacknowledged purchases are auto-refunded by Google Play after 3 days.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.iapServiceClass,
    run() {
      const t = _iapT();
      const content = APP.files[t.iapServiceClass.file].content;
      return /completePurchase\s*\(/.test(content)
        ? _pass('completePurchase() is called')
        : _fail('completePurchase() never called — Play will refund purchases',
            [{ file: t.iapServiceClass.file, line: 1 }]);
    },
  },
  {
    id: 'iap.verify', suite: 'IAP delivery',
    name: 'Verification gates delivery',
    why: 'Delivering before verifying receipts trusts a spoofable client flow.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.iapServiceClass,
    run() {
      const t = _iapT();
      const content = APP.files[t.iapServiceClass.file].content;
      const verifyIdx = content.search(/_?verifyPurchase|verifier\.verify/);
      const deliverIdx = content.search(/_?deliverPurchase|_deliver\(/);
      if (verifyIdx === -1) return _fail('no verification call found', [{ file: t.iapServiceClass.file, line: 1 }]);
      if (deliverIdx === -1) return _skip('no distinct delivery function found');
      // In the purchase handler, verify must be referenced before deliver
      const handler = _methodBody(content, /_handlePurchase\s*\([^)]*\)\s*(?:async\s*)?/g) || content;
      const v = handler.search(/verify/i);
      const d = handler.search(/deliver/i);
      return v !== -1 && (d === -1 || v < d)
        ? _pass('verify runs before delivery in the purchase handler')
        : _fail('delivery appears before verification in the purchase handler',
            [{ file: t.iapServiceClass.file, line: 1 }]);
    },
  },
  {
    id: 'iap.restored', suite: 'IAP money rules',
    name: 'Restored purchases cannot re-grant consumables',
    why: 'restorePurchases() runs every app start — without an isRestored guard it prints free currency.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.iapServiceClass,
    run() {
      const files = _codeFiles('dart');
      const listenerFile = files.find(f =>
        /purchaseStream\.listen|purchaseStream\s*\)/.test(APP.files[f].content) &&
        /addSoulQuoins|addCoins|grantCurrency|addCurrency/i.test(APP.files[f].content));
      if (!listenerFile) return _skip('no purchase-stream consumer with currency grants found');
      const content = APP.files[listenerFile].content;
      return /isRestored|PurchaseStatus\.restored/.test(content)
        ? _pass(`restored-purchase guard present in ${listenerFile.split('/').pop()}`)
        : _fail('currency grants without any restored-purchase guard',
            [{ file: listenerFile, line: 1 }]);
    },
  },
  {
    id: 'iap.receiptfirst', suite: 'IAP money rules',
    name: 'Receipts are persisted before grants',
    why: 'Vaulting the receipt first means a crash mid-delivery can still be re-verified later.',
    appliesTo: () => APP.parsed.projectType === 'dart' &&
      _codeFiles('dart').some(f => /logIapReceipt|saveReceipt/i.test(APP.files[f].content)),
    run() {
      const file = _codeFiles('dart').find(f =>
        /logIapReceipt|saveReceipt/i.test(APP.files[f].content) &&
        /addSoulQuoins|extendSubscription/i.test(APP.files[f].content));
      if (!file) return _skip('receipt logging and grants not co-located');
      const content = APP.files[file].content;
      const r = content.search(/logIapReceipt|saveReceipt/i);
      const g = content.search(/addSoulQuoins|extendSubscription/i);
      return r < g
        ? _pass('receipt vault call precedes grant calls')
        : _fail('grants appear before receipt persistence', [{ file, line: 1 }]);
    },
  },
  {
    id: 'iap.promohash', suite: 'IAP money rules',
    name: 'Promo codes are stored hashed, not plaintext',
    why: 'Plaintext codes in the binary can be extracted from any APK and minted infinitely.',
    appliesTo: () => APP.parsed.projectType === 'dart' && !!_iapT()?.promoServiceClass,
    run() {
      const t = _iapT();
      const content = APP.files[t.promoServiceClass.file].content;
      const hexKeys = (content.match(/'[0-9a-f]{64}'\s*:/g) || []).length;
      const hashUse = /sha256|sha512|Hmac/i.test(content);
      if (hexKeys > 0 && hashUse) return _pass(`${hexKeys} hashed code entries, sha-256 lookup`);
      if (hashUse) return _pass('hashing in redemption path');
      return _fail('promo registry appears to use plaintext keys',
        [{ file: t.promoServiceClass.file, line: 1 }]);
    },
  },
  {
    id: 'iap.stacking', suite: 'IAP money rules',
    name: 'Subscription terms stack instead of overwriting',
    why: 'Overwriting expiry on re-purchase silently wastes days the user already paid for.',
    appliesTo: () => APP.parsed.projectType === 'dart' &&
      _codeFiles('dart').some(f => /extendSubscription/.test(APP.files[f].content)),
    run() {
      const file = _codeFiles('dart').find(f =>
        /extendSubscription\s*\(\s*\{/.test(APP.files[f].content));
      if (!file) return _skip('no extendSubscription implementation found');
      const body = _methodBody(APP.files[file].content,
        /extendSubscription\s*\(\s*\{[^}]*\}\s*\)\s*(?:async\s*)?/g);
      if (!body) return _skip('could not isolate extendSubscription body');
      return /isAfter|\.add\s*\(/.test(body) && /(current|existing|expiry|base)/i.test(body)
        ? _pass('extendSubscription extends from the later of now/current expiry')
        : _fail('extendSubscription does not appear to stack on remaining time',
            [{ file, line: 1 }]);
    },
  },
  {
    id: 'iap.spend', suite: 'IAP money rules',
    name: 'Currency spend is atomically guarded',
    why: 'Read-check-write spend paths let concurrent spends overdraft the balance.',
    appliesTo: () => APP.parsed.projectType === 'dart' &&
      _codeFiles('dart').some(f => /spendSoulQuoins|spendCurrency|spendCoins/i.test(APP.files[f].content)),
    run() {
      const file = _codeFiles('dart').find(f =>
        /Future<bool>\s+spend/i.test(APP.files[f].content));
      if (!file) return _skip('no spend implementation found');
      const body = _methodBody(APP.files[file].content, /Future<bool>\s+spend\w*\s*\([^)]*\)\s*(?:async\s*)?/g);
      if (!body) return _skip('could not isolate spend body');
      return /WHERE[^']*>=\s*\?|rawUpdate/i.test(body)
        ? _pass('spend uses a guarded UPDATE (balance check + deduct in one statement)')
        : _fail('spend looks like read-check-write — vulnerable to concurrent overdraft',
            [{ file, line: 1 }]);
    },
  },
];

function _switchCoverageCheck(methodName) {
  const t = _iapT();
  const content = APP.files[t.productsClass.file].content;
  const body = _methodBody(content,
    new RegExp(`static\\s+String\\s+${methodName}\\s*\\([^)]*\\)\\s*`, 'g'));
  if (!body) return _skip(`could not isolate ${methodName}() body`);
  const covered = new Set();
  const re = /case\s+(\w+)\s*:/g;
  let m;
  while ((m = re.exec(body))) covered.add(m[1]);
  const missing = t.productsClass.constants.filter(c => !covered.has(c.name));
  return missing.length === 0
    ? _pass(`${methodName}() covers all ${t.productsClass.constants.length} products`)
    : _fail(`${methodName}() misses: ${missing.map(c => c.name).join(', ')}`,
        [{ file: t.productsClass.file, line: 1 }]);
}

/* ═══ CUSTOM (no-code) CHECKS ═══ */

const CUSTOM_CHECKS_KEY = 'ca_custom_checks_v1';

function loadCustomChecks() {
  try { CHECKS.custom = JSON.parse(localStorage.getItem(CUSTOM_CHECKS_KEY) || '[]'); }
  catch (e) { CHECKS.custom = []; }
  return CHECKS.custom;
}

function saveCustomChecks() {
  try { localStorage.setItem(CUSTOM_CHECKS_KEY, JSON.stringify(CHECKS.custom)); } catch (e) {}
}

function addCustomCheck(def) {
  def.id = 'custom.' + Date.now().toString(36);
  CHECKS.custom.push(def);
  saveCustomChecks();
}

function deleteCustomCheck(id) {
  CHECKS.custom = CHECKS.custom.filter(c => c.id !== id);
  saveCustomChecks();
}

/* Evaluate a stored custom-check definition (pure data, no code). */
function runCustomCheck(def) {
  const files = _codeFiles().filter(f => !def.filePattern || f.includes(def.filePattern));
  if (def.type === 'contains' || def.type === 'absent') {
    if (files.length === 0) return _skip(`no files match "${def.filePattern}"`);
    let matcher;
    try {
      matcher = def.isRegex ? new RegExp(def.pattern) : null;
    } catch (e) { return _fail(`invalid regex: ${def.pattern}`); }
    const hits = [];
    for (const f of files) {
      const lines = APP.files[f].content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const hit = matcher ? matcher.test(lines[i]) : lines[i].includes(def.pattern);
        if (hit) { hits.push({ file: f, line: i + 1 }); break; }
      }
    }
    if (def.type === 'contains') {
      const missing = files.filter(f => !hits.find(h => h.file === f));
      return missing.length === 0
        ? _pass(`pattern present in all ${files.length} matching file(s)`)
        : _fail(`missing from: ${missing.slice(0, 5).map(f => f.split('/').pop()).join(', ')}`,
            missing.map(f => ({ file: f, line: 1 })));
    }
    return hits.length === 0
      ? _pass(`pattern absent from all ${files.length} matching file(s)`)
      : _fail(`found in ${hits.length} file(s)`, hits);
  }
  if (def.type === 'entityExists') {
    const pool = def.kind === 'class' ? APP.parsed.classes
      : def.kind === 'function' ? APP.parsed.functions
      : def.kind === 'enum' ? APP.parsed.enums : APP.parsed.providers;
    const found = pool.find(e => e.name === def.name);
    return found
      ? _pass(`${def.kind} "${def.name}" exists in ${found.file}`)
      : _fail(`${def.kind} "${def.name}" not found in project`);
  }
  if (def.type === 'classHasMethod') {
    const cls = APP.parsed.classes.find(c => c.name === def.className);
    if (!cls) return _fail(`class "${def.className}" not found`);
    return cls.methods.includes(def.methodName)
      ? _pass(`${def.className}.${def.methodName}() exists`)
      : _fail(`${def.className} has no method "${def.methodName}"`,
          [{ file: cls.file, line: cls.line }]);
  }
  if (def.type === 'maxLines') {
    const over = files.filter(f => APP.files[f].content.split('\n').length > (def.max || 500));
    return over.length === 0
      ? _pass(`all ${files.length} matching file(s) within ${def.max} lines`)
      : _fail(`over budget: ${over.slice(0, 5).map(f =>
          `${f.split('/').pop()} (${APP.files[f].content.split('\n').length})`).join(', ')}`,
          over.map(f => ({ file: f, line: 1 })));
  }
  return _skip(`unknown check type "${def.type}"`);
}

/* ═══ RUNNER ═══ */

function collectAllChecks() {
  loadCustomChecks();
  const builtins = [...GENERIC_CHECKS, ...DART_IAP_CHECKS];
  const applicable = builtins.filter(c => { try { return c.appliesTo(); } catch (e) { return false; } });
  const custom = CHECKS.custom.map(def => ({
    id: def.id, suite: 'Custom checks',
    name: def.displayName || def.name || def.type,
    why: def.why || 'User-defined contract', isCustom: true, def,
    appliesTo: () => true,
    run: () => runCustomCheck(def),
  }));
  return [...applicable, ...custom];
}

/** Runs checks asynchronously (yields to UI between checks).
    onProgress(done, total, lastResult) · returns [{check, result, ms}] */
async function runAllChecks(checks, onProgress) {
  CHECKS._iapT = null; // re-detect with fresh source
  const results = [];
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    const t0 = performance.now();
    let result;
    try { result = check.run(); }
    catch (e) { result = _fail('check crashed: ' + e.message); }
    const entry = { check, result, ms: performance.now() - t0 };
    results.push(entry);
    if (onProgress) onProgress(i + 1, checks.length, entry);
    await new Promise(r => setTimeout(r, 0)); // let the UI breathe
  }
  return results;
}
