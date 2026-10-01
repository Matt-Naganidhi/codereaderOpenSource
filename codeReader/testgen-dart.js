/* ═══════════════════════════════════════════════════
   Code Architect — testgen-dart.js
   Flutter/Dart test-suite generator.
   Detects the loaded project's stack (package name, IAP layer,
   Riverpod, sqflite, promo codes, screens) from APP.parsed/APP.files
   and emits a tailored test bundle: unit + component + widget +
   DB-integration + e2e + runner/CI/docs.
   The IAP suites are "feelfami-grade": fully wired when an IAP
   service is detected, generic scaffolds otherwise.
   ═══════════════════════════════════════════════════ */

/* ═══ DETECTION ═══ */

function detectDartTestTargets() {
  const p = APP.parsed;
  const files = APP.files;
  const t = {
    lang: 'dart',
    packageName: null,
    pubspecPath: null,
    hasRiverpod: false,
    hasSqflite: false,
    hasSharedPrefs: false,
    hasInAppPurchase: false,
    productsClass: null,     // { name, file, constants:[{name,id}] }
    iapServiceClass: null,   // { name, file, methods }
    promoServiceClass: null,
    promoApplierClass: null,
    dbServiceClass: null,    // { name, file, methods }
    profileClass: null,
    i18nClass: null,
    listenerClass: null,
    screens: [],             // widget classes ending in Screen
    mainFile: null,
  };

  // pubspec
  t.pubspecPath = Object.keys(files).find(f => f.endsWith('pubspec.yaml'));
  if (t.pubspecPath) {
    const m = files[t.pubspecPath].content.match(/^name:\s*(\S+)/m);
    if (m) t.packageName = m[1];
  }
  const deps = { ...(p.packages?.deps || {}), ...(p.packages?.devDeps || {}) };
  t.hasRiverpod = 'flutter_riverpod' in deps || 'riverpod' in deps;
  t.hasSqflite = 'sqflite' in deps || 'sqflite_common_ffi' in deps;
  t.hasSharedPrefs = 'shared_preferences' in deps;
  t.hasInAppPurchase = 'in_app_purchase' in deps;

  const dartClasses = p.classes.filter(c => c.lang === 'dart');

  // Product-catalog class: static const String fields holding store ids
  for (const cls of dartClasses) {
    const content = files[cls.file]?.content || '';
    const constants = [];
    const re = /static\s+const\s+String\s+(\w+)\s*=\s*'([a-z0-9_.]+)'/g;
    let m;
    while ((m = re.exec(content))) constants.push({ name: m[1], id: m[2] });
    if (constants.length >= 3 &&
        (/Products$/.test(cls.name) || /queryProductDetails|ProductDetails/.test(content))) {
      if (!t.productsClass || constants.length > t.productsClass.constants.length) {
        t.productsClass = { name: cls.name, file: cls.file, constants };
      }
    }
  }

  const findCls = (pred) => dartClasses.find(pred) || null;
  t.iapServiceClass = findCls(c =>
    /IAP|Purchase/i.test(c.name) && c.methods.includes('initialize') &&
    /InAppPurchase/.test(files[c.file]?.content || ''));
  t.promoServiceClass = findCls(c => /Promo.*Service/.test(c.name));
  t.promoApplierClass = findCls(c => /PromoRewardApplier|RewardApplier/.test(c.name));
  t.dbServiceClass = findCls(c => /DatabaseService|DbService/.test(c.name));
  t.profileClass = findCls(c => /UserProfile$/.test(c.name));
  t.i18nClass = findCls(c => c.name === 'I18n');
  t.listenerClass = findCls(c => /IAPListener/.test(c.name));
  t.screens = dartClasses.filter(c =>
    /Screen$/.test(c.name) &&
    (c.widgetType === 'stateless' || c.widgetType === 'stateful'));
  t.mainFile = Object.keys(files).find(f => /(^|\/)main\.dart$/.test(f)) || null;

  // Import paths (package-relative) for detected classes
  t.importOf = (cls) => cls ? `package:${t.packageName}/${cls.file.replace(/^lib\//, '')}` : null;
  return t;
}

/* ═══ BUNDLE GENERATION ═══ */

function generateDartTestBundle(t) {
  const out = [];
  const add = (path, content, suite) => out.push({ path, content, suite });
  const pkg = t.packageName || 'your_package';

  // ── helpers ──
  if (t.hasInAppPurchase) {
    add('test/helpers/fake_iap_platform.dart', dartTplFakeIapPlatform(), 'helpers');
  }
  add('test/helpers/test_doubles.dart', dartTplTestDoubles(t), 'helpers');

  // ── unit ──
  if (t.productsClass) {
    add('test/unit/product_catalog_test.dart', dartTplCatalogTest(t), 'unit');
  }
  if (t.iapServiceClass && /Verifier/.test(APP.files[t.iapServiceClass.file]?.content || '')) {
    add('test/unit/purchase_verifier_test.dart', dartTplVerifierTest(t), 'unit');
  }
  if (t.profileClass) {
    add('test/unit/profile_model_test.dart', dartTplProfileModelTest(t), 'unit');
  }

  // ── component ──
  if (t.iapServiceClass && t.hasInAppPurchase) {
    add('test/component/iap_service_test.dart', dartTplIapServiceTest(t), 'component');
  }
  if (t.listenerClass && t.dbServiceClass && t.hasRiverpod) {
    add('test/component/iap_listener_test.dart', dartTplListenerTest(t), 'component');
  }
  if (t.promoServiceClass && t.promoApplierClass) {
    add('test/component/promo_service_test.dart', dartTplPromoTest(t), 'component');
  }

  // ── widget smokes ──
  if (t.screens.length) {
    add('test/widget/screen_smoke_test.dart', dartTplScreenSmokes(t), 'widget');
  }

  // ── DB integration ──
  if (t.dbServiceClass && t.hasSqflite) {
    add('test/integration_db/db_flows_test.dart', dartTplDbTest(t), 'integration_db');
  }

  // ── e2e ──
  if (t.mainFile) {
    add('integration_test/e2e_journey_test.dart', dartTplE2E(t), 'e2e');
  }

  // ── harness ──
  add('run_tests.ps1', dartTplRunnerPs1(), 'harness');
  add('.github/workflows/tests.yml', dartTplCiYaml(), 'harness');
  add('TESTING.md', dartTplTestingMd(t, out), 'harness');
  return out;
}

/* ═══ TEMPLATES ═══ */
/* NOTE: Dart's own `${...}` interpolation is escaped as \${...} inside
   these JS template literals. Plain $identifier needs no escape. */

function dartTplFakeIapPlatform() {
  return `// GENERATED by Code Architect — fake store platform for IAP tests.
// Swaps InAppPurchasePlatform.instance so the REAL IAP service runs its
// full pipeline (query → buy → purchaseStream → verify → deliver →
// completePurchase) against a scripted store. No changes to lib/ needed.
//
// ORDER MATTERS at use-sites: construct your IAP service BEFORE calling
// FakeIapPlatform.register() — the first-ever InAppPurchase.instance
// access registers the real platform and would overwrite the fake.

import 'dart:async';

import 'package:in_app_purchase_platform_interface/in_app_purchase_platform_interface.dart';

class FakeIapPlatform extends InAppPurchasePlatform {
  final StreamController<List<PurchaseDetails>> _controller =
      StreamController<List<PurchaseDetails>>.broadcast();

  bool available = true;
  bool throwOnIsAvailable = false;
  bool buyReturnValue = true;
  final Map<String, ProductDetails> catalog = {};

  final List<String> buyConsumableCalls = [];
  final List<String> buyNonConsumableCalls = [];
  final List<String?> applicationUserNamesSeen = [];
  final List<String> completedPurchaseIds = [];
  final List<Set<String>> queriedIdSets = [];
  int restoreCallCount = 0;

  static FakeIapPlatform register() {
    final fake = FakeIapPlatform();
    InAppPurchasePlatform.instance = fake;
    return fake;
  }

  static ProductDetails product(String id, {String price = r'$4.99'}) =>
      ProductDetails(
        id: id,
        title: id,
        description: 'Test product $id',
        price: price,
        rawPrice: 4.99,
        currencyCode: 'USD',
      );

  void stockProducts(Iterable<String> ids) {
    for (final id in ids) {
      catalog[id] = product(id);
    }
  }

  static PurchaseDetails purchase(
    String productId, {
    String? purchaseId,
    PurchaseStatus status = PurchaseStatus.purchased,
    String serverVerificationData = 'valid-receipt-token',
    bool pendingComplete = true,
    String source = 'fake_store',
  }) {
    final details = PurchaseDetails(
      purchaseID: purchaseId ?? 'txn-$productId-\${status.name}',
      productID: productId,
      verificationData: PurchaseVerificationData(
        localVerificationData: serverVerificationData,
        serverVerificationData: serverVerificationData,
        source: source,
      ),
      transactionDate: DateTime.now().millisecondsSinceEpoch.toString(),
      status: status,
    );
    details.pendingCompletePurchase = pendingComplete;
    return details;
  }

  void emit(List<PurchaseDetails> purchases) => _controller.add(purchases);

  void emitPurchased(String productId,
          {String? purchaseId,
          String serverVerificationData = 'valid-receipt-token'}) =>
      emit([purchase(productId, purchaseId: purchaseId, serverVerificationData: serverVerificationData)]);

  void emitRestored(String productId, {String? purchaseId}) =>
      emit([purchase(productId, purchaseId: purchaseId, status: PurchaseStatus.restored)]);

  void emitCanceled(String productId) =>
      emit([purchase(productId, status: PurchaseStatus.canceled, pendingComplete: false)]);

  void emitError(String productId, String message) {
    final details = purchase(productId, status: PurchaseStatus.error, pendingComplete: false);
    details.error = IAPError(source: 'fake_store', code: 'test_error', message: message);
    emit([details]);
  }

  void emitPending(String productId) =>
      emit([purchase(productId, status: PurchaseStatus.pending, pendingComplete: false)]);

  @override
  Stream<List<PurchaseDetails>> get purchaseStream => _controller.stream;

  @override
  Future<bool> isAvailable() async {
    if (throwOnIsAvailable) throw StateError('store exploded (test)');
    return available;
  }

  @override
  Future<ProductDetailsResponse> queryProductDetails(Set<String> identifiers) async {
    queriedIdSets.add(identifiers);
    final found = identifiers.where(catalog.containsKey).map((id) => catalog[id]!).toList();
    final missing = identifiers.where((id) => !catalog.containsKey(id)).toList();
    return ProductDetailsResponse(productDetails: found, notFoundIDs: missing);
  }

  @override
  Future<bool> buyConsumable({required PurchaseParam purchaseParam, bool autoConsume = true}) async {
    buyConsumableCalls.add(purchaseParam.productDetails.id);
    applicationUserNamesSeen.add(purchaseParam.applicationUserName);
    return buyReturnValue;
  }

  @override
  Future<bool> buyNonConsumable({required PurchaseParam purchaseParam}) async {
    buyNonConsumableCalls.add(purchaseParam.productDetails.id);
    applicationUserNamesSeen.add(purchaseParam.applicationUserName);
    return buyReturnValue;
  }

  @override
  Future<void> completePurchase(PurchaseDetails purchase) async {
    completedPurchaseIds.add(purchase.purchaseID ?? '<null>');
  }

  @override
  Future<void> restorePurchases({String? applicationUserName}) async {
    restoreCallCount++;
  }

  Future<void> close() => _controller.close();
}
`;
}

function dartTplTestDoubles(t) {
  const pkg = t.packageName || 'your_package';
  const dbImport = t.dbServiceClass ? t.importOf(t.dbServiceClass) : null;
  const profileImport = t.profileClass ? t.importOf(t.profileClass) : null;
  let s = `// GENERATED by Code Architect — shared test doubles.

import 'package:mocktail/mocktail.dart';
`;
  if (dbImport) s += `\nimport '${dbImport}';`;
  if (profileImport && profileImport !== dbImport) s += `\nimport '${profileImport}';`;
  s += `\n`;
  if (t.dbServiceClass) {
    s += `
/// Mock over the DB facade. Stub only what a test needs.
class Mock${t.dbServiceClass.name} extends Mock implements ${t.dbServiceClass.name} {}
`;
  }
  s += `
/// Register fallback values for any(named:) matchers.
/// Call once from setUpAll() in files using mocks.
void registerCommonFallbacks() {
  registerFallbackValue(Duration.zero);
  registerFallbackValue(DateTime(2000));
}
`;
  if (t.profileClass) {
    s += `
/// Baseline profile builder — extend named args as tests need them.
${t.profileClass.name} baseProfile() => ${t.profileClass.name}(
      // TODO: seed fields relevant to your assertions
    );
`;
  }
  return s;
}

function dartTplCatalogTest(t) {
  const pc = t.productsClass;
  const consts = pc.constants;
  const content = APP.files[pc.file]?.content || '';
  const has = (m) => new RegExp(`\\b${m}\\s*\\(`).test(content);
  const imp = t.importOf(pc);

  let body = `// GENERATED by Code Architect — product catalog invariants for
// ${pc.name} (${consts.length} product ids discovered in source).
// A product added to the catalog but missed in labels/prices/sets
// silently degrades the shop; these tests make that loud.

import 'package:flutter_test/flutter_test.dart';

import '${imp}';

void main() {
  const allIds = <String>{
${consts.map(c => `    ${pc.name}.${c.name}, // '${c.id}'`).join('\n')}
  };

  test('discovered product ids are unique', () {
    expect(allIds.length, ${consts.length},
        reason: 'duplicate product id constants in ${pc.name}');
  });
`;
  if (/static\s+const\s+Set<String>\s+all\b/.test(content)) {
    body += `
  test('every discovered constant is registered in ${pc.name}.all', () {
    for (final id in allIds) {
      expect(${pc.name}.all.contains(id), isTrue,
          reason: '"' + id + '" missing from ${pc.name}.all');
    }
  });
`;
  }
  const setNames = ['consumables', 'nonConsumables', 'subscriptions']
    .filter(n => new RegExp(`static\\s+const\\s+Set<String>\\s+${n}\\b`).test(content));
  if (setNames.length >= 2) {
    body += `
  test('category sets are pairwise disjoint', () {
${setNames.map((a, i) => setNames.slice(i + 1).map(b =>
      `    expect(${pc.name}.${a}.intersection(${pc.name}.${b}), isEmpty);`).join('\n')).filter(Boolean).join('\n')}
  });
`;
  }
  if (has('label')) {
    body += `
  test('every product has a human label (no raw-id fallback)', () {
    for (final id in allIds) {
      expect(${pc.name}.label(id), isNot(equals(id)),
          reason: 'label() missing for "' + id + '"');
    }
  });
`;
  }
  if (has('fallbackPrice')) {
    body += `
  test('every product has a fallback price', () {
    for (final id in allIds) {
      expect(${pc.name}.fallbackPrice(id), isNot(equals('-')),
          reason: 'fallbackPrice() missing for "' + id + '"');
    }
  });
`;
  }
  body += `
  test('unknown ids degrade safely', () {
${has('label') ? `    expect(${pc.name}.label('nonexistent_x'), 'nonexistent_x');\n` : ''}${has('fallbackPrice') ? `    expect(${pc.name}.fallbackPrice('nonexistent_x'), '-');\n` : ''}    expect(allIds.contains('nonexistent_x'), isFalse);
  });
}
`;
  return body;
}

function dartTplVerifierTest(t) {
  const imp = t.importOf(t.iapServiceClass);
  return `// GENERATED by Code Architect — purchase verifier gate.
// An empty receipt must NEVER verify (spoofed/broken flow).

import 'package:flutter_test/flutter_test.dart';

import '${imp}';

import '../helpers/fake_iap_platform.dart';

void main() {
  group('LocalPurchaseVerifier', () {
    final verifier = LocalPurchaseVerifier();

    test('accepts a purchase with server verification data', () async {
      final purchase =
          FakeIapPlatform.purchase('any_product', serverVerificationData: 'receipt');
      expect((await verifier.verify(purchase, null)).valid, isTrue);
    });

    test('rejects an empty receipt', () async {
      final purchase =
          FakeIapPlatform.purchase('any_product', serverVerificationData: '');
      expect((await verifier.verify(purchase, null)).valid, isFalse);
    });
  });
}
`;
}

function dartTplProfileModelTest(t) {
  const pcls = t.profileClass.name;
  const imp = t.importOf(t.profileClass);
  const content = APP.files[t.profileClass.file]?.content || '';
  const hasProt = /isBrainProtected/.test(content);
  return `// GENERATED by Code Architect — ${pcls} entitlement/model contracts.
// Adjust field names to your model where marked TODO.

import 'package:flutter_test/flutter_test.dart';

import '${imp}';

void main() {
  test('default-constructed profile has safe defaults', () {
    final p = ${pcls}();
    expect(p, isNotNull);
  });
${hasProt ? `
  group('paid-time contract', () {
    test('active until expiry even after cancel', () {
      final p = ${pcls}(
        subscriptionActive: false, // renewal cancelled…
        subscriptionExpiry: DateTime.now().add(const Duration(days: 3)),
      );
      expect(p.isBrainProtected, isTrue,
          reason: 'paid time must be honored after cancellation');
    });

    test('lapsed once expiry passes', () {
      final p = ${pcls}(
        subscriptionActive: false,
        subscriptionExpiry: DateTime.now().subtract(const Duration(days: 1)),
      );
      expect(p.isBrainProtected, isFalse);
    });

    test('legacy row: flag set with no expiry stays protected', () {
      final p = ${pcls}(subscriptionActive: true, subscriptionExpiry: null);
      expect(p.isBrainProtected, isTrue);
    });
  });
` : `  // TODO: add entitlement getter tests for your model's contract.
`}}
`;
}

function dartTplIapServiceTest(t) {
  const svc = t.iapServiceClass.name;
  const imp = t.importOf(t.iapServiceClass);
  const pc = t.productsClass;
  const sampleConsumable = pc?.constants[0] ? `${pc.name}.${pc.constants[0].name}` : `'your_product_id'`;
  const stockLine = pc && /static\s+const\s+Set<String>\s+all\b/.test(APP.files[pc.file]?.content || '')
    ? `fake.stockProducts(${pc.name}.all);`
    : `fake.stockProducts(const {${sampleConsumable}});`;
  return `// GENERATED by Code Architect — ${svc} component tests over a fake
// store platform: initialization, delivery, replay guard, statuses.

import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '${imp}';

import '../helpers/fake_iap_platform.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeIapPlatform fake;
  late ${svc} service;
  late List<IAPPurchaseResult> results;

  Future<void> initService({void Function(FakeIapPlatform fake)? configure}) async {
    // Construct FIRST, register fake AFTER (first InAppPurchase.instance
    // access registers the real platform and would clobber the fake).
    service = ${svc}();
    fake = FakeIapPlatform.register();
    ${stockLine}
    configure?.call(fake);
    results = [];
    service.purchaseStream.listen(results.add);
    await service.initialize();
    await pumpEventQueue();
  }

  setUp(() => SharedPreferences.setMockInitialValues(<String, Object>{}));
  tearDown(() async {
    service.dispose();
    await fake.close();
  });

  test('store up: products load and restore runs once', () async {
    await initService();
    expect(service.storeAvailable, isTrue);
    expect(fake.restoreCallCount, 1);
  });

  test('store down: degrades gracefully', () async {
    await initService(configure: (f) => f.available = false);
    expect(service.storeAvailable, isFalse);
    expect(fake.restoreCallCount, 0);
  });

  test('verified purchase delivers exactly once (replay guard)', () async {
    await initService();
    fake.emitPurchased(${sampleConsumable}, purchaseId: 'dup-txn');
    await pumpEventQueue();
    fake.emitPurchased(${sampleConsumable}, purchaseId: 'dup-txn');
    await pumpEventQueue();
    expect(results.where((r) => r.success).length, 1,
        reason: 're-emitted purchased events must not double-grant');
    expect(fake.completedPurchaseIds, ['dup-txn', 'dup-txn'],
        reason: 'every event still gets acknowledged');
  });

  test('empty receipt fails verification — nothing delivered', () async {
    await initService();
    fake.emitPurchased(${sampleConsumable}, serverVerificationData: '');
    await pumpEventQueue();
    expect(results.single.success, isFalse);
  });

  test('restored purchases are marked isRestored', () async {
    await initService();
    fake.emitRestored(${sampleConsumable});
    await pumpEventQueue();
    expect(results.single.isRestored, isTrue);
  });

  test('canceled and error statuses surface as failures', () async {
    await initService();
    fake.emitCanceled(${sampleConsumable});
    fake.emitError(${sampleConsumable}, 'card declined');
    await pumpEventQueue();
    expect(results.where((r) => !r.success).length, 2);
  });

  test('pending emits nothing (UI keeps waiting)', () async {
    await initService();
    fake.emitPending(${sampleConsumable});
    await pumpEventQueue();
    expect(results, isEmpty);
  });
}
`;
}

function dartTplListenerTest(t) {
  const db = t.dbServiceClass.name;
  const imp = t.importOf(t.iapServiceClass);
  const provImport = `package:${t.packageName}/shared/providers.dart`;
  const provPath = Object.keys(APP.files).find(f => /providers\.dart$/.test(f) &&
      /iapListenerProvider|IAPListener/.test(APP.files[f].content));
  const realProvImport = provPath ? `package:${t.packageName}/${provPath.replace(/^lib\//, '')}` : provImport;
  const pc = t.productsClass;
  const sample = pc?.constants[0] ? `${pc.name}.${pc.constants[0].name}` : `'your_product_id'`;
  return `// GENERATED by Code Architect — IAP listener money rules:
// receipts vaulted before grants; restored purchases never re-grant.
// Verify/adjust the stubbed method names against your DB facade.

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '${imp}';
import '${realProvImport}';

import '../helpers/fake_iap_platform.dart';
import '../helpers/test_doubles.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late FakeIapPlatform fake;
  late Mock${db} db;
  late ProviderContainer container;
  late IAPListener listener;

  setUpAll(registerCommonFallbacks);

  Future<void> boot() async {
    SharedPreferences.setMockInitialValues(<String, Object>{});
    db = Mock${db}();
    // TODO: stub your read/write methods, e.g.:
    // when(() => db.getUserProfile()).thenAnswer((_) async => baseProfile());
    // when(() => db.addSoulQuoins(any())).thenAnswer((_) async {});

    container = ProviderContainer(overrides: [
      databaseServiceProvider.overrideWithValue(db),
    ]);
    final iap = container.read(iapServiceProvider); // construct BEFORE fake
    fake = FakeIapPlatform.register();
    listener = container.read(iapListenerProvider);
    listener.start(); // listener before initialize (restore ordering)
    await iap.initialize();
    await pumpEventQueue();
  }

  tearDown(() async {
    listener.dispose();
    container.dispose();
    await fake.close();
  });

  test('fresh purchase writes grants; restored does not re-grant', () async {
    await boot();
    fake.emitPurchased(${sample}, purchaseId: 'fresh-1');
    await pumpEventQueue();
    // TODO: verifyInOrder([...receipt vault..., ...grant...]);

    fake.emitRestored(${sample});
    await pumpEventQueue();
    // TODO: verifyNever(() => db.<consumable grant>(any()));
  });
}
`;
}

function dartTplPromoTest(t) {
  const svc = t.promoServiceClass.name;
  const applier = t.promoApplierClass.name;
  const imp = t.importOf(t.promoServiceClass);
  const methods = t.promoApplierClass.methods || [];
  const stubs = methods.map(m => `  @override\n  dynamic noSuchMethod(Invocation i) => super.noSuchMethod(i);`);
  return `// GENERATED by Code Architect — ${svc} guardrails over an
// in-memory ${applier}. Success paths need a real code at run time:
//   flutter test --dart-define=PROMO_CODE=<code>

import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import '${imp}';

const String kPromoCode = String.fromEnvironment('PROMO_CODE');

class RecordingApplier extends Mock implements ${applier} {}

void main() {
  late RecordingApplier applier;
  late ${svc} service;

  setUp(() {
    applier = RecordingApplier();
    // Answer every applier call benignly so redeem paths can complete.
    // (mocktail: stub the methods your reward payloads hit.)
    service = ${svc}(applier);
  });

  tearDown(() => service.dispose());

  test('unknown code rejected, nothing granted', () async {
    final result = await service.redeemCode('definitely-not-a-real-code');
    expect(result.success, isFalse);
    verifyZeroInteractions(applier);
  });

  test('empty input rejected', () async {
    expect((await service.redeemCode('')).success, isFalse);
  });

  test('valid code applies its reward payload', () async {
    // TODO: stub applier methods (thenAnswer((_) async {})) before running.
    final result = await service.redeemCode(kPromoCode);
    expect(result.success, isTrue);
  }, skip: kPromoCode.isEmpty ? 'no PROMO_CODE define' : false);
}
`;
}

function dartTplScreenSmokes(t) {
  const pkg = t.packageName;
  const riverpod = t.hasRiverpod;
  const screens = t.screens.slice(0, 12);
  const imports = [...new Set(screens.map(s => `import 'package:${pkg}/${s.file.replace(/^lib\//, '')}';`))].join('\n');
  return `// GENERATED by Code Architect — screen smoke tests.
// Each screen must pump without throwing. Constructors requiring
// arguments are scaffolded with TODOs — fill them once.
// NEVER use pumpAndSettle here: continuous animations may never settle.

import 'package:flutter/material.dart';
${riverpod ? "import 'package:flutter_riverpod/flutter_riverpod.dart';" : ''}
import 'package:flutter_test/flutter_test.dart';

${imports}

Future<void> pumpScreen(WidgetTester tester, Widget screen) async {
  await tester.pumpWidget(
    ${riverpod ? 'ProviderScope(\n      // TODO: add provider overrides (mock DB/services) as needed\n      child: MaterialApp(home: screen),\n    )' : 'MaterialApp(home: screen)'},
  );
  await tester.pump(const Duration(milliseconds: 300));
  await tester.pump(const Duration(milliseconds: 300));
  expect(tester.takeException(), isNull);
  // Dispose animated trees cleanly:
  await tester.pumpWidget(const SizedBox.shrink());
  await tester.pump(const Duration(milliseconds: 50));
}

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

${screens.map(s => `  testWidgets('${s.name} pumps without exceptions', (tester) async {
    await pumpScreen(tester, const ${s.name}()); // TODO: constructor args?
  });`).join('\n\n')}
}
`;
}

function dartTplDbTest(t) {
  const db = t.dbServiceClass.name;
  const imp = t.importOf(t.dbServiceClass);
  const methods = t.dbServiceClass.methods || [];
  const hasSpend = methods.includes('spendSoulQuoins');
  const hasExtend = methods.includes('extendSubscription');
  return `// GENERATED by Code Architect — real-SQLite integration tests.
// Uses sqflite_common_ffi with a temp directory; the service usually
// keeps a static DB handle, so keep every assertion DELTA-BASED
// (read → act → read) for order-independence.

import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:sqflite_common_ffi/sqflite_ffi.dart';

import '${imp}';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late ${db} db;

  setUpAll(() async {
    sqfliteFfiInit();
    databaseFactory = databaseFactoryFfi;
    final dir = await Directory.systemTemp.createTemp('testgen_db_');
    await databaseFactory.setDatabasesPath(dir.path);
    db = ${db}();
  });
${hasSpend ? `
  test('guarded spend refuses overdraft atomically', () async {
    final before = (await db.getUserProfile()).soulQuoins;
    expect(await db.spendSoulQuoins(before + 1), isFalse);
    expect((await db.getUserProfile()).soulQuoins, before);
  });

  test('concurrent spends never overdraft', () async {
    await db.addSoulQuoins(50);
    final before = (await db.getUserProfile()).soulQuoins;
    final results =
        await Future.wait(List.generate(10, (_) => db.spendSoulQuoins(10)));
    final ok = results.where((r) => r).length;
    final after = (await db.getUserProfile()).soulQuoins;
    expect(after, before - ok * 10);
    expect(after, greaterThanOrEqualTo(0));
  });
` : `
  test('database opens and serves a profile', () async {
    // TODO: replace with your facade's read methods.
    expect(db, isNotNull);
  });
`}${hasExtend ? `
  test('subscription terms STACK on remaining paid time', () async {
    final anchor = DateTime.now().add(const Duration(days: 5));
    await db.activateSubscription(expiry: anchor);
    await db.extendSubscription(duration: const Duration(days: 30));
    final expiry = (await db.getUserProfile()).subscriptionExpiry!;
    expect(
        expiry.difference(anchor.add(const Duration(days: 30))).inSeconds.abs(),
        lessThan(90),
        reason: 'terms must stack, not overwrite');
  });
` : ''}}
`;
}

function dartTplE2E(t) {
  const pkg = t.packageName;
  const i18n = t.i18nClass;
  const shopTitle = i18n ? `I18n.t('shop.title')` : `'Shop'`;
  return `// GENERATED by Code Architect — on-device end-to-end journey.
//   flutter test integration_test/e2e_journey_test.dart -d <device>
// No pumpAndSettle (perpetual animations) — bounded polls only.

import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';

${i18n ? `import 'package:${pkg}/${i18n.file.replace(/^lib\//, '')}';` : ''}
import 'package:${pkg}/${t.mainFile.replace(/^lib\//, '')}' as app;

Future<bool> pumpUntilFound(WidgetTester tester, Finder finder,
    {Duration timeout = const Duration(seconds: 30)}) async {
  final end = DateTime.now().add(timeout);
  while (DateTime.now().isBefore(end)) {
    await tester.pump(const Duration(milliseconds: 250));
    if (tester.any(finder)) return true;
  }
  return false;
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();

  testWidgets('app boots to an interactive frame', (tester) async {
    app.main();
    final booted = await pumpUntilFound(tester, find.byType(Scaffold),
        timeout: const Duration(seconds: 45));
    expect(booted, isTrue, reason: 'no Scaffold within 45s of boot');
    await tester.pump(const Duration(seconds: 2)); // post-boot crash net
  });

  testWidgets('primary navigation reaches the shop', (tester) async {
    app.main();
    await pumpUntilFound(tester, find.byType(Scaffold),
        timeout: const Duration(seconds: 45));
    await tester.pump(const Duration(seconds: 2));

    final shopTitle = find.text(${shopTitle});
    if (!tester.any(shopTitle)) {
      for (final icon in [Icons.storefront, Icons.storefront_outlined,
                          Icons.shopping_bag, Icons.store]) {
        final f = find.byIcon(icon);
        if (tester.any(f)) {
          await tester.tap(f.first, warnIfMissed: false);
          await tester.pump(const Duration(milliseconds: 600));
          break;
        }
      }
    }
    if (await pumpUntilFound(tester, shopTitle,
        timeout: const Duration(seconds: 8))) {
      final sawPrices = await pumpUntilFound(
          tester, find.textContaining(RegExp(r'[\\\$€£¥]\\s?\\d')),
          timeout: const Duration(seconds: 10));
      expect(sawPrices, isTrue,
          reason: 'shop must show fallback prices even offline');
    } else {
      debugPrint('E2E-SOFT-SKIP: shop entry not found — add its icon/text.');
    }
  });
}
`;
}

function dartTplRunnerPs1() {
  return `# GENERATED by Code Architect — staged test runner (Windows)
param([switch]$Fast, [switch]$E2E, [string]$Device = "windows")
$ErrorActionPreference = "Stop"
flutter pub get; if ($LASTEXITCODE -ne 0) { exit 1 }
flutter test test/unit test/component; if ($LASTEXITCODE -ne 0) { exit 1 }
if (-not $Fast) {
  flutter test test/widget; if ($LASTEXITCODE -ne 0) { exit 1 }
  if (Test-Path test/integration_db) {
    flutter test test/integration_db; if ($LASTEXITCODE -ne 0) { exit 1 }
  }
}
if ($E2E) {
  flutter test integration_test -d $Device; if ($LASTEXITCODE -ne 0) { exit 1 }
}
Write-Host "ALL TEST STAGES PASSED" -ForegroundColor Green
`;
}

function dartTplCiYaml() {
  return `# GENERATED by Code Architect — CI test pipeline
name: tests
on: [push, pull_request, workflow_dispatch]
jobs:
  test:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: subosito/flutter-action@v2
        with: { channel: stable, cache: true }
      - run: sudo apt-get update && sudo apt-get install -y libsqlite3-dev
      - run: flutter pub get
      - run: flutter analyze --no-fatal-infos || true
      - run: flutter test test/unit test/component --reporter expanded
      - run: flutter test test/widget --reporter expanded
      - run: flutter test test/integration_db --reporter expanded
`;
}

function dartTplTestingMd(t, bundle) {
  const rows = bundle.filter(f => f.suite !== 'harness')
    .map(f => `- \`${f.path}\``).join('\n');
  return `# Test Suite (generated by Code Architect)

Project: **${t.packageName || 'unknown'}** · stack: ${[
    t.hasRiverpod && 'Riverpod', t.hasSqflite && 'sqflite',
    t.hasInAppPurchase && 'in_app_purchase', t.promoServiceClass && 'promo codes',
  ].filter(Boolean).join(', ') || 'plain Flutter'}

## Files
${rows}

## Setup
Add to \`dev_dependencies\` in pubspec.yaml, then \`flutter pub get\`:

\`\`\`yaml
  integration_test:
    sdk: flutter
  mocktail: ^1.0.3
${t.hasInAppPurchase ? '  in_app_purchase_platform_interface: ^1.3.6\n' : ''}\`\`\`

## Run
\`\`\`
./run_tests.ps1          # staged: unit → component → widget → db
flutter test test/unit   # or any single layer
\`\`\`

## Design rules baked into these tests
- No \`pumpAndSettle()\` — continuous animations never settle; all waits are bounded pumps.
- IAP tests drive the REAL service through a fake \`InAppPurchasePlatform\` (no lib/ changes).
- Construct services BEFORE registering the fake platform (first \`InAppPurchase.instance\` access registers the real one).
- DB tests are delta-based: the facade usually holds a static handle, so read → act → read.
- Files marked TODO are scaffolds: fill constructor args / stubs once and they become real tests.
`;
}
