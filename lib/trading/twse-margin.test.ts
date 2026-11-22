import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHistory, parseMargin, rocToKey, MARGIN_ETFS } from "./twse-margin";

// Shapes captured from the TWSE dashboard APIs on 2026-11-22 (data date 2026-11-20).
const marginTrend = [
  { date: "20261119", marginShr: 8947619, marginAmt: 484368330, shortShr: 209819, marketValue: 1259214.74 },
  { date: "20261120", marginShr: 8398744, marginAmt: 435227267, shortShr: 199791, marketValue: 1180992.45 },
];
const creditTrend = [
  { date: "20261119", crdAmt: 104130551610, keepRate: 156.18, belowAccNum: 2947, callAccNum: 2956, callAmt: 2964159000, exeAccNum: 520, exeAmt: 918355880, marginAccNum: 77417, marginAccRate: 0.29 },
  { date: "20261120", crdAmt: 119171613660, keepRate: 151.78, belowAccNum: 6462, callAccNum: 6186, callAmt: 6463856762, exeAccNum: 632, exeAmt: 1495357574, marginAccNum: 82967, marginAccRate: 0.31 },
];
const fmtqik = [
  ["115/11/19", "15,301,049,840", "942,988,976,493", "6,310,092", "38,426.89", "-1,768.02"],
  ["115/11/20", "17,086,212,904", "935,310,420,150", "8,039,739", "36,033.29", "-2,393.60"],
];

test("rocToKey converts ROC dates", () => {
  assert.equal(rocToKey("115/11/20"), "20261120");
  assert.equal(rocToKey("bad"), null);
});

test("buildHistory merges the three feeds by date", () => {
  const h = buildHistory(marginTrend, creditTrend, fmtqik);
  assert.equal(h.length, 2);
  const d = h[1];
  assert.equal(d.date, "2026-11-20");
  assert.equal((d.marginAmount! / 100000).toFixed(2), "4352.27"); // matches dashboard 4,352.27 億
  assert.equal((d.marginAmountChange! / 100000).toFixed(2), "-491.41"); // matches dashboard ▼491.41
  assert.equal(d.keepRate, 151.78);
  assert.equal(d.callAccounts, 6462); // dashboard 追繳戶數
  assert.equal((d.callAmount! / 1e8).toFixed(2), "64.64"); // dashboard 追繳金額
  assert.equal(d.indexClose, 36033.29);
  assert.equal(d.indexPct!.toFixed(2), "-6.23");
  assert.equal(h[0].marginAmountChange, undefined); // oldest row has no prior day
});

test("parseMargin picks up the tracked ETFs", () => {
  const j = {
    stat: "OK",
    tables: [
      {
        title: "信用交易統計",
        data: [
          ["融資(交易單位)", "1", "1", "1", "8,947,619", "8,398,744"],
          ["融券(交易單位)", "1", "1", "1", "209,819", "199,791"],
          ["融資金額(仟元)", "1", "1", "1", "484,368,330", "435,227,267"],
        ],
      },
      {
        title: "融資融券彙總 (全部)",
        data: [
          ["0050", "元大台灣50", "14,537", "76,045", "164", "121,075", "59,403", "6,545,125", "205", "189", "0", "431", "415", "6,545,125", "322", " "],
          ["00631L", "元大台灣50正2", "89,504", "72,715", "2,527", "395,379", "409,641", "2,713,212", "1,862", "5,942", "0", "17,833", "21,913", "2,713,212", "4,058", " "],
          ["00685L", "群益臺灣加權正2", "61,503", "85,999", "6,352", "378,489", "347,641", "2,850,709", "1,129", "2,572", "0", "8,597", "10,040", "2,850,709", "3,735", " "],
          ["2330", "台積電", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", "1", " "],
        ],
      },
    ],
  };
  const s = parseMargin(j, "20261120", new Map(MARGIN_ETFS))!;
  assert.deepEqual(s.stocks.map((x) => x.code), ["0050", "00631L", "00685L"]);
  assert.equal(s.stocks[1].marginToday, 409641);
  assert.equal(s.stocks[1].marginChange, 409641 - 395379);
  assert.equal(s.stocks[2].shortChange, 10040 - 8597);
  assert.equal((s.marginAmountChange / 100000).toFixed(2), "-491.41");
});
