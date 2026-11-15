<!-- test-inventory-action -->
### <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Huldoser/test-inventory/v0.10.4/docs/public/mark-small-dark.svg"><img src="https://raw.githubusercontent.com/Huldoser/test-inventory/v0.10.4/docs/public/mark-small-light.svg" alt="" width="20" height="20" align="top"></picture> Test changes

> [!WARNING]
> **14 tests need a look before this merges:** 7 won't run, 4 are turned off, 1 was removed, 1 was in a deleted file and 1 has no assertions left.

#### Won't run · 7 tests

<sub>No runner config collects these files, so CI never runs their tests. [Docs](https://huldoser.github.io/test-inventory/reference/diagnostics)</sub>

| File | Tests | Why |
| --- | --: | --- |
| [`tests/strategies/mean-reversion.spec.ts`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/strategies/mean-reversion.spec.ts) | 3 | New in this pull request |
| [`tests/pnl/fees.test.ts`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/pnl/fees.test.ts) | 4 | Collected before this pull request |

#### Turned off · 4 tests

<sub>Tests that ran before and now skip, grouped by what turns them off. [Docs](https://huldoser.github.io/test-inventory/reference/output#how-the-state-is-chosen)</sub>

**`skip`** when `process.env.MARKET === 'closed'`; Alerts only trigger while the market is open

| Test | Location |
| --- | --- |
| price alerts › notifies when the price crosses above the alert | [`tests/alerts.spec.ts:11`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/alerts.spec.ts#L11) |

**`fixme`** no reason given

| Test | Location |
| --- | --- |
| login › asks for a one-time code | [`tests/login.spec.ts:25`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/login.spec.ts#L25) |

**`skip`** always now; before, only when `!(process.env.BROKER_API_KEY)`

| Test | Location |
| --- | --- |
| broker sandbox (2 tests) | [`tests/broker/sandbox.test.ts:3`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/broker/sandbox.test.ts#L3) |

#### Removed · 1 test

<sub>Tests taken out of files that gained no others. [Docs](https://huldoser.github.io/test-inventory/guide/diff#matches-and-changes)</sub>

| Test | Was at |
| --- | --- |
| rsi › is 0 when prices only fall | [`tests/indicators/rsi.test.ts:16`](https://github.com/trading-desk/strategy-engine/blob/794d084a1b2c3d4e5f60718293a4b5c6d7e8f901/tests/indicators/rsi.test.ts#L16) |

#### Test files deleted · 1 file

<sub>Files this pull request deletes, with the tests they held. [Docs](https://huldoser.github.io/test-inventory/guide/diff#matches-and-changes)</sub>

| File | Tests |
| --- | --: |
| [`tests/orders/limit-order.test.ts`](https://github.com/trading-desk/strategy-engine/blob/794d084a1b2c3d4e5f60718293a4b5c6d7e8f901/tests/orders/limit-order.test.ts) | 1 |

#### No assertions left · 1 test

<sub>Tests that had `expect` calls and now have none. [Docs](https://huldoser.github.io/test-inventory/reference/output#what-the-body-does)</sub>

| Test | Location | Had |
| --- | --- | --- |
| portfolio › reports unrealised P&amp;L | [`tests/portfolio/pnl.test.ts:2`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/portfolio/pnl.test.ts#L2) | 1 `expect` call |

<details><summary><b>Rewritten or replaced in the same file</b> · 1 file</summary>

| File | Removed | Added |
| --- | --: | --: |
| [`tests/strategies/crossover.test.ts`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/strategies/crossover.test.ts) | 1 | 2 |

</details>

<details><summary><b>Renamed or moved</b> · 1 test</summary>

| Test | Location | Was |
| --- | --- | --- |
| latestSignal › holds when the data client returns no candles | [`tests/strategies/crossover.test.ts:60`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/strategies/crossover.test.ts#L60) | latestSignal › holds when there is no data at all |

</details>

<details><summary><b>Tests whose helpers or source changed</b> · 8 tests</summary>

| Changed file | Tests |
| --- | --: |
| [`src/pnl/fees.ts`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/src/pnl/fees.ts) | 7 |
| [`src/market-data/client.ts`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/src/market-data/client.ts) | 1 |

</details>

<details><summary><b>Fewer assertions</b> · 1 test</summary>

| Test | Location | `expect` calls |
| --- | --- | --- |
| fees › adds the SEC fee only to sales | [`tests/pnl/fees.test.ts:13`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/pnl/fees.test.ts#L13) | 2 → 1 |

</details>

<details><summary><b>Added</b> · 1 test</summary>

| Test | Location |
| --- | --- |
| orders › fills a market order at the last trade | [`tests/orders/market-order.test.ts:4`](https://github.com/trading-desk/strategy-engine/blob/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00/tests/orders/market-order.test.ts#L4) |

</details>

<sub>Read from source by [test-inventory](https://huldoser.github.io/test-inventory/) 0.10.4, with no tests run · Vitest 5.0.5, Playwright · 412 tests in 3.2 s · base [`794d084`](https://github.com/trading-desk/strategy-engine/commit/794d084a1b2c3d4e5f60718293a4b5c6d7e8f901) → head [`36c23aa`](https://github.com/trading-desk/strategy-engine/commit/36c23aa0f1e2d3c4b5a69788796a5b4c3d2e1f00)</sub>
