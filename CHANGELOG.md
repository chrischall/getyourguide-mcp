# Changelog

## [1.3.1](https://github.com/chrischall/getyourguide-mcp/compare/v1.3.0...v1.3.1) (2026-09-04)


### Documentation

* **skill:** the skill still told callers to pass `compact: true` ([#76](https://github.com/chrischall/getyourguide-mcp/issues/76)) ([4b28af9](https://github.com/chrischall/getyourguide-mcp/commit/4b28af9cc1aef47e4a687fc83fdab7e175977d4b))

## [1.3.0](https://github.com/chrischall/getyourguide-mcp/compare/v1.2.0...v1.3.0) (2026-09-04)


### Features

* **tools:** compact by default, on the projection this repo already had ([#71](https://github.com/chrischall/getyourguide-mcp/issues/71)) ([e791394](https://github.com/chrischall/getyourguide-mcp/commit/e791394f093e8ac2e4939be30c6f825d360d2e90))


### Bug Fixes

* **deps:** pick up @chrischall/mcp-utils 0.23.2 ([#75](https://github.com/chrischall/getyourguide-mcp/issues/75)) ([3920acc](https://github.com/chrischall/getyourguide-mcp/commit/3920acc52f9e017290d1bf2e12e0fe1793a8d3ae))

## [1.2.0](https://github.com/chrischall/getyourguide-mcp/compare/v1.1.4...v1.2.0) (2026-09-01)


### Features

* **health:** add gyg_healthcheck ([#60](https://github.com/chrischall/getyourguide-mcp/issues/60)) ([57cc38c](https://github.com/chrischall/getyourguide-mcp/commit/57cc38c273752532bc8ec7fd907b2698b40ecc95))


### Bug Fixes

* **health:** classify gyg errors on the hint, not just the message ([#63](https://github.com/chrischall/getyourguide-mcp/issues/63)) ([d7ae758](https://github.com/chrischall/getyourguide-mcp/commit/d7ae758e89a9a09fb3715d4e754e811fa6cd0a39))


### Documentation

* **health:** list gyg_healthcheck in manifest.json and the tool docs ([#65](https://github.com/chrischall/getyourguide-mcp/issues/65)) ([1cb08ba](https://github.com/chrischall/getyourguide-mcp/commit/1cb08ba91412ca466e04289bfe16bbecd9fdaa66))

## [1.1.4](https://github.com/chrischall/getyourguide-mcp/compare/v1.1.3...v1.1.4) (2026-08-27)


### Documentation

* npm test now typechecks before running vitest ([#49](https://github.com/chrischall/getyourguide-mcp/issues/49)) ([e6963ae](https://github.com/chrischall/getyourguide-mcp/commit/e6963ae6b322f4ef252b23d10741af305b451f36))
* **readme:** npm test now typechecks before running vitest ([#51](https://github.com/chrischall/getyourguide-mcp/issues/51)) ([c912715](https://github.com/chrischall/getyourguide-mcp/commit/c9127157d91c70bfeaaf545ddae86dcc32ab1f40))

## [1.1.3](https://github.com/chrischall/getyourguide-mcp/compare/v1.1.2...v1.1.3) (2026-07-26)


### Bug Fixes

* require the ci-gated status, not the ci / ci job name ([#27](https://github.com/chrischall/getyourguide-mcp/issues/27)) ([7d0310c](https://github.com/chrischall/getyourguide-mcp/commit/7d0310c08ff5ace1d028678ec60d4d0ca6ca185f))

## [1.1.2](https://github.com/chrischall/getyourguide-mcp/compare/v1.1.1...v1.1.2) (2026-07-07)


### Bug Fixes

* bump @chrischall/mcp-utils to 0.12.0 ([#19](https://github.com/chrischall/getyourguide-mcp/issues/19)) ([7392d26](https://github.com/chrischall/getyourguide-mcp/commit/7392d26a5418cc4c7db2bdb1716bd5d91ba1d457))


### Refactor

* adopt createApiClient (tokenHeader) + parseLenient ([#16](https://github.com/chrischall/getyourguide-mcp/issues/16)) ([7b3a83b](https://github.com/chrischall/getyourguide-mcp/commit/7b3a83b2dcdb0fe05ce6c11520a45daa72247550))


### Documentation

* document first-party dependency-bump label exception ([#20](https://github.com/chrischall/getyourguide-mcp/issues/20)) ([b3b6913](https://github.com/chrischall/getyourguide-mcp/commit/b3b6913981889d7c2c73810221fb15546c76aa7e))
* remove duplicate Changelog header ([#18](https://github.com/chrischall/getyourguide-mcp/issues/18)) ([35fd82b](https://github.com/chrischall/getyourguide-mcp/commit/35fd82bc9998f3b4b3d07eb20644f317d3190faa))

## [1.1.1](https://github.com/chrischall/getyourguide-mcp/compare/v1.1.0...v1.1.1) (2026-07-06)


### Bug Fixes

* add prepublishOnly build guard so npm publish can never ship without dist/ ([#12](https://github.com/chrischall/getyourguide-mcp/issues/12)) ([606f6d6](https://github.com/chrischall/getyourguide-mcp/commit/606f6d6d329cc4b93998c64968572822cbbc4931))

## [1.1.0](https://github.com/chrischall/getyourguide-mcp/compare/v1.0.0...v1.1.0) (2026-07-06)


### Features

* add gyg_get_tour_availability tool ([#10](https://github.com/chrischall/getyourguide-mcp/issues/10)) ([909a345](https://github.com/chrischall/getyourguide-mcp/commit/909a3459ef2188040ad6169c0e3696908e85681d))


### Bug Fixes

* correct Partner API params and routes against the live-verified surface ([#8](https://github.com/chrischall/getyourguide-mcp/issues/8)) ([612b536](https://github.com/chrischall/getyourguide-mcp/commit/612b536a7ce6148b264c3f14f35d6977384a2ee2))

## 1.0.0 (2026-07-05)


### Features

* GetYourGuide MCP server on the Partner API ([#3](https://github.com/chrischall/getyourguide-mcp/issues/3)) ([d4dc028](https://github.com/chrischall/getyourguide-mcp/commit/d4dc02847ee7295394da5e57922e1512779cfb63))
