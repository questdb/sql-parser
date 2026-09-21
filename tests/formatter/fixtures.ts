import { FormatOptions } from "../../src/formatter/index"

export type Fixture = {
  name: string
  input: string
  expected: string
  options?: FormatOptions
}

const columns = (count: number, prefix = "col_") =>
  Array.from({ length: count }, (_, i) => `${prefix}${i}`)

export const fixtures: Fixture[] = [
  {
    name: "LATEST ON keeps PARTITION BY on its line",
    input:
      "SELECT * FROM fx_trades WHERE symbol = 'EURUSD' LATEST ON timestamp PARTITION BY venue",
    expected: [
      "SELECT *",
      "FROM fx_trades",
      "WHERE symbol = 'EURUSD'",
      "LATEST ON timestamp PARTITION BY venue",
    ].join("\n"),
  },
  {
    name: "ALTER TABLE action starts a line",
    input: "ALTER TABLE market_data ADD COLUMN venue SYMBOL CAPACITY 256 CACHE",
    expected: [
      "ALTER TABLE market_data",
      "ADD COLUMN venue SYMBOL CAPACITY 256 CACHE",
    ].join("\n"),
  },
  {
    name: "LATEST BY is a clause of its own",
    input: "SELECT * FROM trades LATEST BY symbol",
    expected: ["SELECT *", "FROM trades", "LATEST BY symbol"].join("\n"),
  },
  {
    name: "ALTER TABLE WAL and storage policy actions start a line",
    input: "ALTER TABLE t SUSPEND WAL",
    expected: ["ALTER TABLE t", "SUSPEND WAL"].join("\n"),
  },
  {
    name: "ALTER TABLE DROP STORAGE POLICY starts a line",
    input: "ALTER TABLE t DROP STORAGE POLICY",
    expected: ["ALTER TABLE t", "DROP STORAGE POLICY"].join("\n"),
  },
  {
    name: "ALTER MATERIALIZED VIEW DROP EXPIRE starts a line",
    input: "ALTER MATERIALIZED VIEW price_1h DROP EXPIRE",
    expected: ["ALTER MATERIALIZED VIEW price_1h", "DROP EXPIRE"].join("\n"),
  },
  {
    name: "EXPIRE ROWS starts a line",
    input:
      "CREATE MATERIALIZED VIEW price_1h AS (SELECT ts, avg(px) FROM trades SAMPLE BY 1h) PARTITION BY DAY EXPIRE ROWS KEEP LATEST PARTITION BY sym",
    expected: [
      "CREATE MATERIALIZED VIEW price_1h AS (",
      "  SELECT ts, avg(px)",
      "  FROM trades",
      "  SAMPLE BY 1h",
      ") PARTITION BY DAY",
      "EXPIRE ROWS KEEP LATEST PARTITION BY sym",
    ].join("\n"),
  },
  {
    name: "UPDATE joins break like SELECT joins",
    input: "UPDATE t SET a = 1 FROM u JOIN v ON u.x = v.x WHERE t.id = u.id",
    expected: [
      "UPDATE t",
      "SET a = 1",
      "FROM u",
      "JOIN v ON u.x = v.x",
      "WHERE t.id = u.id",
    ].join("\n"),
  },
  {
    name: "short select list stays inline",
    input:
      "SELECT symbol, approx_percentile(price, 0.5, 2) AS median, count() FROM trades WHERE timestamp IN today() GROUP BY symbol ORDER BY median DESC",
    expected: [
      "SELECT symbol, approx_percentile(price, 0.5, 2) AS median, count()",
      "FROM trades",
      "WHERE timestamp IN today()",
      "GROUP BY symbol",
      "ORDER BY median DESC",
    ].join("\n"),
  },
  {
    name: "CREATE TABLE options",
    input:
      "CREATE TABLE trades (ts TIMESTAMP, price DOUBLE) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts) TTL 30 DAYS",
    expected: [
      "CREATE TABLE trades (",
      "  ts TIMESTAMP,",
      "  price DOUBLE",
      ") TIMESTAMP(ts) PARTITION BY DAY WAL",
      "DEDUP UPSERT KEYS(ts)",
      "TTL 30 DAYS",
    ].join("\n"),
  },
  {
    name: "short CREATE TABLE stays on one line with its options",
    input:
      "CREATE TABLE t (ts TIMESTAMP, price DOUBLE) TIMESTAMP(ts) PARTITION BY DAY",
    expected:
      "CREATE TABLE t (ts TIMESTAMP, price DOUBLE) TIMESTAMP(ts) PARTITION BY DAY",
  },
  {
    name: "CREATE TABLE column comments and options after the closing parenthesis",
    input:
      "CREATE TABLE trades_new (\n    event_time TIMESTAMP,  -- new designated timestamp\n    ingest_time TIMESTAMP,\n    symbol SYMBOL,\n    price DOUBLE\n) TIMESTAMP(event_time) PARTITION BY DAY",
    expected: [
      "CREATE TABLE trades_new (",
      "  event_time TIMESTAMP, -- new designated timestamp",
      "  ingest_time TIMESTAMP,",
      "  symbol SYMBOL,",
      "  price DOUBLE",
      ") TIMESTAMP(event_time) PARTITION BY DAY",
    ].join("\n"),
  },
  {
    name: "STORAGE POLICY starts a line",
    input:
      "CREATE MATERIALIZED VIEW test WITH BASE trades AS (SELECT ts, k, avg(v) FROM trades SAMPLE BY 30s), INDEX (k CAPACITY 1024) PARTITION BY DAY STORAGE POLICY(TO PARQUET 10d, TO REMOTE 1M, DROP LOCAL 3M) IN VOLUME vol1",
    expected: [
      "CREATE MATERIALIZED VIEW test",
      "WITH",
      "  BASE trades AS (",
      "    SELECT ts, k, avg(v)",
      "    FROM trades",
      "    SAMPLE BY 30s",
      "  ),",
      "  INDEX (k CAPACITY 1024) PARTITION BY DAY",
      "STORAGE POLICY(TO PARQUET 10d, TO REMOTE 1M, DROP LOCAL 3M)",
      "IN VOLUME vol1",
    ].join("\n"),
  },
  {
    name: "CREATE TABLE AS keeps options after the query",
    input:
      "CREATE TABLE t AS (SELECT * FROM trades) TIMESTAMP(ts) PARTITION BY DAY WAL",
    expected: [
      "CREATE TABLE t AS (",
      "  SELECT *",
      "  FROM trades",
      ") TIMESTAMP(ts) PARTITION BY DAY WAL",
    ].join("\n"),
  },
  {
    name: "long CREATE TABLE column list expands",
    input: `CREATE TABLE trades (${columns(8, "column_number_")
      .map((c) => `${c} DOUBLE`)
      .join(", ")}) TIMESTAMP(ts) PARTITION BY DAY WAL`,
    expected: [
      "CREATE TABLE trades (",
      ...columns(8, "column_number_").map(
        (c, i) => `  ${c} DOUBLE${i < 7 ? "," : ""}`,
      ),
      ") TIMESTAMP(ts) PARTITION BY DAY WAL",
    ].join("\n"),
  },
  {
    name: "INSERT ... SELECT",
    input:
      "INSERT INTO trades_archive SELECT * FROM trades WHERE timestamp < dateadd('d', -30, now())",
    expected: [
      "INSERT INTO trades_archive",
      "  SELECT *",
      "  FROM trades",
      "  WHERE timestamp < dateadd('d', -30, now())",
    ].join("\n"),
  },
  {
    name: "INSERT ... VALUES rows stay inline when short",
    input: "INSERT INTO t (a, b) VALUES (1, 2), (3, 4)",
    expected: ["INSERT INTO t (a, b)", "VALUES (1, 2), (3, 4)"].join("\n"),
  },
  {
    name: "long VALUES row expands",
    input: `INSERT INTO t VALUES (${columns(10, "'value_number_")
      .map((c) => `${c}'`)
      .join(", ")})`,
    expected: [
      "INSERT INTO t",
      "VALUES (",
      ...columns(10, "'value_number_").map(
        (c, i) => `  ${c}'${i < 9 ? "," : ""}`,
      ),
      ")",
    ].join("\n"),
  },
  {
    name: "PARTITION LIST keeps LIST in the clause head when the list breaks",
    input:
      "ALTER TABLE tab ATTACH PARTITION LIST '2022', '2023', '2024', '2025', '2026', '2027'",
    options: { maxWidth: 50 },
    expected: [
      "ALTER TABLE tab",
      "ATTACH PARTITION LIST",
      "  '2022',",
      "  '2023',",
      "  '2024',",
      "  '2025',",
      "  '2026',",
      "  '2027'",
    ].join("\n"),
  },
  {
    name: "DROP PARTITION WHERE stays inline",
    input: "ALTER TABLE tab DROP PARTITION WHERE timestamp < '2024-01-01'",
    expected: [
      "ALTER TABLE tab",
      "DROP PARTITION WHERE timestamp < '2024-01-01'",
    ].join("\n"),
  },
  {
    name: "UPDATE",
    input: "UPDATE t SET a = 1, b = 2 WHERE id = 3",
    expected: ["UPDATE t", "SET a = 1, b = 2", "WHERE id = 3"].join("\n"),
  },
  {
    name: "long select list expands one item per line",
    input: `SELECT ${columns(12).join(", ")} FROM trades`,
    expected: [
      "SELECT",
      ...columns(12).map((c, i) => `  ${c}${i < 11 ? "," : ""}`),
      "FROM trades",
    ].join("\n"),
  },
  {
    name: "short predicates stay inline",
    input: "SELECT a FROM t WHERE x = 1 AND y = 2",
    expected: ["SELECT a", "FROM t", "WHERE x = 1 AND y = 2"].join("\n"),
  },
  {
    name: "long predicates break before AND, BETWEEN keeps its AND",
    input:
      "SELECT a FROM t WHERE ts BETWEEN '2024-01-01' AND '2024-02-01' AND x = 1 OR y = 2",
    options: { maxWidth: 30 },
    expected: [
      "SELECT a",
      "FROM t",
      "WHERE",
      "  ts BETWEEN '2024-01-01' AND '2024-02-01'",
      "  AND x = 1",
      "  OR y = 2",
    ].join("\n"),
  },
  {
    name: "join ON predicates",
    input:
      "SELECT * FROM a INNER JOIN b ON a.id = b.id AND a.ts = b.ts WHERE a.x = 1",
    expected: [
      "SELECT *",
      "FROM a",
      "INNER JOIN b ON a.id = b.id AND a.ts = b.ts",
      "WHERE a.x = 1",
    ].join("\n"),
  },
  {
    name: "long WINDOW JOIN breaks into sub-clauses",
    input:
      "SELECT t.sym, t.price, t.ts, sum(p.price) AS window_sum FROM trades t WINDOW JOIN prices p ON (t.sym = p.sym) RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING EXCLUDE PREVAILING ORDER BY t.ts",
    expected: [
      "SELECT t.sym, t.price, t.ts, sum(p.price) AS window_sum",
      "FROM trades t",
      "WINDOW JOIN prices p",
      "  ON (t.sym = p.sym)",
      "  RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING",
      "  EXCLUDE PREVAILING",
      "ORDER BY t.ts",
    ].join("\n"),
  },
  {
    name: "join predicates keep AND inline inside the ON sub-clause",
    input:
      "SELECT t.sym FROM trades t WINDOW JOIN prices p ON (t.sym = p.sym) AND p.price < 300 RANGE BETWEEN 2 minutes PRECEDING AND 2 minutes FOLLOWING EXCLUDE PREVAILING",
    expected: [
      "SELECT t.sym",
      "FROM trades t",
      "WINDOW JOIN prices p",
      "  ON (t.sym = p.sym) AND p.price < 300",
      "  RANGE BETWEEN 2 minutes PRECEDING AND 2 minutes FOLLOWING",
      "  EXCLUDE PREVAILING",
    ].join("\n"),
  },
  {
    name: "short join keeps its sub-clauses inline",
    input: "SELECT * FROM trades ASOF JOIN quotes ON (symbol) TOLERANCE 5s",
    expected: [
      "SELECT *",
      "FROM trades",
      "ASOF JOIN quotes ON (symbol) TOLERANCE 5s",
    ].join("\n"),
  },
  {
    name: "ASOF JOIN",
    input:
      "SELECT * FROM trades ASOF JOIN quotes ON (symbol) WHERE ts > now() - 2d",
    expected: [
      "SELECT *",
      "FROM trades",
      "ASOF JOIN quotes ON (symbol)",
      "WHERE ts > now() - 2d",
    ].join("\n"),
  },
  {
    name: "SAMPLE BY keeps bounds, FILL, ALIGN TO, and WITH OFFSET",
    input:
      "SELECT ts, avg(price) FROM trades SAMPLE BY 1h FROM '2024-01-01' TO '2024-02-01' FILL(PREV) ALIGN TO CALENDAR WITH OFFSET '00:30'",
    expected: [
      "SELECT ts, avg(price)",
      "FROM trades",
      "SAMPLE BY 1h FROM '2024-01-01' TO '2024-02-01' FILL(PREV) ALIGN TO CALENDAR WITH OFFSET '00:30'",
    ].join("\n"),
  },
  {
    name: "subquery block",
    input: "SELECT * FROM (SELECT a FROM t) x",
    expected: ["SELECT *", "FROM (", "  SELECT a", "  FROM t", ") x"].join(
      "\n",
    ),
  },
  {
    name: "CTE",
    input: "WITH c AS (SELECT a FROM t) SELECT * FROM c",
    expected: [
      "WITH c AS (",
      "  SELECT a",
      "  FROM t",
      ")",
      "SELECT *",
      "FROM c",
    ].join("\n"),
  },
  {
    name: "IN subquery block",
    input: "SELECT a FROM t WHERE x IN (SELECT y FROM u)",
    expected: [
      "SELECT a",
      "FROM t",
      "WHERE x IN (",
      "  SELECT y",
      "  FROM u",
      ")",
    ].join("\n"),
  },
  {
    name: "short CASE stays inline",
    input: "SELECT CASE WHEN a THEN 1 ELSE 0 END AS f, b FROM t",
    expected: ["SELECT CASE WHEN a THEN 1 ELSE 0 END AS f, b", "FROM t"].join(
      "\n",
    ),
  },
  {
    name: "long CASE breaks per branch",
    input: "SELECT CASE WHEN a THEN 1 ELSE 0 END AS f, b FROM t",
    options: { maxWidth: 30 },
    expected: [
      "SELECT",
      "  CASE",
      "    WHEN a THEN 1",
      "    ELSE 0",
      "  END AS f,",
      "  b",
      "FROM t",
    ].join("\n"),
  },
  {
    name: "window PARTITION BY and ORDER BY stay inside the parentheses",
    input:
      "SELECT ts, avg(price) OVER (PARTITION BY symbol ORDER BY ts) FROM trades",
    expected: [
      "SELECT ts, avg(price) OVER (PARTITION BY symbol ORDER BY ts)",
      "FROM trades",
    ].join("\n"),
  },
  {
    name: "long window breaks into sub-clauses inside OVER",
    input:
      "SELECT timestamp, symbol, price, avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 300 PRECEDING) AS moving_avg FROM trades",
    expected: [
      "SELECT",
      "  timestamp,",
      "  symbol,",
      "  price,",
      "  avg(price) OVER (",
      "    PARTITION BY symbol",
      "    ORDER BY timestamp",
      "    ROWS 300 PRECEDING",
      "  ) AS moving_avg",
      "FROM trades",
    ].join("\n"),
  },
  {
    name: "WINDOW clause with a short named window",
    input:
      "SELECT timestamp, symbol, sum(amount) OVER w AS cumulative_volume FROM trades WINDOW w AS (PARTITION BY symbol ORDER BY timestamp ANCHOR DAILY '00:00')",
    expected: [
      "SELECT timestamp, symbol, sum(amount) OVER w AS cumulative_volume",
      "FROM trades",
      "WINDOW w AS (PARTITION BY symbol ORDER BY timestamp ANCHOR DAILY '00:00')",
    ].join("\n"),
  },
  {
    name: "WINDOW clause with long named windows breaks each definition",
    input:
      "SELECT sum(amount) OVER w1, avg(price) OVER w2 FROM trades WINDOW w1 AS (PARTITION BY symbol ORDER BY timestamp ANCHOR DAILY '00:00' 'Europe/London'), w2 AS (PARTITION BY symbol ORDER BY timestamp ROWS BETWEEN 100 PRECEDING AND CURRENT ROW)",
    expected: [
      "SELECT sum(amount) OVER w1, avg(price) OVER w2",
      "FROM trades",
      "WINDOW",
      "  w1 AS (",
      "    PARTITION BY symbol",
      "    ORDER BY timestamp",
      "    ANCHOR DAILY '00:00' 'Europe/London'",
      "  ),",
      "  w2 AS (",
      "    PARTITION BY symbol",
      "    ORDER BY timestamp",
      "    ROWS BETWEEN 100 PRECEDING AND CURRENT ROW",
      "  )",
    ].join("\n"),
  },
  {
    name: "short PIVOT stays inline",
    input:
      "SELECT * FROM trades PIVOT (avg(price) FOR symbol IN ('BTC-USDT', 'ETH-USDT'))",
    expected: [
      "SELECT *",
      "FROM trades",
      "PIVOT (avg(price) FOR symbol IN ('BTC-USDT', 'ETH-USDT'))",
    ].join("\n"),
  },
  {
    name: "long PIVOT breaks aggregates, FOR, and GROUP BY",
    input:
      "SELECT * FROM markouts PIVOT (count() AS fills, avg(quantity) AS avg_size, sum(quantity) AS volume, avg(((best_bid + best_ask) / 2 - price) / price * 10000) AS markout_bps FOR offset IN (0 AS at_fill, 5000000000 AS t_5s, 60000000000 AS t_1m) GROUP BY symbol, ecn) ORDER BY t_5s_markout_bps",
    expected: [
      "SELECT *",
      "FROM markouts",
      "PIVOT (",
      "  count() AS fills,",
      "  avg(quantity) AS avg_size,",
      "  sum(quantity) AS volume,",
      "  avg(((best_bid + best_ask) / 2 - price) / price * 10000) AS markout_bps",
      "  FOR offset IN (0 AS at_fill, 5000000000 AS t_5s, 60000000000 AS t_1m)",
      "  GROUP BY symbol, ecn",
      ")",
      "ORDER BY t_5s_markout_bps",
    ].join("\n"),
  },
  {
    name: "window PARTITION BY list stays on its sub-clause line",
    input:
      "SELECT symbol, avg(price) OVER (PARTITION BY symbol, venue ORDER BY timestamp ROWS BETWEEN 100 PRECEDING AND CURRENT ROW) AS moving FROM trades",
    expected: [
      "SELECT",
      "  symbol,",
      "  avg(price) OVER (",
      "    PARTITION BY symbol, venue",
      "    ORDER BY timestamp",
      "    ROWS BETWEEN 100 PRECEDING AND CURRENT ROW",
      "  ) AS moving",
      "FROM trades",
    ].join("\n"),
  },
  {
    name: "UNION ALL",
    input: "SELECT a FROM t UNION ALL SELECT b FROM u",
    expected: ["SELECT a", "FROM t", "UNION ALL", "SELECT b", "FROM u"].join(
      "\n",
    ),
  },
  {
    name: "EXPLAIN stays inline with the first clause",
    input: "EXPLAIN SELECT a FROM t WHERE x = 1",
    expected: ["EXPLAIN SELECT a", "FROM t", "WHERE x = 1"].join("\n"),
  },
  {
    name: "EXPLAIN alone",
    input: "EXPLAIN",
    expected: "EXPLAIN",
  },
  {
    name: "implicit SELECT",
    input: "trades WHERE symbol = 'BTC-USD'",
    expected: ["trades", "WHERE symbol = 'BTC-USD'"].join("\n"),
  },
  {
    name: "DECLARE with one variable stays inline",
    input: "DECLARE OVERRIDABLE @x := 1 SELECT @x FROM t",
    expected: ["DECLARE OVERRIDABLE @x := 1", "SELECT @x", "FROM t"].join("\n"),
  },
  {
    name: "DECLARE with several variables breaks one per line",
    input: "DECLARE @x := 5, OVERRIDABLE @y := 6 SELECT @x + @y FROM t",
    expected: [
      "DECLARE",
      "  @x := 5,",
      "  OVERRIDABLE @y := 6",
      "SELECT @x + @y",
      "FROM t",
    ].join("\n"),
  },
  {
    name: "materialized view",
    input:
      "CREATE MATERIALIZED VIEW mv WITH BASE trades REFRESH INCREMENTAL AS (SELECT ts, avg(price) FROM trades SAMPLE BY 1h) PARTITION BY DAY",
    expected: [
      "CREATE MATERIALIZED VIEW mv",
      "WITH BASE trades",
      "REFRESH INCREMENTAL AS (",
      "  SELECT ts, avg(price)",
      "  FROM trades",
      "  SAMPLE BY 1h",
      ") PARTITION BY DAY",
    ].join("\n"),
  },
  {
    name: "AS followed by a query keyword ends the line and formats the query",
    input:
      "CREATE MATERIALIZED VIEW trades_daily REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS SELECT timestamp, symbol, avg(price) AS avg_price FROM trades SAMPLE BY 1d",
    expected: [
      "CREATE MATERIALIZED VIEW trades_daily",
      "REFRESH PERIOD (LENGTH 1d TIME ZONE 'Europe/London' DELAY 2h) AS",
      "  SELECT timestamp, symbol, avg(price) AS avg_price",
      "  FROM trades",
      "  SAMPLE BY 1d",
    ].join("\n"),
  },
  {
    name: "CREATE TABLE AS SELECT without parentheses",
    input: "CREATE TABLE t AS SELECT * FROM trades WHERE x = 1",
    expected: [
      "CREATE TABLE t AS",
      "  SELECT *",
      "  FROM trades",
      "  WHERE x = 1",
    ].join("\n"),
  },
  {
    name: "INSERT with a CTE indents the whole query",
    input: "INSERT INTO t WITH c AS (SELECT 1 AS x) SELECT x FROM c",
    expected: [
      "INSERT INTO t",
      "  WITH c AS (",
      "    SELECT 1 AS x",
      "  )",
      "  SELECT x",
      "  FROM c",
    ].join("\n"),
  },
  {
    name: "implicit select in FROM opens a block",
    input:
      "SELECT symbol, side FROM (trades_latest_1d LATEST ON timestamp PARTITION BY symbol, side) ORDER BY timestamp DESC",
    expected: [
      "SELECT symbol, side",
      "FROM (",
      "  trades_latest_1d",
      "  LATEST ON timestamp PARTITION BY symbol, side",
      ")",
      "ORDER BY timestamp DESC",
    ].join("\n"),
  },
  {
    name: "implicit select in a CTE opens a block",
    input: "WITH c AS (trades WHERE x = 1) SELECT * FROM c",
    expected: [
      "WITH c AS (",
      "  trades",
      "  WHERE x = 1",
      ")",
      "SELECT *",
      "FROM c",
    ].join("\n"),
  },
  {
    name: "a plain parenthesized table after JOIN stays inline",
    input: "SELECT * FROM orders ASOF JOIN (md) ON (symbol)",
    expected: ["SELECT *", "FROM orders", "ASOF JOIN (md) ON (symbol)"].join(
      "\n",
    ),
  },
  {
    name: "FROM inside function arguments is not a clause",
    input: "SELECT extract(hour FROM ts), substring(s FROM 1) FROM t",
    expected: [
      "SELECT extract(hour FROM ts), substring(s FROM 1)",
      "FROM t",
    ].join("\n"),
  },
  {
    name: "keyword-shaped identifiers are not clauses",
    input: "SELECT status, type FROM t",
    expected: ["SELECT status, type", "FROM t"].join("\n"),
  },
  {
    name: "operator spacing",
    input:
      "SELECT a->b, a- >b, count( * ), a::long, arr[1:3], x = -2, 1 - 2, -1 FROM t",
    expected: [
      "SELECT a -> b, a - > b, count(*), a::long, arr[1:3], x = -2, 1 - 2, -1",
      "FROM t",
    ].join("\n"),
  },
  {
    name: "unknown characters keep their gaps",
    input: "SELECT a $$$ b, a$$$b FROM t",
    expected: ["SELECT a $$$ b, a$$$b", "FROM t"].join("\n"),
  },
  {
    name: "unknown character keeps a newline gap",
    input: "SELECT a\n$$$ b FROM t",
    expected: ["SELECT a", "$$$ b", "FROM t"].join("\n"),
  },
  {
    name: "function parentheses keep source spacing",
    input: "SELECT count (*), now() FROM t WHERE x IN(1, 2)",
    expected: ["SELECT count (*), now()", "FROM t", "WHERE x IN(1, 2)"].join(
      "\n",
    ),
  },
  {
    name: "unterminated string preserves the rest",
    input: "SELECT a FROM t WHERE x = 'oops; SELECT b;",
    expected: ["SELECT a", "FROM t", "WHERE x = 'oops; SELECT b;"].join("\n"),
  },
  {
    name: "unterminated block comment preserves the rest",
    input: "SELECT a FROM t /* open",
    expected: ["SELECT a", "FROM t /* open"].join("\n"),
  },
  {
    name: "unclosed parenthesis preserves the rest",
    input: "SELECT (a; SELECT b;",
    expected: "SELECT (a; SELECT b;",
  },
  {
    name: "mismatched delimiters preserve from the outermost opener",
    input: "SELECT f([)] FROM t",
    expected: "SELECT f([)] FROM t",
  },
  {
    name: "stray closer is an ordinary token",
    input: "SELECT a) FROM t",
    expected: ["SELECT a)", "FROM t"].join("\n"),
  },
  {
    name: "line comment after a comma stays on the item line",
    input: "SELECT a, -- first\n b FROM t",
    expected: ["SELECT", "  a, -- first", "  b", "FROM t"].join("\n"),
  },
  {
    name: "trailing line comment",
    input: "SELECT a FROM t -- trailing\n",
    expected: ["SELECT a", "FROM t -- trailing"].join("\n"),
  },
  {
    name: "inline block comment",
    input: "SELECT a /* c */, b FROM t",
    expected: ["SELECT a /* c */, b", "FROM t"].join("\n"),
  },
  {
    name: "block comment on its own line",
    input: "/* header */\nSELECT a FROM t",
    expected: ["/* header */", "SELECT a", "FROM t"].join("\n"),
  },
  {
    name: "block comment followed by a newline ends its line",
    input: "SELECT /*+ hint */\n  a, b FROM t",
    expected: ["SELECT", "  /*+ hint */", "  a,", "  b", "FROM t"].join("\n"),
  },
  {
    name: "comment inside a phrase leaves the phrase inline",
    input: "SELECT * FROM t LATEST /* x */ ON ts",
    expected: ["SELECT *", "FROM t LATEST /* x */ ON ts"].join("\n"),
  },
  {
    name: "long IN list expands",
    input: `SELECT * FROM t WHERE symbol IN (${columns(12, "'SYM")
      .map((c) => `${c}'`)
      .join(", ")})`,
    expected: [
      "SELECT *",
      "FROM t",
      "WHERE symbol IN (",
      ...columns(12, "'SYM").map((c, i) => `  ${c}'${i < 11 ? "," : ""}`),
      ")",
    ].join("\n"),
  },
  {
    name: "long function call stays inline",
    input: `SELECT f(${columns(12, "argument_").join(", ")}) FROM t`,
    expected: [
      `SELECT f(${columns(12, "argument_").join(", ")})`,
      "FROM t",
    ].join("\n"),
  },
  {
    name: "multiple statements",
    input: "SELECT a FROM t; SELECT b FROM u",
    expected: ["SELECT a", "FROM t;", "", "SELECT b", "FROM u"].join("\n"),
  },
  {
    name: "trailing comma before a clause starter survives",
    input: "CREATE TABLE t (a INT) WITH maxUncommittedRows=1,\n IN VOLUME v",
    expected: [
      "CREATE TABLE t (a INT)",
      "WITH maxUncommittedRows = 1,",
      "IN VOLUME v",
    ].join("\n"),
  },
  {
    name: "other statements normalize spacing without clause breaks",
    input:
      "CREATE USER \nadministrator \nWITH PASSWORD \nadminpwd;\nGRANT \nALL\n TO administrator \nWITH GRANT OPTION;",
    expected: [
      "CREATE USER administrator WITH PASSWORD adminpwd;",
      "",
      "GRANT ALL TO administrator WITH GRANT OPTION;",
    ].join("\n"),
  },
  {
    name: "other statements keep comments and unknown input",
    input: "DROP TABLE t -- gone\n$$$ x",
    expected: ["DROP TABLE t -- gone", "$$$ x"].join("\n"),
  },
  {
    name: "lower case is preserved and tabs indent",
    input: `select ${columns(12).join(",")} from t where x=1 limit 10`,
    options: { indent: "\t" },
    expected: [
      "select",
      ...columns(12).map((c, i) => `\t${c}${i < 11 ? "," : ""}`),
      "from t",
      "where x = 1",
      "limit 10",
    ].join("\n"),
  },
]
