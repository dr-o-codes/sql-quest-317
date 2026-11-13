/* SQL Quest: user interface. The database and answer checker live in quest-core.js. */
(function () {
  'use strict';

  var Core = window.QuestCore;
  var QUESTIONS = Core.QUESTIONS;
  var TOTAL = QUESTIONS.length;
  var STORE_KEY = 'sqlquest.cs317.v1';
  var MAX_DISPLAY_ROWS = 200;

  var SQL = null;          // the sql.js module
  var explorerDb = null;   // read-only database used only for the explorer tables
  var activeTable = 'Students';

  var ui = { feedback: {}, results: {}, focusEditor: false };

  /* ---------------------------------------------------------------- */
  /* Small helpers                                                     */
  /* ---------------------------------------------------------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function cellHtml(v) {
    if (v === null || v === undefined) { return '<td class="null">NULL</td>'; }
    if (typeof v === 'number') { return '<td class="num">' + esc(v) + '</td>'; }
    return '<td>' + esc(v) + '</td>';
  }

  /* ---------------------------------------------------------------- */
  /* Saved progress (localStorage, no login)                           */
  /* ---------------------------------------------------------------- */

  function blankProgress() { return { done: false, attempts: 0, wrong: 0, hints: 0, sql: '', choice: null, revealed: false }; }

  function freshState() {
    var s = { current: 0, view: 'quest', progress: {} };
    QUESTIONS.forEach(function (q) { s.progress[q.id] = blankProgress(); });
    return s;
  }

  function loadState() {
    var s = freshState();
    try {
      var raw = window.localStorage.getItem(STORE_KEY);
      if (!raw) { return s; }
      var saved = JSON.parse(raw);
      if (typeof saved.current === 'number' && saved.current >= 0 && saved.current < TOTAL) { s.current = saved.current; }
      QUESTIONS.forEach(function (q) {
        var p = saved.progress && saved.progress[q.id];
        if (p) {
          var b = blankProgress();
          Object.keys(b).forEach(function (k) { if (typeof p[k] === typeof b[k] || (k === 'choice' && (p[k] === null || typeof p[k] === 'string'))) { b[k] = p[k]; } });
          s.progress[q.id] = b;
        }
      });
    } catch (e) { /* storage unavailable or corrupt: start fresh */ }
    return s;
  }

  var state = loadState();

  function save() {
    try { window.localStorage.setItem(STORE_KEY, JSON.stringify({ current: state.current, progress: state.progress })); } catch (e) { /* ignore */ }
  }

  function stats() {
    var done = 0, hints = 0, attempts = 0;
    QUESTIONS.forEach(function (q) {
      var p = state.progress[q.id];
      if (p.done) { done++; }
      hints += p.hints;
      attempts += p.attempts;
    });
    return { done: done, hints: hints, attempts: attempts, percent: Math.round((done / TOTAL) * 100) };
  }

  /* ---------------------------------------------------------------- */
  /* Syntax highlighting for the editor                                */
  /* ---------------------------------------------------------------- */

  var KEYWORDS = {};
  ('select from where and or not in is null like between order by group having asc desc limit offset as join inner left right outer full cross natural on using distinct union all case when then else end exists with over').split(' ')
    .forEach(function (w) { KEYWORDS[w] = true; });
  var FUNCTIONS = { count: 1, sum: 1, avg: 1, min: 1, max: 1, round: 1, length: 1, upper: 1, lower: 1, coalesce: 1 };

  function highlight(text) {
    var re = /(--[^\n]*|\/\*[\s\S]*?(?:\*\/|$))|('(?:[^']|'')*(?:'|$))|("(?:[^"]|"")*(?:"|$))|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z_0-9]*)|([\s\S])/g;
    var out = '';
    var m;
    while ((m = re.exec(text)) !== null) {
      if (m[1]) { out += '<span class="tok-com">' + esc(m[1]) + '</span>'; }
      else if (m[2] || m[3]) { out += '<span class="tok-str">' + esc(m[2] || m[3]) + '</span>'; }
      else if (m[4]) { out += '<span class="tok-num">' + esc(m[4]) + '</span>'; }
      else if (m[5]) {
        var w = m[5].toLowerCase();
        var next = text.slice(re.lastIndex).match(/^\s*\(/);
        if (FUNCTIONS[w] && next) { out += '<span class="tok-fn">' + esc(m[5]) + '</span>'; }
        else if (KEYWORDS[w]) { out += '<span class="tok-kw">' + esc(m[5]) + '</span>'; }
        else { out += esc(m[5]); }
      } else { out += esc(m[6]); }
    }
    return out;
  }

  function highlightBlock(sql) { return '<pre>' + highlight(sql) + '</pre>'; }

  /* ---------------------------------------------------------------- */
  /* Database Explorer                                                 */
  /* ---------------------------------------------------------------- */

  function renderExplorer() {
    var tabs = $('#table-tabs');
    tabs.innerHTML = Core.TABLE_ORDER.map(function (t) {
      var n = Core.runQuery(explorerDb, 'SELECT COUNT(*) FROM ' + t).rows[0][0];
      return '<button class="tab" role="tab" data-table="' + t + '" aria-selected="' + (t === activeTable) + '">' +
        t + '<span class="count">' + n + '</span></button>';
    }).join('');

    var meta = Core.TABLE_META[activeTable];
    var info = Core.runQuery(explorerDb, 'PRAGMA table_info(' + activeTable + ')').rows;
    var data = Core.runQuery(explorerDb, 'SELECT * FROM ' + activeTable);

    var head = info.map(function (c) {
      var name = c[1];
      var badges = '';
      if (meta.pk.indexOf(name) !== -1) { badges += ' <span class="badge pk" title="Primary key">PK</span>'; }
      if (meta.fk[name]) { badges += ' <span class="badge fk" title="Foreign key. Points to ' + esc(meta.fk[name]) + '">FK</span>'; }
      var target = meta.fk[name] ? '<span class="coltype">&rarr; ' + esc(meta.fk[name]) + '</span>' : '<span class="coltype">' + esc(c[2]) + '</span>';
      return '<th scope="col">' + esc(name) + badges + target + '</th>';
    }).join('');

    var body = data.rows.map(function (r) { return '<tr>' + r.map(cellHtml).join('') + '</tr>'; }).join('');
    $('#table-view').innerHTML = '<table class="data"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table>';
  }

  /* ---------------------------------------------------------------- */
  /* Challenge area                                                    */
  /* ---------------------------------------------------------------- */

  function resultHtml(res) {
    if (!res) { return ''; }
    if (res.error) {
      return '<div class="feedback error" role="alert"><div class="fb-title">Query problem</div><p>' + esc(res.error) + '</p>' +
        (res.raw ? '<p class="small muted">SQLite said: ' + esc(res.raw) + '</p>' : '') + '</div>';
    }
    var head = res.columns.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('');
    var body = res.rows.map(function (r) { return '<tr>' + r.map(cellHtml).join('') + '</tr>'; }).join('');
    var n = res.rows.length;
    var meta = n === 0
      ? 'The query ran, but it returned 0 rows.'
      : 'Your query returned ' + n + (res.truncated ? '+' : '') + (n === 1 ? ' row.' : ' rows.') + (res.truncated ? ' Showing the first ' + n + '.' : '');
    return '<div class="result-box"><div class="result-meta">' + meta + '</div>' +
      (res.columns.length ? '<div class="table-wrap"><table class="data"><thead><tr>' + head + '</tr></thead><tbody>' + body + '</tbody></table></div>' : '') + '</div>';
  }

  function feedbackHtml(fb) {
    if (!fb) { return ''; }
    return '<div class="feedback ' + fb.type + '" role="status"><div class="fb-title">' + esc(fb.title) + '</div>' + fb.html + '</div>';
  }

  function solutionHtml(q) {
    if (q.type === 'mc') {
      return '<div class="solution"><strong>Correct answer:</strong> ' + esc(q.solutionText) + '<p>' + esc(q.explanation) + '</p></div>';
    }
    var clauses = q.clauses.map(function (c) { return '<li><code>' + esc(c[0]) + '</code> ' + esc(c[1]) + '</li>'; }).join('');
    return '<div class="solution"><strong>Reference solution</strong>' + highlightBlock(q.reference) +
      '<ul>' + clauses + '</ul><p>' + esc(q.explanation) + '</p>' +
      '<div class="btn-row"><button class="btn" data-action="copy-solution">Copy solution into the editor</button></div></div>';
  }

  function stepperHtml() {
    return '<div class="stepper" role="group" aria-label="Challenges">' + QUESTIONS.map(function (q, i) {
      var p = state.progress[q.id];
      var cls = 'step' + (i === state.current ? ' current' : '') + (p.done ? ' done' : '');
      return '<button class="' + cls + '" data-action="goto" data-i="' + i + '" aria-label="Challenge ' + (i + 1) + (p.done ? ', completed' : '') + '"' +
        (i === state.current ? ' aria-current="step"' : '') + '>' + (i + 1) + (p.done ? ' <span aria-hidden="true">&#10003;</span>' : '') + '</button>';
    }).join('') + '</div>';
  }

  function questionBody(q, p) {
    if (q.type === 'mc') {
      return '<div class="choices" role="radiogroup" aria-label="Answer choices">' + q.choices.map(function (c) {
        var sel = p.choice === c.id;
        return '<label class="choice' + (sel ? ' selected' : '') + '"><input type="radio" name="mc" value="' + c.id + '"' + (sel ? ' checked' : '') + '>' +
          '<span class="letter">' + c.id + '.</span><code>' + esc(c.text) + '</code></label>';
      }).join('') + '</div>';
    }
    return '<p class="editor-label">Write your query. Press Ctrl+Enter (or Cmd+Enter) to run it.</p>' +
      '<div class="editor"><pre id="sql-hl" aria-hidden="true"></pre>' +
      '<textarea id="sql-input" spellcheck="false" autocomplete="off" autocapitalize="off" aria-label="SQL query editor" placeholder="SELECT ..."></textarea></div>';
  }

  function renderChallenge() {
    var root = $('#challenge-root');
    if (state.view === 'complete') { root.innerHTML = completeHtml(); return; }

    var q = QUESTIONS[state.current];
    var p = state.progress[q.id];
    var s = stats();
    var fb = ui.feedback[q.id];
    var hintsShown = q.hints.slice(0, p.hints);
    var canReveal = p.wrong >= 3;

    var html = '';
    html += '<div class="ch-top"><h2 id="challenge-title">Challenge ' + (state.current + 1) + ' of ' + TOTAL + '</h2>' +
      '<div class="ch-meta"><span class="pill lvl-' + q.difficulty + '">' + q.difficulty + '</span>' +
      '<button class="link-btn" data-action="to-explorer">View the tables</button></div></div>';
    html += '<div class="progress-row"><div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="' + TOTAL + '" aria-valuenow="' + s.done + '">' +
      '<span style="width:' + s.percent + '%"></span></div><div class="progress-label">' + s.done + ' / ' + TOTAL + ' Challenges Completed</div></div>';
    html += stepperHtml();

    html += '<div class="topic">' + esc(q.topic) + '</div>';
    html += '<p class="question">' + esc(q.prompt) + '</p>';
    html += questionBody(q, p);

    html += '<div class="btn-row">';
    if (q.type === 'sql') { html += '<button class="btn primary" data-action="run">Run Query</button>'; }
    html += '<button class="btn ' + (q.type === 'mc' ? 'primary' : 'good') + '" data-action="check">Check Answer</button>';
    html += '<button class="btn" data-action="hint"' + (p.hints >= q.hints.length ? ' disabled' : '') + '>Hint (' + p.hints + ' of ' + q.hints.length + ')</button>';
    html += '<button class="btn" data-action="reveal"' + (canReveal ? '' : ' disabled') + ' title="' + (canReveal ? '' : 'Available after 3 incorrect attempts') + '">Show Solution</button>';
    html += '<span class="spacer"></span><span class="attempts">Incorrect attempts: ' + Math.min(p.wrong, 99) + (canReveal ? '' : ' (solution unlocks at 3)') + '</span>';
    html += '</div>';

    if (hintsShown.length) {
      html += '<div class="hints">' + hintsShown.map(function (h, i) { return '<div class="hint"><b>Hint ' + (i + 1) + '.</b> ' + esc(h) + '</div>'; }).join('') + '</div>';
    }
    html += feedbackHtml(fb);
    if (q.type === 'sql') { html += resultHtml(ui.results[q.id]); }
    if (p.revealed) { html += solutionHtml(q); }

    if (s.done === TOTAL) {
      html += '<div class="all-done"><span><strong>All ' + TOTAL + ' challenges are complete.</strong></span><button class="btn good" data-action="view-results">View My Results</button></div>';
    }

    html += '<div class="nav-row"><button class="btn" data-action="prev"' + (state.current === 0 ? ' disabled' : '') + '>&larr; Previous Question</button>' +
      '<button class="btn" data-action="next"' + (state.current === TOTAL - 1 ? ' disabled' : '') + '>Next Question &rarr;</button></div>';

    root.innerHTML = html;
    setupEditor(q, p);
  }

  function completeHtml() {
    var s = stats();
    return '<div class="complete"><h2 id="challenge-title">SQL Quest Complete!</h2>' +
      '<p class="lead">Congratulations! You have practiced relational database fundamentals, filtering, sorting, aggregation, and joins.</p>' +
      '<div class="stats">' +
      '<div class="stat"><div class="num">' + s.done + ' / ' + TOTAL + '</div><div class="lbl">Questions solved correctly</div></div>' +
      '<div class="stat"><div class="num">' + s.hints + '</div><div class="lbl">Hints used</div></div>' +
      '<div class="stat"><div class="num">' + s.attempts + '</div><div class="lbl">Total attempts</div></div>' +
      '<div class="stat"><div class="num">' + s.percent + '%</div><div class="lbl">Completion</div></div></div>' +
      '<div class="btn-row"><button class="btn" data-action="review">Review Challenges</button>' +
      '<button class="btn primary" data-action="restart">Restart Challenge</button></div></div>';
  }

  /* ---------------------------------------------------------------- */
  /* Editor                                                            */
  /* ---------------------------------------------------------------- */

  function setupEditor(q, p) {
    if (q.type !== 'sql') { return; }
    var ta = $('#sql-input');
    var hl = $('#sql-hl');
    if (!ta) { return; }
    ta.value = p.sql || '';
    var paint = function () { hl.innerHTML = highlight(ta.value) + '\n'; hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; };
    paint();
    ta.addEventListener('input', function () { p.sql = ta.value; save(); paint(); });
    ta.addEventListener('scroll', function () { hl.scrollTop = ta.scrollTop; hl.scrollLeft = ta.scrollLeft; });
    ta.addEventListener('keydown', function (e) {
      if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault();
        var a = ta.selectionStart, b = ta.selectionEnd;
        ta.value = ta.value.slice(0, a) + '  ' + ta.value.slice(b);
        ta.selectionStart = ta.selectionEnd = a + 2;
        ta.dispatchEvent(new Event('input'));
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        doRun();
      }
    });
    if (ui.focusEditor) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); ui.focusEditor = false; }
  }

  /* ---------------------------------------------------------------- */
  /* Actions                                                           */
  /* ---------------------------------------------------------------- */

  function currentQ() { return QUESTIONS[state.current]; }

  function doRun() {
    var q = currentQ();
    var p = state.progress[q.id];
    var v = Core.validateSql(p.sql);
    if (!v.ok) {
      ui.results[q.id] = { error: v.message };
    } else {
      var db = Core.createDb(SQL, 'base');       // a fresh copy every time
      var res = Core.runQuery(db, v.sql, MAX_DISPLAY_ROWS);
      db.close();
      ui.results[q.id] = res.error ? { error: Core.friendlyError(res.error), raw: res.error } : res;
    }
    ui.focusEditor = true;
    renderChallenge();
  }

  function doCheck() {
    var q = currentQ();
    var p = state.progress[q.id];
    var result;

    if (q.type === 'mc') {
      result = Core.evaluateMc(q, p.choice);
      if (!p.choice) {
        ui.feedback[q.id] = { type: 'info', title: 'Choose an answer', html: '<p>Pick one of the options, then press Check Answer.</p>' };
        renderChallenge();
        return;
      }
    } else {
      if (!String(p.sql).trim()) {
        ui.feedback[q.id] = { type: 'info', title: 'Write a query first', html: '<p>Type your SQL in the editor. You can press Run Query to try it before you check it.</p>' };
        renderChallenge();
        return;
      }
      try {
        result = Core.evaluateSql(SQL, q, p.sql);
      } catch (e) {
        result = { correct: false, kind: 'error', message: 'Something unexpected happened while checking your query. Please try again.' };
      }
      /* also show what the query returned, like Run Query does */
      var v = Core.validateSql(p.sql);
      if (v.ok) {
        var db = Core.createDb(SQL, 'base');
        var res = Core.runQuery(db, v.sql, MAX_DISPLAY_ROWS);
        db.close();
        ui.results[q.id] = res.error ? { error: Core.friendlyError(res.error), raw: res.error } : res;
      } else {
        ui.results[q.id] = { error: v.message };
      }
    }

    var counted = !(result.kind === 'invalid');
    if (counted) { p.attempts += 1; }

    if (result.correct) {
      p.done = true;
      ui.feedback[q.id] = { type: 'correct', title: 'Correct! Great work!', html: '<p>' + esc(result.message) + '</p>' };
    } else {
      if (counted) { p.wrong += 1; }
      var extra = '';
      if (counted && p.wrong === 2) {
        extra = '<p><strong>A more specific hint:</strong> ' + esc(q.hints[Math.min(1, q.hints.length - 1)]) + '</p>';
      } else if (counted && p.wrong >= 3) {
        extra = '<p><strong>Still stuck?</strong> ' + esc(q.hints[q.hints.length - 1]) + ' You can also press Show Solution now.</p>';
      }
      ui.feedback[q.id] = { type: result.kind === 'error' ? 'error' : 'wrong', title: q.type === 'mc' ? 'Not quite.' : 'Not correct yet.', html: '<p>' + esc(result.message) + '</p>' + extra };
    }
    save();
    ui.focusEditor = q.type === 'sql';
    renderChallenge();
  }

  function go(i) {
    state.current = Math.max(0, Math.min(TOTAL - 1, i));
    state.view = 'quest';
    save();
    renderChallenge();
    var card = $('#challenge');
    if (card && card.getBoundingClientRect().top < 0) { card.scrollIntoView({ block: 'start' }); }
  }

  function copyToEditor() {
    var q = currentQ();
    state.progress[q.id].sql = q.reference;
    save();
    ui.focusEditor = true;
    renderChallenge();
  }

  function restart() {
    if (!window.confirm('Restart the challenge? This clears your saved progress on this device.')) { return; }
    state = freshState();
    ui = { feedback: {}, results: {}, focusEditor: false };
    try { window.localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
    renderChallenge();
    window.scrollTo({ top: 0 });
  }

  function onClick(e) {
    var t = e.target.closest('[data-action]');
    if (!t || t.disabled) { return; }
    var q = currentQ();
    var p = state.progress[q.id];
    switch (t.getAttribute('data-action')) {
      case 'goto': go(parseInt(t.getAttribute('data-i'), 10)); break;
      case 'prev': go(state.current - 1); break;
      case 'next': go(state.current + 1); break;
      case 'run': doRun(); break;
      case 'check': doCheck(); break;
      case 'hint':
        if (p.hints < q.hints.length) { p.hints += 1; save(); ui.focusEditor = q.type === 'sql'; renderChallenge(); }
        break;
      case 'reveal':
        if (p.wrong >= 3) { p.revealed = true; save(); renderChallenge(); }
        break;
      case 'copy-solution': copyToEditor(); break;
      case 'to-explorer': $('#explorer').scrollIntoView({ block: 'start' }); break;
      case 'view-results': state.view = 'complete'; renderChallenge(); $('#challenge').scrollIntoView({ block: 'start' }); break;
      case 'review': state.view = 'quest'; state.current = 0; save(); renderChallenge(); break;
      case 'restart': restart(); break;
    }
  }

  function onChange(e) {
    if (e.target && e.target.name === 'mc') {
      var q = currentQ();
      state.progress[q.id].choice = e.target.value;
      save();
      var labels = document.querySelectorAll('.choice');
      Array.prototype.forEach.call(labels, function (l) { l.classList.toggle('selected', l.querySelector('input').checked); });
    }
  }

  /* ---------------------------------------------------------------- */
  /* Start                                                             */
  /* ---------------------------------------------------------------- */

  function start() {
    var root = $('#challenge-root');
    if (typeof window.initSqlJs !== 'function') {
      root.innerHTML = '<div class="loading-error">The SQL engine did not load. Check your internet connection and reload the page.</div>';
      return;
    }
    window.initSqlJs().then(function (mod) {
      SQL = mod;
      explorerDb = Core.createDb(SQL, 'base');
      $('#table-tabs').addEventListener('click', function (e) {
        var b = e.target.closest('[data-table]');
        if (b) { activeTable = b.getAttribute('data-table'); renderExplorer(); }
      });
      root.addEventListener('click', onClick);
      root.addEventListener('change', onChange);
      renderExplorer();
      /* open to the completion screen only when the student asks for it */
      renderChallenge();
    }).catch(function (err) {
      root.innerHTML = '<div class="loading-error">The SQL engine could not start. ' + esc(err && err.message ? err.message : err) + '</div>';
    });
  }

  start();
}());
