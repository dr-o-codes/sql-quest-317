# SQL Quest: Campus Database Challenge

CS317 | Relational Database Practice

SQL Quest is a self-contained website with 10 guided challenges. Students write real SQL and run it against a small Campus Life database (Students, Clubs, Events, Registrations) inside their browser. It uses SQLite compiled to WebAssembly (sql.js). There is no server, no account, and no API key.

## Files

- `index.html` page structure
- `style.css` styling
- `script.js` interface (explorer, editor, hints, progress, completion screen)
- `quest-core.js` database, the 10 questions, hints, feedback, and the answer checker
- `sql-wasm-inline.js` the sql.js library (WebAssembly is built in, so no extra files are needed)
- `.nojekyll` tells GitHub Pages to serve the files as they are

## Deploy on GitHub Pages

1. Sign in to GitHub and click **New repository**. Name it, for example, `sql-quest`. Choose **Public**. Click **Create repository**.
2. Click **uploading an existing file**. Drag in everything from this folder (including the `.nojekyll` file). Click **Commit changes**.
3. Open **Settings**, then **Pages**.
4. Under **Build and deployment**, set **Source** to **Deploy from a branch**. Choose branch **main** and folder **/ (root)**. Click **Save**.
5. Wait one or two minutes. The page shows your link: `https://YOUR-USERNAME.github.io/sql-quest/`
6. Share that link with students.

Tip: if the upload page hides the `.nojekyll` file, it is fine. The site works without it.

## Run on your own computer

Double-click `index.html`, or run `python3 -m http.server` in this folder and open `http://localhost:8000`.

## How answers are checked

- Student SQL is never compared as text. It is run in SQLite, and the result is compared with the result of the reference query.
- Different correct queries are accepted (for example IN or OR, JOIN or USING, any column alias).
- Row order is ignored unless the question asks for sorting (Challenges 6 and 10).
- Every answer is also run on a hidden second data set. A hard-coded answer that matches the visible rows fails there.
- Challenges 8 and 10 must use GROUP BY, and Challenge 10 must use a join.
- The database is read-only. Only SELECT queries are allowed, one statement at a time, and SQLite is also set to `query_only`. Each run starts from a fresh copy of the data.
- Support steps: first wrong answer gives a short diagnosis, the second adds a more specific hint, and after the third the Show Solution button unlocks.

## Customizing

Questions, hints, reference queries, and feedback are in `quest-core.js`. The visible data is `BASE_DATA_SQL`. If you change it, keep `VARIANT_DATA_SQL` different from it so the hard-coding check still works.

## SQLite notes for MySQL users

- `=` on text is case-sensitive in SQLite.
- SQLite allows a column that is not in GROUP BY. MySQL normally refuses.
- Use single quotes for text values.

sql.js license: see `SQLJS-LICENSE.txt`.
