// Pure technical-analysis calculations — no chart library dependencies.
// All functions return arrays the same length as the input, with `null`
// for positions where there is not enough data.

export interface OHLCV {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

// ── Moving Averages ──────────────────────────────────────────────────────────

export function calcSMA(data: number[], period: number): (number | null)[] {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j];
    return sum / period;
  });
}

export function calcEMA(data: number[], period: number): (number | null)[] {
  const k = 2 / (period + 1);
  const result: (number | null)[] = new Array(data.length).fill(null);
  let ema: number | null = null;

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue;
    if (ema === null) {
      // seed with SMA of first `period` values
      let sum = 0;
      for (let j = 0; j < period; j++) sum += data[j];
      ema = sum / period;
    } else {
      ema = data[i] * k + ema * (1 - k);
    }
    result[i] = ema;
  }
  return result;
}

// ── Bollinger Bands ──────────────────────────────────────────────────────────

export function calcBollingerBands(
  data: number[],
  period = 20,
  mult = 2,
): { upper: (number | null)[]; middle: (number | null)[]; lower: (number | null)[] } {
  const middle = calcSMA(data, period);
  const upper: (number | null)[] = [];
  const lower: (number | null)[] = [];

  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { upper.push(null); lower.push(null); continue; }
    const mean = middle[i] as number;
    let variance = 0;
    for (let j = i - period + 1; j <= i; j++) {
      variance += (data[j] - mean) ** 2;
    }
    const std = Math.sqrt(variance / period);
    upper.push(mean + mult * std);
    lower.push(mean - mult * std);
  }
  return { upper, middle, lower };
}

// ── RSI ──────────────────────────────────────────────────────────────────────

export function calcRSI(closes: number[], period = 14): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);
  if (closes.length < period + 1) return result;

  let avgGain = 0;
  let avgLoss = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) avgGain += d; else avgLoss += -d;
  }
  avgGain /= period;
  avgLoss /= period;

  if (avgLoss === 0) result[period] = 100;
  else result[period] = 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    const gain = d >= 0 ? d : 0;
    const loss = d < 0 ? -d : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

// ── MACD ─────────────────────────────────────────────────────────────────────

export function calcMACD(
  closes: number[],
  fast = 12,
  slow = 26,
  signal = 9,
): {
  macd: (number | null)[];
  signal: (number | null)[];
  histogram: (number | null)[];
} {
  const emaFast = calcEMA(closes, fast);
  const emaSlow = calcEMA(closes, slow);

  const macdLine: (number | null)[] = closes.map((_, i) =>
    emaFast[i] !== null && emaSlow[i] !== null
      ? (emaFast[i] as number) - (emaSlow[i] as number)
      : null,
  );

  // EMA of macd values — use 0 as placeholder so EMA runs, then null-mask start
  const macdForEma = macdLine.map((v) => v ?? 0);
  const rawSignal = calcEMA(macdForEma, signal);

  // Mask signal where we don't have macd yet (first slow-1 indices)
  const firstMacd = macdLine.findIndex((v) => v !== null);
  const signalLine: (number | null)[] = rawSignal.map((v, i) =>
    i < firstMacd + signal - 1 ? null : v,
  );

  const histogram: (number | null)[] = macdLine.map((m, i) =>
    m !== null && signalLine[i] !== null ? m - (signalLine[i] as number) : null,
  );

  return { macd: macdLine, signal: signalLine, histogram };
}

// ── Stochastic Oscillator ────────────────────────────────────────────────────

export function calcStochastic(
  highs: number[],
  lows: number[],
  closes: number[],
  kPeriod = 14,
  dPeriod = 3,
): { k: (number | null)[]; d: (number | null)[] } {
  const k: (number | null)[] = closes.map((c, i) => {
    if (i < kPeriod - 1) return null;
    let hh = -Infinity;
    let ll = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (highs[j] > hh) hh = highs[j];
      if (lows[j] < ll) ll = lows[j];
    }
    return hh === ll ? 50 : ((c - ll) / (hh - ll)) * 100;
  });

  // %D = SMA(kPeriod=dPeriod) of %K — only computed where %K is defined
  const d: (number | null)[] = k.map((_, i) => {
    if (i < kPeriod - 1 + dPeriod - 1) return null;
    const slice = k.slice(i - dPeriod + 1, i + 1);
    if (slice.some((v) => v === null)) return null;
    return (slice as number[]).reduce((a, b) => a + b, 0) / dPeriod;
  });

  return { k, d };
}

// ── VWAP ─────────────────────────────────────────────────────────────────────

export function calcVWAP(bars: OHLCV[]): number[] {
  let cumPV = 0;
  let cumV = 0;
  return bars.map((b) => {
    const tp = (b.high + b.low + b.close) / 3;
    cumPV += tp * b.volume;
    cumV += b.volume;
    return cumV > 0 ? cumPV / cumV : b.close;
  });
}

// ── Normalize to % change (for compare mode) ─────────────────────────────────

export function normalizeToPercent(values: number[]): number[] {
  const base = values[0];
  if (!base) return values.map(() => 0);
  return values.map((v) => ((v - base) / base) * 100);
}
