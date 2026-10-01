/* ═══════════════════════════════════════════════════
   Code Architect — emoji-tools.js
   JS port of feelfami's dart_emoji_fixer (Python/PyQt6) engine +
   an in-app Emoji panel. Works on ANY loaded project.

   Modes (same semantics as the original tool):
     escape        — emoji/mojibake → Dart \uXXXX / \u{XXXXX} escapes
     shortcode     — emoji → :name: tokens (EmojiRegistry format)
     to_emoji      — :name: tokens → real UTF-8 emoji characters
     remove        — strip emoji/mojibake everywhere
     comments_only — code untouched; // and slash-star comments lose raw
                     emoji, mojibake AND non-ASCII \uXXXX escapes

   Applying edits goes through setFileContent(), so the Explorer's
   Δ Diff view, modified markers, revert, and patch export all work on
   emoji fixes too. "Write to disk…" saves changed files back via a
   readwrite folder picker.
   ═══════════════════════════════════════════════════ */

/* ═══ EMOJI MAPS (ported verbatim from dart_emoji_fixer_v7.py) ═══ */

const EMOJI_UNICODE_TO_SHORTCODE = {
  0x1F512: 'tightness', 0x1FAA8: 'heaviness', 0x1F525: 'fire',
  0x26A1: 'tingling', 0x1FAE5: 'numbness', 0x1F494: 'broken_heart',
  0x1F98B: 'butterfly', 0x1F493: 'pulsing', 0x1FAA2: 'knot',
  0x1FAB6: 'lightness', 0x1F41D: 'buzzing', 0x1FAC0: 'heart_organ',
  0x1F41B: 'crawling', 0x1F624: 'anger', 0x1F628: 'fear',
  0x1F622: 'sadness', 0x1F60A: 'happy', 0x1F633: 'shame',
  0x1F940: 'grief', 0x1F630: 'anxious', 0x1F636: 'blank',
  0x1F319: 'moon', 0x1F614: 'downcast', 0x1F922: 'nauseated',
  0x1F632: 'astonished', 0x1F49A: 'green_heart', 0x1F331: 'seedling',
  0x1F60C: 'calm', 0x1FAE7: 'centered', 0x1F4A4: 'sleepy',
  0x1F9D8: 'meditate', 0x1F300: 'spiral', 0x1F50D: 'search',
  0x1F4AD: 'thought', 0x1FA9E: 'mirror', 0x1F3AD: 'masks',
  0x270A: 'fist', 0x1F914: 'thinking', 0x1F644: 'eye_roll',
  0x1F9D0: 'detective', 0x2753: 'question', 0x1F4A1: 'bulb',
  0x1F60F: 'smirk', 0x1F4AC: 'chat', 0x1F442: 'ear',
  0x2728: 'sparkles', 0x1F30A: 'wave_water', 0x1F64F: 'pray',
  0x1F4AB: 'dizzy', 0x1F31F: 'star', 0x1F496: 'sparkling_heart',
  0x1F338: 'cherry_blossom', 0x1F381: 'gift', 0x1F48E: 'gem',
  0x1F308: 'rainbow', 0x2B50: 'star_2', 0x1F34E: 'apple',
  0x1F9F8: 'teddy', 0x1F4D6: 'book', 0x1F48C: 'letter',
  0x1F52E: 'crystal_ball', 0x1F3B5: 'music', 0x1F48A: 'pill',
  0x1F3E0: 'house', 0x1F33F: 'herb', 0x1F91D: 'handshake',
  0x1FAC2: 'hug', 0x1F44B: 'wave', 0x1F440: 'eyes',
  0x1F642: 'smile', 0x1F917: 'hugging', 0x1FAE0: 'melting',
  0x1FAE3: 'peeking', 0x1F62C: 'grimace', 0x1F61E: 'frown',
  0x1F604: 'grin', 0x1F49B: 'yellow_heart', 0x1F389: 'party',
  0x1F929: 'star_struck', 0x1F92F: 'exploding', 0x1F495: 'two_hearts',
  0x1F970: 'loving', 0x1F44A: 'punch', 0x1F620: 'angry',
  0x1F648: 'see_no_evil', 0x1F97A: 'pleading', 0x1F4A7: 'droplet',
  0x1F623: 'confused', 0x1F610: 'neutral', 0x1F4A8: 'wind',
  0x1F62E: 'open_mouth', 0x1F4A2: 'sweat',
  // models.dart shortcodes — sensations
  0x1F912: 'aching', 0x1F61F: 'anxiety', 0x1FAB7: 'butterflies',
  0x1F4AA: 'pressure', 0x1F497: 'throbbing', 0x2600: 'warmth',
  // emotions
  0x1F92E: 'disgust', 0x1FAE4: 'emotion_numbness', 0x1F928: 'envy',
  0x1F625: 'guilt', 0x1F33C: 'hope', 0x1F602: 'joy',
  0x1F62D: 'longing', 0x1F62F: 'surprise',
};

const EMOJI_COMPOUND_TO_SHORTCODE = (() => {
  const c = String.fromCodePoint;
  const pairs = [
    [c(0x2744) + c(0xFE0F), 'cold'],
    [c(0x2764) + c(0xFE0F), 'love'],
    [c(0x1F336) + c(0xFE0F), 'burning'],
    [c(0x1F573) + c(0xFE0F), 'emptiness'],
    [c(0x2699) + c(0xFE0F), 'jittering'],
    [c(0x2601) + c(0xFE0F), 'floating'],
    [c(0x1F5E1) + c(0xFE0F), 'stabbing'],
    [c(0x1F5E3) + c(0xFE0F), 'speaking'],
    [c(0x1F441) + c(0xFE0F), 'eye'],
    [c(0x1F54A) + c(0xFE0F), 'dove'],
    [c(0x1F6E1) + c(0xFE0F), 'shield'],
    [c(0x1F56F) + c(0xFE0F), 'candle'],
    [c(0x1F32B) + c(0xFE0F), 'fog'],
    [c(0x1F62E) + c(0x200D) + c(0x1F4A8), 'sigh'],
  ];
  return Object.fromEntries(pairs);
})();

const EMOJI_SHORTCODE_TO_CHAR = (() => {
  const map = {};
  for (const [cp, name] of Object.entries(EMOJI_UNICODE_TO_SHORTCODE)) {
    map[':' + name + ':'] = String.fromCodePoint(Number(cp));
  }
  for (const [seq, name] of Object.entries(EMOJI_COMPOUND_TO_SHORTCODE)) {
    map[':' + name + ':'] = seq; // compounds take priority
  }
  return map;
})();

/* ═══ CONVERSION ENGINE ═══ */

function emojiCodepointToDartEscape(cp) {
  return cp <= 0xFFFF
    ? '\\u' + cp.toString(16).toUpperCase().padStart(4, '0')
    : '\\u{' + cp.toString(16).toUpperCase() + '}';
}

function emojiSeqToDartEscape(seq) {
  let out = '';
  for (const ch of seq) {
    const cp = ch.codePointAt(0);
    out += cp > 127 ? emojiCodepointToDartEscape(cp) : ch;
  }
  return out;
}

function emojiSeqToShortcode(seq) {
  if (EMOJI_COMPOUND_TO_SHORTCODE[seq]) return ':' + EMOJI_COMPOUND_TO_SHORTCODE[seq] + ':';
  const first = seq.codePointAt(0);
  if (EMOJI_UNICODE_TO_SHORTCODE[first]) return ':' + EMOJI_UNICODE_TO_SHORTCODE[first] + ':';
  return emojiSeqToDartEscape(seq);
}

/** :name: tokens → UTF-8 emoji. Returns {text, count}. */
function emojiFromShortcodes(text) {
  let count = 0;
  const out = text.replace(/:[a-zA-Z0-9_]+:/g, tok => {
    const ch = EMOJI_SHORTCODE_TO_CHAR[tok];
    if (ch !== undefined) { count++; return ch; }
    return tok;
  });
  return { text: out, count };
}

/** UTF-8 emoji → :name: tokens (compounds first). Returns {text, count}. */
function emojiToShortcodes(text) {
  let count = 0;
  let result = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const len of [3, 2]) {
      const chunk = text.substr(i, len);
      if (EMOJI_COMPOUND_TO_SHORTCODE[chunk]) {
        result += ':' + EMOJI_COMPOUND_TO_SHORTCODE[chunk] + ':';
        count++; i += len; matched = true; break;
      }
    }
    if (matched) continue;
    const cp = text.codePointAt(i);
    const chLen = cp > 0xFFFF ? 2 : 1;
    if (EMOJI_UNICODE_TO_SHORTCODE[cp]) {
      result += ':' + EMOJI_UNICODE_TO_SHORTCODE[cp] + ':';
      count++;
    } else {
      result += text.substr(i, chLen);
    }
    i += chLen;
  }
  return { text: result, count };
}

/* Mojibake: UTF-8 bytes mis-decoded as latin-1 (e.g. "A-tilde cedilla" runs). */
function emojiDetectMojibake(text) {
  const findings = [];
  let i = 0;
  while (i < text.length) {
    const code = text.charCodeAt(i);
    if (code >= 0xC0 && code <= 0xF7) {
      const expectedLen = code >= 0xF0 ? 4 : code >= 0xE0 ? 3 : 2;
      const candidate = text.substr(i, expectedLen);
      if (candidate.length === expectedLen &&
          [...candidate].every(c => c.charCodeAt(0) <= 0xFF)) {
        try {
          const bytes = new Uint8Array([...candidate].map(c => c.charCodeAt(0)));
          const recovered = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          if (recovered.length >= 1 && recovered.codePointAt(0) > 127) {
            findings.push({ start: i, end: i + expectedLen, corrupted: candidate, recovered });
            i += expectedLen;
            continue;
          }
        } catch (e) { /* not valid utf-8 — not mojibake */ }
      }
    }
    i++;
  }
  return findings;
}

/* Any run of non-ASCII chars incl. astral-plane emoji. Built with the
   RegExp constructor so this source file stays pure ASCII. */
const _EMOJI_RUN_RE = new RegExp(
  '[' + String.fromCharCode(0x80) + '-' + String.fromCharCode(0xFFFF) +
  '\\u{10000}-\\u{10FFFF}]+', 'gu');
const _DART_ESCAPE_RE = new RegExp(
  '\\\\u\\{([0-9A-Fa-f]{1,6})\\}|\\\\u([0-9A-Fa-f]{4})', 'g');
const _NON_ASCII_RE = new RegExp(
  '[^' + String.fromCharCode(0x00) + '-' + String.fromCharCode(0x7F) + ']+', 'g');

function _stripNonAsciiDartEscapes(text) {
  return text.replace(_DART_ESCAPE_RE, (m, braced, plain) => {
    const cp = parseInt(braced || plain, 16);
    return cp > 127 ? '' : m;
  });
}

function emojiCleanCommentText(text) {
  let result = text.replace(_NON_ASCII_RE, '');
  result = _stripNonAsciiDartEscapes(result);
  result = result.replace(/ {2,}/g, ' ');
  return result.replace(/\s+$/, '');
}

/* Where does a // comment start (string-aware)? -1 if none. */
function _slCommentStart(line) {
  let inS = false, inD = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '\\' && (inS || inD)) { i++; continue; }
    if (c === "'" && !inD) inS = !inS;
    else if (c === '"' && !inS) inD = !inD;
    else if (c === '/' && !inS && !inD && line[i + 1] === '/') return i;
  }
  return -1;
}

function _fixLineStandard(line, lineNum, fixes, mode) {
  let fixed = line;

  // Mojibake first (work right-to-left to keep offsets valid)
  const hits = emojiDetectMojibake(fixed);
  for (let h = hits.length - 1; h >= 0; h--) {
    const { start, end, corrupted, recovered } = hits[h];
    const replacement = mode === 'remove' ? ''
      : mode === 'shortcode' ? emojiSeqToShortcode(recovered)
      : emojiSeqToDartEscape(recovered);
    fixed = fixed.slice(0, start) + replacement + fixed.slice(end);
    fixes.push({ line: lineNum, type: mode === 'remove' ? 'removed' : 'mojibake',
      original: corrupted, replacement });
  }

  // Raw emoji / high-Unicode runs
  fixed = fixed.replace(_EMOJI_RUN_RE, seq => {
    const replacement = mode === 'remove' ? ''
      : mode === 'shortcode' ? emojiSeqToShortcode(seq)
      : emojiSeqToDartEscape(seq);
    if (replacement !== seq) {
      fixes.push({ line: lineNum, type: mode === 'remove' ? 'removed' : 'emoji',
        original: seq, replacement });
    }
    return replacement;
  });

  if (mode === 'remove') fixed = fixed.replace(/  +/g, ' ').replace(/\s+$/, '');
  return fixed;
}

function _fixLineCommentsOnly(line, lineNum, fixes, inBlock) {
  // Returns [fixedLine, stillInBlock]
  if (inBlock) {
    const endIdx = line.indexOf('*/');
    if (endIdx !== -1) {
      const body = line.slice(0, endIdx + 2);
      const rest = line.slice(endIdx + 2);
      const cleaned = emojiCleanCommentText(body);
      if (cleaned !== body) fixes.push({ line: lineNum, type: 'comment_clean', original: body, replacement: cleaned });
      const [restFixed, still] = _fixLineCommentsOnly(rest, lineNum, fixes, false);
      return [cleaned + restFixed, still];
    }
    const cleaned = emojiCleanCommentText(line);
    if (cleaned !== line) fixes.push({ line: lineNum, type: 'comment_clean', original: line, replacement: cleaned });
    return [cleaned, true];
  }

  const blockIdx = line.indexOf('/*');
  const slIdx = _slCommentStart(line);

  if (slIdx !== -1 && (blockIdx === -1 || slIdx <= blockIdx)) {
    const code = line.slice(0, slIdx);
    const comment = line.slice(slIdx);
    const cleaned = emojiCleanCommentText(comment);
    if (cleaned !== comment) fixes.push({ line: lineNum, type: 'comment_clean', original: comment, replacement: cleaned });
    return [code + cleaned, false];
  }
  if (blockIdx !== -1) {
    const code = line.slice(0, blockIdx);
    const rest = line.slice(blockIdx);
    const endIdx = rest.indexOf('*/', 2);
    if (endIdx !== -1) {
      const body = rest.slice(0, endIdx + 2);
      const after = rest.slice(endIdx + 2);
      const cleaned = emojiCleanCommentText(body);
      if (cleaned !== body) fixes.push({ line: lineNum, type: 'comment_clean', original: body, replacement: cleaned });
      const [afterFixed, still] = _fixLineCommentsOnly(after, lineNum, fixes, false);
      return [code + cleaned + afterFixed, still];
    }
    const cleaned = emojiCleanCommentText(rest);
    if (cleaned !== rest) fixes.push({ line: lineNum, type: 'comment_clean', original: rest, replacement: cleaned });
    return [code + cleaned, true];
  }
  return [line, false];
}

/** Process one file's content. Returns { fixed, fixes:[{line,type,original,replacement}] } */
function emojiProcessContent(content, mode) {
  const fixes = [];
  _NON_ASCII_RE.lastIndex = 0;
  const hasNonAscii = _NON_ASCII_RE.test(content);
  _NON_ASCII_RE.lastIndex = 0;

  if (mode === 'to_emoji') {
    const lines = content.split('\n');
    const outLines = lines.map((l, i) => {
      const { text, count } = emojiFromShortcodes(l);
      if (count > 0) fixes.push({ line: i + 1, type: 'to_emoji', original: l.trim().slice(0, 80), replacement: text.trim().slice(0, 80) });
      return text;
    });
    return { fixed: outLines.join('\n'), fixes };
  }

  if (mode === 'comments_only') {
    if (!hasNonAscii && !content.includes('//') && !content.includes('/*')) {
      return { fixed: content, fixes };
    }
    const lines = content.split('\n');
    const out = [];
    let inBlock = false;
    for (let i = 0; i < lines.length; i++) {
      const [fixedLine, still] = _fixLineCommentsOnly(lines[i], i + 1, fixes, inBlock);
      out.push(fixedLine);
      inBlock = still;
    }
    return { fixed: out.join('\n'), fixes };
  }

  // escape / shortcode / remove — pure-ASCII files need no work
  if (!hasNonAscii) return { fixed: content, fixes };
  const lines = content.split('\n');
  const out = lines.map((l, i) => _fixLineStandard(l, i + 1, fixes, mode));
  return { fixed: out.join('\n'), fixes };
}

/* ═══ EMOJI PANEL UI ═══ */

const EMOJITOOL = {
  mode: 'shortcode',
  extFilter: 'dart',
  results: null,       // [{path, fixed, fixes}]
  selected: null,
};

const _EMOJI_MODES = {
  shortcode: { label: 'Emoji > :shortcode:', desc: 'EmojiRegistry token format' },
  to_emoji: { label: ':shortcode: > Emoji', desc: 'tokens back to real characters' },
  escape: { label: 'Emoji > unicode escapes', desc: 'Dart \\uXXXX escapes' },
  remove: { label: 'Remove emoji', desc: 'strip from code + comments' },
  comments_only: { label: 'Clean comments only', desc: 'code untouched; comments lose emoji, mojibake & non-ASCII escapes' },
};

function renderEmoji() {
  const panel = document.getElementById('panel-emoji');
  const r = EMOJITOOL.results;
  const changed = r ? r.filter(x => x.fixes.length > 0) : [];
  const totalFixes = changed.reduce((s, x) => s + x.fixes.length, 0);
  const modifiedOnDisk = getModifiedFiles().length;

  panel.innerHTML = `
    <div class="testlab">
      <div class="testlab-sidebar">
        <div class="tree-header">EMOJI FIXER</div>
        <div class="testlab-note" style="margin:4px 0 10px">Ported from feelfami's <b>dart_emoji_fixer</b> — scan, preview and fix emoji, :shortcodes:, unicode escapes and mojibake across the loaded project.</div>
        <div class="form-group"><label class="form-label">MODE</label>
          <select class="form-input" onchange="EMOJITOOL.mode=this.value;EMOJITOOL.results=null;renderEmoji()">
            ${Object.entries(_EMOJI_MODES).map(([k, v]) =>
              `<option value="${k}" ${EMOJITOOL.mode === k ? 'selected' : ''}>${v.label}</option>`).join('')}
          </select>
          <div class="form-tip">${_EMOJI_MODES[EMOJITOOL.mode].desc}</div></div>
        <div class="form-group"><label class="form-label">FILE EXTENSION</label>
          <select class="form-input" onchange="EMOJITOOL.extFilter=this.value;EMOJITOOL.results=null;renderEmoji()">
            ${['dart', 'py', 'js', 'ts', 'all code'].map(e =>
              `<option value="${e === 'all code' ? '' : e}" ${EMOJITOOL.extFilter === (e === 'all code' ? '' : e) ? 'selected' : ''}>${e}</option>`).join('')}
          </select></div>
        <div class="testlab-actions">
          <button class="btn-primary testlab-btn" onclick="emojiScan()">🔍 Scan project</button>
          ${changed.length ? `<button class="btn-secondary testlab-btn" style="color:var(--green)"
            onclick="emojiApplyAll()">✓ Apply ${totalFixes} fixes to ${changed.length} files</button>` : ''}
          ${modifiedOnDisk ? `<button class="btn-secondary testlab-btn" onclick="emojiWriteToDisk()"
            title="Writes ALL in-memory modified files (incl. visual-editor edits) back to a folder you pick">
            💾 Write ${modifiedOnDisk} changed file(s) to disk…</button>` : ''}
        </div>
        ${r ? `<div class="testlab-note" style="margin-top:10px">
          ${r.length} files scanned · <b style="color:${changed.length ? 'var(--amber)' : 'var(--green)'}">${changed.length} need changes</b> · ${totalFixes} total fixes<br>
          Applied fixes show in Explorer as modified (Δ Diff / revert works).</div>` : ''}
        <div class="tree-header" style="margin-top:14px">REFERENCE MAP</div>
        <div class="testlab-note">${Object.keys(EMOJI_UNICODE_TO_SHORTCODE).length + Object.keys(EMOJI_COMPOUND_TO_SHORTCODE).length} known mappings</div>
        <button class="btn-secondary testlab-btn" style="margin-top:6px" onclick="emojiShowMap()">📖 View emoji ↔ shortcode table</button>
      </div>
      <div class="testlab-files">
        <div class="tree-header" style="padding:10px 12px 4px">${r ? 'FILES NEEDING CHANGES' : 'SCAN RESULTS'}</div>
        ${!r ? '<div style="padding:12px;font-size:11px;color:var(--text-dim)">Run a scan to see per-file results.</div>'
          : changed.length === 0 ? '<div style="padding:12px;font-size:11px;color:var(--green)">✓ Project is clean for this mode.</div>'
          : changed.map(x => `
            <div class="testlab-file ${x.path === EMOJITOOL.selected ? 'active' : ''}"
                 onclick="EMOJITOOL.selected='${x.path.replace(/'/g, "\\'")}';renderEmoji()">
              <span class="file-icon">${getFileIcon(x.path)}</span>
              <span class="testlab-file-name">${x.path}</span>
              <span class="testlab-file-lines" style="color:var(--amber)">${x.fixes.length}</span>
            </div>`).join('')}
      </div>
      <div class="testlab-preview" id="emoji-preview"></div>
    </div>`;
  emojiRenderPreview();
}

function emojiScan() {
  const exts = EMOJITOOL.extFilter
    ? new Set([EMOJITOOL.extFilter])
    : new Set(getCodeExtensions());
  const results = [];
  for (const path of Object.keys(APP.files)) {
    const ext = path.split('.').pop().toLowerCase();
    if (!exts.has(ext)) continue;
    const { fixed, fixes } = emojiProcessContent(APP.files[path].content, EMOJITOOL.mode);
    results.push({ path, fixed, fixes });
  }
  EMOJITOOL.results = results;
  const firstChanged = results.find(x => x.fixes.length > 0);
  EMOJITOOL.selected = firstChanged ? firstChanged.path : null;
  renderEmoji();
}

function emojiRenderPreview() {
  const pane = document.getElementById('emoji-preview');
  if (!pane) return;
  const entry = EMOJITOOL.results?.find(x => x.path === EMOJITOOL.selected);
  if (!entry) {
    pane.innerHTML = '<div class="source-empty"><div class="source-empty-icon">😀</div>Scan, then pick a file to preview its changes</div>';
    return;
  }
  pane.innerHTML = `
    <div class="vis-code-head">
      <span>${entry.path} · ${entry.fixes.length} fixes</span>
      <button class="code-search-btn" style="background:var(--green)"
        onclick="emojiApplyOne('${entry.path.replace(/'/g, "\\'")}')">✓ Apply this file</button>
      <button class="vis-op-btn" onclick="navigateToFile('${entry.path.replace(/'/g, "\\'")}', ${entry.fixes[0]?.line || 1})" title="Open in Explorer">↗</button>
    </div>
    <div class="vis-code-body source-code">
      ${entry.fixes.slice(0, 300).map(f => `
        <div class="source-line diff-line-del"><span class="source-line-num">${f.line}</span>
          <span class="source-line-text"><span style="opacity:0.5;margin-right:6px">−</span>${escapeHtml(f.original)}</span></div>
        <div class="source-line diff-line-add"><span class="source-line-num">${f.line}</span>
          <span class="source-line-text"><span style="opacity:0.5;margin-right:6px">+</span>${escapeHtml(f.replacement) || '<span style="color:var(--text-dim)">(removed)</span>'}</span></div>`).join('')}
      ${entry.fixes.length > 300 ? '<div style="padding:8px 12px;color:var(--text-dim);font-size:10px">… preview truncated</div>' : ''}
    </div>`;
}

function emojiApplyOne(path) {
  const entry = EMOJITOOL.results?.find(x => x.path === path);
  if (!entry || !entry.fixes.length) return;
  setFileContent(path, entry.fixed);
  reParseProject();
  entry.fixes = [];
  renderEmoji();
}

function emojiApplyAll() {
  const changed = (EMOJITOOL.results || []).filter(x => x.fixes.length > 0);
  for (const entry of changed) {
    setFileContent(entry.path, entry.fixed);
    entry.fixes = [];
  }
  reParseProject();
  renderEmoji();
}

/** Writes ALL modified in-memory files back to a user-picked folder,
    preserving relative paths (pick the folder that contains the tree). */
async function emojiWriteToDisk() {
  const modified = getModifiedFiles();
  if (!modified.length || !window.showDirectoryPicker) return;
  try {
    const dir = await window.showDirectoryPicker({ mode: 'readwrite' });
    let written = 0;
    for (const path of modified) {
      const parts = path.split('/');
      let handle = dir;
      for (let i = 0; i < parts.length - 1; i++) {
        handle = await handle.getDirectoryHandle(parts[i], { create: true });
      }
      const fh = await handle.getFileHandle(parts[parts.length - 1], { create: true });
      const w = await fh.createWritable();
      await w.write(APP.files[path].content);
      await w.close();
      written++;
    }
    alert(`Done: ${written} file(s) written under "${dir.name}".\nPick the folder that CONTAINS the project structure shown in the tree.`);
  } catch (e) {
    if (e.name !== 'AbortError') console.error(e);
  }
}

function emojiShowMap() {
  document.getElementById('emoji-map-overlay')?.remove();
  const overlay = document.createElement('div');
  overlay.id = 'emoji-map-overlay';
  overlay.className = 'export-modal-overlay';
  const rows = [
    ...Object.entries(EMOJI_UNICODE_TO_SHORTCODE).map(([cp, name]) =>
      ({ char: String.fromCodePoint(Number(cp)), code: 'U+' + Number(cp).toString(16).toUpperCase().padStart(4, '0'), name })),
    ...Object.entries(EMOJI_COMPOUND_TO_SHORTCODE).map(([seq, name]) =>
      ({ char: seq, code: [...seq].map(c => 'U+' + c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')).join('+'), name })),
  ].sort((a, b) => a.name.localeCompare(b.name));
  overlay.innerHTML = `
    <div class="export-modal" style="max-width:440px">
      <div class="export-modal-header"><span>😀 Emoji ↔ Shortcode Map (${rows.length})</span>
        <div class="rt-close" onclick="document.getElementById('emoji-map-overlay').remove()">✕</div></div>
      <div class="export-modal-body" style="max-height:60vh;overflow-y:auto;padding:0">
        <table class="emoji-map-table">
          <tr><th>Emoji</th><th>Codepoint</th><th>Shortcode</th></tr>
          ${rows.map(rw => `<tr><td style="font-size:16px">${rw.char}</td>
            <td style="font-family:var(--font-mono);font-size:9px;color:var(--text-dim)">${rw.code}</td>
            <td style="font-family:var(--font-mono);font-size:10px;color:var(--cyan)">:${rw.name}:</td></tr>`).join('')}
        </table>
      </div>
    </div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}
