import { parseToAst, parseStatements, toSql, parse } from "../src/index";

describe("QuestDB Parser", () => {
  describe("parseToAst", () => {
    it("should parse a simple SELECT statement", () => {
      const result = parseToAst("SELECT * FROM trades");

      expect(result.errors).toHaveLength(0);
      expect(result.ast).toHaveLength(1);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse SELECT with WHERE clause", () => {
      const result = parseToAst(
        "SELECT symbol, price FROM trades WHERE price > 100"
      );

      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      expect(select.type).toBe("select");
      if (select.type === "select") {
        expect(select.where).toBeDefined();
        expect(select.where?.type).toBe("binary");
      }
    });

    it("should parse QuestDB SAMPLE BY clause", () => {
      const result = parseToAst(
        "SELECT avg(price) FROM trades SAMPLE BY 1h"
      );

      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy).toBeDefined();
        expect(select.sampleBy?.duration).toBe("1h");
      }
    });

    it("should parse QuestDB LATEST ON clause", () => {
      const result = parseToAst(
        "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol"
      );

      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.latestOn).toBeDefined();
        expect(select.latestOn?.timestamp?.parts).toEqual(["timestamp"]);
        expect(select.latestOn?.partitionBy).toHaveLength(1);
      }
    });

    it("should parse ASOF JOIN", () => {
      const result = parseToAst(
        "SELECT * FROM trades t ASOF JOIN quotes q ON t.symbol = q.symbol"
      );

      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins).toHaveLength(1);
        expect(select.from?.[0].joins?.[0].joinType).toBe("asof");
      }
    });

    it("should parse ASOF JOIN with TOLERANCE", () => {
      const result = parseToAst(
        "SELECT * FROM trades t ASOF JOIN quotes q ON t.ts = q.ts TOLERANCE 1h"
      );

      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins).toHaveLength(1);
        const join = select.from?.[0].joins?.[0];
        expect(join?.joinType).toBe("asof");
        expect(join?.tolerance).toBe("1h");
      }
    });

    it("should parse LT JOIN with TOLERANCE", () => {
      const result = parseToAst(
        "SELECT * FROM trades t LT JOIN quotes q ON t.ts = q.ts TOLERANCE 30s"
      );

      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins).toHaveLength(1);
        const join = select.from?.[0].joins?.[0];
        expect(join?.joinType).toBe("lt");
        expect(join?.tolerance).toBe("30s");
      }
    });

    // --- JOIN types (Chunk 3) ---

    it("should parse INNER JOIN", () => {
      const result = parseToAst(
        "SELECT * FROM trades t JOIN orders o ON t.id = o.trade_id"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const join = select.from?.[0].joins?.[0];
        expect(join?.joinType).toBeUndefined(); // plain JOIN = implicit inner
      }
    });

    it("should parse LEFT OUTER JOIN", () => {
      const result = parseToAst(
        "SELECT * FROM trades t LEFT OUTER JOIN orders o ON t.id = o.trade_id"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const join = select.from?.[0].joins?.[0];
        expect(join?.joinType).toBe("left");
        expect(join?.outer).toBe(true);
      }
    });

    it("should parse LEFT JOIN (without OUTER)", () => {
      const result = parseToAst(
        "SELECT * FROM trades t LEFT JOIN orders o ON t.id = o.trade_id"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins?.[0].joinType).toBe("left");
      }
    });

    it("should parse RIGHT JOIN", () => {
      const result = parseToAst(
        "SELECT * FROM trades t RIGHT JOIN orders o ON t.id = o.trade_id"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins?.[0].joinType).toBe("right");
      }
    });

    it("should parse FULL JOIN", () => {
      const result = parseToAst(
        "SELECT * FROM trades t FULL JOIN orders o ON t.id = o.trade_id"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins?.[0].joinType).toBe("full");
      }
    });

    it("should parse CROSS JOIN", () => {
      const result = parseToAst(
        "SELECT * FROM trades t CROSS JOIN orders o"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins?.[0].joinType).toBe("cross");
      }
    });

    // From QuestDB docs: SPLICE JOIN
    it("should parse SPLICE JOIN", () => {
      const result = parseToAst(
        "SELECT buy.timestamp, sell.timestamp FROM buy SPLICE JOIN sell"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins?.[0].joinType).toBe("splice");
      }
    });

    // From QuestDB docs: ASOF JOIN without ON clause
    it("should parse ASOF JOIN without ON clause", () => {
      const result = parseToAst(
        "SELECT * FROM market_data m ASOF JOIN core_price p"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const join = select.from?.[0].joins?.[0];
        expect(join?.joinType).toBe("asof");
        expect(join?.on).toBeUndefined();
      }
    });

    // From QuestDB docs: ASOF JOIN with TOLERANCE 50T (50 milliseconds)
    it("should parse ASOF JOIN with TOLERANCE in milliseconds", () => {
      const result = parseToAst(
        "SELECT * FROM market_data ASOF JOIN core_price ON (symbol) TOLERANCE 50T"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const join = select.from?.[0].joins?.[0];
        expect(join?.joinType).toBe("asof");
        expect(join?.tolerance).toBe("50T");
      }
    });

    // Multiple JOINs
    it("should parse multiple JOINs in one query", () => {
      const result = parseToAst(
        "SELECT * FROM trades t JOIN orders o ON t.id = o.trade_id LEFT JOIN users u ON o.user_id = u.id"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.from?.[0].joins).toHaveLength(2);
        expect(select.from?.[0].joins?.[1].joinType).toBe("left");
      }
    });

    it("should parse INSERT statement", () => {
      const result = parseToAst(
        "INSERT INTO trades (symbol, price) VALUES ('BTC', 100)"
      );

      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("insert");
      if (result.ast[0].type === "insert") {
        expect(result.ast[0].table.parts).toEqual(["trades"]);
        expect(result.ast[0].columns).toEqual(["symbol", "price"]);
        expect(result.ast[0].values).toHaveLength(1);
      }
    });

    it("should parse UPDATE statement", () => {
      const result = parseToAst(
        "UPDATE trades SET price = 200 WHERE symbol = 'BTC'"
      );

      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("update");
    });

    it("should parse multiple statements", () => {
      const result = parseToAst(`
        SELECT * FROM trades;
        SELECT * FROM quotes
      `);

      expect(result.errors).toHaveLength(0);
      expect(result.ast).toHaveLength(2);
    });
  });

  describe("toSql", () => {
    it("should serialize simple SELECT back to SQL", () => {
      const result = parseToAst("SELECT * FROM trades");
      const sql = toSql(result.ast[0]);

      expect(sql).toBe("SELECT * FROM trades");
    });

    it("should serialize SELECT with columns and alias", () => {
      const result = parseToAst("SELECT symbol, price AS p FROM trades");
      const sql = toSql(result.ast[0]);

      expect(sql).toBe("SELECT symbol, price AS p FROM trades");
    });

    it("should serialize SELECT with WHERE", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE price > 100"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toBe("SELECT * FROM trades WHERE price > 100");
    });

    it("should serialize SAMPLE BY", () => {
      const result = parseToAst(
        "SELECT avg(price) FROM trades SAMPLE BY 1h"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("SAMPLE BY 1h");
    });

    it("should serialize LATEST ON", () => {
      const result = parseToAst(
        "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("LATEST ON timestamp PARTITION BY symbol");
    });

    it("should serialize INSERT", () => {
      const result = parseToAst(
        "INSERT INTO trades (symbol, price) VALUES ('BTC', 100)"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("INSERT INTO trades");
      expect(sql).toContain("VALUES");
    });

    it("should serialize UPDATE", () => {
      const result = parseToAst(
        "UPDATE trades SET price = 200 WHERE symbol = 'BTC'"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("UPDATE trades SET");
      expect(sql).toContain("WHERE");
    });

    it("should handle string escaping", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE name = 'O''Brien'"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("O''Brien");
    });

    it("should serialize complex expressions", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE (price > 100 AND symbol = 'BTC') OR volume > 1000"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("AND");
      expect(sql).toContain("OR");
    });

    it("should serialize function calls", () => {
      const result = parseToAst(
        "SELECT count(*), avg(price), sum(volume) FROM trades"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("count(*)");
      expect(sql).toContain("avg(price)");
      expect(sql).toContain("sum(volume)");
    });

    it("should serialize GROUP BY and ORDER BY", () => {
      const result = parseToAst(
        "SELECT symbol, avg(price) FROM trades GROUP BY symbol ORDER BY symbol DESC"
      );
      const sql = toSql(result.ast[0]);

      expect(sql).toContain("GROUP BY symbol");
      expect(sql).toContain("ORDER BY symbol DESC");
    });
  });

  describe("round-trip parsing", () => {
    const queries = [
      "SELECT * FROM trades",
      "SELECT symbol, price FROM trades WHERE price > 100",
      "SELECT avg(price) FROM trades SAMPLE BY 1h",
      "SELECT * FROM trades LATEST ON timestamp PARTITION BY symbol",
      "INSERT INTO trades VALUES (1, 'BTC', 100)",
      "UPDATE trades SET price = 200",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);

        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  describe("DDL statements", () => {
    describe("DROP TABLE", () => {
      it("should parse DROP TABLE", () => {
        const result = parseToAst("DROP TABLE trades");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("dropTable");
        if (result.ast[0].type === "dropTable") {
          expect(result.ast[0].table?.parts).toEqual(["trades"]);
        }
      });

      it("should parse DROP TABLE IF EXISTS", () => {
        const result = parseToAst("DROP TABLE IF EXISTS trades");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "dropTable") {
          expect(result.ast[0].ifExists).toBe(true);
          expect(result.ast[0].table?.parts).toEqual(["trades"]);
        }
      });

      it("should parse DROP ALL TABLES", () => {
        const result = parseToAst("DROP ALL TABLES");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "dropTable") {
          expect(result.ast[0].allTables).toBe(true);
        }
      });

      it("should serialize DROP TABLE back to SQL", () => {
        const result = parseToAst("DROP TABLE IF EXISTS trades");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("DROP TABLE IF EXISTS trades");
      });

      it("should serialize DROP ALL TABLES back to SQL", () => {
        const result = parseToAst("DROP ALL TABLES");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("DROP ALL TABLES");
      });
    });

    describe("TRUNCATE TABLE", () => {
      it("should parse TRUNCATE TABLE", () => {
        const result = parseToAst("TRUNCATE TABLE trades");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("truncateTable");
        if (result.ast[0].type === "truncateTable") {
          expect(result.ast[0].table.parts).toEqual(["trades"]);
        }
      });

      it("should parse TRUNCATE TABLE IF EXISTS", () => {
        const result = parseToAst("TRUNCATE TABLE IF EXISTS trades");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "truncateTable") {
          expect(result.ast[0].ifExists).toBe(true);
        }
      });

      it("should serialize TRUNCATE TABLE back to SQL", () => {
        const result = parseToAst("TRUNCATE TABLE IF EXISTS trades");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("TRUNCATE TABLE IF EXISTS trades");
      });
    });

    describe("RENAME TABLE", () => {
      it("should parse RENAME TABLE", () => {
        const result = parseToAst("RENAME TABLE old_trades TO new_trades");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("renameTable");
        if (result.ast[0].type === "renameTable") {
          expect(result.ast[0].from.parts).toEqual(["old_trades"]);
          expect(result.ast[0].to.parts).toEqual(["new_trades"]);
        }
      });

      it("should serialize RENAME TABLE back to SQL", () => {
        const result = parseToAst("RENAME TABLE old_trades TO new_trades");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("RENAME TABLE old_trades TO new_trades");
      });
    });

    describe("SHOW statements", () => {
      it("should parse SHOW TABLES", () => {
        const result = parseToAst("SHOW TABLES");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("show");
        if (result.ast[0].type === "show") {
          expect(result.ast[0].showType).toBe("tables");
        }
      });

      it("should parse SHOW COLUMNS FROM table", () => {
        const result = parseToAst("SHOW COLUMNS FROM trades");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "show") {
          expect(result.ast[0].showType).toBe("columns");
          expect(result.ast[0].table?.parts).toEqual(["trades"]);
        }
      });

      it("should parse SHOW PARTITIONS FROM table", () => {
        const result = parseToAst("SHOW PARTITIONS FROM trades");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "show") {
          expect(result.ast[0].showType).toBe("partitions");
          expect(result.ast[0].table?.parts).toEqual(["trades"]);
        }
      });

      it("should parse SHOW CREATE TABLE", () => {
        const result = parseToAst("SHOW CREATE TABLE trades");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "show") {
          expect(result.ast[0].showType).toBe("createTable");
          expect(result.ast[0].table?.parts).toEqual(["trades"]);
        }
      });

      it("should serialize SHOW statements back to SQL", () => {
        expect(toSql(parseToAst("SHOW TABLES").ast[0])).toBe("SHOW TABLES");
        expect(toSql(parseToAst("SHOW COLUMNS FROM trades").ast[0])).toBe("SHOW COLUMNS FROM trades");
        expect(toSql(parseToAst("SHOW PARTITIONS FROM trades").ast[0])).toBe("SHOW PARTITIONS FROM trades");
        expect(toSql(parseToAst("SHOW CREATE TABLE trades").ast[0])).toBe("SHOW CREATE TABLE trades");
      });
    });

    describe("EXPLAIN statement", () => {
      it("should parse EXPLAIN SELECT", () => {
        const result = parseToAst("EXPLAIN SELECT * FROM trades");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("explain");
        if (result.ast[0].type === "explain") {
          expect(result.ast[0].statement.type).toBe("select");
        }
      });

      it("should serialize EXPLAIN back to SQL", () => {
        const result = parseToAst("EXPLAIN SELECT * FROM trades");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("EXPLAIN SELECT * FROM trades");
      });
    });

    describe("CREATE TABLE", () => {
      it("should parse basic CREATE TABLE", () => {
        const result = parseToAst("CREATE TABLE trades (symbol STRING, price DOUBLE)");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("createTable");
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].table.parts).toEqual(["trades"]);
          expect(result.ast[0].columns).toHaveLength(2);
          expect(result.ast[0].columns?.[0].name).toBe("symbol");
          expect(result.ast[0].columns?.[0].dataType).toBe("STRING");
        }
      });

      it("should parse CREATE TABLE IF NOT EXISTS", () => {
        const result = parseToAst("CREATE TABLE IF NOT EXISTS trades (symbol STRING)");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].ifNotExists).toBe(true);
        }
      });

      it("should parse CREATE TABLE with TIMESTAMP", () => {
        const result = parseToAst("CREATE TABLE trades (ts TIMESTAMP, price DOUBLE) TIMESTAMP(ts)");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].timestamp).toBe("ts");
        }
      });

      it("should parse CREATE TABLE with PARTITION BY", () => {
        const result = parseToAst("CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].partitionBy).toBe("DAY");
        }
      });

      it("should parse CREATE TABLE with WAL", () => {
        const result = parseToAst("CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WAL");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].wal).toBe(true);
        }
      });

      it("should parse CREATE TABLE with BYPASS WAL", () => {
        const result = parseToAst("CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY BYPASS WAL");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].bypassWal).toBe(true);
        }
      });

      it("should parse CREATE TABLE with TTL", () => {
        const result = parseToAst("CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY TTL 30 DAYS");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].ttl?.value).toBe(30);
          expect(result.ast[0].ttl?.unit).toBe("DAYS");
        }
      });

      it("should parse CREATE TABLE AS SELECT", () => {
        const result = parseToAst("CREATE TABLE new_trades AS (SELECT * FROM trades)");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].asSelect).toBeDefined();
          expect(result.ast[0].asSelect?.type).toBe("select");
        }
      });

      it("should serialize CREATE TABLE back to SQL", () => {
        const result = parseToAst("CREATE TABLE trades (symbol STRING, price DOUBLE)");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("CREATE TABLE trades (symbol STRING, price DOUBLE)");
      });

      it("should serialize CREATE TABLE with all options back to SQL", () => {
        const result = parseToAst("CREATE TABLE trades (ts TIMESTAMP) TIMESTAMP(ts) PARTITION BY DAY WAL");
        const sql = toSql(result.ast[0]);
        expect(sql).toContain("CREATE TABLE trades");
        expect(sql).toContain("TIMESTAMP(ts)");
        expect(sql).toContain("PARTITION BY DAY");
        expect(sql).toContain("WAL");
      });

      // --- SYMBOL column attributes (Chunk 4) ---

      // From QuestDB docs: SYMBOL with CAPACITY
      it("should parse SYMBOL column with CAPACITY", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL CAPACITY 256, price DOUBLE, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].columns?.[0].dataType).toBe("SYMBOL");
          expect(result.ast[0].columns?.[0].symbolCapacity).toBe(256);
        }
      });

      // From QuestDB docs: SYMBOL with NOCACHE
      it("should parse SYMBOL column with NOCACHE", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL CAPACITY 256 NOCACHE, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].columns?.[0].symbolCapacity).toBe(256);
          expect(result.ast[0].columns?.[0].cache).toBe(false);
        }
      });

      it("should parse SYMBOL column with CACHE", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL CACHE, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].columns?.[0].cache).toBe(true);
        }
      });

      // From QuestDB docs: SYMBOL with inline INDEX
      it("should parse SYMBOL column with INDEX", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL INDEX, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].columns?.[0].indexed).toBe(true);
        }
      });

      it("should parse SYMBOL column with INDEX CAPACITY", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL INDEX CAPACITY 65536, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].columns?.[0].indexed).toBe(true);
          expect(result.ast[0].columns?.[0].indexCapacity).toBe(65536);
        }
      });

      // From docs: complete SYMBOL column definition
      it("should parse full SYMBOL column: CAPACITY + NOCACHE + INDEX + CAPACITY", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL CAPACITY 256 NOCACHE INDEX CAPACITY 65536, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          const col = result.ast[0].columns?.[0];
          expect(col?.dataType).toBe("SYMBOL");
          expect(col?.symbolCapacity).toBe(256);
          expect(col?.cache).toBe(false);
          expect(col?.indexed).toBe(true);
          expect(col?.indexCapacity).toBe(65536);
        }
      });

      // From docs: CREATE TABLE with DEDUP
      it("should parse CREATE TABLE with DEDUP UPSERT KEYS", () => {
        const result = parseToAst(
          "CREATE TABLE trades (ts TIMESTAMP, symbol SYMBOL, price DOUBLE) TIMESTAMP(ts) PARTITION BY DAY WAL DEDUP UPSERT KEYS(ts, symbol)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].dedupKeys).toEqual(["ts", "symbol"]);
        }
      });

      // From docs: CREATE TABLE with IN VOLUME
      it("should parse CREATE TABLE with IN VOLUME", () => {
        const result = parseToAst(
          "CREATE TABLE trades (ts TIMESTAMP, price DOUBLE) TIMESTAMP(ts) PARTITION BY DAY IN VOLUME 'secondary'"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].volume).toBe("secondary");
        }
      });

      // CREATE TABLE LIKE
      it("should parse CREATE TABLE (LIKE other_table)", () => {
        const result = parseToAst("CREATE TABLE new_table (LIKE my_table)");
        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("createTable");
      });

      // Complete example from docs
      it("should parse complete CREATE TABLE with all features", () => {
        const result = parseToAst(
          "CREATE TABLE trades (ts TIMESTAMP, symbol SYMBOL CAPACITY 256 NOCACHE INDEX, side SYMBOL CAPACITY 10 CACHE, price DOUBLE, amount DOUBLE) TIMESTAMP(ts) PARTITION BY DAY TTL 90 DAYS WAL DEDUP UPSERT KEYS(ts, symbol)"
        );
        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "createTable") {
          expect(result.ast[0].columns).toHaveLength(5);
          expect(result.ast[0].partitionBy).toBe("DAY");
          expect(result.ast[0].ttl?.value).toBe(90);
          expect(result.ast[0].ttl?.unit).toBe("DAYS");
          expect(result.ast[0].wal).toBe(true);
          expect(result.ast[0].dedupKeys).toEqual(["ts", "symbol"]);
        }
      });

      // SYMBOL column serialization round-trip
      it("should serialize SYMBOL column attributes back to SQL", () => {
        const result = parseToAst(
          "CREATE TABLE trades (symbol SYMBOL CAPACITY 256 NOCACHE INDEX CAPACITY 65536, ts TIMESTAMP) TIMESTAMP(ts)"
        );
        const sql = toSql(result.ast[0]);
        expect(sql).toContain("SYMBOL CAPACITY 256 NOCACHE INDEX CAPACITY 65536");
      });
    });

    describe("ALTER TABLE", () => {
      it("should parse ALTER TABLE ADD COLUMN", () => {
        const result = parseToAst("ALTER TABLE trades ADD COLUMN volume LONG");

        expect(result.errors).toHaveLength(0);
        expect(result.ast[0].type).toBe("alterTable");
        if (result.ast[0].type === "alterTable") {
          expect(result.ast[0].table.parts).toEqual(["trades"]);
          expect(result.ast[0].action.actionType).toBe("addColumn");
        }
      });

      it("should parse ALTER TABLE ADD COLUMN IF NOT EXISTS", () => {
        const result = parseToAst("ALTER TABLE trades ADD COLUMN IF NOT EXISTS volume LONG");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable" && result.ast[0].action.actionType === "addColumn") {
          expect(result.ast[0].action.ifNotExists).toBe(true);
        }
      });

      it("should parse ALTER TABLE DROP COLUMN", () => {
        const result = parseToAst("ALTER TABLE trades DROP COLUMN volume");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable") {
          expect(result.ast[0].action.actionType).toBe("dropColumn");
          if (result.ast[0].action.actionType === "dropColumn") {
            expect(result.ast[0].action.columns).toEqual(["volume"]);
          }
        }
      });

      it("should parse ALTER TABLE RENAME COLUMN", () => {
        const result = parseToAst("ALTER TABLE trades RENAME COLUMN old_col TO new_col");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable" && result.ast[0].action.actionType === "renameColumn") {
          expect(result.ast[0].action.oldName).toBe("old_col");
          expect(result.ast[0].action.newName).toBe("new_col");
        }
      });

      it("should parse ALTER TABLE ALTER COLUMN TYPE", () => {
        const result = parseToAst("ALTER TABLE trades ALTER COLUMN price TYPE DOUBLE");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable" && result.ast[0].action.actionType === "alterColumn") {
          expect(result.ast[0].action.column).toBe("price");
          expect(result.ast[0].action.alterType).toBe("type");
          expect(result.ast[0].action.newType).toBe("DOUBLE");
        }
      });

      it("should parse ALTER TABLE ALTER COLUMN ADD INDEX", () => {
        const result = parseToAst("ALTER TABLE trades ALTER COLUMN symbol ADD INDEX");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable" && result.ast[0].action.actionType === "alterColumn") {
          expect(result.ast[0].action.alterType).toBe("addIndex");
        }
      });

      it("should parse ALTER TABLE DROP PARTITION", () => {
        const result = parseToAst("ALTER TABLE trades DROP PARTITION LIST '2023-01-01', '2023-01-02'");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable" && result.ast[0].action.actionType === "dropPartition") {
          expect(result.ast[0].action.partitions).toEqual(["2023-01-01", "2023-01-02"]);
        }
      });

      it("should parse ALTER TABLE SQUASH PARTITIONS", () => {
        const result = parseToAst("ALTER TABLE trades SQUASH PARTITIONS");

        expect(result.errors).toHaveLength(0);
        if (result.ast[0].type === "alterTable") {
          expect(result.ast[0].action.actionType).toBe("squashPartitions");
        }
      });

      it("should serialize ALTER TABLE back to SQL", () => {
        const result = parseToAst("ALTER TABLE trades ADD COLUMN volume LONG");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("ALTER TABLE trades ADD COLUMN volume LONG");
      });

      it("should serialize ALTER TABLE RENAME COLUMN back to SQL", () => {
        const result = parseToAst("ALTER TABLE trades RENAME COLUMN old_col TO new_col");
        const sql = toSql(result.ast[0]);
        expect(sql).toBe("ALTER TABLE trades RENAME COLUMN old_col TO new_col");
      });
    });
  });

  describe("DDL round-trip parsing", () => {
    const queries = [
      "DROP TABLE trades",
      "DROP TABLE IF EXISTS trades",
      "DROP ALL TABLES",
      "TRUNCATE TABLE trades",
      "TRUNCATE TABLE IF EXISTS trades",
      "RENAME TABLE old_trades TO new_trades",
      "SHOW TABLES",
      "SHOW COLUMNS FROM trades",
      "SHOW PARTITIONS FROM trades",
      "SHOW CREATE TABLE trades",
      "EXPLAIN SELECT * FROM trades",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);

        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  // ===========================================================================
  // Expression System (Chunk 1)
  // ===========================================================================

  describe("Expression operators", () => {
    // From QuestDB docs: /query/operators/text.md
    it("should parse || (string concatenation)", () => {
      const result = parseToAst("SELECT 'a' || 'b'");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("binary");
          if (col.expression.type === "binary") {
            expect(col.expression.operator).toBe("||");
          }
        }
      }
    });

    it("should parse chained || concatenation", () => {
      const result = parseToAst("SELECT 'a' || 'b' || 'c'");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          const expr = col.expression;
          // Should be left-associative: (('a' || 'b') || 'c')
          expect(expr.type).toBe("binary");
          if (expr.type === "binary") {
            expect(expr.operator).toBe("||");
            expect(expr.left.type).toBe("binary");
          }
        }
      }
    });

    // From QuestDB docs: /query/operators/misc.md
    it("should parse :: (inline type cast)", () => {
      const result = parseToAst("SELECT 5::float");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("typeCast");
          if (col.expression.type === "typeCast") {
            expect(col.expression.dataType).toBe("FLOAT");
          }
        }
      }
    });

    // From QuestDB docs: /query/sql/cast.md
    it("should parse :: shorthand cast with expressions", () => {
      const result = parseToAst("SELECT (3.5 + 2)::INT, 7234623::SHORT");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.columns).toHaveLength(2);
        const col0 = select.columns[0];
        const col1 = select.columns[1];
        if (col0.type === "selectItem") expect(col0.expression.type).toBe("typeCast");
        if (col1.type === "selectItem") expect(col1.expression.type).toBe("typeCast");
      }
    });

    // From QuestDB docs: /query/operators/text.md
    it("should parse ILIKE (case-insensitive pattern match)", () => {
      const result = parseToAst("SELECT * FROM trades WHERE symbol ILIKE '%btc%'");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select" && select.where?.type === "binary") {
        expect(select.where.operator).toBe("ILIKE");
      }
    });

    // From QuestDB docs: /query/operators/text.md
    it("should parse LIKE and ILIKE side by side", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE symbol LIKE '%BTC%' OR symbol ILIKE '%eth%'"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select" && select.where?.type === "binary") {
        expect(select.where.operator).toBe("OR");
      }
    });

    it("should parse NOT IN expression", () => {
      const result = parseToAst(
        "SELECT * FROM users WHERE NOT name IN ('Tim', 'Tom')"
      );
      expect(result.errors).toHaveLength(0);
    });

    // From QuestDB docs: /query/operators/numeric.md
    it("should parse arithmetic expressions: 5 + 2, 5 - 2, 5 / 2, 5 % 2", () => {
      for (const op of ["+", "-", "/", "%"]) {
        const result = parseToAst(`SELECT 5 ${op} 2`);
        expect(result.errors).toHaveLength(0);
        const select = result.ast[0];
        if (select.type === "select") {
          const col = select.columns[0];
          if (col.type === "selectItem") {
            expect(col.expression.type).toBe("binary");
            if (col.expression.type === "binary") {
              expect(col.expression.operator).toBe(op);
            }
          }
        }
      }
    });

    it("should parse unary minus", () => {
      const result = parseToAst("SELECT -5");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("unary");
          if (col.expression.type === "unary") {
            expect(col.expression.operator).toBe("-");
          }
        }
      }
    });

    it("should parse 5-3 as binary minus (not 5 and -3)", () => {
      const result = parseToAst("SELECT 5-3");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("binary");
          if (col.expression.type === "binary") {
            expect(col.expression.operator).toBe("-");
            expect(col.expression.left.type).toBe("literal");
            expect(col.expression.right.type).toBe("literal");
          }
        }
      }
    });

    // Operator precedence tests matching Java new registry
    it("should respect operator precedence: * binds tighter than +", () => {
      // 2 + 3 * 4 should parse as 2 + (3 * 4)
      const result = parseToAst("SELECT 2 + 3 * 4");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          const expr = col.expression;
          expect(expr.type).toBe("binary");
          if (expr.type === "binary") {
            expect(expr.operator).toBe("+");
            expect(expr.right.type).toBe("binary");
            if (expr.right.type === "binary") {
              expect(expr.right.operator).toBe("*");
            }
          }
        }
      }
    });

    it("should respect :: precedence (tighter than arithmetic)", () => {
      // col::int + 1 should parse as (col::int) + 1
      const result = parseToAst("SELECT col::int + 1 FROM trades");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        const col = select.columns[0];
        if (col.type === "selectItem") {
          const expr = col.expression;
          expect(expr.type).toBe("binary");
          if (expr.type === "binary") {
            expect(expr.operator).toBe("+");
            expect(expr.left.type).toBe("typeCast");
          }
        }
      }
    });

    it("should respect || precedence (between set operators and arithmetic)", () => {
      // a || b = 'ab' should parse as (a || b) = 'ab'
      const result = parseToAst("SELECT * FROM t WHERE a || b = 'ab'");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select" && select.where?.type === "binary") {
        expect(select.where.operator).toBe("=");
        expect(select.where.left.type).toBe("binary");
        if (select.where.left.type === "binary") {
          expect(select.where.left.operator).toBe("||");
        }
      }
    });

    it("should separate equality (=) and relational (<) precedence levels", () => {
      // a < b = true should parse as (a < b) = true
      const result = parseToAst("SELECT * FROM t WHERE a < b = true");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select" && select.where?.type === "binary") {
        expect(select.where.operator).toBe("=");
        expect(select.where.left.type).toBe("binary");
        if (select.where.left.type === "binary") {
          expect(select.where.left.operator).toBe("<");
        }
      }
    });

    // From QuestDB docs: /query/sql/where.md
    it("should parse BETWEEN with timestamps", () => {
      const result = parseToAst(
        "SELECT * FROM scores WHERE ts BETWEEN '2018-01-01T00:00:23.000000Z' AND '2018-01-01T00:00:23.500000Z'"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.where?.type).toBe("between");
      }
    });

    // From QuestDB docs: /query/operators/comparison.md
    it("should parse IN with value list", () => {
      const result = parseToAst("SELECT 5 IN (1, 2, 7, 5, 8)");
      expect(result.errors).toHaveLength(0);
    });

    // From QuestDB docs: /query/sql/cast.md
    it("should parse CAST with multiple types", () => {
      const result = parseToAst(
        "SELECT CAST(3 + 2 AS INT), CAST(1578506142000000 AS TIMESTAMP), CAST('10.2' AS DOUBLE)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.columns).toHaveLength(3);
        for (const col of select.columns) {
          if (col.type === "selectItem") {
            expect(col.expression.type).toBe("cast");
          }
        }
      }
    });

    // IS NULL / IS NOT NULL
    it("should parse IS NULL and IS NOT NULL", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE price IS NOT NULL"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.where?.type).toBe("isNull");
        if (select.where?.type === "isNull") {
          expect(select.where.not).toBe(true);
        }
      }
    });

    // AND/OR/NOT combinations
    it("should parse complex boolean expressions", () => {
      const result = parseToAst(
        "SELECT * FROM t WHERE a = 1 AND (b = 2 OR c = 3 AND NOT d)"
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Expression round-trip tests", () => {
    const queries = [
      "SELECT 'a' || 'b'",
      "SELECT 5::FLOAT",
      "SELECT (3.5 + 2)::INT",
      "SELECT * FROM trades WHERE symbol ILIKE '%btc%'",
      "SELECT * FROM trades WHERE symbol LIKE '%BTC%'",
      "SELECT * FROM scores WHERE ts BETWEEN '2018-01-01' AND '2018-01-02'",
      "SELECT * FROM trades WHERE id IN (1, 2, 3)",
      "SELECT CAST(5 AS DOUBLE)",
      "SELECT * FROM trades WHERE price IS NOT NULL",
      "SELECT -5",
      "SELECT 2 + 3 * 4",
      "SELECT * FROM t WHERE a = 1 AND (b = 2 OR c = 3)",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  // ===========================================================================
  // SAMPLE BY (Chunk 2)
  // ===========================================================================

  describe("SAMPLE BY clause", () => {
    // --- FILL clause ---

    it("should parse SAMPLE BY with FILL(PREV)", () => {
      const result = parseToAst(
        "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(PREV)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.duration).toBe("1h");
        expect(select.sampleBy?.fill).toEqual(["PREV"]);
      }
    });

    it("should parse SAMPLE BY with FILL(LINEAR)", () => {
      const result = parseToAst(
        "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(LINEAR)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["LINEAR"]);
      }
    });

    it("should parse SAMPLE BY with FILL(NULL)", () => {
      const result = parseToAst(
        "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(NULL)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["NULL"]);
      }
    });

    it("should parse SAMPLE BY with FILL(NONE)", () => {
      const result = parseToAst(
        "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(NONE)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["NONE"]);
      }
    });

    // From docs: multiple fill values per column
    it("should parse SAMPLE BY with multiple FILL values", () => {
      const result = parseToAst(
        "SELECT min(price), max(price), avg(price), ts FROM prices SAMPLE BY 1h FILL(NULL, 10, PREV)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["NULL", "10", "PREV"]);
      }
    });

    it("should parse SAMPLE BY with FILL(0) (numeric constant)", () => {
      const result = parseToAst(
        "SELECT timestamp, sum(wh) FROM meter SAMPLE BY 1h FILL(0)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["0"]);
      }
    });

    it("should parse SAMPLE BY with FILL(100.5) (decimal constant)", () => {
      const result = parseToAst(
        "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(100.5)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["100.5"]);
      }
    });

    // --- ALIGN TO clause ---

    it("should parse SAMPLE BY with ALIGN TO CALENDAR", () => {
      const result = parseToAst(
        "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.alignTo?.mode).toBe("calendar");
      }
    });

    it("should parse SAMPLE BY with ALIGN TO FIRST OBSERVATION", () => {
      const result = parseToAst(
        "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO FIRST OBSERVATION"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.alignTo?.mode).toBe("firstObservation");
      }
    });

    // From docs: ALIGN TO CALENDAR with TIME ZONE
    it("should parse ALIGN TO CALENDAR TIME ZONE", () => {
      const result = parseToAst(
        "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin'"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.alignTo?.mode).toBe("calendar");
        expect(select.sampleBy?.alignTo?.timeZone).toBe("Europe/Berlin");
      }
    });

    // From docs: ALIGN TO CALENDAR with OFFSET only
    it("should parse ALIGN TO CALENDAR WITH OFFSET", () => {
      const result = parseToAst(
        "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR WITH OFFSET '02:00'"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.alignTo?.mode).toBe("calendar");
        expect(select.sampleBy?.alignTo?.offset).toBe("02:00");
      }
    });

    // From docs: ALIGN TO CALENDAR with TIME ZONE and OFFSET
    it("should parse ALIGN TO CALENDAR TIME ZONE with OFFSET", () => {
      const result = parseToAst(
        "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin' WITH OFFSET '00:45'"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.alignTo?.mode).toBe("calendar");
        expect(select.sampleBy?.alignTo?.timeZone).toBe("Europe/Berlin");
        expect(select.sampleBy?.alignTo?.offset).toBe("00:45");
      }
    });

    // --- FROM/TO clause ---

    // From docs: SAMPLE BY with FROM-TO range
    it("should parse SAMPLE BY with FROM/TO timestamps", () => {
      const result = parseToAst(
        "SELECT timestamp, count() FROM trades SAMPLE BY 1d FROM '2009-01-01' TO '2009-01-10' FILL(NULL)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.duration).toBe("1d");
        expect(select.sampleBy?.from).toBeDefined();
        expect(select.sampleBy?.to).toBeDefined();
        expect(select.sampleBy?.fill).toEqual(["NULL"]);
      }
    });

    // --- Combined clauses ---

    // From docs: FILL + ALIGN TO combined
    it("should parse SAMPLE BY with FILL and ALIGN TO combined", () => {
      const result = parseToAst(
        "SELECT a, sum(a) FROM x SAMPLE BY 3h FILL(NONE) ALIGN TO CALENDAR"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.duration).toBe("3h");
        expect(select.sampleBy?.fill).toEqual(["NONE"]);
        expect(select.sampleBy?.alignTo?.mode).toBe("calendar");
      }
    });

    // Full combination: FILL + ALIGN TO with TIME ZONE
    it("should parse FILL + ALIGN TO CALENDAR TIME ZONE combined", () => {
      const result = parseToAst(
        "SELECT a, sum(a) FROM x SAMPLE BY 3h FILL(NONE) ALIGN TO CALENDAR TIME ZONE 'UTC'"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.fill).toEqual(["NONE"]);
        expect(select.sampleBy?.alignTo?.mode).toBe("calendar");
        expect(select.sampleBy?.alignTo?.timeZone).toBe("UTC");
      }
    });

    // Various time units
    it("should parse various SAMPLE BY time units", () => {
      for (const unit of ["1s", "5m", "1h", "1d", "1M", "1y"]) {
        const result = parseToAst(
          `SELECT avg(price) FROM trades SAMPLE BY ${unit}`
        );
        expect(result.errors).toHaveLength(0);
        const select = result.ast[0];
        if (select.type === "select") {
          expect(select.sampleBy?.duration).toBe(unit);
        }
      }
    });

    // From docs: complex real-world examples
    it("should parse OHLC bar query with SAMPLE BY", () => {
      const result = parseToAst(
        "SELECT timestamp, symbol, first(price) AS open, max(price) AS high, min(price) AS low, last(price) AS close, sum(quantity) AS total_volume FROM fx_trades SAMPLE BY 1m"
      );
      expect(result.errors).toHaveLength(0);
    });

    it("should parse SAMPLE BY with multiple FILL values and ALIGN", () => {
      const result = parseToAst(
        "SELECT first(open), first(high), first(low), first(close) FROM sandwich SAMPLE BY 100T FILL(PREV, PREV, PREV, PREV)"
      );
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0];
      if (select.type === "select") {
        expect(select.sampleBy?.duration).toBe("100T");
        expect(select.sampleBy?.fill).toEqual(["PREV", "PREV", "PREV", "PREV"]);
      }
    });
  });

  describe("JOIN round-trip tests", () => {
    const queries = [
      "SELECT * FROM trades t JOIN orders o ON t.id = o.trade_id",
      "SELECT * FROM trades t LEFT JOIN orders o ON t.id = o.trade_id",
      "SELECT * FROM trades t LEFT OUTER JOIN orders o ON t.id = o.trade_id",
      "SELECT * FROM trades t RIGHT JOIN orders o ON t.id = o.trade_id",
      "SELECT * FROM trades t FULL JOIN orders o ON t.id = o.trade_id",
      "SELECT * FROM trades t CROSS JOIN orders o",
      "SELECT * FROM trades t ASOF JOIN quotes q ON t.symbol = q.symbol",
      "SELECT * FROM trades t ASOF JOIN quotes q ON t.ts = q.ts TOLERANCE 1h",
      "SELECT * FROM trades t LT JOIN quotes q ON t.ts = q.ts TOLERANCE 30s",
      "SELECT * FROM buy SPLICE JOIN sell",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe("select");
      });
    }
  });

  describe("PIVOT statement", () => {
    it("should parse simple PIVOT with table source", () => {
      const result = parseToAst(
        "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      expect(pivot.type).toBe("pivot");
      if (pivot.type === "pivot") {
        expect((pivot.source as any).parts).toEqual(["trades"]);
        expect(pivot.aggregations).toHaveLength(1);
        expect(pivot.aggregations[0].expression.type).toBe("function");
        expect(pivot.pivots).toHaveLength(1);
        expect(pivot.pivots[0].expression.type).toBe("column");
        expect(pivot.pivots[0].in.values).toHaveLength(2);
      }
    });

    it("should parse PIVOT with subquery source", () => {
      const result = parseToAst(
        "(SELECT * FROM trades) PIVOT (sum(amount) FOR category IN ('food', 'drinks'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      expect(pivot.type).toBe("pivot");
      if (pivot.type === "pivot") {
        expect((pivot.source as any).type).toBe("select");
      }
    });

    it("should parse PIVOT with alias", () => {
      const result = parseToAst(
        "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks')) AS p"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.alias).toBe("p");
      }
    });

    it("should parse PIVOT with multiple aggregations", () => {
      const result = parseToAst(
        "trades PIVOT (sum(amount) AS total, avg(price) AS avg_price FOR category IN ('food', 'drinks'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.aggregations).toHaveLength(2);
        expect(pivot.aggregations[0].alias).toBe("total");
        expect(pivot.aggregations[1].alias).toBe("avg_price");
      }
    });

    it("should parse PIVOT with GROUP BY", () => {
      const result = parseToAst(
        "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks') GROUP BY region)"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.groupBy).toHaveLength(1);
      }
    });

    it("should parse PIVOT with ORDER BY and LIMIT", () => {
      const result = parseToAst(
        "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks')) ORDER BY food DESC LIMIT 10"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.orderBy).toHaveLength(1);
        expect(pivot.limit).toBeDefined();
      }
    });

    it("should parse PIVOT with WHERE clause", () => {
      const result = parseToAst(
        "trades WHERE price > 100 PIVOT (sum(amount) FOR category IN ('food', 'drinks'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.where).toBeDefined();
      }
    });

    it("should parse PIVOT with subquery IN source", () => {
      const result = parseToAst(
        "trades PIVOT (sum(amount) FOR category IN (SELECT DISTINCT category FROM categories))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.pivots[0].in.select).toBeDefined();
      }
    });

    it("should parse PIVOT with multiple FOR clauses without FOR keyword", () => {
      const result = parseToAst(
        "trades PIVOT (avg(price) FOR symbol IN ('BTC-USD', 'ETH-USD') side IN ('buy', 'sell'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.pivots).toHaveLength(2);
        expect(pivot.pivots[1].in.values).toHaveLength(2);
      }
    });

    it("should parse PIVOT with multiple FOR clauses with FOR keyword", () => {
      const result = parseToAst(
        "trades PIVOT (avg(price) FOR symbol IN ('BTC-USD', 'ETH-USD') FOR side IN ('buy', 'sell'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.pivots).toHaveLength(2);
      }
    });

    it("should parse PIVOT with multiple FOR clauses and subquery IN", () => {
      const result = parseToAst(
        "trades PIVOT (avg(price) FOR symbol IN (SELECT DISTINCT symbol FROM trades) side IN ('buy', 'sell'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.pivots).toHaveLength(2);
        expect(pivot.pivots[0].in.select).toBeDefined();
        expect(pivot.pivots[1].in.values).toHaveLength(2);
      }
    });

    it("should parse PIVOT with SELECT source", () => {
      const result = parseToAst(
        "SELECT * FROM trades PIVOT (avg(price) FOR symbol IN ('BTC-USD', 'ETH-USD'))"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      // SELECT ... PIVOT is parsed as a select statement with a pivot clause
      expect(stmt.type).toBe("select");
      if (stmt.type === "select") {
        expect(stmt.pivot).toBeDefined();
      }
    });

    it("should parse PIVOT with expression aggregate", () => {
      const result = parseToAst(
        "trades PIVOT (sum(price * amount) / 2 AS half_value FOR symbol IN ('BTC-USD', 'ETH-USD'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.aggregations).toHaveLength(1);
        expect(pivot.aggregations[0].alias).toBe("half_value");
      }
    });

    it("should parse PIVOT with multiple aggregates and expression aggregate", () => {
      const result = parseToAst(
        "trades PIVOT (avg(price) AS avg_price, sum(price * amount) / 2 AS half_value FOR symbol IN ('BTC-USD', 'ETH-USD'))"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.aggregations).toHaveLength(2);
        expect(pivot.aggregations[0].alias).toBe("avg_price");
        expect(pivot.aggregations[1].alias).toBe("half_value");
      }
    });

    it("should parse PIVOT with CTE", () => {
      const result = parseToAst(
        "WITH recent_trades AS (SELECT * FROM trades WHERE timestamp > dateadd('d', -1, now())) " +
        "SELECT * FROM recent_trades PIVOT (avg(price) FOR symbol IN (SELECT DISTINCT symbol FROM recent_trades) GROUP BY side)"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast).toHaveLength(1);
    });

    it("should parse PIVOT with dynamic subquery IN and GROUP BY", () => {
      const result = parseToAst(
        "trades PIVOT (avg(price) FOR symbol IN (SELECT DISTINCT symbol FROM trades ORDER BY symbol) GROUP BY side)"
      );
      expect(result.errors).toHaveLength(0);
      const pivot = result.ast[0];
      if (pivot.type === "pivot") {
        expect(pivot.pivots[0].in.select).toBeDefined();
        expect(pivot.groupBy).toHaveLength(1);
      }
    });
  });

  describe("PIVOT multi-statement boundary", () => {
    it("should parse two consecutive pivot statements as separate statements", () => {
      const sql = `trades PIVOT (avg(price) FOR symbol IN ('ETH-USDT'))
trades PIVOT (sum(amount) FOR symbol IN ('BTC-USDT'))`;
      const result = parseToAst(sql);
      expect(result.ast).toHaveLength(2);
      expect(result.ast[0].type).toBe("pivot");
      expect(result.ast[1].type).toBe("pivot");
    });

    it("should not consume next table name as alias without AS", () => {
      const sql = `trades PIVOT (avg(price) FOR symbol IN ('ETH-USDT'))
orders PIVOT (sum(amount) FOR status IN ('open'))`;
      const result = parseToAst(sql);
      expect(result.ast).toHaveLength(2);
      if (result.ast[0].type === "pivot") {
        expect(result.ast[0].alias).toBeUndefined();
      }
    });

    it("should still support PIVOT alias with AS keyword", () => {
      const result = parseToAst(
        "trades PIVOT (avg(price) FOR symbol IN ('ETH-USDT')) AS p"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast).toHaveLength(1);
      if (result.ast[0].type === "pivot") {
        expect(result.ast[0].alias).toBe("p");
      }
    });
  });

  describe("PIVOT round-trip tests", () => {
    const queries = [
      "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks'))",
      "trades PIVOT (sum(amount) AS total, avg(price) AS avg_price FOR category IN ('food', 'drinks'))",
      "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks') GROUP BY region)",
      "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks')) ORDER BY food DESC LIMIT 10",
      "(SELECT * FROM trades) PIVOT (sum(amount) FOR category IN ('food', 'drinks'))",
      "trades WHERE price > 100 PIVOT (sum(amount) FOR category IN ('food', 'drinks'))",
      "trades PIVOT (sum(amount) FOR category IN ('food', 'drinks')) AS p",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe("pivot");
      });
    }
  });

  describe("VIEW statements", () => {
    it("should parse CREATE VIEW", () => {
      const result = parseToAst("CREATE VIEW my_view AS (SELECT * FROM trades)");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("createView");
      if (stmt.type === "createView") {
        expect(stmt.view.parts).toEqual(["my_view"]);
        expect(stmt.query.type).toBe("select");
        expect(stmt.orReplace).toBeUndefined();
        expect(stmt.ifNotExists).toBeUndefined();
      }
    });

    it("should parse CREATE VIEW without parentheses", () => {
      const result = parseToAst("CREATE VIEW my_view AS SELECT * FROM trades");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createView");
    });

    it("should parse CREATE OR REPLACE VIEW", () => {
      const result = parseToAst(
        "CREATE OR REPLACE VIEW my_view AS (SELECT * FROM trades)"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "createView") {
        expect(stmt.orReplace).toBe(true);
      }
    });

    it("should parse CREATE VIEW IF NOT EXISTS", () => {
      const result = parseToAst(
        "CREATE VIEW IF NOT EXISTS my_view AS (SELECT * FROM trades)"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "createView") {
        expect(stmt.ifNotExists).toBe(true);
      }
    });

    it("should parse CREATE VIEW with CTE query", () => {
      const result = parseToAst(
        "CREATE VIEW my_view AS (WITH cte AS (SELECT * FROM trades) SELECT * FROM cte)"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createView");
    });

    it("should parse ALTER VIEW", () => {
      const result = parseToAst(
        "ALTER VIEW my_view AS (SELECT symbol, price FROM trades)"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("alterView");
      if (stmt.type === "alterView") {
        expect(stmt.view.parts).toEqual(["my_view"]);
        expect(stmt.query.type).toBe("select");
      }
    });

    it("should parse ALTER VIEW without parentheses", () => {
      const result = parseToAst(
        "ALTER VIEW my_view AS SELECT symbol FROM trades"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterView");
    });

    it("should parse DROP VIEW", () => {
      const result = parseToAst("DROP VIEW my_view");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("dropView");
      if (stmt.type === "dropView") {
        expect(stmt.view.parts).toEqual(["my_view"]);
        expect(stmt.ifExists).toBe(false);
      }
    });

    it("should parse DROP VIEW IF EXISTS", () => {
      const result = parseToAst("DROP VIEW IF EXISTS my_view");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "dropView") {
        expect(stmt.ifExists).toBe(true);
      }
    });
  });

  describe("VIEW round-trip tests", () => {
    const queries = [
      "CREATE VIEW my_view AS (SELECT * FROM trades)",
      "CREATE OR REPLACE VIEW my_view AS (SELECT * FROM trades)",
      "CREATE VIEW IF NOT EXISTS my_view AS (SELECT symbol, price FROM trades WHERE price > 100)",
      "ALTER VIEW my_view AS (SELECT symbol, price FROM trades)",
      "DROP VIEW my_view",
      "DROP VIEW IF EXISTS my_view",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  describe("SHOW statements", () => {
    it("should parse SHOW TABLES", () => {
      const result = parseToAst("SHOW TABLES");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("tables");
      }
    });

    it("should parse SHOW COLUMNS FROM table", () => {
      const result = parseToAst("SHOW COLUMNS FROM trades");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("columns");
        expect(stmt.table?.parts).toEqual(["trades"]);
      }
    });

    it("should parse SHOW PARTITIONS FROM table", () => {
      const result = parseToAst("SHOW PARTITIONS FROM trades");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("partitions");
      }
    });

    it("should parse SHOW CREATE TABLE", () => {
      const result = parseToAst("SHOW CREATE TABLE trades");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("createTable");
        expect(stmt.table?.parts).toEqual(["trades"]);
      }
    });

    it("should parse SHOW CREATE VIEW", () => {
      const result = parseToAst("SHOW CREATE VIEW my_view");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("createView");
        expect(stmt.table?.parts).toEqual(["my_view"]);
      }
    });

    it("should parse SHOW CREATE MATERIALIZED VIEW", () => {
      const result = parseToAst("SHOW CREATE MATERIALIZED VIEW my_mat_view");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("createMaterializedView");
        expect(stmt.table?.parts).toEqual(["my_mat_view"]);
      }
    });

    it("should parse SHOW SERVER_VERSION", () => {
      const result = parseToAst("SHOW server_version");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("serverVersion");
      }
    });

    it("should parse SHOW PARAMETERS", () => {
      const result = parseToAst("SHOW PARAMETERS");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("parameters");
      }
    });

    it("should parse SHOW TIME ZONE", () => {
      const result = parseToAst("SHOW TIME ZONE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("timeZone");
      }
    });

    it("should parse SHOW TRANSACTION ISOLATION LEVEL", () => {
      const result = parseToAst("SHOW TRANSACTION ISOLATION LEVEL");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("transactionIsolationLevel");
      }
    });

    it("should parse SHOW TRANSACTION (without ISOLATION LEVEL)", () => {
      const result = parseToAst("SHOW TRANSACTION");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      if (stmt.type === "show") {
        expect(stmt.showType).toBe("transaction");
      }
    });
  });

  describe("SHOW round-trip tests", () => {
    const queries = [
      "SHOW TABLES",
      "SHOW COLUMNS FROM trades",
      "SHOW PARTITIONS FROM trades",
      "SHOW CREATE TABLE trades",
      "SHOW CREATE VIEW my_view",
      "SHOW CREATE MATERIALIZED VIEW my_mat_view",
      "SHOW TIME ZONE",
      "SHOW PARAMETERS",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe("show");
      });
    }
  });

  describe("SAMPLE BY round-trip tests", () => {
    const queries = [
      "SELECT avg(price) FROM trades SAMPLE BY 1h",
      "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(PREV)",
      "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(NULL)",
      "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(LINEAR)",
      "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(NONE)",
      "SELECT ts, max(price) FROM prices SAMPLE BY 1h FILL(100.5)",
      "SELECT min(price), max(price), avg(price), ts FROM prices SAMPLE BY 1h FILL(NULL, 10, PREV)",
      "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR",
      "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO FIRST OBSERVATION",
      "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin'",
      "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR WITH OFFSET '02:00'",
      "SELECT ts, count() FROM trades SAMPLE BY 1d ALIGN TO CALENDAR TIME ZONE 'Europe/Berlin' WITH OFFSET '00:45'",
      "SELECT a, sum(a) FROM x SAMPLE BY 3h FILL(NONE) ALIGN TO CALENDAR",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe("select");
      });
    }
  });

  // ===========================================================================
  // Bitwise & IP Operators
  // ===========================================================================

  describe("Bitwise Operators", () => {
    it("should parse bitwise AND (&)", () => {
      const result = parseToAst("SELECT a & b FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.columns[0].expression.type).toBe("binary");
      expect(select.columns[0].expression.operator).toBe("&");
    });

    it("should parse bitwise OR (|)", () => {
      const result = parseToAst("SELECT a | b FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.columns[0].expression.type).toBe("binary");
      expect(select.columns[0].expression.operator).toBe("|");
    });

    it("should parse bitwise XOR (^)", () => {
      const result = parseToAst("SELECT a ^ b FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.columns[0].expression.type).toBe("binary");
      expect(select.columns[0].expression.operator).toBe("^");
    });

    it("should parse unary bitwise complement (~)", () => {
      const result = parseToAst("SELECT ~a FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.columns[0].expression.type).toBe("unary");
      expect(select.columns[0].expression.operator).toBe("~");
    });

    it("should parse chained bitwise operators", () => {
      const result = parseToAst("SELECT a & b | c ^ d FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      // | is lowest precedence among bitwise: (a & b) | (c ^ d)
      expect(select.columns[0].expression.type).toBe("binary");
      expect(select.columns[0].expression.operator).toBe("|");
    });

    it("should parse bitwise AND with correct precedence vs OR", () => {
      // a | b & c should parse as a | (b & c) since & has higher precedence
      const result = parseToAst("SELECT a | b & c FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      const expr = select.columns[0].expression;
      expect(expr.type).toBe("binary");
      expect(expr.operator).toBe("|");
      expect(expr.right.type).toBe("binary");
      expect(expr.right.operator).toBe("&");
    });

    it("should parse bitwise XOR with correct precedence between AND and OR", () => {
      // a | b ^ c & d should parse as a | ((b ^ (c & d)))
      const result = parseToAst("SELECT a | b ^ c & d FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      const expr = select.columns[0].expression;
      expect(expr.type).toBe("binary");
      expect(expr.operator).toBe("|");
      // right side: b ^ (c & d)
      expect(expr.right.operator).toBe("^");
      expect(expr.right.right.operator).toBe("&");
    });

    it("should disambiguate | from ||", () => {
      const result = parseToAst("SELECT a || b FROM t");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.columns[0].expression.type).toBe("binary");
      expect(select.columns[0].expression.operator).toBe("||");
    });

    it("should parse bitwise operators in WHERE clause", () => {
      const result = parseToAst("SELECT * FROM t WHERE flags & 1 = 1");
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("WITHIN operator", () => {
    it("should parse WITHIN with multiple arguments", () => {
      const result = parseToAst("SELECT * FROM t WHERE geo WITHIN (1.0, 2.0, 3.0)");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.where.type).toBe("within");
      expect(select.where.values).toHaveLength(3);
    });

    it("should parse WITHIN with column reference", () => {
      const result = parseToAst("SELECT * FROM t WHERE ip WITHIN (hash)");
      expect(result.errors).toHaveLength(0);
      const select = result.ast[0] as any;
      expect(select.where.type).toBe("within");
      expect(select.where.values).toHaveLength(1);
    });
  });

  describe("Bitwise & WITHIN round-trip", () => {
    const queries = [
      "SELECT a & b FROM t",
      "SELECT a | b FROM t",
      "SELECT a ^ b FROM t",
      "SELECT ~a FROM t",
      "SELECT a & b | c FROM t",
      "SELECT a || b FROM t",
      "SELECT * FROM t WHERE flags & 1 = 1",
      "SELECT * FROM t WHERE geo WITHIN (1.0, 2.0, 3.0)",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
      });
    }
  });

  // ===========================================================================
  // Materialized View
  // ===========================================================================

  describe("CREATE MATERIALIZED VIEW", () => {
    it("should parse basic CREATE MATERIALIZED VIEW", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv AS (SELECT avg(price) FROM trades SAMPLE BY 1h) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createMaterializedView");
      expect(stmt.view.parts).toEqual(["mv"]);
      expect(stmt.query.type).toBe("select");
      expect(stmt.partitionBy).toBe("DAY");
    });

    it("should parse CREATE MATERIALIZED VIEW IF NOT EXISTS", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW IF NOT EXISTS mv AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY MONTH"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.ifNotExists).toBe(true);
    });

    it("should parse CREATE MATERIALIZED VIEW WITH BASE", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv WITH BASE trades AS (SELECT avg(price) FROM trades SAMPLE BY 1h) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.baseTable.parts).toEqual(["trades"]);
    });

    it("should parse REFRESH IMMEDIATE", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv REFRESH IMMEDIATE AS (SELECT * FROM t SAMPLE BY 1h) PARTITION BY HOUR"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.refresh.mode).toBe("immediate");
    });

    it("should parse REFRESH MANUAL DEFERRED", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv REFRESH MANUAL DEFERRED AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.refresh.mode).toBe("manual");
      expect(stmt.refresh.deferred).toBe(true);
    });

    it("should parse REFRESH EVERY with START and TIME ZONE", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv REFRESH EVERY 1h START '2024-01-01' TIME ZONE 'UTC' AS (SELECT * FROM t SAMPLE BY 1h) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.refresh.every).toBeDefined();
      expect(stmt.refresh.start).toBe("2024-01-01");
      expect(stmt.refresh.timeZone).toBe("UTC");
    });

    it("should parse PERIOD with LENGTH", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv PERIOD (LENGTH 1h) AS (SELECT * FROM t SAMPLE BY 1h) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.period.length).toBeDefined();
    });

    it("should parse PERIOD with SAMPLE BY INTERVAL", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv PERIOD (SAMPLE BY INTERVAL) AS (SELECT * FROM t SAMPLE BY 1h) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.period.sampleByInterval).toBe(true);
    });

    it("should parse PERIOD with LENGTH, TIME ZONE and DELAY", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv PERIOD (LENGTH 1h TIME ZONE 'UTC' DELAY 5m) AS (SELECT * FROM t SAMPLE BY 1h) PARTITION BY HOUR"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.period.length).toBeDefined();
      expect(stmt.period.timeZone).toBe("UTC");
      expect(stmt.period.delay).toBeDefined();
    });

    it("should parse TIMESTAMP clause", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM t SAMPLE BY 1h) TIMESTAMP(ts) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.timestamp).toBeDefined();
    });

    it("should parse TTL clause", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY DAY TTL 30 DAYS"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.ttl).toEqual({ value: 30, unit: "DAYS" });
    });

    it("should parse IN VOLUME clause", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY DAY IN VOLUME myvolume"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.volume).toBe("myvolume");
    });
  });

  describe("ALTER MATERIALIZED VIEW", () => {
    it("should parse ALTER COLUMN ADD INDEX", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv ALTER COLUMN sym ADD INDEX");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("alterMaterializedView");
      expect(stmt.action.actionType).toBe("addIndex");
      expect(stmt.action.column).toBe("sym");
    });

    it("should parse ALTER COLUMN ADD INDEX CAPACITY", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv ALTER COLUMN sym ADD INDEX CAPACITY 256");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action.capacity).toBe(256);
    });

    it("should parse ALTER COLUMN SYMBOL CAPACITY", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv ALTER COLUMN sym SYMBOL CAPACITY 512");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action.actionType).toBe("symbolCapacity");
      expect(stmt.action.capacity).toBe(512);
    });

    it("should parse SET TTL", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv SET TTL 30 DAYS");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action.actionType).toBe("setTtl");
      expect(stmt.action.ttl).toEqual({ value: 30, unit: "DAYS" });
    });

    it("should parse SET REFRESH LIMIT", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv SET REFRESH LIMIT 24 HOURS");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action.actionType).toBe("setRefreshLimit");
      expect(stmt.action.limit).toEqual({ value: 24, unit: "HOURS" });
    });

    it("should parse SET REFRESH MANUAL", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv SET REFRESH MANUAL");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action.actionType).toBe("setRefresh");
      expect(stmt.action.refresh.mode).toBe("manual");
    });
  });

  describe("DROP MATERIALIZED VIEW", () => {
    it("should parse DROP MATERIALIZED VIEW", () => {
      const result = parseToAst("DROP MATERIALIZED VIEW mv");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("dropMaterializedView");
      expect(stmt.view.parts).toEqual(["mv"]);
    });

    it("should parse DROP MATERIALIZED VIEW IF EXISTS", () => {
      const result = parseToAst("DROP MATERIALIZED VIEW IF EXISTS mv");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.ifExists).toBe(true);
    });
  });

  describe("REFRESH MATERIALIZED VIEW", () => {
    it("should parse REFRESH MATERIALIZED VIEW (no mode)", () => {
      const result = parseToAst("REFRESH MATERIALIZED VIEW mv");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("refreshMaterializedView");
      expect(stmt.view.parts).toEqual(["mv"]);
    });

    it("should parse REFRESH MATERIALIZED VIEW FULL", () => {
      const result = parseToAst("REFRESH MATERIALIZED VIEW mv FULL");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.mode).toBe("full");
    });

    it("should parse REFRESH MATERIALIZED VIEW INCREMENTAL", () => {
      const result = parseToAst("REFRESH MATERIALIZED VIEW mv INCREMENTAL");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.mode).toBe("incremental");
    });

    it("should parse REFRESH MATERIALIZED VIEW RANGE", () => {
      const result = parseToAst("REFRESH MATERIALIZED VIEW mv RANGE FROM '2024-01-01' TO '2024-02-01'");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.mode).toBe("range");
      expect(stmt.from).toBe("2024-01-01");
      expect(stmt.to).toBe("2024-02-01");
    });
  });

  describe("Materialized View round-trip", () => {
    const queries = [
      "CREATE MATERIALIZED VIEW mv AS (SELECT avg(price) FROM trades SAMPLE BY 1h) PARTITION BY DAY",
      "CREATE MATERIALIZED VIEW IF NOT EXISTS mv AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY MONTH",
      "CREATE MATERIALIZED VIEW mv WITH BASE trades AS (SELECT avg(price) FROM trades SAMPLE BY 1h) PARTITION BY DAY",
      "CREATE MATERIALIZED VIEW mv REFRESH IMMEDIATE AS (SELECT * FROM t SAMPLE BY 1h) PARTITION BY HOUR",
      "CREATE MATERIALIZED VIEW mv REFRESH MANUAL DEFERRED AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY DAY",
      "DROP MATERIALIZED VIEW mv",
      "DROP MATERIALIZED VIEW IF EXISTS mv",
      "REFRESH MATERIALIZED VIEW mv",
      "REFRESH MATERIALIZED VIEW mv FULL",
      "REFRESH MATERIALIZED VIEW mv INCREMENTAL",
      "ALTER MATERIALIZED VIEW mv ALTER COLUMN sym ADD INDEX",
      "ALTER MATERIALIZED VIEW mv SET TTL 30 DAYS",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  // ===========================================================================
  // Miscellaneous Gaps
  // ===========================================================================

  describe("DECLARE clause", () => {
    it("should parse basic DECLARE as clause of SELECT", () => {
      const result = parseToAst("DECLARE @x := 1 SELECT @x FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.declare).toBeDefined();
      expect(stmt.declare.assignments).toHaveLength(1);
      expect(stmt.declare.assignments[0].name).toBe("x");
    });

    it("should parse multiple DECLARE assignments", () => {
      const result = parseToAst("DECLARE @x := 1, @y := 2 SELECT @x, @y FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.declare.assignments).toHaveLength(2);
    });

    it("should parse DECLARE with OVERRIDABLE", () => {
      const result = parseToAst("DECLARE OVERRIDABLE @x := 1 SELECT @x FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.declare.assignments[0].overridable).toBe(true);
    });

    it("should allow reserved keywords as variable names via VariableReference token", () => {
      // The lexer captures @select, @window, @from etc. as single VariableReference tokens
      const reservedKeywordVars = [
        "DECLARE @select := 5 SELECT @select",
        "DECLARE @window := 100 SELECT @window FROM t",
        "DECLARE @from := '2024-01-01' SELECT * FROM t WHERE ts > @from",
        "DECLARE @end := '2024-12-31' SELECT * FROM t WHERE ts < @end",
        "DECLARE @limit := 10 SELECT * FROM t LIMIT @limit",
      ];
      for (const sql of reservedKeywordVars) {
        const result = parseToAst(sql);
        expect(result.errors).toHaveLength(0);
      }
    });

    it("should allow @variable in SAMPLE BY clause", () => {
      const result = parseToAst(
        "DECLARE @period := 1h SELECT * FROM t SAMPLE BY @period"
      );
      expect(result.errors).toHaveLength(0);
    });

    it("should allow @variable as table source", () => {
      const result = parseToAst(
        "DECLARE @tbl := (SELECT * FROM t) SELECT * FROM @tbl"
      );
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("EXPLAIN statement", () => {
    it("should parse basic EXPLAIN", () => {
      const result = parseToAst("EXPLAIN SELECT * FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("explain");
      expect(stmt.statement.type).toBe("select");
    });

    it("should parse EXPLAIN with FORMAT", () => {
      const result = parseToAst("EXPLAIN (FORMAT JSON) SELECT * FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("explain");
      expect(stmt.format).toBe("JSON");
    });

    it("should parse EXPLAIN with FORMAT TEXT", () => {
      const result = parseToAst("EXPLAIN (FORMAT TEXT) SELECT * FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.format).toBe("TEXT");
    });
  });

  describe("DurationLiteral units", () => {
    it("should lex all duration units", () => {
      const units = ["1s", "1m", "1h", "1H", "1d", "1w", "1M", "1y", "1n", "1N", "1T", "1U", "1u"];
      for (const unit of units) {
        const result = parseToAst(`SELECT * FROM t SAMPLE BY ${unit}`);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  describe("Miscellaneous round-trip", () => {
    const queries = [
      "DECLARE @x := 1 SELECT @x FROM t",
      "DECLARE @x := 1, @y := 2 SELECT @x, @y FROM t",
      "DECLARE OVERRIDABLE @x := 1 SELECT @x FROM t",
      "EXPLAIN SELECT * FROM t",
      "EXPLAIN (FORMAT JSON) SELECT * FROM t",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  // ===========================================================================
  // User/Auth Management
  // ===========================================================================

  describe("User/Auth statements", () => {
    it("should parse CREATE USER", () => {
      const result = parseToAst("CREATE USER alice");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createUser");
      expect(stmt.user.parts).toEqual(["alice"]);
    });

    it("should parse CREATE USER WITH PASSWORD", () => {
      const result = parseToAst("CREATE USER alice WITH PASSWORD 'secret'");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.password).toBe("secret");
    });

    it("should parse CREATE USER NO PASSWORD", () => {
      const result = parseToAst("CREATE USER alice WITH NO PASSWORD");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.noPassword).toBe(true);
    });

    it("should parse CREATE GROUP", () => {
      const result = parseToAst("CREATE GROUP admins");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createGroup");
    });

    it("should parse CREATE SERVICE ACCOUNT", () => {
      const result = parseToAst("CREATE SERVICE ACCOUNT svc1");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createServiceAccount");
    });

    it("should parse ALTER USER ENABLE", () => {
      const result = parseToAst("ALTER USER alice ENABLE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("alterUser");
      expect(stmt.action.actionType).toBe("enable");
    });

    it("should parse ALTER USER DISABLE", () => {
      const result = parseToAst("ALTER USER alice DISABLE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action.actionType).toBe("disable");
    });

    it("should parse DROP USER", () => {
      const result = parseToAst("DROP USER alice");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("dropUser");
    });

    it("should parse DROP USER IF EXISTS", () => {
      const result = parseToAst("DROP USER IF EXISTS alice");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.ifExists).toBe(true);
    });

    it("should parse DROP GROUP", () => {
      const result = parseToAst("DROP GROUP admins");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("dropGroup");
    });

    it("should parse DROP SERVICE ACCOUNT", () => {
      const result = parseToAst("DROP SERVICE ACCOUNT svc1");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("dropServiceAccount");
    });

    it("should parse ADD USER TO group", () => {
      const result = parseToAst("ADD USER alice TO admins");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("addUser");
      expect(stmt.user.parts).toEqual(["alice"]);
    });

    it("should parse REMOVE USER FROM group", () => {
      const result = parseToAst("REMOVE USER alice FROM admins");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("removeUser");
    });

    it("should parse ASSUME SERVICE ACCOUNT", () => {
      const result = parseToAst("ASSUME SERVICE ACCOUNT svc1");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("assumeServiceAccount");
    });

    it("should parse EXIT SERVICE ACCOUNT", () => {
      const result = parseToAst("EXIT SERVICE ACCOUNT svc1");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("exitServiceAccount");
    });

    it("should parse GRANT permissions", () => {
      const result = parseToAst("GRANT SELECT ON ALL TABLES TO alice");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("grant");
      expect(stmt.permissions).toContain("SELECT");
    });

    it("should parse REVOKE permissions", () => {
      const result = parseToAst("REVOKE SELECT ON ALL TABLES FROM alice");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("revoke");
    });

    it("should parse GRANT ASSUME SERVICE ACCOUNT", () => {
      const result = parseToAst("GRANT ASSUME SERVICE ACCOUNT svc1 TO alice");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("grantAssumeServiceAccount");
    });

    it("should parse REVOKE ASSUME SERVICE ACCOUNT", () => {
      const result = parseToAst("REVOKE ASSUME SERVICE ACCOUNT svc1 FROM alice");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("revokeAssumeServiceAccount");
    });
  });

  describe("User/Auth round-trip", () => {
    const queries = [
      "CREATE USER alice",
      "CREATE USER alice WITH NO PASSWORD",
      "CREATE GROUP admins",
      "CREATE SERVICE ACCOUNT svc1",
      "ALTER USER alice ENABLE",
      "ALTER USER alice DISABLE",
      "DROP USER alice",
      "DROP USER IF EXISTS alice",
      "DROP GROUP admins",
      "DROP SERVICE ACCOUNT svc1",
      "ADD USER alice TO admins",
      "REMOVE USER alice FROM admins",
      "ASSUME SERVICE ACCOUNT svc1",
      "EXIT SERVICE ACCOUNT svc1",
      "GRANT ASSUME SERVICE ACCOUNT svc1 TO alice",
      "REVOKE ASSUME SERVICE ACCOUNT svc1 FROM alice",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  // ===========================================================================
  // Administrative Operations
  // ===========================================================================

  describe("Admin operations", () => {
    it("should parse CHECKPOINT CREATE", () => {
      const result = parseToAst("CHECKPOINT CREATE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("checkpoint");
      expect(stmt.action).toBe("create");
    });

    it("should parse CHECKPOINT RELEASE", () => {
      const result = parseToAst("CHECKPOINT RELEASE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action).toBe("release");
    });

    it("should parse SNAPSHOT PREPARE", () => {
      const result = parseToAst("SNAPSHOT PREPARE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("snapshot");
      expect(stmt.action).toBe("prepare");
    });

    it("should parse SNAPSHOT COMPLETE", () => {
      const result = parseToAst("SNAPSHOT COMPLETE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.action).toBe("complete");
    });

    it("should parse VACUUM TABLE", () => {
      const result = parseToAst("VACUUM TABLE trades");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("vacuumTable");
      expect(stmt.table.parts).toEqual(["trades"]);
    });

    it("should parse RESUME WAL", () => {
      const result = parseToAst("RESUME WAL");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("resumeWal");
    });

    it("should parse REINDEX TABLE", () => {
      const result = parseToAst("REINDEX TABLE trades");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("reindexTable");
      expect(stmt.table.parts).toEqual(["trades"]);
    });

    it("should parse REINDEX TABLE with LOCK EXCLUSIVE", () => {
      const result = parseToAst("REINDEX TABLE trades LOCK EXCLUSIVE");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.lockExclusive).toBe(true);
    });

    it("should parse CANCEL QUERY", () => {
      const result = parseToAst("CANCEL QUERY 'abc123'");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("cancelQuery");
      expect(stmt.queryId).toBe("abc123");
    });

    it("should parse COPY table FROM file", () => {
      const result = parseToAst("COPY trades FROM '/tmp/data.csv'");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("copyFrom");
      expect(stmt.table.parts).toEqual(["trades"]);
      expect(stmt.file).toBe("/tmp/data.csv");
    });
  });

  describe("Admin operations round-trip", () => {
    const queries = [
      "CHECKPOINT CREATE",
      "CHECKPOINT RELEASE",
      "SNAPSHOT PREPARE",
      "SNAPSHOT COMPLETE",
      "VACUUM TABLE trades",
      "RESUME WAL",
      "REINDEX TABLE trades",
      "REINDEX TABLE trades LOCK EXCLUSIVE",
    ];

    for (const query of queries) {
      it(`should round-trip: ${query}`, () => {
        const result1 = parseToAst(query);
        expect(result1.errors).toHaveLength(0);

        const sql = toSql(result1.ast[0]);
        const result2 = parseToAst(sql);
        expect(result2.errors).toHaveLength(0);
        expect(result2.ast[0].type).toBe(result1.ast[0].type);
      });
    }
  });

  // ===========================================================================
  // Parser fixes
  // ===========================================================================

  describe("Parser fixes", () => {
    // --- Fix 1: ARRAY literals ---

    it("should parse basic ARRAY literal", () => {
      const result = parseToAst("SELECT ARRAY[1, 2, 3] FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("select");
      if (stmt.type === "select") {
        const col = stmt.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("arrayLiteral");
          if (col.expression.type === "arrayLiteral") {
            expect(col.expression.elements).toHaveLength(3);
          }
        }
      }
    });

    it("should parse nested ARRAY literal", () => {
      const result = parseToAst("SELECT ARRAY[[1,2],[3,4]] FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("select");
      if (stmt.type === "select") {
        const col = stmt.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("arrayLiteral");
          if (col.expression.type === "arrayLiteral") {
            expect(col.expression.elements).toHaveLength(2);
          }
        }
      }
    });

    it("should parse ARRAY literal in INSERT VALUES", () => {
      const result = parseToAst("INSERT INTO t VALUES (ARRAY[1.0, 2.0])");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("insert");
    });

    // --- Fix 2: Time unit + WINDOW JOIN ---

    it("should parse WINDOW JOIN with time units in RANGE BETWEEN", () => {
      const result = parseToAst(
        "SELECT * FROM t1 WINDOW JOIN t2 ON ts RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("select");
      if (stmt.type === "select") {
        const join = stmt.from?.[0].joins?.[0];
        expect(join?.joinType).toBe("window");
        expect(join?.range).toBeDefined();
      }
    });

    it("should parse window frame with ROWS BETWEEN (regression)", () => {
      const result = parseToAst(
        "SELECT avg(price) OVER (ORDER BY ts ROWS BETWEEN 5 PRECEDING AND CURRENT ROW) FROM t"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // --- Fix 3: SELECT *, expr ---

    it("should parse SELECT *, expr with window function", () => {
      const result = parseToAst(
        "SELECT *, rank() OVER (PARTITION BY symbol ORDER BY ts DESC) as rn FROM trades"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("select");
    });

    // --- Fix 4: Array column types ---

    it("should parse CREATE TABLE with single-dimension array column type", () => {
      const result = parseToAst("CREATE TABLE t (id INT, vals DOUBLE[])");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createTable");
      if (result.ast[0].type === "createTable") {
        expect(result.ast[0].columns).toHaveLength(2);
      }
    });

    it("should parse CREATE TABLE with multi-dimension array column type", () => {
      const result = parseToAst("CREATE TABLE t (id INT, matrix DOUBLE[][])");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createTable");
      if (result.ast[0].type === "createTable") {
        expect(result.ast[0].columns).toHaveLength(2);
      }
    });

    // --- Fix 5: DurationLiteral TTL + RENAME ---

    it("should parse ALTER TABLE SET TTL with DurationLiteral", () => {
      const result = parseToAst("ALTER TABLE t SET TTL 2w");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("alterTable");
    });

    it("should parse RENAME TABLE with string literal table names", () => {
      const result = parseToAst("RENAME TABLE 'old_name' TO 'new_name'");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("renameTable");
    });

    // --- Fix 6: Simple CASE ---

    it("should parse simple CASE expression", () => {
      const result = parseToAst(
        "SELECT CASE status WHEN 1 THEN 'active' WHEN 2 THEN 'inactive' ELSE 'unknown' END FROM t"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("select");
      if (stmt.type === "select") {
        const col = stmt.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("case");
          if (col.expression.type === "case") {
            expect(col.expression.operand).toBeDefined();
            expect(col.expression.whenClauses).toHaveLength(2);
            expect(col.expression.elseClause).toBeDefined();
          }
        }
      }
    });

    it("should parse searched CASE expression (regression)", () => {
      const result = parseToAst(
        "SELECT CASE WHEN x > 0 THEN 'pos' ELSE 'neg' END FROM t"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0];
      expect(stmt.type).toBe("select");
      if (stmt.type === "select") {
        const col = stmt.columns[0];
        if (col.type === "selectItem") {
          expect(col.expression.type).toBe("case");
          if (col.expression.type === "case") {
            expect(col.expression.operand).toBeUndefined();
            expect(col.expression.whenClauses).toHaveLength(1);
            expect(col.expression.elseClause).toBeDefined();
          }
        }
      }
    });

    // --- Fix 8-10: DECLARE, PARTITION BY WEEK ---

    it("should parse DECLARE with variable assignment using equals", () => {
      const result = parseToAst(
        "DECLARE @cutoff = '2024-01-01' SELECT * FROM t WHERE ts < @cutoff"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.declare).toBeDefined();
      expect(stmt.declare.assignments).toHaveLength(1);
      expect(stmt.declare.assignments[0].name).toBe("cutoff");
    });

    it("should parse CREATE MATERIALIZED VIEW with PARTITION BY WEEK", () => {
      const result = parseToAst(
        "CREATE MATERIALIZED VIEW mv AS (SELECT * FROM t SAMPLE BY 1d) PARTITION BY WEEK"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createMaterializedView");
    });

    // --- Fix 11: CREATE GROUP WITH EXTERNAL ALIAS ---

    it("should parse CREATE GROUP WITH EXTERNAL ALIAS", () => {
      const result = parseToAst(
        "CREATE GROUP mygroup WITH EXTERNAL ALIAS 'ext_alias'"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createGroup");
      expect(stmt.externalAlias).toBeDefined();
    });

    it("should parse CREATE GROUP without alias (regression)", () => {
      const result = parseToAst("CREATE GROUP mygroup");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createGroup");
    });

    // --- Fix 13: Array subscript slices ---

    it("should parse array subscript with open-ended slice (start:)", () => {
      const result = parseToAst("SELECT arr[2:] FROM t");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse array subscript with open-ended slice (:end)", () => {
      const result = parseToAst("SELECT arr[:5] FROM t");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse array subscript with full slice (start:end)", () => {
      const result = parseToAst("SELECT arr[1:3] FROM t");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse simple array subscript (regression)", () => {
      const result = parseToAst("SELECT arr[1] FROM t");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // --- Fix 14: REINDEX with string partition ---

    it("should parse REINDEX TABLE with string PARTITION", () => {
      const result = parseToAst("REINDEX TABLE t PARTITION '2021-12-17'");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("reindexTable");
      expect(stmt.table.parts).toEqual(["t"]);
    });

    // --- GRANT COMPILE VIEW ---

    it("should parse GRANT COMPILE VIEW ON target TO user", () => {
      const result = parseToAst("GRANT COMPILE VIEW ON my_view TO username");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("grant");
      expect(stmt.permissions).toBeDefined();
    });

    // --- OWNED BY string literal ---

    it("should parse CREATE TABLE with OWNED BY string literal", () => {
      const result = parseToAst(
        "CREATE TABLE trades (symbol SYMBOL, price DOUBLE, ts TIMESTAMP) timestamp(ts) PARTITION BY DAY OWNED BY 'admin'"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createTable");
      expect(stmt.ownedBy).toBeDefined();
    });

    // --- Schema-qualified function calls (identifierExpression) ---

    it("should parse schema-qualified function call", () => {
      const result = parseToAst("SELECT pg_catalog.version()");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const col = stmt.columns[0].expression;
      expect(col.type).toBe("function");
      expect(col.name).toBe("pg_catalog.version");
      expect(col.args).toHaveLength(0);
    });

    it("should parse schema-qualified function call with args", () => {
      const result = parseToAst("SELECT my_schema.my_func(1, 2)");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const col = stmt.columns[0].expression;
      expect(col.type).toBe("function");
      expect(col.name).toBe("my_schema.my_func");
      expect(col.args).toHaveLength(2);
    });

    it("should parse 3-part qualified function call", () => {
      const result = parseToAst("SELECT a.b.c()");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const col = stmt.columns[0].expression;
      expect(col.type).toBe("function");
      expect(col.name).toBe("a.b.c");
    });

    it("should parse qualified name as column reference without parens", () => {
      const result = parseToAst("SELECT pg_catalog.version FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const col = stmt.columns[0].expression;
      expect(col.type).toBe("column");
      expect(col.name.parts).toEqual(["pg_catalog", "version"]);
    });

    it("should still parse regular function calls", () => {
      const result = parseToAst("SELECT count(*), sum(price), now() FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.columns[0].expression.type).toBe("function");
      expect(stmt.columns[0].expression.name).toBe("count");
      expect(stmt.columns[0].expression.star).toBe(true);
      expect(stmt.columns[1].expression.type).toBe("function");
      expect(stmt.columns[1].expression.name).toBe("sum");
      expect(stmt.columns[2].expression.type).toBe("function");
      expect(stmt.columns[2].expression.name).toBe("now");
    });

    it("should still parse left() and right() as functions", () => {
      const result = parseToAst("SELECT left(name, 3), right(name, 2) FROM t");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.columns[0].expression.type).toBe("function");
      expect(stmt.columns[0].expression.name).toBe("left");
      expect(stmt.columns[1].expression.type).toBe("function");
      expect(stmt.columns[1].expression.name).toBe("right");
    });

    it("should parse tables() as function call and tables as column", () => {
      const result1 = parseToAst("SELECT * FROM tables()");
      expect(result1.errors).toHaveLength(0);

      const result2 = parseToAst("SELECT tables FROM t");
      expect(result2.errors).toHaveLength(0);
      const col = (result2.ast[0] as any).columns[0].expression;
      expect(col.type).toBe("column");
    });

    it("should round-trip schema-qualified function call", () => {
      const result = parseToAst("SELECT pg_catalog.version()");
      expect(result.errors).toHaveLength(0);
      const sql = toSql(result.ast[0]);
      expect(sql).toContain("pg_catalog.version()");
    });

    // --- IN expression forms ---

    it("should parse IN with bare function call (no parens)", () => {
      const result = parseToAst("SELECT * FROM t WHERE ts IN today()");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const where = stmt.where;
      expect(where.type).toBe("in");
      expect(where.parenthesized).toBeFalsy();
    });

    it("should parse IN with parenthesized list", () => {
      const result = parseToAst("SELECT * FROM t WHERE x IN (1, 2, 3)");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const where = stmt.where;
      expect(where.type).toBe("in");
      expect(where.parenthesized).toBe(true);
      expect(where.values).toHaveLength(3);
    });

    it("should round-trip IN bare form without adding parens", () => {
      const result = parseToAst("SELECT * FROM t WHERE ts IN today()");
      expect(result.errors).toHaveLength(0);
      const sql = toSql(result.ast[0]);
      expect(sql).toContain("IN today()");
      expect(sql).not.toContain("IN (today())");
    });

    it("should round-trip IN parenthesized form with parens", () => {
      const result = parseToAst("SELECT * FROM t WHERE x IN (1, 2, 3)");
      expect(result.errors).toHaveLength(0);
      const sql = toSql(result.ast[0]);
      expect(sql).toContain("IN (1, 2, 3)");
    });

    it("should parse NOT IN with bare function call", () => {
      const result = parseToAst("SELECT * FROM t WHERE ts NOT IN yesterday()");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.where.type).toBe("in");
      expect(stmt.where.not).toBe(true);
      expect(stmt.where.parenthesized).toBeFalsy();
    });

    it("should parse IN with string literal (date range)", () => {
      const result = parseToAst(
        "SELECT * FROM t WHERE ts IN '2024-01-01'"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.where.type).toBe("in");
      expect(stmt.where.parenthesized).toBeFalsy();
    });

    it("should parse window function via identifierExpression", () => {
      const result = parseToAst(
        "SELECT first_value(price) OVER (PARTITION BY symbol ORDER BY ts) FROM trades"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      const col = stmt.columns[0].expression;
      expect(col.type).toBe("function");
      expect(col.name).toBe("first_value");
      expect(col.over).toBeDefined();
    });

    it("should parse function with DISTINCT via identifierExpression", () => {
      const result = parseToAst("SELECT count_distinct(symbol) FROM trades");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.columns[0].expression.type).toBe("function");
    });
  });

  describe("Alias lookahead — identifier followed by LParen is not an alias", () => {
    const cases = [
      ["selectItem alias", "SELECT build()\n\nfunctions()"],
      ["selectItem alias after UNION", "SELECT 1 UNION SELECT 2\n\nfunctions()"],
      ["tableRef alias (FROM)", "SELECT * FROM t\n\nfunctions()"],
      ["tableRef alias (JOIN)", "SELECT * FROM t JOIN b\n\nfunctions()"],
      ["tableRef alias (subquery)", "SELECT * FROM (SELECT 1)\n\nfunctions()"],
      ["tableRef alias (table func)", "tables()\n\nfunctions()"],
    ] as const;

    it.each(cases)("%s", (_label, sql) => {
      const result = parse(sql);
      expect(result.parseErrors).toHaveLength(0);
      expect(result.cst?.children?.statement?.length).toBe(2);
    });
  });

  describe("Implicit SELECT with set operations", () => {
    it("should parse bare table UNION bare table", () => {
      const result = parseToAst("sensor_1 UNION sensor_2");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.setOperations).toHaveLength(1);
      expect(stmt.setOperations[0].operator).toBe("UNION");
    });

    it("should parse bare table UNION ALL bare table", () => {
      const result = parseToAst("sensor_1 UNION ALL sensor_2");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.setOperations[0].operator).toBe("UNION");
      expect(stmt.setOperations[0].all).toBe(true);
    });

    it("should parse bare table EXCEPT bare table", () => {
      const result = parseToAst("sensor_1 EXCEPT sensor_2");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.setOperations[0].operator).toBe("EXCEPT");
    });

    it("should parse bare table EXCEPT ALL bare table", () => {
      const result = parseToAst("sensor_1 EXCEPT ALL sensor_2");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.setOperations[0].operator).toBe("EXCEPT");
      expect(stmt.setOperations[0].all).toBe(true);
    });

    it("should parse bare table INTERSECT bare table", () => {
      const result = parseToAst("sensor_1 INTERSECT sensor_2");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.setOperations[0].operator).toBe("INTERSECT");
    });

    it("should parse chained set operations: UNION then EXCEPT", () => {
      const result = parseToAst("query_1 UNION query_2 EXCEPT query_3");
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.setOperations).toHaveLength(2);
      expect(stmt.setOperations[0].operator).toBe("UNION");
      expect(stmt.setOperations[1].operator).toBe("EXCEPT");
    });

    it("should parse bare table with WHERE then UNION", () => {
      const result = parseToAst(
        "sensor_1 WHERE ID > 10 UNION sensor_2"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.where).toBeDefined();
      expect(stmt.setOperations).toHaveLength(1);
    });

    it("should parse parenthesized union: (t1 UNION t2) EXCEPT t3", () => {
      const result = parseToAst("(query_1 UNION query_2) EXCEPT query_3");
      expect(result.errors).toHaveLength(0);
    });

    it("should parse parenthesized union with LIMIT", () => {
      const result = parseToAst("(query_1 UNION query_2)\nLIMIT 3");
      expect(result.errors).toHaveLength(0);
    });

    it("should parse UNION with full SELECT on right side", () => {
      const result = parseToAst(
        "sensor_1 UNION SELECT * FROM sensor_2 WHERE id > 5"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.setOperations[0].select.type).toBe("select");
      expect(stmt.setOperations[0].select.where).toBeDefined();
    });
  });

  describe("Incomplete implicit SELECT produces partial AST", () => {
    it("should produce AST for incomplete 'table WHERE'", () => {
      const result = parseToAst("core_price WHERE ");
      // Should produce a partial AST even though the query is incomplete
      expect(result.ast.length).toBeGreaterThan(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.implicit).toBe(true);
    });

    it("should produce AST with table reference for incomplete implicit select", () => {
      const result = parseToAst("trades WHERE price > ");
      expect(result.ast.length).toBeGreaterThan(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.implicit).toBe(true);
    });

    it("should produce AST for bare table name only", () => {
      const result = parseToAst("trades");
      expect(result.ast.length).toBeGreaterThan(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.implicit).toBe(true);
    });

    it("should produce AST for incomplete implicit select after semicolon", () => {
      const result = parseToAst("SELECT 1; core_price WHERE ");
      expect(result.ast.length).toBeGreaterThan(0);
      // First statement is complete SELECT
      expect(result.ast[0].type).toBe("select");
    });
  });

  describe("Parenthesized SHOW as table source", () => {
    it("should parse (SHOW PARAMETERS) WHERE ...", () => {
      const result = parseToAst(
        "(SHOW PARAMETERS) WHERE reloadable = true"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("select");
      expect(stmt.where).toBeDefined();
      // The from source is a SHOW statement
      expect(stmt.from[0].table.type).toBe("show");
      expect(stmt.from[0].table.showType).toBe("parameters");
    });

    it("should parse (SHOW PARAMETERS) WHERE with complex filter", () => {
      const result = parseToAst(
        "(SHOW PARAMETERS) WHERE value_source <> 'default'"
      );
      expect(result.errors).toHaveLength(0);
    });

    it("should parse (SHOW PARAMETERS) WHERE ... ORDER BY", () => {
      const result = parseToAst(
        "(SHOW PARAMETERS) WHERE property_path NOT IN ('cairo.root', 'cairo.sql.backup.root') ORDER BY 1"
      );
      expect(result.errors).toHaveLength(0);
    });

    it("should parse (SHOW PARAMETERS) WHERE with ILIKE", () => {
      const result = parseToAst(
        "(SHOW PARAMETERS) WHERE value ILIKE '%tmp%'"
      );
      expect(result.errors).toHaveLength(0);
    });

    it("should round-trip (SHOW PARAMETERS) in toSql", () => {
      const result = parseToAst("(SHOW PARAMETERS) WHERE reloadable = true");
      expect(result.errors).toHaveLength(0);
      const sql = toSql(result.ast[0]);
      expect(sql).toContain("(SHOW PARAMETERS)");
      expect(sql).toContain("WHERE");
    });
  });

  describe("Decimal duration literals", () => {
    it("should parse generate_series with decimal durations", () => {
      const result = parseToAst("generate_series(3d, -3d, -1.5d)");
      expect(result.errors).toHaveLength(0);
    });

    it("should parse 1.5d as a duration literal", () => {
      const result = parseToAst("SELECT * FROM trades SAMPLE BY 1.5h");
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("Unicode identifiers", () => {
    it("should parse CREATE VIEW with Japanese identifier", () => {
      const result = parseToAst(
        "CREATE VIEW 日本語ビュー AS (SELECT * FROM trades)"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createView");
      expect(stmt.view.parts[0]).toBe("日本語ビュー");
    });

    it("should parse CREATE VIEW with accented Latin identifier", () => {
      const result = parseToAst(
        "CREATE VIEW Részvény_árak AS (SELECT * FROM prices)"
      );
      expect(result.errors).toHaveLength(0);
      const stmt = result.ast[0] as any;
      expect(stmt.type).toBe("createView");
      expect(stmt.view.parts[0]).toBe("Részvény_árak");
    });

    it("should parse SELECT with Unicode table name", () => {
      const result = parseToAst("SELECT * FROM café");
      expect(result.errors).toHaveLength(0);
    });

    it("should still parse ASCII identifiers", () => {
      const result = parseToAst("SELECT * FROM trades");
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("subquery as function argument", () => {
    it("should parse touch(SELECT ...)", () => {
      const result = parseToAst(
        "SELECT touch(SELECT * FROM x WHERE k IN '1970-01-22')"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast).toHaveLength(1);
    });
  });

  describe("structural pattern coverage", () => {
    // select[from,where,window]
    it("should parse SELECT with WHERE and window function", () => {
      const result = parseToAst(
        "SELECT timestamp, price, LAG(price, 1) OVER () AS prev FROM trades WHERE symbol = 'BTC'"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,limit]
    it("should parse SELECT with LIMIT", () => {
      const result = parseToAst("SELECT * FROM trades LIMIT 10");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,groupBy]
    it("should parse SELECT with GROUP BY", () => {
      const result = parseToAst(
        "SELECT symbol, count(*) FROM trades GROUP BY symbol"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,limit]
    it("should parse SELECT with WHERE and LIMIT", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE symbol = 'BTC' LIMIT -10"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,sampleBy]
    it("should parse SELECT with WHERE and SAMPLE BY", () => {
      const result = parseToAst(
        "SELECT timestamp, symbol, first(price) AS open, last(price) AS close FROM trades WHERE symbol = 'BTC' SAMPLE BY 1h"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,with]
    it("should parse SELECT with CTE", () => {
      const result = parseToAst(
        "WITH recent AS (SELECT * FROM trades WHERE timestamp > dateadd('d', -1, now())) SELECT * FROM recent"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,orderBy]
    it("should parse SELECT with ORDER BY", () => {
      const result = parseToAst(
        "SELECT timestamp, symbol, price FROM trades ORDER BY timestamp"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,latestOn]
    it("should parse SELECT with WHERE and LATEST ON", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE timestamp IN '2024-01-01' LATEST ON timestamp PARTITION BY symbol"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // copyTo
    it("should parse COPY TO", () => {
      const result = parseToAst(
        "COPY (SELECT * FROM trades LIMIT 3) TO 'trades_export' WITH FORMAT PARQUET"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("copyTo");
    });

    // select[from,where,limit,window]
    it("should parse SELECT with WHERE, LIMIT and window function", () => {
      const result = parseToAst(
        "SELECT timestamp, lag(timestamp) OVER (ORDER BY timestamp) AS prev FROM trades WHERE symbol = 'BTC' LIMIT 10"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // alterServiceAccount
    it("should parse ALTER SERVICE ACCOUNT", () => {
      const result = parseToAst(
        "ALTER SERVICE ACCOUNT ingest_ilp CREATE TOKEN TYPE REST WITH TTL '3000d' REFRESH"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterServiceAccount");
    });

    // select[from,orderBy,with]
    it("should parse SELECT with ORDER BY and CTE", () => {
      const result = parseToAst(
        "WITH totals AS (SELECT symbol, count() AS total FROM trades) SELECT symbol, total FROM totals ORDER BY total DESC"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // createTable[timestamp,partitionBy,asSelect]
    it("should parse CREATE TABLE AS SELECT with TIMESTAMP and PARTITION BY", () => {
      const result = parseToAst(
        "CREATE TABLE trades_copy AS (SELECT * FROM trades WHERE price > 100) TIMESTAMP(timestamp) PARTITION BY DAY"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createTable");
    });

    // createTable[timestamp,asSelect]
    it("should parse CREATE TABLE AS SELECT with TIMESTAMP", () => {
      const result = parseToAst(
        "CREATE TABLE test AS (SELECT timestamp_sequence('2024-01-01', 100000L) AS ts, rnd_int(1, 100, 0) AS val) TIMESTAMP(ts)"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createTable");
    });

    // select[from,where,groupBy]
    it("should parse SELECT with WHERE and GROUP BY", () => {
      const result = parseToAst(
        "SELECT symbol, count(*) AS cnt FROM trades WHERE price > 100 GROUP BY symbol"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // insert[select]
    it("should parse INSERT INTO ... SELECT", () => {
      const result = parseToAst(
        "INSERT INTO trades_archive SELECT * FROM trades WHERE timestamp < dateadd('M', -1, now())"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("insert");
    });

    // select[from,groupBy,orderBy,with]
    it("should parse SELECT with GROUP BY, ORDER BY and CTE", () => {
      const result = parseToAst(
        "WITH raw AS (SELECT price, amount FROM trades WHERE symbol = 'BTC') SELECT floor(price) AS bucket, count(*) AS cnt FROM raw GROUP BY bucket ORDER BY bucket"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // copyCancel
    it("should parse COPY CANCEL", () => {
      const result = parseToAst("COPY '12345678' CANCEL");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("copyCancel");
    });

    // select[from,where,orderBy,limit]
    it("should parse SELECT with WHERE, ORDER BY and LIMIT", () => {
      const result = parseToAst(
        "SELECT * FROM trades WHERE symbol = 'BTC' ORDER BY timestamp DESC LIMIT 100"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,window,with]
    it("should parse SELECT with window function and CTE", () => {
      const result = parseToAst(
        "WITH sampled AS (SELECT timestamp, symbol, price FROM trades SAMPLE BY 1h) SELECT timestamp, symbol, AVG(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 5 PRECEDING) AS avg5 FROM sampled"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // update[from,where]
    it("should parse UPDATE with FROM and WHERE", () => {
      const result = parseToAst(
        "UPDATE spreads s SET spread = p.ask - p.bid FROM prices p WHERE s.symbol = p.symbol"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("update");
    });

    // alterGroup
    it("should parse ALTER GROUP", () => {
      const result = parseToAst(
        "ALTER GROUP analysts WITH EXTERNAL ALIAS 'CN=Analysts,OU=Groups,DC=corp,DC=com'"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterGroup");
    });

    // select[from,where,groupBy,orderBy]
    it("should parse SELECT with WHERE, GROUP BY and ORDER BY", () => {
      const result = parseToAst(
        "SELECT symbol, count(*) AS cnt FROM trades WHERE price > 50 GROUP BY symbol ORDER BY cnt DESC"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,orderBy,sampleBy]
    it("should parse SELECT with WHERE, ORDER BY and SAMPLE BY", () => {
      const result = parseToAst(
        "SELECT timestamp, count(*) AS cnt FROM trades WHERE symbol = 'BTC' SAMPLE BY 1h ORDER BY cnt DESC"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,limit,sampleBy]
    it("should parse SELECT with WHERE, LIMIT and SAMPLE BY", () => {
      const result = parseToAst(
        "SELECT timestamp, symbol, SUM(amount) AS total FROM trades WHERE timestamp IN '2024-01-01' SAMPLE BY 1m LIMIT 20"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // backup
    it("should parse BACKUP DATABASE", () => {
      const result = parseToAst("BACKUP DATABASE");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("backup");
    });

    it("should parse BACKUP TABLE", () => {
      const result = parseToAst("BACKUP TABLE trades");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("backup");
    });

    // select[from,groupBy,with]
    it("should parse SELECT with GROUP BY and CTE", () => {
      const result = parseToAst(
        "WITH filtered AS (SELECT * FROM trades WHERE price > 0) SELECT symbol, avg(price) AS avg_price FROM filtered GROUP BY symbol"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,orderBy,limit]
    it("should parse SELECT with ORDER BY and LIMIT", () => {
      const result = parseToAst(
        "SELECT status, progress_percent FROM backups() ORDER BY start_ts DESC LIMIT 1"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,distinct]
    it("should parse SELECT DISTINCT", () => {
      const result = parseToAst("SELECT DISTINCT symbol FROM trades");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,sampleBy,with]
    it("should parse SELECT with WHERE, SAMPLE BY and CTE", () => {
      const result = parseToAst(
        "WITH moving AS (SELECT timestamp, symbol, price, avg(price) OVER (PARTITION BY symbol ORDER BY timestamp ROWS 10 PRECEDING) AS ma FROM trades) SELECT * FROM moving WHERE symbol = 'BTC' SAMPLE BY 1h"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,groupBy,with]
    it("should parse SELECT with WHERE, GROUP BY and CTE", () => {
      const result = parseToAst(
        "WITH ranked AS (SELECT timestamp, symbol, price, row_number() OVER (PARTITION BY symbol ORDER BY timestamp DESC) AS rn FROM trades) SELECT symbol, price FROM ranked WHERE rn = 1 GROUP BY symbol, price"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,with]
    it("should parse SELECT with WHERE and CTE", () => {
      const result = parseToAst(
        "WITH prev AS (SELECT *, lag(price) OVER (ORDER BY timestamp) AS prev_price FROM trades) SELECT * FROM prev WHERE price > prev_price"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,groupBy,orderBy,with]
    it("should parse SELECT with WHERE, GROUP BY, ORDER BY and CTE", () => {
      const result = parseToAst(
        "WITH prev AS (SELECT *, lag(price) OVER (ORDER BY timestamp) AS prev_price FROM trades) SELECT symbol, count(*) AS cnt FROM prev WHERE price > prev_price GROUP BY symbol ORDER BY cnt DESC"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,orderBy,with]
    it("should parse SELECT with WHERE, ORDER BY and CTE", () => {
      const result = parseToAst(
        "WITH daily AS (SELECT timestamp, first(price) AS open, last(price) AS close FROM trades SAMPLE BY 1d) SELECT * FROM daily WHERE close > open ORDER BY timestamp"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,limit,with]
    it("should parse SELECT with LIMIT and CTE", () => {
      const result = parseToAst(
        "WITH stats AS (SELECT timestamp, price, AVG(price) OVER (ORDER BY timestamp ROWS 5 PRECEDING) AS ma FROM trades) SELECT * FROM stats LIMIT 100"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,orderBy,window,with]
    it("should parse SELECT with ORDER BY, window function and CTE", () => {
      const result = parseToAst(
        "WITH ohlc AS (SELECT timestamp, first(price) AS open, max(price) AS high, min(price) AS low, last(price) AS close FROM trades SAMPLE BY 1d) SELECT timestamp, close, AVG(close) OVER (ORDER BY timestamp ROWS 20 PRECEDING) AS sma20 FROM ohlc ORDER BY timestamp"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // select[from,where,distinct]
    it("should parse SELECT DISTINCT with WHERE", () => {
      const result = parseToAst(
        "SELECT DISTINCT symbol, count() FROM trades WHERE price > 3"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });
  });

  describe("railroad/syntax doc coverage", () => {
    // ALTER TABLE sub-operations
    it("should parse ALTER TABLE ATTACH PARTITION LIST", () => {
      const result = parseToAst(
        "ALTER TABLE trades ATTACH PARTITION LIST '2023-01-01', '2023-01-02'"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE DETACH PARTITION LIST", () => {
      const result = parseToAst(
        "ALTER TABLE trades DETACH PARTITION LIST '2023-01-01'"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE DETACH PARTITION WHERE", () => {
      const result = parseToAst(
        "ALTER TABLE trades DETACH PARTITION WHERE ts > '2023-01-01'"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE SET PARAM maxUncommittedRows", () => {
      const result = parseToAst(
        "ALTER TABLE trades SET PARAM maxUncommittedRows = 10000"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE SET TYPE WAL", () => {
      const result = parseToAst("ALTER TABLE trades SET TYPE WAL");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE SET TYPE BYPASS WAL", () => {
      const result = parseToAst("ALTER TABLE trades SET TYPE BYPASS WAL");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE DEDUP ENABLE UPSERT KEYS", () => {
      const result = parseToAst(
        "ALTER TABLE trades DEDUP ENABLE UPSERT KEYS(ts, symbol)"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE DEDUP DISABLE", () => {
      const result = parseToAst("ALTER TABLE trades DEDUP DISABLE");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE RESUME WAL", () => {
      const result = parseToAst("ALTER TABLE trades RESUME WAL");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE RESUME WAL FROM TXN", () => {
      const result = parseToAst("ALTER TABLE trades RESUME WAL FROM TXN 123");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE ALTER COLUMN NOCACHE", () => {
      const result = parseToAst(
        "ALTER TABLE trades ALTER COLUMN symbol NOCACHE"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    it("should parse ALTER TABLE ALTER COLUMN CACHE", () => {
      const result = parseToAst(
        "ALTER TABLE trades ALTER COLUMN symbol CACHE"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterTable");
    });

    // INSERT extensions
    it("should parse INSERT BATCH", () => {
      const result = parseToAst("INSERT BATCH 100 INTO trades VALUES (1, 'BTC', 50000)");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("insert");
    });

    it("should parse INSERT ATOMIC", () => {
      const result = parseToAst("INSERT ATOMIC INTO trades VALUES (1, 'BTC', 50000)");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("insert");
    });

    it("should parse CREATE BATCH TABLE", () => {
      const result = parseToAst(
        "CREATE BATCH 4096 TABLE new_trades AS (SELECT * FROM trades) TIMESTAMP(ts)"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("createTable");
    });

    it("should parse WITH ... INSERT INTO ... SELECT (CTE insert)", () => {
      const result = parseToAst(
        "WITH cte AS (SELECT * FROM trades WHERE price > 100) INSERT INTO archive SELECT * FROM cte"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("insert");
    });

    // COPY FROM with options
    it("should parse COPY FROM with options", () => {
      const result = parseToAst(
        "COPY weather FROM '/tmp/weather.csv' WITH HEADER true TIMESTAMP ts FORMAT csv PARTITION BY DAY ON ERROR SKIP_ROW"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("copyFrom");
    });

    // BACKUP ABORT
    it("should parse BACKUP ABORT", () => {
      const result = parseToAst("BACKUP ABORT");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("backup");
    });

    // GRANT with options
    it("should parse GRANT WITH GRANT OPTION", () => {
      const result = parseToAst(
        "GRANT SELECT ON trades TO analyst WITH GRANT OPTION"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("grant");
    });

    it("should parse GRANT WITH VERIFICATION", () => {
      const result = parseToAst(
        "GRANT SELECT ON trades TO analyst WITH VERIFICATION"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("grant");
    });

    // LIMIT with two arguments
    it("should parse LIMIT with two arguments", () => {
      const result = parseToAst("SELECT * FROM trades LIMIT 5, 10");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // Window function extensions
    it("should parse CUMULATIVE window frame", () => {
      const result = parseToAst(
        "SELECT sum(amount) OVER (ORDER BY ts CUMULATIVE) AS running_total FROM trades"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse EXCLUDE CURRENT ROW", () => {
      const result = parseToAst(
        "SELECT sum(price) OVER (ORDER BY ts ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW EXCLUDE CURRENT ROW) FROM trades"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse IGNORE NULLS in window function", () => {
      const result = parseToAst(
        "SELECT first_value(price) IGNORE NULLS OVER (ORDER BY ts) FROM trades"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // WINDOW JOIN extensions
    it("should parse WINDOW JOIN with EXCLUDE PREVAILING", () => {
      const result = parseToAst(
        "SELECT * FROM trades t WINDOW JOIN prices p ON (t.sym = p.sym) RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING EXCLUDE PREVAILING"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    it("should parse WINDOW JOIN with INCLUDE PREVAILING", () => {
      const result = parseToAst(
        "SELECT * FROM trades t WINDOW JOIN prices p ON (t.sym = p.sym) RANGE BETWEEN 1 minute PRECEDING AND 1 minute FOLLOWING INCLUDE PREVAILING"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("select");
    });

    // Materialized View operations
    it("should parse REFRESH MATERIALIZED VIEW RANGE", () => {
      const result = parseToAst(
        "REFRESH MATERIALIZED VIEW mv RANGE FROM '2024-01-01' TO '2024-02-01'"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("refreshMaterializedView");
    });

    it("should parse ALTER MATERIALIZED VIEW SET REFRESH EVERY", () => {
      const result = parseToAst(
        "ALTER MATERIALIZED VIEW mv SET REFRESH EVERY 1h"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterMaterializedView");
    });

    it("should parse ALTER MATERIALIZED VIEW SET REFRESH LIMIT", () => {
      const result = parseToAst(
        "ALTER MATERIALIZED VIEW mv SET REFRESH LIMIT 30 DAYS"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterMaterializedView");
    });

    it("should parse ALTER MATERIALIZED VIEW ALTER COLUMN DROP INDEX", () => {
      const result = parseToAst(
        "ALTER MATERIALIZED VIEW mv ALTER COLUMN sym DROP INDEX"
      );
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterMaterializedView");
    });

    it("should parse ALTER MATERIALIZED VIEW RESUME WAL", () => {
      const result = parseToAst("ALTER MATERIALIZED VIEW mv RESUME WAL");
      expect(result.errors).toHaveLength(0);
      expect(result.ast[0].type).toBe("alterMaterializedView");
    });

    // COMPILE VIEW
    it("should parse COMPILE VIEW", () => {
      const result = parseToAst("COMPILE VIEW my_view");
      expect(result.errors).toHaveLength(0);
    });
  });
});
