# Known limitations and accepted tradeoffs

`@questdb/sql-parser` is not meant to be an exact mirror of the QuestDB server
parser. It is used for:

1. syntax highlighting (word lists in `src/grammar/*`);
2. the formatter;
3. autocomplete.

There is one rule: it must never be stricter than the server. SQL the server
accepts must parse here, while SQL the server rejects may still parse.
Everything below was reviewed and accepted with that in mind (PR #42 and its
review).

## Accepted gaps: server-valid SQL that does not parse yet

All of these are rare. A parse error is never shown to users: the console's
error markers come from the server's `/api/v1/sql/validate`.

The impact is limited to two places:

- **Autocomplete:** suggestions are lost _after_ the unsupported spot, in the
  same statement only. The console sends only the text since the last `;`.
- **Formatter:** with `capitalize`, keywords are not capitalized anywhere in the
  input if any statement in it does not parse (the whole script, not only the
  failing statement). Layout and meaning are kept.

| SQL                                                                 | Notes                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SELECT .5m + 1`, `SELECT 1.m + 1`, `SELECT .5d + 1`                | Decimal/double suffix after a leading or trailing dot                                                                                                                                                                                       |
| `SELECT sum(x) OVER (w ORDER BY x) … WINDOW w AS (…)`               | Inline window inheriting a named window                                                                                                                                                                                                     |
| `SELECT 1 BETWEEN(0, 2)`                                            | Tuple form of BETWEEN                                                                                                                                                                                                                       |
| `SELECT max('orders_1'.revenue) FROM …`                             | Single-quoted table qualifier                                                                                                                                                                                                               |
| `ALTER USER u SET MEMORY LIMIT "1G"`; `… WITH (cpu_weight = "100")` | Double-quoted memory / resource-group values                                                                                                                                                                                                |
| `DECLARE @k := a … GROUP BY ROLLUP(@k)`                             | Declared variable inside ROLLUP / CUBE / GROUPING SETS                                                                                                                                                                                      |
| `… EXPIRE ROWS WHEN … CLEANUP EVERY h`                              | Interval unit without a number                                                                                                                                                                                                              |
| `SELECT double precision '1'`                                       | Typed literal with the two-word type: read as `double AS precision` plus a statement `'1'`                                                                                                                                                  |
| `DECLARE @foo$bar := 1 …`, `DECLARE @1 := 1 …`                      | `$` or a leading digit in a variable name                                                                                                                                                                                                   |
| `GRANT CREATE TABLE TO parquet` (also `native`)                     | Grantee named `parquet` / `native` is read as part of a `… TO PARQUET` permission                                                                                                                                                           |
| `SELECT timestamp '…' AT TIME ZONE 'UTC'::timestamp`                | Cast directly after AT TIME ZONE                                                                                                                                                                                                            |
| `/* '*/' */` inside a statement                                     | The server pairs quotes inside block comments (four `DeclareTest` queries rely on it). Not copied on purpose: an apostrophe in a comment (`/* don't */`) would swallow the rest of the query in the editor. This looks like a server quirk. |

## Statements without `;`

Consecutive statements do not need a `;` between them, for editor convenience.
As a result, syntax this parser does not know becomes a silent extra statement
instead of an error. For example, unsupported trailing words are read as the
start of a new statement.

If statements in the editor are separated only by blank lines, an unsupported
statement can also cost column suggestions in the statements below it.

## Looser than the server (accepted)

These parse here although the server rejects them. They never break valid SQL:

- `x 'alias'` as a column alias, when `x` is not a type name. The server reads
  it as a cast and rejects it.
- Unknown `WITH` table params (`commit_mode = …`), unknown codec / option names,
  units outside the server's sets, `PREVAILING JOIN`.
- Duplicate or misplaced clauses the server rejects, such as `INDEX TYPE NONE`,
  storage policy on materialized views, or `EXPLAIN` of DROP / ALTER.
- Duplicate DECLARE markers (`DECLARE AUDITED AUDITED …`).
- `SAMPLE BY $1` without a unit, `SAMPLE BY foo`.
- `MAPPING PRIORITY` after `SET RESOURCE GROUP` for users and service accounts.
  The server only allows it for groups.
- Clause orders the server rejects, such as SAMPLE BY before LATEST ON, or WHERE
  after `LATEST ON … PARTITION BY`. They were kept so existing input keeps
  parsing.
- A loose `SET …` statement: any names, literals, `=`, `TO` and `,` after `SET`.

## Behaviour choices

- **Typed literals:** `SELECT timestamp 'x' FROM t` is a typed literal (a cast),
  as on the server, not the column `timestamp` with alias `x`. A non-type name
  followed by a string, `SELECT price 'p'`, is still an alias.
- **Keyword-named columns:** words the server does not reserve work as names:
  `left`, `right`, `window`, `by`, `group`, `when`, `then`, `else`, `show`,
  `copy`, `grant`, …
  - They are not taken as implicit aliases where they start a join, clause or
    statement (the server's `tableAliasStop` / `columnAliasStop`).
  - `any` stays reserved because of `= ANY(…)`.
  - `is`, `ilike` and `declare` are names only in column definitions.
- **Single-quoted values and names:** `''` inside a single-quoted _value_
  round-trips unchanged. A single-quoted _name_ (`FROM 'it''s'`) is not
  unescaped, because the server strips only the outer quotes
  (`GenericLexer.unquote`).
- **Comments and statements:** block comments nest, an unterminated `/*` runs to
  the end of the input, and empty statements (`;;`) are skipped.
- **Bind variables:** `:name` is a bind variable unless the colon follows an
  operand (a name, literal, `)`, `]` or CASE `END`). Inside `[…]` a
  keyword-named column before the colon makes it a slice (`arr[offset :n]`,
  `arr[left:n]`); after WHEN / THEN / ELSE it stays a bind variable.
- **Number tokens:** `1d` and `1.5d` lex as durations (days). In an expression
  they are typed as doubles; `d` is a double suffix only after an exponent
  (`1e36d`). `ARRAY` is a keyword token, exported as `ArrayType`.
- **Passwords:** an unquoted password is one value, read as written, as on the
  server (`WITH PASSWORD null`, `1G`, `true`, `abc1`). The formatter never
  capitalizes it, and autocomplete offers no keywords there.

## toSql normalisations

toSql output keeps the meaning, but it is not a byte-for-byte copy of the input:

- `DEDUPLICATE` → `DEDUP`; ALTER always prints `ENABLE`.
- `VACUUM PARTITIONS` → `VACUUM TABLE`; `DROP ALL` → `DROP ALL TABLES`;
  `UPDATE t AS x` → `UPDATE t x`.
- `LIMIT ,5` → `LIMIT 0, 5`; `LIMIT 5,` → `LIMIT 5`.
- `REFRESH INCREMENTAL` → `REFRESH IMMEDIATE`; `[NOT] NULL` column modifiers are
  dropped (the server ignores them).
- `<>` → `!=`; hints (`/*+ … */`) are dropped.
- Quotes are dropped on some names: `OWNED BY 'g'` → `OWNED BY g`, `"column"` →
  `column`.
- `ALTER VIEW v AS SELECT …` is printed with parentheses. The server accepts
  both forms.
- `CANCEL QUERY 123` is printed as `CANCEL QUERY '123'`.

## Autocomplete noise (valid but broad)

- `AT` (AT TIME ZONE) and `IS` are offered after any expression.
- `WITH` is offered after a column named `timestamp`.
- In GRANT / REVOKE, generic words (`MATERIALIZED`, `TABLE`, `ON`, `TO`, …) are
  offered next to the real permission continuations, e.g. after
  `GRANT CONVERT `.
- `WHERE` is offered after `LATEST ON … PARTITION BY x`, and UNION / EXCEPT /
  INTERSECT after `LIMIT 5, `.
- `TO` is offered after `SET x = 1, `.
- Statement keywords (`BEGIN`, `COMMIT`, `SET`, …) are offered at the start of a
  statement.

## Formatter

- A column named like a clause word goes on its own line, as if it were a
  clause: `select price, window from trades` →
  `SELECT price,\nwindow\nFROM trades`, and `window - price` → `window -price`.
  The meaning is unchanged.
- With `capitalize`, one statement that does not parse leaves the keywords of
  the whole input uncapitalized (e.g. `select 1; select .5m + 1; select 2`).

## Web console (separate `ui` repo)

The console's Monaco highlighter and editor helpers do not know the newer
lexical forms yet. These are cosmetic, and need changes in the `ui` repo when it
picks up this version:

- nested block comments are highlighted as code after the inner `*/`;
- backtick-quoted names are colored as separate words;
- `1.5f`, `1e36d`, `1.5e3m`, `E'x'`, `100ns`, `$1` and `:name` get the wrong
  token colors;
- accepting a completion after an opening backtick (``FROM `tra``) leaves the
  backtick unclosed; the UI only handles double-quoted names there;
- the console's comment guard treats `--` inside a backtick name
  (`` `my--table` ``) as a comment, so it shows no suggestions after it.

## Tests

- One autocomplete timing test ("every cursor position in a long query answers
  within 100 ms") is occasionally flaky when the suite runs in parallel. It
  passes when run alone.
- Server queries used as tests live in `tests/fixtures/server-queries.json`,
  with their source `file:line`. Forms with no server test are covered only by
  focused tests: `REVOKE … WITH VERIFICATION`, `POSTING_DELTA`, the `default`
  codec, `TTL 2 h`, and materialized view `SUSPEND WAL WITH`.
