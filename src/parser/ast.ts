// =============================================================================
// AST Type Definitions for QuestDB SQL
// =============================================================================

// Base interface for all AST nodes
export interface AstNode {
  type: string
}

// =============================================================================
// Statements
// =============================================================================

export type Statement =
  | SelectStatement
  | InsertStatement
  | UpdateStatement
  | CreateTableStatement
  | CreateMaterializedViewStatement
  | CreateLiveViewStatement
  | CreateUserStatement
  | CreateGroupStatement
  | CreateServiceAccountStatement
  | AlterTableStatement
  | AlterMaterializedViewStatement
  | AlterUserStatement
  | AlterServiceAccountStatement
  | CreateViewStatement
  | AlterViewStatement
  | AlterLiveViewStatement
  | DropTableStatement
  | DropMaterializedViewStatement
  | DropViewStatement
  | DropLiveViewStatement
  | DropUserStatement
  | DropGroupStatement
  | DropServiceAccountStatement
  | TruncateTableStatement
  | RenameTableStatement
  | AddUserStatement
  | RemoveUserStatement
  | AssumeServiceAccountStatement
  | ExitServiceAccountStatement
  | CancelQueryStatement
  | ShowStatement
  | ExplainStatement
  | CopyStatement
  | CheckpointStatement
  | SnapshotStatement
  | GrantStatement
  | RevokeStatement
  | GrantAssumeServiceAccountStatement
  | RevokeAssumeServiceAccountStatement
  | VacuumTableStatement
  | ResumeWalStatement
  | SetTypeStatement
  | ReindexTableStatement
  | RefreshMaterializedViewStatement
  | PivotStatement
  | BackupStatement
  | SwitchStatement
  | AlterGroupStatement
  | CompileViewStatement

export interface SelectStatement extends AstNode {
  type: "select"
  /** When true, the original query was an implicit SELECT (e.g., "trades" instead of "SELECT * FROM trades") */
  implicit?: boolean
  declare?: DeclareClause
  with?: CTE[]
  distinct?: boolean
  columns: SelectItem[]
  from?: TableRef[]
  where?: Expression
  sampleBy?: SampleByClause
  latestOn?: LatestOnClause
  groupBy?: Expression[]
  pivot?: PivotClause
  /** Named window definitions: SELECT ... WINDOW w AS (...) [, w2 AS (...)] */
  namedWindows?: NamedWindow[]
  orderBy?: OrderByItem[]
  limit?: LimitClause
  setOperations?: SetOperation[]
}

/**
 * A named window definition as used in the WINDOW clause:
 *   WINDOW w AS ([base_window] [PARTITION BY ...] [ORDER BY ...] [frame])
 * Referenced from window-function OVER clauses by name: `avg(x) OVER w`.
 * Introduced in QuestDB as of Feb 2026.
 */
export interface NamedWindow extends AstNode {
  type: "namedWindow"
  name: string
  /** Inherited base window (e.g. WINDOW w2 AS (w1 ORDER BY x)). */
  baseWindow?: string
  partitionBy?: Expression[]
  orderBy?: OrderByItem[]
  frame?: WindowFrame
  anchor?: AnchorClause
}

export interface CTE extends AstNode {
  type: "cte"
  name: string
  query: SelectStatement
}

export interface SetOperation extends AstNode {
  type: "setOperation"
  operator: "UNION" | "EXCEPT" | "INTERSECT"
  all?: boolean
  select: SelectStatement
}

export interface InsertStatement extends AstNode {
  type: "insert"
  table: QualifiedName
  atomic?: boolean
  batch?: {
    size: number
    o3MaxLag?: string
  }
  with?: CTE[]
  columns?: string[]
  values?: Expression[][]
  select?: SelectStatement
}

export interface UpdateStatement extends AstNode {
  type: "update"
  with?: CTE[]
  table: QualifiedName
  alias?: string
  set: SetClause[]
  from?: TableRef
  joins?: JoinClause[]
  where?: Expression
}

export interface DeclareClause extends AstNode {
  type: "declareClause"
  assignments: DeclareAssignment[]
}

export interface DeclareAssignment extends AstNode {
  type: "declareAssignment"
  name: string
  value: Expression
  overridable?: boolean
}

export interface CreateTableStatement extends AstNode {
  type: "createTable"
  table: QualifiedName
  atomic?: boolean
  batch?: {
    size: number
    o3MaxLag?: string
  }
  ifNotExists?: boolean
  columns?: ColumnDefinition[]
  like?: QualifiedName
  asSelect?: SelectStatement
  casts?: CastDefinition[]
  indexes?: IndexDefinition[]
  timestamp?: string
  partitionBy?: "NONE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR"
  wal?: boolean
  bypassWal?: boolean
  ttl?: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
  storagePolicy?: StoragePolicy
  withParams?: TableParam[]
  volume?: string
  ownedBy?: string
  dedupKeys?: string[]
  tableFormat?: "parquet" | "native"
}

export interface TableParam extends AstNode {
  type: "tableParam"
  name: string
  value?: Expression
}

export interface CastDefinition extends AstNode {
  type: "castDefinition"
  column: QualifiedName
  dataType: string
}

export interface IndexDefinition extends AstNode {
  type: "indexDefinition"
  column: QualifiedName
  capacity?: number
  indexType?: "posting" | "posting_delta" | "posting_ef" | "bitmap" | "none"
  include?: string[]
}

export interface CreateUserStatement extends AstNode {
  type: "createUser"
  user: QualifiedName
  ifNotExists?: boolean
  password?: string
  noPassword?: boolean
}

export interface CreateGroupStatement extends AstNode {
  type: "createGroup"
  group: QualifiedName
  ifNotExists?: boolean
  externalAlias?: string
}

export interface CreateServiceAccountStatement extends AstNode {
  type: "createServiceAccount"
  account: QualifiedName
  ifNotExists?: boolean
  password?: string
  noPassword?: boolean
  ownedBy?: string
}

// EXPIRE ROWS row-retention clause (materialized views).
export interface ExpireRowsClause {
  mode: "when" | "keepLatest" | "keepExtremum"
  // when: EXPIRE ROWS WHEN <predicate>
  predicate?: Expression
  // keepLatest: KEEP LATEST [ON <ts>] PARTITION BY <cols>
  on?: string
  // keepExtremum: KEEP [<N>] HIGHEST|LOWEST <col> [PARTITION BY <cols>]
  keepCount?: number
  extremum?: "highest" | "lowest"
  column?: string
  // partition columns (required for keepLatest, optional for keepExtremum)
  partitionBy?: string[]
  // optional trailing CLEANUP EVERY <duration>
  cleanupEvery?: string
}

export interface CreateMaterializedViewStatement extends AstNode {
  type: "createMaterializedView"
  view: QualifiedName
  ifNotExists?: boolean
  baseTable?: QualifiedName
  refresh?: MaterializedViewRefresh
  period?: MaterializedViewPeriod
  query: SelectStatement
  asParens?: boolean
  indexes?: IndexDefinition[]
  timestamp?: QualifiedName
  partitionBy?: "YEAR" | "MONTH" | "WEEK" | "DAY" | "HOUR"
  ttl?: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
  storagePolicy?: StoragePolicy
  volume?: string
  ownedBy?: string
  expireRows?: ExpireRowsClause
}

// LIVE VIEWS (#6939)
export interface CreateLiveViewStatement extends AstNode {
  type: "createLiveView"
  view: QualifiedName
  ifNotExists?: boolean
  flushEvery: string
  inMemory?: string
  partitionBy?: "NONE" | "HOUR" | "DAY" | "WEEK" | "MONTH" | "YEAR"
  startFrom?: {
    kind: "now" | "beginning" | "timestamp"
    value?: string
  }
  query: SelectStatement
}

export interface DropLiveViewStatement extends AstNode {
  type: "dropLiveView"
  view: QualifiedName
  ifExists?: boolean
}

export interface AlterLiveViewStatement extends AstNode {
  type: "alterLiveView"
  view: QualifiedName
  action: "resumeWal" | "suspendWal"
  // RESUME WAL [FROM TXN|TRANSACTION n]
  fromTxn?: number
  fromTransaction?: number
  // SUSPEND WAL [WITH code, 'message']
  code?: number | string
  message?: string
}

// OVER(...) / named WINDOW ANCHOR clause (live views):
//   ANCHOR EXPRESSION <expr>  |  ANCHOR DAILY '<HH:MM>' ['<tz>']
export interface AnchorClause {
  kind: "expression" | "daily"
  expr?: Expression
  time?: string
  timezone?: string
}

export interface StoragePolicy extends AstNode {
  type: "storagePolicy"
  toParquet?: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
  toRemote?: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
  dropLocal?: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
  dropRemote?: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
}

export interface MaterializedViewRefresh extends AstNode {
  type: "materializedViewRefresh"
  mode?: "immediate" | "manual"
  every?: string
  deferred?: boolean
  start?: string
  timeZone?: string
}

export interface MaterializedViewPeriod extends AstNode {
  type: "materializedViewPeriod"
  length?: string
  delay?: string
  timeZone?: string
  sampleByInterval?: boolean
}

export interface ParquetConfig extends AstNode {
  type: "parquetConfig"
  /** Encoding: PLAIN, RLE_DICTIONARY, DELTA_BINARY_PACKED, DELTA_LENGTH_BYTE_ARRAY, DEFAULT */
  encoding?: string
  /** Compression codec: UNCOMPRESSED, SNAPPY, GZIP, BROTLI, ZSTD, LZ4_RAW */
  compression?: string
  /** Compression level, e.g. 3 for ZSTD(3) */
  compressionLevel?: number
  /** Whether BLOOM_FILTER is enabled */
  bloomFilter?: boolean
}

export interface ColumnDefinition extends AstNode {
  type: "columnDefinition"
  name: string
  dataType: string
  /** SYMBOL CAPACITY value */
  symbolCapacity?: number
  /** SYMBOL CACHE/NOCACHE */
  cache?: boolean
  /** Whether column is indexed */
  indexed?: boolean
  /** INDEX CAPACITY value */
  indexCapacity?: number
  /** Index type (#6861 posting index) */
  indexType?: "posting" | "posting_delta" | "posting_ef" | "bitmap" | "none"
  /** POSTING index INCLUDE columns */
  indexInclude?: string[]
  /** PARQUET encoding/compression/bloom filter config */
  parquetConfig?: ParquetConfig
}

export interface AlterTableStatement extends AstNode {
  type: "alterTable"
  table: QualifiedName
  action: AlterTableAction
}

export interface AlterMaterializedViewStatement extends AstNode {
  type: "alterMaterializedView"
  view: QualifiedName
  action: AlterMaterializedViewAction
}

export type AlterMaterializedViewAction =
  | AlterMaterializedViewAddIndex
  | AlterMaterializedViewDropIndex
  | AlterMaterializedViewSymbolCapacity
  | AlterMaterializedViewSetTtl
  | AlterMaterializedViewSetRefreshLimit
  | AlterMaterializedViewSetRefresh
  | AlterMaterializedViewResumeWal
  | AlterMaterializedViewSuspendWal
  | AlterMaterializedViewRebaseWal
  | AlterMaterializedViewSetExpireRows
  | AlterMaterializedViewDropExpire
  | AlterMaterializedViewSetStoragePolicy
  | AlterMaterializedViewDropStoragePolicy
  | AlterMaterializedViewEnableStoragePolicy
  | AlterMaterializedViewDisableStoragePolicy

export interface AlterMaterializedViewAddIndex {
  actionType: "addIndex"
  column: string
  capacity?: number
}

export interface AlterMaterializedViewSymbolCapacity {
  actionType: "symbolCapacity"
  column: string
  capacity: number
}

export interface AlterMaterializedViewSetTtl {
  actionType: "setTtl"
  ttl: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
}

export interface AlterMaterializedViewSetRefreshLimit {
  actionType: "setRefreshLimit"
  limit: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
}

export interface AlterMaterializedViewSetRefresh {
  actionType: "setRefresh"
  refresh?: MaterializedViewRefresh
  period?: MaterializedViewPeriod
}

export interface AlterMaterializedViewDropIndex {
  actionType: "dropIndex"
  column: string
}

export interface AlterMaterializedViewResumeWal {
  actionType: "resumeWal"
  fromTxn?: number
}

export interface AlterMaterializedViewSuspendWal {
  actionType: "suspendWal"
}

export interface AlterMaterializedViewRebaseWal {
  actionType: "rebaseWal"
  targetDir?: string
}

export interface AlterMaterializedViewSetExpireRows {
  actionType: "setExpireRows"
  expireRows: ExpireRowsClause
}

export interface AlterMaterializedViewDropExpire {
  actionType: "dropExpire"
}

export interface AlterMaterializedViewSetStoragePolicy {
  actionType: "setStoragePolicy"
  policy: StoragePolicy
}

export interface AlterMaterializedViewDropStoragePolicy {
  actionType: "dropStoragePolicy"
}

export interface AlterMaterializedViewEnableStoragePolicy {
  actionType: "enableStoragePolicy"
}

export interface AlterMaterializedViewDisableStoragePolicy {
  actionType: "disableStoragePolicy"
}

export interface AlterUserStatement extends AstNode {
  type: "alterUser"
  user: QualifiedName
  action: AlterUserAction
}

export type AlterUserAction =
  | AlterUserEnableAction
  | AlterUserDisableAction
  | AlterUserPasswordAction
  | AlterUserCreateTokenAction
  | AlterUserDropTokenAction

export interface AlterUserEnableAction {
  actionType: "enable"
}

export interface AlterUserDisableAction {
  actionType: "disable"
}

export interface AlterUserPasswordAction {
  actionType: "password"
  noPassword?: boolean
  password?: string
}

export interface AlterUserCreateTokenAction {
  actionType: "createToken"
  tokenType: "JWK" | "REST"
  ttl?: string
  refresh?: boolean
  transient?: boolean
  publicKeyX?: string
  publicKeyY?: string
}

export interface AlterUserDropTokenAction {
  actionType: "dropToken"
  tokenType: "JWK" | "REST"
  token?: string
}

export interface AlterServiceAccountStatement extends AstNode {
  type: "alterServiceAccount"
  account: QualifiedName
  action: AlterUserAction
}

export type AlterTableAction =
  | AddColumnAction
  | DropColumnAction
  | RenameColumnAction
  | AlterColumnAction
  | DropPartitionAction
  | AttachPartitionAction
  | DetachPartitionAction
  | SquashPartitionsAction
  | SetParamAction
  | SetTtlAction
  | SetTableFormatAction
  | DedupDisableAction
  | DedupEnableAction
  | SetTypeWalAction
  | SuspendWalAction
  | ResumeWalAction
  | RebaseWalAction
  | ConvertPartitionAction
  | SetStoragePolicyAction
  | DropStoragePolicyAction
  | EnableStoragePolicyAction
  | DisableStoragePolicyAction

export interface AddColumnAction {
  actionType: "addColumn"
  ifNotExists?: boolean
  columns: ColumnDefinition[]
}

export interface DropColumnAction {
  actionType: "dropColumn"
  columns: string[]
}

export interface RenameColumnAction {
  actionType: "renameColumn"
  oldName: string
  newName: string
}

export interface AlterColumnAction {
  actionType: "alterColumn"
  column: string
  alterType:
    | "type"
    | "addIndex"
    | "dropIndex"
    | "cache"
    | "nocache"
    | "symbolCapacity"
    | "setParquet"
  newType?: string
  capacity?: number
  // ADD INDEX options (#6861 posting index)
  indexType?: "posting" | "posting_delta" | "posting_ef" | "bitmap" | "none"
  indexInclude?: string[]
  cache?: boolean
  /** PARQUET config for SET PARQUET(...) */
  parquetConfig?: ParquetConfig
}

export interface DropPartitionAction {
  actionType: "dropPartition"
  partitions?: string[]
  where?: Expression
}

export interface AttachPartitionAction {
  actionType: "attachPartition"
  partitions: string[]
}

export interface DetachPartitionAction {
  actionType: "detachPartition"
  partitions?: string[]
  where?: Expression
}

export interface SquashPartitionsAction {
  actionType: "squashPartitions"
}

export interface SetParamAction {
  actionType: "setParam"
  params: TableParam[]
}

export interface SetTtlAction {
  actionType: "setTtl"
  ttl: {
    value: number
    unit: "HOURS" | "DAYS" | "WEEKS" | "MONTHS" | "YEARS"
  }
}

export interface SetTableFormatAction {
  actionType: "setTableFormat"
  format: "parquet" | "native"
}

export interface SetStoragePolicyAction {
  actionType: "setStoragePolicy"
  policy: StoragePolicy
}

export interface DropStoragePolicyAction {
  actionType: "dropStoragePolicy"
}

export interface EnableStoragePolicyAction {
  actionType: "enableStoragePolicy"
}

export interface DisableStoragePolicyAction {
  actionType: "disableStoragePolicy"
}

export interface DedupDisableAction {
  actionType: "dedupDisable"
}

export interface DedupEnableAction {
  actionType: "dedupEnable"
  keys: string[]
}

export interface SetTypeWalAction {
  actionType: "setTypeWal"
  bypass?: boolean
}

export interface SuspendWalAction {
  actionType: "suspendWal"
  code?: number | string
  message?: string
}

export interface ResumeWalAction {
  actionType: "resumeWal"
  fromTxn?: number
  fromTransaction?: number
}

export interface RebaseWalAction {
  actionType: "rebaseWal"
  targetDir?: string
}

export interface ConvertPartitionAction {
  actionType: "convertPartition"
  partitions?: string[]
  target: string
  where?: Expression
}

export interface DropTableStatement extends AstNode {
  type: "dropTable"
  table?: QualifiedName
  ifExists?: boolean
  allTables?: boolean
}

export interface DropMaterializedViewStatement extends AstNode {
  type: "dropMaterializedView"
  view: QualifiedName
  ifExists?: boolean
}

export interface CreateViewStatement extends AstNode {
  type: "createView"
  view: QualifiedName
  orReplace?: boolean
  ifNotExists?: boolean
  query: SelectStatement
  asParens?: boolean
  ownedBy?: string
}

export interface AlterViewStatement extends AstNode {
  type: "alterView"
  view: QualifiedName
  query: SelectStatement
}

export interface DropViewStatement extends AstNode {
  type: "dropView"
  view: QualifiedName
  ifExists?: boolean
}

export interface DropUserStatement extends AstNode {
  type: "dropUser"
  user: QualifiedName
  ifExists?: boolean
}

export interface DropGroupStatement extends AstNode {
  type: "dropGroup"
  group: QualifiedName
  ifExists?: boolean
}

export interface DropServiceAccountStatement extends AstNode {
  type: "dropServiceAccount"
  account: QualifiedName
  ifExists?: boolean
}

export interface TruncateTableStatement extends AstNode {
  type: "truncateTable"
  tables: QualifiedName[]
  ifExists?: boolean
  only?: boolean
  keepSymbolMaps?: boolean
}

export interface RenameTableStatement extends AstNode {
  type: "renameTable"
  from: QualifiedName
  to: QualifiedName
}

export interface AddUserStatement extends AstNode {
  type: "addUser"
  user: QualifiedName
  groups: QualifiedName[]
}

export interface RemoveUserStatement extends AstNode {
  type: "removeUser"
  user: QualifiedName
  groups: QualifiedName[]
}

export interface AssumeServiceAccountStatement extends AstNode {
  type: "assumeServiceAccount"
  account: QualifiedName
}

export interface ExitServiceAccountStatement extends AstNode {
  type: "exitServiceAccount"
  account?: QualifiedName
}

export interface CancelQueryStatement extends AstNode {
  type: "cancelQuery"
  queryId: string
}

export interface ShowStatement extends AstNode {
  type: "show"
  showType:
    | "tables"
    | "columns"
    | "partitions"
    | "createTable"
    | "createView"
    | "createMaterializedView"
    | "createLiveView"
    | "createDatabase"
    | "user"
    | "users"
    | "groups"
    | "serviceAccount"
    | "serviceAccounts"
    | "permissions"
    | "serverVersion"
    | "parameters"
    | "transactionIsolationLevel"
    | "maxIdentifierLength"
    | "standardConformingStrings"
    | "searchPath"
    | "dateStyle"
    | "timeZone"
    | "serverVersionNum"
    | "defaultTransactionReadOnly"
  table?: QualifiedName
  name?: QualifiedName
  // SHOW CREATE DATABASE optional (INCLUDE|EXCLUDE) (ALL | (categories))
  databaseInclude?: {
    mode: "include" | "exclude"
    all?: boolean
    categories?: string[]
  }
}

export interface ExplainStatement extends AstNode {
  type: "explain"
  statement: Statement
  format?: string
}

export type CopyStatement =
  | CopyCancelStatement
  | CopyFromStatement
  | CopyToStatement
  | CopyPermissionsStatement

export interface CopyCancelStatement extends AstNode {
  type: "copyCancel"
  id: string
}

// Enterprise: COPY PERMISSIONS FROM <src> TO <dst>
export interface CopyPermissionsStatement extends AstNode {
  type: "copyPermissions"
  from: QualifiedName
  to: QualifiedName
}

export interface CopyFromStatement extends AstNode {
  type: "copyFrom"
  table: QualifiedName
  file: string
  options?: CopyOption[]
}

export interface CopyToStatement extends AstNode {
  type: "copyTo"
  source: QualifiedName | SelectStatement
  destination: string
  options?: CopyOption[]
}

export interface CopyOption extends AstNode {
  type: "copyOption"
  key: string
  value?: string | number | boolean | string[]
  /** When true, the string value originated from a string literal and should be quoted in toSql. */
  quoted?: boolean
}

export interface CheckpointStatement extends AstNode {
  type: "checkpoint"
  action: "create" | "release"
}

export interface SnapshotStatement extends AstNode {
  type: "snapshot"
  action: "prepare" | "complete"
}

export interface GrantStatement extends AstNode {
  type: "grant"
  permissions: string[]
  on?: GrantOnTarget
  to: QualifiedName
  grantOption?: boolean
  verification?: boolean
}

export interface RevokeStatement extends AstNode {
  type: "revoke"
  permissions: string[]
  on?: GrantOnTarget
  from: QualifiedName
}

export interface GrantOnTarget extends AstNode {
  type: "grantOn"
  allTables?: boolean
  tables?: GrantTableTarget[]
}

export interface GrantTableTarget extends AstNode {
  type: "grantTableTarget"
  table: QualifiedName
  columns?: string[]
  // Column wildcard: tab(*) sets allColumns; tab(* EXCLUDE(c1, c2)) also sets
  // excludeColumns. Mutually exclusive with `columns`.
  allColumns?: boolean
  excludeColumns?: string[]
}

export interface GrantAssumeServiceAccountStatement extends AstNode {
  type: "grantAssumeServiceAccount"
  account: QualifiedName
  to: QualifiedName
  grantOption?: boolean
}

export interface RevokeAssumeServiceAccountStatement extends AstNode {
  type: "revokeAssumeServiceAccount"
  account: QualifiedName
  from: QualifiedName
}

export interface VacuumTableStatement extends AstNode {
  type: "vacuumTable"
  table: QualifiedName
}

export interface ResumeWalStatement extends AstNode {
  type: "resumeWal"
  fromTransaction?: number
  fromTxn?: number
}

export interface SetTypeStatement extends AstNode {
  type: "setType"
  bypass?: boolean
  wal: boolean
}

export interface ReindexTableStatement extends AstNode {
  type: "reindexTable"
  table: QualifiedName
  columns?: string[]
  partitions?: string[]
  lockExclusive?: boolean
}

export interface RefreshMaterializedViewStatement extends AstNode {
  type: "refreshMaterializedView"
  view: QualifiedName
  mode?: "full" | "incremental" | "range" | "stats"
  from?: string
  to?: string
}

export interface BackupStatement extends AstNode {
  type: "backup"
  action: "database" | "table" | "abort"
  table?: QualifiedName
}

// Enterprise: SWITCH ROLE TO {PRIMARY|REPLICA} [TIMEOUT <ms>] | SWITCH STATUS
export interface SwitchStatement extends AstNode {
  type: "switch"
  action: "role" | "status"
  role?: "PRIMARY" | "REPLICA"
  timeout?: number
}

export interface AlterGroupStatement extends AstNode {
  type: "alterGroup"
  group: QualifiedName
  action: "setAlias" | "dropAlias"
  externalAlias: string
}

export interface CompileViewStatement extends AstNode {
  type: "compileView"
  view: QualifiedName
}

export interface PivotStatement extends AstNode {
  type: "pivot"
  source: QualifiedName | SelectStatement
  where?: Expression
  aggregations: PivotAggregation[]
  pivots: PivotForClause[]
  groupBy?: Expression[]
  orderBy?: OrderByItem[]
  limit?: LimitClause
  alias?: string
}

export interface PivotClause extends AstNode {
  type: "pivotClause"
  aggregations: PivotAggregation[]
  pivots: PivotForClause[]
  groupBy?: Expression[]
}

export interface PivotAggregation extends AstNode {
  type: "pivotAggregation"
  expression: Expression
  alias?: string
}

export interface PivotForClause extends AstNode {
  type: "pivotFor"
  expression: Expression
  in: PivotInSource
}

export interface PivotInValue extends AstNode {
  type: "pivotInValue"
  expression: Expression
  alias?: string
}

export interface PivotInSource extends AstNode {
  type: "pivotIn"
  values?: PivotInValue[]
  select?: SelectStatement
}

// =============================================================================
// Clauses
// =============================================================================

export type SelectItem =
  | StarSelectItem
  | QualifiedStarSelectItem
  | ExpressionSelectItem

export interface ExpressionSelectItem extends AstNode {
  type: "selectItem"
  expression: Expression
  alias?: string
}

export interface StarSelectItem extends AstNode {
  type: "star"
}

export interface QualifiedStarSelectItem extends AstNode {
  type: "qualifiedStar"
  qualifier: QualifiedName
  alias?: string
}

export interface TableFunctionCall extends AstNode {
  type: "tableFunctionCall"
  name: string
  args: Expression[]
}

export interface UnnestArg extends AstNode {
  type: "unnestArg"
  expression: Expression
  /** JSON UNNEST column definitions: COLUMNS(name TYPE, ...) */
  columns?: UnnestColumnDef[]
}

export interface UnnestColumnDef extends AstNode {
  type: "unnestColumnDef"
  name: string
  dataType: string
}

export interface UnnestSource extends AstNode {
  type: "unnest"
  args: UnnestArg[]
  withOrdinality?: boolean
}

export interface TableRef extends AstNode {
  type: "tableRef"
  table:
    | QualifiedName
    | SelectStatement
    | TableFunctionCall
    | ShowStatement
    | UnnestSource
  /** Whether this table ref was preceded by LATERAL in comma-separated FROM */
  lateral?: boolean
  alias?: string
  /** Column alias list for UNNEST sources, e.g. UNNEST(arr) u(val, ord) */
  columnAliases?: string[]
  joins?: JoinClause[]
  timestampDesignation?: string
}

export interface JoinClause extends AstNode {
  type: "join"
  joinType?:
    | "inner"
    | "left"
    | "cross"
    | "asof"
    | "lt"
    | "splice"
    | "window"
    | "horizon"
  outer?: boolean
  /** Whether LATERAL was specified after JOIN keyword */
  lateral?: boolean
  table: TableRef
  on?: Expression
  /** Tolerance interval for ASOF and LT joins (e.g., "1h", "30s") */
  tolerance?: string
  /** RANGE BETWEEN bounds for WINDOW JOIN */
  range?: { start: WindowJoinBound; end: WindowJoinBound }
  /** INCLUDE/EXCLUDE PREVAILING clause for WINDOW JOIN */
  prevailing?: "include" | "exclude"
  /** RANGE FROM/TO/STEP for HORIZON JOIN */
  horizonRange?: { from: string; to: string; step: string }
  /** LIST offsets for HORIZON JOIN */
  horizonList?: string[]
  /** Alias for the horizon pseudo-table */
  horizonAlias?: string
}

export interface WindowJoinBound extends AstNode {
  type: "windowJoinBound"
  boundType: "currentRow" | "duration"
  direction?: "preceding" | "following"
  duration?: string
  // Dynamic bound (#6859): a column/cast/function expression, with an optional
  // time unit (e.g. `wndBound SECONDS PRECEDING`).
  boundExpr?: Expression
  unit?: string
}

export interface SampleByClause extends AstNode {
  type: "sampleBy"
  duration: string
  fill?: string[]
  alignTo?: AlignToClause
  from?: Expression
  to?: Expression
}

export interface AlignToClause extends AstNode {
  type: "alignTo"
  mode: "firstObservation" | "calendar"
  timeZone?: string
  offset?: string
}

export interface LatestOnClause extends AstNode {
  type: "latestOn"
  timestamp?: QualifiedName
  partitionBy: QualifiedName[]
}

export interface OrderByItem extends AstNode {
  type: "orderByItem"
  expression: Expression
  direction?: "asc" | "desc"
}

export interface LimitClause extends AstNode {
  type: "limit"
  lowerBound: Expression
  upperBound?: Expression
}

export interface SetClause extends AstNode {
  type: "setClause"
  column: string
  value: Expression
}

// =============================================================================
// Expressions
// =============================================================================

export type Expression =
  | BinaryExpression
  | UnaryExpression
  | ColumnRef
  | VariableRef
  | Literal
  | FunctionCall
  | CaseExpression
  | CastExpression
  | TypeCastExpression
  | InExpression
  | BetweenExpression
  | WithinExpression
  | IsNullExpression
  | ParenExpression
  | ArrayLiteral
  | ArrayAccessExpression
  | SubqueryExpression

export interface BinaryExpression extends AstNode {
  type: "binary"
  operator: string
  left: Expression
  right: Expression
}

export interface UnaryExpression extends AstNode {
  type: "unary"
  operator: string
  operand: Expression
}

export interface ColumnRef extends AstNode {
  type: "column"
  name: QualifiedName
}

export interface QualifiedName extends AstNode {
  type: "qualifiedName"
  parts: string[]
}

export interface Literal extends AstNode {
  type: "literal"
  value: string | number | boolean | null
  literalType: "string" | "number" | "boolean" | "null" | "geohash" | "duration"
  raw?: string
}

export interface FunctionCall extends AstNode {
  type: "function"
  name: string
  args: Expression[]
  distinct?: boolean
  star?: boolean
  /** When true, args are separated by FROM instead of comma (e.g., EXTRACT(YEAR FROM ts)) */
  fromSeparator?: boolean
  /** IGNORE NULLS modifier (e.g., first_value(x) IGNORE NULLS) */
  ignoreNulls?: boolean
  /** RESPECT NULLS modifier (e.g., first_value(x) RESPECT NULLS) */
  respectNulls?: boolean
  /** Subquery as function argument (e.g., touch(SELECT * FROM t)) */
  subquery?: SelectStatement
  over?: WindowSpecification
}

export interface WindowSpecification extends AstNode {
  type: "windowSpec"
  /**
   * Named window reference (e.g. `avg(x) OVER w`). When set, the other
   * fields are not used — the function references a named window defined
   * in the SELECT's `namedWindows` list.
   */
  windowName?: string
  partitionBy?: Expression[]
  orderBy?: OrderByItem[]
  frame?: WindowFrame
  anchor?: AnchorClause
}

export interface WindowFrame extends AstNode {
  type: "windowFrame"
  mode: "rows" | "range" | "cumulative"
  start?: WindowFrameBound
  end?: WindowFrameBound
  exclude?: "currentRow" | "noOthers"
}

export interface WindowFrameBound extends AstNode {
  type: "windowFrameBound"
  kind:
    | "unboundedPreceding"
    | "unboundedFollowing"
    | "currentRow"
    | "preceding"
    | "following"
  value?: Expression
  /** Duration string for time-unit based bounds (e.g., "5 seconds") */
  duration?: string
}

export interface CaseExpression extends AstNode {
  type: "case"
  /** Operand expression for simple CASE: CASE expr WHEN ... */
  operand?: Expression
  whenClauses: { when: Expression; then: Expression }[]
  elseClause?: Expression
}

export interface CastExpression extends AstNode {
  type: "cast"
  expression: Expression
  dataType: string
}

export interface TypeCastExpression extends AstNode {
  type: "typeCast"
  expression: Expression
  dataType: string
}

export interface InExpression extends AstNode {
  type: "in"
  expression: Expression
  values: Expression[]
  not?: boolean
  parenthesized?: boolean
}

export interface BetweenExpression extends AstNode {
  type: "between"
  expression: Expression
  low: Expression
  high: Expression
  not?: boolean
}

export interface WithinExpression extends AstNode {
  type: "within"
  expression: Expression
  values: Expression[]
}

export interface IsNullExpression extends AstNode {
  type: "isNull"
  expression: Expression
  not?: boolean
}

export interface VariableRef extends AstNode {
  type: "variable"
  name: string
}

export interface ParenExpression extends AstNode {
  type: "paren"
  expression: Expression
  /** Additional expressions for row/tuple constructors like (col1, col2) */
  additionalExpressions?: Expression[]
}

export interface ArrayLiteral extends AstNode {
  type: "arrayLiteral"
  elements: (Expression | ArrayLiteral)[]
  hasArrayKeyword?: boolean
}

export interface ArrayAccessExpression extends AstNode {
  type: "arrayAccess"
  array: Expression
  subscripts: (Expression | ArraySlice)[]
}

export interface ArraySlice extends AstNode {
  type: "arraySlice"
  start?: Expression
  end?: Expression
}

export interface SubqueryExpression extends AstNode {
  type: "subquery"
  query: SelectStatement
}
