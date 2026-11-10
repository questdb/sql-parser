// =============================================================================
// CST to AST Visitor
// =============================================================================

import { CstNode, CstElement, IToken } from "chevrotain"

/** A record of CstElement arrays — matches both CstChildren types and CstNode.children */
type CstChildrenRecord = Record<string, CstElement[] | undefined>

import { parser } from "./parser"
import * as AST from "./ast"
import { expressionToSql } from "./toSql"
import type {
  AddUserStatementCstChildren,
  AdditiveExpressionCstChildren,
  AlignToClauseCstChildren,
  AlterGroupStatementCstChildren,
  AlterMaterializedViewActionCstChildren,
  AlterMaterializedViewStatementCstChildren,
  AlterServiceAccountStatementCstChildren,
  AlterStatementCstChildren,
  AlterTableActionCstChildren,
  AlterTableForceActionCstChildren,
  AlterTableStatementCstChildren,
  AlterUserActionCstChildren,
  AlterUserStatementCstChildren,
  AlterLiveViewStatementCstChildren,
  AlterViewStatementCstChildren,
  AnchorClauseCstChildren,
  AndExpressionCstChildren,
  ArrayBracketBodyCstChildren,
  ArrayElementCstChildren,
  ArrayLiteralCstChildren,
  ArraySubscriptCstChildren,
  AsofLtJoinCstChildren,
  AssumeServiceAccountStatementCstChildren,
  BackupStatementCstChildren,
  BatchClauseCstChildren,
  BitAndExpressionCstChildren,
  BitOrExpressionCstChildren,
  BitXorExpressionCstChildren,
  BooleanLiteralCstChildren,
  CancelQueryStatementCstChildren,
  CaseExpressionCstChildren,
  CastDefinitionCstChildren,
  CastExpressionCstChildren,
  CheckpointStatementCstChildren,
  ColumnDefinitionCstChildren,
  ColumnRefCstChildren,
  CompileViewStatementCstChildren,
  ConcatExpressionCstChildren,
  Ipv4ContainmentExpressionCstChildren,
  ConvertPartitionTargetCstChildren,
  CopyCancelCstChildren,
  CopyPermissionsCstChildren,
  CopyFromCstChildren,
  CopyOptionCstChildren,
  CopyOptionsCstChildren,
  CopyStatementCstChildren,
  CopyToCstChildren,
  CreateGroupStatementCstChildren,
  CreateLiveViewBodyCstChildren,
  CreateMaterializedViewBodyCstChildren,
  CreateServiceAccountStatementCstChildren,
  CreateStatementCstChildren,
  CreateTableBodyCstChildren,
  CreateUserStatementCstChildren,
  CreateViewBodyCstChildren,
  CteDefinitionCstChildren,
  DataTypeCstChildren,
  DeclareAssignmentCstChildren,
  DeclareClauseCstChildren,
  DedupClauseCstChildren,
  DedupKeywordCstChildren,
  DedupModeKeysCstChildren,
  DropGroupStatementCstChildren,
  DropMaterializedViewStatementCstChildren,
  DropServiceAccountStatementCstChildren,
  DropStatementCstChildren,
  DropTableStatementCstChildren,
  DropUserStatementCstChildren,
  DropLiveViewStatementCstChildren,
  DropViewStatementCstChildren,
  DurationExpressionCstChildren,
  EqualityExpressionCstChildren,
  ExitServiceAccountStatementCstChildren,
  ExpireRowsClauseCstChildren,
  ExplainStatementCstChildren,
  ExpressionCstChildren,
  FillClauseCstChildren,
  FillValueCstChildren,
  AliasTimestampDesignationCstChildren,
  MemoryLimitCstChildren,
  FromClauseCstChildren,
  FromSourceCstChildren,
  FromToClauseCstChildren,
  FunctionCallCstChildren,
  FunctionNameCstChildren,
  GrantAssumeServiceAccountStatementCstChildren,
  GrantStatementCstChildren,
  GrantTableTargetCstChildren,
  GroupByClauseCstChildren,
  GroupingSetCstChildren,
  GroupingSetsSpecCstChildren,
  ExplicitGroupingSetsCstChildren,
  RollupOrCubeSpecCstChildren,
  IdentifierCstChildren,
  IdentifierCstNode,
  IdentifierExpressionCstChildren,
  ImplicitSelectBodyCstChildren,
  ImplicitSelectStatementCstChildren,
  IndexDefinitionCstChildren,
  IndexTypeOptionsCstChildren,
  InsertStatementCstChildren,
  IntervalValueCstChildren,
  JoinClauseCstChildren,
  LatestOnClauseCstChildren,
  LatestOnColumnCstChildren,
  LimitClauseCstChildren,
  LiteralCstChildren,
  TimestampWithTimeZoneLiteralCstChildren,
  MaterializedViewPartitionCstChildren,
  MaterializedViewPeriodCstChildren,
  MaterializedViewRefreshCstChildren,
  MultiplicativeExpressionCstChildren,
  NotExpressionCstChildren,
  OrExpressionCstChildren,
  OrderByClauseCstChildren,
  OrderByItemCstChildren,
  OverClauseCstChildren,
  OptionalExpireRowsCstChildren,
  OptionalStoragePolicyCstChildren,
  OptionalTableFormatCstChildren,
  ParquetCompressionCstChildren,
  ParquetConfigCstChildren,
  ParquetEncodingCstChildren,
  PartitionPeriodCstChildren,
  PermissionListCstChildren,
  PermissionTokenCstChildren,
  PivotAggregationCstChildren,
  PivotBodyCstChildren,
  PivotForClauseCstChildren,
  PivotInValueCstChildren,
  PivotStatementCstChildren,
  PrimaryExpressionCstChildren,
  QualifiedNameCstChildren,
  QualifiedStarCstChildren,
  ReindexTableStatementCstChildren,
  RefreshMaterializedViewStatementCstChildren,
  RelationalExpressionCstChildren,
  RemoveUserStatementCstChildren,
  RenameTableStatementCstChildren,
  ResumeWalStatementCstChildren,
  RevokeAssumeServiceAccountStatementCstChildren,
  RevokeStatementCstChildren,
  SampleByClauseCstChildren,
  SubsampleClauseCstChildren,
  SelectItemCstChildren,
  SelectListCstChildren,
  SelectBodyCstChildren,
  PrefixedQueryBodyCstChildren,
  SelectStatementCstChildren,
  SetClauseCstChildren,
  SetExpressionCstChildren,
  SetOperationCstChildren,
  SetTypeStatementCstChildren,
  ShowCreateDatabaseCategoryCstChildren,
  ShowStatementCstChildren,
  SimpleSelectCstChildren,
  SnapshotStatementCstChildren,
  SpliceJoinCstChildren,
  StoragePolicyClauseCstChildren,
  StoragePolicyCstChildren,
  StoragePolicyTimeUnitCstChildren,
  StoragePolicyTtlCstChildren,
  TtlClauseCstChildren,
  HorizonJoinCstChildren,
  HorizonOffsetCstChildren,
  StandardJoinCstChildren,
  StatementCstChildren,
  StatementsCstChildren,
  StringOrIdentifierCstChildren,
  StringOrQualifiedNameCstChildren,
  TableFunctionCallCstChildren,
  TableFunctionNameCstChildren,
  SwitchStatementCstChildren,
  TableFormatKindCstChildren,
  TableNameCstChildren,
  TableNameOrStringCstChildren,
  TableParamCstChildren,
  TableParamNameCstChildren,
  TableRefCstChildren,
  TimeUnitCstChildren,
  TimeZoneValueCstChildren,
  TruncateTableStatementCstChildren,
  TypeCastExpressionCstChildren,
  CastDataTypeCstChildren,
  TimestampWithTimeZoneTypeCstChildren,
  DoublePrecisionTypeCstChildren,
  UnaryExpressionCstChildren,
  UnnestArgCstChildren,
  UnnestClauseCstChildren,
  UnnestColumnDefCstChildren,
  UpdateStatementCstChildren,
  VacuumTableStatementCstChildren,
  ValuesClauseCstChildren,
  ValuesListCstChildren,
  WhereClauseCstChildren,
  WindowClauseCstChildren,
  WindowFrameBoundCstChildren,
  WindowFrameClauseCstChildren,
  WindowJoinBoundCstChildren,
  WindowJoinCstChildren,
  WindowPartitionByClauseCstChildren,
  WindowSpecCstChildren,
  NamedWindowCstChildren,
  WithClauseCstChildren,
  WithStatementCstChildren,
} from "./cst-types"

type FromToClauseResult = { from?: AST.Expression; to?: AST.Expression }
type BatchClauseResult = { size: number; o3MaxLag?: string }
type ConvertPartitionTargetResult = {
  partitions?: string[]
  target: string
  where?: AST.Expression
  withParams?: AST.TableParam[]
}
type GroupByClauseResult = {
  groupBy?: AST.Expression[]
  groupingSets?: AST.GroupingSets
}
type PivotBodyResult = {
  aggregations: AST.PivotAggregation[]
  pivots: AST.PivotForClause[]
  groupBy?: AST.Expression[]
}

// QuestDB allows `_` as a digit separator in numeric literals (e.g. `1_000_000`).
// JavaScript's parseInt stops at the first `_`, so `parseInt("1_000", 10)` is 1.
// Strip separators before parsing whenever the input is a token image.
function tokenInt(image: string): number {
  return parseInt(image.replace(/_/g, ""), 10)
}

// parseFloat keeps fractional and exponent literals faithful — parseInt would
// silently read "1e9" as 1 and ".5" as NaN. The server validates the value.
function tokenFloat(image: string): number {
  return parseFloat(image.replace(/_/g, ""))
}

// Value of a single-quoted SQL string token: strip the outer quotes and turn
// the '' escape into '. toSql re-escapes with escapeString, so the SQL text
// round-trips unchanged. Single-quoted NAMES printed back as "..." identifiers
// (FROM 'x', stringOrQualifiedName, tableNameOrString, OWNED BY) deliberately
// do not use this: the server's GenericLexer.unquote only strips the outer
// quotes, so FROM 'it''s' names table it''s (questdb-ent
// EntShowCreateSupportTest: CREATE USER 'o''brien' stores o''brien), which is
// what "it''s" means too.
function unquoteSingle(image: string): string {
  return image.slice(1, -1).replace(/''/g, "'")
}

// Strip a QuotedIdentifier's quotes. "..." unescapes "" (as before); a
// `...` identifier has no escapes (GenericLexer), its content is verbatim.
function unquoteIdentifier(image: string): string {
  const inner = image.slice(1, -1)
  return image.startsWith("`") ? inner : inner.replace(/""/g, '"')
}

type StoragePolicyKind = "toParquet" | "toRemote" | "dropLocal" | "dropRemote"

type DedupModeKeys = { mode: AST.DedupMode; keys: string[] }

// Get the base visitor class from the parser
const BaseVisitor = parser.getBaseCstVisitorConstructor()

class QuestDBVisitor extends BaseVisitor {
  constructor() {
    super()
    this.validateVisitor()
  }

  // Helper to extract token image
  private tokenImage(token: IToken | undefined): string {
    return token?.image ?? ""
  }

  /** Return the image of the first token found in a single-alternative CST children record. */
  private firstTokenImage(ctx: CstChildrenRecord): string | undefined {
    for (const key of Object.keys(ctx)) {
      const tokens = (ctx as Record<string, IToken[]>)[key]
      if (Array.isArray(tokens) && tokens.length > 0 && tokens[0].image) {
        return tokens[0].image
      }
    }
    return undefined
  }

  // ==========================================================================
  // Entry Points
  // ==========================================================================

  statements(ctx: StatementsCstChildren): AST.Statement[] {
    if (!ctx.statement) return []
    return ctx.statement.map((s: CstNode) => this.visit(s) as AST.Statement)
  }

  statement(ctx: StatementCstChildren): AST.Statement {
    if (ctx.withStatement) {
      return this.visit(ctx.withStatement) as AST.Statement
    }
    if (ctx.selectStatement) {
      return this.visit(ctx.selectStatement) as AST.SelectStatement
    }
    if (ctx.insertStatement) {
      return this.visit(ctx.insertStatement) as AST.InsertStatement
    }
    if (ctx.updateStatement) {
      return this.visit(ctx.updateStatement) as AST.UpdateStatement
    }
    if (ctx.createStatement) {
      return this.visit(ctx.createStatement) as AST.Statement
    }
    if (ctx.dropStatement) {
      return this.visit(ctx.dropStatement) as AST.Statement
    }
    if (ctx.truncateTableStatement) {
      return this.visit(
        ctx.truncateTableStatement,
      ) as AST.TruncateTableStatement
    }
    if (ctx.renameTableStatement) {
      return this.visit(ctx.renameTableStatement) as AST.RenameTableStatement
    }
    if (ctx.addUserStatement) {
      return this.visit(ctx.addUserStatement) as AST.AddUserStatement
    }
    if (ctx.removeUserStatement) {
      return this.visit(ctx.removeUserStatement) as AST.RemoveUserStatement
    }
    if (ctx.assumeServiceAccountStatement) {
      return this.visit(
        ctx.assumeServiceAccountStatement,
      ) as AST.AssumeServiceAccountStatement
    }
    if (ctx.exitServiceAccountStatement) {
      return this.visit(
        ctx.exitServiceAccountStatement,
      ) as AST.ExitServiceAccountStatement
    }
    if (ctx.cancelQueryStatement) {
      return this.visit(ctx.cancelQueryStatement) as AST.CancelQueryStatement
    }
    if (ctx.showStatement) {
      return this.visit(ctx.showStatement) as AST.ShowStatement
    }
    if (ctx.explainStatement) {
      return this.visit(ctx.explainStatement) as AST.ExplainStatement
    }
    if (ctx.alterStatement) {
      return this.visit(ctx.alterStatement) as AST.Statement
    }
    if (ctx.copyStatement) {
      return this.visit(ctx.copyStatement) as AST.CopyStatement
    }
    if (ctx.checkpointStatement) {
      return this.visit(ctx.checkpointStatement) as AST.CheckpointStatement
    }
    if (ctx.snapshotStatement) {
      return this.visit(ctx.snapshotStatement) as AST.SnapshotStatement
    }
    if (ctx.grantStatement) {
      return this.visit(ctx.grantStatement) as AST.GrantStatement
    }
    if (ctx.revokeStatement) {
      return this.visit(ctx.revokeStatement) as AST.RevokeStatement
    }
    if (ctx.grantAssumeServiceAccountStatement) {
      return this.visit(
        ctx.grantAssumeServiceAccountStatement,
      ) as AST.GrantAssumeServiceAccountStatement
    }
    if (ctx.revokeAssumeServiceAccountStatement) {
      return this.visit(
        ctx.revokeAssumeServiceAccountStatement,
      ) as AST.RevokeAssumeServiceAccountStatement
    }
    if (ctx.vacuumTableStatement) {
      return this.visit(ctx.vacuumTableStatement) as AST.VacuumTableStatement
    }
    if (ctx.resumeWalStatement) {
      return this.visit(ctx.resumeWalStatement) as AST.ResumeWalStatement
    }
    if (ctx.setTypeStatement) {
      return this.visit(ctx.setTypeStatement) as AST.SetTypeStatement
    }
    if (ctx.reindexTableStatement) {
      return this.visit(ctx.reindexTableStatement) as AST.ReindexTableStatement
    }
    if (ctx.refreshMaterializedViewStatement) {
      return this.visit(
        ctx.refreshMaterializedViewStatement,
      ) as AST.RefreshMaterializedViewStatement
    }
    if (ctx.pivotStatement) {
      return this.visit(ctx.pivotStatement) as AST.PivotStatement
    }
    if (ctx.backupStatement) {
      return this.visit(ctx.backupStatement) as AST.BackupStatement
    }
    if (ctx.switchStatement) {
      return this.visit(ctx.switchStatement) as AST.SwitchStatement
    }
    if (ctx.compileViewStatement) {
      return this.visit(ctx.compileViewStatement) as AST.CompileViewStatement
    }
    if (ctx.implicitSelectStatement) {
      return this.visit(ctx.implicitSelectStatement) as AST.SelectStatement
    }
    throw new Error("Unknown statement type")
  }

  // ==========================================================================
  // WITH Statement (WITH ... SELECT/INSERT/UPDATE)
  // ==========================================================================

  withStatement(ctx: WithStatementCstChildren): AST.Statement {
    const ctes = this.visit(ctx.withClause) as AST.CTE[]

    let inner: AST.InsertStatement | AST.UpdateStatement | AST.SelectStatement
    if (ctx.insertStatement) {
      inner = this.visit(ctx.insertStatement) as AST.InsertStatement
    } else if (ctx.updateStatement) {
      inner = this.visit(ctx.updateStatement) as AST.UpdateStatement
    } else if (ctx.selectBody) {
      inner = this.visit(ctx.selectBody) as AST.SelectStatement
    } else if (ctx.implicitSelectStatement) {
      inner = this.visit(ctx.implicitSelectStatement) as AST.SelectStatement
    } else {
      throw new Error("withStatement: expected insert, update, or select")
    }

    inner.with = ctes
    return inner
  }

  // ==========================================================================
  // SELECT Statement
  // ==========================================================================

  selectStatement(ctx: SelectStatementCstChildren): AST.SelectStatement {
    const result = (
      ctx.selectBody
        ? this.visit(ctx.selectBody)
        : this.visit(ctx.prefixedQueryBody!)
    ) as AST.SelectStatement

    if (ctx.declareClause) {
      result.declare = this.visit(ctx.declareClause) as AST.DeclareClause
    }

    if (ctx.withClause) {
      result.with = this.visit(ctx.withClause) as AST.CTE[]
    }

    return result
  }

  prefixedQueryBody(ctx: PrefixedQueryBodyCstChildren): AST.SelectStatement {
    return (
      ctx.selectBody
        ? this.visit(ctx.selectBody)
        : this.visit(ctx.implicitSelectStatement!)
    ) as AST.SelectStatement
  }

  selectBody(ctx: SelectBodyCstChildren): AST.SelectStatement {
    const result = this.visit(ctx.simpleSelect) as AST.SelectStatement

    if (ctx.setOperation && ctx.setOperation.length > 0) {
      result.setOperations = ctx.setOperation.map(
        (op: CstNode) => this.visit(op) as AST.SetOperation,
      )
    }

    return result
  }

  withClause(ctx: WithClauseCstChildren): AST.CTE[] {
    return ctx.cteDefinition.map((cte: CstNode) => this.visit(cte) as AST.CTE)
  }

  cteDefinition(ctx: CteDefinitionCstChildren): AST.CTE {
    const query = ctx.selectStatement
      ? (this.visit(ctx.selectStatement) as AST.SelectStatement)
      : (this.visit(ctx.implicitSelectStatement!) as AST.SelectStatement)
    return {
      type: "cte",
      name: this.extractIdentifierName(ctx.identifier[0].children),
      query,
    }
  }

  simpleSelect(ctx: SimpleSelectCstChildren): AST.SelectStatement {
    const result: AST.SelectStatement = {
      type: "select",
      columns: this.visit(ctx.selectList) as AST.SelectItem[],
    }

    if (ctx.Distinct) {
      result.distinct = true
    }

    if (ctx.fromClause) {
      result.from = this.visit(ctx.fromClause) as AST.TableRef[]
    }

    if (ctx.whereClause) {
      result.where = this.visit(ctx.whereClause) as AST.Expression
    }

    if (ctx.sampleByClause) {
      result.sampleBy = this.visit(ctx.sampleByClause) as AST.SampleByClause
    }

    if (ctx.latestOnClause) {
      result.latestOn = this.visit(ctx.latestOnClause) as AST.LatestOnClause
    }

    if (ctx.groupByClause) {
      const groupBy = this.visit(ctx.groupByClause) as GroupByClauseResult
      if (groupBy.groupBy) result.groupBy = groupBy.groupBy
      if (groupBy.groupingSets) result.groupingSets = groupBy.groupingSets
    }

    if (ctx.pivotBody) {
      const body = this.visit(ctx.pivotBody) as PivotBodyResult
      result.pivot = {
        type: "pivotClause",
        aggregations: body.aggregations,
        pivots: body.pivots,
        groupBy: body.groupBy,
      }
      this.markPivotPosition(result, ctx)
    }

    if (ctx.windowClause) {
      result.namedWindows = this.visit(ctx.windowClause) as AST.NamedWindow[]
    }

    if (ctx.subsampleClause) {
      result.subsample = this.visit(ctx.subsampleClause) as AST.SubsampleClause
    }

    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause) as AST.OrderByItem[]
    }

    if (ctx.limitClause) {
      result.limit = this.visit(ctx.limitClause) as AST.LimitClause
    }

    return result
  }

  setOperation(ctx: SetOperationCstChildren): AST.SetOperation {
    let operator: "UNION" | "EXCEPT" | "INTERSECT" = "UNION"
    if (ctx.Union) operator = "UNION"
    else if (ctx.Except) operator = "EXCEPT"
    else if (ctx.Intersect) operator = "INTERSECT"

    const select = ctx.simpleSelect
      ? (this.visit(ctx.simpleSelect) as AST.SelectStatement)
      : ctx.selectStatement
        ? (this.visit(ctx.selectStatement) as AST.SelectStatement)
        : (this.visit(ctx.implicitSelectBody!) as AST.SelectStatement)

    const result: AST.SetOperation = {
      type: "setOperation",
      operator,
      select,
    }

    if (ctx.All) {
      result.all = true
    }

    return result
  }

  selectList(ctx: SelectListCstChildren): AST.SelectItem[] {
    if (ctx.Star) {
      const items: AST.SelectItem[] = [{ type: "star" }]
      // Additional items after *: SELECT *, rank() OVER () ...
      if (ctx.selectItem) {
        for (const item of ctx.selectItem) {
          items.push(this.visit(item) as AST.SelectItem)
        }
      }
      return items
    }
    const items: AST.SelectItem[] = []
    if (ctx.selectItem) {
      for (const item of ctx.selectItem) {
        items.push(this.visit(item) as AST.SelectItem)
      }
    }
    return items
  }

  selectItem(ctx: SelectItemCstChildren): AST.SelectItem {
    if (ctx.qualifiedStar) {
      const result: AST.QualifiedStarSelectItem = {
        type: "qualifiedStar",
        qualifier: this.visit(ctx.qualifiedStar) as AST.QualifiedName,
      }
      if (ctx.identifier) {
        result.alias = (
          this.visit(ctx.identifier) as AST.QualifiedName
        ).parts[0]
      }
      return result
    }

    // Bare * appearing as a non-first select item (e.g., SELECT amount, *)
    if (ctx.Star) {
      return { type: "star" }
    }

    const result: AST.ExpressionSelectItem = {
      type: "selectItem",
      expression: this.visit(ctx.expression!) as AST.Expression,
    }

    if (ctx.identifier) {
      result.alias = (this.visit(ctx.identifier) as AST.QualifiedName).parts[0]
    }

    return result
  }

  qualifiedStar(ctx: QualifiedStarCstChildren): AST.QualifiedName {
    const parts: string[] = ctx.identifier.map((id: CstNode) =>
      this.extractIdentifierName(id.children),
    )
    return {
      type: "qualifiedName",
      parts,
    }
  }

  // ==========================================================================
  // FROM Clause
  // ==========================================================================

  fromClause(ctx: FromClauseCstChildren): AST.TableRef[] {
    const tables: AST.TableRef[] = []
    let lateralIndex = 0

    if (ctx.fromSource) {
      // Handle all from sources (first one and any comma-separated ones)
      for (let i = 0; i < ctx.fromSource.length; i++) {
        const source = ctx.fromSource[i]
        const table = this.visit(source) as AST.TableRef
        // Comma-separated items after the first may have LATERAL before the source.
        // Match each flat LATERAL token to the next source that starts after it.
        const sourceOffset = this.getFirstTokenOffset(source)
        if (
          i > 0 &&
          ctx.Lateral?.[lateralIndex] &&
          ctx.Lateral[lateralIndex].startOffset < sourceOffset
        ) {
          table.lateral = true
          lateralIndex++
        }
        tables.push(table)
      }

      // Attach joins to the first table (legacy behavior)
      if (ctx.joinClause && tables.length > 0) {
        tables[0].joins = ctx.joinClause.map(
          (j: CstNode) => this.visit(j) as AST.JoinClause,
        )
      }
    }

    return tables
  }

  fromSource(ctx: FromSourceCstChildren): AST.TableRef {
    if (ctx.unnestClause) {
      return this.visit(ctx.unnestClause) as AST.TableRef
    }
    return this.visit(ctx.tableRef!) as AST.TableRef
  }

  unnestArg(ctx: UnnestArgCstChildren): AST.UnnestArg {
    const result: AST.UnnestArg = {
      type: "unnestArg",
      expression: this.visit(ctx.expression) as AST.Expression,
    }
    if (ctx.unnestColumnDef && ctx.unnestColumnDef.length > 0) {
      result.columns = ctx.unnestColumnDef.map(
        (c: CstNode) => this.visit(c) as AST.UnnestColumnDef,
      )
    }
    return result
  }

  unnestColumnDef(ctx: UnnestColumnDefCstChildren): AST.UnnestColumnDef {
    return {
      type: "unnestColumnDef",
      name: this.extractIdentifierName(ctx.identifier[0].children),
      dataType: this.visit(ctx.dataType) as string,
    }
  }

  unnestClause(ctx: UnnestClauseCstChildren): AST.TableRef {
    const unnest: AST.UnnestSource = {
      type: "unnest",
      args: ctx.unnestArg.map((a: CstNode) => this.visit(a) as AST.UnnestArg),
    }
    if (ctx.With && ctx.Ordinality) {
      unnest.withOrdinality = true
    }
    const result: AST.TableRef = {
      type: "tableRef",
      table: unnest,
    }
    if (ctx.unnestAlias) {
      result.alias = this.extractIdentifierName(ctx.unnestAlias[0].children)
    }
    if (ctx.identifier && ctx.identifier.length > 0) {
      result.columnAliases = ctx.identifier.map((id: CstNode) =>
        this.extractIdentifierName(id.children),
      )
    }
    return result
  }

  implicitSelectBody(ctx: ImplicitSelectBodyCstChildren): AST.SelectStatement {
    const result: AST.SelectStatement = {
      type: "select",
      implicit: true,
      columns: [{ type: "star" } as AST.SelectItem],
    }
    if (ctx.fromClause) {
      result.from = this.visitSafe(ctx.fromClause) as AST.TableRef[]
    }
    if (ctx.whereClause) {
      result.where = this.visitSafe(ctx.whereClause) as AST.Expression
    }
    if (ctx.sampleByClause) {
      result.sampleBy = this.visitSafe(ctx.sampleByClause) as AST.SampleByClause
    }
    if (ctx.latestOnClause) {
      result.latestOn = this.visitSafe(ctx.latestOnClause) as AST.LatestOnClause
    }
    if (ctx.groupByClause) {
      const groupBy = this.visitSafe(ctx.groupByClause) as
        | GroupByClauseResult
        | undefined
      if (groupBy?.groupBy) result.groupBy = groupBy.groupBy
      if (groupBy?.groupingSets) result.groupingSets = groupBy.groupingSets
    }
    if (ctx.pivotBody) {
      const body = this.visitSafe(ctx.pivotBody) as PivotBodyResult | undefined
      if (body) {
        result.pivot = {
          type: "pivotClause",
          aggregations: body.aggregations,
          pivots: body.pivots,
          groupBy: body.groupBy,
        }
        this.markPivotPosition(result, ctx)
      }
    }
    if (ctx.subsampleClause) {
      result.subsample = this.visitSafe(
        ctx.subsampleClause,
      ) as AST.SubsampleClause
    }
    if (ctx.orderByClause) {
      result.orderBy = this.visitSafe(ctx.orderByClause) as AST.OrderByItem[]
    }
    if (ctx.limitClause) {
      result.limit = this.visitSafe(ctx.limitClause) as AST.LimitClause
    }
    return result
  }

  implicitSelectStatement(
    ctx: ImplicitSelectStatementCstChildren,
  ): AST.SelectStatement {
    const result = this.visit(ctx.implicitSelectBody) as AST.SelectStatement
    if (ctx.setOperation && ctx.setOperation.length > 0) {
      result.setOperations = ctx.setOperation.map(
        (op: CstNode) => this.visit(op) as AST.SetOperation,
      )
    }
    return result
  }

  tableRef(ctx: TableRefCstChildren): AST.TableRef {
    let table: AST.TableRef["table"]
    if (ctx.selectStatement) {
      table = this.visit(ctx.selectStatement) as AST.SelectStatement
    } else if (ctx.showStatement) {
      table = this.visit(ctx.showStatement) as AST.ShowStatement
    } else if (ctx.implicitSelectStatement) {
      table = this.visit(ctx.implicitSelectStatement) as AST.SelectStatement
    } else if (ctx.tableFunctionCall) {
      table = this.visit(ctx.tableFunctionCall) as AST.TableFunctionCall
    } else if (ctx.VariableReference) {
      // @variable as table source (DECLARE variable reference)
      const varImage = ctx.VariableReference[0].image // e.g. "@subquery"
      table = { type: "qualifiedName", parts: [varImage] } as AST.QualifiedName
    } else if (ctx.StringLiteral) {
      // Single-quoted table name: FROM 'sys.copy_export_log'. Kept verbatim
      // (no '' unescape), like the server's GenericLexer.unquote.
      table = {
        type: "qualifiedName",
        parts: [ctx.StringLiteral[0].image.slice(1, -1)],
      } as AST.QualifiedName
    } else {
      table = this.visit(ctx.tableName!) as AST.QualifiedName
    }

    const result: AST.TableRef = {
      type: "tableRef",
      table,
    }

    if (ctx.identifier) {
      result.alias = (this.visit(ctx.identifier) as AST.QualifiedName).parts[0]
    }

    if (ctx.columnRef) {
      const colRef = this.visit(ctx.columnRef) as AST.ColumnRef
      result.timestampDesignation = colRef.name.parts.join(".")
    }

    if (ctx.aliasTimestampDesignation) {
      result.timestampDesignation = this.visit(
        ctx.aliasTimestampDesignation,
      ) as string
      result.timestampAfterAlias = true
    }

    return result
  }

  aliasTimestampDesignation(ctx: AliasTimestampDesignationCstChildren): string {
    const colRef = this.visit(ctx.columnRef) as AST.ColumnRef
    return colRef.name.parts.join(".")
  }

  tableFunctionCall(ctx: TableFunctionCallCstChildren): AST.TableFunctionCall {
    let name: string
    if (ctx.tableFunctionName) {
      const fnName = ctx.tableFunctionName[0]
      if (fnName.children?.identifier) {
        name = (fnName.children.identifier as CstNode[])
          .map((i) => (this.visit(i) as AST.QualifiedName).parts.join("."))
          .join(".")
      } else {
        name = "unknown"
      }
    } else {
      name = "unknown"
    }

    const args: AST.Expression[] = []
    if (ctx.expression) {
      for (const expr of ctx.expression) {
        args.push(this.visit(expr) as AST.Expression)
      }
    }

    return {
      type: "tableFunctionCall",
      name,
      args,
    }
  }

  tableFunctionName(_ctx: TableFunctionNameCstChildren): string | undefined {
    // Handled inline by tableFunctionCall
    return undefined
  }

  joinClause(ctx: JoinClauseCstChildren): AST.JoinClause {
    if (ctx.asofLtJoin) return this.visit(ctx.asofLtJoin) as AST.JoinClause
    if (ctx.spliceJoin) return this.visit(ctx.spliceJoin) as AST.JoinClause
    if (ctx.windowJoin) return this.visit(ctx.windowJoin) as AST.JoinClause
    if (ctx.horizonJoin) return this.visit(ctx.horizonJoin) as AST.JoinClause
    return this.visit(ctx.standardJoin!) as AST.JoinClause
  }

  asofLtJoin(ctx: AsofLtJoinCstChildren): AST.JoinClause {
    const result: AST.JoinClause = {
      type: "join",
      table: this.visit(ctx.tableRef) as AST.TableRef,
    }
    if (ctx.Asof) result.joinType = "asof"
    else if (ctx.Lt) result.joinType = "lt"
    if (ctx.expression) {
      result.on = this.visit(ctx.expression) as AST.Expression
    }
    if (ctx.DurationLiteral) {
      result.tolerance = ctx.DurationLiteral[0].image
    }
    return result
  }

  spliceJoin(ctx: SpliceJoinCstChildren): AST.JoinClause {
    const result: AST.JoinClause = {
      type: "join",
      joinType: "splice",
      table: this.visit(ctx.tableRef) as AST.TableRef,
    }
    if (ctx.expression) {
      result.on = this.visit(ctx.expression) as AST.Expression
    }
    return result
  }

  windowJoin(ctx: WindowJoinCstChildren): AST.JoinClause {
    const result: AST.JoinClause = {
      type: "join",
      table: this.visit(ctx.tableRef) as AST.TableRef,
    }
    if (ctx.Window) result.joinType = "window"
    if (ctx.expression) {
      result.on = this.visit(ctx.expression) as AST.Expression
    }
    if (ctx.windowJoinBound && ctx.windowJoinBound.length >= 2) {
      result.range = {
        start: this.visit(ctx.windowJoinBound[0]) as AST.WindowJoinBound,
        end: this.visit(ctx.windowJoinBound[1]) as AST.WindowJoinBound,
      }
    }
    if (ctx.Include || ctx.Exclude) {
      result.prevailing = ctx.Include ? "include" : "exclude"
    }
    return result
  }

  horizonJoin(ctx: HorizonJoinCstChildren): AST.JoinClause {
    const tableRef = this.visit(ctx.tableRef) as AST.TableRef

    const result: AST.JoinClause = {
      type: "join",
      joinType: "horizon",
      table: tableRef,
    }
    if (ctx.expression) {
      result.on = this.visit(ctx.expression) as AST.Expression
    }
    if (ctx.Range) {
      // RANGE form: horizonOffset[0]=from, [1]=to, [2]=step
      const offsets = ctx.horizonOffset!
      result.horizonRange = {
        from: this.visit(offsets[0]) as string,
        to: this.visit(offsets[1]) as string,
        step: this.visit(offsets[2]) as string,
      }
    } else if (ctx.List) {
      // LIST form: all horizonOffset children are list entries
      result.horizonList = ctx.horizonOffset!.map(
        (o) => this.visit(o) as string,
      )
    }
    // Horizon alias (the trailing `AS <x>`) exists only with a RANGE/LIST
    // clause. Non-last joins in a chain have none (#6881).
    if ((ctx.Range || ctx.List) && ctx.identifier) {
      result.horizonAlias = (
        this.visit(ctx.identifier[0]) as AST.QualifiedName
      ).parts[0]
    }
    return result
  }

  horizonOffset(ctx: HorizonOffsetCstChildren): string {
    const sign = ctx.Minus ? "-" : ctx.Plus ? "+" : ""
    if (ctx.DurationLiteral) {
      return sign + ctx.DurationLiteral[0].image
    }
    return sign + ctx.NumberLiteral![0].image
  }

  standardJoin(ctx: StandardJoinCstChildren): AST.JoinClause {
    const result: AST.JoinClause = {
      type: "join",
      table: this.visit(ctx.fromSource) as AST.TableRef,
    }
    if (ctx.Inner) result.joinType = "inner"
    else if (ctx.Left) result.joinType = "left"
    else if (ctx.Right) result.joinType = "right"
    else if (ctx.Full) result.joinType = "full"
    else if (ctx.Cross) result.joinType = "cross"
    if (ctx.Outer) result.outer = true
    if (ctx.Lateral) result.lateral = true
    if (ctx.expression) {
      result.on = this.visit(ctx.expression) as AST.Expression
    }
    return result
  }

  windowJoinBound(ctx: WindowJoinBoundCstChildren): AST.WindowJoinBound {
    const result: AST.WindowJoinBound = {
      type: "windowJoinBound",
      boundType: ctx.Current ? "currentRow" : "duration",
    }
    if (ctx.Preceding) {
      result.direction = "preceding"
    } else if (ctx.Following) {
      result.direction = "following"
    }
    if (ctx.durationExpression) {
      result.duration = this.visit(ctx.durationExpression) as string
    } else if (ctx.expression) {
      result.boundExpr = this.visit(ctx.expression[0]) as AST.Expression
      if (ctx.timeUnit) {
        result.unit = this.visit(ctx.timeUnit[0]) as string
      }
    }
    return result
  }

  durationExpression(ctx: DurationExpressionCstChildren): string {
    if (ctx.DurationLiteral) {
      return ctx.DurationLiteral[0].image
    }
    // NumberLiteral/StringLiteral + timeUnit
    const num =
      ctx.NumberLiteral?.[0]?.image ?? ctx.StringLiteral?.[0]?.image ?? "0"
    const unit = this.visit(ctx.timeUnit!) as string
    return `${num} ${unit}`
  }

  // ==========================================================================
  // WHERE Clause
  // ==========================================================================

  whereClause(ctx: WhereClauseCstChildren): AST.Expression {
    return this.visit(ctx.expression) as AST.Expression
  }

  // ==========================================================================
  // QuestDB-specific Clauses
  // ==========================================================================

  sampleByClause(ctx: SampleByClauseCstChildren): AST.SampleByClause {
    const result: AST.SampleByClause = {
      type: "sampleBy",
      duration: ctx.sampleByExpression
        ? this.sampleByDuration(ctx.sampleByExpression[0], ctx.sampleByUnit)
        : this.tokenImage(ctx.Identifier![0]),
    }
    if (ctx.groupingSetsSpec) {
      result.groupingSets = this.visit(ctx.groupingSetsSpec) as AST.GroupingSets
    }
    if (ctx.fillClause) {
      result.fill = this.visit(ctx.fillClause) as string[]
    }
    if (ctx.alignToClause) {
      result.alignTo = this.visit(ctx.alignToClause) as AST.AlignToClause
    }
    if (ctx.fromToClause) {
      const fromTo = this.visit(ctx.fromToClause) as FromToClauseResult
      result.from = fromTo.from
      result.to = fromTo.to
    }
    return result
  }

  fillClause(ctx: FillClauseCstChildren): string[] {
    return ctx.fillValue.map((v: CstNode) => this.visit(v) as string)
  }

  /** SAMPLE BY text: the expression as SQL, plus the unit letter if any */
  private sampleByDuration(node: CstNode, unit: IToken[] | undefined): string {
    // A lone duration literal keeps its image (`1h`, `30m`, `1d`)
    const bare = this.bareDurationLiteral(node)
    const text = bare
      ? String(bare.value)
      : expressionToSql(this.visit(node) as AST.Expression)
    return unit ? `${text} ${this.tokenImage(unit[0])}` : text
  }

  // FILL values: plain names (PREV, LINEAR, NONE, NULL) are upper-cased and
  // PREV(...) keeps an upper-case name, as before; other values are printed
  // as expressions (-1, @f, 1 + 2, '5').
  fillValue(ctx: FillValueCstChildren): string {
    const expr = this.visit(ctx.expression) as AST.Expression
    if (expr.type === "column" && expr.name.parts.length === 1) {
      return expr.name.parts[0].toUpperCase()
    }
    if (expr.type === "literal" && expr.literalType === "null") return "NULL"
    if (expr.type === "function" && expr.name.toUpperCase() === "PREV") {
      return expressionToSql({ ...expr, name: "PREV" })
    }
    return expressionToSql(expr)
  }

  alignToClause(ctx: AlignToClauseCstChildren): AST.AlignToClause {
    const result: AST.AlignToClause = {
      type: "alignTo",
      mode: ctx.Calendar ? "calendar" : "firstObservation",
    }
    // A string literal or plain name stays a string; anything else (@tz, $1,
    // f(...)) is kept as an expression too.
    const value = (
      node: CstNode,
    ): { text: string; expression?: AST.Expression } => {
      const expr = this.visit(node) as AST.Expression
      if (expr.type === "literal" && expr.literalType === "string") {
        return { text: String(expr.value) }
      }
      if (expr.type === "column" && expr.name.parts.length === 1) {
        return { text: expr.name.parts[0] }
      }
      return { text: expressionToSql(expr), expression: expr }
    }
    if (ctx.timeZoneExpression) {
      const v = value(ctx.timeZoneExpression[0])
      result.timeZone = v.text
      if (v.expression) result.timeZoneExpression = v.expression
    }
    if (ctx.offsetExpression) {
      const v = value(ctx.offsetExpression[0])
      result.offset = v.text
      if (v.expression) result.offsetExpression = v.expression
    }
    return result
  }

  fromToClause(ctx: FromToClauseCstChildren): {
    from?: AST.Expression
    to?: AST.Expression
  } {
    const expressions =
      ctx.expression?.map((e: CstNode) => this.visit(e) as AST.Expression) ?? []
    if (ctx.From) {
      return { from: expressions[0], to: expressions[1] }
    }
    return { to: expressions[0] }
  }

  latestOnClause(ctx: LatestOnClauseCstChildren): AST.LatestOnClause {
    const names = (ctx.latestOnColumn ?? []).map(
      (c: CstNode) => this.visit(c) as AST.QualifiedName,
    )

    if (ctx.On) {
      // LATEST ON timestamp PARTITION BY col1, col2, ...
      return {
        type: "latestOn",
        timestamp: names[0],
        partitionBy: names.slice(1),
      }
    }
    // LATEST BY col1, col2, ...
    return {
      type: "latestOn",
      partitionBy: names,
    }
  }

  // Column or @variable; a variable is kept as a one-part name "@var"
  latestOnColumn(ctx: LatestOnColumnCstChildren): AST.QualifiedName {
    if (ctx.VariableReference) {
      return {
        type: "qualifiedName",
        parts: [ctx.VariableReference[0].image],
      }
    }
    return (this.visit(ctx.columnRef!) as AST.ColumnRef).name
  }

  /**
   * Records the PIVOT alias and a PIVOT written before SAMPLE BY / GROUP BY
   * (server order).
   */
  private markPivotPosition(
    result: AST.SelectStatement,
    ctx: SimpleSelectCstChildren | ImplicitSelectBodyCstChildren,
  ): void {
    if (ctx.pivotAlias && result.pivot) {
      result.pivot.alias = this.extractIdentifierName(
        ctx.pivotAlias[0].children,
      )
    }
    const pivotOffset = ctx.Pivot?.[0]?.startOffset
    if (pivotOffset === undefined) return
    const later = [ctx.sampleByClause?.[0], ctx.groupByClause?.[0]].some(
      (c) => c !== undefined && this.getFirstTokenOffset(c) > pivotOffset,
    )
    if (later) result.pivotBeforeGroupBy = true
  }

  subsampleClause(ctx: SubsampleClauseCstChildren): AST.SubsampleClause {
    return {
      type: "subsample",
      method: (this.visit(ctx.identifier) as AST.QualifiedName).parts[0],
      args: ctx.expression.map((e: CstNode) => this.visit(e) as AST.Expression),
    }
  }

  // ==========================================================================
  // GROUP BY, HAVING, ORDER BY, LIMIT
  // ==========================================================================

  groupByClause(ctx: GroupByClauseCstChildren): GroupByClauseResult {
    const result: GroupByClauseResult = {}
    if (!ctx.expression && !ctx.groupingSetsSpec) {
      // Only reachable from error recovery (`GROUP BY;`): no key at all.
      throw new Error("GROUP BY key expected")
    }
    if (ctx.expression) {
      result.groupBy = ctx.expression.map(
        (e: CstNode) => this.visit(e) as AST.Expression,
      )
    }
    if (ctx.groupingSetsSpec) {
      result.groupingSets = this.visit(ctx.groupingSetsSpec) as AST.GroupingSets
    } else if (ctx.rollupOrCubeSpec) {
      result.groupingSets = this.visit(ctx.rollupOrCubeSpec) as AST.GroupingSets
    }
    return result
  }

  groupingSetsSpec(ctx: GroupingSetsSpecCstChildren): AST.GroupingSets {
    return this.visit(
      (ctx.rollupOrCubeSpec ?? ctx.explicitGroupingSets)!,
    ) as AST.GroupingSets
  }

  rollupOrCubeSpec(ctx: RollupOrCubeSpecCstChildren): AST.GroupingSets {
    return {
      type: "groupingSets",
      kind: ctx.Cube ? "cube" : "rollup",
      columns: ctx.columnRef.map(
        (c: CstNode) => this.visit(c) as AST.ColumnRef,
      ),
    }
  }

  explicitGroupingSets(ctx: ExplicitGroupingSetsCstChildren): AST.GroupingSets {
    return {
      type: "groupingSets",
      kind: "groupingSets",
      sets: ctx.groupingSet.map(
        (g: CstNode) => this.visit(g) as AST.ColumnRef[],
      ),
    }
  }

  groupingSet(ctx: GroupingSetCstChildren): AST.ColumnRef[] {
    return (ctx.columnRef ?? []).map(
      (c: CstNode) => this.visit(c) as AST.ColumnRef,
    )
  }

  orderByClause(ctx: OrderByClauseCstChildren): AST.OrderByItem[] {
    return ctx.orderByItem.map(
      (item: CstNode) => this.visit(item) as AST.OrderByItem,
    )
  }

  orderByItem(ctx: OrderByItemCstChildren): AST.OrderByItem {
    const result: AST.OrderByItem = {
      type: "orderByItem",
      expression: this.visit(ctx.expression) as AST.Expression,
    }

    if (ctx.Asc) result.direction = "asc"
    else if (ctx.Desc) result.direction = "desc"

    return result
  }

  limitClause(ctx: LimitClauseCstChildren): AST.LimitClause {
    if (!ctx.expression) {
      // Only reachable from error recovery (`LIMIT;`)
      throw new Error("LIMIT expression expected")
    }
    const expressions = ctx.expression.map(
      (e: CstNode) => this.visit(e) as AST.Expression,
    )
    // `LIMIT ,5`: the server defaults the missing lower bound to 0
    if (ctx.openLowerBound) {
      expressions.unshift({
        type: "literal",
        value: 0,
        literalType: "number",
        raw: "0",
      })
    }

    const result: AST.LimitClause = {
      type: "limit",
      lowerBound: expressions[0],
    }

    if (expressions.length > 1) {
      result.upperBound = expressions[1]
    }

    return result
  }

  // ==========================================================================
  // INSERT Statement
  // ==========================================================================

  insertStatement(ctx: InsertStatementCstChildren): AST.InsertStatement {
    const result: AST.InsertStatement = {
      type: "insert",
      table: this.visit(ctx.tableNameOrString) as AST.QualifiedName,
    }

    if (ctx.Atomic) {
      result.atomic = true
    }
    if (ctx.batchClause) {
      result.batch = this.visit(ctx.batchClause[0]) as BatchClauseResult
    }

    if (ctx.identifier) {
      result.columns = ctx.identifier.map((id: CstNode) => {
        const name = this.visit(id) as AST.QualifiedName
        return name.parts[0]
      })
    }

    if (ctx.valuesClause) {
      result.values = this.visit(ctx.valuesClause) as AST.Expression[][]
    }

    if (ctx.selectStatement) {
      result.select = this.visit(ctx.selectStatement[0]) as AST.SelectStatement
    }

    return result
  }

  valuesClause(ctx: ValuesClauseCstChildren): AST.Expression[][] {
    return ctx.valuesList.map((v: CstNode) => this.visit(v) as AST.Expression[])
  }

  valuesList(ctx: ValuesListCstChildren): AST.Expression[] {
    return ctx.expression.map((e: CstNode) => this.visit(e) as AST.Expression)
  }

  batchClause(ctx: BatchClauseCstChildren): {
    size: number
    o3MaxLag?: string
  } {
    const o3MaxLag =
      ctx.DurationLiteral?.[0]?.image ??
      (ctx.StringLiteral?.[0]?.image
        ? unquoteSingle(ctx.StringLiteral[0].image)
        : undefined)
    return {
      size: tokenInt(ctx.NumberLiteral[0].image),
      o3MaxLag,
    }
  }

  // ==========================================================================
  // UPDATE Statement
  // ==========================================================================

  updateStatement(ctx: UpdateStatementCstChildren): AST.UpdateStatement {
    const result: AST.UpdateStatement = {
      type: "update",
      table: this.visit(ctx.tableName) as AST.QualifiedName,
      set: ctx.setClause.map((s: CstNode) => this.visit(s) as AST.SetClause),
    }

    if (ctx.identifier) {
      result.alias = this.extractIdentifierName(ctx.identifier[0].children)
    }

    if (ctx.tableRef) {
      result.from = this.visit(ctx.tableRef) as AST.TableRef
    }
    if (ctx.joinClause) {
      result.joins = ctx.joinClause.map(
        (j: CstNode) => this.visit(j) as AST.JoinClause,
      )
    }

    if (ctx.whereClause) {
      result.where = this.visit(ctx.whereClause) as AST.Expression
    }

    return result
  }

  setClause(ctx: SetClauseCstChildren): AST.SetClause {
    const colRef = this.visit(ctx.columnRef) as AST.ColumnRef
    const parts = colRef.name.parts
    return {
      type: "setClause",
      column: parts[parts.length - 1],
      value: this.visit(ctx.expression) as AST.Expression,
    }
  }

  // ==========================================================================
  // DECLARE Statement
  // ==========================================================================

  declareClause(ctx: DeclareClauseCstChildren): AST.DeclareClause {
    return {
      type: "declareClause",
      assignments: ctx.declareAssignment.map(
        (a: CstNode) => this.visit(a) as AST.DeclareAssignment,
      ),
    }
  }

  declareAssignment(ctx: DeclareAssignmentCstChildren): AST.DeclareAssignment {
    const image = ctx.VariableReference[0].image // e.g. "@limit"
    const result: AST.DeclareAssignment = {
      type: "declareAssignment",
      name: image.substring(1), // strip leading @
      // A bare duration stays a duration: the variable may be substituted
      // into SAMPLE BY (`DECLARE @unit := 1m ... SAMPLE BY @unit`).
      value:
        this.bareDurationLiteral(ctx.expression[0]) ??
        (this.visit(ctx.expression) as AST.Expression),
    }
    if (ctx.Overridable) result.overridable = true
    if (ctx.Audited) result.audited = true
    return result
  }

  // ==========================================================================
  // CREATE Statement
  // ==========================================================================

  createStatement(ctx: CreateStatementCstChildren): AST.Statement {
    if (ctx.createTableBody) {
      return this.visit(ctx.createTableBody) as AST.CreateTableStatement
    }
    if (ctx.createMaterializedViewBody) {
      return this.visit(
        ctx.createMaterializedViewBody,
      ) as AST.CreateMaterializedViewStatement
    }
    if (ctx.createLiveViewBody) {
      return this.visit(ctx.createLiveViewBody) as AST.CreateLiveViewStatement
    }
    if (ctx.createViewBody) {
      return this.visit(ctx.createViewBody) as AST.CreateViewStatement
    }
    if (ctx.createUserStatement) {
      return this.visit(ctx.createUserStatement) as AST.CreateUserStatement
    }
    if (ctx.createGroupStatement) {
      return this.visit(ctx.createGroupStatement) as AST.CreateGroupStatement
    }
    if (ctx.createServiceAccountStatement) {
      return this.visit(
        ctx.createServiceAccountStatement,
      ) as AST.CreateServiceAccountStatement
    }
    throw new Error("Unknown create statement type")
  }

  // ==========================================================================
  // CREATE TABLE Statement
  // ==========================================================================

  createTableBody(ctx: CreateTableBodyCstChildren): AST.CreateTableStatement {
    const table = this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName
    const result: AST.CreateTableStatement = {
      type: "createTable",
      table,
    }

    if (ctx.Atomic) {
      result.atomic = true
    }
    if (ctx.batchClause) {
      result.batch = this.visit(ctx.batchClause[0]) as BatchClauseResult
    }

    if (ctx.If) {
      result.ifNotExists = true
    }

    if (ctx.columnDefinition) {
      result.columns = ctx.columnDefinition.map(
        (c: CstNode) => this.visit(c) as AST.ColumnDefinition,
      )
    }

    if (ctx.Like && ctx.tableName) {
      result.like = this.visit(ctx.tableName[0]) as AST.QualifiedName
    }

    if (ctx.selectStatement) {
      result.asSelect = this.visit(
        ctx.selectStatement[0],
      ) as AST.SelectStatement
    } else if (ctx.implicitSelectStatement) {
      result.asSelect = this.visit(
        ctx.implicitSelectStatement[0],
      ) as AST.SelectStatement
    }

    if (ctx.castDefinition) {
      result.casts = ctx.castDefinition.map(
        (c: CstNode) => this.visit(c) as AST.CastDefinition,
      )
    }
    if (ctx.indexDefinition) {
      result.indexes = ctx.indexDefinition.map(
        (i: CstNode) => this.visit(i) as AST.IndexDefinition,
      )
    }

    // Timestamp - the identifier after TIMESTAMP keyword
    if (ctx.Timestamp && ctx.columnRef && ctx.columnRef.length > 0) {
      result.timestamp = (
        this.visit(ctx.columnRef[0]) as AST.ColumnRef
      ).name.parts.join(".")
    }

    if (ctx.partitionPeriod) {
      result.partitionBy = this.visit(ctx.partitionPeriod) as
        | "NONE"
        | "HOUR"
        | "DAY"
        | "WEEK"
        | "MONTH"
        | "YEAR"
    }

    if (ctx.Bypass) {
      result.bypassWal = true
    } else if (ctx.Wal) {
      result.wal = true
    }

    if (ctx.ttlClause) {
      result.ttl = this.visit(ctx.ttlClause) as AST.CreateTableStatement["ttl"]
    }

    if (ctx.optionalStoragePolicy) {
      const sp = this.visit(ctx.optionalStoragePolicy) as
        | AST.StoragePolicy
        | undefined
      if (sp) result.storagePolicy = sp
    }

    if (result.ttl && result.storagePolicy) {
      throw new Error("Cannot set storage policy, please, remove TTL settings")
    }

    if (ctx.tableParam) {
      result.withParams = ctx.tableParam.map(
        (p: CstNode) => this.visit(p) as AST.TableParam,
      )
    }
    if (ctx.Volume) {
      const volumeOffset = ctx.Volume[0].startOffset
      const volumeStr = ctx.StringLiteral?.find(
        (t: IToken) => t.startOffset > volumeOffset,
      )
      result.volume = volumeStr
        ? unquoteSingle(volumeStr.image)
        : ctx.identifier?.length
          ? this.extractIdentifierName(
              ctx.identifier[ctx.identifier.length - 1].children,
            )
          : undefined
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier) as string
    }

    if (ctx.dedupClause) {
      const dedup = this.visit(ctx.dedupClause) as DedupModeKeys
      result.dedupKeys = dedup.keys
      result.dedupMode = dedup.mode
    }

    // FORMAT { PARQUET | NATIVE } — accepted in three positions; take the
    // first one that carried a value.
    if (ctx.optionalTableFormat) {
      for (const node of ctx.optionalTableFormat) {
        const fmt = this.visit(node) as "parquet" | "native" | undefined
        if (fmt) {
          result.tableFormat = fmt
          break
        }
      }
    }

    return result
  }

  tableFormatKind(ctx: TableFormatKindCstChildren): "parquet" | "native" {
    return ctx.Native ? "native" : "parquet"
  }

  optionalTableFormat(
    ctx: OptionalTableFormatCstChildren,
  ): "parquet" | "native" | undefined {
    return ctx.tableFormatKind
      ? (this.visit(ctx.tableFormatKind) as "parquet" | "native")
      : undefined
  }

  columnDefinition(ctx: ColumnDefinitionCstChildren): AST.ColumnDefinition {
    const result: AST.ColumnDefinition = {
      type: "columnDefinition",
      name: this.extractIdentifierName(ctx.identifier[0].children),
      dataType: this.visit(ctx.doublePrecisionType ?? ctx.dataType!) as string,
    }

    // Distinguish symbol CAPACITY (CONSUME) from index CAPACITY (CONSUME1) by position
    const capacityTokens = ctx.Capacity || []
    const numberTokens = ctx.NumberLiteral || []
    const indexToken = ctx.Index?.[0]

    if (capacityTokens.length > 0 && numberTokens.length > 0) {
      if (indexToken) {
        // Determine which capacity is for symbol vs index by position relative to INDEX
        const indexOffset = indexToken.startOffset
        for (let i = 0; i < capacityTokens.length; i++) {
          const capOffset = capacityTokens[i].startOffset
          if (capOffset < indexOffset) {
            // Symbol CAPACITY (before INDEX)
            result.symbolCapacity = tokenInt(numberTokens[i].image)
          } else {
            // INDEX CAPACITY (after INDEX)
            result.indexCapacity = tokenInt(numberTokens[i].image)
          }
        }
      } else {
        // No INDEX, so this is symbol CAPACITY
        result.symbolCapacity = tokenInt(numberTokens[0].image)
      }
    }

    // CACHE / NOCACHE
    if (ctx.Cache) {
      result.cache = true
    } else if (ctx.Nocache) {
      result.cache = false
    }

    // INDEX
    if (indexToken) {
      result.indexed = true
      if (ctx.indexTypeOptions) {
        const opts = this.visit(ctx.indexTypeOptions[0]) as {
          capacity?: number
          indexType?: AST.ColumnDefinition["indexType"]
          include?: string[]
        }
        if (opts.capacity !== undefined) result.indexCapacity = opts.capacity
        if (opts.indexType) result.indexType = opts.indexType
        if (opts.include) result.indexInclude = opts.include
      }
    }

    // PARQUET config
    if (ctx.parquetConfig) {
      result.parquetConfig = this.visit(ctx.parquetConfig) as AST.ParquetConfig
    }

    return result
  }

  parquetConfig(ctx: ParquetConfigCstChildren): AST.ParquetConfig {
    const result: AST.ParquetConfig = { type: "parquetConfig" }
    if (ctx.parquetEncoding) {
      result.encoding = (
        this.visit(ctx.parquetEncoding) as string
      ).toUpperCase()
    }
    if (ctx.parquetCompression) {
      result.compression = (
        this.visit(ctx.parquetCompression) as string
      ).toUpperCase()
    }
    if (ctx.NumberLiteral) {
      result.compressionLevel = tokenInt(ctx.NumberLiteral[0].image)
    }
    if (ctx.BloomFilter) {
      result.bloomFilter = true
    }
    return result
  }

  parquetEncoding(ctx: ParquetEncodingCstChildren): string {
    return this.firstTokenImage(ctx)?.toUpperCase() ?? "DEFAULT"
  }

  parquetCompression(ctx: ParquetCompressionCstChildren): string {
    return this.firstTokenImage(ctx)?.toUpperCase() ?? ""
  }

  optionalStoragePolicy(
    ctx: OptionalStoragePolicyCstChildren,
  ): AST.StoragePolicy | undefined {
    if (!ctx.storagePolicy) return undefined
    return this.visit(ctx.storagePolicy) as AST.StoragePolicy
  }

  storagePolicy(ctx: StoragePolicyCstChildren): AST.StoragePolicy {
    if (!ctx.storagePolicyClause || ctx.storagePolicyClause.length === 0) {
      throw new Error("at least one storage policy clause is required")
    }
    const KIND_DISPLAY: Record<StoragePolicyKind, string> = {
      toParquet: "TO PARQUET",
      toRemote: "TO REMOTE",
      dropLocal: "DROP LOCAL",
      dropRemote: "DROP REMOTE",
    }
    const result: AST.StoragePolicy = { type: "storagePolicy" }
    for (const clauseNode of ctx.storagePolicyClause) {
      const clause = this.visit(clauseNode) as {
        kind: StoragePolicyKind
        ttl: {
          value: number
          unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
        }
      }
      if (result[clause.kind] !== undefined) {
        throw new Error(
          `duplicate '${KIND_DISPLAY[clause.kind]}' in storage policy`,
        )
      }
      result[clause.kind] = clause.ttl
    }
    return result
  }

  storagePolicyClause(ctx: StoragePolicyClauseCstChildren): {
    kind: StoragePolicyKind
    ttl: {
      value: number
      unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
    }
  } {
    let kind: StoragePolicyKind
    if (ctx.To && ctx.Parquet) {
      kind = "toParquet"
    } else if (ctx.To && ctx.Remote) {
      kind = "toRemote"
    } else if (ctx.Drop && ctx.Local) {
      kind = "dropLocal"
    } else if (ctx.Drop && ctx.Remote) {
      kind = "dropRemote"
    } else {
      throw new Error("Unknown storage policy clause")
    }
    const ttl = this.visit(ctx.storagePolicyTtl!) as {
      value: number
      unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
    }
    return { kind, ttl }
  }

  storagePolicyTtl(ctx: StoragePolicyTtlCstChildren): {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  } {
    return this.extractTtl(ctx)
  }

  castDefinition(ctx: CastDefinitionCstChildren): AST.CastDefinition {
    const colRef = this.visit(ctx.columnRef) as AST.ColumnRef
    const result: AST.CastDefinition = {
      type: "castDefinition",
      column: colRef.name ?? colRef,
      dataType: this.visit(ctx.doublePrecisionType ?? ctx.dataType!) as string,
    }
    if (ctx.NumberLiteral) {
      result.symbolCapacity = tokenInt(ctx.NumberLiteral[0].image)
    }
    if (ctx.Cache) result.cache = true
    else if (ctx.Nocache) result.cache = false
    return result
  }

  // `[PRECISION] [NOT] NULL` is ignored (as on the server)
  columnNullModifier(): undefined {
    return undefined
  }

  indexDefinition(ctx: IndexDefinitionCstChildren): AST.IndexDefinition {
    const colRef = this.visit(ctx.columnRef) as AST.ColumnRef
    const result: AST.IndexDefinition = {
      type: "indexDefinition",
      column: colRef.name ?? colRef,
    }
    if (ctx.indexTypeOptions) {
      const opts = this.visit(ctx.indexTypeOptions[0]) as {
        capacity?: number
        indexType?: AST.IndexDefinition["indexType"]
        include?: string[]
      }
      if (opts.capacity !== undefined) result.capacity = opts.capacity
      if (opts.indexType) result.indexType = opts.indexType
      if (opts.include) result.include = opts.include
    }
    return result
  }

  indexTypeOptions(ctx: IndexTypeOptionsCstChildren): {
    capacity?: number
    indexType?: AST.ColumnDefinition["indexType"]
    include?: string[]
  } {
    const r: {
      capacity?: number
      indexType?: AST.ColumnDefinition["indexType"]
      include?: string[]
    } = {}
    if (ctx.Type) {
      if (ctx.Posting) {
        r.indexType = ctx.Delta
          ? "posting_delta"
          : ctx.Ef
            ? "posting_ef"
            : "posting"
      } else if (ctx.Bitmap) {
        r.indexType = "bitmap"
      } else if (ctx.None) {
        r.indexType = "none"
      }
    }
    if (ctx.Include && ctx.identifier) {
      r.include = ctx.identifier.map(
        (id) => (this.visit(id) as AST.QualifiedName).parts[0],
      )
    }
    if (ctx.Capacity && ctx.NumberLiteral) {
      r.capacity = tokenInt(ctx.NumberLiteral[0].image)
    }
    return r
  }

  tableParamName(ctx: TableParamNameCstChildren): string {
    if (ctx.identifier)
      return this.extractIdentifierName(ctx.identifier[0].children)
    return ""
  }

  tableParam(ctx: TableParamCstChildren): AST.TableParam {
    const name = ctx.tableParamName
      ? (this.visit(ctx.tableParamName[0]) as string)
      : ""
    const result: AST.TableParam = {
      type: "tableParam",
      name,
    }
    if (ctx.expression) {
      // o3MaxLag = 10m / 7d is a duration (SqlUtil.expectMicros), not a number
      result.value =
        this.bareDurationLiteral(ctx.expression[0]) ??
        (this.visit(ctx.expression) as AST.Expression)
    }
    return result
  }

  /**
   * If an expression CST is nothing but one DurationLiteral token, returns it
   * as a duration literal. Used where a value is a duration (o3MaxLag, DECLARE
   * values that may feed SAMPLE BY), since `literal` types `10m` / `7d` as
   * numbers.
   */
  private bareDurationLiteral(node: CstNode): AST.Literal | undefined {
    const tokens: IToken[] = []
    const collect = (n: CstNode) => {
      for (const children of Object.values(n.children)) {
        for (const c of children) {
          if ("image" in c) tokens.push(c)
          else collect(c)
          if (tokens.length > 1) return
        }
      }
    }
    collect(node)
    if (tokens.length !== 1 || tokens[0].tokenType.name !== "DurationLiteral") {
      return undefined
    }
    return {
      type: "literal",
      value: this.tokenImage(tokens[0]),
      literalType: "duration",
    }
  }

  createViewBody(ctx: CreateViewBodyCstChildren): AST.CreateViewStatement {
    const result: AST.CreateViewStatement = {
      type: "createView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      query: ctx.selectStatement
        ? (this.visit(ctx.selectStatement[0]) as AST.SelectStatement)
        : (this.visit(ctx.implicitSelectStatement!) as AST.SelectStatement),
    }
    if (ctx.LParen) {
      result.asParens = true
    }
    if (ctx.Or) {
      result.orReplace = true
    }
    if (ctx.If) {
      result.ifNotExists = true
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier) as string
    }
    return result
  }

  createUserStatement(
    ctx: CreateUserStatementCstChildren,
  ): AST.CreateUserStatement {
    const result: AST.CreateUserStatement = {
      type: "createUser",
      user: this.visit(ctx.qualifiedName[0]) as AST.QualifiedName,
    }
    if (ctx.If) {
      result.ifNotExists = true
    }
    if (ctx.No) {
      result.noPassword = true
    }
    if (ctx.Password) {
      if (ctx.StringLiteral) {
        result.password = unquoteSingle(ctx.StringLiteral[0].image)
      } else if (ctx.identifier) {
        result.password = this.extractIdentifierName(ctx.identifier[0].children)
      }
    }
    return result
  }

  createGroupStatement(
    ctx: CreateGroupStatementCstChildren,
  ): AST.CreateGroupStatement {
    const result: AST.CreateGroupStatement = {
      type: "createGroup",
      group: this.visit(ctx.qualifiedName) as AST.QualifiedName,
      ifNotExists: !!ctx.If,
    }
    if (ctx.StringLiteral) {
      result.externalAlias = unquoteSingle(ctx.StringLiteral[0].image)
    }
    return result
  }

  createServiceAccountStatement(
    ctx: CreateServiceAccountStatementCstChildren,
  ): AST.CreateServiceAccountStatement {
    const result: AST.CreateServiceAccountStatement = {
      type: "createServiceAccount",
      account: this.visit(ctx.qualifiedName[0]) as AST.QualifiedName,
    }
    if (ctx.If) {
      result.ifNotExists = true
    }
    if (ctx.No) {
      result.noPassword = true
    }
    if (ctx.Password && !ctx.No) {
      if (ctx.StringLiteral) {
        result.password = unquoteSingle(ctx.StringLiteral[0].image)
      } else if (ctx.identifier) {
        result.password = this.extractIdentifierName(ctx.identifier[0].children)
      }
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier) as string
    }
    return result
  }

  createMaterializedViewBody(
    ctx: CreateMaterializedViewBodyCstChildren,
  ): AST.CreateMaterializedViewStatement {
    const result: AST.CreateMaterializedViewStatement = {
      type: "createMaterializedView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      query: ctx.selectStatement
        ? (this.visit(ctx.selectStatement[0]) as AST.SelectStatement)
        : (this.visit(ctx.implicitSelectStatement!) as AST.SelectStatement),
    }
    // The body's "(" follows AS; TIMESTAMP(col) also consumes an LParen here.
    const timestampOffset = ctx.Timestamp?.[0].startOffset ?? Infinity
    if (ctx.LParen?.some((t) => t.startOffset < timestampOffset)) {
      result.asParens = true
    }
    if (ctx.If) {
      result.ifNotExists = true
    }
    if (ctx.indexDefinition) {
      result.indexes = ctx.indexDefinition.map(
        (i) => this.visit(i) as AST.IndexDefinition,
      )
    }
    if (ctx.Base && ctx.stringOrQualifiedName?.length > 1) {
      result.baseTable = this.visit(
        ctx.stringOrQualifiedName[1],
      ) as AST.QualifiedName
    }
    if (ctx.materializedViewRefresh) {
      result.refresh = this.visit(
        ctx.materializedViewRefresh,
      ) as AST.MaterializedViewRefresh
    } else if (ctx.Refresh && !ctx.materializedViewRefresh) {
      // REFRESH keyword consumed but no materializedViewRefresh subrule — REFRESH PERIOD path
      result.refresh = { type: "materializedViewRefresh" }
    }
    if (ctx.materializedViewPeriod) {
      result.period = this.visit(
        ctx.materializedViewPeriod[0],
      ) as AST.MaterializedViewPeriod
    }
    if (ctx.Timestamp && ctx.columnRef) {
      result.timestamp = (this.visit(ctx.columnRef[0]) as AST.ColumnRef).name
    }
    if (ctx.materializedViewPartition) {
      const partition = this.visit(ctx.materializedViewPartition) as {
        partitionBy?: AST.CreateMaterializedViewStatement["partitionBy"]
        ttl?: AST.CreateMaterializedViewStatement["ttl"]
      }
      if (partition.partitionBy) result.partitionBy = partition.partitionBy
    }
    if (ctx.ttlClause) {
      result.ttl = this.visit(
        ctx.ttlClause,
      ) as AST.CreateMaterializedViewStatement["ttl"]
    }
    if (ctx.optionalStoragePolicy) {
      const sp = this.visit(ctx.optionalStoragePolicy) as
        | AST.StoragePolicy
        | undefined
      if (sp) result.storagePolicy = sp
    }
    if (result.ttl && result.storagePolicy) {
      throw new Error("Cannot set storage policy, please, remove TTL settings")
    }
    if (ctx.Volume) {
      const volumeOffset = ctx.Volume[0].startOffset
      const volumeStr = ctx.StringLiteral?.find(
        (t: IToken) => t.startOffset > volumeOffset,
      )
      result.volume = volumeStr
        ? unquoteSingle(volumeStr.image)
        : ctx.identifier?.length
          ? this.extractIdentifierName(
              ctx.identifier[ctx.identifier.length - 1].children,
            )
          : undefined
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier) as string
    }
    if (ctx.optionalExpireRows) {
      const er = this.visit(ctx.optionalExpireRows) as
        | AST.ExpireRowsClause
        | undefined
      if (er) result.expireRows = er
    }
    return result
  }

  expireRowsClause(ctx: ExpireRowsClauseCstChildren): AST.ExpireRowsClause {
    const idents = (ctx.identifier ?? []).map((id: IdentifierCstNode) =>
      this.extractIdentifierName(id.children),
    )
    let clause: AST.ExpireRowsClause
    if (ctx.When) {
      clause = {
        mode: "when",
        predicate: this.visit(ctx.expression!) as AST.Expression,
      }
    } else if (ctx.Latest) {
      let i = 0
      const on = ctx.On ? idents[i++] : undefined
      clause = { mode: "keepLatest", partitionBy: idents.slice(i) }
      if (on) clause.on = on
    } else {
      clause = {
        mode: "keepExtremum",
        extremum: ctx.Highest ? "highest" : "lowest",
        column: idents[0],
      }
      const partitionBy = idents.slice(1)
      if (partitionBy.length > 0) clause.partitionBy = partitionBy
      if (ctx.NumberLiteral) {
        clause.keepCount = tokenInt(ctx.NumberLiteral[0].image)
      }
    }
    if (ctx.Cleanup && ctx.DurationLiteral) {
      clause.cleanupEvery = ctx.DurationLiteral[0].image
    }
    return clause
  }

  optionalExpireRows(
    ctx: OptionalExpireRowsCstChildren,
  ): AST.ExpireRowsClause | undefined {
    return ctx.expireRowsClause
      ? (this.visit(ctx.expireRowsClause) as AST.ExpireRowsClause)
      : undefined
  }

  materializedViewRefresh(
    ctx: MaterializedViewRefreshCstChildren,
  ): AST.MaterializedViewRefresh {
    const result: AST.MaterializedViewRefresh = {
      type: "materializedViewRefresh",
    }
    // INCREMENTAL is the obsolete name of IMMEDIATE
    if (ctx.Immediate || ctx.Incremental) result.mode = "immediate"
    if (ctx.Manual) result.mode = "manual"
    if (ctx.intervalValue) {
      result.every = this.extractMaybeString(ctx.intervalValue[0])
    }
    if (ctx.Deferred) result.deferred = true
    if (ctx.Start && ctx.stringOrIdentifier) {
      result.start = this.extractMaybeString(ctx.stringOrIdentifier[0])
    }
    if (ctx.Zone && ctx.timeZoneValue) {
      result.timeZone = this.extractMaybeString(ctx.timeZoneValue[0])
    }
    return result
  }

  materializedViewPeriod(
    ctx: MaterializedViewPeriodCstChildren,
  ): AST.MaterializedViewPeriod {
    const result: AST.MaterializedViewPeriod = {
      type: "materializedViewPeriod",
    }
    if (ctx.Length && ctx.intervalValue) {
      result.length = this.extractMaybeString(ctx.intervalValue[0])
    }
    if (ctx.Delay && ctx.intervalValue?.[1]) {
      result.delay = this.extractMaybeString(ctx.intervalValue[1])
    }
    if (ctx.Zone && ctx.timeZoneValue) {
      result.timeZone = this.extractMaybeString(ctx.timeZoneValue[0])
    }
    if (ctx.Interval) {
      result.sampleByInterval = true
    }
    return result
  }

  materializedViewPartition(ctx: MaterializedViewPartitionCstChildren): {
    partitionBy?: AST.CreateMaterializedViewStatement["partitionBy"]
    ttl?: AST.CreateMaterializedViewStatement["ttl"]
  } {
    const result: {
      partitionBy?: AST.CreateMaterializedViewStatement["partitionBy"]
      ttl?: AST.CreateMaterializedViewStatement["ttl"]
    } = {}
    if (ctx.partitionPeriod) {
      result.partitionBy = this.visit(ctx.partitionPeriod) as
        | "YEAR"
        | "MONTH"
        | "WEEK"
        | "DAY"
        | "HOUR"
    }
    return result
  }

  ttlClause(ctx: TtlClauseCstChildren): {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  } {
    return this.extractTtl(ctx)
  }

  createLiveViewBody(
    ctx: CreateLiveViewBodyCstChildren,
  ): AST.CreateLiveViewStatement {
    const durations = (ctx.DurationLiteral ?? []).map((t) => t.image)
    const result: AST.CreateLiveViewStatement = {
      type: "createLiveView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      flushEvery: durations[0],
      query: this.visit(ctx.selectStatement![0]) as AST.SelectStatement,
    }
    if (ctx.If) result.ifNotExists = true
    if (ctx.Memory && durations.length > 1) result.inMemory = durations[1]
    if (ctx.partitionPeriod) {
      result.partitionBy = this.visit(
        ctx.partitionPeriod,
      ) as AST.CreateLiveViewStatement["partitionBy"]
    }
    if (ctx.Start) {
      if (ctx.Beginning) {
        result.startFrom = { kind: "beginning" }
      } else if (ctx.StringLiteral) {
        result.startFrom = {
          kind: "timestamp",
          value: unquoteSingle(ctx.StringLiteral[0].image),
        }
      } else {
        result.startFrom = { kind: "now" }
      }
    }
    if (ctx.Owned && ctx.stringOrIdentifier) {
      result.ownedBy = this.visit(ctx.stringOrIdentifier) as string
    }
    if (ctx.LParen) result.asParens = true
    return result
  }

  dropLiveViewStatement(
    ctx: DropLiveViewStatementCstChildren,
  ): AST.DropLiveViewStatement {
    return {
      type: "dropLiveView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      ifExists: !!ctx.If,
    }
  }

  alterLiveViewStatement(
    ctx: AlterLiveViewStatementCstChildren,
  ): AST.AlterLiveViewStatement {
    const result: AST.AlterLiveViewStatement = {
      type: "alterLiveView",
      view: this.visit(ctx.tableName) as AST.QualifiedName,
      action: ctx.Suspend ? "suspendWal" : "resumeWal",
    }
    if (ctx.Resume && ctx.NumberLiteral) {
      const n = tokenInt(ctx.NumberLiteral[0].image)
      if (ctx.Txn) result.fromTxn = n
      else if (ctx.Transaction) result.fromTransaction = n
    }
    if (ctx.Suspend && ctx.With) {
      if (ctx.NumberLiteral) {
        result.code = tokenInt(ctx.NumberLiteral[0].image)
      } else if (ctx.StringLiteral && ctx.StringLiteral.length > 0) {
        result.code = unquoteSingle(ctx.StringLiteral[0].image)
      }
      const strings = ctx.StringLiteral || []
      if (strings.length > 0) {
        result.message = unquoteSingle(strings[strings.length - 1].image)
      }
    }
    return result
  }

  anchorClause(ctx: AnchorClauseCstChildren): AST.AnchorClause {
    if (ctx.Expression) {
      return {
        kind: "expression",
        expr: this.visit(ctx.expression!) as AST.Expression,
      }
    }
    const result: AST.AnchorClause = {
      kind: "daily",
      time: unquoteSingle(ctx.StringLiteral![0].image),
    }
    if (ctx.StringLiteral && ctx.StringLiteral.length > 1) {
      result.timezone = unquoteSingle(ctx.StringLiteral[1].image)
    }
    return result
  }

  partitionPeriod(
    ctx: PartitionPeriodCstChildren,
  ): "NONE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR" {
    if (ctx.None) return "NONE"
    if (ctx.Hour) return "HOUR"
    if (ctx.Day) return "DAY"
    if (ctx.Week) return "WEEK"
    if (ctx.Month) return "MONTH"
    if (ctx.Year) return "YEAR"
    return "NONE"
  }

  timeUnit(ctx: TimeUnitCstChildren): string {
    if (ctx.Hours) return "HOURS"
    if (ctx.Days) return "DAYS"
    if (ctx.Weeks) return "WEEKS"
    if (ctx.Months) return "MONTHS"
    if (ctx.Years) return "YEARS"
    if (ctx.Hour) return "HOUR"
    if (ctx.Day) return "DAY"
    if (ctx.Week) return "WEEK"
    if (ctx.Month) return "MONTH"
    if (ctx.Year) return "YEAR"
    if (ctx.Minute) return "MINUTE"
    if (ctx.Minutes) return "MINUTES"
    if (ctx.Second) return "SECOND"
    if (ctx.Seconds) return "SECONDS"
    if (ctx.Millisecond) return "MILLISECOND"
    if (ctx.Milliseconds) return "MILLISECONDS"
    if (ctx.Microsecond) return "MICROSECOND"
    if (ctx.Microseconds) return "MICROSECONDS"
    if (ctx.Nanosecond) return "NANOSECOND"
    if (ctx.Nanoseconds) return "NANOSECONDS"
    return "DAYS"
  }

  storagePolicyTimeUnit(
    ctx: StoragePolicyTimeUnitCstChildren,
  ): "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS" {
    if (ctx.Hours || ctx.Hour) return "HOURS"
    if (ctx.Days || ctx.Day) return "DAYS"
    if (ctx.Weeks || ctx.Week) return "WEEKS"
    if (ctx.Months || ctx.Month) return "MONTHS"
    if (ctx.Years || ctx.Year) return "YEARS"
    return "DAYS"
  }

  dedupClause(ctx: DedupClauseCstChildren): DedupModeKeys {
    return this.visit(ctx.dedupModeKeys) as DedupModeKeys
  }

  dedupKeyword(_ctx: DedupKeywordCstChildren): void {
    // DEDUP | DEDUPLICATE carry no value; printed as DEDUP
  }

  dedupModeKeys(ctx: DedupModeKeysCstChildren): DedupModeKeys {
    return {
      mode: ctx.Skip ? "skip" : "upsert",
      keys: ctx.identifier.map((id: IdentifierCstNode) =>
        this.extractIdentifierName(id.children),
      ),
    }
  }

  // ==========================================================================
  // ALTER TABLE Statement
  // ==========================================================================

  alterStatement(ctx: AlterStatementCstChildren): AST.Statement {
    if (ctx.alterTableStatement) {
      return this.visit(ctx.alterTableStatement) as AST.AlterTableStatement
    }
    if (ctx.alterMaterializedViewStatement) {
      return this.visit(
        ctx.alterMaterializedViewStatement,
      ) as AST.AlterMaterializedViewStatement
    }
    if (ctx.alterLiveViewStatement) {
      return this.visit(
        ctx.alterLiveViewStatement,
      ) as AST.AlterLiveViewStatement
    }
    if (ctx.alterViewStatement) {
      return this.visit(ctx.alterViewStatement) as AST.AlterViewStatement
    }
    if (ctx.alterUserStatement) {
      return this.visit(ctx.alterUserStatement) as AST.AlterUserStatement
    }
    if (ctx.alterServiceAccountStatement) {
      return this.visit(
        ctx.alterServiceAccountStatement,
      ) as AST.AlterServiceAccountStatement
    }
    if (ctx.alterGroupStatement) {
      return this.visit(ctx.alterGroupStatement) as AST.AlterGroupStatement
    }
    throw new Error("Unknown alter statement type")
  }

  alterViewStatement(
    ctx: AlterViewStatementCstChildren,
  ): AST.AlterViewStatement {
    return {
      type: "alterView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      query: ctx.selectStatement
        ? (this.visit(ctx.selectStatement[0]) as AST.SelectStatement)
        : (this.visit(ctx.implicitSelectStatement!) as AST.SelectStatement),
    }
  }

  alterGroupStatement(
    ctx: AlterGroupStatementCstChildren,
  ): AST.AlterGroupStatement {
    const group = this.visit(ctx.qualifiedName) as AST.QualifiedName
    if (ctx.memoryLimit) {
      return {
        type: "alterGroup",
        group,
        action: "setMemoryLimit",
        memoryLimit: this.visit(ctx.memoryLimit) as string,
      }
    }
    const alias = unquoteSingle(ctx.StringLiteral![0].image)
    return {
      type: "alterGroup",
      group,
      action: ctx.With ? "setAlias" : "dropAlias",
      externalAlias: alias,
    }
  }

  alterTableStatement(
    ctx: AlterTableStatementCstChildren,
  ): AST.AlterTableStatement {
    const table = this.visit(ctx.tableNameOrString) as AST.QualifiedName
    return {
      type: "alterTable",
      table,
      action: this.visit(ctx.alterTableAction) as AST.AlterTableAction,
    }
  }

  alterMaterializedViewStatement(
    ctx: AlterMaterializedViewStatementCstChildren,
  ): AST.AlterMaterializedViewStatement {
    return {
      type: "alterMaterializedView",
      view: this.visit(ctx.tableName) as AST.QualifiedName,
      action: this.visit(
        ctx.alterMaterializedViewAction,
      ) as AST.AlterMaterializedViewAction,
    }
  }

  alterMaterializedViewAction(
    ctx: AlterMaterializedViewActionCstChildren,
  ): AST.AlterMaterializedViewAction {
    // SET STORAGE POLICY(...) — must come before generic SET branches below
    if (ctx.Set && ctx.storagePolicy) {
      return {
        actionType: "setStoragePolicy",
        policy: this.visit(ctx.storagePolicy) as AST.StoragePolicy,
      }
    }
    // SET EXPIRE ROWS ...
    if (ctx.Set && ctx.expireRowsClause) {
      return {
        actionType: "setExpireRows",
        expireRows: this.visit(ctx.expireRowsClause) as AST.ExpireRowsClause,
      }
    }
    // DROP EXPIRE [ROWS]
    if (ctx.Drop && ctx.Expire) {
      return { actionType: "dropExpire" }
    }
    // DROP STORAGE POLICY
    if (ctx.Drop && ctx.Storage && ctx.Policy && !ctx.Alter) {
      return { actionType: "dropStoragePolicy" }
    }
    // ENABLE STORAGE POLICY
    if (ctx.Enable && ctx.Storage && ctx.Policy) {
      return { actionType: "enableStoragePolicy" }
    }
    // DISABLE STORAGE POLICY
    if (ctx.Disable && ctx.Storage && ctx.Policy) {
      return { actionType: "disableStoragePolicy" }
    }

    if (ctx.Add && ctx.Index) {
      const colRef = this.visit(ctx.columnRef![0]) as AST.ColumnRef
      const result: AST.AlterMaterializedViewAddIndex = {
        actionType: "addIndex",
        column: colRef.name.parts[colRef.name.parts.length - 1],
      }
      if (ctx.indexTypeOptions) {
        const opts = this.visit(ctx.indexTypeOptions[0]) as {
          capacity?: number
          indexType?: AST.AlterMaterializedViewAddIndex["indexType"]
          include?: string[]
        }
        if (opts.capacity !== undefined) result.capacity = opts.capacity
        if (opts.indexType) result.indexType = opts.indexType
        if (opts.include) result.indexInclude = opts.include
      }
      return result
    }

    if (ctx.Symbol && ctx.Capacity) {
      const colRef = this.visit(ctx.columnRef![0]) as AST.ColumnRef
      return {
        actionType: "symbolCapacity",
        column: colRef.name.parts[colRef.name.parts.length - 1],
        capacity: tokenInt(ctx.NumberLiteral![0].image),
      }
    }

    if (ctx.Ttl) {
      return {
        actionType: "setTtl",
        ttl: this.extractTtl(ctx),
      }
    }

    if (ctx.Limit) {
      return {
        actionType: "setRefreshLimit",
        limit: this.extractTtl(ctx),
      }
    }

    // ALTER COLUMN x DROP INDEX
    if (ctx.Alter && ctx.Drop && ctx.Index) {
      const colRef = this.visit(ctx.columnRef![0]) as AST.ColumnRef
      return {
        actionType: "dropIndex",
        column: colRef.name.parts[colRef.name.parts.length - 1],
      }
    }

    // RESUME WAL [FROM TRANSACTION n]
    if (ctx.Resume) {
      const result: AST.ResumeWalAction = { actionType: "resumeWal" }
      if (ctx.NumberLiteral) {
        result.fromTxn = tokenInt(ctx.NumberLiteral[0].image)
      }
      return result
    }

    // SUSPEND WAL
    if (ctx.Suspend) {
      return { actionType: "suspendWal" }
    }

    // REBASE WAL [INTO '<targetDir>']
    if (ctx.Rebase) {
      const result: AST.AlterMaterializedViewRebaseWal = {
        actionType: "rebaseWal",
      }
      if (ctx.Into && ctx.StringLiteral && ctx.StringLiteral.length > 0) {
        result.targetDir = unquoteSingle(ctx.StringLiteral[0].image)
      }
      return result
    }

    return {
      actionType: "setRefresh",
      refresh: ctx.materializedViewRefresh
        ? (this.visit(
            ctx.materializedViewRefresh,
          ) as AST.MaterializedViewRefresh)
        : undefined,
      period: ctx.materializedViewPeriod
        ? (this.visit(ctx.materializedViewPeriod) as AST.MaterializedViewPeriod)
        : undefined,
    }
  }

  alterUserStatement(
    ctx: AlterUserStatementCstChildren,
  ): AST.AlterUserStatement {
    return {
      type: "alterUser",
      user: this.visit(ctx.qualifiedName) as AST.QualifiedName,
      action: this.visit(ctx.alterUserAction) as AST.AlterUserAction,
    }
  }

  alterServiceAccountStatement(
    ctx: AlterServiceAccountStatementCstChildren,
  ): AST.AlterServiceAccountStatement {
    return {
      type: "alterServiceAccount",
      account: this.visit(ctx.qualifiedName) as AST.QualifiedName,
      action: this.visit(ctx.alterUserAction) as AST.AlterUserAction,
    }
  }

  alterUserAction(ctx: AlterUserActionCstChildren): AST.AlterUserAction {
    if (ctx.memoryLimit) {
      return {
        actionType: "setMemoryLimit",
        limit: this.visit(ctx.memoryLimit) as string,
      }
    }
    if (ctx.Enable) {
      return { actionType: "enable" }
    }
    if (ctx.Disable) {
      return { actionType: "disable" }
    }
    if (ctx.Password || ctx.No) {
      return {
        actionType: "password",
        noPassword: !!ctx.No,
        password: ctx.StringLiteral
          ? unquoteSingle(ctx.StringLiteral[0].image)
          : undefined,
      }
    }
    if (ctx.Create && ctx.Token) {
      let ttl: string | undefined
      if (ctx.DurationLiteral) {
        ttl = ctx.DurationLiteral[0].image
      } else if (ctx.Ttl && ctx.StringLiteral) {
        ttl = unquoteSingle(ctx.StringLiteral[0].image)
      }
      const result: AST.AlterUserCreateTokenAction = {
        actionType: "createToken",
        tokenType: ctx.Jwk ? "JWK" : "REST",
        ttl,
        refresh: !!ctx.Refresh,
      }
      if (ctx.Transient) {
        result.transient = true
      }
      // JWK public key: WITH PUBLIC KEY X '...' Y '...'
      if (ctx.Public && ctx.Key && ctx.Identifier) {
        // In JWK path, StringLiteral[0] and [1] are the public key values
        result.publicKeyX = unquoteSingle(ctx.StringLiteral![0].image)
        result.publicKeyY = unquoteSingle(ctx.StringLiteral![1].image)
      }
      return result
    }
    return {
      actionType: "dropToken",
      tokenType: ctx.Jwk ? "JWK" : "REST",
      token:
        ctx.Identifier?.[0]?.image ??
        (ctx.StringLiteral
          ? unquoteSingle(ctx.StringLiteral[0].image)
          : undefined),
    }
  }

  memoryLimit(ctx: MemoryLimitCstChildren): string {
    if (ctx.Unlimited) return "UNLIMITED"
    if (ctx.DurationLiteral) return ctx.DurationLiteral[0].image
    return ctx.NumberLiteral![0].image + (ctx.Identifier?.[0]?.image ?? "")
  }

  alterTableForceAction(
    ctx: AlterTableForceActionCstChildren,
  ): AST.ForceDropPartitionAction | AST.ForceReindexParquetAction {
    const partitions = (ctx.StringLiteral ?? []).map((s: IToken) =>
      unquoteSingle(s.image),
    )
    if (ctx.Drop) {
      return { actionType: "forceDropPartition", partitions }
    }
    const result: AST.ForceReindexParquetAction = {
      actionType: "forceReindexParquet",
    }
    if (ctx.identifier) {
      result.column = this.extractIdentifierName(ctx.identifier[0].children)
    }
    if (partitions.length > 0) {
      result.partitions = partitions
    }
    return result
  }

  alterTableAction(ctx: AlterTableActionCstChildren): AST.AlterTableAction {
    // FORCE DROP PARTITION / FORCE REINDEX PARQUET
    if (ctx.alterTableForceAction) {
      return this.visit(ctx.alterTableForceAction) as AST.AlterTableAction
    }
    // SET STORAGE POLICY(...) — must come before generic SET branches below
    if (ctx.Set && ctx.storagePolicy) {
      return {
        actionType: "setStoragePolicy",
        policy: this.visit(ctx.storagePolicy) as AST.StoragePolicy,
      }
    }
    // DROP STORAGE POLICY — must come before generic DROP branches below
    if (ctx.Drop && ctx.Storage && ctx.Policy) {
      return { actionType: "dropStoragePolicy" }
    }
    // ENABLE STORAGE POLICY
    if (ctx.Enable && ctx.Storage && ctx.Policy) {
      return { actionType: "enableStoragePolicy" }
    }
    // DISABLE STORAGE POLICY
    if (ctx.Disable && ctx.Storage && ctx.Policy) {
      return { actionType: "disableStoragePolicy" }
    }

    // ADD COLUMN
    if (ctx.Add && ctx.columnDefinition) {
      const result: AST.AddColumnAction = {
        actionType: "addColumn",
        columns: ctx.columnDefinition.map(
          (c: CstNode) => this.visit(c) as AST.ColumnDefinition,
        ),
      }
      if (ctx.If) {
        result.ifNotExists = true
      }
      return result
    }

    // DROP COLUMN (when Drop token exists but no Partition and no Alter — Alter + Drop = ALTER COLUMN DROP INDEX)
    if (ctx.Drop && ctx.columnRef && !ctx.Partition && !ctx.Alter) {
      return {
        actionType: "dropColumn",
        columns: ctx.columnRef.map((c: CstNode) => {
          const ref = this.visit(c) as AST.ColumnRef
          return ref.name.parts[ref.name.parts.length - 1]
        }),
      }
    }

    // RENAME COLUMN
    if (ctx.Rename) {
      const oldRef = this.visit(ctx.columnRef![0]) as AST.ColumnRef
      const oldName = oldRef.name.parts[oldRef.name.parts.length - 1]
      const newName = this.extractIdentifierName(ctx.identifier![0].children)
      return {
        actionType: "renameColumn",
        oldName,
        newName,
      }
    }

    // ALTER COLUMN
    if (ctx.Alter && ctx.columnRef) {
      const colRef = this.visit(ctx.columnRef[0]) as AST.ColumnRef
      const column = colRef.name.parts[colRef.name.parts.length - 1]
      // SET PARQUET(...)
      if (ctx.Set && ctx.parquetConfig) {
        return {
          actionType: "alterColumn",
          column,
          alterType: "setParquet",
          parquetConfig: this.visit(ctx.parquetConfig) as AST.ParquetConfig,
        } as AST.AlterColumnAction
      }

      let alterType:
        | "type"
        | "addIndex"
        | "dropIndex"
        | "cache"
        | "nocache"
        | "symbolCapacity" = "type"
      let newType: string | undefined
      let capacity: number | undefined
      let indexType: AST.AlterColumnAction["indexType"]
      let indexInclude: string[] | undefined

      if (ctx.Type) {
        alterType = "type"
        newType = this.visit(ctx.dataType!) as string
        if (ctx.Capacity && ctx.NumberLiteral) {
          capacity = tokenInt(ctx.NumberLiteral[0].image)
        }
      } else if (ctx.Add && ctx.Index) {
        alterType = "addIndex"
        if (ctx.indexTypeOptions) {
          const opts = this.visit(ctx.indexTypeOptions[0]) as {
            capacity?: number
            indexType?: AST.AlterColumnAction["indexType"]
            include?: string[]
          }
          if (opts.capacity !== undefined) capacity = opts.capacity
          if (opts.indexType) indexType = opts.indexType
          if (opts.include) indexInclude = opts.include
        }
      } else if (ctx.Drop && ctx.Index) {
        alterType = "dropIndex"
      } else if (ctx.Symbol && ctx.Capacity) {
        alterType = "symbolCapacity"
        capacity = tokenInt(ctx.NumberLiteral![0].image)
      } else if (ctx.Cache) {
        alterType = "cache"
      } else if (ctx.Nocache) {
        alterType = "nocache"
      }

      const result: AST.AlterColumnAction = {
        actionType: "alterColumn",
        column,
        alterType,
      }
      if (newType) {
        result.newType = newType
      }
      if (capacity !== undefined) {
        result.capacity = capacity
      }
      if (indexType) result.indexType = indexType
      if (indexInclude) result.indexInclude = indexInclude
      if (alterType === "type") {
        if (ctx.Cache) result.cache = true
        else if (ctx.Nocache) result.cache = false
      }
      return result
    }

    // DROP PARTITION
    if (ctx.Drop && ctx.Partition) {
      const result: AST.DropPartitionAction = {
        actionType: "dropPartition",
      }
      if (ctx.StringLiteral) {
        result.partitions = ctx.StringLiteral.map((s: IToken) =>
          unquoteSingle(s.image),
        )
      }
      if (ctx.Where && ctx.expression) {
        result.where = this.visit(ctx.expression) as AST.Expression
      }
      return result
    }

    // ATTACH PARTITION
    if (ctx.Attach) {
      return {
        actionType: "attachPartition",
        partitions: ctx.StringLiteral!.map((s: IToken) =>
          unquoteSingle(s.image),
        ),
      }
    }

    // DETACH PARTITION
    if (ctx.Detach) {
      const result: AST.DetachPartitionAction = {
        actionType: "detachPartition",
      }
      if (ctx.StringLiteral) {
        result.partitions = ctx.StringLiteral.map((s: IToken) =>
          unquoteSingle(s.image),
        )
      }
      if (ctx.Where && ctx.expression) {
        result.where = this.visit(ctx.expression) as AST.Expression
      }
      return result
    }

    // SQUASH PARTITIONS
    if (ctx.Squash) {
      return {
        actionType: "squashPartitions",
      }
    }

    if (ctx.Set && ctx.Param) {
      return {
        actionType: "setParam",
        params: ctx.tableParam!.map(
          (p: CstNode) => this.visit(p) as AST.TableParam,
        ),
      }
    }

    if (ctx.Set && ctx.Ttl) {
      return {
        actionType: "setTtl",
        ttl: this.extractTtl(ctx),
      }
    }

    if (ctx.Set && ctx.tableFormatKind) {
      return {
        actionType: "setTableFormat",
        format: this.visit(ctx.tableFormatKind) as "parquet" | "native",
      }
    }

    if (ctx.dedupKeyword && ctx.Disable) {
      return {
        actionType: "dedupDisable",
      }
    }

    if (ctx.dedupKeyword && ctx.dedupModeKeys) {
      const dedup = this.visit(ctx.dedupModeKeys) as DedupModeKeys
      return {
        actionType: "dedupEnable",
        keys: dedup.keys,
        dedupMode: dedup.mode,
      }
    }

    // SUSPEND WAL [WITH code, 'message']
    if (ctx.Suspend) {
      const result: AST.SuspendWalAction = { actionType: "suspendWal" }
      if (ctx.With) {
        // Code can be a NumberLiteral or StringLiteral
        if (ctx.NumberLiteral) {
          result.code = tokenInt(ctx.NumberLiteral[0].image)
        } else if (ctx.StringLiteral && ctx.StringLiteral.length > 0) {
          result.code = unquoteSingle(ctx.StringLiteral[0].image)
        }
        // Message is the last StringLiteral
        const strings = ctx.StringLiteral || []
        if (strings.length > 0) {
          result.message = unquoteSingle(strings[strings.length - 1].image)
        }
      }
      return result
    }

    // RESUME WAL [FROM TXN/TRANSACTION number]
    if (ctx.Resume) {
      const result: AST.ResumeWalAction = { actionType: "resumeWal" }
      if (ctx.NumberLiteral) {
        const num = tokenInt(ctx.NumberLiteral[0].image)
        if (ctx.Txn) {
          result.fromTxn = num
        } else if (ctx.Transaction) {
          result.fromTransaction = num
        }
      }
      return result
    }

    // REBASE WAL [INTO '<targetDir>']
    if (ctx.Rebase) {
      const result: AST.RebaseWalAction = { actionType: "rebaseWal" }
      if (ctx.Into && ctx.StringLiteral && ctx.StringLiteral.length > 0) {
        result.targetDir = unquoteSingle(ctx.StringLiteral[0].image)
      }
      return result
    }

    // CONVERT PARTITION
    if (ctx.Convert) {
      const target = this.visit(
        ctx.convertPartitionTarget!,
      ) as ConvertPartitionTargetResult
      return {
        actionType: "convertPartition",
        ...target,
      } as AST.ConvertPartitionAction
    }

    // SET TYPE [BYPASS] WAL
    if (ctx.Set && ctx.Type) {
      return {
        actionType: "setTypeWal",
        bypass: !!ctx.Bypass,
      } as AST.SetTypeWalAction
    }

    throw new Error("Unknown alter table action")
  }

  // ==========================================================================
  // DROP TABLE Statement
  // ==========================================================================

  dropStatement(ctx: DropStatementCstChildren): AST.Statement {
    if (ctx.dropTableStatement) {
      return this.visit(ctx.dropTableStatement) as AST.DropTableStatement
    }
    if (ctx.dropMaterializedViewStatement) {
      return this.visit(
        ctx.dropMaterializedViewStatement,
      ) as AST.DropMaterializedViewStatement
    }
    if (ctx.dropLiveViewStatement) {
      return this.visit(ctx.dropLiveViewStatement) as AST.DropLiveViewStatement
    }
    if (ctx.dropViewStatement) {
      return this.visit(ctx.dropViewStatement) as AST.DropViewStatement
    }
    if (ctx.dropUserStatement) {
      return this.visit(ctx.dropUserStatement) as AST.DropUserStatement
    }
    if (ctx.dropGroupStatement) {
      return this.visit(ctx.dropGroupStatement) as AST.DropGroupStatement
    }
    if (ctx.dropServiceAccountStatement) {
      return this.visit(
        ctx.dropServiceAccountStatement,
      ) as AST.DropServiceAccountStatement
    }
    throw new Error("Unknown drop statement type")
  }

  dropTableStatement(
    ctx: DropTableStatementCstChildren,
  ): AST.DropTableStatement {
    const result: AST.DropTableStatement = {
      type: "dropTable",
    }

    if (ctx.All) {
      result.allTables = true
    } else {
      result.table = this.visit(ctx.tableName!) as AST.QualifiedName
      if (ctx.If) {
        result.ifExists = true
      }
    }

    return result
  }

  dropMaterializedViewStatement(
    ctx: DropMaterializedViewStatementCstChildren,
  ): AST.DropMaterializedViewStatement {
    return {
      type: "dropMaterializedView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      ifExists: !!ctx.If,
    }
  }

  dropViewStatement(ctx: DropViewStatementCstChildren): AST.DropViewStatement {
    return {
      type: "dropView",
      view: this.visit(ctx.stringOrQualifiedName) as AST.QualifiedName,
      ifExists: !!ctx.If,
    }
  }

  dropUserStatement(ctx: DropUserStatementCstChildren): AST.DropUserStatement {
    return {
      type: "dropUser",
      user: this.visit(ctx.qualifiedName) as AST.QualifiedName,
      ifExists: !!ctx.If,
    }
  }

  dropGroupStatement(
    ctx: DropGroupStatementCstChildren,
  ): AST.DropGroupStatement {
    return {
      type: "dropGroup",
      group: this.visit(ctx.qualifiedName) as AST.QualifiedName,
      ifExists: !!ctx.If,
    }
  }

  dropServiceAccountStatement(
    ctx: DropServiceAccountStatementCstChildren,
  ): AST.DropServiceAccountStatement {
    return {
      type: "dropServiceAccount",
      account: this.visit(ctx.qualifiedName) as AST.QualifiedName,
      ifExists: !!ctx.If,
    }
  }

  // ==========================================================================
  // TRUNCATE TABLE Statement
  // ==========================================================================

  truncateTableStatement(
    ctx: TruncateTableStatementCstChildren,
  ): AST.TruncateTableStatement {
    const tables = ctx.tableName.map(
      (qn) => this.visit(qn) as AST.QualifiedName,
    )

    const result: AST.TruncateTableStatement = {
      type: "truncateTable",
      tables,
    }

    if (ctx.If) {
      result.ifExists = true
    }

    if (ctx.Only) {
      result.only = true
    }

    if (ctx.Keep) {
      result.keepSymbolMaps = true
    }

    return result
  }

  // ==========================================================================
  // RENAME TABLE Statement
  // ==========================================================================

  renameTableStatement(
    ctx: RenameTableStatementCstChildren,
  ): AST.RenameTableStatement {
    return {
      type: "renameTable",
      from: this.visit(ctx.tableNameOrString[0]) as AST.QualifiedName,
      to: this.visit(ctx.tableNameOrString[1]) as AST.QualifiedName,
    }
  }

  addUserStatement(ctx: AddUserStatementCstChildren): AST.AddUserStatement {
    return {
      type: "addUser",
      user: this.visit(ctx.qualifiedName[0]) as AST.QualifiedName,
      groups: ctx.qualifiedName
        .slice(1)
        .map((q: CstNode) => this.visit(q) as AST.QualifiedName),
    }
  }

  removeUserStatement(
    ctx: RemoveUserStatementCstChildren,
  ): AST.RemoveUserStatement {
    return {
      type: "removeUser",
      user: this.visit(ctx.qualifiedName[0]) as AST.QualifiedName,
      groups: ctx.qualifiedName
        .slice(1)
        .map((q: CstNode) => this.visit(q) as AST.QualifiedName),
    }
  }

  assumeServiceAccountStatement(
    ctx: AssumeServiceAccountStatementCstChildren,
  ): AST.AssumeServiceAccountStatement {
    return {
      type: "assumeServiceAccount",
      account: this.visit(ctx.qualifiedName) as AST.QualifiedName,
    }
  }

  exitServiceAccountStatement(
    ctx: ExitServiceAccountStatementCstChildren,
  ): AST.ExitServiceAccountStatement {
    const result: AST.ExitServiceAccountStatement = {
      type: "exitServiceAccount",
    }
    if (ctx.qualifiedName) {
      result.account = this.visit(ctx.qualifiedName) as AST.QualifiedName
    }
    return result
  }

  cancelQueryStatement(
    ctx: CancelQueryStatementCstChildren,
  ): AST.CancelQueryStatement {
    const token =
      ctx.NumberLiteral?.[0] ?? ctx.Identifier?.[0] ?? ctx.StringLiteral?.[0]
    return {
      type: "cancelQuery",
      queryId: ctx.StringLiteral
        ? unquoteSingle(ctx.StringLiteral[0].image)
        : (token?.image ?? ""),
    }
  }

  // ==========================================================================
  // SHOW Statement
  // ==========================================================================

  showCreateDatabaseCategory(
    ctx: ShowCreateDatabaseCategoryCstChildren,
  ): string {
    return ctx.All
      ? "all"
      : (this.visit(ctx.identifier![0]) as AST.QualifiedName).parts[0]
  }

  showStatement(ctx: ShowStatementCstChildren): AST.ShowStatement {
    if (ctx.Tables) {
      return {
        type: "show",
        showType: "tables",
      }
    }

    if (ctx.Columns) {
      return {
        type: "show",
        showType: "columns",
        table: this.visit(ctx.qualifiedName!) as AST.QualifiedName,
      }
    }

    if (ctx.Partitions) {
      return {
        type: "show",
        showType: "partitions",
        table: this.visit(ctx.qualifiedName!) as AST.QualifiedName,
      }
    }

    if (ctx.Create) {
      if (ctx.Materialized) {
        return {
          type: "show",
          showType: "createMaterializedView",
          table: this.visit(ctx.qualifiedName!) as AST.QualifiedName,
        }
      }
      if (ctx.Live) {
        return {
          type: "show",
          showType: "createLiveView",
          table: this.visit(ctx.tableName!) as AST.QualifiedName,
        }
      }
      if (ctx.View) {
        return {
          type: "show",
          showType: "createView",
          table: this.visit(ctx.qualifiedName!) as AST.QualifiedName,
        }
      }
      if (ctx.Database) {
        const result: AST.ShowStatement = {
          type: "show",
          showType: "createDatabase",
        }
        if (ctx.Include || ctx.Exclude) {
          const mode = ctx.Include ? "include" : "exclude"
          if (ctx.All) {
            result.databaseInclude = { mode, all: true }
          } else {
            result.databaseInclude = {
              mode,
              categories: (ctx.showCreateDatabaseCategory ?? []).map(
                (n) => this.visit(n) as string,
              ),
            }
          }
        }
        return result
      }
      return {
        type: "show",
        showType: "createTable",
        table: this.visit(ctx.qualifiedName!) as AST.QualifiedName,
      }
    }

    if (ctx.User) {
      return {
        type: "show",
        showType: "user",
        name: ctx.qualifiedName
          ? (this.visit(ctx.qualifiedName) as AST.QualifiedName)
          : undefined,
      }
    }

    if (ctx.Users) {
      return {
        type: "show",
        showType: "users",
      }
    }

    if (ctx.Groups) {
      return {
        type: "show",
        showType: "groups",
        name: ctx.qualifiedName
          ? (this.visit(ctx.qualifiedName) as AST.QualifiedName)
          : undefined,
      }
    }

    if (ctx.Service && ctx.Account) {
      return {
        type: "show",
        showType: "serviceAccount",
        name: ctx.qualifiedName
          ? (this.visit(ctx.qualifiedName) as AST.QualifiedName)
          : undefined,
      }
    }

    if (ctx.Service && ctx.Accounts) {
      return {
        type: "show",
        showType: "serviceAccounts",
        name: ctx.qualifiedName
          ? (this.visit(ctx.qualifiedName) as AST.QualifiedName)
          : undefined,
      }
    }

    if (ctx.Permissions) {
      return {
        type: "show",
        showType: "permissions",
        name: ctx.qualifiedName
          ? (this.visit(ctx.qualifiedName) as AST.QualifiedName)
          : undefined,
      }
    }

    if (ctx.ServerVersion) {
      return {
        type: "show",
        showType: "serverVersion",
      }
    }

    if (ctx.Parameters) {
      return {
        type: "show",
        showType: "parameters",
      }
    }

    if (ctx.Transaction && ctx.Isolation) {
      return { type: "show", showType: "transactionIsolationLevel" }
    }
    if (ctx.TransactionIsolation) {
      return { type: "show", showType: "transactionIsolationLevel" }
    }
    if (ctx.MaxIdentifierLength) {
      return { type: "show", showType: "maxIdentifierLength" }
    }
    if (ctx.StandardConformingStrings) {
      return { type: "show", showType: "standardConformingStrings" }
    }
    if (ctx.SearchPath) {
      return { type: "show", showType: "searchPath" }
    }
    if (ctx.Datestyle) {
      return { type: "show", showType: "dateStyle" }
    }
    if (ctx.Time && ctx.Zone) {
      return { type: "show", showType: "timeZone" }
    }
    if (ctx.ServerVersionNum) {
      return { type: "show", showType: "serverVersionNum" }
    }
    if (ctx.DefaultTransactionReadOnly) {
      return { type: "show", showType: "defaultTransactionReadOnly" }
    }

    throw new Error("Unknown show type")
  }

  // ==========================================================================
  // EXPLAIN Statement
  // ==========================================================================

  explainStatement(ctx: ExplainStatementCstChildren): AST.ExplainStatement {
    const result: AST.ExplainStatement = {
      type: "explain",
      statement: this.visit(ctx.statement) as AST.Statement,
    }
    if (ctx.Format && ctx.Identifier) {
      result.format = ctx.Identifier[0].image.toUpperCase()
    }
    return result
  }

  // ==========================================================================
  // COPY, CHECKPOINT, SNAPSHOT Statements
  // ==========================================================================

  copyStatement(ctx: CopyStatementCstChildren): AST.CopyStatement {
    if (ctx.copyCancel) {
      return this.visit(ctx.copyCancel) as AST.CopyCancelStatement
    }
    if (ctx.copyPermissions) {
      return this.visit(ctx.copyPermissions) as AST.CopyPermissionsStatement
    }
    if (ctx.copyFrom) {
      return this.visit(ctx.copyFrom) as AST.CopyFromStatement
    }
    return this.visit(ctx.copyTo!) as AST.CopyToStatement
  }

  copyCancel(ctx: CopyCancelCstChildren): AST.CopyCancelStatement {
    let id = ""
    if (ctx.StringLiteral) {
      id = unquoteSingle(ctx.StringLiteral[0].image)
    } else if (ctx.NumberLiteral) {
      id = ctx.NumberLiteral[0].image
    } else if (ctx.Identifier) {
      id = ctx.Identifier[0].image
    }
    return {
      type: "copyCancel",
      id,
    }
  }

  copyPermissions(
    ctx: CopyPermissionsCstChildren,
  ): AST.CopyPermissionsStatement {
    return {
      type: "copyPermissions",
      from: this.visit(ctx.identifier[0]) as AST.QualifiedName,
      to: this.visit(ctx.identifier[1]) as AST.QualifiedName,
    }
  }

  copyFrom(ctx: CopyFromCstChildren): AST.CopyFromStatement {
    const result: AST.CopyFromStatement = {
      type: "copyFrom",
      table: this.visit(ctx.tableName) as AST.QualifiedName,
      file: this.extractMaybeString(ctx.stringOrIdentifier[0]),
    }
    if (ctx.copyOptions) {
      result.options = this.visit(ctx.copyOptions) as AST.CopyOption[]
    }
    return result
  }

  copyTo(ctx: CopyToCstChildren): AST.CopyToStatement {
    const source = ctx.selectStatement
      ? (this.visit(ctx.selectStatement[0]) as AST.SelectStatement)
      : ctx.implicitSelectStatement
        ? (this.visit(ctx.implicitSelectStatement[0]) as AST.SelectStatement)
        : (this.visit(ctx.tableName!) as AST.QualifiedName)
    const result: AST.CopyToStatement = {
      type: "copyTo",
      source,
      destination: this.extractMaybeString(ctx.stringOrIdentifier[0]),
    }
    if (ctx.copyOptions) {
      result.options = this.visit(ctx.copyOptions) as AST.CopyOption[]
    }
    return result
  }

  copyOptions(ctx: CopyOptionsCstChildren): AST.CopyOption[] {
    return ctx.copyOption.map((o: CstNode) => this.visit(o) as AST.CopyOption)
  }

  copyOption(ctx: CopyOptionCstChildren): AST.CopyOption {
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
      ctx.BloomFilterColumns?.[0] ??
      ctx.BloomFilterFpp?.[0] ??
      (ctx.On ? ctx.On[0] : undefined)

    let key = keyToken?.image ?? "OPTION"
    if (ctx.On && ctx.Error) key = "ON ERROR"
    else if (ctx.Partition && ctx.By) key = "PARTITION BY"
    const result: AST.CopyOption = {
      type: "copyOption",
      key,
    }

    if (ctx.booleanLiteral) {
      result.value = this.visit(ctx.booleanLiteral) as boolean
    } else if (ctx.NumberLiteral) {
      // PARQUET_VERSION with bare number literal (e.g., PARQUET_VERSION 2)
      result.value = tokenInt(ctx.NumberLiteral[0].image)
    } else if (ctx.stringOrIdentifier) {
      result.value = this.extractMaybeString(ctx.stringOrIdentifier[0])
      // Mark as quoted when the stringOrIdentifier resolved to a string literal
      const soiChildren = (ctx.stringOrIdentifier[0] as CstNode).children
      if (soiChildren.StringLiteral) {
        result.quoted = true
      }
    } else if (ctx.StringLiteral) {
      result.value = unquoteSingle(ctx.StringLiteral[0].image)
      result.quoted = true
    } else if (ctx.expression) {
      const expr = this.visit(ctx.expression) as AST.Expression
      if (
        expr?.type === "literal" &&
        expr.literalType === "number" &&
        /[mMdD]$/.test(expr.raw ?? "")
      ) {
        // keep a suffixed number (3d, 1m) verbatim; it used to be a duration
        result.value = expr.raw!
      } else if (expr?.type === "literal" && expr.literalType === "number") {
        result.value = expr.value as number
      } else if (expr?.type === "literal" && expr.literalType === "string") {
        result.value = expr.value as string
        result.quoted = true
      } else if (expr?.type === "literal") {
        result.value = expr.raw ?? String(expr.value ?? "")
      } else {
        result.value = ""
      }
    } else if (ctx.identifier) {
      result.value = this.extractIdentifierName(ctx.identifier[0].children)
    } else if (
      ctx.Uncompressed ||
      ctx.Snappy ||
      ctx.Gzip ||
      ctx.Lz4 ||
      ctx.Zstd ||
      ctx.Lz4Raw ||
      ctx.Brotli ||
      ctx.Lzo
    ) {
      const codecToken =
        ctx.Uncompressed?.[0] ??
        ctx.Snappy?.[0] ??
        ctx.Gzip?.[0] ??
        ctx.Lz4?.[0] ??
        ctx.Zstd?.[0] ??
        ctx.Lz4Raw?.[0] ??
        ctx.Brotli?.[0] ??
        ctx.Lzo?.[0]
      result.value = codecToken?.image
    } else if (ctx.partitionPeriod && (ctx.Partition || ctx.PartitionBy)) {
      result.value = this.visit(ctx.partitionPeriod) as
        | "NONE"
        | "HOUR"
        | "DAY"
        | "WEEK"
        | "MONTH"
        | "YEAR"
    } else if (ctx.SkipRow || ctx.SkipColumn || ctx.Abort) {
      result.value = ctx.SkipRow
        ? "SKIP_ROW"
        : ctx.SkipColumn
          ? "SKIP_COLUMN"
          : "ABORT"
    }

    return result
  }

  checkpointStatement(
    ctx: CheckpointStatementCstChildren,
  ): AST.CheckpointStatement {
    return {
      type: "checkpoint",
      action: ctx.Create ? "create" : "release",
    }
  }

  snapshotStatement(ctx: SnapshotStatementCstChildren): AST.SnapshotStatement {
    return {
      type: "snapshot",
      action: ctx.Prepare ? "prepare" : "complete",
    }
  }

  backupStatement(ctx: BackupStatementCstChildren): AST.BackupStatement {
    if (ctx.Database) {
      return { type: "backup", action: "database" }
    }
    if (ctx.Abort) {
      return { type: "backup", action: "abort" }
    }
    return {
      type: "backup",
      action: "table",
      table: this.visit(ctx.tableName!) as AST.QualifiedName,
    }
  }

  switchStatement(ctx: SwitchStatementCstChildren): AST.SwitchStatement {
    if (ctx.Cold) {
      if (ctx.Status) {
        return { type: "switch", action: "coldStorageStatus" }
      }
      const result: AST.SwitchStatement = {
        type: "switch",
        action: "coldStorageRole",
        role: ctx.Refresher ? "REFRESHER" : "MANAGER",
      }
      if (ctx.Force) {
        result.force = true
      }
      if (ctx.Timeout && ctx.NumberLiteral) {
        result.timeout = tokenInt(ctx.NumberLiteral[0].image)
      }
      return result
    }
    if (ctx.Status) {
      return { type: "switch", action: "status" }
    }
    const result: AST.SwitchStatement = {
      type: "switch",
      action: "role",
      role: ctx.Replica ? "REPLICA" : "PRIMARY",
    }
    if (ctx.Timeout && ctx.NumberLiteral) {
      result.timeout = tokenInt(ctx.NumberLiteral[0].image)
    }
    return result
  }

  compileViewStatement(
    ctx: CompileViewStatementCstChildren,
  ): AST.CompileViewStatement {
    return {
      type: "compileView",
      view: this.visit(ctx.tableName) as AST.QualifiedName,
    }
  }

  convertPartitionTarget(
    ctx: ConvertPartitionTargetCstChildren,
  ): ConvertPartitionTargetResult {
    const result: ConvertPartitionTargetResult = {
      target: "TABLE",
    }

    // Optional LIST of partition names
    if (ctx.StringLiteral) {
      result.partitions = ctx.StringLiteral.map((s: IToken) =>
        unquoteSingle(s.image),
      )
    }

    // Target: TABLE or identifier (e.g., Parquet, NATIVE)
    if (ctx.Table) {
      result.target = "TABLE"
    } else if (ctx.identifier) {
      result.target = this.extractIdentifierName(
        ctx.identifier[0].children,
      ).toUpperCase()
    }

    // Optional WHERE clause
    if (ctx.expression) {
      result.where = this.visit(ctx.expression[0]) as AST.Expression
    }

    if (ctx.tableParam) {
      result.withParams = ctx.tableParam.map(
        (p: CstNode) => this.visit(p) as AST.TableParam,
      )
    }

    return result
  }

  // ==========================================================================
  // GRANT / REVOKE Statements
  // ==========================================================================

  grantStatement(ctx: GrantStatementCstChildren): AST.GrantStatement {
    const result: AST.GrantStatement = {
      type: "grant",
      permissions: this.visit(ctx.permissionList) as string[],
      to: this.visit(ctx.qualifiedName) as AST.QualifiedName,
    }
    if (ctx.All) {
      result.on = { type: "grantOn", allTables: true }
    } else if (ctx.grantTableTarget) {
      result.on = {
        type: "grantOn",
        tables: ctx.grantTableTarget.map(
          (t: CstNode) => this.visit(t) as AST.GrantTableTarget,
        ),
      }
    }
    if (ctx.Option) {
      result.grantOption = true
    }
    if (ctx.Verification) {
      result.verification = true
    }
    return result
  }

  revokeStatement(ctx: RevokeStatementCstChildren): AST.RevokeStatement {
    const result: AST.RevokeStatement = {
      type: "revoke",
      permissions: this.visit(ctx.permissionList) as string[],
      from: this.visit(ctx.qualifiedName) as AST.QualifiedName,
    }
    if (ctx.On) {
      if (ctx.All && ctx.Tables) {
        result.on = { type: "grantOn", allTables: true }
      } else if (ctx.grantTableTarget) {
        result.on = {
          type: "grantOn",
          tables: ctx.grantTableTarget.map(
            (t: CstNode) => this.visit(t) as AST.GrantTableTarget,
          ),
        }
      }
    }
    return result
  }

  permissionList(ctx: PermissionListCstChildren): string[] {
    return ctx.permissionToken.map(
      (token: CstNode) => this.visit(token) as string,
    )
  }

  permissionToken(ctx: PermissionTokenCstChildren): string {
    // Collect all tokens and identifiers, sort by position, join with space.
    // The parser rule has a required first word + optional second word(s).
    const parts: { image: string; offset: number }[] = []

    for (const key of Object.keys(ctx)) {
      const items = (ctx as Record<string, unknown[]>)[key]
      if (!Array.isArray(items)) continue
      for (const item of items) {
        const tok = item as IToken
        const node = item as CstNode
        if (tok.image) {
          // Direct token
          parts.push({ image: tok.image, offset: tok.startOffset })
        } else if (node.children) {
          // Identifier subrule — extract the name
          const name = this.extractIdentifierName(node.children)
          const firstChild = Object.values(node.children)
            .flat()
            .find((c): c is IToken => (c as IToken)?.startOffset != null)
          parts.push({ image: name, offset: firstChild?.startOffset ?? 0 })
        }
      }
    }

    parts.sort((a, b) => a.offset - b.offset)
    return parts.map((p) => p.image).join(" ")
  }

  grantTableTarget(ctx: GrantTableTargetCstChildren): AST.GrantTableTarget {
    const result: AST.GrantTableTarget = {
      type: "grantTableTarget",
      table: this.visit(ctx.tableName) as AST.QualifiedName,
    }
    const cols = (ctx.identifier ?? []).map((id: IdentifierCstNode) =>
      this.extractIdentifierName(id.children),
    )
    if (ctx.Star) {
      result.allColumns = true
      if (ctx.Exclude && cols.length > 0) {
        result.excludeColumns = cols
      }
    } else if (cols.length > 0) {
      result.columns = cols
    }
    return result
  }

  grantAssumeServiceAccountStatement(
    ctx: GrantAssumeServiceAccountStatementCstChildren,
  ): AST.GrantAssumeServiceAccountStatement {
    return {
      type: "grantAssumeServiceAccount",
      account: this.visit(ctx.qualifiedName[0]) as AST.QualifiedName,
      to: this.visit(ctx.qualifiedName[1]) as AST.QualifiedName,
      grantOption: !!ctx.Option,
    }
  }

  revokeAssumeServiceAccountStatement(
    ctx: RevokeAssumeServiceAccountStatementCstChildren,
  ): AST.RevokeAssumeServiceAccountStatement {
    return {
      type: "revokeAssumeServiceAccount",
      account: this.visit(ctx.qualifiedName[0]) as AST.QualifiedName,
      from: this.visit(ctx.qualifiedName[1]) as AST.QualifiedName,
    }
  }

  // ==========================================================================
  // VACUUM / RESUME WAL / SET TYPE / REINDEX
  // ==========================================================================

  vacuumTableStatement(
    ctx: VacuumTableStatementCstChildren,
  ): AST.VacuumTableStatement {
    return {
      type: "vacuumTable",
      table: this.visit(ctx.tableName) as AST.QualifiedName,
    }
  }

  resumeWalStatement(
    ctx: ResumeWalStatementCstChildren,
  ): AST.ResumeWalStatement {
    const result: AST.ResumeWalStatement = {
      type: "resumeWal",
    }
    if (ctx.Transaction && ctx.NumberLiteral) {
      result.fromTransaction = tokenInt(ctx.NumberLiteral[0].image)
    }
    if (ctx.Txn && ctx.NumberLiteral) {
      result.fromTxn = tokenInt(ctx.NumberLiteral[0].image)
    }
    return result
  }

  setTypeStatement(ctx: SetTypeStatementCstChildren): AST.SetTypeStatement {
    return {
      type: "setType",
      bypass: !!ctx.Bypass,
      wal: !!ctx.Wal,
    }
  }

  reindexTableStatement(
    ctx: ReindexTableStatementCstChildren,
  ): AST.ReindexTableStatement {
    const result: AST.ReindexTableStatement = {
      type: "reindexTable",
      table: this.visit(ctx.tableName) as AST.QualifiedName,
    }
    if (ctx.Column && ctx.identifier) {
      result.columns = ctx.identifier.map((id: IdentifierCstNode) =>
        this.extractIdentifierName(id.children),
      )
    }
    if (ctx.Partition && ctx.stringOrIdentifier) {
      // Partition names are values (printed back single-quoted), unlike the
      // OWNED BY name that stringOrIdentifier() returns verbatim.
      result.partitions = ctx.stringOrIdentifier.map((s: CstNode) =>
        s.children.StringLiteral
          ? unquoteSingle((s.children.StringLiteral[0] as IToken).image)
          : (this.visit(s) as string),
      )
    }
    if (ctx.Exclusive) {
      result.lockExclusive = true
    }
    return result
  }

  refreshMaterializedViewStatement(
    ctx: RefreshMaterializedViewStatementCstChildren,
  ): AST.RefreshMaterializedViewStatement {
    const result: AST.RefreshMaterializedViewStatement = {
      type: "refreshMaterializedView",
      view: this.visit(ctx.tableName) as AST.QualifiedName,
    }
    if (ctx.Full) result.mode = "full"
    if (ctx.Incremental) result.mode = "incremental"
    if (ctx.Stats) result.mode = "stats"
    if (ctx.Range) {
      result.mode = "range"
      if (ctx.stringOrIdentifier) {
        result.from = this.extractMaybeString(ctx.stringOrIdentifier[0])
        result.to = this.extractMaybeString(ctx.stringOrIdentifier[1])
      }
    }
    return result
  }

  // ==========================================================================
  // PIVOT Statement
  // ==========================================================================

  pivotStatement(ctx: PivotStatementCstChildren): AST.PivotStatement {
    const source = ctx.selectStatement
      ? (this.visit(ctx.selectStatement[0]) as AST.SelectStatement)
      : (this.visit(ctx.tableName!) as AST.QualifiedName)
    const body: Partial<PivotBodyResult> = ctx.pivotBody
      ? (this.visit(ctx.pivotBody) as PivotBodyResult)
      : {}
    const result: AST.PivotStatement = {
      type: "pivot",
      source,
      aggregations: body.aggregations || [],
      pivots: body.pivots || [],
    }
    if (ctx.whereClause) {
      result.where = this.visit(ctx.whereClause) as AST.Expression
    }
    if (body.groupBy) {
      result.groupBy = body.groupBy
    }
    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause) as AST.OrderByItem[]
    }
    if (ctx.limitClause) {
      result.limit = this.visit(ctx.limitClause) as AST.LimitClause
    }
    if (ctx.identifier) {
      result.alias = this.extractIdentifierName(ctx.identifier[0].children)
    }
    return result
  }

  pivotBody(ctx: PivotBodyCstChildren): {
    aggregations: AST.PivotAggregation[]
    pivots: AST.PivotForClause[]
    groupBy?: AST.Expression[]
  } {
    const aggregations = ctx.pivotAggregation
      ? ctx.pivotAggregation.map(
          (p: CstNode) => this.visit(p) as AST.PivotAggregation,
        )
      : []
    const pivots = ctx.pivotForClause
      ? ctx.pivotForClause.map(
          (p: CstNode) => this.visit(p) as AST.PivotForClause,
        )
      : []
    const result: {
      aggregations: AST.PivotAggregation[]
      pivots: AST.PivotForClause[]
      groupBy?: AST.Expression[]
    } = {
      aggregations,
      pivots,
    }
    if (ctx.Group && ctx.expression) {
      result.groupBy = ctx.expression.map(
        (e: CstNode) => this.visit(e) as AST.Expression,
      )
    }
    return result
  }

  pivotAggregation(ctx: PivotAggregationCstChildren): AST.PivotAggregation {
    return {
      type: "pivotAggregation",
      expression: this.visit(ctx.expression) as AST.Expression,
      alias: ctx.identifier
        ? (this.visit(ctx.identifier) as AST.QualifiedName).parts[0]
        : undefined,
    }
  }

  pivotForClause(ctx: PivotForClauseCstChildren): AST.PivotForClause {
    const result: AST.PivotForClause = {
      type: "pivotFor",
      expression: this.visit(ctx.bitOrExpression) as AST.Expression,
      in: {
        type: "pivotIn",
      },
    }
    if (ctx.selectStatement) {
      result.in.select = this.visit(ctx.selectStatement) as AST.SelectStatement
    } else if (ctx.pivotInValue && ctx.pivotInValue.length > 0) {
      result.in.values = ctx.pivotInValue.map(
        (e: CstNode) => this.visit(e) as AST.PivotInValue,
      )
    }
    return result
  }

  pivotInValue(ctx: PivotInValueCstChildren): AST.PivotInValue {
    const result: AST.PivotInValue = {
      type: "pivotInValue",
      expression: this.visit(ctx.expression) as AST.Expression,
    }
    if (ctx.identifier) {
      result.alias = this.extractIdentifierName(ctx.identifier[0].children)
    }
    return result
  }

  // ==========================================================================
  // Expressions
  // ==========================================================================

  expression(ctx: ExpressionCstChildren): AST.Expression {
    return this.visit(ctx.orExpression) as AST.Expression
  }

  orExpression(ctx: OrExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.andExpression[0]) as AST.Expression

    if (ctx.andExpression.length > 1) {
      for (let i = 1; i < ctx.andExpression.length; i++) {
        result = {
          type: "binary",
          operator: "OR",
          left: result,
          right: this.visit(ctx.andExpression[i]) as AST.Expression,
        }
      }
    }

    return result
  }

  andExpression(ctx: AndExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.notExpression[0]) as AST.Expression

    if (ctx.notExpression.length > 1) {
      for (let i = 1; i < ctx.notExpression.length; i++) {
        result = {
          type: "binary",
          operator: "AND",
          left: result,
          right: this.visit(ctx.notExpression[i]) as AST.Expression,
        }
      }
    }

    return result
  }

  notExpression(ctx: NotExpressionCstChildren): AST.Expression {
    let inner = this.visit(ctx.equalityExpression) as AST.Expression

    // `NOT NOT x`: one unary node per NOT
    for (let i = 0; i < (ctx.Not?.length ?? 0); i++) {
      inner = {
        type: "unary",
        operator: "NOT",
        operand: inner,
      }
    }

    return inner
  }

  equalityExpression(ctx: EqualityExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.relationalExpression[0]) as AST.Expression

    // Operators and right operands, both in source order (left-associative
    // chain: `a = 1 = true`). A right operand is either a relational
    // expression or `NOT <notExpression>`.
    const ops = [
      ...(ctx.Equals ?? []).map((t) => ({ t, op: "=" })),
      ...(ctx.NotEquals ?? []).map((t) => ({ t, op: "!=" })),
      ...(ctx.Like ?? []).map((t) => ({ t, op: "LIKE" })),
      ...(ctx.Ilike ?? []).map((t) => ({ t, op: "ILIKE" })),
      ...(ctx.RegexMatch ?? []).map((t) => ({ t, op: "~" })),
      ...(ctx.RegexNotMatch ?? []).map((t) => ({ t, op: "!~" })),
      ...(ctx.RegexNotEquals ?? []).map((t) => ({ t, op: "~=" })),
    ].sort((a, b) => a.t.startOffset - b.t.startOffset)
    const operands = [
      ...ctx.relationalExpression.slice(1).map((node) => ({
        offset: this.getFirstTokenOffset(node),
        build: () => this.visit(node) as AST.Expression,
      })),
      ...(ctx.notOperand ?? []).map((node, i) => ({
        offset: ctx.Not![i].startOffset,
        build: (): AST.Expression => ({
          type: "unary",
          operator: "NOT",
          operand: this.visit(node) as AST.Expression,
        }),
      })),
    ].sort((a, b) => a.offset - b.offset)

    ops.forEach(({ t, op }, i) => {
      const operand = operands[i]
      let operator = op
      if (op === "!=") {
        // `<> ALL` / `!= ALL` keeps the operator as written
        const all = ctx.All?.some(
          (a) =>
            a.startOffset > t.startOffset && a.startOffset < operand.offset,
        )
        if (all) operator = `${t.image} ALL`
      }
      result = {
        type: "binary",
        operator,
        left: result,
        right: operand.build(),
      }
    })

    return result
  }

  relationalExpression(ctx: RelationalExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.setExpression[0]) as AST.Expression

    // Left-associative chain of `< <= > >=` and IS [NOT] NULL|TRUE|FALSE,
    // in source order.
    const ops = [
      ...(ctx.LessThan ?? []).map((t) => ({ t, op: "<" })),
      ...(ctx.LessThanOrEqual ?? []).map((t) => ({ t, op: "<=" })),
      ...(ctx.GreaterThan ?? []).map((t) => ({ t, op: ">" })),
      ...(ctx.GreaterThanOrEqual ?? []).map((t) => ({ t, op: ">=" })),
      ...(ctx.Is ?? []).map((t) => ({ t, op: "IS" })),
    ].sort((a, b) => a.t.startOffset - b.t.startOffset)
    const isValues = [
      ...(ctx.Null ?? []).map((t) => ({ t, v: "NULL" })),
      ...(ctx.True ?? []).map((t) => ({ t, v: "TRUE" })),
      ...(ctx.False ?? []).map((t) => ({ t, v: "FALSE" })),
    ].sort((a, b) => a.t.startOffset - b.t.startOffset)
    let operandIdx = 1
    let isIdx = 0

    for (const { t, op } of ops) {
      if (op === "IS") {
        const value = isValues[isIdx++]
        const not = !!ctx.Not?.some(
          (n) =>
            n.startOffset > t.startOffset &&
            n.startOffset < value.t.startOffset,
        )
        result =
          value.v === "NULL"
            ? { type: "isNull", expression: result, not }
            : {
                type: "isBoolean",
                expression: result,
                value: value.v === "TRUE",
                not,
              }
      } else {
        result = {
          type: "binary",
          operator: op,
          left: result,
          right: this.visit(ctx.setExpression[operandIdx++]) as AST.Expression,
        }
      }
    }

    return result
  }

  setExpression(ctx: SetExpressionCstChildren): AST.Expression {
    const left = this.visit(ctx.bitOrExpression[0]) as AST.Expression

    // Check for [NOT] IN
    if (ctx.In) {
      const result: AST.InExpression = {
        type: "in",
        expression: left,
        values: [],
        not: !!ctx.Not,
      }
      if (ctx.LParen) {
        result.parenthesized = true
        result.values = ctx.expression!.map(
          (e: CstNode) => this.visit(e) as AST.Expression,
        )
      } else if (ctx.inValue) {
        result.values = ctx.inValue.map(
          (e: CstNode) => this.visit(e) as AST.Expression,
        )
      }
      return result
    }

    // Check for [NOT] BETWEEN
    if (ctx.Between) {
      return {
        type: "between",
        expression: left,
        low: this.visit(ctx.betweenLow![0]) as AST.Expression,
        high: this.visit(ctx.betweenHigh![0]) as AST.Expression,
        not: !!ctx.Not,
      }
    }

    // Check for WITHIN
    if (ctx.Within) {
      const result: AST.WithinExpression = {
        type: "within",
        expression: left,
        values: ctx.expression!.map(
          (e: CstNode) => this.visit(e) as AST.Expression,
        ),
      }
      if (ctx.Not) result.not = true
      return result
    }

    // Check for NOT LIKE / NOT ILIKE
    if (ctx.Like || ctx.Ilike) {
      const operator = ctx.Like ? "NOT LIKE" : "NOT ILIKE"
      return {
        type: "binary",
        operator,
        left,
        right: this.visit(ctx.notLikeRight![0]) as AST.Expression,
      }
    }

    return left
  }

  bitOrExpression(ctx: BitOrExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.bitXorExpression[0]) as AST.Expression

    if (ctx.bitXorExpression.length > 1) {
      for (let i = 1; i < ctx.bitXorExpression.length; i++) {
        result = {
          type: "binary",
          operator: "|",
          left: result,
          right: this.visit(ctx.bitXorExpression[i]) as AST.Expression,
        }
      }
    }

    return result
  }

  bitXorExpression(ctx: BitXorExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.bitAndExpression[0]) as AST.Expression

    if (ctx.bitAndExpression.length > 1) {
      for (let i = 1; i < ctx.bitAndExpression.length; i++) {
        result = {
          type: "binary",
          operator: "^",
          left: result,
          right: this.visit(ctx.bitAndExpression[i]) as AST.Expression,
        }
      }
    }

    return result
  }

  bitAndExpression(ctx: BitAndExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.concatExpression[0]) as AST.Expression

    if (ctx.concatExpression.length > 1) {
      for (let i = 1; i < ctx.concatExpression.length; i++) {
        result = {
          type: "binary",
          operator: "&",
          left: result,
          right: this.visit(ctx.concatExpression[i]) as AST.Expression,
        }
      }
    }

    return result
  }

  concatExpression(ctx: ConcatExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.ipv4ContainmentExpression[0]) as AST.Expression

    if (ctx.ipv4ContainmentExpression.length > 1) {
      for (let i = 1; i < ctx.ipv4ContainmentExpression.length; i++) {
        result = {
          type: "binary",
          operator: "||",
          left: result,
          right: this.visit(ctx.ipv4ContainmentExpression[i]) as AST.Expression,
        }
      }
    }

    return result
  }

  ipv4ContainmentExpression(
    ctx: Ipv4ContainmentExpressionCstChildren,
  ): AST.Expression {
    const left = this.visit(ctx.additiveExpression[0]) as AST.Expression

    if (ctx.additiveExpression.length > 1) {
      let operator: string
      if (ctx.IPv4ContainedByOrEqual) operator = "<<="
      else if (ctx.IPv4ContainedBy) operator = "<<"
      else if (ctx.IPv4ContainsOrEqual) operator = ">>="
      else operator = ">>"

      return {
        type: "binary",
        operator,
        left,
        right: this.visit(ctx.additiveExpression[1]) as AST.Expression,
      }
    }

    return left
  }

  additiveExpression(ctx: AdditiveExpressionCstChildren): AST.Expression {
    let result = this.visit(ctx.multiplicativeExpression[0]) as AST.Expression

    if (ctx.multiplicativeExpression.length > 1) {
      // Collect all operator tokens and sort by position for correct association
      const ops = [
        ...(ctx.Plus || []).map((t: IToken) => ({
          op: "+",
          offset: t.startOffset,
        })),
        ...(ctx.Minus || []).map((t: IToken) => ({
          op: "-",
          offset: t.startOffset,
        })),
      ].sort((a, b) => a.offset - b.offset)

      for (let i = 0; i < ops.length; i++) {
        result = {
          type: "binary",
          operator: ops[i].op,
          left: result,
          right: this.visit(
            ctx.multiplicativeExpression[i + 1],
          ) as AST.Expression,
        }
      }
    }

    return result
  }

  multiplicativeExpression(
    ctx: MultiplicativeExpressionCstChildren,
  ): AST.Expression {
    let result = this.visit(ctx.unaryExpression[0]) as AST.Expression

    if (ctx.unaryExpression.length > 1) {
      // Collect all operator tokens and sort by position for correct association
      const ops = [
        ...(ctx.Star || []).map((t: IToken) => ({
          op: "*",
          offset: t.startOffset,
        })),
        ...(ctx.Divide || []).map((t: IToken) => ({
          op: "/",
          offset: t.startOffset,
        })),
        ...(ctx.Modulo || []).map((t: IToken) => ({
          op: "%",
          offset: t.startOffset,
        })),
      ].sort((a, b) => a.offset - b.offset)

      for (let i = 0; i < ops.length; i++) {
        result = {
          type: "binary",
          operator: ops[i].op,
          left: result,
          right: this.visit(ctx.unaryExpression[i + 1]) as AST.Expression,
        }
      }
    }

    return result
  }

  unaryExpression(ctx: UnaryExpressionCstChildren): AST.Expression {
    let inner = this.visit(ctx.typeCastExpression) as AST.Expression

    // Stacked prefix operators (`- -a`, `~-a`): innermost is the last one
    const ops = [
      ...(ctx.Minus ?? []).map((t) => ({ t, op: "-" })),
      ...(ctx.RegexMatch ?? []).map((t) => ({ t, op: "~" })), // bitwise complement
    ].sort((a, b) => b.t.startOffset - a.t.startOffset)
    for (const { op } of ops) {
      inner = {
        type: "unary",
        operator: op,
        operand: inner,
      }
    }

    return inner
  }

  typeCastExpression(ctx: TypeCastExpressionCstChildren): AST.Expression {
    let inner = this.visit(ctx.primaryExpression) as AST.Expression

    // Member access on a parenthesised value: `(x).a`
    for (const member of ctx.member ?? []) {
      inner = {
        type: "memberAccess",
        expression: inner,
        member: this.extractIdentifierName(member.children),
      }
    }

    // Handle array subscripts: expr[i], expr[i:j], expr[i, j]
    // Group subscripts by their enclosing bracket pair so that
    // arr[1, 2] produces a single ArrayAccessExpression with 2 subscripts (nd-array access),
    // while arr[1][2] produces two nested ArrayAccessExpressions (chained access).
    if (ctx.arraySubscript && ctx.LBracket) {
      let subIdx = 0
      for (let i = 0; i < ctx.LBracket.length; i++) {
        const rbOffset = ctx.RBracket![i].startOffset
        const subscripts: (AST.Expression | AST.ArraySlice)[] = []
        while (subIdx < ctx.arraySubscript.length) {
          if (this.getFirstTokenOffset(ctx.arraySubscript[subIdx]) > rbOffset)
            break
          subscripts.push(
            this.visit(ctx.arraySubscript[subIdx]) as
              | AST.Expression
              | AST.ArraySlice,
          )
          subIdx++
        }
        inner = {
          type: "arrayAccess",
          array: inner,
          subscripts,
        } as AST.ArrayAccessExpression
      }
    }

    if (ctx.DoubleColon && ctx.castDataType) {
      for (let i = 0; i < ctx.DoubleColon.length; i++) {
        inner = {
          type: "typeCast",
          expression: inner,
          dataType: this.visit(ctx.castDataType[i]) as string,
        }
      }
    }

    if (ctx.At) {
      inner = {
        type: "atTimeZone",
        expression: inner,
        timeZone: this.typedLiteralString(
          ctx.StringLiteral,
          ctx.EscapeStringLiteral,
        ),
      }
    }

    return inner
  }

  arraySubscript(
    ctx: ArraySubscriptCstChildren,
  ): AST.Expression | AST.ArraySlice {
    const exprs = ctx.expression
      ? ctx.expression.map((e: CstNode) => this.visit(e) as AST.Expression)
      : []

    if (!ctx.Colon) {
      // Simple subscript: expr
      return exprs[0]
    }

    // It's a slice — determine start/end based on token positions
    if (exprs.length === 0) {
      return { type: "arraySlice" } as AST.ArraySlice
    }

    if (exprs.length === 2) {
      // start:end
      return {
        type: "arraySlice",
        start: exprs[0],
        end: exprs[1],
      } as AST.ArraySlice
    }

    // 1 expression + colon — disambiguate start: vs :end using offsets
    const colonOffset = ctx.Colon[0].startOffset
    const exprOffset = this.getFirstTokenOffset(ctx.expression![0])
    if (exprOffset < colonOffset) {
      // Expression before colon: start:
      return { type: "arraySlice", start: exprs[0] } as AST.ArraySlice
    } else {
      // Colon before expression: :end
      return { type: "arraySlice", end: exprs[0] } as AST.ArraySlice
    }
  }

  /**
   * Used in implicitSelectBody so that an incomplete clause (e.g. `trades WHERE price >`)
   * doesn't destroy the entire AST. The fromClause visit succeeds and is kept; the
   * whereClause visit throws on the empty expression shell and is discarded.
   * Without this, parseToAst would return ast:[] for any incomplete implicit select.
   *
   * See tests in parser.test.ts
   */
  private visitSafe(node: CstNode | CstNode[]): unknown {
    try {
      return this.visit(node) as unknown
    } catch {
      // Don't throw further
    }
  }

  /** Get the startOffset of the first token in a CST node or token */
  private getFirstTokenOffset(node: CstNode | IToken | undefined): number {
    if (!node) return Infinity
    if ("startOffset" in node) return node.startOffset
    let min = Infinity
    for (const children of Object.values(node.children)) {
      if (Array.isArray(children)) {
        for (const child of children) {
          const offset = this.getFirstTokenOffset(child)
          if (offset < min) min = offset
        }
      }
    }
    return min
  }

  primaryExpression(ctx: PrimaryExpressionCstChildren): AST.Expression {
    if (ctx.arrayLiteral) {
      return this.visit(ctx.arrayLiteral) as AST.ArrayLiteral
    }
    if (ctx.castExpression) {
      return this.visit(ctx.castExpression) as AST.CastExpression
    }
    if (ctx.caseExpression) {
      return this.visit(ctx.caseExpression) as AST.CaseExpression
    }
    if (ctx.functionCall) {
      return this.visit(ctx.functionCall) as AST.FunctionCall
    }
    if (ctx.timestampWithTimeZoneLiteral) {
      return this.visit(ctx.timestampWithTimeZoneLiteral) as AST.Literal
    }
    if (ctx.literal) {
      return this.visit(ctx.literal) as AST.Literal
    }
    if (ctx.VariableReference) {
      const image = ctx.VariableReference[0].image // e.g. "@limit"
      return {
        type: "variable",
        name: image.substring(1), // strip leading @
      }
    }
    if (ctx.BindVariable) {
      return {
        type: "bindVariable",
        name: ctx.BindVariable[0].image, // "$1" or ":name"
      }
    }
    if (ctx.identifierExpression) {
      return this.visit(ctx.identifierExpression) as AST.Expression
    }
    if (ctx.selectStatement) {
      return {
        type: "subquery",
        query: this.visit(ctx.selectStatement) as AST.SelectStatement,
      } as AST.SubqueryExpression
    }
    if (ctx.expression) {
      const result: AST.ParenExpression = {
        type: "paren",
        expression: this.visit(ctx.expression[0]) as AST.Expression,
      }
      if (ctx.expression.length > 1) {
        result.additionalExpressions = ctx.expression
          .slice(1)
          .map((e: CstNode) => this.visit(e) as AST.Expression)
      }
      return result
    }
    throw new Error("Unknown primary expression")
  }

  arrayLiteral(ctx: ArrayLiteralCstChildren): AST.ArrayLiteral {
    const result = this.visit(ctx.arrayBracketBody) as AST.ArrayLiteral
    result.hasArrayKeyword = true
    return result
  }

  arrayBracketBody(ctx: ArrayBracketBodyCstChildren): AST.ArrayLiteral {
    const elements: (AST.Expression | AST.ArrayLiteral)[] = []
    if (ctx.arrayElement) {
      for (const elem of ctx.arrayElement) {
        elements.push(this.visit(elem) as AST.Expression | AST.ArrayLiteral)
      }
    }
    return {
      type: "arrayLiteral",
      elements,
    }
  }

  arrayElement(
    ctx: ArrayElementCstChildren,
  ): AST.Expression | AST.ArrayLiteral {
    if (ctx.arrayBracketBody) {
      return this.visit(ctx.arrayBracketBody) as AST.ArrayLiteral
    }
    return this.visit(ctx.expression!) as AST.Expression
  }

  castExpression(ctx: CastExpressionCstChildren): AST.CastExpression {
    return {
      type: "cast",
      expression: this.visit(ctx.expression) as AST.Expression,
      dataType: this.visit(ctx.castDataType) as string,
    }
  }

  castDataType(ctx: CastDataTypeCstChildren): string {
    if (ctx.timestampWithTimeZoneType) {
      return this.visit(ctx.timestampWithTimeZoneType) as string
    }
    if (ctx.doublePrecisionType) {
      return this.visit(ctx.doublePrecisionType) as string
    }
    return this.visit(ctx.dataType!) as string
  }

  timestampWithTimeZoneType(ctx: TimestampWithTimeZoneTypeCstChildren): string {
    return `${ctx.TimestampNs ? "TIMESTAMP_NS" : "TIMESTAMP"} WITH TIME ZONE`
  }

  doublePrecisionType(ctx: DoublePrecisionTypeCstChildren): string {
    return "DOUBLE PRECISION" + "[]".repeat(ctx.LBracket?.length ?? 0)
  }

  dataType(ctx: DataTypeCstChildren): string {
    // GEOHASH with precision: GEOHASH(8c)
    if (ctx.Geohash) {
      let result = "GEOHASH"
      if (ctx.NumberLiteral && ctx.identifier) {
        const precision = ctx.NumberLiteral[0].image
        const unit = this.extractIdentifierName(ctx.identifier[0].children)
        result += `(${precision}${unit})`
      }
      // Append array dimensions
      if (ctx.LBracket) {
        for (let i = 0; i < ctx.LBracket.length; i++) result += "[]"
      }
      return result
    }

    // DECIMAL with optional precision: DECIMAL(18, 2) or DECIMAL(18)
    if (ctx.Decimal) {
      let result = "DECIMAL"
      if (ctx.NumberLiteral && ctx.NumberLiteral.length > 0) {
        const nums = ctx.NumberLiteral.map((n: IToken) => n.image)
        result += `(${nums.join(", ")})`
      }
      if (ctx.LBracket) {
        for (let i = 0; i < ctx.LBracket.length; i++) result += "[]"
      }
      return result
    }

    // All other types: find the first token image, then append array dims
    let baseType = "UNKNOWN"
    for (const key of Object.keys(ctx)) {
      if (
        key === "LBracket" ||
        key === "RBracket" ||
        key === "LParen" ||
        key === "RParen" ||
        key === "Comma" ||
        key === "NumberLiteral" ||
        key === "identifier"
      )
        continue
      const tokens = (ctx as Record<string, IToken[]>)[key]
      if (Array.isArray(tokens) && tokens.length > 0 && tokens[0].image) {
        baseType = tokens[0].image.toUpperCase()
        break
      }
    }

    // Append array dimensions: DOUBLE[], DOUBLE[][]
    if (ctx.LBracket) {
      for (let i = 0; i < ctx.LBracket.length; i++) baseType += "[]"
    }

    return baseType
  }

  caseExpression(ctx: CaseExpressionCstChildren): AST.CaseExpression {
    const whenClauses: { when: AST.Expression; then: AST.Expression }[] = []
    const expressions = ctx.expression || []
    const whenCount = ctx.When ? ctx.When.length : 0
    const hasElse = !!ctx.Else

    // Simple CASE has: operand + whenCount*2 pairs + optional else = operand + whenCount*2 [+ 1]
    // Searched CASE has: whenCount*2 pairs + optional else = whenCount*2 [+ 1]
    const expectedWithoutOperand = whenCount * 2 + (hasElse ? 1 : 0)
    const hasOperand = expressions.length > expectedWithoutOperand

    let offset = 0
    const result: AST.CaseExpression = { type: "case", whenClauses }

    if (hasOperand) {
      result.operand = this.visit(expressions[0]) as AST.Expression
      offset = 1
    }

    for (let i = 0; i < whenCount; i++) {
      const whenIdx = offset + i * 2
      const thenIdx = offset + i * 2 + 1
      if (expressions[whenIdx] && expressions[thenIdx]) {
        whenClauses.push({
          when: this.visit(expressions[whenIdx]) as AST.Expression,
          then: this.visit(expressions[thenIdx]) as AST.Expression,
        })
      }
    }

    if (hasElse) {
      result.elseClause = this.visit(
        expressions[expressions.length - 1],
      ) as AST.Expression
    }

    return result
  }

  functionName(ctx: FunctionNameCstChildren): string {
    if (ctx.identifier) {
      return (this.visit(ctx.identifier) as AST.QualifiedName).parts[0]
    }
    if (ctx.Left) return ctx.Left[0].image
    if (ctx.Right) return ctx.Right[0].image
    return ""
  }

  functionCall(ctx: FunctionCallCstChildren): AST.FunctionCall {
    const result: AST.FunctionCall = {
      type: "function",
      name: this.visit(ctx.functionName) as string,
      args: [],
    }

    if (ctx.Star) {
      result.star = true
    } else if (ctx.expression) {
      result.args = ctx.expression.map(
        (e: CstNode) => this.visit(e) as AST.Expression,
      )
    }

    if (ctx.Distinct) {
      result.distinct = true
    }

    if (ctx.From) {
      result.fromSeparator = true
    }

    if (ctx.Ignore) {
      result.ignoreNulls = true
    }
    if (ctx.Respect) {
      result.respectNulls = true
    }

    if (ctx.overClause) {
      result.over = this.visit(ctx.overClause) as AST.WindowSpecification
    }

    return result
  }

  identifierExpression(ctx: IdentifierExpressionCstChildren): AST.Expression {
    const qualName: AST.QualifiedName = this.visit(
      ctx.qualifiedName,
    ) as AST.QualifiedName

    // Typed literal: timestamp '2020-01-01'
    if (ctx.StringLiteral || ctx.EscapeStringLiteral) {
      return {
        ...this.typedLiteralString(ctx.StringLiteral, ctx.EscapeStringLiteral),
        typeName: qualName.parts[0].toUpperCase(),
      }
    }

    if (ctx.LParen) {
      // Function call (possibly schema-qualified)
      const result: AST.FunctionCall = {
        type: "function",
        name: qualName.parts.join("."),
        args: [],
      }
      if (ctx.Star) {
        result.star = true
      } else if (ctx.expression) {
        result.args = ctx.expression.map(
          (e: CstNode) => this.visit(e) as AST.Expression,
        )
      }
      if (ctx.Distinct) {
        result.distinct = true
      }
      if (ctx.From) {
        result.fromSeparator = true
      }
      if (ctx.Ignore) {
        result.ignoreNulls = true
      }
      if (ctx.Respect) {
        result.respectNulls = true
      }
      if (ctx.selectStatement) {
        result.subquery = this.visit(
          ctx.selectStatement[0],
        ) as AST.SelectStatement
      }
      if (ctx.overClause) {
        result.over = this.visit(ctx.overClause) as AST.WindowSpecification
      }
      return result
    }

    // Column reference
    return { type: "column", name: qualName }
  }

  overClause(ctx: OverClauseCstChildren): AST.WindowSpecification {
    // Named window reference: `OVER w` — the grammar's other branch.
    if (ctx.identifier && ctx.identifier.length > 0) {
      return {
        type: "windowSpec",
        windowName: this.extractIdentifierName(ctx.identifier[0].children),
      }
    }

    const result: AST.WindowSpecification = {
      type: "windowSpec",
    }

    if (ctx.windowPartitionByClause) {
      result.partitionBy = this.visit(
        ctx.windowPartitionByClause,
      ) as AST.Expression[]
    }

    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause) as AST.OrderByItem[]
    }

    if (ctx.windowFrameClause) {
      result.frame = this.visit(ctx.windowFrameClause) as AST.WindowFrame
    }

    if (ctx.anchorClause) {
      result.anchor = this.visit(ctx.anchorClause) as AST.AnchorClause
    }

    return result
  }

  windowClause(ctx: WindowClauseCstChildren): AST.NamedWindow[] {
    return ctx.namedWindow.map((n) => this.visit(n) as AST.NamedWindow)
  }

  namedWindow(ctx: NamedWindowCstChildren): AST.NamedWindow {
    const spec = this.visit(ctx.windowSpec) as Omit<
      AST.NamedWindow,
      "type" | "name"
    >
    return {
      type: "namedWindow",
      name: this.extractIdentifierName(ctx.identifier[0].children),
      ...spec,
    }
  }

  windowSpec(
    ctx: WindowSpecCstChildren,
  ): Omit<AST.NamedWindow, "type" | "name"> {
    const result: Omit<AST.NamedWindow, "type" | "name"> = {}

    // Optional base window name (inheritance)
    if (ctx.identifier && ctx.identifier.length > 0) {
      result.baseWindow = this.extractIdentifierName(ctx.identifier[0].children)
    }

    if (ctx.windowPartitionByClause) {
      result.partitionBy = this.visit(
        ctx.windowPartitionByClause,
      ) as AST.Expression[]
    }

    if (ctx.orderByClause) {
      result.orderBy = this.visit(ctx.orderByClause) as AST.OrderByItem[]
    }

    if (ctx.windowFrameClause) {
      result.frame = this.visit(ctx.windowFrameClause) as AST.WindowFrame
    }

    if (ctx.anchorClause) {
      result.anchor = this.visit(ctx.anchorClause) as AST.AnchorClause
    }

    return result
  }

  windowPartitionByClause(
    ctx: WindowPartitionByClauseCstChildren,
  ): AST.Expression[] {
    return ctx.expression.map((e: CstNode) => this.visit(e) as AST.Expression)
  }

  windowFrameClause(ctx: WindowFrameClauseCstChildren): AST.WindowFrame {
    let mode: string
    if (ctx.Rows) mode = "rows"
    else if (ctx.Range) mode = "range"
    else if (ctx.Groups) mode = "groups"
    else mode = "cumulative"

    const result: AST.WindowFrame = {
      type: "windowFrame",
      mode,
    } as AST.WindowFrame

    if (ctx.windowFrameBound && ctx.windowFrameBound.length > 0) {
      result.start = this.visit(ctx.windowFrameBound[0]) as AST.WindowFrameBound
      if (ctx.windowFrameBound.length > 1) {
        result.end = this.visit(ctx.windowFrameBound[1]) as AST.WindowFrameBound
      }
    }

    if (ctx.Exclude) {
      if (ctx.Current && ctx.Row) {
        result.exclude = "currentRow"
      } else if (ctx.Group) {
        result.exclude = "group"
      } else if (ctx.Ties) {
        result.exclude = "ties"
      } else if (ctx.No && ctx.Others) {
        result.exclude = "noOthers"
      }
    }

    return result
  }

  windowFrameBound(ctx: WindowFrameBoundCstChildren): AST.WindowFrameBound {
    if (ctx.Unbounded) {
      return {
        type: "windowFrameBound",
        kind: ctx.Preceding ? "unboundedPreceding" : "unboundedFollowing",
      }
    }

    if (ctx.Current) {
      return {
        type: "windowFrameBound",
        kind: "currentRow",
      }
    }

    if (ctx.durationExpression) {
      return {
        type: "windowFrameBound",
        kind: ctx.Preceding ? "preceding" : "following",
        duration: this.visit(ctx.durationExpression) as string,
      }
    }

    return {
      type: "windowFrameBound",
      kind: ctx.Preceding ? "preceding" : "following",
      value: this.visit(ctx.expression!) as AST.Expression,
    }
  }

  // ==========================================================================
  // Basic Elements
  // ==========================================================================

  literal(ctx: LiteralCstChildren): AST.Literal {
    if (ctx.NumberLiteral) {
      const image = this.tokenImage(ctx.NumberLiteral[0])
      const cleaned = image.replace(/_/g, "")
      return {
        type: "literal",
        value: cleaned.includes(".")
          ? parseFloat(cleaned)
          : parseInt(cleaned, 10),
        literalType: "number",
        raw: image,
      }
    }
    if (ctx.StringLiteral) {
      const raw = this.tokenImage(ctx.StringLiteral[0])
      // Remove outer quotes and unescape '' to '
      const value = unquoteSingle(raw)
      return {
        type: "literal",
        value,
        literalType: "string",
      }
    }
    if (ctx.True) {
      return { type: "literal", value: true, literalType: "boolean" }
    }
    if (ctx.False) {
      return { type: "literal", value: false, literalType: "boolean" }
    }
    if (ctx.Null) {
      return { type: "literal", value: null, literalType: "null" }
    }
    if (ctx.LongLiteral) {
      const image = this.tokenImage(ctx.LongLiteral[0])
      const numStr = image.replace(/[Ll_]/g, "")
      const parsed = parseInt(numStr, 10)
      return {
        type: "literal",
        value: Number.isSafeInteger(parsed) ? parsed : numStr,
        literalType: "number",
        raw: image,
      }
    }
    if (ctx.DecimalLiteral) {
      const image = this.tokenImage(ctx.DecimalLiteral[0])
      return {
        type: "literal",
        value: parseFloat(image.replace(/[mM_]/g, "")),
        literalType: "number",
        raw: image,
      }
    }
    if (ctx.GeohashLiteral) {
      return {
        type: "literal",
        value: this.tokenImage(ctx.GeohashLiteral[0]),
        literalType: "geohash",
      }
    }
    if (ctx.GeohashBinaryLiteral) {
      return {
        type: "literal",
        value: this.tokenImage(ctx.GeohashBinaryLiteral[0]),
        literalType: "geohash",
      }
    }
    if (ctx.DurationLiteral) {
      const image = this.tokenImage(ctx.DurationLiteral[0])
      // In an expression the server types `99m` / `1.5M` as DECIMAL and
      // `1d` / `1.5D` as DOUBLE (FunctionParser.createConstant: parseDouble
      // skips a d/D suffix, a trailing m/M means decimal). Other units
      // (1h, 30s, 1ms, ...) are not numbers there and stay durations.
      if (/[mMdD]$/.test(image)) {
        return {
          type: "literal",
          value: parseFloat(image.slice(0, -1).replace(/_/g, "")),
          literalType: "number",
          raw: image,
        }
      }
      return {
        type: "literal",
        value: image,
        literalType: "duration",
      }
    }
    if (ctx.Nan) {
      return {
        type: "literal",
        value: NaN,
        literalType: "number",
      }
    }
    if (ctx.HexLiteral) {
      // Long256 hex constant; keep the text (it does not fit a JS number)
      const image = this.tokenImage(ctx.HexLiteral[0])
      return {
        type: "literal",
        value: image,
        literalType: "number",
        raw: image,
      }
    }
    if (ctx.FloatLiteral) {
      const image = this.tokenImage(ctx.FloatLiteral[0])
      return {
        type: "literal",
        value: parseFloat(image.replace(/[_fFdD]/g, "")),
        literalType: "number",
        raw: image,
      }
    }
    if (ctx.EscapeStringLiteral) {
      return this.escapeStringLiteral(ctx.EscapeStringLiteral[0])
    }
    throw new Error("Unknown literal type")
  }

  timestampWithTimeZoneLiteral(
    ctx: TimestampWithTimeZoneLiteralCstChildren,
  ): AST.Literal {
    const type = ctx.TimestampNs ? "TIMESTAMP_NS" : "TIMESTAMP"
    return {
      ...this.typedLiteralString(ctx.StringLiteral, ctx.EscapeStringLiteral),
      typeName: `${type} WITH TIME ZONE`,
    }
  }

  private typedLiteralString(
    stringToken: IToken[] | undefined,
    escapeToken: IToken[] | undefined,
  ): AST.Literal {
    if (escapeToken) return this.escapeStringLiteral(escapeToken[0])
    return {
      type: "literal",
      value: unquoteSingle(this.tokenImage(stringToken![0])),
      literalType: "string",
    }
  }

  private escapeStringLiteral(token: IToken): AST.Literal {
    // E'abc' -> value abc; the server does not process backslashes, so only ''
    const raw = this.tokenImage(token)
    return {
      type: "literal",
      value: raw.slice(2, -1).replace(/''/g, "'"),
      literalType: "string",
      raw,
    }
  }

  booleanLiteral(ctx: BooleanLiteralCstChildren): boolean {
    return !!ctx.True
  }

  // Names (OWNED BY): a single-quoted name keeps its inner text verbatim, as
  // the server's GenericLexer.unquote does (see unquoteSingle).
  stringOrIdentifier(ctx: StringOrIdentifierCstChildren): string {
    if (ctx.StringLiteral) {
      return ctx.StringLiteral[0].image.slice(1, -1)
    }
    if (ctx.identifier) {
      return this.extractIdentifierName(ctx.identifier[0].children)
    }
    return this.extractMaybeString(ctx)
  }

  stringOrQualifiedName(
    ctx: StringOrQualifiedNameCstChildren,
  ): AST.QualifiedName {
    // Name kept verbatim (no '' unescape), see unquoteSingle.
    if (ctx.StringLiteral) {
      return {
        type: "qualifiedName",
        parts: [ctx.StringLiteral[0].image.slice(1, -1)],
      }
    }
    if (ctx.qualifiedName)
      return this.visit(ctx.qualifiedName) as AST.QualifiedName
    return { type: "qualifiedName", parts: [] }
  }

  intervalValue(ctx: IntervalValueCstChildren): string {
    return this.extractMaybeString(ctx)
  }

  timeZoneValue(ctx: TimeZoneValueCstChildren): string {
    return this.extractMaybeString(ctx)
  }

  columnRef(ctx: ColumnRefCstChildren): AST.ColumnRef {
    return {
      type: "column",
      name: this.visit(ctx.qualifiedName) as AST.QualifiedName,
    }
  }

  tableName(ctx: TableNameCstChildren): AST.QualifiedName {
    return this.visit(ctx.qualifiedName) as AST.QualifiedName
  }

  tableNameOrString(ctx: TableNameOrStringCstChildren): AST.QualifiedName {
    // Name kept verbatim (no '' unescape), see unquoteSingle.
    if (ctx.StringLiteral) {
      return {
        type: "qualifiedName",
        parts: [ctx.StringLiteral[0].image.slice(1, -1)],
      }
    }
    if (ctx.tableName) return this.visit(ctx.tableName) as AST.QualifiedName
    return { type: "qualifiedName", parts: [] }
  }

  qualifiedName(ctx: QualifiedNameCstChildren): AST.QualifiedName {
    const parts: string[] = ctx.identifier.map((id: CstNode) => {
      return this.extractIdentifierName(id.children)
    })

    return {
      type: "qualifiedName",
      parts,
    }
  }

  private extractMaybeString(node: CstNode | CstChildrenRecord): string {
    if (!node) return ""
    const ctx: CstChildrenRecord =
      "name" in node && "children" in node ? (node as CstNode).children : node
    if (ctx.StringLiteral) {
      return unquoteSingle(this.tokenImage(ctx.StringLiteral[0] as IToken))
    }
    if (ctx.NumberLiteral) {
      return this.tokenImage(ctx.NumberLiteral[0] as IToken)
    }
    if (ctx.DurationLiteral) {
      return this.tokenImage(ctx.DurationLiteral[0] as IToken)
    }
    if (ctx.Identifier) {
      return this.tokenImage(ctx.Identifier[0] as IToken)
    }
    if (ctx.QuotedIdentifier) {
      return unquoteIdentifier(
        this.tokenImage(ctx.QuotedIdentifier[0] as IToken),
      )
    }
    if (ctx.IdentifierKeyword) {
      return this.tokenImage(ctx.IdentifierKeyword[0] as IToken)
    }
    // Handle identifier subrule (lowercase) — wraps Identifier/QuotedIdentifier/IdentifierKeyword
    if (ctx.identifier) {
      return this.extractMaybeString((ctx.identifier as CstNode[])[0])
    }
    return ""
  }

  private extractTtl(ctx: CstChildrenRecord): {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  } {
    // Handle DurationLiteral (e.g., "2w", "12h", "30d", "1_000d", "1.5d")
    if (ctx.DurationLiteral) {
      const img = (ctx.DurationLiteral[0] as IToken).image
      // Digit run + optional decimal part, both with `_` digit separators
      // — matches the lexer DurationLiteral pattern. Without the decimal
      // alternative, `1.5d` would split as ("1", ".5d") and surface a
      // misleading "Invalid TTL duration unit '.5d'".
      const match = img.match(/^([\d_]+(?:\.[\d_]+)?)(.+)$/)
      if (match) {
        // Unit suffixes match QuestDB's case-insensitive ttlUnitToIndexMap in
        // PartitionBy.java: both `m` and `M` mean MONTHS (not minutes).
        const DURATION_UNIT_MAP: Record<
          string,
          "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
        > = {
          h: "HOURS",
          H: "HOURS",
          d: "DAYS",
          D: "DAYS",
          w: "WEEKS",
          W: "WEEKS",
          m: "MONTHS",
          M: "MONTHS",
          y: "YEARS",
          Y: "YEARS",
        }
        const unit = DURATION_UNIT_MAP[match[2]]
        if (!unit) {
          throw new Error(
            `Invalid TTL duration unit '${match[2]}' in '${img}'. Valid units: h/H (HOURS), d/D (DAYS), w/W (WEEKS), m/M (MONTHS), y/Y (YEARS)`,
          )
        }
        // parseFloat handles both integer ("30") and decimal ("1.5") prefixes.
        return {
          value: parseFloat(match[1].replace(/_/g, "")),
          unit,
        }
      }
    }
    // Handle NumberLiteral + optional timeUnit (e.g., "2 WEEKS", "1_000 DAYS")
    const value = tokenFloat(
      (ctx.NumberLiteral?.[0] as IToken | undefined)?.image ?? "0",
    )
    let unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS" = "DAYS"
    if (ctx.timeUnit) {
      unit = this.visit(ctx.timeUnit as CstNode[]) as typeof unit
    } else if (ctx.storagePolicyTimeUnit) {
      unit = this.visit(ctx.storagePolicyTimeUnit as CstNode[]) as typeof unit
    } else if (ctx.Identifier) {
      // single-letter unit: TTL 2 h
      const LETTER_UNITS: Record<
        string,
        "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
      > = {
        h: "HOURS",
        d: "DAYS",
        w: "WEEKS",
        m: "MONTHS",
        y: "YEARS",
      }
      unit =
        LETTER_UNITS[(ctx.Identifier[0] as IToken).image.toLowerCase()] ?? unit
      // Check plural forms first (TTL units) before singular (which may be PARTITION BY units)
    } else if (ctx.Hours) unit = "HOURS"
    else if (ctx.Days) unit = "DAYS"
    else if (ctx.Weeks) unit = "WEEKS"
    else if (ctx.Months) unit = "MONTHS"
    else if (ctx.Years) unit = "YEARS"
    else if (ctx.Hour) unit = "HOURS"
    else if (ctx.Day) unit = "DAYS"
    else if (ctx.Week) unit = "WEEKS"
    else if (ctx.Month) unit = "MONTHS"
    else if (ctx.Year) unit = "YEARS"
    return { value, unit }
  }

  // Helper to extract identifier name from token (regular, quoted, or keyword)
  private extractIdentifierName(ctx: CstChildrenRecord): string {
    if (ctx.Identifier) {
      return this.tokenImage(ctx.Identifier[0] as IToken)
    }
    if (ctx.QuotedIdentifier) {
      return unquoteIdentifier(
        this.tokenImage(ctx.QuotedIdentifier[0] as IToken),
      )
    }
    // QuestDB accepts single-quoted strings in identifier positions
    if (ctx.StringLiteral) {
      return unquoteSingle(this.tokenImage(ctx.StringLiteral[0] as IToken))
    }
    // Handle keyword tokens used as identifiers
    // Find the first token in the context
    for (const key of Object.keys(ctx)) {
      const tokens = ctx[key]
      if (Array.isArray(tokens) && tokens.length > 0) {
        const token = tokens[0]
        if (token && "image" in token && typeof token.image === "string") {
          return token.image
        }
      }
    }
    return ""
  }

  identifier(ctx: IdentifierCstChildren): AST.QualifiedName {
    const name = this.extractIdentifierName(ctx)
    return {
      type: "qualifiedName",
      parts: [name],
    }
  }
}

export const visitor = new QuestDBVisitor()
