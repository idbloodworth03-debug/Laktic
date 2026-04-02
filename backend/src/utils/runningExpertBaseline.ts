export const RUNNING_EXPERT_BASELINE = `
EXPERT RUNNING KNOWLEDGE (always apply these principles):

PERIODIZATION:
- Training phases: Base (aerobic foundation, easy miles), Build (tempo + intervals introduced), Peak (race-specific workouts, highest intensity), Taper (volume drops 20-40%, intensity maintained, 2-3 weeks before goal race)
- Never skip the taper. Athletes who train hard the week before a race always underperform.
- Every 4th week should be a recovery week with 20-30% reduced volume

INTENSITY DISTRIBUTION:
- 80% of all weekly mileage must be at easy/conversational pace (athlete can hold a full conversation)
- 20% at moderate to hard effort
- Never schedule two hard workouts back to back
- Hard workout = intervals, tempo runs, race pace work, long runs over 14 miles

PROGRESSION RULES:
- Never increase weekly mileage more than 10% week over week
- Never increase long run distance more than 2 miles per week
- If an athlete misses more than 3 days, do not try to make up the lost mileage

PACE ZONES (calculate from athlete's recent race times or PRs):
- Easy: 90-120 seconds per mile slower than 5K race pace
- Tempo: 25-40 seconds per mile slower than 5K race pace
- Threshold: 15-25 seconds per mile slower than 5K race pace
- Interval: At or slightly faster than 5K race pace
- Sprint: Significantly faster than 5K race pace, short duration only

RECOVERY:
- After a race or time trial: 1 easy day per mile raced minimum
- After a hard workout: at least 1 full easy or rest day before next hard effort
- Signs of overtraining: persistent fatigue, elevated resting HR, declining performance, mood changes, frequent illness
- If athlete shows overtraining signs: mandatory 5-7 days easy only, then rebuild

INJURY MANAGEMENT:
- Shin splints: reduce mileage 50%, no speed work, check shoes
- IT band syndrome: reduce mileage, add hip strengthening, no downhill running
- Plantar fasciitis: no barefoot walking, morning stretching, reduce impact
- Ankle sprain grade 1-2: rest 3-7 days, gentle mobility, return gradually
- Any injury lasting more than 7 days: flag coach and recommend seeing a professional
- Never run through sharp or worsening pain

RACE PREPARATION:
- Taper begins 3 weeks before marathon, 2 weeks before half, 1 week before 5K/10K
- Race week: no new workouts, familiar routes, familiar food, sleep priority
- Day before race: 10-15 min easy shakeout jog, no hard efforts
- Race day warmup: 10 min easy jog, dynamic stretches, 4-6 strides

BEGINNER GUIDELINES (< 20 miles/week, < 1 year running):
- Maximum 4 days running per week
- Every run must feel easy
- No speed work until 6 months of consistent base building
- Long run never more than 30% of weekly total

ADVANCED GUIDELINES (> 50 miles/week, 3+ years running):
- Can handle 2 quality sessions per week
- Long run can be 25-35% of weekly total
- Double days acceptable if second run is always easy

=== COACH PARAM LIBRARY: 1500M/800M/MILE TRAINING SYSTEM ===

PHASE MODEL:
- ease_in: Readiness-driven reentry. Rebuild tolerance, avoid event-specific load. Duration driven by fitness readiness level.
- base: Primary development block. Build aerobic foundation, introduce controlled bridge work. Longest phase.
- pre_competition: Trim aerobic volume, add rhythm and event-specific support. Bridge workouts connect base to race demands.
- competition: Preserve aerobic support at lower total cost. Sharpen race feel. Total training cost must be LOWER than Pre-Competition.

PHASE ASSIGNMENT RULES:
- ease_in: athlete has no active season context, or just starting
- base: more than 12 weeks until next race
- pre_competition: 6-12 weeks until next race
- competition: fewer than 6 weeks until next race

EASE-IN DURATION BY FITNESS LEVEL:
- elite (fitness_90): 1 week — allow 1 aerobic session + 1 long run, no specific work
- competitive (fitness_80): 1 week — easy running only
- intermediate (fitness_70): 2 weeks — easy running only
- beginner (fitness_50): 4 weeks — easy running only

EASE-IN MILEAGE RAMP: week_1=85%, week_2=92%, week_3=97%, week_4=100%

PACE ENGINE RULES (CRITICAL):
- Aerobic systems (LT2, LT1, steady, easy, recovery) derive ONLY from 3000m+ performances (3000m, 5K, 8K, 10K, half marathon, marathon)
- NEVER use mile or 800m PR to set threshold, steady, easy, or recovery pace
- Event-specific systems (mile pace, 1500 rhythm, REP pace, 800 pace, goal pace workouts) derive from shorter PRs (1500m, mile, 800m)
- If athlete has both: 3000m+ controls all aerobic systems; shorter PR controls only event-specific work
- If no 3000m+ result exists: ask for one or estimate conservatively

PACE BANDS REFERENCE (example: 13:19 5K athlete):
- LT2: 4:42-4:55/mi | LT1: 5:02-5:12/mi | Steady: 5:30-5:50/mi | Easy: 6:45-7:15/mi | Recovery: 7:15-8:00/mi
- Always derive per-athlete from their actual PRs, not this example

VOLUME CAPS:
- Specific work weekly: base 3200-3600m | pre_competition 3800-4200m | competition 3200-3800m
- Rep per session: base 1000m | pre_competition 1200m | competition 1000m
- Rep per week: base 1600m | pre_competition 1800m | competition 1600m
- Pure speed per session: base 400m | pre_competition 300m | competition 250m
- Pure speed per week: base 800m | pre_competition 600m | competition 400m

INTENSITY DISTRIBUTION BY PHASE:
- base: aerobic_support 45-50% | specific_bridge 30-35% | rep_faster_support 10-15% | speed_dev 5-10%
- pre_competition: aerobic_support 35-40% | specific_bridge 35-40% | rep_rhythm 15-20% | speed_dev 5-10%
- competition: aerobic_support 25-30% | specific_goal_pace 40-45% | rep_sharpening 20-25% | speed_dev 5-10%

LONG RUN SHARE BY PHASE:
- ease_in: 12-17% of weekly mileage — easy only, never split, no fast finish
- base: 16-21% — easy only, never split
- pre_competition: 12-17% — easy only, never split
- competition: 10-15% — easy only, never split

WARM-UP / COOL-DOWN SCALING:
- under 30 mpw: 0.75 mi warm-up + 0.75 mi cool-down
- 30-40 mpw: 1.0 mi each
- 40-50 mpw: 1.25 mi each
- over 50 mpw: 1.5 mi each
- Round to nearest 0.25mi. Speed development days: easy volume first, then speed work.

WEEKLY STRUCTURE BACKBONE (training phases):
- Monday: aerobic | Tuesday: easy | Wednesday: easy + speed development | Thursday: specific | Friday: easy | Saturday: long run | Sunday: off
- For ease_in: all days are easy; no specific or aerobic quality work (except fitness_90 week 1)
- If specific workout unavailable for Thursday: fall back to aerobic
- If speed development unavailable for Wednesday: fall back to easy

20 WORKOUTS BY PHASE:

BASE — AEROBIC (Thursday slot, rotating):
1. tempo_run — Continuous run at halfway between LT1 and LT2. Pace from 3000m+ only. Volume 3.75-6.25mi by mpw band.
2. progressive_tempo_run — Start at LT1 effort, build to LT2 by end. Same volume as tempo_run.
3. threshold_1000s — 1000m reps at LT2 pace. 3-8 reps by mpw. 60-90s jog recovery.
4. threshold_1600s — 1600m reps at LT2 pace. 2-5 reps by mpw. 60-90s jog recovery.

BASE — SPECIFIC / BRIDGE (Thursday slot, rotating):
5. base_400s_5k_to_3k — 400m reps starting at 5K pace progressing toward 3K pace. 6-9 reps by mpw. Equal rest.
6. half_threshold_plus_cutdown — Half normal 1000m threshold volume, then 800-600-400-200-200 cutdown from 3K down to 800 pace.
7. half_tempo_plus_600s_at_3k — Half normal tempo volume, then 600m reps at 3K pace. 2-4 reps 600s.
8. sixty_second_hills — 60-second hill reps at strong aerobic effort. 4-8 reps. Sub 400s at 5K-3K pace if no hill.

PRE-COMPETITION — AEROBIC SUPPORT (Thursday slot, rotating):
9. tempo_plus_400s_3k — Tempo (80% base volume) then 400s at 3K pace. 4-7 reps 400s.
10. progressive_tempo_plus_150s — Progressive tempo (80% base volume) then 150s at mile-to-800 rhythm. 4-8 reps.
11. threshold_1000s_fast_first_plus_400s — 1000s where first 200m is 3K pace then settles to threshold. 90% of base volume. Add 4x400 at mile pace.
12. threshold_1600s_plus_alt_200s — 1600m threshold reps (90% base volume) then alternating 200s at mile and 800 pace. 4-6 reps 200s.

PRE-COMPETITION — SPECIFIC (Thursday slot, rotating):
13. mile_300s — 300m reps at mile pace. 8-12 reps by mpw. 50m walk + 50m jog rest.
14. quarter_threshold_plus_800s_plus_400s — 25% threshold volume, then 800s at 3200 pace, then 400s at mile pace.
15. sets_400_300_200 — Sets of 400-300-200. 400 at mile pace cutting to 800 on the 200. 2-4 sets.
16. sets_4x250_mile — Sets of 4x250m at mile pace. 2-5 sets. 60s between reps, 3min between sets.

COMPETITION — SPECIFIC SHARPENING (Thursday slot, rotating):
17. sets_800_600_plus_150s — Sets of (800m threshold + 600m at 3200 pace) then 150s at mile-800 rhythm. 2-3 sets.
18. goal_pace_tune_up — Race model: 1x1000m threshold, 2x150m mile pace, 1x800m at goal 1500 pace, 1-3x400 at goal pace, 1x300m cutdown.
19. mile_300s_plus_two_800pace — Pre-comp 300s minus 3 reps at mile pace, then 2x300m at 800 pace.
20. competition_sets_400_300_200 — Competition version of sets 400-300-200. Reduce total sets by one vs pre-competition band.

ROTATION RULES:
- No workout family repeats within a 2-week window
- base aerobic rotates: tempo_run → progressive_tempo_run → threshold_1000s → threshold_1600s
- base specific rotates: base_400s_5k_to_3k → half_threshold_plus_cutdown → half_tempo_plus_600s_at_3k → sixty_second_hills
- pre_competition aerobic rotates: tempo_plus_400s_3k → progressive_tempo_plus_150s → threshold_1000s_fast_first_plus_400s → threshold_1600s_plus_alt_200s
- pre_competition specific rotates: mile_300s → quarter_threshold_plus_800s_plus_400s → sets_400_300_200 → sets_4x250_mile
- competition rotates: sets_800_600_plus_150s → goal_pace_tune_up → mile_300s_plus_two_800pace → competition_sets_400_300_200

SPEED DEVELOPMENT (Wednesday easy + speed dev day):
- ease_in (fitness_90 only): 4-6x100m relaxed strides at 3K-1500 rhythm | 4x8-10sec hill sprints effort-based
- base: 4-6x100m strides at 3K-1500 pace | 4-6x10sec hill sprints | 4-6x100m form strides with cues
- pre_competition: 4-6x100m strides at 1500 rhythm | 4-6x120m relaxed fast | 4x150m at mile-800 rhythm | 4x10sec hills
- competition: 4x100m smooth fast | 3-4x120m smooth fast | 2-4x150m mile rhythm | 2-3x80m build strides

BASE ENTRY DAMPENING (first 2 weeks entering base from ease_in):
- Rep work 300m+: up to 10% slower than target, lighter volume in week 1. Return toward target week 2.
- LT2 aerobic work: use conservative end of LT2 band or ~5-10 sec/mi slower than LT2 target.

GUARDRAILS:
- Do not stack dense rhythm work on top of already dense weeks
- Competition phase total training cost must be lower than Pre-Competition
- Speed development stays low-cost and high-quality
- Long run is never split
- Workout families respect the 2-week non-repeat window
- Use stop rules if pace drifts more than ~2-3% or mechanics tighten noticeably
- Aerobic systems NEVER use mile or 800m PR as pace source
- If no 3000m+ result exists, ask the athlete or estimate conservatively
- Competition phase: aerobic support is preserved, just reduced in volume
- Ease-In duration is driven entirely by athlete readiness/fitness level, not a fixed number of weeks
`;

