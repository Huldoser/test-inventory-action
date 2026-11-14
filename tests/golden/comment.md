<!-- test-inventory-action -->
### Test changes

**7 tests won't run** · 2 tests turned off · 1 test removed · 1 test file deleted · 1 test with no assertions left.

#### Won't run

- `tests/strategies/mean-reversion.spec.ts`, 3 tests: a new file no runner config collects
- `tests/pnl/fees.test.ts`, 4 tests: no runner config collects it any more

#### Turned off

**skip**, when `process.env.MARKET === 'closed'`, reason: Alerts only trigger while the market is open

- price alerts &gt; notifies when the price crosses above the alert `tests/alerts.spec.ts:11`

**fixme**, no reason given

- login &gt; asks for a one-time code `tests/login.spec.ts:25`

#### Removed

- rsi &gt; is 0 when prices only fall `tests/indicators/rsi.test.ts:16`

#### Test files deleted

- `tests/orders/limit-order.test.ts`, 1 test

#### No assertions left

- portfolio &gt; reports unrealised P&amp;L `tests/portfolio/pnl.test.ts:2`: had 1 `expect` call

<details><summary>Rewritten or replaced in the same file (1 file)</summary>

- `tests/strategies/crossover.test.ts`: 1 removed, 2 added

</details>

<details><summary>Renamed or moved (1)</summary>

- latestSignal &gt; holds when there is no data at all → latestSignal &gt; holds when the data client returns no candles `tests/strategies/crossover.test.ts:60`

</details>

<details><summary>Tests whose helpers or source changed (8)</summary>

- `src/pnl/fees.ts`, 7 tests
- `src/market-data/client.ts`: latestSignal &gt; asks for 120 days of candles `tests/strategies/crossover.test.ts:47`

</details>

<details><summary>Fewer assertions (1)</summary>

- fees &gt; adds the SEC fee only to sales `tests/pnl/fees.test.ts:13`: 2 → 1 `expect` calls

</details>

<details><summary>Added (1)</summary>

- orders &gt; fills a market order at the last trade `tests/orders/market-order.test.ts:4`

</details>

<sub>vitest 5.0.5, playwright · base 794d084 → head 36c23aa · 412 tests scanned in 3.2 s without running them · test-inventory 0.10.4</sub>
