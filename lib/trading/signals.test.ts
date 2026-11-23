import { test } from "node:test";
import assert from "node:assert/strict";
import { analyzeTicker } from "./signals";
import type { TickerRawData } from "./yahoo";

function raw(closes: number[]): TickerRawData {
  return {
    symbol: "TEST",
    currency: "USD",
    exchangeName: "X",
    regularMarketPrice: closes[closes.length - 1],
    fiftyTwoWeekHigh: Math.max(...closes),
    fiftyTwoWeekLow: Math.min(...closes),
    candles: closes.map((c, i) => ({ date: new Date(2025, 0, 1 + i), open: c, high: c, low: c, close: c, volume: 0 })),
  };
}
const def = { symbol: "TEST", displayName: "測試", group: "index" as const };

test("SMA20/50/100/200 levels are computed", () => {
  const closes = Array.from({ length: 300 }, (_, i) => i + 1);
  const a = analyzeTicker(def, raw(closes));
  assert.equal(a.sma20, (281 + 300) / 2);
  assert.equal(a.sma50, (251 + 300) / 2);
  assert.equal(a.sma100, (201 + 300) / 2);
  assert.equal(a.sma200, (101 + 300) / 2);
});

// Grow a rally / sell-off one session at a time: the cross signal must fire
// on the session where SMA20 actually crosses SMA50.
function firstSignal(base: number[], step: number, type: string) {
  const closes = [...base];
  for (let k = 0; k < 60; k++) {
    closes.push(closes[closes.length - 1] + step);
    const a = analyzeTicker(def, raw(closes));
    const s = a.signals.find((x) => x.type === type);
    if (s) return { s, a };
  }
  return null;
}

test("SMA20 crossing above SMA50 gives an upside signal on the cross day", () => {
  const hit = firstSignal(Array.from({ length: 260 }, (_, i) => 200 - i * 0.3), 2.2, "sma20-cross-up-50");
  assert.ok(hit);
  assert.equal(hit!.s.daysAgo, 0);
  assert.match(hit!.s.label, /上行/);
  assert.ok(hit!.a.sma20! > hit!.a.sma50!);
});

test("SMA20 crossing below SMA50 gives a downside signal on the cross day", () => {
  const hit = firstSignal(Array.from({ length: 260 }, (_, i) => 100 + i * 0.3), -2.2, "sma20-cross-down-50");
  assert.ok(hit);
  assert.equal(hit!.s.daysAgo, 0);
  assert.match(hit!.s.label, /下行/);
});
