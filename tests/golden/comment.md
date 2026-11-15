<!-- test-inventory-action -->
### <picture><source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Huldoser/test-inventory/v0.10.4/docs/public/mark-small-dark.svg"><img src="https://raw.githubusercontent.com/Huldoser/test-inventory/v0.10.4/docs/public/mark-small-light.svg" alt="" width="20" height="20" align="top"></picture> Test changes

| Won't run | Turned off | Removed | Test files deleted | No assertions left |
| :-: | :-: | :-: | :-: | :-: |
| **7** | **4** | **1** | **1** | **1** |

#### Won't run · [`file-not-run`](https://huldoser.github.io/test-inventory/reference/diagnostics)

| File | Tests | Why |
| --- | --: | --- |
| `tests/strategies/mean-reversion.spec.ts` | 3 | a new file no runner config collects |
| `tests/pnl/fees.test.ts` | 4 | no runner config collects it any more |

#### Turned off · [how the state is chosen](https://huldoser.github.io/test-inventory/reference/output#how-the-state-is-chosen)

| Test | Location | State | When or why |
| --- | --- | --- | --- |
| price alerts &gt; notifies when the price crosses above the alert | `tests/alerts.spec.ts:11` | `skip` | when `process.env.MARKET === 'closed'`; Alerts only trigger while the market is open |
| login &gt; asks for a one-time code | `tests/login.spec.ts:25` | `fixme` | no reason given |
| broker sandbox (2 tests) | `tests/broker/sandbox.test.ts:3` | `skip` | always now; before, only when `!(process.env.BROKER_API_KEY)` |

#### Removed · [how tests are matched](https://huldoser.github.io/test-inventory/guide/diff#matches-and-changes)

| Test | Location |
| --- | --- |
| rsi &gt; is 0 when prices only fall | `tests/indicators/rsi.test.ts:16` |

#### Test files deleted

| File | Tests |
| --- | --: |
| `tests/orders/limit-order.test.ts` | 1 |

#### No assertions left · [`expectCount`](https://huldoser.github.io/test-inventory/reference/output#what-the-body-does)

| Test | Location | Had |
| --- | --- | --- |
| portfolio &gt; reports unrealised P&amp;L | `tests/portfolio/pnl.test.ts:2` | 1 `expect` call |

<details><summary>Rewritten or replaced in the same file (1 file)</summary>

| File | Removed | Added |
| --- | --- | --- |
| `tests/strategies/crossover.test.ts` | 1 | 2 |

</details>

<details><summary>Renamed or moved (1)</summary>

| Test | Location | Was |
| --- | --- | --- |
| latestSignal &gt; holds when the data client returns no candles | `tests/strategies/crossover.test.ts:60` | latestSignal &gt; holds when there is no data at all |

</details>

<details><summary>Tests whose helpers or source changed (8)</summary>

| Changed file | Tests |
| --- | --: |
| `src/pnl/fees.ts` | 7 |
| `src/market-data/client.ts` | 1 |

</details>

<details><summary>Fewer assertions (1)</summary>

| Test | Location | `expect` calls |
| --- | --- | --- |
| fees &gt; adds the SEC fee only to sales | `tests/pnl/fees.test.ts:13` | 2 → 1 |

</details>

<details><summary>Added (1)</summary>

| Test | Location |
| --- | --- |
| orders &gt; fills a market order at the last trade | `tests/orders/market-order.test.ts:4` |

</details>

<sub>[test-inventory](https://huldoser.github.io/test-inventory/) 0.10.4 · vitest 5.0.5, playwright · 412 tests read in 3.2 s, none run · base 794d084 → head 36c23aa</sub>
