// =============================================================================
// CST to AST Visitor
// =============================================================================

import { CstNode, IToken } from "chevrotain";
import { parser } from "./parser";
import * as AST from "./ast";

// Get the base visitor class from the parser
const BaseVisitor = parser.getBaseCstVisitorConstructor();

class QuestDBVisitor extends BaseVisitor {
  constructor() {
    super();
    this.validateVisitor();
  }

  // Helper to extract token image
  private tokenImage(token: IToken | undefined): string {
    return token?.image ?? "";
  }

  // ==========================================================================
  // Entry Points
  // ==========================================================================

  statements(ctx: any): AST.Statement[] {
    if (!ctx.statement) return [];
    return ctx.statement.map((s: CstNode) => this.visit(s));
  }

  statement(ctx: any): AST.Statement {
    if (ctx.selectStatement) {
      return this.visit(ctx.selectStatement);
    }
    if (ctx.insertStatement) {
      return this.visit(ctx.insertStatement);
    }
    if (ctx.updateStatement) {
      return this.visit(ctx.updateStatement);
    }
    if (ctx.createStatement) {
      return this.visit(ctx.createStatement);
    }
    if (ctx.dropStatement) {
      return this.visit(ctx.dropStatement);
    }
    if (ctx.truncateTableStatement) {
      return this.visit(ctx.truncateTableStatement);
    }
    if (ctx.renameTableStatement) {
      return this.visit(ctx.renameTableStatement);
    }
    if (ctx.addUserStatement) {
      return this.visit(ctx.addUserStatement);
    }
    if (ctx.removeUserStatement) {
      return this.visit(ctx.removeUserStatement);
    }
    if (ctx.assumeServiceAccountStatement) {
      return this.visit(ctx.assumeServiceAccountStatement);
    }
    if (ctx.exitServiceAccountStatement) {
      return this.visit(ctx.exitServiceAccountStatement);
    }
    if (ctx.cancelQueryStatement) {
      return this.visit(ctx.cancelQueryStatement);
    }
    if (ctx.showStatement) {
      return this.visit(ctx.showStatement);
    }
    if (ctx.explainStatement) {
      return this.visit(ctx.explainStatement);
    }
    if (ctx.alterStatement) {
      return this.visit(ctx.alterStatement);
    }
    if (ctx.copyStatement) {
      return this.visit(ctx.copyStatement);
    }
    if (ctx.checkpointStatement) {
      return this.visit(ctx.checkpointStatement);
    }
    if (ctx.snapshotStatement) {
      return this.visit(ctx.snapshotStatement);
    }
    if (ctx.grantStatement) {
      return this.visit(ctx.grantStatement);
    }
    if (ctx.revokeStatement) {
      return this.visit(ctx.revokeStatement);
    }
    if (ctx.grantAssumeServiceAccountStatement) {
      return this.visit(ctx.grantAssumeServiceAccountStatement);
    }
    if (ctx.revokeAssumeServiceAccountStatement) {
      return this.visit(ctx.revokeAssumeServiceAccountStatement);
    }
    if (ctx.vacuumTableStatement) {
      return this.visit(ctx.vacuumTableStatement);
    }
    if (ctx.resumeWalStatement) {
      return this.visit(ctx.resumeWalStatement);
    }
    if (ctx.setTypeStatement) {
      return this.visit(ctx.setTypeStatement);
    }
    if (ctx.reindexTableStatement) {
      return this.visit(ctx.reindexTableStatement);
    }
    if (ctx.refreshMaterializedViewStatement) {
      return this.visit(ctx.refreshMaterializedViewStatement);
    }
    if (ctx.pivotStatement) {
      return this.visit(ctx.pivotStatement);
    }
    if (ctx.backupStatement) {
      return this.visit(ctx.backupStatement);
    }
    if (ctx.compileViewStatement) {
      return this.visit(ctx.compileViewStatement);
    }
    if (ctx.implicitSelectStatement) {
      return this.visit(ctx.implicitSelectStatement);
    }
    throw new Error("Unknown statement type");
  }

  // ==========================================================================
  // SELECT Statement
  // ==========================================================================

  selectStatement(ctx: any): AST.SelectStatement {
    const result = this.visit(ctx.simpleSelect) as AST.SelectStatement;

    if (ctx.declareClause) {
      result.declare = this.visit(ctx.declareClause);
    }

    if (ctx.withClause) {
      result.with = this.visit(ctx.withClause);
    }

    if (ctx.setOperation && ctx.setOperation.length > 0) {
      result.setOperations = ctx.setOperation.map((op: CstNode) => this.visit(op));
    }

    return result;
  }

  withClause(ctx: any): AST.CTE[] {
    return ctx.cteDefinition.map((cte: CstNode) => this.visit(cte));
  }

  cteDefinition(ctx: any): AST.CTE {
    const query = ctx.selectStatement
      ? this.visit(ctx.selectStatement)
      : this.visit(ctx.implicitSelectStatement);
    return {
      type: "cte",
      name: this.extractIdentifierName(ctx.identifier[0].children),
      query,
    };
  }

  simpleSelect(ctx: any): AST.SelectStatement {
    const result: AST.SelectStatement = {
      type: "select",
      columns: this.visit(ctx.selectList),
    };

    if (ctx.Distinct) {
      result.distinct = true;
    }

    if (ctx.fromClause) {
      result.from = this.visit(ctx.fromClause);
    }

    if (ctx.whereClause) {
      result.where = this.visit(ctx.whereClause);
    }

    if (ctx.sampleByClause) {
      result.sampleBy = this.visit(ctx.sampleByClause);
    }

    if (ctx.latestOnClause) {
      result.latestOn = this.visit(ctx.latestOnClause);
    }

    if (ctx.groupByClause) {
      result.groupBy = this.visit(ctx.groupByClause);
    }

    if (ctx.pivotBody) {
      const body = this.visit(ctx.pivotBody);
      result.pivot = {
        type: "pivotClause",
        aggregations: body.aggregations,
        pivots: body.pivots,
        groupBy: body.groupBy,
      };
    }

    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause);
    }

    if (ctx.limitClause) {
      result.limit = this.visit(ctx.limitClause);
    }

    return result;
  }

  setOperation(ctx: any): AST.SetOperation {
    let operator: "UNION" | "EXCEPT" | "INTERSECT" = "UNION";
    if (ctx.Union) operator = "UNION";
    else if (ctx.Except) operator = "EXCEPT";
    else if (ctx.Intersect) operator = "INTERSECT";

    const select = ctx.simpleSelect
      ? this.visit(ctx.simpleSelect)
      : this.visit(ctx.implicitSelectBody);

    const result: AST.SetOperation = {
      type: "setOperation",
      operator,
      select,
    };

    if (ctx.All) {
      result.all = true;
    }

    return result;
  }

  selectList(ctx: any): AST.SelectItem[] {
    if (ctx.Star) {
      const items: AST.SelectItem[] = [{ type: "star" }];
      // Additional items after *: SELECT *, rank() OVER () ...
      const extraItems = ctx.selectItem || ctx.selectItem1 || [];
      for (const item of extraItems) {
        items.push(this.visit(item));
      }
      return items;
    }
    // Collect from all SUBRULE occurrences
    const items: AST.SelectItem[] = [];
    for (const key of ["selectItem", "selectItem1", "selectItem2"]) {
      if (ctx[key]) {
        for (const item of ctx[key]) {
          items.push(this.visit(item));
        }
      }
    }
    return items.length > 0 ? items : [];
  }

  selectItem(ctx: any): AST.SelectItem {
    if (ctx.qualifiedStar) {
      const result: AST.QualifiedStarSelectItem = {
        type: "qualifiedStar",
        qualifier: this.visit(ctx.qualifiedStar),
      };
      if (ctx.identifier) {
        result.alias = this.visit(ctx.identifier).parts[0];
      }
      return result;
    }

    const result: AST.ExpressionSelectItem = {
      type: "selectItem",
      expression: this.visit(ctx.expression),
    };

    if (ctx.identifier) {
      result.alias = this.visit(ctx.identifier).parts[0];
    }

    return result;
  }

  qualifiedStar(ctx: any): AST.QualifiedName {
    const parts: string[] = ctx.identifier.map((id: CstNode) =>
      this.extractIdentifierName(id.children)
    );
    return {
      type: "qualifiedName",
      parts,
    };
  }

  // ==========================================================================
  // FROM Clause
  // ==========================================================================

  fromClause(ctx: any): AST.TableRef[] {
    const tables: AST.TableRef[] = [];

    if (ctx.tableRef) {
      // Handle all table refs (first one and any comma-separated ones)
      for (let i = 0; i < ctx.tableRef.length; i++) {
        const table = this.visit(ctx.tableRef[i]);
        tables.push(table);
      }

      // Attach joins to the first table (legacy behavior)
      if (ctx.joinClause && tables.length > 0) {
        tables[0].joins = ctx.joinClause.map((j: CstNode) => this.visit(j));
      }
    }

    return tables;
  }

  implicitSelectBody(ctx: any): AST.SelectStatement {
    const result: AST.SelectStatement = {
      type: "select",
      implicit: true,
      columns: [{ type: "star" } as AST.SelectItem],
    };
    if (ctx.fromClause) {
      result.from = this.visitSafe(ctx.fromClause);
    }
    if (ctx.whereClause) {
      result.where = this.visitSafe(ctx.whereClause);
    }
    if (ctx.sampleByClause) {
      result.sampleBy = this.visitSafe(ctx.sampleByClause);
    }
    if (ctx.latestOnClause) {
      result.latestOn = this.visitSafe(ctx.latestOnClause);
    }
    if (ctx.groupByClause) {
      result.groupBy = this.visitSafe(ctx.groupByClause);
    }
    if (ctx.orderByClause) {
      result.orderBy = this.visitSafe(ctx.orderByClause);
    }
    if (ctx.limitClause) {
      result.limit = this.visitSafe(ctx.limitClause);
    }
    return result;
  }

  implicitSelectStatement(ctx: any): AST.SelectStatement {
    const result = this.visit(ctx.implicitSelectBody) as AST.SelectStatement;
    if (ctx.setOperation && ctx.setOperation.length > 0) {
      result.setOperations = ctx.setOperation.map((op: CstNode) =>
        this.visit(op)
      );
    }
    return result;
  }

  tableRef(ctx: any): AST.TableRef {
    let table: AST.TableRef["table"];
    if (ctx.selectStatement) {
      table = this.visit(ctx.selectStatement);
    } else if (ctx.showStatement) {
      table = this.visit(ctx.showStatement);
    } else if (ctx.implicitSelectStatement) {
      table = this.visit(ctx.implicitSelectStatement);
    } else if (ctx.tableFunctionCall) {
      table = this.visit(ctx.tableFunctionCall);
    } else if (ctx.VariableReference) {
      // @variable as table source (DECLARE variable reference)
      const varImage = ctx.VariableReference[0].image; // e.g. "@subquery"
      table = { type: "qualifiedName", parts: [varImage] } as AST.QualifiedName;
    } else if (ctx.StringLiteral) {
      // Single-quoted table name: FROM 'sys.copy_export_log'
      table = { type: "qualifiedName", parts: [ctx.StringLiteral[0].image.slice(1, -1)] } as AST.QualifiedName;
    } else {
      table = this.visit(ctx.qualifiedName);
    }

    const result: AST.TableRef = {
      type: "tableRef",
      table,
    };

    if (ctx.identifier) {
      result.alias = this.visit(ctx.identifier).parts[0];
    }

    if (ctx.columnRef) {
      const colRef = this.visit(ctx.columnRef);
      result.timestampDesignation = colRef.name?.parts
        ? colRef.name.parts.join(".")
        : colRef.parts
          ? colRef.parts.join(".")
          : String(colRef);
    }

    return result;
  }

  tableFunctionCall(ctx: any): AST.TableFunctionCall {
    let name: string;
    if (ctx.tableFunctionName) {
      const fnName = ctx.tableFunctionName[0];
      if (fnName.children?.identifier) {
        const id = this.visit(fnName.children.identifier);
        name = id.parts ? id.parts.join(".") : String(id);
      } else if (fnName.children?.Tables) {
        name = "tables";
      } else {
        name = "unknown";
      }
    } else {
      name = "unknown";
    }

    const args: AST.Expression[] = [];
    if (ctx.expression) {
      for (const expr of ctx.expression) {
        args.push(this.visit(expr));
      }
    }

    return {
      type: "tableFunctionCall",
      name,
      args,
    };
  }

  tableFunctionName(_ctx: any): any {
    // Handled inline by tableFunctionCall
    return undefined;
  }

  joinClause(ctx: any): AST.JoinClause {
    const result: AST.JoinClause = {
      type: "join",
      table: this.visit(ctx.tableRef),
    };

    // Determine join type
    if (ctx.Inner) result.joinType = "inner";
    else if (ctx.Left) result.joinType = "left";
    else if (ctx.Right) result.joinType = "right";
    else if (ctx.Full) result.joinType = "full";
    else if (ctx.Cross) result.joinType = "cross";
    else if (ctx.Asof) result.joinType = "asof";
    else if (ctx.Lt) result.joinType = "lt";
    else if (ctx.Splice) result.joinType = "splice";
    else if (ctx.Window) result.joinType = "window";

    if (ctx.Outer) {
      result.outer = true;
    }

    if (ctx.expression) {
      result.on = this.visit(ctx.expression);
    }

    // Handle TOLERANCE clause for ASOF/LT joins
    if (ctx.DurationLiteral) {
      result.tolerance = ctx.DurationLiteral[0].image;
    }

    // Handle RANGE BETWEEN clause for WINDOW JOIN
    if (ctx.windowJoinBound && ctx.windowJoinBound.length >= 2) {
      result.range = {
        start: this.visit(ctx.windowJoinBound[0]),
        end: this.visit(ctx.windowJoinBound[1]),
      };
    }

    // Handle INCLUDE/EXCLUDE PREVAILING clause for WINDOW JOIN
    if (ctx.Prevailing) {
      result.prevailing = ctx.Include ? "include" : "exclude";
    }

    return result;
  }

  windowJoinBound(ctx: any): AST.WindowJoinBound {
    const result: AST.WindowJoinBound = {
      type: "windowJoinBound",
      boundType: ctx.Current ? "currentRow" : "duration",
      direction: ctx.Preceding ? "preceding" : "following",
    };
    if (ctx.durationExpression) {
      result.duration = this.visit(ctx.durationExpression);
    }
    return result;
  }

  durationExpression(ctx: any): string {
    if (ctx.DurationLiteral) {
      return ctx.DurationLiteral[0].image;
    }
    // NumberLiteral/StringLiteral + timeUnit
    const num = ctx.NumberLiteral?.[0]?.image ?? ctx.StringLiteral?.[0]?.image ?? "0";
    const unit = this.visit(ctx.timeUnit);
    return `${num} ${unit}`;
  }

  // ==========================================================================
  // WHERE Clause
  // ==========================================================================

  whereClause(ctx: any): AST.Expression {
    return this.visit(ctx.expression);
  }

  // ==========================================================================
  // QuestDB-specific Clauses
  // ==========================================================================

  sampleByClause(ctx: any): AST.SampleByClause {
    const result: AST.SampleByClause = {
      type: "sampleBy",
      duration: ctx.DurationLiteral
        ? this.tokenImage(ctx.DurationLiteral[0])
        : this.tokenImage(ctx.VariableReference[0]),
    };
    if (ctx.fillClause) {
      result.fill = this.visit(ctx.fillClause);
    }
    if (ctx.alignToClause) {
      result.alignTo = this.visit(ctx.alignToClause);
    }
    if (ctx.fromToClause) {
      const fromTo = this.visit(ctx.fromToClause);
      result.from = fromTo.from;
      result.to = fromTo.to;
    }
    return result;
  }

  fillClause(ctx: any): string[] {
    return ctx.fillValue.map((v: CstNode) => this.visit(v));
  }

  fillValue(ctx: any): string {
    if (ctx.None) return "NONE";
    if (ctx.Null) return "NULL";
    if (ctx.NumberLiteral) return this.tokenImage(ctx.NumberLiteral[0]);
    if (ctx.identifier) {
      const name = this.extractIdentifierName(ctx.identifier[0].children);
      return name.toUpperCase();
    }
    return "";
  }

  alignToClause(ctx: any): AST.AlignToClause {
    const result: AST.AlignToClause = {
      type: "alignTo",
      mode: ctx.Calendar ? "calendar" : "firstObservation",
    };
    if (ctx.Zone && ctx.timeZoneValue) {
      result.timeZone = this.extractMaybeString(ctx.timeZoneValue[0]);
    }
    if (ctx.Offset && ctx.stringOrIdentifier) {
      result.offset = this.extractMaybeString(ctx.stringOrIdentifier[0]);
    }
    return result;
  }

  fromToClause(ctx: any): { from?: AST.Expression; to?: AST.Expression } {
    const expressions = ctx.expression?.map((e: CstNode) => this.visit(e)) ?? [];
    if (ctx.From) {
      return { from: expressions[0], to: expressions[1] };
    }
    return { to: expressions[0] };
  }

  latestOnClause(ctx: any): AST.LatestOnClause {
    const columnRefs = ctx.columnRef.map((c: CstNode) => this.visit(c));

    if (ctx.On) {
      // LATEST ON timestamp PARTITION BY col1, col2, ...
      return {
        type: "latestOn",
        timestamp: columnRefs[0].name,
        partitionBy: columnRefs.slice(1).map((c: any) => c.name),
      };
    }
    // LATEST BY col1, col2, ...
    return {
      type: "latestOn",
      partitionBy: columnRefs.map((c: any) => c.name),
    };
  }

  // ==========================================================================
  // GROUP BY, HAVING, ORDER BY, LIMIT
  // ==========================================================================

  groupByClause(ctx: any): AST.Expression[] {
    return ctx.expression.map((e: CstNode) => this.visit(e));
  }

  orderByClause(ctx: any): AST.OrderByItem[] {
    return ctx.orderByItem.map((item: CstNode) => this.visit(item));
  }

  orderByItem(ctx: any): AST.OrderByItem {
    const result: AST.OrderByItem = {
      type: "orderByItem",
      expression: this.visit(ctx.expression),
    };

    if (ctx.Asc) result.direction = "asc";
    else if (ctx.Desc) result.direction = "desc";

    return result;
  }

  limitClause(ctx: any): AST.LimitClause {
    const expressions = ctx.expression.map((e: CstNode) => this.visit(e));

    const result: AST.LimitClause = {
      type: "limit",
      count: expressions[0],
    };

    if (expressions.length > 1) {
      result.offset = expressions[1];
    }

    return result;
  }

  // ==========================================================================
  // INSERT Statement
  // ==========================================================================

  insertStatement(ctx: any): AST.InsertStatement {
    const result: AST.InsertStatement = {
      type: "insert",
      table: this.visit(ctx.qualifiedName),
    };

    if (ctx.withClause) {
      result.with = this.visit(ctx.withClause);
    }
    if (ctx.Atomic) {
      result.atomic = true;
    }
    if (ctx.batchClause) {
      result.batch = this.visit(ctx.batchClause[0]);
    }

    if (ctx.identifier) {
      result.columns = ctx.identifier.map((id: CstNode) => {
        const name = this.visit(id);
        return name.parts[0];
      });
    }

    if (ctx.valuesClause) {
      result.values = this.visit(ctx.valuesClause);
    }

    if (ctx.selectStatement) {
      result.select = this.visit(ctx.selectStatement[0]);
    }

    return result;
  }

  valuesClause(ctx: any): AST.Expression[][] {
    return ctx.valuesList.map((v: CstNode) => this.visit(v));
  }

  valuesList(ctx: any): AST.Expression[] {
    return ctx.expression.map((e: CstNode) => this.visit(e));
  }

  batchClause(ctx: any): { size: number; o3MaxLag?: string } {
    const o3MaxLag = ctx.DurationLiteral?.[0]?.image
      ?? (ctx.StringLiteral?.[0]?.image ? ctx.StringLiteral[0].image.slice(1, -1) : undefined);
    return {
      size: parseInt(ctx.NumberLiteral[0].image, 10),
      o3MaxLag,
    };
  }

  // ==========================================================================
  // UPDATE Statement
  // ==========================================================================

  updateStatement(ctx: any): AST.UpdateStatement {
    const result: AST.UpdateStatement = {
      type: "update",
      table: this.visit(ctx.qualifiedName),
      set: ctx.setClause.map((s: CstNode) => this.visit(s)),
    };

    if (ctx.withClause) {
      result.with = this.visit(ctx.withClause);
    }

    if (ctx.identifier) {
      result.alias = this.extractIdentifierName(ctx.identifier[0].children);
    }

    if (ctx.tableRef) {
      result.from = this.visit(ctx.tableRef);
    }
    if (ctx.joinClause) {
      result.joins = ctx.joinClause.map((j: CstNode) => this.visit(j));
    }

    if (ctx.whereClause) {
      result.where = this.visit(ctx.whereClause);
    }

    return result;
  }

  setClause(ctx: any): AST.SetClause {
    const colRef = this.visit(ctx.columnRef) as AST.ColumnRef;
    const parts = colRef.name.parts;
    return {
      type: "setClause",
      column: parts[parts.length - 1],
      value: this.visit(ctx.expression),
    };
  }

  // ==========================================================================
  // DECLARE Statement
  // ==========================================================================

  declareClause(ctx: any): AST.DeclareClause {
    return {
      type: "declareClause",
      assignments: ctx.declareAssignment.map((a: CstNode) => this.visit(a)),
    };
  }

  declareAssignment(ctx: any): AST.DeclareAssignment {
    const image = ctx.VariableReference[0].image; // e.g. "@limit"
    const result: AST.DeclareAssignment = {
      type: "declareAssignment",
      name: image.substring(1), // strip leading @
      value: this.visit(ctx.expression),
    };
    if (ctx.Overridable) result.overridable = true;
    return result;
  }

  // ==========================================================================
  // CREATE Statement
  // ==========================================================================

  createStatement(ctx: any): AST.Statement {
    if (ctx.createTableBody) {
      return this.visit(ctx.createTableBody);
    }
    if (ctx.createMaterializedViewBody) {
      return this.visit(ctx.createMaterializedViewBody);
    }
    if (ctx.createViewBody) {
      return this.visit(ctx.createViewBody);
    }
    if (ctx.createUserStatement) {
      return this.visit(ctx.createUserStatement);
    }
    if (ctx.createGroupStatement) {
      return this.visit(ctx.createGroupStatement);
    }
    if (ctx.createServiceAccountStatement) {
      return this.visit(ctx.createServiceAccountStatement);
    }
    throw new Error("Unknown create statement type");
  }

  // ==========================================================================
  // CREATE TABLE Statement
  // ==========================================================================

  createTableBody(ctx: any): AST.CreateTableStatement {
    const table = ctx.qualifiedName
      ? this.visit(ctx.qualifiedName)
      : { type: "qualifiedName" as const, parts: [ctx.StringLiteral[0].image.slice(1, -1)] };
    const result: AST.CreateTableStatement = {
      type: "createTable",
      table,
    };

    if (ctx.Atomic) {
      result.atomic = true;
    }
    if (ctx.batchClause) {
      result.batch = this.visit(ctx.batchClause[0]);
    }

    if (ctx.If) {
      result.ifNotExists = true;
    }

    if (ctx.columnDefinition) {
      result.columns = ctx.columnDefinition.map((c: any) => this.visit(c));
    }

    if (ctx.Like && ctx.qualifiedName?.length > 1) {
      result.like = this.visit(ctx.qualifiedName[1]);
    }

    if (ctx.selectStatement) {
      result.asSelect = this.visit(ctx.selectStatement[0]);
    }

    if (ctx.castDefinition) {
      result.casts = ctx.castDefinition.map((c: any) => this.visit(c));
    }
    if (ctx.indexDefinition) {
      result.indexes = ctx.indexDefinition.map((i: any) => this.visit(i));
    }

    // Timestamp - the identifier after TIMESTAMP keyword
    if (ctx.Timestamp && ctx.columnRef && ctx.columnRef.length > 0) {
      result.timestamp = this.visit(ctx.columnRef[0]).name.parts.join(".");
    }

    if (ctx.partitionBy) {
      result.partitionBy = this.visit(ctx.partitionBy);
    }

    if (ctx.Bypass) {
      result.bypassWal = true;
    } else if (ctx.Wal) {
      result.wal = true;
    }

    if (ctx.Ttl && (ctx.NumberLiteral || ctx.DurationLiteral)) {
      result.ttl = this.extractTtl(ctx);
    }

    if (ctx.tableParam) {
      result.withParams = ctx.tableParam.map((p: CstNode) => this.visit(p));
    }
    if (ctx.Volume) {
      result.volume = ctx.StringLiteral?.[0]
        ? ctx.StringLiteral[0].image.slice(1, -1)
        : ctx.identifier?.length
          ? this.extractIdentifierName(ctx.identifier[ctx.identifier.length - 1].children)
          : undefined;
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier);
    }

    if (ctx.dedupClause) {
      result.dedupKeys = this.visit(ctx.dedupClause);
    }

    return result;
  }

  columnDefinition(ctx: any): AST.ColumnDefinition {
    const result: AST.ColumnDefinition = {
      type: "columnDefinition",
      name: this.extractIdentifierName(ctx.identifier[0].children),
      dataType: this.visit(ctx.dataType),
    };

    // Distinguish symbol CAPACITY (CONSUME) from index CAPACITY (CONSUME1) by position
    const capacityTokens = ctx.Capacity || [];
    const numberTokens = ctx.NumberLiteral || [];
    const indexToken = ctx.Index?.[0];

    if (capacityTokens.length > 0 && numberTokens.length > 0) {
      if (indexToken) {
        // Determine which capacity is for symbol vs index by position relative to INDEX
        const indexOffset = indexToken.startOffset;
        for (let i = 0; i < capacityTokens.length; i++) {
          const capOffset = capacityTokens[i].startOffset;
          if (capOffset < indexOffset) {
            // Symbol CAPACITY (before INDEX)
            result.symbolCapacity = parseInt(numberTokens[i].image, 10);
          } else {
            // INDEX CAPACITY (after INDEX)
            result.indexCapacity = parseInt(numberTokens[i].image, 10);
          }
        }
      } else {
        // No INDEX, so this is symbol CAPACITY
        result.symbolCapacity = parseInt(numberTokens[0].image, 10);
      }
    }

    // CACHE / NOCACHE
    if (ctx.Cache) {
      result.cache = true;
    } else if (ctx.Nocache) {
      result.cache = false;
    }

    // INDEX
    if (indexToken) {
      result.indexed = true;
    }

    return result;
  }

  castDefinition(ctx: any): AST.CastDefinition {
    const colRef = this.visit(ctx.columnRef);
    return {
      type: "castDefinition",
      column: colRef.name ?? colRef,
      dataType: this.visit(ctx.dataType),
    };
  }

  indexDefinition(ctx: any): AST.IndexDefinition {
    const colRef = this.visit(ctx.columnRef);
    const result: AST.IndexDefinition = {
      type: "indexDefinition",
      column: colRef.name ?? colRef,
    };
    if (ctx.Capacity && ctx.NumberLiteral) {
      result.capacity = parseInt(ctx.NumberLiteral[0].image, 10);
    }
    return result;
  }

  tableParamName(ctx: any): string {
    if (ctx.identifier) return this.extractIdentifierName(ctx.identifier[0].children);
    return "";
  }

  tableParam(ctx: any): AST.TableParam {
    const name = ctx.tableParamName
      ? this.visit(ctx.tableParamName[0])
      : "";
    const result: AST.TableParam = {
      type: "tableParam",
      name,
    };
    if (ctx.expression) {
      result.value = this.visit(ctx.expression);
    }
    return result;
  }

  createViewBody(ctx: any): AST.CreateViewStatement {
    const result: AST.CreateViewStatement = {
      type: "createView",
      view: this.visit(ctx.stringOrQualifiedName),
      query: ctx.selectStatement
        ? this.visit(ctx.selectStatement[0])
        : this.visit(ctx.implicitSelectBody),
    };
    if (ctx.LParen) {
      result.asParens = true;
    }
    if (ctx.Or) {
      result.orReplace = true;
    }
    if (ctx.If) {
      result.ifNotExists = true;
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier);
    }
    return result;
  }

  createUserStatement(ctx: any): AST.CreateUserStatement {
    const result: AST.CreateUserStatement = {
      type: "createUser",
      user: this.visit(ctx.qualifiedName[0]),
    };
    if (ctx.If) {
      result.ifNotExists = true;
    }
    if (ctx.No) {
      result.noPassword = true;
    }
    if (ctx.Password) {
      if (ctx.StringLiteral) {
        result.password = ctx.StringLiteral[0].image.slice(1, -1);
      } else if (ctx.identifier) {
        result.password = this.extractIdentifierName(ctx.identifier[0].children);
      }
    }
    return result;
  }

  createGroupStatement(ctx: any): AST.CreateGroupStatement {
    const result: AST.CreateGroupStatement = {
      type: "createGroup",
      group: this.visit(ctx.qualifiedName),
      ifNotExists: !!ctx.If,
    };
    if (ctx.StringLiteral) {
      result.externalAlias = ctx.StringLiteral[0].image.slice(1, -1);
    }
    return result;
  }

  createServiceAccountStatement(ctx: any): AST.CreateServiceAccountStatement {
    const result: AST.CreateServiceAccountStatement = {
      type: "createServiceAccount",
      account: this.visit(ctx.qualifiedName[0]),
    };
    if (ctx.If) {
      result.ifNotExists = true;
    }
    if (ctx.No) {
      result.noPassword = true;
    }
    if (ctx.Password && !ctx.No) {
      if (ctx.StringLiteral) {
        result.password = ctx.StringLiteral[0].image.slice(1, -1);
      } else if (ctx.identifier) {
        result.password = this.extractIdentifierName(ctx.identifier[0].children);
      }
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier);
    }
    return result;
  }

  createMaterializedViewBody(ctx: any): AST.CreateMaterializedViewStatement {
    const result: AST.CreateMaterializedViewStatement = {
      type: "createMaterializedView",
      view: this.visit(ctx.stringOrQualifiedName),
      query: this.visit(ctx.selectStatement[0]),
    };
    if (ctx.LParen) {
      result.asParens = true;
    }
    if (ctx.If) {
      result.ifNotExists = true;
    }
    if (ctx.Base && ctx.stringOrQualifiedName?.length > 1) {
      result.baseTable = this.visit(ctx.stringOrQualifiedName[1]);
    }
    if (ctx.materializedViewRefresh) {
      result.refresh = this.visit(ctx.materializedViewRefresh);
    } else if (ctx.Refresh && !ctx.materializedViewRefresh) {
      // REFRESH keyword consumed but no materializedViewRefresh subrule — REFRESH PERIOD path
      result.refresh = { type: "materializedViewRefresh" };
    }
    if (ctx.materializedViewPeriod) {
      result.period = this.visit(ctx.materializedViewPeriod[0]);
    }
    if (ctx.Timestamp && ctx.columnRef) {
      result.timestamp = this.visit(ctx.columnRef[0]);
    }
    if (ctx.materializedViewPartition) {
      const partitionCtx = ctx.materializedViewPartition[0].children;
      if (partitionCtx.Year) result.partitionBy = "YEAR";
      else if (partitionCtx.Month) result.partitionBy = "MONTH";
      else if (partitionCtx.Week) result.partitionBy = "WEEK";
      else if (partitionCtx.Day) result.partitionBy = "DAY";
      else if (partitionCtx.Hour) result.partitionBy = "HOUR";
      if (partitionCtx.Ttl && partitionCtx.NumberLiteral) {
        result.ttl = this.extractTtl(partitionCtx);
      }
    }
    if (ctx.Volume) {
      result.volume = ctx.StringLiteral?.[0]
        ? ctx.StringLiteral[0].image.slice(1, -1)
        : ctx.identifier?.length
          ? this.extractIdentifierName(ctx.identifier[ctx.identifier.length - 1].children)
          : undefined;
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier);
    }
    return result;
  }

  materializedViewRefresh(ctx: any): AST.MaterializedViewRefresh {
    const result: AST.MaterializedViewRefresh = {
      type: "materializedViewRefresh",
    };
    if (ctx.Immediate) result.mode = "immediate";
    if (ctx.Manual) result.mode = "manual";
    if (ctx.intervalValue) {
      result.every = this.extractMaybeString(ctx.intervalValue[0]);
    }
    if (ctx.Deferred) result.deferred = true;
    if (ctx.Start && ctx.stringOrIdentifier) {
      result.start = this.extractMaybeString(ctx.stringOrIdentifier[0]);
    }
    if (ctx.Zone && ctx.timeZoneValue) {
      result.timeZone = this.extractMaybeString(ctx.timeZoneValue[0]);
    }
    return result;
  }

  materializedViewPeriod(ctx: any): AST.MaterializedViewPeriod {
    const result: AST.MaterializedViewPeriod = {
      type: "materializedViewPeriod",
    };
    if (ctx.Length && ctx.intervalValue) {
      result.length = this.extractMaybeString(ctx.intervalValue[0]);
    }
    if (ctx.Delay && ctx.intervalValue?.[1]) {
      result.delay = this.extractMaybeString(ctx.intervalValue[1]);
    }
    if (ctx.Zone && ctx.timeZoneValue) {
      result.timeZone = this.extractMaybeString(ctx.timeZoneValue[0]);
    }
    if (ctx.Interval) {
      result.sampleByInterval = true;
    }
    return result;
  }

  materializedViewPartition(ctx: any): { partitionBy?: AST.CreateMaterializedViewStatement["partitionBy"]; ttl?: AST.CreateMaterializedViewStatement["ttl"] } {
    const result: { partitionBy?: AST.CreateMaterializedViewStatement["partitionBy"]; ttl?: AST.CreateMaterializedViewStatement["ttl"] } = {};
    if (ctx.Year) result.partitionBy = "YEAR";
    else if (ctx.Month) result.partitionBy = "MONTH";
    else if (ctx.Day) result.partitionBy = "DAY";
    else if (ctx.Hour) result.partitionBy = "HOUR";
    if (ctx.Ttl && ctx.NumberLiteral) {
      result.ttl = this.extractTtl(ctx);
    }
    return result;
  }

  partitionBy(ctx: any): "NONE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" {
    if (ctx.None) return "NONE";
    if (ctx.Hour) return "HOUR";
    if (ctx.Day) return "DAY";
    if (ctx.Week) return "WEEK";
    if (ctx.Month) return "MONTH";
    if (ctx.Year) return "YEAR";
    return "NONE";
  }

  timeUnit(ctx: any): string {
    if (ctx.Hours) return "HOURS";
    if (ctx.Days) return "DAYS";
    if (ctx.Weeks) return "WEEKS";
    if (ctx.Months) return "MONTHS";
    if (ctx.Years) return "YEARS";
    if (ctx.Hour) return "HOUR";
    if (ctx.Day) return "DAY";
    if (ctx.Week) return "WEEK";
    if (ctx.Month) return "MONTH";
    if (ctx.Year) return "YEAR";
    if (ctx.Minute) return "MINUTE";
    if (ctx.Minutes) return "MINUTES";
    if (ctx.Second) return "SECOND";
    if (ctx.Seconds) return "SECONDS";
    if (ctx.Millisecond) return "MILLISECOND";
    if (ctx.Milliseconds) return "MILLISECONDS";
    if (ctx.Microsecond) return "MICROSECOND";
    if (ctx.Microseconds) return "MICROSECONDS";
    if (ctx.Nanosecond) return "NANOSECOND";
    if (ctx.Nanoseconds) return "NANOSECONDS";
    return "DAYS";
  }

  dedupClause(ctx: any): string[] {
    return ctx.identifier.map((id: any) =>
      this.extractIdentifierName(id.children)
    );
  }

  // ==========================================================================
  // ALTER TABLE Statement
  // ==========================================================================

  alterStatement(ctx: any): AST.Statement {
    if (ctx.alterTableStatement) {
      return this.visit(ctx.alterTableStatement);
    }
    if (ctx.alterMaterializedViewStatement) {
      return this.visit(ctx.alterMaterializedViewStatement);
    }
    if (ctx.alterViewStatement) {
      return this.visit(ctx.alterViewStatement);
    }
    if (ctx.alterUserStatement) {
      return this.visit(ctx.alterUserStatement);
    }
    if (ctx.alterServiceAccountStatement) {
      return this.visit(ctx.alterServiceAccountStatement);
    }
    if (ctx.alterGroupStatement) {
      return this.visit(ctx.alterGroupStatement);
    }
    throw new Error("Unknown alter statement type");
  }

  alterViewStatement(ctx: any): AST.AlterViewStatement {
    return {
      type: "alterView",
      view: this.visit(ctx.stringOrQualifiedName),
      query: this.visit(ctx.selectStatement[0]),
    };
  }

  alterGroupStatement(ctx: any): AST.AlterGroupStatement {
    const alias = ctx.StringLiteral[0].image.slice(1, -1);
    if (ctx.With) {
      return {
        type: "alterGroup",
        group: this.visit(ctx.qualifiedName),
        action: "setAlias",
        externalAlias: alias,
      };
    }
    return {
      type: "alterGroup",
      group: this.visit(ctx.qualifiedName),
      action: "dropAlias",
      externalAlias: alias,
    };
  }

  alterTableStatement(ctx: any): AST.AlterTableStatement {
    const table = ctx.qualifiedName
      ? this.visit(ctx.qualifiedName)
      : { type: "qualifiedName" as const, parts: [ctx.StringLiteral[0].image.slice(1, -1)] };
    return {
      type: "alterTable",
      table,
      action: this.visit(ctx.alterTableAction),
    };
  }

  alterMaterializedViewStatement(ctx: any): AST.AlterMaterializedViewStatement {
    return {
      type: "alterMaterializedView",
      view: this.visit(ctx.qualifiedName),
      action: this.visit(ctx.alterMaterializedViewAction),
    };
  }

  alterMaterializedViewAction(ctx: any): AST.AlterMaterializedViewAction {
    if (ctx.Add && ctx.Index) {
      const result: AST.AlterMaterializedViewAddIndex = {
        actionType: "addIndex",
        column: this.extractIdentifierName(ctx.identifier[0].children),
      };
      if (ctx.Capacity && ctx.NumberLiteral) {
        result.capacity = parseInt(ctx.NumberLiteral[0].image, 10);
      }
      return result;
    }

    if (ctx.Symbol && ctx.Capacity) {
      return {
        actionType: "symbolCapacity",
        column: this.extractIdentifierName(ctx.identifier[0].children),
        capacity: parseInt(ctx.NumberLiteral[0].image, 10),
      };
    }

    if (ctx.Ttl) {
      return {
        actionType: "setTtl",
        ttl: this.extractTtl(ctx),
      };
    }

    if (ctx.Limit) {
      return {
        actionType: "setRefreshLimit",
        limit: this.extractTtl(ctx),
      };
    }

    // ALTER COLUMN x DROP INDEX
    if (ctx.Alter && ctx.Drop && ctx.Index) {
      return {
        actionType: "dropIndex",
        column: this.extractIdentifierName(ctx.identifier[0].children),
      };
    }

    // RESUME WAL [FROM TRANSACTION n]
    if (ctx.Resume) {
      const result: any = { actionType: "resumeWal" };
      if (ctx.NumberLiteral) {
        result.fromTxn = parseInt(ctx.NumberLiteral[0].image, 10);
      }
      return result;
    }

    // SUSPEND WAL
    if (ctx.Suspend) {
      return { actionType: "suspendWal" };
    }

    return {
      actionType: "setRefresh",
      refresh: ctx.materializedViewRefresh
        ? this.visit(ctx.materializedViewRefresh)
        : undefined,
      period: ctx.materializedViewPeriod
        ? this.visit(ctx.materializedViewPeriod)
        : undefined,
    };
  }

  alterUserStatement(ctx: any): AST.AlterUserStatement {
    return {
      type: "alterUser",
      user: this.visit(ctx.qualifiedName),
      action: this.visit(ctx.alterUserAction),
    };
  }

  alterServiceAccountStatement(ctx: any): AST.AlterServiceAccountStatement {
    return {
      type: "alterServiceAccount",
      account: this.visit(ctx.qualifiedName),
      action: this.visit(ctx.alterUserAction),
    };
  }

  alterUserAction(ctx: any): AST.AlterUserAction {
    if (ctx.Enable) {
      return { actionType: "enable" };
    }
    if (ctx.Disable) {
      return { actionType: "disable" };
    }
    if (ctx.Password || ctx.No) {
      return {
        actionType: "password",
        noPassword: !!ctx.No,
        password: ctx.StringLiteral?.[0]?.image?.slice(1, -1),
      };
    }
    if (ctx.Create && ctx.Token) {
      let ttl: string | undefined;
      if (ctx.DurationLiteral) {
        ttl = ctx.DurationLiteral[0].image;
      } else if (ctx.Ttl && ctx.StringLiteral) {
        ttl = ctx.StringLiteral[0].image.slice(1, -1);
      }
      return {
        actionType: "createToken",
        tokenType: ctx.Jwk ? "JWK" : "REST",
        ttl,
        refresh: !!ctx.Refresh,
      };
    }
    return {
      actionType: "dropToken",
      tokenType: ctx.Jwk ? "JWK" : "REST",
      token: ctx.Identifier?.[0]?.image ?? ctx.StringLiteral?.[0]?.image?.slice(1, -1),
    };
  }

  alterTableAction(ctx: any): AST.AlterTableAction {
    // ADD COLUMN
    if (ctx.Add && ctx.columnDefinition) {
      const result: AST.AddColumnAction = {
        actionType: "addColumn",
        columns: ctx.columnDefinition.map((c: any) => this.visit(c)),
      };
      if (ctx.If) {
        result.ifNotExists = true;
      }
      return result;
    }

    // DROP COLUMN (when Drop token exists but no Partition and no Alter — Alter + Drop = ALTER COLUMN DROP INDEX)
    if (ctx.Drop && ctx.identifier && !ctx.Partition && !ctx.Alter) {
      return {
        actionType: "dropColumn",
        columns: ctx.identifier.map((id: any) =>
          this.extractIdentifierName(id.children)
        ),
      };
    }

    // RENAME COLUMN
    if (ctx.Rename) {
      const identifiers = ctx.identifier.map((id: any) =>
        this.extractIdentifierName(id.children)
      );
      return {
        actionType: "renameColumn",
        oldName: identifiers[0],
        newName: identifiers[1],
      };
    }

    // ALTER COLUMN
    if (ctx.Alter && ctx.identifier) {
      const column = this.extractIdentifierName(ctx.identifier[0].children);
      let alterType:
        | "type"
        | "addIndex"
        | "dropIndex"
        | "cache"
        | "nocache"
        | "symbolCapacity" = "type";
      let newType: string | undefined;
      let capacity: number | undefined;

      if (ctx.Type) {
        alterType = "type";
        newType = this.visit(ctx.dataType);
        if (ctx.Capacity && ctx.NumberLiteral) {
          capacity = parseInt(ctx.NumberLiteral[0].image, 10);
        }
      } else if (ctx.Add && ctx.Index) {
        alterType = "addIndex";
      } else if (ctx.Drop && ctx.Index) {
        alterType = "dropIndex";
      } else if (ctx.Symbol && ctx.Capacity) {
        alterType = "symbolCapacity";
        capacity = parseInt(ctx.NumberLiteral[0].image, 10);
      } else if (ctx.Cache) {
        alterType = "cache";
      } else if (ctx.Nocache) {
        alterType = "nocache";
      }

      const result: AST.AlterColumnAction = {
        actionType: "alterColumn",
        column,
        alterType,
      };
      if (newType) {
        result.newType = newType;
      }
      if (capacity !== undefined) {
        result.capacity = capacity;
      }
      if (alterType === "type") {
        if (ctx.Cache) result.cache = true;
        else if (ctx.Nocache) result.cache = false;
      }
      return result;
    }

    // DROP PARTITION
    if (ctx.Drop && ctx.Partition) {
      const result: any = {
        actionType: "dropPartition",
      };
      if (ctx.StringLiteral) {
        result.partitions = ctx.StringLiteral.map((s: any) => s.image.slice(1, -1));
      }
      if (ctx.Where && ctx.expression) {
        result.where = this.visit(ctx.expression);
      }
      return result;
    }

    // ATTACH PARTITION
    if (ctx.Attach) {
      return {
        actionType: "attachPartition",
        partitions: ctx.StringLiteral.map((s: any) => s.image.slice(1, -1)),
      };
    }

    // DETACH PARTITION
    if (ctx.Detach) {
      const result: AST.DetachPartitionAction = {
        actionType: "detachPartition",
      };
      if (ctx.StringLiteral) {
        result.partitions = ctx.StringLiteral.map((s: any) => s.image.slice(1, -1));
      }
      if (ctx.Where && ctx.expression) {
        result.where = this.visit(ctx.expression);
      }
      return result;
    }

    // SQUASH PARTITIONS
    if (ctx.Squash) {
      return {
        actionType: "squashPartitions",
      };
    }

    if (ctx.Set && ctx.Param) {
      return {
        actionType: "setParam",
        params: ctx.tableParam.map((p: CstNode) => this.visit(p)),
      };
    }

    if (ctx.Set && ctx.Ttl) {
      return {
        actionType: "setTtl",
        ttl: this.extractTtl(ctx),
      };
    }

    if (ctx.Dedup && ctx.Disable) {
      return {
        actionType: "dedupDisable",
      };
    }

    if (ctx.Dedup && ctx.Enable) {
      return {
        actionType: "dedupEnable",
        keys: ctx.identifier.map((id: any) => this.extractIdentifierName(id.children)),
      };
    }

    // SUSPEND WAL [WITH code, 'message']
    if (ctx.Suspend) {
      const result: AST.SuspendWalAction = { actionType: "suspendWal" };
      if (ctx.With) {
        // Code can be a NumberLiteral or StringLiteral
        if (ctx.NumberLiteral) {
          result.code = ctx.NumberLiteral[0].image;
        } else if (ctx.StringLiteral && ctx.StringLiteral.length > 0) {
          result.code = ctx.StringLiteral[0].image.slice(1, -1);
        }
        // Message is the last StringLiteral
        const strings = ctx.StringLiteral || [];
        if (strings.length > 0) {
          result.message = strings[strings.length - 1].image.slice(1, -1);
        }
      }
      return result;
    }

    // RESUME WAL [FROM TXN/TRANSACTION number]
    if (ctx.Resume) {
      const result: AST.ResumeWalAction = { actionType: "resumeWal" };
      if (ctx.NumberLiteral) {
        const num = parseInt(ctx.NumberLiteral[0].image, 10);
        if (ctx.Txn) {
          result.fromTxn = num;
        } else if (ctx.Transaction) {
          result.fromTransaction = num;
        }
      }
      return result;
    }

    // CONVERT PARTITION
    if (ctx.Convert) {
      const target = this.visit(ctx.convertPartitionTarget);
      return {
        actionType: "convertPartition",
        ...target,
      } as AST.ConvertPartitionAction;
    }

    // SET TYPE [BYPASS] WAL
    if (ctx.Set && ctx.Type) {
      return {
        actionType: "setTypeWal",
        bypass: !!ctx.Bypass,
      } as AST.SetTypeWalAction;
    }

    throw new Error("Unknown alter table action");
  }

  // ==========================================================================
  // DROP TABLE Statement
  // ==========================================================================

  dropStatement(ctx: any): AST.Statement {
    if (ctx.dropTableStatement) {
      return this.visit(ctx.dropTableStatement);
    }
    if (ctx.dropMaterializedViewStatement) {
      return this.visit(ctx.dropMaterializedViewStatement);
    }
    if (ctx.dropViewStatement) {
      return this.visit(ctx.dropViewStatement);
    }
    if (ctx.dropUserStatement) {
      return this.visit(ctx.dropUserStatement);
    }
    if (ctx.dropGroupStatement) {
      return this.visit(ctx.dropGroupStatement);
    }
    if (ctx.dropServiceAccountStatement) {
      return this.visit(ctx.dropServiceAccountStatement);
    }
    throw new Error("Unknown drop statement type");
  }

  dropTableStatement(ctx: any): AST.DropTableStatement {
    const result: AST.DropTableStatement = {
      type: "dropTable",
    };

    if (ctx.All) {
      result.allTables = true;
    } else {
      result.table = this.visit(ctx.qualifiedName);
      if (ctx.If) {
        result.ifExists = true;
      }
    }

    return result;
  }

  dropMaterializedViewStatement(ctx: any): AST.DropMaterializedViewStatement {
    return {
      type: "dropMaterializedView",
      view: this.visit(ctx.stringOrQualifiedName),
      ifExists: !!ctx.If,
    };
  }

  dropViewStatement(ctx: any): AST.DropViewStatement {
    return {
      type: "dropView",
      view: this.visit(ctx.stringOrQualifiedName),
      ifExists: !!ctx.If,
    };
  }

  dropUserStatement(ctx: any): AST.DropUserStatement {
    return {
      type: "dropUser",
      user: this.visit(ctx.qualifiedName),
      ifExists: !!ctx.If,
    };
  }

  dropGroupStatement(ctx: any): AST.DropGroupStatement {
    return {
      type: "dropGroup",
      group: this.visit(ctx.qualifiedName),
      ifExists: !!ctx.If,
    };
  }

  dropServiceAccountStatement(ctx: any): AST.DropServiceAccountStatement {
    return {
      type: "dropServiceAccount",
      account: this.visit(ctx.qualifiedName),
      ifExists: !!ctx.If,
    };
  }

  // ==========================================================================
  // TRUNCATE TABLE Statement
  // ==========================================================================

  truncateTableStatement(ctx: any): AST.TruncateTableStatement {
    const result: AST.TruncateTableStatement = {
      type: "truncateTable",
      table: this.visit(ctx.qualifiedName),
    };

    if (ctx.If) {
      result.ifExists = true;
    }

    return result;
  }

  // ==========================================================================
  // RENAME TABLE Statement
  // ==========================================================================

  renameTableStatement(ctx: any): AST.RenameTableStatement {
    const extractName = (index: number): AST.QualifiedName => {
      if (ctx.qualifiedName?.[index]) {
        return this.visit(ctx.qualifiedName[index]);
      }
      // Handle StringLiteral alternative (e.g., RENAME TABLE 'old' TO 'new')
      if (ctx.StringLiteral?.[index]) {
        const raw = ctx.StringLiteral[index].image;
        return { type: "qualifiedName", parts: [raw.slice(1, -1)] };
      }
      return { type: "qualifiedName", parts: [""] };
    };
    return {
      type: "renameTable",
      from: extractName(0),
      to: extractName(1),
    };
  }

  addUserStatement(ctx: any): AST.AddUserStatement {
    return {
      type: "addUser",
      user: this.visit(ctx.qualifiedName[0]),
      groups: ctx.qualifiedName.slice(1).map((q: CstNode) => this.visit(q)),
    };
  }

  removeUserStatement(ctx: any): AST.RemoveUserStatement {
    return {
      type: "removeUser",
      user: this.visit(ctx.qualifiedName[0]),
      groups: ctx.qualifiedName.slice(1).map((q: CstNode) => this.visit(q)),
    };
  }

  assumeServiceAccountStatement(ctx: any): AST.AssumeServiceAccountStatement {
    return {
      type: "assumeServiceAccount",
      account: this.visit(ctx.qualifiedName),
    };
  }

  exitServiceAccountStatement(ctx: any): AST.ExitServiceAccountStatement {
    return {
      type: "exitServiceAccount",
      account: this.visit(ctx.qualifiedName),
    };
  }

  cancelQueryStatement(ctx: any): AST.CancelQueryStatement {
    const token =
      ctx.NumberLiteral?.[0] ?? ctx.Identifier?.[0] ?? ctx.StringLiteral?.[0];
    return {
      type: "cancelQuery",
      queryId: token?.image?.replace(/^'|'$/g, "") ?? "",
    };
  }

  // ==========================================================================
  // SHOW Statement
  // ==========================================================================

  showStatement(ctx: any): AST.ShowStatement {
    if (ctx.Tables) {
      return {
        type: "show",
        showType: "tables",
      };
    }

    if (ctx.Columns) {
      return {
        type: "show",
        showType: "columns",
        table: this.visit(ctx.qualifiedName),
      };
    }

    if (ctx.Partitions) {
      return {
        type: "show",
        showType: "partitions",
        table: this.visit(ctx.qualifiedName),
      };
    }

    if (ctx.Create) {
      if (ctx.Materialized) {
        return {
          type: "show",
          showType: "createMaterializedView",
          table: this.visit(ctx.qualifiedName),
        };
      }
      if (ctx.View) {
        return {
          type: "show",
          showType: "createView",
          table: this.visit(ctx.qualifiedName),
        };
      }
      return {
        type: "show",
        showType: "createTable",
        table: this.visit(ctx.qualifiedName),
      };
    }

    if (ctx.Time && ctx.Zone) {
      return {
        type: "show",
        showType: "timeZone",
      };
    }

    if (ctx.Default && ctx.Transaction) {
      return {
        type: "show",
        showType: "defaultTransactionReadOnly",
      };
    }

    if (ctx.Transaction) {
      if (ctx.Isolation) {
        return {
          type: "show",
          showType: "transactionIsolationLevel",
        };
      }
      return {
        type: "show",
        showType: "transaction",
      };
    }

    if (ctx.User) {
      return {
        type: "show",
        showType: "user",
        name: ctx.qualifiedName ? this.visit(ctx.qualifiedName) : undefined,
      };
    }

    if (ctx.Users) {
      return {
        type: "show",
        showType: "users",
      };
    }

    if (ctx.Groups) {
      return {
        type: "show",
        showType: "groups",
        name: ctx.qualifiedName ? this.visit(ctx.qualifiedName) : undefined,
      };
    }

    if (ctx.Service && ctx.Account) {
      return {
        type: "show",
        showType: "serviceAccount",
        name: ctx.qualifiedName ? this.visit(ctx.qualifiedName) : undefined,
      };
    }

    if (ctx.Service && ctx.Accounts) {
      return {
        type: "show",
        showType: "serviceAccounts",
        name: ctx.qualifiedName ? this.visit(ctx.qualifiedName) : undefined,
      };
    }

    if (ctx.Permissions) {
      return {
        type: "show",
        showType: "permissions",
        name: ctx.qualifiedName ? this.visit(ctx.qualifiedName) : undefined,
      };
    }

    if (ctx.ServerVersion) {
      return {
        type: "show",
        showType: "serverVersion",
      };
    }

    if (ctx.Parameters) {
      return {
        type: "show",
        showType: "parameters",
      };
    }

    throw new Error("Unknown show type");
  }

  // ==========================================================================
  // EXPLAIN Statement
  // ==========================================================================

  explainStatement(ctx: any): AST.ExplainStatement {
    const result: AST.ExplainStatement = {
      type: "explain",
      statement: this.visit(ctx.statement),
    };
    if (ctx.Format && ctx.Identifier) {
      result.format = ctx.Identifier[0].image.toUpperCase();
    }
    return result;
  }

  // ==========================================================================
  // COPY, CHECKPOINT, SNAPSHOT Statements
  // ==========================================================================

  copyStatement(ctx: any): AST.CopyStatement {
    if (ctx.copyCancel) {
      return this.visit(ctx.copyCancel);
    }
    if (ctx.copyFrom) {
      return this.visit(ctx.copyFrom);
    }
    return this.visit(ctx.copyTo);
  }

  copyCancel(ctx: any): AST.CopyCancelStatement {
    let id = "";
    if (ctx.StringLiteral) {
      id = ctx.StringLiteral[0].image.slice(1, -1);
    } else if (ctx.NumberLiteral) {
      id = ctx.NumberLiteral[0].image;
    } else if (ctx.Identifier) {
      id = ctx.Identifier[0].image;
    }
    return {
      type: "copyCancel",
      id,
    };
  }

  copyFrom(ctx: any): AST.CopyFromStatement {
    const result: AST.CopyFromStatement = {
      type: "copyFrom",
      table: this.visit(ctx.qualifiedName),
      file: this.extractMaybeString(ctx.stringOrIdentifier[0]),
    };
    if (ctx.copyOptions) {
      result.options = this.visit(ctx.copyOptions);
    }
    return result;
  }

  copyTo(ctx: any): AST.CopyToStatement {
    const source = ctx.selectStatement
      ? this.visit(ctx.selectStatement[0])
      : this.visit(ctx.qualifiedName);
    const result: AST.CopyToStatement = {
      type: "copyTo",
      source,
      destination: this.extractMaybeString(ctx.stringOrIdentifier[0]),
    };
    if (ctx.copyOptions) {
      result.options = this.visit(ctx.copyOptions);
    }
    return result;
  }

  copyOptions(ctx: any): AST.CopyOption[] {
    return ctx.copyOption.map((o: CstNode) => this.visit(o));
  }

  copyOption(ctx: any): AST.CopyOption {
    const keyToken =
      ctx.Header?.[0] ??
      ctx.Timestamp?.[0] ??
      ctx.Delimiter?.[0] ??
      ctx.Format?.[0] ??
      ctx.Partition?.[0] ??
      ctx.PartitionBy?.[0] ??
      ctx.CompressionCodec?.[0] ??
      ctx.CompressionLevel?.[0] ??
      ctx.RowGroupSize?.[0] ??
      ctx.DataPageSize?.[0] ??
      ctx.StatisticsEnabled?.[0] ??
      ctx.ParquetVersion?.[0] ??
      ctx.RawArrayEncoding?.[0] ??
      (ctx.On ? ctx.On[0] : undefined);

    let key = keyToken?.image ?? "OPTION";
    if (ctx.On && ctx.Error) key = "ON ERROR";
    const result: AST.CopyOption = {
      type: "copyOption",
      key,
    };

    if (ctx.booleanLiteral) {
      result.value = this.visit(ctx.booleanLiteral);
    } else if (ctx.stringOrIdentifier) {
      result.value = this.extractMaybeString(ctx.stringOrIdentifier[0]);
    } else if (ctx.StringLiteral) {
      result.value = ctx.StringLiteral[0].image.slice(1, -1);
    } else if (ctx.NumberLiteral) {
      result.value = parseFloat(ctx.NumberLiteral[0].image);
    } else if (ctx.expression) {
      const expr = this.visit(ctx.expression);
      if (expr?.type === "literal" && expr.literalType === "number") {
        result.value = expr.value as number;
      } else if (expr?.type === "literal" && expr.literalType === "string") {
        result.value = expr.value as string;
      } else {
        result.value = expr?.raw ?? String(expr?.value ?? "");
      }
    } else if (ctx.identifier) {
      result.value = this.extractIdentifierName(ctx.identifier[0].children);
    } else if (ctx.Uncompressed || ctx.Snappy || ctx.Gzip || ctx.Lz4 || ctx.Zstd || ctx.Lz4Raw || ctx.Brotli || ctx.Lzo) {
      const codecToken =
        ctx.Uncompressed?.[0] ??
        ctx.Snappy?.[0] ??
        ctx.Gzip?.[0] ??
        ctx.Lz4?.[0] ??
        ctx.Zstd?.[0] ??
        ctx.Lz4Raw?.[0] ??
        ctx.Brotli?.[0] ??
        ctx.Lzo?.[0];
      result.value = codecToken?.image;
    } else if (ctx.Partition || ctx.PartitionBy) {
      result.value = this.visit(ctx.partitionBy);
    } else if (ctx.SkipRow || ctx.SkipColumn || ctx.Abort) {
      result.value =
        ctx.SkipRow ? "SKIP_ROW" : ctx.SkipColumn ? "SKIP_COLUMN" : "ABORT";
    }

    return result;
  }

  checkpointStatement(ctx: any): AST.CheckpointStatement {
    return {
      type: "checkpoint",
      action: ctx.Create ? "create" : "release",
    };
  }

  snapshotStatement(ctx: any): AST.SnapshotStatement {
    return {
      type: "snapshot",
      action: ctx.Prepare ? "prepare" : "complete",
    };
  }

  backupStatement(ctx: any): AST.BackupStatement {
    if (ctx.Database) {
      return { type: "backup", action: "database" };
    }
    if (ctx.Abort) {
      return { type: "backup", action: "abort" };
    }
    return {
      type: "backup",
      action: "table",
      table: this.visit(ctx.qualifiedName),
    };
  }

  compileViewStatement(ctx: any): AST.CompileViewStatement {
    return {
      type: "compileView",
      view: this.visit(ctx.qualifiedName),
    };
  }

  convertPartitionTarget(ctx: any): { partitions?: string[]; target: string; where?: AST.Expression } {
    const result: { partitions?: string[]; target: string; where?: AST.Expression } = {
      target: "TABLE",
    };

    // Optional LIST of partition names
    if (ctx.StringLiteral) {
      result.partitions = ctx.StringLiteral.map((s: any) => s.image.slice(1, -1));
    }

    // Target: TABLE or identifier (e.g., Parquet, NATIVE)
    if (ctx.Table) {
      result.target = "TABLE";
    } else if (ctx.identifier) {
      result.target = this.extractIdentifierName(ctx.identifier[0].children).toUpperCase();
    }

    // Optional WHERE clause
    if (ctx.expression) {
      result.where = this.visit(ctx.expression[0]);
    }

    return result;
  }

  // ==========================================================================
  // GRANT / REVOKE Statements
  // ==========================================================================

  grantStatement(ctx: any): AST.GrantStatement {
    const result: AST.GrantStatement = {
      type: "grant",
      permissions: ctx.permissionList
        ? this.visit(ctx.permissionList)
        : ctx.identifier.map((id: any) => this.extractIdentifierName(id.children)),
      to: this.visit(ctx.qualifiedName),
    };
    if (ctx.All) {
      result.on = { type: "grantOn", allTables: true };
    } else if (ctx.grantTableTarget) {
      result.on = {
        type: "grantOn",
        tables: ctx.grantTableTarget.map((t: CstNode) => this.visit(t)),
      };
    }
    if (ctx.Option) {
      result.grantOption = true;
    }
    if (ctx.Verification) {
      result.verification = true;
    }
    return result;
  }

  revokeStatement(ctx: any): AST.RevokeStatement {
    const result: AST.RevokeStatement = {
      type: "revoke",
      permissions: ctx.permissionList
        ? this.visit(ctx.permissionList)
        : ctx.identifier.map((id: any) => this.extractIdentifierName(id.children)),
      from: this.visit(ctx.qualifiedName),
    };
    if (ctx.On) {
      if (ctx.All && ctx.Tables) {
        result.on = { type: "grantOn", allTables: true };
      } else if (ctx.grantTableTarget) {
        result.on = {
          type: "grantOn",
          tables: ctx.grantTableTarget.map((t: CstNode) => this.visit(t)),
        };
      }
    }
    return result;
  }

  permissionList(ctx: any): string[] {
    return ctx.permissionToken.map((token: CstNode) => this.visit(token));
  }

  permissionToken(ctx: any): string {
    // Collect all tokens and identifiers, sort by position, join with space.
    // The parser rule has a required first word + optional second word(s).
    const parts: { image: string; offset: number }[] = [];

    for (const key of Object.keys(ctx)) {
      const items = ctx[key];
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (item.image) {
          // Direct token
          parts.push({ image: item.image, offset: item.startOffset });
        } else if (item.children) {
          // Identifier subrule — extract the name
          const name = this.extractIdentifierName(item.children);
          const firstChild = Object.values(item.children).flat().find((c: any) => c?.startOffset != null) as any;
          parts.push({ image: name, offset: firstChild?.startOffset ?? 0 });
        }
      }
    }

    parts.sort((a, b) => a.offset - b.offset);
    return parts.map((p) => p.image).join(" ");
  }

  grantTableTarget(ctx: any): AST.GrantTableTarget {
    const result: AST.GrantTableTarget = {
      type: "grantTableTarget",
      table: this.visit(ctx.qualifiedName),
    };
    if (ctx.identifier && ctx.identifier.length > 0) {
      result.columns = ctx.identifier.map((id: any) =>
        this.extractIdentifierName(id.children)
      );
    }
    return result;
  }

  grantAssumeServiceAccountStatement(ctx: any): AST.GrantAssumeServiceAccountStatement {
    return {
      type: "grantAssumeServiceAccount",
      account: this.visit(ctx.qualifiedName[0]),
      to: this.visit(ctx.qualifiedName[1]),
      grantOption: !!ctx.Option,
    };
  }

  revokeAssumeServiceAccountStatement(ctx: any): AST.RevokeAssumeServiceAccountStatement {
    return {
      type: "revokeAssumeServiceAccount",
      account: this.visit(ctx.qualifiedName[0]),
      from: this.visit(ctx.qualifiedName[1]),
    };
  }

  // ==========================================================================
  // VACUUM / RESUME WAL / SET TYPE / REINDEX
  // ==========================================================================

  vacuumTableStatement(ctx: any): AST.VacuumTableStatement {
    return {
      type: "vacuumTable",
      table: this.visit(ctx.qualifiedName),
    };
  }

  resumeWalStatement(ctx: any): AST.ResumeWalStatement {
    const result: AST.ResumeWalStatement = {
      type: "resumeWal",
    };
    if (ctx.Transaction && (ctx.NumberLiteral || ctx.Identifier)) {
      const token = ctx.NumberLiteral?.[0] ?? ctx.Identifier?.[0];
      result.fromTransaction = token?.image;
    }
    if (ctx.Txn && (ctx.NumberLiteral || ctx.Identifier)) {
      const token = ctx.NumberLiteral?.[0] ?? ctx.Identifier?.[0];
      result.fromTxn = token?.image;
    }
    return result;
  }

  setTypeStatement(ctx: any): AST.SetTypeStatement {
    return {
      type: "setType",
      bypass: !!ctx.Bypass,
      wal: !!ctx.Wal,
    };
  }

  reindexTableStatement(ctx: any): AST.ReindexTableStatement {
    const result: AST.ReindexTableStatement = {
      type: "reindexTable",
      table: this.visit(ctx.qualifiedName),
    };
    if (ctx.Column && ctx.identifier) {
      result.columns = ctx.identifier.map((id: any) =>
        this.extractIdentifierName(id.children)
      );
    }
    if (ctx.Partition && ctx.stringOrIdentifier) {
      result.partitions = ctx.stringOrIdentifier.map((s: any) =>
        this.visit(s) as string
      );
    }
    if (ctx.Exclusive) {
      result.lockExclusive = true;
    }
    return result;
  }

  refreshMaterializedViewStatement(ctx: any): AST.RefreshMaterializedViewStatement {
    const result: AST.RefreshMaterializedViewStatement = {
      type: "refreshMaterializedView",
      view: this.visit(ctx.qualifiedName),
    };
    if (ctx.Full) result.mode = "full";
    if (ctx.Incremental) result.mode = "incremental";
    if (ctx.Range) {
      result.mode = "range";
      if (ctx.stringOrIdentifier) {
        result.from = this.extractMaybeString(ctx.stringOrIdentifier[0]);
        result.to = this.extractMaybeString(ctx.stringOrIdentifier[1]);
      }
    }
    return result;
  }

  // ==========================================================================
  // PIVOT Statement
  // ==========================================================================

  pivotStatement(ctx: any): AST.PivotStatement {
    const source = ctx.selectStatement
      ? this.visit(ctx.selectStatement[0])
      : this.visit(ctx.qualifiedName);
    const body = ctx.pivotBody ? this.visit(ctx.pivotBody) : {};
    const result: AST.PivotStatement = {
      type: "pivot",
      source,
      aggregations: body.aggregations || [],
      pivots: body.pivots || [],
    };
    if (ctx.whereClause) {
      result.where = this.visit(ctx.whereClause);
    }
    if (body.groupBy) {
      result.groupBy = body.groupBy;
    }
    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause);
    }
    if (ctx.limitClause) {
      result.limit = this.visit(ctx.limitClause);
    }
    if (ctx.identifier) {
      result.alias = this.extractIdentifierName(ctx.identifier[0].children);
    }
    return result;
  }

  pivotBody(ctx: any): { aggregations: AST.PivotAggregation[]; pivots: AST.PivotForClause[]; groupBy?: AST.Expression[] } {
    const aggregations = ctx.pivotAggregation
      ? ctx.pivotAggregation.map((p: CstNode) => this.visit(p))
      : [];
    const pivots = ctx.pivotForClause
      ? ctx.pivotForClause.map((p: CstNode) => this.visit(p))
      : [];
    const result: { aggregations: AST.PivotAggregation[]; pivots: AST.PivotForClause[]; groupBy?: AST.Expression[] } = {
      aggregations,
      pivots,
    };
    if (ctx.Group && ctx.expression) {
      result.groupBy = ctx.expression.map((e: CstNode) => this.visit(e));
    }
    return result;
  }

  pivotAggregation(ctx: any): AST.PivotAggregation {
    return {
      type: "pivotAggregation",
      expression: this.visit(ctx.expression),
      alias: ctx.identifier ? this.visit(ctx.identifier).parts[0] : undefined,
    };
  }

  pivotForClause(ctx: any): AST.PivotForClause {
    const result: AST.PivotForClause = {
      type: "pivotFor",
      expression: this.visit(ctx.columnRef),
      in: {
        type: "pivotIn",
      },
    };
    if (ctx.selectStatement) {
      result.in.select = this.visit(ctx.selectStatement);
    } else if (ctx.expression && ctx.expression.length > 0) {
      result.in.values = ctx.expression.map((e: CstNode) => this.visit(e));
    }
    return result;
  }

  // ==========================================================================
  // Expressions
  // ==========================================================================

  expression(ctx: any): AST.Expression {
    return this.visit(ctx.orExpression);
  }

  orExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.andExpression[0]);

    if (ctx.andExpression.length > 1) {
      for (let i = 1; i < ctx.andExpression.length; i++) {
        result = {
          type: "binary",
          operator: "OR",
          left: result,
          right: this.visit(ctx.andExpression[i]),
        };
      }
    }

    return result;
  }

  andExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.notExpression[0]);

    if (ctx.notExpression.length > 1) {
      for (let i = 1; i < ctx.notExpression.length; i++) {
        result = {
          type: "binary",
          operator: "AND",
          left: result,
          right: this.visit(ctx.notExpression[i]),
        };
      }
    }

    return result;
  }

  notExpression(ctx: any): AST.Expression {
    const inner = this.visit(ctx.equalityExpression);

    if (ctx.Not) {
      return {
        type: "unary",
        operator: "NOT",
        operand: inner,
      };
    }

    return inner;
  }

  equalityExpression(ctx: any): AST.Expression {
    const left = this.visit(ctx.relationalExpression[0]);

    if (ctx.relationalExpression && ctx.relationalExpression.length > 1) {
      let operator = "";
      if (ctx.Equals) operator = "=";
      else if (ctx.NotEquals) operator = "!=";
      else if (ctx.Like) operator = "LIKE";
      else if (ctx.Ilike) operator = "ILIKE";
      else if (ctx.RegexMatch) operator = "~";
      else if (ctx.RegexNotMatch) operator = "!~";
      else if (ctx.RegexNotEquals) operator = "~=";

      return {
        type: "binary",
        operator,
        left,
        right: this.visit(ctx.relationalExpression[1]),
      };
    }

    return left;
  }

  relationalExpression(ctx: any): AST.Expression {
    const left = this.visit(ctx.setExpression[0]);

    // Check for IS [NOT] NULL
    if (ctx.Is) {
      return {
        type: "isNull",
        expression: left,
        not: !!ctx.Not,
      };
    }

    // Check for relational operators (<, <=, >, >=)
    if (ctx.setExpression && ctx.setExpression.length > 1) {
      let operator = "";
      if (ctx.LessThan) operator = "<";
      else if (ctx.LessThanOrEqual) operator = "<=";
      else if (ctx.GreaterThan) operator = ">";
      else if (ctx.GreaterThanOrEqual) operator = ">=";

      return {
        type: "binary",
        operator,
        left,
        right: this.visit(ctx.setExpression[1]),
      };
    }

    return left;
  }

  setExpression(ctx: any): AST.Expression {
    const left = this.visit(ctx.bitOrExpression[0]);

    // Check for [NOT] IN
    if (ctx.In) {
      const result: AST.InExpression = {
        type: "in",
        expression: left,
        values: ctx.expression.map((e: CstNode) => this.visit(e)),
        not: !!ctx.Not,
      };
      if (ctx.LParen) {
        result.parenthesized = true;
      }
      return result;
    }

    // Check for [NOT] BETWEEN
    if (ctx.Between) {
      return {
        type: "between",
        expression: left,
        low: this.visit(ctx.betweenLow[0]),
        high: this.visit(ctx.betweenHigh[0]),
        not: !!ctx.Not,
      };
    }

    // Check for WITHIN
    if (ctx.Within) {
      return {
        type: "within",
        expression: left,
        values: ctx.expression.map((e: CstNode) => this.visit(e)),
      };
    }

    return left;
  }

  bitOrExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.bitXorExpression[0]);

    if (ctx.bitXorExpression.length > 1) {
      for (let i = 1; i < ctx.bitXorExpression.length; i++) {
        result = {
          type: "binary",
          operator: "|",
          left: result,
          right: this.visit(ctx.bitXorExpression[i]),
        };
      }
    }

    return result;
  }

  bitXorExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.bitAndExpression[0]);

    if (ctx.bitAndExpression.length > 1) {
      for (let i = 1; i < ctx.bitAndExpression.length; i++) {
        result = {
          type: "binary",
          operator: "^",
          left: result,
          right: this.visit(ctx.bitAndExpression[i]),
        };
      }
    }

    return result;
  }

  bitAndExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.concatExpression[0]);

    if (ctx.concatExpression.length > 1) {
      for (let i = 1; i < ctx.concatExpression.length; i++) {
        result = {
          type: "binary",
          operator: "&",
          left: result,
          right: this.visit(ctx.concatExpression[i]),
        };
      }
    }

    return result;
  }

  concatExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.additiveExpression[0]);

    if (ctx.additiveExpression.length > 1) {
      for (let i = 1; i < ctx.additiveExpression.length; i++) {
        result = {
          type: "binary",
          operator: "||",
          left: result,
          right: this.visit(ctx.additiveExpression[i]),
        };
      }
    }

    return result;
  }

  additiveExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.multiplicativeExpression[0]);

    if (ctx.multiplicativeExpression.length > 1) {
      // Collect all operator tokens and sort by position for correct association
      const ops = [
        ...(ctx.Plus || []).map((t: any) => ({ op: "+", offset: t.startOffset })),
        ...(ctx.Minus || []).map((t: any) => ({ op: "-", offset: t.startOffset })),
      ].sort((a: any, b: any) => a.offset - b.offset);

      for (let i = 0; i < ops.length; i++) {
        result = {
          type: "binary",
          operator: ops[i].op,
          left: result,
          right: this.visit(ctx.multiplicativeExpression[i + 1]),
        };
      }
    }

    return result;
  }

  multiplicativeExpression(ctx: any): AST.Expression {
    let result = this.visit(ctx.unaryExpression[0]);

    if (ctx.unaryExpression.length > 1) {
      // Collect all operator tokens and sort by position for correct association
      const ops = [
        ...(ctx.Star || []).map((t: any) => ({ op: "*", offset: t.startOffset })),
        ...(ctx.Divide || []).map((t: any) => ({ op: "/", offset: t.startOffset })),
        ...(ctx.Modulo || []).map((t: any) => ({ op: "%", offset: t.startOffset })),
      ].sort((a: any, b: any) => a.offset - b.offset);

      for (let i = 0; i < ops.length; i++) {
        result = {
          type: "binary",
          operator: ops[i].op,
          left: result,
          right: this.visit(ctx.unaryExpression[i + 1]),
        };
      }
    }

    return result;
  }

  unaryExpression(ctx: any): AST.Expression {
    const inner = this.visit(ctx.typeCastExpression);

    if (ctx.Minus) {
      return {
        type: "unary",
        operator: "-",
        operand: inner,
      };
    }

    if (ctx.RegexMatch) {
      return {
        type: "unary",
        operator: "~",
        operand: inner,
      };
    }

    return inner;
  }

  typeCastExpression(ctx: any): AST.Expression {
    let inner = this.visit(ctx.primaryExpression);

    // Handle array subscripts: expr[i], expr[i:j], expr[i, j]
    if (ctx.arraySubscript) {
      for (const sub of ctx.arraySubscript) {
        inner = {
          type: "arrayAccess",
          array: inner,
          subscripts: [this.visit(sub)],
        } as AST.ArrayAccessExpression;
      }
    }

    if (ctx.DoubleColon) {
      return {
        type: "typeCast",
        expression: inner,
        dataType: this.visit(ctx.dataType),
      };
    }

    return inner;
  }

  arraySubscript(ctx: any): any {
    const exprs = ctx.expression ? ctx.expression.map((e: any) => this.visit(e)) : [];

    if (!ctx.Colon) {
      // Simple subscript: expr
      return exprs[0];
    }

    // It's a slice — determine start/end based on token positions
    if (exprs.length === 0) {
      return { type: "arraySlice" } as AST.ArraySlice;
    }

    if (exprs.length === 2) {
      // start:end
      return { type: "arraySlice", start: exprs[0], end: exprs[1] } as AST.ArraySlice;
    }

    // 1 expression + colon — disambiguate start: vs :end using offsets
    const colonOffset = ctx.Colon[0].startOffset;
    const exprOffset = this.getFirstTokenOffset(ctx.expression[0]);
    if (exprOffset < colonOffset) {
      // Expression before colon: start:
      return { type: "arraySlice", start: exprs[0] } as AST.ArraySlice;
    } else {
      // Colon before expression: :end
      return { type: "arraySlice", end: exprs[0] } as AST.ArraySlice;
    }
  }

  /** Visit a CST node, returning undefined instead of throwing on incomplete input */
  private visitSafe(node: any): any {
    try {
      return this.visit(node);
    } catch {
      return undefined;
    }
  }

  /** Get the startOffset of the first token in a CstNode */
  private getFirstTokenOffset(node: any): number {
    if (node.startOffset !== undefined) return node.startOffset;
    if (!node.children) return Infinity;
    let min = Infinity;
    for (const children of Object.values(node.children)) {
      if (Array.isArray(children)) {
        for (const child of children as any[]) {
          const offset = this.getFirstTokenOffset(child);
          if (offset < min) min = offset;
        }
      }
    }
    return min;
  }

  primaryExpression(ctx: any): AST.Expression {
    if (ctx.arrayLiteral) {
      return this.visit(ctx.arrayLiteral);
    }
    if (ctx.castExpression) {
      return this.visit(ctx.castExpression);
    }
    if (ctx.caseExpression) {
      return this.visit(ctx.caseExpression);
    }
    if (ctx.functionCall) {
      return this.visit(ctx.functionCall);
    }
    if (ctx.literal) {
      return this.visit(ctx.literal);
    }
    if (ctx.VariableReference) {
      const image = ctx.VariableReference[0].image; // e.g. "@limit"
      return {
        type: "variable",
        name: image.substring(1), // strip leading @
      };
    }
    if (ctx.identifierExpression) {
      return this.visit(ctx.identifierExpression);
    }
    if (ctx.selectStatement) {
      return {
        type: "subquery",
        query: this.visit(ctx.selectStatement),
      } as AST.SubqueryExpression;
    }
    if (ctx.expression) {
      const result: AST.ParenExpression = {
        type: "paren",
        expression: this.visit(ctx.expression[0]),
      };
      if (ctx.expression.length > 1) {
        result.additionalExpressions = ctx.expression
          .slice(1)
          .map((e: any) => this.visit(e));
      }
      return result;
    }
    throw new Error("Unknown primary expression");
  }

  arrayLiteral(ctx: any): AST.ArrayLiteral {
    const result = this.visit(ctx.arrayBracketBody);
    result.hasArrayKeyword = true;
    return result;
  }

  arrayBracketBody(ctx: any): AST.ArrayLiteral {
    const elements: (AST.Expression | AST.ArrayLiteral)[] = [];
    if (ctx.arrayElement) {
      for (const elem of ctx.arrayElement) {
        elements.push(this.visit(elem));
      }
    }
    return {
      type: "arrayLiteral",
      elements,
    };
  }

  arrayElement(ctx: any): AST.Expression | AST.ArrayLiteral {
    if (ctx.arrayBracketBody) {
      return this.visit(ctx.arrayBracketBody);
    }
    return this.visit(ctx.expression);
  }

  castExpression(ctx: any): AST.CastExpression {
    return {
      type: "cast",
      expression: this.visit(ctx.expression),
      dataType: this.visit(ctx.dataType),
    };
  }

  dataType(ctx: any): string {
    // GEOHASH with precision: GEOHASH(8c)
    if (ctx.Geohash) {
      let result = "GEOHASH";
      if (ctx.NumberLiteral && ctx.identifier) {
        const precision = ctx.NumberLiteral[0].image;
        const unit = this.extractIdentifierName(ctx.identifier[0].children);
        result += `(${precision}${unit})`;
      }
      // Append array dimensions
      if (ctx.LBracket) {
        for (let i = 0; i < ctx.LBracket.length; i++) result += "[]";
      }
      return result;
    }

    // DECIMAL with optional precision: DECIMAL(18, 2) or DECIMAL(18)
    if (ctx.Decimal) {
      let result = "DECIMAL";
      if (ctx.NumberLiteral && ctx.NumberLiteral.length > 0) {
        const nums = ctx.NumberLiteral.map((n: any) => n.image);
        result += `(${nums.join(", ")})`;
      }
      if (ctx.LBracket) {
        for (let i = 0; i < ctx.LBracket.length; i++) result += "[]";
      }
      return result;
    }

    // All other types: find the first token image, then append array dims
    let baseType = "UNKNOWN";
    for (const key of Object.keys(ctx)) {
      if (key === "LBracket" || key === "RBracket" || key === "LParen" || key === "RParen"
          || key === "Comma" || key === "NumberLiteral" || key === "identifier") continue;
      const tokens = ctx[key];
      if (Array.isArray(tokens) && tokens.length > 0 && tokens[0].image) {
        baseType = tokens[0].image.toUpperCase();
        break;
      }
    }

    // Append array dimensions: DOUBLE[], DOUBLE[][]
    if (ctx.LBracket) {
      for (let i = 0; i < ctx.LBracket.length; i++) baseType += "[]";
    }

    return baseType;
  }

  caseExpression(ctx: any): AST.CaseExpression {
    const whenClauses: { when: AST.Expression; then: AST.Expression }[] = [];
    const expressions = ctx.expression || [];
    const whenCount = ctx.When ? ctx.When.length : 0;
    const hasElse = !!ctx.Else;

    // Simple CASE has: operand + whenCount*2 pairs + optional else = operand + whenCount*2 [+ 1]
    // Searched CASE has: whenCount*2 pairs + optional else = whenCount*2 [+ 1]
    const expectedWithoutOperand = whenCount * 2 + (hasElse ? 1 : 0);
    const hasOperand = expressions.length > expectedWithoutOperand;

    let offset = 0;
    const result: AST.CaseExpression = { type: "case", whenClauses };

    if (hasOperand) {
      result.operand = this.visit(expressions[0]);
      offset = 1;
    }

    for (let i = 0; i < whenCount; i++) {
      const whenIdx = offset + i * 2;
      const thenIdx = offset + i * 2 + 1;
      if (expressions[whenIdx] && expressions[thenIdx]) {
        whenClauses.push({
          when: this.visit(expressions[whenIdx]),
          then: this.visit(expressions[thenIdx]),
        });
      }
    }

    if (hasElse) {
      result.elseClause = this.visit(expressions[expressions.length - 1]);
    }

    return result;
  }

  functionName(ctx: any): string {
    if (ctx.identifier) {
      return this.visit(ctx.identifier).parts[0];
    }
    if (ctx.Left) return ctx.Left[0].image;
    if (ctx.Right) return ctx.Right[0].image;
    return "";
  }

  functionCall(ctx: any): AST.FunctionCall {
    const result: AST.FunctionCall = {
      type: "function",
      name: this.visit(ctx.functionName),
      args: [],
    };

    if (ctx.Star) {
      result.star = true;
    } else if (ctx.expression) {
      result.args = ctx.expression.map((e: CstNode) => this.visit(e));
    }

    if (ctx.Distinct) {
      result.distinct = true;
    }

    if (ctx.From) {
      result.fromSeparator = true;
    }

    if (ctx.Ignore) {
      result.ignoreNulls = true;
    }

    if (ctx.overClause) {
      result.over = this.visit(ctx.overClause);
    }

    return result;
  }

  identifierExpression(ctx: any): AST.Expression {
    const qualName: AST.QualifiedName = this.visit(ctx.qualifiedName);

    if (ctx.LParen) {
      // Function call (possibly schema-qualified)
      const result: AST.FunctionCall = {
        type: "function",
        name: qualName.parts.join("."),
        args: [],
      };
      if (ctx.Star) {
        result.star = true;
      } else if (ctx.expression) {
        result.args = ctx.expression.map((e: CstNode) => this.visit(e));
      }
      if (ctx.Distinct) {
        result.distinct = true;
      }
      if (ctx.From) {
        result.fromSeparator = true;
      }
      if (ctx.Ignore) {
        result.ignoreNulls = true;
      }
      if (ctx.selectStatement) {
        result.subquery = this.visit(ctx.selectStatement[0]);
      }
      if (ctx.overClause) {
        result.over = this.visit(ctx.overClause);
      }
      return result;
    }

    // Column reference
    return { type: "column", name: qualName };
  }

  overClause(ctx: any): AST.WindowSpecification {
    const result: AST.WindowSpecification = {
      type: "windowSpec",
    };

    if (ctx.windowPartitionByClause) {
      result.partitionBy = this.visit(ctx.windowPartitionByClause);
    }

    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause);
    }

    if (ctx.windowFrameClause) {
      result.frame = this.visit(ctx.windowFrameClause);
    }

    return result;
  }

  windowPartitionByClause(ctx: any): AST.Expression[] {
    return ctx.expression.map((e: CstNode) => this.visit(e));
  }

  windowFrameClause(ctx: any): AST.WindowFrame {
    let mode: string;
    if (ctx.Rows) mode = "rows";
    else if (ctx.Range) mode = "range";
    else if (ctx.Groups) mode = "groups";
    else mode = "cumulative";

    const result: AST.WindowFrame = {
      type: "windowFrame",
      mode,
    } as AST.WindowFrame;

    if (ctx.windowFrameBound && ctx.windowFrameBound.length > 0) {
      result.start = this.visit(ctx.windowFrameBound[0]);
      if (ctx.windowFrameBound.length > 1) {
        result.end = this.visit(ctx.windowFrameBound[1]);
      }
    }

    if (ctx.Exclude) {
      if (ctx.Current && ctx.Row) {
        result.exclude = "currentRow";
      } else if (ctx.No && ctx.Others) {
        result.exclude = "noOthers";
      } else if (ctx.Groups) {
        result.exclude = "groups";
      }
    }

    return result;
  }

  windowDefinitionClause(_ctx: any): any {
    // Handled at a higher level; this just satisfies the visitor validation
    return undefined;
  }

  windowFrameBound(ctx: any): AST.WindowFrameBound {
    if (ctx.Unbounded) {
      return {
        type: "windowFrameBound",
        kind: ctx.Preceding ? "unboundedPreceding" : "unboundedFollowing",
      };
    }

    if (ctx.Current) {
      return {
        type: "windowFrameBound",
        kind: "currentRow",
      };
    }

    if (ctx.durationExpression) {
      return {
        type: "windowFrameBound",
        kind: ctx.Preceding ? "preceding" : "following",
        duration: this.visit(ctx.durationExpression),
      };
    }

    return {
      type: "windowFrameBound",
      kind: ctx.Preceding ? "preceding" : "following",
      value: this.visit(ctx.expression),
    };
  }

  // ==========================================================================
  // Basic Elements
  // ==========================================================================

  literal(ctx: any): AST.Literal {
    if (ctx.NumberLiteral) {
      const image = this.tokenImage(ctx.NumberLiteral[0]);
      return {
        type: "literal",
        value: image.includes(".") ? parseFloat(image) : parseInt(image, 10),
        literalType: "number",
        raw: image,
      };
    }
    if (ctx.StringLiteral) {
      const raw = this.tokenImage(ctx.StringLiteral[0]);
      // Remove outer quotes and unescape '' to '
      const value = raw.slice(1, -1).replace(/''/g, "'");
      return {
        type: "literal",
        value,
        literalType: "string",
      };
    }
    if (ctx.True) {
      return { type: "literal", value: true, literalType: "boolean" };
    }
    if (ctx.False) {
      return { type: "literal", value: false, literalType: "boolean" };
    }
    if (ctx.Null) {
      return { type: "literal", value: null, literalType: "null" };
    }
    if (ctx.LongLiteral) {
      const image = this.tokenImage(ctx.LongLiteral[0]);
      return {
        type: "literal",
        value: parseInt(image.replace(/[Ll_]/g, ""), 10),
        literalType: "number",
        raw: image,
      };
    }
    if (ctx.DecimalLiteral) {
      const image = this.tokenImage(ctx.DecimalLiteral[0]);
      return {
        type: "literal",
        value: parseFloat(image.replace(/[m_]/g, "")),
        literalType: "number",
        raw: image,
      };
    }
    if (ctx.GeohashLiteral) {
      return {
        type: "literal",
        value: this.tokenImage(ctx.GeohashLiteral[0]),
        literalType: "geohash",
      };
    }
    if (ctx.GeohashBinaryLiteral) {
      return {
        type: "literal",
        value: this.tokenImage(ctx.GeohashBinaryLiteral[0]),
        literalType: "geohash",
      };
    }
    if (ctx.DurationLiteral) {
      return {
        type: "literal",
        value: this.tokenImage(ctx.DurationLiteral[0]),
        literalType: "duration",
      };
    }
    if (ctx.NaN) {
      return {
        type: "literal",
        value: NaN,
        literalType: "number",
      };
    }
    throw new Error("Unknown literal type");
  }

  booleanLiteral(ctx: any): boolean {
    return !!ctx.True;
  }

  stringOrIdentifier(ctx: any): string {
    if (ctx.StringLiteral) {
      return ctx.StringLiteral[0].image.slice(1, -1);
    }
    if (ctx.identifier) {
      return this.extractIdentifierName(ctx.identifier[0].children);
    }
    return this.extractMaybeString(ctx);
  }

  stringOrQualifiedName(ctx: any): AST.QualifiedName {
    if (ctx.StringLiteral) {
      return { type: "qualifiedName", parts: [ctx.StringLiteral[0].image.slice(1, -1)] };
    }
    if (ctx.qualifiedName) return this.visit(ctx.qualifiedName);
    return { type: "qualifiedName", parts: [] };
  }

  intervalValue(ctx: any): string {
    return this.extractMaybeString(ctx);
  }

  timeZoneValue(ctx: any): string {
    return this.extractMaybeString(ctx);
  }

  columnRef(ctx: any): AST.ColumnRef {
    return {
      type: "column",
      name: this.visit(ctx.qualifiedName),
    };
  }

  qualifiedName(ctx: any): AST.QualifiedName {
    const parts: string[] = ctx.identifier.map((id: CstNode) => {
      return this.extractIdentifierName(id.children);
    });

    return {
      type: "qualifiedName",
      parts,
    };
  }

  private extractMaybeString(node: any): string {
    if (!node) return "";
    const ctx = node.children ?? node;
    if (ctx.StringLiteral) {
      const raw = this.tokenImage(ctx.StringLiteral[0]);
      return raw.slice(1, -1);
    }
    if (ctx.NumberLiteral) {
      return this.tokenImage(ctx.NumberLiteral[0]);
    }
    if (ctx.DurationLiteral) {
      return this.tokenImage(ctx.DurationLiteral[0]);
    }
    if (ctx.Identifier) {
      return this.tokenImage(ctx.Identifier[0]);
    }
    if (ctx.QuotedIdentifier) {
      const raw = this.tokenImage(ctx.QuotedIdentifier[0]);
      return raw.slice(1, -1);
    }
    return "";
  }

  private extractTtl(ctx: any): { value: number; unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS" } {
    // Handle DurationLiteral (e.g., "2w", "12h", "30d")
    if (ctx.DurationLiteral) {
      const img = ctx.DurationLiteral[0].image;
      const match = img.match(/^(\d+)(.+)$/);
      if (match) {
        const DURATION_UNIT_MAP: Record<string, "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"> = {
          h: "HOURS", d: "DAYS", w: "WEEKS", M: "MONTHS", y: "YEARS",
        };
        return { value: parseInt(match[1], 10), unit: DURATION_UNIT_MAP[match[2]] ?? "DAYS" };
      }
    }
    // Handle NumberLiteral + optional timeUnit (e.g., "2 WEEKS")
    const value = parseInt(ctx.NumberLiteral?.[0]?.image ?? "0", 10);
    let unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS" = "DAYS";
    if (ctx.timeUnit) {
      unit = this.visit(ctx.timeUnit) as typeof unit;
    // Check plural forms first (TTL units) before singular (which may be PARTITION BY units)
    } else if (ctx.Hours) unit = "HOURS";
    else if (ctx.Days) unit = "DAYS";
    else if (ctx.Weeks) unit = "WEEKS";
    else if (ctx.Months) unit = "MONTHS";
    else if (ctx.Years) unit = "YEARS";
    else if (ctx.Hour) unit = "HOURS";
    else if (ctx.Day) unit = "DAYS";
    else if (ctx.Week) unit = "WEEKS";
    else if (ctx.Month) unit = "MONTHS";
    else if (ctx.Year) unit = "YEARS";
    return { value, unit };
  }

  // Helper to extract identifier name from any token (regular, quoted, or keyword)
  private extractIdentifierName(ctx: any): string {
    if (ctx.Identifier) {
      return this.tokenImage(ctx.Identifier[0] as IToken);
    }
    if (ctx.QuotedIdentifier) {
      const raw = this.tokenImage(ctx.QuotedIdentifier[0] as IToken);
      return raw.slice(1, -1);
    }
    // Handle keyword tokens used as identifiers
    // Find the first token in the context
    for (const key of Object.keys(ctx)) {
      const tokens = ctx[key];
      if (Array.isArray(tokens) && tokens.length > 0) {
        const token = tokens[0];
        if (token && typeof token.image === "string") {
          return token.image;
        }
      }
    }
    return "";
  }

  identifier(ctx: any): AST.QualifiedName {
    const name = this.extractIdentifierName(ctx);
    return {
      type: "qualifiedName",
      parts: [name],
    };
  }
}

export const visitor = new QuestDBVisitor();
