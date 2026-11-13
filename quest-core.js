/*
 * SQL Quest core: database, questions, and answer checker.
 * No DOM code lives here, so it can be tested in Node as well as in the browser.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.QuestCore = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ------------------------------------------------------------------ */
  /* Database                                                            */
  /* ------------------------------------------------------------------ */

  var SCHEMA_SQL = [
    'PRAGMA foreign_keys = ON;',
    'CREATE TABLE Students (',
    '  student_id INTEGER PRIMARY KEY,',
    '  first_name TEXT NOT NULL,',
    '  last_name TEXT NOT NULL,',
    '  major TEXT NOT NULL,',
    "  year_level TEXT NOT NULL CHECK (year_level IN ('Freshman','Sophomore','Junior','Senior'))",
    ');',
    'CREATE TABLE Clubs (',
    '  club_id INTEGER PRIMARY KEY,',
    '  club_name TEXT NOT NULL,',
    '  category TEXT NOT NULL',
    ');',
    'CREATE TABLE Events (',
    '  event_id INTEGER PRIMARY KEY,',
    '  club_id INTEGER NOT NULL,',
    '  event_name TEXT NOT NULL,',
    '  event_date TEXT NOT NULL,',
    '  location TEXT NOT NULL,',
    '  FOREIGN KEY (club_id) REFERENCES Clubs(club_id)',
    ');',
    'CREATE TABLE Registrations (',
    '  registration_id INTEGER PRIMARY KEY,',
    '  student_id INTEGER NOT NULL,',
    '  event_id INTEGER NOT NULL,',
    "  attendance_status TEXT NOT NULL CHECK (attendance_status IN ('Registered','Attended','Cancelled')),",
    '  FOREIGN KEY (student_id) REFERENCES Students(student_id),',
    '  FOREIGN KEY (event_id) REFERENCES Events(event_id)',
    ');'
  ].join('\n');

  /* The data students see. */
  var BASE_DATA_SQL = [
    "INSERT INTO Students VALUES (1,'Alex','Rivera','Computer Science','Junior');",
    "INSERT INTO Students VALUES (2,'Maya','Patel','Cybersecurity','Senior');",
    "INSERT INTO Students VALUES (3,'Jordan','Lee','Computer Science','Senior');",
    "INSERT INTO Students VALUES (4,'Sam','Okafor','Data Science','Junior');",
    "INSERT INTO Students VALUES (5,'Priya','Nair','Aerospace Engineering','Sophomore');",
    "INSERT INTO Students VALUES (6,'Liam','Carter','Aerospace Engineering','Freshman');",

    "INSERT INTO Clubs VALUES (1,'Robotics Club','Technology');",
    "INSERT INTO Clubs VALUES (2,'Gaming Club','Entertainment');",
    "INSERT INTO Clubs VALUES (3,'Astronomy Club','Science');",
    "INSERT INTO Clubs VALUES (4,'Cybersecurity Club','Technology');",
    "INSERT INTO Clubs VALUES (5,'Outdoor Adventure Club','Recreation');",

    "INSERT INTO Events VALUES (1,1,'Robot Battle Night','2026-11-18','Engineering Lab');",
    "INSERT INTO Events VALUES (2,1,'Drone Build Workshop','2026-12-02','Innovation Hub');",
    "INSERT INTO Events VALUES (3,3,'Stargazing Night','2026-11-21','Observatory Deck');",
    "INSERT INTO Events VALUES (4,4,'Capture the Flag Challenge','2026-12-05','Library Room 204');",
    "INSERT INTO Events VALUES (5,5,'Canyon Trail Hike','2026-11-29','Trailhead Parking Lot');",
    "INSERT INTO Events VALUES (6,3,'Meteor Shower Watch','2026-12-13','Observatory Deck');",

    "INSERT INTO Registrations VALUES (1,1,1,'Attended');",
    "INSERT INTO Registrations VALUES (2,1,3,'Registered');",
    "INSERT INTO Registrations VALUES (3,2,4,'Attended');",
    "INSERT INTO Registrations VALUES (4,3,1,'Attended');",
    "INSERT INTO Registrations VALUES (5,4,3,'Cancelled');",
    "INSERT INTO Registrations VALUES (6,5,5,'Registered');"
  ].join('\n');

  /*
   * A hidden second data set with the same tables but different records.
   * Every answer is checked on both data sets. A hard-coded result that
   * matches the visible data will not match this one.
   */
  var VARIANT_DATA_SQL = [
    "INSERT INTO Students VALUES (1,'Ava','Brooks','Computer Science','Freshman');",
    "INSERT INTO Students VALUES (2,'Noah','Kim','Biology','Senior');",
    "INSERT INTO Students VALUES (3,'Zoe','Adams','Computer Science','Junior');",
    "INSERT INTO Students VALUES (4,'Ethan','Ruiz','Biology','Senior');",
    "INSERT INTO Students VALUES (5,'Mia','Fox','Physics','Sophomore');",
    "INSERT INTO Students VALUES (6,'Omar','Haddad','Cybersecurity','Junior');",
    "INSERT INTO Students VALUES (7,'Lily','Stone','Physics','Senior');",

    "INSERT INTO Clubs VALUES (1,'Robotics Club','Technology');",
    "INSERT INTO Clubs VALUES (2,'Gaming Club','Entertainment');",
    "INSERT INTO Clubs VALUES (3,'Astronomy Club','Science');",
    "INSERT INTO Clubs VALUES (4,'Cybersecurity Club','Technology');",
    "INSERT INTO Clubs VALUES (5,'Outdoor Adventure Club','Recreation');",

    "INSERT INTO Events VALUES (1,2,'Retro Game Night','2026-10-10','Student Union');",
    "INSERT INTO Events VALUES (2,2,'Esports Tournament','2026-10-24','Arena Hall');",
    "INSERT INTO Events VALUES (3,2,'Board Game Cafe','2026-11-07','Cafe 12');",
    "INSERT INTO Events VALUES (4,4,'Phishing Defense Workshop','2026-10-15','Lab 3');",
    "INSERT INTO Events VALUES (5,5,'Canyon Camping Trip','2026-11-14','North Gate');",
    "INSERT INTO Events VALUES (6,5,'Kayak Day','2026-11-21','Lake Dock');",
    "INSERT INTO Events VALUES (7,1,'Robot Soccer','2026-12-01','Gym B');",

    "INSERT INTO Registrations VALUES (1,1,1,'Attended');",
    "INSERT INTO Registrations VALUES (2,2,2,'Registered');",
    "INSERT INTO Registrations VALUES (3,2,4,'Cancelled');",
    "INSERT INTO Registrations VALUES (4,3,1,'Attended');",
    "INSERT INTO Registrations VALUES (5,4,5,'Attended');",
    "INSERT INTO Registrations VALUES (6,7,7,'Registered');"
  ].join('\n');

  /* Key and relationship information shown in the explorer. */
  var TABLE_META = {
    Students: { pk: ['student_id'], fk: {} },
    Clubs: { pk: ['club_id'], fk: {} },
    Events: { pk: ['event_id'], fk: { club_id: 'Clubs.club_id' } },
    Registrations: {
      pk: ['registration_id'],
      fk: { student_id: 'Students.student_id', event_id: 'Events.event_id' }
    }
  };
  var TABLE_ORDER = ['Students', 'Clubs', 'Events', 'Registrations'];

  function createDb(SQL, which) {
    var db = new SQL.Database();
    db.run(SCHEMA_SQL);
    db.run(which === 'variant' ? VARIANT_DATA_SQL : BASE_DATA_SQL);
    /* From here on the connection cannot change any data. */
    db.run('PRAGMA query_only = ON;');
    return db;
  }

  /* ------------------------------------------------------------------ */
  /* SQL safety checks and execution                                     */
  /* ------------------------------------------------------------------ */

  /* Replace string literals and comments with spaces so keywords inside them are ignored. */
  function maskSql(sql) {
    var out = '';
    var i = 0;
    var n = sql.length;
    while (i < n) {
      var c = sql[i];
      var d = sql[i + 1];
      if (c === '-' && d === '-') {
        while (i < n && sql[i] !== '\n') { out += ' '; i++; }
      } else if (c === '/' && d === '*') {
        out += '  '; i += 2;
        while (i < n && !(sql[i] === '*' && sql[i + 1] === '/')) { out += ' '; i++; }
        if (i < n) { out += '  '; i += 2; }
      } else if (c === "'" || c === '"' || c === '`') {
        var q = c;
        out += q; i++;
        while (i < n) {
          if (sql[i] === q) {
            if (sql[i + 1] === q) { out += '  '; i += 2; continue; }
            break;
          }
          out += ' '; i++;
        }
        if (i < n) { out += q; i++; }
      } else {
        out += c; i++;
      }
    }
    return out;
  }

  function validateSql(raw) {
    var sql = (raw || '').trim();
    if (!sql) {
      return { ok: false, message: 'Type a query in the editor first.' };
    }
    var masked = maskSql(sql);
    var m = masked.replace(/;+\s*$/, '').trim();
    if (!m) {
      return { ok: false, message: 'Type a query in the editor first.' };
    }
    if (m.indexOf(';') !== -1) {
      return { ok: false, message: 'Please run one statement at a time. Remove the extra semicolon and the statement after it.' };
    }
    if (/^(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|truncate)\b/i.test(m)) {
      return { ok: false, message: 'SQL Quest only allows SELECT queries. The database is read-only, so you cannot change the records.' };
    }
    if (!/^(select|with)\b/i.test(m)) {
      return { ok: false, message: 'A query here must start with SELECT. Check the spelling of the first word.' };
    }
    if (/\b(insert|update|delete|drop|alter|create|attach|detach|pragma|vacuum|reindex)\b/i.test(m)) {
      return { ok: false, message: 'SQL Quest only allows read-only SELECT queries. Statements that change data or settings are blocked.' };
    }
    var cleaned = sql.replace(/;+\s*$/, '');
    return { ok: true, sql: cleaned, masked: m.toLowerCase() };
  }

  function runQuery(db, sql, maxRows) {
    var stmt = null;
    try {
      stmt = db.prepare(sql);
      var columns = stmt.getColumnNames();
      var rows = [];
      var truncated = false;
      while (stmt.step()) {
        if (maxRows && rows.length >= maxRows) { truncated = true; break; }
        rows.push(stmt.get());
      }
      return { columns: columns, rows: rows, truncated: truncated };
    } catch (e) {
      return { error: String(e && e.message ? e.message : e) };
    } finally {
      if (stmt) { try { stmt.free(); } catch (e2) { /* ignore */ } }
    }
  }

  /* ------------------------------------------------------------------ */
  /* Friendly error messages                                             */
  /* ------------------------------------------------------------------ */

  function friendlyError(err) {
    var m;
    if ((m = /no such column: (.+)/i.exec(err))) {
      return "The column '" + m[1] + "' does not exist. Look at the table tabs above to find the exact column names. " +
        "If '" + m[1] + "' is meant to be a text value, put it inside single quotes.";
    }
    if ((m = /no such table: (.+)/i.exec(err))) {
      return "There is no table named '" + m[1] + "'. The tables are Students, Clubs, Events, and Registrations.";
    }
    if ((m = /near "([^"]*)": syntax error/i.exec(err))) {
      return 'Your query has a syntax error near ' + m[1] + '. Check the order of the clauses ' +
        '(SELECT, FROM, JOIN, WHERE, GROUP BY, ORDER BY) and check for missing commas or quotes.';
    }
    if (/incomplete input|unrecognized token|unterminated/i.test(err)) {
      return 'Your query looks unfinished. Check for a missing closing quote or parenthesis, or a missing part of a clause.';
    }
    if ((m = /ambiguous column name: (.+)/i.exec(err))) {
      return "The column '" + m[1] + "' exists in more than one table. Put the table name in front of it, like Events.club_id.";
    }
    if (/misuse of aggregate/i.test(err)) {
      return 'An aggregate function such as COUNT() cannot be used in WHERE. Use it in the SELECT list (or in HAVING after GROUP BY).';
    }
    if ((m = /no such function: (.+)/i.exec(err))) {
      return "SQLite does not know a function called " + m[1] + ". Check the spelling.";
    }
    return 'SQLite reported an error: ' + err;
  }

  /* ------------------------------------------------------------------ */
  /* Comparing results                                                   */
  /* ------------------------------------------------------------------ */

  function norm(v) {
    if (v === null || v === undefined) { return 'NULL'; }
    return (typeof v === 'number' ? 'n:' : 's:') + String(v);
  }

  function rowKey(row) { return JSON.stringify(row.map(norm)); }

  function sortedKeys(rows) { return rows.map(rowKey).sort(); }

  function sameMultiset(a, b) {
    if (a.length !== b.length) { return false; }
    var x = sortedKeys(a), y = sortedKeys(b);
    for (var i = 0; i < x.length; i++) { if (x[i] !== y[i]) { return false; } }
    return true;
  }

  function project(rows, map) {
    return rows.map(function (r) { return map.map(function (idx) { return r[idx]; }); });
  }

  function permutations(n) {
    var result = [];
    (function build(prefix, rest) {
      if (!rest.length) { result.push(prefix); return; }
      for (var i = 0; i < rest.length; i++) {
        build(prefix.concat(rest[i]), rest.slice(0, i).concat(rest.slice(i + 1)));
      }
    }([], Array.apply(null, { length: n }).map(function (_, i) { return i; })));
    return result;
  }

  /*
   * Find how the student's columns line up with the reference columns.
   * First by name, then by position, then by any column order.
   * Returns an array: mapping[j] = index of the student column for reference column j.
   */
  function mapColumns(s, r) {
    var n = r.columns.length;
    if (s.columns.length !== n) { return null; }
    var names = s.columns.map(function (c) { return c.toLowerCase(); });
    var byName = [];
    var okName = true;
    for (var j = 0; j < n; j++) {
      var idx = names.indexOf(r.columns[j].toLowerCase());
      if (idx < 0) { okName = false; break; }
      byName.push(idx);
    }
    if (okName && new Set(byName).size === n && sameMultiset(project(s.rows, byName), r.rows)) { return byName; }
    var identity = r.columns.map(function (_, i) { return i; });
    if (sameMultiset(project(s.rows, identity), r.rows)) { return identity; }
    if (n <= 5) {
      var perms = permutations(n);
      for (var p = 0; p < perms.length; p++) {
        if (sameMultiset(project(s.rows, perms[p]), r.rows)) { return perms[p]; }
      }
    }
    if (okName && new Set(byName).size === n) { return byName; }
    return identity;
  }

  /*
   * Compare one student result with one reference result.
   * Returns { ok: true } or { ok: false, why: 'columns'|'rows'|'values'|'order', ... }.
   */
  function compareResults(q, s, r) {
    if (s.columns.length !== r.columns.length) {
      return { ok: false, why: 'columns', more: s.columns.length > r.columns.length };
    }
    var map = mapColumns(s, r);
    var projected = project(s.rows, map);
    if (projected.length !== r.rows.length) {
      return { ok: false, why: 'rows', more: projected.length > r.rows.length, projected: projected };
    }
    if (!sameMultiset(projected, r.rows)) {
      return { ok: false, why: 'values', projected: projected };
    }
    if (q.orderCols) {
      var idxs = q.orderCols.map(function (name) { return r.columns.map(function (c) { return c.toLowerCase(); }).indexOf(name); });
      var key = function (row) { return JSON.stringify(idxs.map(function (i) { return norm(row[i]); })); };
      var sKeys = projected.map(key);
      var rKeys = r.rows.map(key);
      var inOrder = sKeys.every(function (k, i) { return k === rKeys[i]; });
      if (!inOrder) {
        var reversed = sKeys.slice().reverse().every(function (k, i) { return k === rKeys[i]; });
        return { ok: false, why: 'order', reversed: reversed, projected: projected };
      }
    }
    return { ok: true, projected: projected };
  }

  /* ------------------------------------------------------------------ */
  /* Questions                                                           */
  /* ------------------------------------------------------------------ */

  var QUESTIONS = [
    {
      id: 1,
      type: 'mc',
      difficulty: 'Beginner',
      topic: 'Primary keys',
      prompt: 'Which column uniquely identifies each student in the Students table?',
      choices: [
        { id: 'A', text: 'first_name' },
        { id: 'B', text: 'major' },
        { id: 'C', text: 'student_id' },
        { id: 'D', text: 'year_level' }
      ],
      correct: 'C',
      wrong: {
        A: 'Not quite. Two students can share a first name, so first_name cannot tell every row apart.',
        B: 'Not quite. Alex and Jordan are both Computer Science majors, so major repeats. It cannot identify one student.',
        D: 'Not quite. Many students are in the same year, so year_level repeats across rows.'
      },
      explanation: 'student_id is the primary key. A primary key must have a different value in every row, and it can never be empty. That is what lets the database find exactly one student, even if two students share a name or major.',
      hints: [
        'Open the Students tab in the Database Explorer and look for the key icon labeled PK.',
        'A primary key value must be different in every single row. Which column never repeats?'
      ],
      solutionText: 'C. student_id'
    },
    {
      id: 2,
      type: 'mc',
      difficulty: 'Beginner',
      topic: 'Foreign keys',
      prompt: 'Which column in the Registrations table connects a registration to a specific student?',
      choices: [
        { id: 'A', text: 'registration_id' },
        { id: 'B', text: 'student_id' },
        { id: 'C', text: 'event_id' },
        { id: 'D', text: 'attendance_status' }
      ],
      correct: 'B',
      wrong: {
        A: 'Not quite. registration_id is the primary key of Registrations. It identifies the registration itself, not the student.',
        C: 'Not quite. event_id is also a foreign key, but it points to the Events table. It connects a registration to an event, not to a student.',
        D: 'Not quite. attendance_status only describes what happened (Registered, Attended, or Cancelled). It does not point to any other table.'
      },
      explanation: 'student_id in Registrations is a foreign key. It stores a value from the primary key of the Students table. A primary key identifies a row in its own table. A foreign key refers to a row in another table. That is how relationships are built.',
      hints: [
        'Open the Registrations tab and look for columns marked FK.',
        'One FK points to Students and the other points to Events. Pick the one that points to Students.'
      ],
      solutionText: 'B. student_id'
    },
    {
      id: 3,
      type: 'sql',
      difficulty: 'Beginner',
      topic: 'SELECT basics',
      prompt: 'Write a SQL query to display all columns for every student.',
      reference: 'SELECT * FROM Students;',
      hints: [
        'Every query starts with SELECT and needs a FROM clause that names the table. Which table holds students?',
        'In SQL the asterisk (*) is a shortcut that means "all columns".',
        'Fill in the blanks: SELECT ___ FROM ___;'
      ],
      explanation: 'SELECT chooses which columns to return. The asterisk (*) means every column. FROM names the table to read. This query returns every column of every row in Students.',
      clauses: [
        ['SELECT *', 'Return every column.'],
        ['FROM Students', 'Read the rows from the Students table.']
      ],
      diagnose: function (ctx) {
        if (ctx.sql.indexOf('students') === -1) {
          return 'The question is about students. Read the rows from the Students table.';
        }
        if (ctx.why === 'columns' && !ctx.more) {
          return 'Your query returns only some of the columns. The question asks for all of them. Is there a shortcut for "all columns"?';
        }
        return null;
      }
    },
    {
      id: 4,
      type: 'sql',
      difficulty: 'Beginner',
      topic: 'Choosing columns',
      prompt: 'Display only the first name, last name, and major of every student.',
      reference: 'SELECT first_name, last_name, major\nFROM Students;',
      hints: [
        'Instead of *, list the columns you want after SELECT.',
        'Separate the column names with commas. The columns are first_name, last_name, and major.',
        'Pattern: SELECT column1, column2, column3 FROM Students;'
      ],
      explanation: 'Choosing specific columns is called projection. You list only the columns you need after SELECT. The rows stay the same, but the result has fewer columns.',
      clauses: [
        ['SELECT first_name, last_name, major', 'Project only these three columns, separated by commas.'],
        ['FROM Students', 'Read the rows from the Students table.']
      ],
      diagnose: function (ctx) {
        if (ctx.why === 'columns' && ctx.more) {
          return 'Your query returns more columns than the question asks for. Select only the three columns listed instead of using *.';
        }
        if (ctx.why === 'columns') {
          return 'Your query is missing one of the requested columns. The question asks for first name, last name, and major.';
        }
        return null;
      }
    },
    {
      id: 5,
      type: 'sql',
      difficulty: 'Beginner',
      topic: 'Filtering with WHERE',
      prompt: 'Find all students who are Seniors. Show every column.',
      reference: "SELECT *\nFROM Students\nWHERE year_level = 'Senior';",
      hints: [
        'You need a clause that keeps only the rows that match a condition. It goes after FROM.',
        'year_level holds text, so the value must go inside single quotes.',
        "Pattern: SELECT * FROM Students WHERE year_level = '...';"
      ],
      explanation: 'WHERE filters rows. The database checks each row and keeps it only when the condition is true. Here only the rows where year_level equals Senior are returned. Note for MySQL users: in SQLite the = comparison on text is case-sensitive, so \'senior\' would not match \'Senior\'.',
      clauses: [
        ['SELECT *', 'Return every column.'],
        ['FROM Students', 'Read the rows from the Students table.'],
        ["WHERE year_level = 'Senior'", 'Keep only rows where year_level is exactly Senior.']
      ],
      diagnose: function (ctx) {
        if (ctx.why === 'rows' && ctx.more) {
          return 'Your query runs, but it returns more rows than expected. Check your WHERE condition. It should keep only Seniors.';
        }
        if (ctx.why === 'rows' && ctx.sRows === 0) {
          return 'Your query returns no rows. Check the spelling and capitalization of the value in your condition. In SQLite, text comparison is case-sensitive.';
        }
        if (ctx.why === 'columns') {
          return 'The question asks for every column of the matching students. Is there a shortcut for "all columns"?';
        }
        if (ctx.sql.indexOf('where') === -1) {
          return 'There is no WHERE clause in your query. How do you keep only some of the rows?';
        }
        if (ctx.why === 'values') {
          return 'Your query returns the wrong students. Check the column and the value in your WHERE condition. The question asks for Seniors.';
        }
        return null;
      }
    },
    {
      id: 6,
      type: 'sql',
      difficulty: 'Beginner',
      topic: 'Sorting with ORDER BY',
      prompt: 'Display all students ordered alphabetically by last name. Show every column.',
      reference: 'SELECT *\nFROM Students\nORDER BY last_name ASC;',
      orderCols: ['last_name'],
      hints: [
        'Sorting is done by ORDER BY. It goes at the end of the query.',
        'Sort by the last_name column. ASC means A to Z and DESC means Z to A.',
        'Pattern: SELECT * FROM Students ORDER BY ___ ASC;'
      ],
      explanation: 'ORDER BY sorts the result. ASC (ascending) goes from A to Z or from small to large, and it is the default. DESC (descending) goes the other way. Without ORDER BY, the database may return rows in any order.',
      clauses: [
        ['SELECT *', 'Return every column.'],
        ['FROM Students', 'Read the rows from the Students table.'],
        ['ORDER BY last_name ASC', 'Sort by last name from A to Z.']
      ],
      diagnose: function (ctx) {
        if (ctx.why === 'order' && ctx.reversed) {
          return 'Your rows are sorted by the right column, but in the wrong direction. Alphabetical order goes A to Z. Check ASC and DESC.';
        }
        if (ctx.why === 'order') {
          return 'Your query returns the correct students, but they are not sorted by last name. Consider ORDER BY.';
        }
        if (ctx.why === 'columns') {
          return 'The question asks for every column. Is there a shortcut for "all columns"?';
        }
        return null;
      }
    },
    {
      id: 7,
      type: 'sql',
      difficulty: 'Intermediate',
      topic: 'Multiple conditions',
      prompt: 'Find all students who are Juniors or Seniors. Show every column.',
      reference: "SELECT *\nFROM Students\nWHERE year_level IN ('Junior', 'Senior');",
      hints: [
        'You want rows where year_level is one value or another value.',
        'There are two common tools: combine two conditions with OR, or use IN with a list of values in parentheses.',
        'One row holds only one year_level, so AND would never match. Choose OR or IN.'
      ],
      explanation: 'A logical condition combines tests. OR keeps a row when at least one test is true. IN is a shorter way to write several OR tests on the same column. Both queries return the same rows: WHERE year_level = \'Junior\' OR year_level = \'Senior\' is equivalent.',
      clauses: [
        ['SELECT *', 'Return every column.'],
        ['FROM Students', 'Read the rows from the Students table.'],
        ["WHERE year_level IN ('Junior', 'Senior')", 'Keep rows whose year_level is any value in the list. OR gives the same result.']
      ],
      diagnose: function (ctx) {
        if (ctx.sRows === 0 && /\band\b/.test(ctx.sql)) {
          return 'AND needs both tests to be true for the same row. A student cannot be both a Junior and a Senior, so nothing matches. Try OR, or IN.';
        }
        if (/\bor\s*'[^']*'\s*$/.test(ctx.sqlOriginalLower)) {
          return "After OR you need a full condition, such as year_level = 'Senior'. A value alone is not a condition.";
        }
        if (ctx.why === 'rows' && !ctx.more) {
          return 'Your query returns fewer rows than expected. Did you include both year levels?';
        }
        if (ctx.why === 'columns') {
          return 'The question asks for every column. Is there a shortcut for "all columns"?';
        }
        return null;
      }
    },
    {
      id: 8,
      type: 'sql',
      difficulty: 'Intermediate',
      topic: 'Aggregation with GROUP BY',
      prompt: 'Count how many students belong to each major. Show the major and the count.',
      reference: 'SELECT major, COUNT(*) AS student_count\nFROM Students\nGROUP BY major;',
      requireGroupBy: true,
      hints: [
        'You want one result row per major. Which clause puts rows that share a value into one group?',
        'COUNT(*) counts the rows inside each group.',
        'Select major and COUNT(*), then add GROUP BY with the same column you selected.'
      ],
      explanation: 'GROUP BY puts rows with the same major into one group. COUNT(*) then counts the rows in each group, so you get one row per major. Note for MySQL users: SQLite does not stop you from selecting a column that is not grouped. MySQL (with its default settings) would show an error instead.',
      clauses: [
        ['SELECT major, COUNT(*) AS student_count', 'Show each major and the number of rows in its group. AS gives the count a readable name.'],
        ['FROM Students', 'Read the rows from the Students table.'],
        ['GROUP BY major', 'Make one group for each different major.']
      ],
      diagnose: function (ctx) {
        if (ctx.sql.indexOf('group by') === -1 && /count\s*\(/.test(ctx.sql)) {
          return 'COUNT() without GROUP BY counts all rows as one group, so you get a single row. Add GROUP BY to count each major separately. (SQLite lets this run. MySQL would show an error.)';
        }
        if (ctx.why === 'columns' && ctx.more) {
          return 'Your query returns more columns than the question asks for. You need only the major and the count.';
        }
        if (ctx.why === 'columns') {
          return 'Your query is missing something. The question asks for the major and also the number of students in it. Which function counts rows?';
        }
        if (ctx.why === 'rows' && ctx.more) {
          return 'Your query returns more rows than expected. Check which column you are grouping by.';
        }
        if (ctx.why === 'values') {
          return 'Your query returns the right number of rows, but the groups are different. The question asks for one group per major. Check the column in GROUP BY.';
        }
        return null;
      }
    },
    {
      id: 9,
      type: 'sql',
      difficulty: 'Intermediate',
      topic: 'JOIN',
      prompt: 'Display each event name along with the name of the club hosting it.',
      reference: 'SELECT Events.event_name, Clubs.club_name\nFROM Events\nJOIN Clubs\nON Events.club_id = Clubs.club_id;',
      hints: [
        'Event names live in the Events table and club names live in the Clubs table. You need both tables.',
        'Look at the FK column in Events. It points to the primary key of Clubs.',
        'Pattern: FROM Events JOIN Clubs ON <the FK in Events> = <the PK in Clubs>. Put the table name before each column, like Events.club_id.'
      ],
      explanation: 'A JOIN combines rows from two tables. The ON condition tells the database which rows belong together: a row in Events and a row in Clubs are paired when their club_id values are equal. The foreign key in Events matches the primary key in Clubs.',
      clauses: [
        ['SELECT Events.event_name, Clubs.club_name', 'Choose one column from each table. The table name before the dot removes any confusion.'],
        ['FROM Events', 'Start with the Events table.'],
        ['JOIN Clubs', 'Bring in the Clubs table.'],
        ['ON Events.club_id = Clubs.club_id', 'Pair each event with the club whose club_id matches.']
      ],
      diagnose: function (ctx) {
        if (/\bjoin\b/.test(ctx.sql) && !/\bon\b|\busing\b/.test(ctx.sql)) {
          return 'You are missing a JOIN condition, so every event is paired with every club. How are Events and Clubs connected? Add an ON clause.';
        }
        if (!/\bjoin\b/.test(ctx.sql) && ctx.sql.indexOf('where') === -1 && ctx.why === 'rows') {
          return 'Listing two tables without a condition pairs every event with every club. How are Events and Clubs connected? Use JOIN with an ON clause.';
        }
        if (ctx.why === 'columns') {
          return 'The question asks for exactly two columns: the event name and the club name.';
        }
        if (ctx.why === 'rows' && ctx.more) {
          return 'Your query returns more rows than expected. Check that your ON condition matches the foreign key to the primary key.';
        }
        if (ctx.why === 'rows' || ctx.why === 'values') {
          return 'The pairs of events and clubs are not right. In your ON condition, match the foreign key club_id in Events with the primary key club_id in Clubs.';
        }
        return null;
      }
    },
    {
      id: 10,
      type: 'sql',
      difficulty: 'Advanced',
      topic: 'LEFT JOIN + GROUP BY + ORDER BY',
      prompt: 'Find the number of events hosted by each club, including clubs that have hosted zero events. Display the club name and event count, ordered from highest to lowest.',
      reference: 'SELECT Clubs.club_name,\n       COUNT(Events.event_id) AS event_count\nFROM Clubs\nLEFT JOIN Events\nON Clubs.club_id = Events.club_id\nGROUP BY Clubs.club_id, Clubs.club_name\nORDER BY event_count DESC;',
      orderCols: ['event_count'],
      requireGroupBy: true,
      requireJoin: true,
      hints: [
        'Start from Clubs, not Events. Then every club can appear, even a club with no events.',
        'LEFT JOIN keeps every row from the left table and fills in NULL when there is no match on the right.',
        'COUNT(Events.event_id) skips NULL values, so a club with no events gets 0. COUNT(*) would count the NULL row and show 1.',
        'Finish with GROUP BY on the club and ORDER BY your count with DESC.'
      ],
      explanation: 'A normal (INNER) JOIN drops any club that has no matching event, so the club with zero events disappears. LEFT JOIN keeps every club and fills the event columns with NULL when nothing matches. COUNT(Events.event_id) counts only real events because it ignores NULL, so that club shows 0. COUNT(*) would count the NULL row as 1 and give a wrong answer.',
      clauses: [
        ['SELECT Clubs.club_name, COUNT(Events.event_id) AS event_count', 'Show the club and the number of real events. COUNT(column) ignores NULL.'],
        ['FROM Clubs', 'Start from Clubs so every club is kept.'],
        ['LEFT JOIN Events ON Clubs.club_id = Events.club_id', 'Attach events to clubs. Clubs without events stay, with NULL on the Events side.'],
        ['GROUP BY Clubs.club_id, Clubs.club_name', 'One group for each club.'],
        ['ORDER BY event_count DESC', 'Show the clubs with the most events first.']
      ],
      diagnose: function (ctx) {
        if (ctx.why === 'rows' && !ctx.more) {
          return 'A club is missing from your result. An INNER JOIN removes clubs that have no events. Which kind of join keeps every row from the Clubs table?';
        }
        if (ctx.why === 'values' && /count\s*\(\s*\*\s*\)/.test(ctx.sql)) {
          return 'The club with no events shows a count of 1 instead of 0. COUNT(*) counts the empty NULL row. Count a column from the Events table instead.';
        }
        if (ctx.why === 'order' && ctx.reversed) {
          return 'Your rows are sorted, but from lowest to highest. The question asks for highest to lowest. Check ASC and DESC.';
        }
        if (ctx.why === 'order') {
          return 'Your counts are correct, but the rows are not sorted from highest to lowest. Consider ORDER BY with DESC.';
        }
        if (ctx.why === 'columns') {
          return 'The question asks for exactly two columns: the club name and the event count.';
        }
        if (/\bjoin\b/.test(ctx.sql) && !/\bon\b|\busing\b/.test(ctx.sql)) {
          return 'You are missing a JOIN condition. How are Clubs and Events connected?';
        }
        if (ctx.sql.indexOf('group by') === -1) {
          return 'To get one count per club you need GROUP BY.';
        }
        return null;
      }
    }
  ];

  /* ------------------------------------------------------------------ */
  /* Evaluating an answer                                                */
  /* ------------------------------------------------------------------ */

  function evaluateMc(q, choiceId) {
    if (!choiceId) { return { correct: false, message: 'Pick one of the answers first.' }; }
    if (choiceId === q.correct) { return { correct: true, message: q.explanation }; }
    return { correct: false, message: q.wrong[choiceId] };
  }

  var GENERIC = {
    columns_more: 'Your query returns more columns than the question asks for.',
    columns_less: 'Your query returns fewer columns than the question asks for.',
    rows_more: 'Your query runs, but it returns more rows than expected. Check your WHERE condition or your JOIN condition.',
    rows_less: 'Your query runs, but it returns fewer rows than expected. A condition may be too strict, or a join may be dropping rows.',
    values: 'Your query returns the right number of rows, but some values are different. Check the columns you selected and the conditions you used.',
    order: 'Your query returns the right rows, but they are not in the requested order. Consider ORDER BY.'
  };

  function describe(q, cmp, run, masked, rawLower) {
    var ctx = {
      why: cmp.why, more: !!cmp.more, reversed: !!cmp.reversed,
      sRows: run.rows.length, sql: masked, sqlOriginalLower: rawLower
    };
    var specific = q.diagnose ? q.diagnose(ctx) : null;
    if (specific) { return specific; }
    if (cmp.why === 'columns') { return cmp.more ? GENERIC.columns_more : GENERIC.columns_less; }
    if (cmp.why === 'rows') { return cmp.more ? GENERIC.rows_more : GENERIC.rows_less; }
    if (cmp.why === 'order') { return GENERIC.order; }
    return GENERIC.values;
  }

  /*
   * Evaluate a SQL answer.
   * The student query and the reference query both run on two fresh databases:
   * the visible one and a hidden one with different records.
   */
  function evaluateSql(SQL, q, studentSql) {
    var v = validateSql(studentSql);
    if (!v.ok) { return { correct: false, kind: 'invalid', message: v.message }; }

    var dbA = createDb(SQL, 'base');
    var dbB = createDb(SQL, 'variant');
    try {
      var sA = runQuery(dbA, v.sql);
      if (sA.error) { return { correct: false, kind: 'error', message: friendlyError(sA.error) }; }
      var rA = runQuery(dbA, q.reference);
      var cmpA = compareResults(q, sA, rA);
      if (!cmpA.ok) {
        return { correct: false, kind: 'wrong', message: describe(q, cmpA, sA, v.masked, v.sql.toLowerCase()) };
      }

      var sB = runQuery(dbB, v.sql);
      var rB = runQuery(dbB, q.reference);
      var cmpB = sB.error ? { ok: false, why: 'values' } : compareResults(q, sB, rB);
      if (!cmpB.ok) {
        return {
          correct: false,
          kind: 'hardcoded',
          message: 'Your query gives the right rows for the visible records, but it does not give the right answer when the records change. ' +
            'This often happens when a query uses fixed ID numbers or a typed-in answer. Write the query so it works for any data in these tables.'
        };
      }

      if (q.requireGroupBy && v.masked.indexOf('group by') === -1) {
        return { correct: false, kind: 'structure', message: 'The result is right, but this challenge practices GROUP BY. Solve it with GROUP BY.' };
      }
      if (q.requireJoin && !/\bjoin\b/.test(v.masked)) {
        return { correct: false, kind: 'structure', message: 'The result is right, but this challenge practices JOIN. Solve it by joining the two tables.' };
      }
      return { correct: true, kind: 'ok', message: q.explanation };
    } finally {
      dbA.close();
      dbB.close();
    }
  }

  return {
    SCHEMA_SQL: SCHEMA_SQL,
    BASE_DATA_SQL: BASE_DATA_SQL,
    VARIANT_DATA_SQL: VARIANT_DATA_SQL,
    TABLE_META: TABLE_META,
    TABLE_ORDER: TABLE_ORDER,
    QUESTIONS: QUESTIONS,
    createDb: createDb,
    validateSql: validateSql,
    maskSql: maskSql,
    runQuery: runQuery,
    friendlyError: friendlyError,
    evaluateMc: evaluateMc,
    evaluateSql: evaluateSql
  };
}));
