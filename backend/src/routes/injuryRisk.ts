import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import OpenAI from 'openai';
import { env } from '../config/env';
import { Resend } from 'resend';

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Helpers ───────────────────────────────────────────────────────────────────

function getRiskLevel(score: number): 'low' | 'moderate' | 'high' | 'critical' {
  if (score <= 25) return 'low';
  if (score <= 50) return 'moderate';
  if (score <= 75) return 'high';
  return 'critical';
}

async function computeInjuryRiskForAthlete(athleteId: string): Promise<{
  score: number;
  risk_level: string;
  factors: Record<string, unknown>;
  explanation: string | null;
}> {
  const now = new Date();
  const day28Ago = new Date(now);
  day28Ago.setDate(day28Ago.getDate() - 28);

  // Fetch last 28 days of activities
  const { data: activities } = await supabase
    .from('athlete_activities')
    .select('start_date, distance_miles, elapsed_time_seconds')
    .eq('athlete_id', athleteId)
    .gte('start_date', day28Ago.toISOString())
    .order('start_date', { ascending: true });

  const acts = activities ?? [];

  // Build weekly buckets: week 0 = most recent 7 days, week 1 = 7-14 days ago, etc.
  const weekMiles: number[] = [0, 0, 0, 0];
  for (const act of acts) {
    const daysAgo = Math.floor((now.getTime() - new Date(act.start_date).getTime()) / 86400000);
    const weekIdx = Math.floor(daysAgo / 7);
    if (weekIdx < 4) weekMiles[weekIdx] += act.distance_miles ?? 0;
  }

  const acute = weekMiles[0];
  const chronic = weekMiles[1] > 0
    ? (weekMiles[0] + weekMiles[1] + weekMiles[2] + weekMiles[3]) / 4
    : 0;

  let score = 0;
  const factors: Record<string, unknown> = {};

  // ACWR
  const acwr = chronic > 0 ? Math.min(acute / chronic, 2.0) : (acute > 0 ? 1.0 : 0);
  factors.acwr = acwr;
  if (acwr > 1.5) {
    score += 35;
    factors.acwr_flag = true;
  }

  // Spike: this week vs last week
  if (weekMiles[1] > 0) {
    const spike = (weekMiles[0] - weekMiles[1]) / weekMiles[1];
    factors.weekly_spike_pct = Math.round(spike * 100);
    if (spike > 0.20) {
      score += 25;
      factors.spike_flag = true;
    }
  }

  // Consecutive hard days
  if (acts.length > 0) {
    const last14Days = acts.filter(a => {
      const daysAgo = Math.floor((now.getTime() - new Date(a.start_date).getTime()) / 86400000);
      return daysAgo <= 14;
    });
    const avgDist = last14Days.length > 0
      ? last14Days.reduce((s, a) => s + (a.distance_miles ?? 0), 0) / last14Days.length
      : 0;

    // Map to daily buckets (days 0-13)
    const dailyDist: Map<number, number> = new Map();
    for (const act of last14Days) {
      const daysAgo = Math.floor((now.getTime() - new Date(act.start_date).getTime()) / 86400000);
      dailyDist.set(daysAgo, (dailyDist.get(daysAgo) ?? 0) + (act.distance_miles ?? 0));
    }

    let consecutiveHard = 0;
    let maxConsecutiveHard = 0;
    for (let d = 0; d <= 13; d++) {
      const dist = dailyDist.get(d) ?? 0;
      const isHard = dist > avgDist * 1.3;
      const isEasy = dist === 0 || dist < avgDist * 0.7;
      if (isHard) {
        consecutiveHard++;
        maxConsecutiveHard = Math.max(maxConsecutiveHard, consecutiveHard);
      } else if (isEasy) {
        consecutiveHard = 0;
      }
    }
    factors.max_consecutive_hard_days = maxConsecutiveHard;
    if (maxConsecutiveHard >= 3) {
      score += 15;
      factors.consecutive_hard_flag = true;
    }
  }

  // Over-compliance (this week's activity count vs expected)
  const thisWeekCount = acts.filter(a => {
    const daysAgo = Math.floor((now.getTime() - new Date(a.start_date).getTime()) / 86400000);
    return daysAgo <= 7;
  }).length;
  factors.this_week_activity_count = thisWeekCount;
  // Expected ~6 activities per week if weekly_volume_miles > 0
  if (thisWeekCount > 6 * 1.15) {
    score += 5;
    factors.over_compliance_flag = true;
  }

  // Clamp
  score = Math.min(100, Math.max(0, score));
  const risk_level = getRiskLevel(score);

  // GPT explanation
  let explanation: string | null = null;
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a sports medicine AI. Given injury risk factors as JSON, write exactly 2 sentences in plain English explaining the athlete\'s injury risk. Be specific about which factors are most concerning. Do not use markdown.'
        },
        {
          role: 'user',
          content: JSON.stringify({ score, risk_level, factors })
        }
      ]
    });
    explanation = completion.choices[0].message.content?.trim() ?? null;
  } catch {
    // GPT failed — proceed without explanation
  }

  return { score, risk_level, factors, explanation };
}

async function notifyCoachOfHighRisk(
  athleteId: string,
  athleteName: string,
  score: number,
  riskLevel: string,
  explanation: string | null,
  riskRowId: string
) {
  if (!env.RESEND_API_KEY) {
    // eslint-disable-next-line no-console
    console.warn('[injuryRisk] RESEND_API_KEY not set, skipping coach email');
    return;
  }

  // Find the coach for this athlete's team
  const { data: teamMember } = await supabase
    .from('team_members')
    .select('team_id, teams!team_id(coach_id, coach_profiles!coach_id(user_id, name))')
    .eq('athlete_id', athleteId)
    .is('left_at', null)
    .limit(1)
    .single();

  if (!teamMember) return;

  const team = (teamMember as any).teams;
  const coachProfile = team?.coach_profiles;
  if (!coachProfile) return;

  const coachUserId = coachProfile.user_id;
  const coachName = coachProfile.name ?? 'Coach';

  // Get coach email
  const { data: { users } } = await supabase.auth.admin.listUsers();
  const coachUser = users.find((u: any) => u.id === coachUserId);
  if (!coachUser?.email) return;

  const resend = new Resend(env.RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: 'Laktic <noreply@laktic.app>',
      to: coachUser.email,
      subject: `Injury Risk Alert: ${athleteName} (${riskLevel})`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #eee; padding: 32px; border-radius: 8px;">
          <h2 style="color: #22c55e; margin-top: 0;">Injury Risk Alert</h2>
          <p>Hi ${coachName},</p>
          <p>
            Athlete <strong>${athleteName}</strong> has reached
            <strong style="color: ${riskLevel === 'critical' ? '#ef4444' : '#f97316'}">${riskLevel.toUpperCase()}</strong>
            injury risk with a score of <strong>${score}/100</strong>.
          </p>
          ${explanation ? `<p style="color: #ccc;">${explanation}</p>` : ''}
          <p>
            <a href="${env.FRONTEND_URL}/coach/athletes" style="display: inline-block; background: #22c55e; color: #000; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              View Full Breakdown
            </a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">Laktic AI Coaching Platform</p>
        </div>
      `
    });

    // Mark notified
    await supabase
      .from('injury_risk_scores')
      .update({ notified_coach: true })
      .eq('id', riskRowId);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[injuryRisk] Failed to send email:', err);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/injury-risk/compute — compute for all team athletes
router.post('/compute', auth, requireCoach, asyncHandler(async (req: AuthRequest, res) => {
  const coach = req.coach;

  const { data: teamData } = await supabase
    .from('teams')
    .select('id')
    .eq('coach_id', coach.id)
    .single();

  if (!teamData) return res.status(404).json({ error: 'No team found' });

  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id, athlete_profiles!athlete_id(id, name)')
    .eq('team_id', teamData.id)
    .is('left_at', null);

  const results = [];
  for (const member of members ?? []) {
    const athleteProfile = (member as any).athlete_profiles;
    if (!athleteProfile) continue;
    try {
      const computed = await computeInjuryRiskForAthlete(athleteProfile.id);
      const { data: inserted } = await supabase
        .from('injury_risk_scores')
        .insert({
          athlete_id: athleteProfile.id,
          score: computed.score,
          risk_level: computed.risk_level,
          factors: computed.factors,
          explanation: computed.explanation
        })
        .select()
        .single();

      if (inserted && (computed.risk_level === 'high' || computed.risk_level === 'critical')) {
        await notifyCoachOfHighRisk(
          athleteProfile.id,
          athleteProfile.name,
          computed.score,
          computed.risk_level,
          computed.explanation,
          inserted.id
        );
      }
      results.push({ athlete_id: athleteProfile.id, ...computed });
    } catch {
      results.push({ athlete_id: athleteProfile.id, error: 'Computation failed' });
    }
  }

  return res.json({ results });
}));

// POST /api/injury-risk/compute/:athleteId — compute for one athlete
router.post('/compute/:athleteId', auth, asyncHandler(async (req: AuthRequest, res) => {
  const { athleteId } = req.params;

  const { data: athleteProfile } = await supabase
    .from('athlete_profiles')
    .select('id, name')
    .eq('id', athleteId)
    .single();

  if (!athleteProfile) return res.status(404).json({ error: 'Athlete not found' });

  const computed = await computeInjuryRiskForAthlete(athleteId);

  const { data: inserted } = await supabase
    .from('injury_risk_scores')
    .insert({
      athlete_id: athleteId,
      score: computed.score,
      risk_level: computed.risk_level,
      factors: computed.factors,
      explanation: computed.explanation
    })
    .select()
    .single();

  if (inserted && (computed.risk_level === 'high' || computed.risk_level === 'critical')) {
    await notifyCoachOfHighRisk(
      athleteId,
      athleteProfile.name,
      computed.score,
      computed.risk_level,
      computed.explanation,
      inserted.id
    );
  }

  return res.json({ ...computed, id: inserted?.id });
}));

// GET /api/injury-risk/team — latest score per athlete
router.get('/team', auth, requireCoach, asyncHandler(async (req: AuthRequest, res) => {
  const coach = req.coach;

  const { data: teamData } = await supabase
    .from('teams')
    .select('id')
    .eq('coach_id', coach.id)
    .single();

  if (!teamData) return res.status(404).json({ error: 'No team found' });

  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id, athlete_profiles!athlete_id(id, name)')
    .eq('team_id', teamData.id)
    .is('left_at', null);

  const results = [];
  for (const member of members ?? []) {
    const athleteProfile = (member as any).athlete_profiles;
    if (!athleteProfile) continue;

    const { data: latestScore } = await supabase
      .from('injury_risk_scores')
      .select('score, risk_level, explanation, factors, computed_at')
      .eq('athlete_id', athleteProfile.id)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single();

    results.push({
      athlete_id: athleteProfile.id,
      athlete_name: athleteProfile.name,
      score: latestScore?.score ?? null,
      risk_level: latestScore?.risk_level ?? null,
      explanation: latestScore?.explanation ?? null,
      factors: latestScore?.factors ?? {},
      recommendation: null,
      computed_at: latestScore?.computed_at ?? null,
    });
  }

  return res.json(results);
}));

// GET /api/injury-risk/me — own latest score
router.get('/me', auth, requireAthlete, asyncHandler(async (req: AuthRequest, res) => {
  const athleteId = req.athlete.id;

  const { data: latestScore } = await supabase
    .from('injury_risk_scores')
    .select('*')
    .eq('athlete_id', athleteId)
    .order('computed_at', { ascending: false })
    .limit(1)
    .single();

  if (!latestScore) return res.json({ score: null, message: 'No risk assessment yet' });

  return res.json(latestScore);
}));

export default router;
