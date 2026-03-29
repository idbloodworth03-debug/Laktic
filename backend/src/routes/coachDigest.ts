import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireCoach, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import OpenAI from 'openai';
import { env } from '../config/env';
import { Resend } from 'resend';

const router = Router();
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// ── Core digest generation ────────────────────────────────────────────────────

export async function runWeeklyDigest(coachId: string): Promise<void> {
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);

  // Fetch coach profile
  const { data: coachProfile } = await supabase
    .from('coach_profiles')
    .select('id, name, user_id')
    .eq('id', coachId)
    .single();

  if (!coachProfile) return;

  // Fetch coach's team
  const { data: teamData } = await supabase
    .from('teams')
    .select('id, name')
    .eq('coach_id', coachId)
    .single();

  if (!teamData) return;

  // Fetch team members with athlete profiles
  const { data: members } = await supabase
    .from('team_members')
    .select('athlete_id, athlete_profiles!athlete_id(id, name, weekly_volume_miles)')
    .eq('team_id', teamData.id)
    .is('left_at', null);

  if (!members || members.length === 0) return;

  // Build per-athlete summary
  const athleteSummaries: Array<{
    name: string;
    weekly_miles: number;
    activity_count: number;
    injury_risk: string | null;
    readiness_avg: number | null;
    flagged_debrief: boolean;
    race_count: number;
  }> = [];

  for (const member of members) {
    const athlete = (member as any).athlete_profiles;
    if (!athlete) continue;

    // This week activities
    const { data: activities } = await supabase
      .from('athlete_activities')
      .select('distance_miles, start_date')
      .eq('athlete_id', athlete.id)
      .gte('start_date', weekAgo.toISOString());

    const weeklyMiles = (activities ?? []).reduce((s: number, a: any) => s + (a.distance_miles ?? 0), 0);
    const activityCount = (activities ?? []).length;

    // Latest injury risk
    const { data: riskScore } = await supabase
      .from('injury_risk_scores')
      .select('risk_level')
      .eq('athlete_id', athlete.id)
      .order('computed_at', { ascending: false })
      .limit(1)
      .single();

    // Avg readiness this week
    const { data: readiness } = await supabase
      .from('daily_readiness')
      .select('score')
      .eq('athlete_id', athlete.id)
      .gte('date', weekAgo.toISOString().slice(0, 10));

    const readinessScores = (readiness ?? []).map((r: any) => r.score);
    const avgReadiness = readinessScores.length > 0
      ? Math.round(readinessScores.reduce((s: number, n: number) => s + n, 0) / readinessScores.length)
      : null;

    // Flagged debriefs this week
    const { data: flaggedDebriefs } = await supabase
      .from('race_debriefs')
      .select('id')
      .eq('athlete_id', athlete.id)
      .eq('coach_flagged', true)
      .gte('created_at', weekAgo.toISOString())
      .limit(1);

    // Race count this week
    const { data: races } = await supabase
      .from('race_results')
      .select('id')
      .eq('athlete_id', athlete.id)
      .gte('race_date', weekAgo.toISOString().slice(0, 10));

    athleteSummaries.push({
      name: athlete.name,
      weekly_miles: Math.round(weeklyMiles * 10) / 10,
      activity_count: activityCount,
      injury_risk: riskScore?.risk_level ?? null,
      readiness_avg: avgReadiness,
      flagged_debrief: (flaggedDebriefs ?? []).length > 0,
      race_count: (races ?? []).length
    });
  }

  // Fetch coach's bot personality
  let botPersonalityPrompt = '';
  try {
    const { data: botData } = await supabase
      .from('coach_bots')
      .select('personality_prompt')
      .eq('coach_id', coachId)
      .single();
    botPersonalityPrompt = botData?.personality_prompt ?? '';
  } catch { /* non-blocking */ }

  // Generate digest with GPT-4o
  const digestText = await generateDigestText(coachProfile.name, teamData.name, athleteSummaries, botPersonalityPrompt);

  // Store digest
  const { data: digest } = await supabase
    .from('coach_digests')
    .insert({
      coach_id: coachId,
      team_id: teamData.id,
      digest_text: digestText,
      athlete_summaries: athleteSummaries
    })
    .select()
    .single();

  // Send email
  if (env.RESEND_API_KEY && digest) {
    await sendDigestEmail(coachProfile.user_id, coachProfile.name, teamData.name, digestText, digest.id);
  }
}

async function generateDigestText(
  coachName: string,
  teamName: string,
  athletes: Array<{ name: string; weekly_miles: number; activity_count: number; injury_risk: string | null; readiness_avg: number | null; flagged_debrief: boolean; race_count: number }>,
  personalityPrompt?: string
): Promise<string> {
  const personalityBlock = personalityPrompt
    ? `COACHING PERSONALITY: ${personalityPrompt}\n\nYour writing style must reflect the above personality. Never break character.\n\n`
    : '';
  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: `${personalityBlock}You are an AI coaching assistant writing a concise weekly digest email for a running coach.
Write in clear, professional prose. Be direct. Highlight standouts (positive and concerning).
Structure: 1) One-line summary of the week, 2) Athlete highlights (any risks/achievements), 3) Action items.
Keep it under 300 words. No markdown headers — use plain paragraphs.`
        },
        {
          role: 'user',
          content: JSON.stringify({
            coach_name: coachName,
            team_name: teamName,
            week_ending: new Date().toISOString().slice(0, 10),
            athletes
          })
        }
      ]
    });
    return completion.choices[0].message.content?.trim() ?? 'No digest generated.';
  } catch {
    return `Weekly digest for ${teamName}: ${athletes.length} athletes trained this week.`;
  }
}

async function sendDigestEmail(
  coachUserId: string,
  coachName: string,
  teamName: string,
  digestText: string,
  digestId: string
): Promise<void> {
  if (!env.RESEND_API_KEY) return;

  try {
    const { data: { users } } = await supabase.auth.admin.listUsers();
    const coachUser = (users as any[]).find((u: any) => u.id === coachUserId);
    if (!coachUser?.email) return;

    const resend = new Resend(env.RESEND_API_KEY);
    await resend.emails.send({
      from: 'Laktic <noreply@laktic.app>',
      to: coachUser.email,
      subject: `${teamName} — Weekly Coaching Digest`,
      html: `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; background: #111; color: #eee; padding: 32px; border-radius: 8px;">
          <h2 style="color: #22c55e; margin-top: 0;">Weekly Team Digest</h2>
          <p>Hi ${coachName},</p>
          <div style="white-space: pre-line; color: #ccc; line-height: 1.7;">${digestText}</div>
          <p style="margin-top: 24px;">
            <a href="${env.FRONTEND_URL}/coach/dashboard" style="display: inline-block; background: #22c55e; color: #000; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: bold;">
              View Full Dashboard
            </a>
          </p>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">Laktic AI Coaching Platform</p>
        </div>
      `
    });

    await supabase.from('coach_digests').update({ email_sent: true }).eq('id', digestId);
  } catch (err) {
    console.error('[coachDigest] Failed to send email:', err);
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// POST /api/digest/run — manually trigger digest for coach's team
router.post(
  '/run',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    await runWeeklyDigest(req.coach.id);
    return res.json({ ok: true });
  })
);

// GET /api/digest — list coach's digests
router.get(
  '/',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('coach_digests')
      .select('id, sent_at, digest_text, athlete_summaries, email_sent')
      .eq('coach_id', req.coach.id)
      .order('sent_at', { ascending: false })
      .limit(10);

    if (error) return res.status(400).json({ error: error.message });
    return res.json(data ?? []);
  })
);

// GET /api/digest/:id — single digest
router.get(
  '/:id',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    const { data, error } = await supabase
      .from('coach_digests')
      .select('*')
      .eq('id', req.params.id)
      .eq('coach_id', req.coach.id)
      .single();

    if (error || !data) return res.status(404).json({ error: 'Digest not found' });
    return res.json(data);
  })
);

// DELETE /api/digest/:id — dismiss
router.delete(
  '/:id',
  auth,
  requireCoach,
  asyncHandler(async (req: AuthRequest, res) => {
    await supabase
      .from('coach_digests')
      .delete()
      .eq('id', req.params.id)
      .eq('coach_id', req.coach.id);
    return res.json({ ok: true });
  })
);

export default router;
