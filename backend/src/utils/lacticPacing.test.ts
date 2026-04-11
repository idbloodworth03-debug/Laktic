/**
 * lacticPacing.test.ts
 * Manual test cases for computeLacticPacing().
 * Run with: npx ts-node src/utils/lacticPacing.test.ts
 *
 * Each case prints PASS / FAIL with the expected vs actual value.
 */

import { computeLacticPacing } from './lacticPacing';

let passed = 0;
let failed = 0;

function expect(label: string, actual: unknown, expected: unknown) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    console.log(`  ✓  ${label}`);
    passed++;
  } else {
    console.log(`  ✗  ${label}`);
    console.log(`       expected: ${JSON.stringify(expected)}`);
    console.log(`       actual  : ${JSON.stringify(actual)}`);
    failed++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 1: Single 5K PR — 20:00 (1200 s)
//   T_anchor = 1200 s   P5 = 1200 / 3.10686 = 386.23 s/mi
//   LT2 lo = 386.23 × 1.044 = 403.2 → 6:43
//       hi = 386.23 × 1.092 = 421.7 → 7:02
//   LT1 lo = 386.23 × 1.118 = 431.8 → 7:12
//       hi = 386.23 × 1.155 = 446.1 → 7:26
//   Steady lo = 386.23 × 1.222 = 472.2 → 7:52
//          hi = 386.23 × 1.296 = 500.8 → 8:21
//   T_anchor = 1200 ≥ 1080 → row "18:00+" → Easy 7:20-8:45, Recovery 8:00-9:30
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 1 — 5K 20:00 (single input)');
{
  const z = computeLacticPacing({ pr_5k: '20:00' });
  expect('returns a result',    z !== null,         true);
  expect('LT2',                 z?.LT2,             '6:43-7:02/mi');
  expect('LT1',                 z?.LT1,             '7:12-7:26/mi');
  expect('steady',              z?.steady,          '7:52-8:21/mi');
  expect('easy (fixed band)',   z?.easy,            '7:20-8:45/mi');
  expect('recovery (fixed)',    z?.recovery,        '8:00-9:30/mi');
  expect('anchor_secs',         z?.anchor_secs,     1200);
  expect('source_pr',           z?.source_pr,       '5K PR (20:00)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 2: 5K 18:45 + 10K 38:30 — 10K should win (smaller equiv)
//   5K:  T = 1125 s   equiv = 1125 × 1.000 = 1125 s
//   10K: T = 2310 s   equiv = 2310 × 0.480 = 1108.8 s  ← fastest
//   T_anchor = 1108.8 s   anchor_secs = 1109
//   P5 = 1108.8 / 3.10686 = 356.97 s/mi
//   LT2 lo = 356.97 × 1.044 = 372.7 → 6:13
//       hi = 356.97 × 1.092 = 389.8 → 6:30
//   T_anchor = 1108.8 ≥ 1080 → Easy 7:20-8:45, Recovery 8:00-9:30
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 2 — 5K 18:45 + 10K 38:30 (10K wins)');
{
  const z = computeLacticPacing({ pr_5k: '18:45', pr_10k: '38:30' });
  expect('returns a result',    z !== null,         true);
  expect('LT2',                 z?.LT2,             '6:13-6:30/mi');
  expect('anchor_secs',         z?.anchor_secs,     1109);
  expect('source_pr',           z?.source_pr,       '10K PR (38:30)');
  expect('easy (fixed band)',   z?.easy,            '7:20-8:45/mi');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 3: T_anchor in 15:00–15:59 band (900–959 s)
//   5K PR = 15:30 → T = 930 s (equiv = 930 s since multiplier = 1.000)
//   T_anchor = 930 → 900 ≤ 930 < 960 → row "15:00–15:59"
//   Easy: 6:40-7:15, Recovery: 7:10-8:00
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 3 — 5K 15:30 (easy/recovery band: 15:00–15:59)');
{
  const z = computeLacticPacing({ pr_5k: '15:30' });
  expect('easy (fixed band)',   z?.easy,            '6:40-7:15/mi');
  expect('recovery (fixed)',    z?.recovery,        '7:10-8:00/mi');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 4: T_anchor exactly at boundary — 15:00 (900 s)
//   Spec note: "an anchor of exactly 15:00 falls in the 15:00–15:59 row"
//   (strictly less-than upper bound, so 900 < 960 → 15:00–15:59 row)
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 4 — 5K exactly 15:00 (boundary: should be 15:00–15:59 row)');
{
  const z = computeLacticPacing({ pr_5k: '15:00' });
  expect('easy (fixed band)',   z?.easy,            '6:40-7:15/mi');
  expect('recovery (fixed)',    z?.recovery,        '7:10-8:00/mi');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 5: 3000m PR only
//   3000m PR = 10:00 → T = 600 s   equiv = 600 × 1.719 = 1031.4 s
//   T_anchor = 1031.4 s   anchor_secs = 1031
//   1020 ≤ 1031.4 < 1080 → row "17:00–17:59"
//   Easy: 7:00-7:45, Recovery: 7:40-8:30
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 5 — 3000m 10:00 only');
{
  const z = computeLacticPacing({ pr_3000m: '10:00' });
  expect('returns a result',    z !== null,         true);
  expect('anchor_secs',         z?.anchor_secs,     1031);
  expect('source_pr',           z?.source_pr,       '3000m PR (10:00)');
  expect('easy (fixed band)',   z?.easy,            '7:00-7:45/mi');
  expect('recovery (fixed)',    z?.recovery,        '7:40-8:30/mi');
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 6: All null/missing inputs → null
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 6 — No inputs');
{
  const z = computeLacticPacing({});
  expect('returns null',  z, null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 7: Malformed PR string → null
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 7 — Malformed PR string');
{
  const z = computeLacticPacing({ pr_5k: 'not-a-time' });
  expect('returns null',  z, null);
}

// ─────────────────────────────────────────────────────────────────────────────
// Case 8: Sub-14-minute 5K — fastest band
//   5K PR = 13:00 → T = 780 s   T_anchor = 780 s
//   780 < 840 → row "< 14:00"
//   Easy: 6:30-7:05, Recovery: 7:00-7:45
// ─────────────────────────────────────────────────────────────────────────────
console.log('\nCase 8 — 5K 13:00 (sub-14-minute, fastest band)');
{
  const z = computeLacticPacing({ pr_5k: '13:00' });
  expect('easy (fixed band)',   z?.easy,            '6:30-7:05/mi');
  expect('recovery (fixed)',    z?.recovery,        '7:00-7:45/mi');
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
