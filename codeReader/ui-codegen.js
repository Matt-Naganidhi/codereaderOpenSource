/* ═══════════════════════════════════════════════════
   Code Architect — ui-codegen.js
   Universal code generation panel
   ═══════════════════════════════════════════════════ */

let codegenTab = 'field';

function renderCodeGen() {
  const panel = document.getElementById('panel-codegen');
  const pt = APP.parsed.projectType;
  const tabs = getCodegenTabs(pt);

  panel.innerHTML = `
    <div class="codegen">
      <div class="codegen-sidebar">
        <div class="codegen-tabs">
          ${tabs.map(t => `<button class="codegen-tab ${t.id===codegenTab?'active':''}" data-cg="${t.id}" onclick="switchCodegenTab('${t.id}')">${t.icon} ${t.label}</button>`).join('')}
        </div>
        <div class="codegen-form" id="codegen-form"></div>
      </div>
      <div class="codegen-output" id="codegen-output">
        <div class="diff-empty"><div style="font-size:28px;opacity:0.3">◇</div>Fill in the form and click Generate</div>
      </div>
    </div>`;
  if (!tabs.find(t => t.id === codegenTab)) codegenTab = tabs[0]?.id || 'field';
  renderCodegenForm();
}

function getCodegenTabs(pt) {
  if (pt === 'dart') return [
    { id: 'field', icon: '◆', label: 'Field' },
    { id: 'screen', icon: '◈', label: 'Screen' },
    { id: 'provider', icon: '◉', label: 'Provider' },
    { id: 'ai', icon: '◎', label: 'AI Gen' },
  ];
  if (pt === 'python') return [
    { id: 'field', icon: '◆', label: 'Attribute' },
    { id: 'screen', icon: '◈', label: 'View/Route' },
    { id: 'class', icon: '◉', label: 'Class' },
    { id: 'ai', icon: '◎', label: 'AI Gen' },
  ];
  if (pt === 'javascript') return [
    { id: 'field', icon: '◆', label: 'Property' },
    { id: 'screen', icon: '◈', label: 'Component' },
    { id: 'class', icon: '◉', label: 'Route/Hook' },
    { id: 'ai', icon: '◎', label: 'AI Gen' },
  ];
  if (pt === 'sql') return [
    { id: 'field', icon: '◆', label: 'Column' },
    { id: 'screen', icon: '◈', label: 'Table' },
    { id: 'ai', icon: '◎', label: 'AI Gen' },
  ];
  return [
    { id: 'field', icon: '◆', label: 'Field' },
    { id: 'screen', icon: '◈', label: 'Scaffold' },
    { id: 'ai', icon: '◎', label: 'AI Gen' },
  ];
}

function switchCodegenTab(tab) {
  codegenTab = tab;
  document.querySelectorAll('.codegen-tab').forEach(t => t.classList.toggle('active', t.dataset.cg === tab));
  renderCodegenForm();
}

function renderCodegenForm() {
  const form = document.getElementById('codegen-form');
  const pt = APP.parsed.projectType;
  const models = APP.parsed.classes.filter(c => !c.widgetType);
  const modelOpts = models.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

  if (codegenTab === 'ai') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">DESCRIBE THE FEATURE</label><textarea class="form-input" id="cg-ai-prompt" rows="6" style="resize:vertical;line-height:1.6" placeholder="Describe what you want to add..."></textarea><div class="form-tip">Be specific about the feature and patterns</div></div>
      <div id="cg-ai-status" style="font-size:11px;margin-bottom:8px"></div>
      <button class="btn-generate" id="cg-ai-btn" onclick="generateAI()">ASK CLAUDE TO GENERATE</button>`;
    return;
  }

  if (pt === 'dart') renderDartForm(form, modelOpts);
  else if (pt === 'python') renderPythonForm(form, modelOpts);
  else if (pt === 'javascript') renderJSForm(form, modelOpts);
  else if (pt === 'sql') renderSQLForm(form, modelOpts);
  else renderGenericForm(form, modelOpts);
}

/* ═══ DART FORMS ═══ */
function renderDartForm(form, modelOpts) {
  const TYPES = ['String','int','double','bool','DateTime','List<String>','Map<String, dynamic>'];
  if (codegenTab === 'field') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TARGET CLASS</label><select class="form-input" id="cg-model">${modelOpts||'<option>No classes</option>'}</select></div>
      <div class="form-group"><label class="form-label">FIELD NAME</label><input class="form-input" id="cg-field-name" placeholder="e.g. dialogueCount"></div>
      <div class="form-group"><label class="form-label">DART TYPE</label><select class="form-input" id="cg-field-type">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">DEFAULT VALUE</label><input class="form-input" id="cg-field-default" placeholder="Leave empty for auto"></div>
      <button class="btn-generate" onclick="generateField()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'screen') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">CLASS NAME</label><input class="form-input" id="cg-screen-name" placeholder="e.g. PartDialogue"></div>
      <div class="form-group"><label class="form-label">DISPLAY LABEL</label><input class="form-input" id="cg-screen-label" placeholder="e.g. Part Dialogue"></div>
      <div class="form-group"><label class="form-label">WIDGET TYPE</label><select class="form-input" id="cg-screen-type"><option value="stateful">ConsumerStatefulWidget</option><option value="stateless">ConsumerWidget</option></select></div>
      <button class="btn-generate" onclick="generateScreen()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'provider') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">PROVIDER NAME</label><input class="form-input" id="cg-prov-name" placeholder="e.g. dialogueSession"></div>
      <div class="form-group"><label class="form-label">STATE TYPE</label><input class="form-input" id="cg-prov-state" value="AsyncValue<List<dynamic>>"></div>
      <div class="form-group"><label class="form-label">PATTERN</label><select class="form-input" id="cg-prov-pattern"><option value="stateNotifier">StateNotifierProvider</option><option value="stateProvider">StateProvider</option><option value="futureProvider">FutureProvider</option></select></div>
      <button class="btn-generate" onclick="generateProvider()">GENERATE CODE CHANGES</button>`;
  }
}

/* ═══ PYTHON FORMS ═══ */
function renderPythonForm(form, modelOpts) {
  const TYPES = ['str','int','float','bool','list','dict','Optional[str]','List[str]','datetime'];
  if (codegenTab === 'field') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TARGET CLASS</label><select class="form-input" id="cg-model">${modelOpts||'<option>No classes</option>'}</select></div>
      <div class="form-group"><label class="form-label">ATTRIBUTE NAME</label><input class="form-input" id="cg-field-name" placeholder="e.g. dialogue_count"></div>
      <div class="form-group"><label class="form-label">TYPE HINT</label><select class="form-input" id="cg-field-type">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">DEFAULT VALUE</label><input class="form-input" id="cg-field-default" placeholder="Leave empty for None"></div>
      <button class="btn-generate" onclick="generatePythonField()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'screen') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">VIEW NAME</label><input class="form-input" id="cg-screen-name" placeholder="e.g. UserProfile"></div>
      <div class="form-group"><label class="form-label">FRAMEWORK</label><select class="form-input" id="cg-screen-type"><option value="django">Django View</option><option value="flask">Flask Route</option><option value="fastapi">FastAPI Endpoint</option></select></div>
      <div class="form-group"><label class="form-label">URL PATTERN</label><input class="form-input" id="cg-screen-url" placeholder="e.g. /users/profile"></div>
      <button class="btn-generate" onclick="generatePythonView()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'class') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">CLASS NAME</label><input class="form-input" id="cg-class-name" placeholder="e.g. UserService"></div>
      <div class="form-group"><label class="form-label">BASE CLASS</label><input class="form-input" id="cg-class-base" placeholder="e.g. object (leave empty for none)"></div>
      <div class="form-group"><label class="form-label">METHODS (comma-sep)</label><input class="form-input" id="cg-class-methods" placeholder="e.g. get_user, create_user, delete_user"></div>
      <button class="btn-generate" onclick="generatePythonClass()">GENERATE CODE CHANGES</button>`;
  }
}

/* ═══ JS FORMS ═══ */
function renderJSForm(form, modelOpts) {
  const TYPES = ['string','number','boolean','object','Array','null','undefined','Promise'];
  if (codegenTab === 'field') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TARGET CLASS</label><select class="form-input" id="cg-model">${modelOpts||'<option>No classes</option>'}</select></div>
      <div class="form-group"><label class="form-label">PROPERTY NAME</label><input class="form-input" id="cg-field-name" placeholder="e.g. dialogueCount"></div>
      <div class="form-group"><label class="form-label">TYPE</label><select class="form-input" id="cg-field-type">${TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">DEFAULT VALUE</label><input class="form-input" id="cg-field-default" placeholder="Leave empty for null"></div>
      <button class="btn-generate" onclick="generateJSField()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'screen') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">COMPONENT NAME</label><input class="form-input" id="cg-screen-name" placeholder="e.g. UserProfile"></div>
      <div class="form-group"><label class="form-label">TYPE</label><select class="form-input" id="cg-screen-type"><option value="functional">Functional Component</option><option value="class">Class Component</option></select></div>
      <div class="form-group"><label class="form-label">PROPS (comma-sep)</label><input class="form-input" id="cg-screen-props" placeholder="e.g. title, onSubmit, items"></div>
      <button class="btn-generate" onclick="generateJSComponent()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'class') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TYPE</label><select class="form-input" id="cg-route-type"><option value="express">Express Route</option><option value="hook">React Hook</option></select></div>
      <div class="form-group"><label class="form-label">NAME</label><input class="form-input" id="cg-route-name" placeholder="e.g. users or useUserData"></div>
      <div class="form-group"><label class="form-label">PATH / STATE TYPE</label><input class="form-input" id="cg-route-path" placeholder="e.g. /api/users or object"></div>
      <button class="btn-generate" onclick="generateJSRoute()">GENERATE CODE CHANGES</button>`;
  }
}

/* ═══ SQL FORMS ═══ */
function renderSQLForm(form, modelOpts) {
  const SQL_TYPES = ['INTEGER','VARCHAR(255)','TEXT','BOOLEAN','TIMESTAMP','DECIMAL(10,2)','SERIAL','UUID','JSONB','DATE'];
  if (codegenTab === 'field') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TARGET TABLE</label><select class="form-input" id="cg-model">${modelOpts||'<option>No tables</option>'}</select></div>
      <div class="form-group"><label class="form-label">COLUMN NAME</label><input class="form-input" id="cg-field-name" placeholder="e.g. dialogue_count"></div>
      <div class="form-group"><label class="form-label">DATA TYPE</label><select class="form-input" id="cg-field-type">${SQL_TYPES.map(t=>`<option>${t}</option>`).join('')}</select></div>
      <div class="form-group"><label class="form-label">CONSTRAINTS</label><input class="form-input" id="cg-field-default" placeholder="e.g. NOT NULL DEFAULT 0"></div>
      <button class="btn-generate" onclick="generateSQLColumn()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'screen') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TABLE NAME</label><input class="form-input" id="cg-table-name" placeholder="e.g. user_sessions"></div>
      <div class="form-group"><label class="form-label">COLUMNS (name:type, ...)</label><textarea class="form-input" id="cg-table-cols" rows="4" placeholder="id:SERIAL PRIMARY KEY\nuser_id:INTEGER NOT NULL\ncreated_at:TIMESTAMP DEFAULT NOW()"></textarea></div>
      <button class="btn-generate" onclick="generateSQLTable()">GENERATE CODE CHANGES</button>`;
  }
}

/* ═══ GENERIC FORMS ═══ */
function renderGenericForm(form, modelOpts) {
  if (codegenTab === 'field') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">TARGET CLASS</label><select class="form-input" id="cg-model">${modelOpts||'<option>No classes</option>'}</select></div>
      <div class="form-group"><label class="form-label">FIELD NAME</label><input class="form-input" id="cg-field-name" placeholder="e.g. count"></div>
      <div class="form-group"><label class="form-label">TYPE</label><input class="form-input" id="cg-field-type" placeholder="e.g. int, string"></div>
      <div class="form-group"><label class="form-label">DEFAULT VALUE</label><input class="form-input" id="cg-field-default" placeholder="Leave empty"></div>
      <button class="btn-generate" onclick="generateGenericField()">GENERATE CODE CHANGES</button>`;
  } else if (codegenTab === 'screen') {
    form.innerHTML = `
      <div class="form-group"><label class="form-label">FILE NAME</label><input class="form-input" id="cg-screen-name" placeholder="e.g. UserView"></div>
      <div class="form-group"><label class="form-label">DESCRIPTION</label><input class="form-input" id="cg-screen-label" placeholder="e.g. User profile view"></div>
      <button class="btn-generate" onclick="generateGenericScaffold()">GENERATE CODE CHANGES</button>`;
  }
}

/* ═══ GENERATION FUNCTIONS ═══ */

function dartDefault(type) {
  return { String:"''", int:"0", double:"0.0", bool:"false", DateTime:"DateTime.now()", "List<String>":"const []", "Map<String, dynamic>":"const {}" }[type] || "null";
}

function generateField() {
  const model=document.getElementById('cg-model')?.value, name=document.getElementById('cg-field-name')?.value?.trim();
  const type=document.getElementById('cg-field-type')?.value, def=document.getElementById('cg-field-default')?.value||dartDefault(type);
  if (!name||!model) return;
  renderDiff({ [`${model} model`]: {
    description:`Add '${name}' (${type}) to ${model}`,
    diff:[
      {type:'context',code:`class ${model} {`},{type:'context',code:`  // ... existing fields ...`},
      {type:'add',code:`  final ${type} ${name};`,note:'NEW FIELD'},{type:'context',code:''},
      {type:'context',code:`  const ${model}({`},{type:'add',code:`    this.${name} = ${def},`,note:`defaults to ${def}`},
      {type:'context',code:`  });`},{type:'context',code:''},
      {type:'context',code:`  ${model} copyWith({`},{type:'add',code:`    ${type}? ${name},`,note:'nullable = optional'},
      {type:'context',code:`  }) => ${model}(`},{type:'add',code:`    ${name}: ${name} ?? this.${name},`},
      {type:'context',code:`  );`},
    ],
  }});
}

function generateScreen() {
  const name=document.getElementById('cg-screen-name')?.value?.trim(), label=document.getElementById('cg-screen-label')?.value||name;
  const type=document.getElementById('cg-screen-type')?.value;
  if (!name) return;
  const fn = name.replace(/([A-Z])/g,(m,p,i)=>(i?'_':'')+m.toLowerCase());
  const diff = type==='stateful' ? [
    {type:'add',code:`import 'package:flutter/material.dart';`},{type:'add',code:`import 'package:flutter_riverpod/flutter_riverpod.dart';`},
    {type:'add',code:''},{type:'add',code:`class ${name}Screen extends ConsumerStatefulWidget {`,note:'Stateful + Riverpod'},
    {type:'add',code:`  const ${name}Screen({super.key});`},{type:'add',code:`  @override`},
    {type:'add',code:`  ConsumerState<${name}Screen> createState() => _${name}ScreenState();`},{type:'add',code:`}`},
    {type:'add',code:''},{type:'add',code:`class _${name}ScreenState extends ConsumerState<${name}Screen> {`},
    {type:'add',code:`  @override`},{type:'add',code:`  Widget build(BuildContext context) {`},
    {type:'add',code:`    return Scaffold(`},{type:'add',code:`      appBar: AppBar(title: Text('${label}')),`},
    {type:'add',code:`      body: const Center(child: Text('${label}')),`},{type:'add',code:`    );`},{type:'add',code:`  }`},{type:'add',code:`}`},
  ] : [
    {type:'add',code:`import 'package:flutter/material.dart';`},{type:'add',code:`import 'package:flutter_riverpod/flutter_riverpod.dart';`},
    {type:'add',code:''},{type:'add',code:`class ${name}Screen extends ConsumerWidget {`,note:'Stateless + Riverpod'},
    {type:'add',code:`  const ${name}Screen({super.key});`},{type:'add',code:`  @override`},
    {type:'add',code:`  Widget build(BuildContext context, WidgetRef ref) {`},{type:'add',code:`    return Scaffold(`},
    {type:'add',code:`      appBar: AppBar(title: Text('${label}')),`},{type:'add',code:`      body: const Center(child: Text('${label}')),`},
    {type:'add',code:`    );`},{type:'add',code:`  }`},{type:'add',code:`}`},
  ];
  renderDiff({ [`NEW: ${fn}_screen.dart`]: { description:`New ${label} screen`, diff } });
}

function generateProvider() {
  const name=document.getElementById('cg-prov-name')?.value?.trim();
  const stateType=document.getElementById('cg-prov-state')?.value||'AsyncValue<List<dynamic>>';
  const pattern=document.getElementById('cg-prov-pattern')?.value;
  if (!name) return;
  const not = name.charAt(0).toUpperCase()+name.slice(1)+'Notifier';
  const diffs = {
    stateNotifier:[{type:'add',code:`final ${name}Provider =`},{type:'add',code:`    StateNotifierProvider<${not}, ${stateType}>((ref) {`},
      {type:'add',code:`  return ${not}();`},{type:'add',code:`});`},{type:'add',code:''},
      {type:'add',code:`class ${not} extends StateNotifier<${stateType}> {`},
      {type:'add',code:`  ${not}() : super(const AsyncValue.loading()) { _load(); }`},
      {type:'add',code:`  Future<void> _load() async { /* Load data */ }`},{type:'add',code:`}`}],
    stateProvider:[{type:'add',code:`final ${name}Provider = StateProvider<${stateType}>((ref) => null);`}],
    futureProvider:[{type:'add',code:`final ${name}Provider = FutureProvider<${stateType}>((ref) async {`},
      {type:'add',code:`  return {};`},{type:'add',code:`});`}],
  };
  renderDiff({ 'providers.dart': { description:`Add ${name} provider (${pattern})`, diff: diffs[pattern]||diffs.stateNotifier }});
}

/* ═══ PYTHON GENERATORS ═══ */

function generatePythonField() {
  const model=document.getElementById('cg-model')?.value, name=document.getElementById('cg-field-name')?.value?.trim();
  const type=document.getElementById('cg-field-type')?.value, def=document.getElementById('cg-field-default')?.value||'None';
  if (!name||!model) return;
  renderDiff({ [`${model}`]: { description:`Add '${name}' (${type}) to ${model}`, diff:[
    {type:'context',code:`class ${model}:`},{type:'context',code:`    # ... existing attributes ...`},
    {type:'add',code:`    ${name}: ${type} = ${def}`,note:'NEW ATTRIBUTE'},{type:'context',code:''},
    {type:'context',code:`    def __init__(self, ...):`},{type:'add',code:`        self.${name} = ${name}`,note:'Init'},
  ]}});
}

function generatePythonView() {
  const name=document.getElementById('cg-screen-name')?.value?.trim();
  const framework=document.getElementById('cg-screen-type')?.value;
  const url=document.getElementById('cg-screen-url')?.value||'/';
  if (!name) return;
  const fn = name.replace(/([A-Z])/g,(m,p,i)=>(i?'_':'')+m.toLowerCase());
  let diff;
  if (framework === 'django') {
    diff = [
      {type:'add',code:`from django.views import View`},{type:'add',code:`from django.http import JsonResponse`},
      {type:'add',code:''},{type:'add',code:`class ${name}View(View):`,note:'Django Class-Based View'},
      {type:'add',code:`    def get(self, request):`},{type:'add',code:`        return JsonResponse({'status': 'ok'})`},
      {type:'add',code:''},{type:'add',code:`    def post(self, request):`},
      {type:'add',code:`        return JsonResponse({'status': 'created'}, status=201)`},
      {type:'add',code:''},{type:'add',code:`# urls.py`},{type:'add',code:`# path('${url}', ${name}View.as_view()),`},
    ];
  } else if (framework === 'flask') {
    diff = [
      {type:'add',code:`from flask import Blueprint, jsonify, request`},
      {type:'add',code:''},{type:'add',code:`${fn}_bp = Blueprint('${fn}', __name__)`,note:'Flask Blueprint'},
      {type:'add',code:''},{type:'add',code:`@${fn}_bp.route('${url}', methods=['GET'])`},
      {type:'add',code:`def get_${fn}():`},{type:'add',code:`    return jsonify({'status': 'ok'})`},
      {type:'add',code:''},{type:'add',code:`@${fn}_bp.route('${url}', methods=['POST'])`},
      {type:'add',code:`def create_${fn}():`},{type:'add',code:`    data = request.get_json()`},
      {type:'add',code:`    return jsonify({'status': 'created'}), 201`},
    ];
  } else {
    diff = [
      {type:'add',code:`from fastapi import APIRouter`},
      {type:'add',code:''},{type:'add',code:`router = APIRouter()`,note:'FastAPI Router'},
      {type:'add',code:''},{type:'add',code:`@router.get('${url}')`},
      {type:'add',code:`async def get_${fn}():`},{type:'add',code:`    return {'status': 'ok'}`},
      {type:'add',code:''},{type:'add',code:`@router.post('${url}')`},
      {type:'add',code:`async def create_${fn}(data: dict):`},{type:'add',code:`    return {'status': 'created'}`},
    ];
  }
  renderDiff({ [`NEW: ${fn}_view.py`]: { description:`New ${name} ${framework} view`, diff }});
}

function generatePythonClass() {
  const name=document.getElementById('cg-class-name')?.value?.trim();
  const base=document.getElementById('cg-class-base')?.value?.trim();
  const methods=(document.getElementById('cg-class-methods')?.value||'').split(',').map(m=>m.trim()).filter(Boolean);
  if (!name) return;
  const diff = [{type:'add',code:`class ${name}${base?`(${base})`:''}: `,note:'New class'}];
  if (methods.length === 0) {
    diff.push({type:'add',code:`    def __init__(self):`},{type:'add',code:`        pass`});
  } else {
    diff.push({type:'add',code:`    def __init__(self):`},{type:'add',code:`        pass`},{type:'add',code:''});
    for (const m of methods) {
      diff.push({type:'add',code:`    def ${m}(self):`},{type:'add',code:`        raise NotImplementedError`},{type:'add',code:''});
    }
  }
  renderDiff({ [`NEW: ${name.toLowerCase()}.py`]: { description:`New ${name} class`, diff }});
}

/* ═══ JS GENERATORS ═══ */

function generateJSField() {
  const model=document.getElementById('cg-model')?.value, name=document.getElementById('cg-field-name')?.value?.trim();
  const type=document.getElementById('cg-field-type')?.value, def=document.getElementById('cg-field-default')?.value||'null';
  if (!name||!model) return;
  renderDiff({ [`${model}`]: { description:`Add '${name}' (${type}) to ${model}`, diff:[
    {type:'context',code:`class ${model} {`},{type:'context',code:`  // ... existing properties ...`},
    {type:'add',code:`  ${name} = ${def};`,note:'NEW PROPERTY'},{type:'context',code:''},
    {type:'context',code:`  constructor(data) {`},{type:'add',code:`    this.${name} = data.${name} ?? ${def};`},
    {type:'context',code:`  }`},
  ]}});
}

function generateJSComponent() {
  const name=document.getElementById('cg-screen-name')?.value?.trim();
  const type=document.getElementById('cg-screen-type')?.value;
  const props=(document.getElementById('cg-screen-props')?.value||'').split(',').map(p=>p.trim()).filter(Boolean);
  if (!name) return;
  const propsStr = props.length > 0 ? `{ ${props.join(', ')} }` : '';
  let diff;
  if (type === 'functional') {
    diff = [
      {type:'add',code:`import React from 'react';`},{type:'add',code:''},
      {type:'add',code:`const ${name} = (${propsStr}) => {`,note:'Functional Component'},
      {type:'add',code:`  return (`},{type:'add',code:`    <div className="${name.toLowerCase()}">`},
      {type:'add',code:`      <h2>${name}</h2>`},{type:'add',code:`    </div>`},
      {type:'add',code:`  );`},{type:'add',code:`};`},{type:'add',code:''},
      {type:'add',code:`export default ${name};`},
    ];
  } else {
    diff = [
      {type:'add',code:`import React, { Component } from 'react';`},{type:'add',code:''},
      {type:'add',code:`class ${name} extends Component {`,note:'Class Component'},
      {type:'add',code:`  constructor(props) {`},{type:'add',code:`    super(props);`},
      {type:'add',code:`    this.state = {};`},{type:'add',code:`  }`},{type:'add',code:''},
      {type:'add',code:`  render() {`},{type:'add',code:`    return <div className="${name.toLowerCase()}">${name}</div>;`},
      {type:'add',code:`  }`},{type:'add',code:`}`},{type:'add',code:''},
      {type:'add',code:`export default ${name};`},
    ];
  }
  renderDiff({ [`NEW: ${name}.jsx`]: { description:`New ${name} component`, diff }});
}

function generateJSRoute() {
  const type=document.getElementById('cg-route-type')?.value;
  const name=document.getElementById('cg-route-name')?.value?.trim();
  const path=document.getElementById('cg-route-path')?.value||'/api/' + name;
  if (!name) return;
  let diff;
  if (type === 'express') {
    diff = [
      {type:'add',code:`const express = require('express');`},{type:'add',code:`const router = express.Router();`,note:'Express Router'},
      {type:'add',code:''},{type:'add',code:`router.get('${path}', async (req, res) => {`},
      {type:'add',code:`  try { res.json({ data: [] }); } catch (err) { res.status(500).json({ error: err.message }); }`},
      {type:'add',code:`});`},{type:'add',code:''},{type:'add',code:`router.post('${path}', async (req, res) => {`},
      {type:'add',code:`  try { res.status(201).json({ created: true }); } catch (err) { res.status(500).json({ error: err.message }); }`},
      {type:'add',code:`});`},{type:'add',code:''},{type:'add',code:`module.exports = router;`},
    ];
  } else {
    diff = [
      {type:'add',code:`import { useState, useEffect } from 'react';`,note:'React Hook'},
      {type:'add',code:''},{type:'add',code:`export function ${name}(initialValue) {`},
      {type:'add',code:`  const [data, setData] = useState(initialValue);`},
      {type:'add',code:`  const [loading, setLoading] = useState(false);`},
      {type:'add',code:`  const [error, setError] = useState(null);`},{type:'add',code:''},
      {type:'add',code:`  useEffect(() => { /* fetch data */ }, []);`},{type:'add',code:''},
      {type:'add',code:`  return { data, loading, error, setData };`},{type:'add',code:`}`},
    ];
  }
  renderDiff({ [`NEW: ${name}.js`]: { description:`New ${type === 'express' ? 'Express route' : 'React hook'}: ${name}`, diff }});
}

/* ═══ SQL GENERATORS ═══ */

function generateSQLColumn() {
  const table=document.getElementById('cg-model')?.value, name=document.getElementById('cg-field-name')?.value?.trim();
  const type=document.getElementById('cg-field-type')?.value, constraints=document.getElementById('cg-field-default')?.value||'';
  if (!name||!table) return;
  renderDiff({ [`ALTER ${table}`]: { description:`Add column '${name}' to ${table}`, diff:[
    {type:'add',code:`ALTER TABLE ${table}`,note:'Migration'},{type:'add',code:`ADD COLUMN ${name} ${type} ${constraints};`},
  ]}});
}

function generateSQLTable() {
  const name=document.getElementById('cg-table-name')?.value?.trim();
  const cols=(document.getElementById('cg-table-cols')?.value||'').split('\n').map(l=>l.trim()).filter(Boolean);
  if (!name) return;
  const diff = [{type:'add',code:`CREATE TABLE ${name} (`,note:'New table'}];
  for (let i = 0; i < cols.length; i++) {
    const [colName, ...rest] = cols[i].split(':');
    const comma = i < cols.length - 1 ? ',' : '';
    diff.push({type:'add',code:`    ${colName.trim()} ${rest.join(':').trim()}${comma}`});
  }
  diff.push({type:'add',code:`);`});
  renderDiff({ [`NEW: ${name}`]: { description:`Create table ${name}`, diff }});
}

function generateGenericField() {
  const model=document.getElementById('cg-model')?.value, name=document.getElementById('cg-field-name')?.value?.trim();
  const type=document.getElementById('cg-field-type')?.value, def=document.getElementById('cg-field-default')?.value||'null';
  if (!name||!model) return;
  renderDiff({ [`${model}`]: { description:`Add '${name}' (${type}) to ${model}`, diff:[
    {type:'context',code:`class/struct ${model} {`},{type:'add',code:`    ${type} ${name} = ${def};`,note:'NEW FIELD'},
    {type:'context',code:`}`},
  ]}});
}

function generateGenericScaffold() {
  const name=document.getElementById('cg-screen-name')?.value?.trim();
  const desc=document.getElementById('cg-screen-label')?.value||name;
  if (!name) return;
  renderDiff({ [`NEW: ${name}`]: { description:desc, diff:[{type:'add',code:`// ${desc}`},{type:'add',code:`// TODO: Implement ${name}`}]}});
}

/* ═══ AI GENERATION ═══ */

async function generateAI() {
  const prompt=document.getElementById('cg-ai-prompt')?.value?.trim();
  if (!prompt) return;
  const pt = APP.parsed.projectType;
  const status=document.getElementById('cg-ai-status'), btn=document.getElementById('cg-ai-btn');
  btn.disabled=true; btn.textContent='GENERATING WITH CLAUDE...';
  status.style.color='var(--cyan)'; status.textContent='Sending to Claude...';
  try {
    const langLabel = { dart:'Flutter/Dart', python:'Python', javascript:'JavaScript', c:'C', sql:'SQL' }[pt] || 'code';
    const resp = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({ model:'claude-sonnet-4-20250514', max_tokens:4000,
        messages:[{role:'user',content:`You are a ${langLabel} code generator for "${APP.parsed.projectName}".\nProject type: ${pt}\nClasses: ${APP.parsed.classes.map(c=>c.name).join(', ')||'none'}\nProviders: ${APP.parsed.providers.map(p=>p.name).join(', ')||'none'}\nDeps: ${Object.keys(APP.parsed.packages.deps).join(', ')||'none'}\n\nOutput ONLY JSON (no markdown): {"files":{"filename":{"description":"...","diff":[{"type":"add|remove|context","code":"...","note":"optional"}]}}}\n\nRequest: ${prompt}`}],
      }),
    });
    const data = await resp.json();
    const text = data.content?.[0]?.text||'';
    const parsed = JSON.parse(text.replace(/```json|```/g,'').trim());
    if (parsed.files) { renderDiff(parsed.files); status.style.color='var(--green)'; status.textContent='Generated!'; }
  } catch(e) { status.style.color='var(--red)'; status.textContent=e.message||'Failed'; }
  btn.disabled=false; btn.textContent='ASK CLAUDE TO GENERATE';
}

function renderDiff(changes) {
  const output=document.getElementById('codegen-output');
  if (!changes||Object.keys(changes).length===0) { output.innerHTML=`<div class="diff-empty"><div style="font-size:28px;opacity:0.3">◇</div>No changes</div>`; return; }
  output.innerHTML=`<div style="padding:12px 0">${Object.entries(changes).map(([file,info])=>`
    <div class="diff-file">
      <div class="diff-file-header">
        <div class="diff-file-dot" style="background:${file.startsWith('NEW')?'var(--green)':'var(--cyan)'}"></div>
        <span class="diff-file-name">${file}</span>
        <span class="diff-file-desc">${info.description||''}</span>
      </div>
      ${info.annotations?.length?`<div class="diff-annotations">${info.annotations.map(a=>`<div class="diff-annotation">${a.text}</div>`).join('')}</div>`:''}
      <div class="diff-lines">${(info.diff||[]).map(line=>`
        <div class="diff-line ${line.type}">
          <span class="diff-prefix">${line.type==='add'?'+':line.type==='remove'?'−':' '}</span>
          <span class="diff-code">${escapeHtml(line.code)}</span>
          ${line.note?`<span class="diff-note">${line.note}</span>`:''}
        </div>`).join('')}
      </div>
    </div>`).join('')}</div>`;
}
