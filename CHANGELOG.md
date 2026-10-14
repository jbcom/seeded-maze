# Changelog

## [0.3.0](https://github.com/jbcom/seeded-maze/compare/v0.2.1...v0.3.0) (2026-10-14)


### Features

* compose authored modules over macro maze topology ([23b7296](https://github.com/jbcom/seeded-maze/commit/23b72960975b4c5449ad70e7881933be5043d426))
* compose authored modules over macro maze topology ([265406a](https://github.com/jbcom/seeded-maze/commit/265406a5fae90d715eccfa4052af9cc21e56889d))


### Bug Fixes

* bound composition allocation before tile validation ([e8589ea](https://github.com/jbcom/seeded-maze/commit/e8589ea10d0594a472f8cf2ae8a0302adf68eeb0))

## [0.2.1](https://github.com/jbcom/seeded-maze/compare/v0.2.0...v0.2.1) (2026-10-07)


### Bug Fixes

* support every maintained Node line (22, 24 and 26) ([699051d](https://github.com/jbcom/seeded-maze/commit/699051d56896592ad47c57131de36f8c912b2233))
* support every maintained Node line (22, 24 and 26) ([37075a8](https://github.com/jbcom/seeded-maze/commit/37075a8579c83dafbe3f4bed507380cacf01a707))

## 0.2.0 (2026-10-07)

First release on npmjs, under the name `seeded-maze`, as open source under the MIT licence.

### Features

* ship a CommonJS build alongside ESM, each with its own declarations
* publish to npmjs with provenance

### Chores

* move to TypeScript 7, Vitest 5, Node 24 as the floor and Node 26 as the build toolchain

## 0.1.1

### Bug Fixes

* write `.js` import specifiers in the ESM output so Node resolves every module

## 0.1.0

* seeded grid mazes with perimeter exits
* rail-node geometry and grid/world conversion
* multi-layer mazes with stair, drop and jump connectors, a solvability proof and dead-end analysis
* curved-wall outlines that can never open a wall or seal a passage
