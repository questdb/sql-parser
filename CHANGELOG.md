# Changelog


## 0.1.9 - 2026.04.21
### Added
- `bar` and `sparkline` functions [#22](https://github.com/questdb/sql-parser/pull/22)
- Storage policy keywords and `local`/`remote` constants [#20](https://github.com/questdb/sql-parser/pull/20)

### Changed
- Position-aware autocomplete: functions are categorized into scalar / aggregate / window / table-valued buckets, remove implicit select filter. [5a422b0](https://github.com/questdb/sql-parser/commit/5a422b0)


## 0.1.8 - 2026.04.13
### Added
- Add `timestamp_sequence_ns` function [#21](https://github.com/questdb/sql-parser/pull/21)
- `array_elem_min`, `array_elem_max`, `array_elem_sum`, `array_elem_avg`, `now_ns`, `systimestamp_ns`, `rnd_timestamp_ns` functions [#19](https://github.com/questdb/sql-parser/pull/19)


## 0.1.7 - 2026.04.13
### Added
- LATERAL JOIN support: `{INNER|LEFT|CROSS} JOIN LATERAL (subquery)` and standalone `FROM t, LATERAL (subquery)` [6e5e5e7](https://github.com/questdb/sql-parser/commit/6e5e5e7)
- UNNEST support including JSON UNNEST [6e5e5e7](https://github.com/questdb/sql-parser/commit/6e5e5e7)
- PARQUET column config in CREATE/ALTER table statements [6e5e5e7](https://github.com/questdb/sql-parser/commit/6e5e5e7)


## 0.1.6 - 2026.03.26
### Changed
- remove quoted identifier suppression [#17](https://github.com/questdb/sql-parser/pull/17)


## 0.1.5 - 2026.03.18
### Fixed
boost expression operators over clause keywords in WHERE context [#15](https://github.com/questdb/sql-parser/pull/15)


## 0.1.4 - 2026.03.17
### Added
- Compound JOIN suggestions: suggest "LEFT JOIN", "ASOF JOIN" etc. as single completions instead of bare keywords [#13](https://github.com/questdb/sql-parser/pull/13)
- CTE grammar: extract `selectBody` rule so DECLARE/WITH are not suggested after WITH clause [#13](https://github.com/questdb/sql-parser/pull/13)

### Fixed
- Table suggestion ranking: tables no longer interleave with columns in autocomplete [#13](https://github.com/questdb/sql-parser/pull/13)


## 0.1.3 - 2026.03.04
### Added
- horizon join support [#9](https://github.com/questdb/sql-parser/pull/9)


## 0.1.2 - 2026.02.25
### Fixed
- Prioritize tables with mentioned columns in the suggestions [#6](https://github.com/questdb/sql-parser/pull/6)


## 0.1.1 - 2026.02.23
### Fixed
- grammar-level table/column classification, join-specific suggestions [#2](https://github.com/questdb/sql-parser/pull/2)


## 0.1.0 - 2026.02.19
- Initial release
