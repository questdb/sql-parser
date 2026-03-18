# Changelog


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
