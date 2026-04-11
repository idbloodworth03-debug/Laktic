/**
 * lacticPacing.ts — Lactic Pacing Calculator v2
 * Hybrid Aerobic Pace System for Middle-Distance Athletes.
 *
 * Pure functions only. No I/O, no side effects.
 * Spec: Lactic Pacing Metrics v2 — Implementation Spec for Middle-Distance Apps.
 *
 * Algorithm summary:
 *  1. Parse each PR string to seconds.
 *  2. Normalise to a 5K-equivalent time using Riegel exponent 1.06:
 *       T_5K_equiv = T_source × (5000 / D_source) ^ 1.06
 *     Pre-computed multipliers (from spec, rounded):
 *       3000 m → × 1.719   3200 m → × 1.605   5 K → × 1.000   10 K → × 0.480
 *  3. T_anchor = lowest (fastest) 5K-equivalent across all provided inputs.
 *  4. P5 = T_anchor / 3.10686  (seconds per mile at 5K-equivalent effort).
 *  5. LT2/LT1/Steady = P5 × zone multiplier [lo, hi] → formatted as "m:ss-m:ss/mi".
 *  6. Easy / Recovery = fixed band looked up by T_anchor range (spec table).
 */

// ── Constants ─────────────────────────────────────────────────────────────────

/** Miles in a 5K — spec constant used to derive per-mile pace from T_anchor. */
const MILES_IN_5K = 3.10686;

/**
 * Pre-computed Riegel multipliers for each supported input distance.
 * Formula: (5000 / D_source) ^ 1.06  — spec provides these as fixed rounded values.
 */
const RIEGEL: Record<string, number> = {
  '3000m': 1.719,
  '3200m': 1.605,
  '5K':    1.000,
  '10K':   0.480,
};

/** LT2 / LT1 / Steady zone multipliers [lo, hi] applied to P5 (s/mi). */
const ZONE_MULT = {
  LT2:    { lo: 1.044, hi: 1.092 },  // Lactate threshold
  LT1:    { lo: 1.118, hi: 1.155 },  // Aerobic threshold
  steady: { lo: 1.222, hi: 1.296 },  // Moderate aerobic
} as const;

/**
 * Fixed Easy / Recovery pace bands keyed by T_anchor.
 * Lookup: use the first row where T_anchor is STRICTLY LESS THAN upperBound.
 * The last row has upperBound = Infinity (catches T_anchor >= 1080 s).
 * Band values are strings in "m:ss-m:ss/mi" format (unit included for display).
 */
interface FixedBandRow {
  upperBound: number;
  easy:       string;
  recovery:   string;
}

const FIXED_BANDS: FixedBandRow[] = [
  { upperBound:  840, easy: '6:30-7:05/mi', recovery: '7:00-7:45/mi' }, // < 14:00
  { upperBound:  900, easy: '6:35-7:10/mi', recovery: '7:05-7:50/mi' }, // 14:00–14:59
  { upperBound:  960, easy: '6:40-7:15/mi', recovery: '7:10-8:00/mi' }, // 15:00–15:59
  { upperBound: 1020, easy: '6:50-7:30/mi', recovery: '7:20-8:15/mi' }, // 16:00–16:59
  { upperBound: 1080, easy: '7:00-7:45/mi', recovery: '7:40-8:30/mi' }, // 17:00–17:59
  { upperBound: Infinity, easy: '7:20-8:45/mi', recovery: '8:00-9:30/mi' }, // 18:00+
];

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LacticInput {
  pr_3000m?: string | null;
  pr_3200m?: string | null;
  pr_5k?:    string | null;
  pr_10k?:   string | null;
}

/** Computed zone output. All band strings are in "m:ss-m:ss/mi" format. */
export interface LacticZones {
  LT2:         string;  // Lactate threshold pace band
  LT1:         string;  // Aerobic threshold pace band
  steady:      string;  // Moderate aerobic pace band
  easy:        string;  // Fixed easy band (from lookup table)
  recovery:    string;  // Fixed recovery band (from lookup table)
  anchor_secs: number;  // T_anchor in seconds (for display / further math)
  source_pr:   string;  // e.g. "5K PR (20:00)" — which input drove T_anchor
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Parse "mm:ss" or "h:mm:ss" string to total seconds. Returns null on bad input. */
function parseMmSs(t: string | null | undefined): number | null {
  if (!t || typeof t !== 'string') return null;
  const parts = t.trim().split(':').map(s => parseInt(s, 10));
  if (parts.some(isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

/** Seconds → "m:ss" string (minutes floored, seconds rounded). */
function fmtSecs(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = Math.round(secs % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

/**
 * Format a lo–hi pace band in seconds/mile as "m:ss-m:ss/mi".
 * Both bounds are rounded to the nearest second before formatting.
 */
function fmtBand(loSecsMi: number, hiSecsMi: number): string {
  return `${fmtSecs(Math.round(loSecsMi))}-${fmtSecs(Math.round(hiSecsMi))}/mi`;
}

/**
 * Return fixed Easy / Recovery bands for the given T_anchor (seconds).
 * Spec: use the first row where T_anchor is STRICTLY LESS THAN the upper bound.
 */
function lookupFixedBands(tAnchor: number): { easy: string; recovery: string } {
  for (const row of FIXED_BANDS) {
    if (tAnchor < row.upperBound) {
      return { easy: row.easy, recovery: row.recovery };
    }
  }
  // Unreachable — last row has Infinity upper bound. Fallback for type safety.
  return { easy: '7:20-8:45/mi', recovery: '8:00-9:30/mi' };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Compute Lactic Pacing zones from athlete PR times.
 *
 * Returns null when no valid PR inputs are provided — callers should treat
 * this as "pacing data unavailable" and fall back to effort-based cues.
 *
 * Input validation:
 *  - Missing / null / empty PRs are skipped (not an error).
 *  - PRs that cannot be parsed as mm:ss or h:mm:ss are skipped.
 *  - Zero or negative parsed times are rejected (division / Infinity guard).
 */
export function computeLacticPacing(input: LacticInput): LacticZones | null {
  // ── Step 1 + 2: parse and normalise each PR to a 5K-equivalent time ──────
  interface Candidate {
    t5kEquiv: number;   // Riegel-normalised 5K equivalent (seconds)
    label:    string;   // Human-readable distance label, e.g. "5K PR"
    rawTime:  string;   // Original mm:ss string, e.g. "20:00"
  }
  const candidates: Candidate[] = [];

  const tryAdd = (
    rawTime:  string | null | undefined,
    distance: keyof typeof RIEGEL,
    label:    string,
  ) => {
    const secs = parseMmSs(rawTime);
    if (secs === null || secs <= 0) return;          // missing or invalid
    const t5kEquiv = secs * RIEGEL[distance];
    candidates.push({ t5kEquiv, label, rawTime: rawTime! });
  };

  tryAdd(input.pr_3000m, '3000m', '3000m PR');
  tryAdd(input.pr_3200m, '3200m', '3200m PR');
  tryAdd(input.pr_5k,    '5K',    '5K PR');
  tryAdd(input.pr_10k,   '10K',   '10K PR');

  if (candidates.length === 0) return null;

  // ── Step 3: T_anchor = fastest (lowest) 5K-equivalent ────────────────────
  candidates.sort((a, b) => a.t5kEquiv - b.t5kEquiv);
  const anchor    = candidates[0];
  const T_anchor  = anchor.t5kEquiv;    // seconds

  // ── Step 4: P5 = per-mile pace at 5K-equivalent effort ───────────────────
  const P5 = T_anchor / MILES_IN_5K;   // seconds per mile

  // ── Step 5: percentage-multiplier zones ──────────────────────────────────
  const LT2    = fmtBand(P5 * ZONE_MULT.LT2.lo,    P5 * ZONE_MULT.LT2.hi);
  const LT1    = fmtBand(P5 * ZONE_MULT.LT1.lo,    P5 * ZONE_MULT.LT1.hi);
  const steady = fmtBand(P5 * ZONE_MULT.steady.lo, P5 * ZONE_MULT.steady.hi);

  // ── Step 6: fixed bands from T_anchor lookup ──────────────────────────────
  const { easy, recovery } = lookupFixedBands(T_anchor);

  return {
    LT2,
    LT1,
    steady,
    easy,
    recovery,
    anchor_secs: Math.round(T_anchor),
    source_pr:   `${anchor.label} (${anchor.rawTime})`,
  };
}
