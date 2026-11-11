# Known gaps

This file lists every known gap in `@questdb/sql-parser` after PR #42, sorted
from most to least severe.

**What this package is for.** The QuestDB web console uses it for three things:

- coloring SQL (syntax highlighting);
- formatting SQL;
- suggesting words while you type (autocomplete).

**The rule it follows.** Anything the QuestDB server accepts should also work
here. The opposite is fine: this package may accept SQL that the server would
reject.

**Three things to keep in mind when reading this list:**

- Queries always run exactly as typed. The console sends your text to the server
  unchanged, so no gap here changes what a query does.
- You never see a parse error from this package. The red error marks in the
  editor come from the server.
- Autocomplete only looks at the statement you are typing in, meaning the text
  after the last `;`.

Severity levels used below:

- **High**: the editor writes broken SQL for you.
- **Medium**: suggestions go missing, or the editor offers something wrong that
  is easy to pick.
- **Low**: rare SQL, or a cosmetic issue.
- **By design**: a deliberate choice; nothing to fix.

---

## High

### Accepting a suggestion inside backticks leaves the backtick open

Type ``SELECT * FROM `tra`` and accept the suggestion `trades`. The editor
writes ``SELECT * FROM `trades`` with no closing backtick, so the query is
broken until you fix it by hand. Double quotes work correctly.

- Where: the web console (`ui` repo), not this package.
- Fix together with the console's upgrade to this parser version.

---

## Medium

### No suggestions after a backtick name that contains `--` or `/*`

In ``SELECT * FROM `my--table` WHERE ``, the console decides that the cursor is
inside a comment, so it shows no suggestions at all.

- Where: the web console (`ui` repo).
- Fix together with the console upgrade.

### Wrong permission words in GRANT / REVOKE

After `GRANT CONVERT ` the editor offers `MATERIALIZED`, `TABLE`, `GROUP`, `ON`
and `TO`, but only `PARTITION` is correct there. After `GRANT ALTER COLUMN `, it
offers `ON` and `TO` before the required `TYPE` or `CACHE`.

- Picking one of the wrong words gives a permission that does not exist.
- Enterprise only.

### Statements do not need a `;` between them

This package lets one statement follow another without a `;`. That is convenient
in an editor, but when it meets SQL it does not understand, it reads the
leftover words as the start of a new statement instead of reporting a problem.
For example, `SELECT double precision '1'` is read as two statements.

What you notice:

- suggestions after that point are wrong or missing;
- if your statements are separated only by blank lines, the statements below it
  can lose suggestions too.

This is a product decision, not a bug. Changing it would change how the editor
splits statements.

### The automated tests can miss missing suggestions

The shared autocomplete test types each query word by word and checks that the
next word is suggested. It has three blind spots:

- it passes when no suggestions come back at all;
- it accepts "a name is allowed here" without checking that a name is actually
  shown;
- it never checks that wrong words are left out.

Newer tests check suggestion lists directly, but the shared test is unchanged.
This is a gap for maintainers, not users.

---

## Low

### Rare SQL that this package does not understand yet

The server accepts all of these. When you type one:

- suggestions stop after it, until the next `;`;
- with capitalization on, the formatter leaves that one statement in its
  original case, while other statements are still capitalized;
- in notebooks, the automatic chart setup may not work for that query.

| You type                                                            | Notes                                                                                  |
| ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `SELECT .5m + 1`, `SELECT 1.m + 1`, `SELECT .5d + 1`                | Number with a suffix and a leading or trailing dot                                     |
| `SELECT sum(x) OVER (w ORDER BY x) … WINDOW w AS (…)`               | A window inside `OVER` that builds on a named window                                   |
| `SELECT 1 BETWEEN(0, 2)`                                            | The bracket form of BETWEEN                                                            |
| `SELECT max('orders_1'.revenue) FROM …`                             | A table name in single quotes before a dot                                             |
| `SELECT timestamp '…' AT TIME ZONE 'UTC'::timestamp`                | A cast right after AT TIME ZONE                                                        |
| `… EXPIRE ROWS WHEN … CLEANUP EVERY h`                              | A time unit without a number                                                           |
| `SELECT double precision '1'`                                       | Read as two statements (see the `;` gap above)                                         |
| `DECLARE @foo$bar := 1 …`, `DECLARE @1 := 1 …`                      | `$` or a leading digit in a variable name; notebooks do not pick these up as variables |
| `SELECT :"foo"`, `SELECT :'foo'`, `SELECT :$1`, `SELECT :+`         | Unusual bind variable names                                                            |
| `SELECT any FROM t`, `CREATE TABLE any (any INT)`                   | A column or table named `any`. `any` stays a keyword because of `= ANY(…)`.            |
| `ALTER USER u SET MEMORY LIMIT "1G"`, `… WITH (cpu_weight = "100")` | Values in double quotes (Enterprise)                                                   |
| `GRANT CREATE TABLE TO parquet`                                     | A user named `parquet` or `native` (Enterprise)                                        |
| `CREATE USER u WITH PASSWORD $`                                     | A password that is just `$` (Enterprise)                                               |

### Extra suggestions that are valid but not very useful

- `AT` (for AT TIME ZONE) and `IS` are offered after any expression.
- `WHERE` is offered after `LATEST ON … PARTITION BY x`.
- `UNION` / `EXCEPT` / `INTERSECT` are offered after `LIMIT 5, `.
- `TO` is offered after `SET x = 1, `.
- `WITH` is offered after a column named `timestamp`.
- `BEGIN`, `COMMIT`, `ROLLBACK`, `SET` and similar are offered at the start of
  every statement.

### Suggestions inside a nested comment

In `SELECT 1 /* outer /* inner */ `, the cursor is still inside the outer
comment, but the console offers keywords there.

- Where: the web console (`ui` repo).

### Colors in the editor

The console colors SQL with its own rules (`ui` repo). These already show with
the parser version the console uses today:

- After the inner `*/` of a nested comment, the rest is colored as code although
  it is still a comment.
- In ``SELECT * FROM `order` ``, the backtick name is not colored as a name;
  `order` looks like a keyword.
- `1.5f`, `1e36d`, `1.5e3m`, `E'x'` and `100ns` are colored in pieces instead of
  as one value.
- `:symbol` and `$1` are not colored as variables.
- Inside `ARRAY[…]`, functions, CASE words, names and operators get no color.

### Columns named like SQL words look odd after formatting

A column named like a clause word, such as `window` or `pivot`, is put on its
own line as if it started a clause:

```
select window - price from trades
→
SELECT
window -price
FROM trades
```

The query still means the same thing; only the layout is off.

### One timing test is sometimes flaky

An autocomplete speed test, which checks that every cursor position in a long
query answers within 100 ms, sometimes fails when the machine is busy. It passes
when run on its own.

### Some forms have no server test

These are covered only by this package's own tests, because no server test uses
them:

- `REVOKE … WITH VERIFICATION`
- `POSTING_DELTA`
- the `default` compression codec
- `TTL 2 h`
- `ALTER MATERIALIZED VIEW … SUSPEND WAL WITH …`

---

## By design

### Quotes inside block comments

On the server, a quoted `'*/'` inside a block comment does not end the comment,
so `SELECT 1 /* '*/' */ + 1` works there. This package does not copy that: if it
did, a normal comment with an apostrophe, like `/* don't */`, could hide the
rest of the query from the editor.

### SQL that the server rejects but this package accepts

These never break valid SQL; they are simply not flagged:

- `SELECT x 'alias'` when `x` is not a type name;
- unknown `WITH` settings, codec names or units;
- `PREVAILING JOIN`;
- duplicate or misplaced clauses (for example `INDEX TYPE NONE`, a storage
  policy on a materialized view, `EXPLAIN DROP …`);
- the same DECLARE marker twice;
- `SAMPLE BY $1` without a unit, and `SAMPLE BY foo`;
- `MAPPING PRIORITY` for users and service accounts (the server allows it only
  for groups);
- clause orders the server rejects but older versions of this package accepted;
- a loose `SET …` statement.

### Behaviour choices you may notice

- `SELECT timestamp 'x'` is read as the value `x` of type timestamp, as on the
  server. It is not read as a column called `timestamp` with the alias `x`.
- Words the server does not reserve work as names: `left`, `right`, `window`,
  `by`, `group`, `when`, `then`, `else`, `show`, `copy`, `grant` and others.
  `is`, `ilike` and `declare` work as names only in column definitions, and the
  formatter keeps their case there.
- A name in single quotes (`FROM 'it''s'`) is kept exactly as written, because
  the server does the same.
- Block comments can be nested, a comment that is never closed runs to the end
  of the text, and empty statements (`;;`) are skipped.
- `:name` is a bind variable, except after a value. Inside `[…]` it is an array
  slice, as in `arr[offset :n]` or `arr[left:n]`.
- `1d` and `1.5d` are durations (days) in SAMPLE BY and similar places, and
  numbers inside expressions.
- An unquoted password is one value, kept as typed: `null`, `1G`, `true`,
  `select`, `abc@def`, `abc@123`, `@123`, `$1`. The formatter never changes its
  case, and the editor suggests nothing there.

### When the package turns SQL back into text

Some output is written slightly differently from the input but means the same.
The web console does not show this to users:

- `DEDUPLICATE` → `DEDUP`
- `VACUUM PARTITIONS` → `VACUUM TABLE`
- `DROP ALL` → `DROP ALL TABLES`
- `LIMIT ,5` → `LIMIT 0, 5`
- `REFRESH INCREMENTAL` → `REFRESH IMMEDIATE`
- `<>` → `!=`
- hints and `[NOT] NULL` column notes are dropped
- some quotes are dropped

---

## Found during review and already fixed in PR #42

For the record, these were found by the PR #42 reviews and fixed before merge:

- array slices next to bind variables (`arr[offset :n]`, `arr[CASE … END:n]`,
  binds inside `[… OVER (PARTITION BY :k)]`);
- `UNNEST(…) LEFT JOIN` and `UNNEST(…) WINDOW` misread;
- `LIMIT` wrongly suggested after `GRANT CREATE TABLE `;
- unquoted passwords that were split, rejected, or capitalized by the formatter;
- invalid column types (`REGCLASS`, `REGPROCEDURE`, `ARRAY`) and `UNLIMITED`
  offered where the server rejects them;
- missing or wrong column suggestions in `DEDUP KEYS(` and
  `EXPIRE ROWS KEEP … ON / PARTITION BY`, now taken from the table or view being
  defined, through joins, stars, sub-queries and CTEs;
- `ROLLUP((x))`, `CUBE((x))`, `GROUPING SETS (((x)), ())` and `ROLLUP(@k)`;
- `is`, `ilike` and `declare` column names being capitalized;
- one unsupported statement turning off capitalization for the whole script.
