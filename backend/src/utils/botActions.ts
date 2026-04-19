/**
 * botActions.ts — Real database mutations the coaching agent can execute.
 * Each function is surfaced as an OpenAI tool in the chat route.
 */

import { supabase } from '../db/supabase';
import { env } from '../config/env';

export interface ActionResult {
  ok: boolean;
  message: string;
}

// ── Helper: fetch active season ───────────────────────────────────────────────

async function getActiveSeason(athleteId: string) {
  const { data } = await supabase
    .from('athlete_seasons')
    .select('id, season_plan')
    .eq('athlete_id', athleteId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  return data ?? null;
}

// ── 1. updateWorkout ──────────────────────────────────────────────────────────

export async function updateWorkout(
  athleteId: string,
  date: string,
  changes: {
    description?: string;
    distance_miles?: number;
    pace_guideline?: string;
    change_reason?: string;
    is_rest_day?: boolean;
  }
): Promise<ActionResult> {
  const season = await getActiveSeason(athleteId);
  if (!season) return { ok: false, message: 'No active season found' };

  // Only these fields may be written by the agent — title is permanent and comes from the plan engine.
  const { description, distance_miles, pace_guideline, change_reason, is_rest_day } = changes;
  const safeChanges = { description, distance_miles, pace_guideline, change_reason, is_rest_day };

  const plan: any[] = JSON.parse(JSON.stringify(season.season_plan || []));
  let updated = false;

  outer: for (const week of plan) {
    for (let i = 0; i < (week.workouts || []).length; i++) {
      if (week.workouts[i].date === date) {
        week.workouts[i] = { ...week.workouts[i], ...safeChanges };
        updated = true;
        break outer;
      }
    }
  }

  if (!updated) return { ok: false, message: `No workout found for date ${date}` };

  const { error } = await supabase
    .from('athlete_seasons')
    .update({ season_plan: plan, updated_at: new Date().toISOString() })
    .eq('id', season.id);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Workout on ${date} updated` };
}

// ── 2. reduceWeekIntensity ────────────────────────────────────────────────────

export async function reduceWeekIntensity(
  athleteId: string,
  percentage: number
): Promise<ActionResult> {
  const season = await getActiveSeason(athleteId);
  if (!season) return { ok: false, message: 'No active season found' };

  const today = new Date().toISOString().slice(0, 10);
  const plan: any[] = JSON.parse(JSON.stringify(season.season_plan || []));
  const factor = 1 - Math.min(Math.max(percentage, 0), 80) / 100;
  let modified = false;

  for (const week of plan) {
    if (!week.week_start_date) continue;
    const weekEnd =
      week.week_end_date ||
      new Date(new Date(week.week_start_date + 'T00:00:00Z').getTime() + 6 * 86400000)
        .toISOString()
        .slice(0, 10);
    if (today < week.week_start_date || today > weekEnd) continue;

    for (const wo of week.workouts || []) {
      if (wo.date < today) continue; // don't modify past workouts
      if (wo.ai_adjustable === false) continue;
      if (wo.distance_miles) {
        wo.distance_miles = Math.round(wo.distance_miles * factor * 10) / 10;
        wo.change_reason = `Intensity reduced ${percentage}% by coaching bot`;
      }
    }
    modified = true;
    break;
  }

  if (!modified) return { ok: false, message: 'Current week not found in plan' };

  const { error } = await supabase
    .from('athlete_seasons')
    .update({ season_plan: plan, updated_at: new Date().toISOString() })
    .eq('id', season.id);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `Remaining workouts this week reduced by ${percentage}%` };
}

// ── 3. markRestDay ────────────────────────────────────────────────────────────

export async function markRestDay(athleteId: string, date: string): Promise<ActionResult> {
  const season = await getActiveSeason(athleteId);
  if (!season) return { ok: false, message: 'No active season found' };

  const plan: any[] = JSON.parse(JSON.stringify(season.season_plan || []));
  let updated = false;

  outer: for (const week of plan) {
    for (let i = 0; i < (week.workouts || []).length; i++) {
      if (week.workouts[i].date === date) {
        week.workouts[i] = {
          ...week.workouts[i],
          title: 'Rest Day',
          description: 'Complete rest. Recovery is training.',
          distance_miles: 0,
          pace_guideline: null,
          change_reason: 'Marked as rest day by coaching bot',
          is_rest_day: true,
        };
        updated = true;
        break outer;
      }
    }
  }

  if (!updated) return { ok: false, message: `No workout found for date ${date}` };

  const { error } = await supabase
    .from('athlete_seasons')
    .update({ season_plan: plan, updated_at: new Date().toISOString() })
    .eq('id', season.id);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: `${date} marked as rest day` };
}

// ── 4. addInjuryNote ──────────────────────────────────────────────────────────

export async function addInjuryNote(athleteId: string, note: string): Promise<ActionResult> {
  const { data: profile } = await supabase
    .from('athlete_profiles')
    .select('injury_notes')
    .eq('id', athleteId)
    .single();

  const existing = profile?.injury_notes || '';
  const timestamp = new Date().toISOString().slice(0, 10);
  const updated = existing
    ? `${existing}\n[${timestamp}] ${note}`
    : `[${timestamp}] ${note}`;

  const { error } = await supabase
    .from('athlete_profiles')
    .update({ injury_notes: updated })
    .eq('id', athleteId);

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Injury note recorded' };
}

// ── 6. saveMemory ─────────────────────────────────────────────────────────────

export async function saveMemory(
  athleteId: string,
  memoryText: string,
  sourceSessionId?: string | null
): Promise<ActionResult> {
  const { error } = await supabase.from('bot_memory').insert({
    athlete_id: athleteId,
    memory_text: memoryText,
    source_session_id: sourceSessionId ?? null,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Memory saved' };
}

// ── 7. summarizeSession ───────────────────────────────────────────────────────

export async function summarizeSession(
  athleteId: string,
  summaryText: string,
  messageCount: number
): Promise<ActionResult> {
  const { error } = await supabase.from('conversation_summaries').insert({
    athlete_id: athleteId,
    summary_text: summaryText,
    message_count: messageCount,
  });

  if (error) return { ok: false, message: error.message };
  return { ok: true, message: 'Session summary saved' };
}

// ── 5. flagCoach ──────────────────────────────────────────────────────────────

export async function flagCoach(athleteId: string, message: string): Promise<ActionResult> {
  // Resolve coach via team membership
  const { data: membership } = await supabase
    .from('team_members')
    .select('team_id, teams!team_id(coach_id, name)')
    .eq('athlete_id', athleteId)
    .is('left_at', null)
    .limit(1)
    .single();

  if (!membership) return { ok: false, message: 'Athlete is not on a team' };

  const team = (membership as any).teams;
  if (!team?.coach_id) return { ok: false, message: 'Team has no coach' };

  const [{ data: coachProfile }, { data: athleteProfile }] = await Promise.all([
    supabase.from('coach_profiles').select('name, user_id').eq('id', team.coach_id).single(),
    supabase.from('athlete_profiles').select('name').eq('id', athleteId).single(),
  ]);

  const athleteName = athleteProfile?.name || 'An athlete';
  const coachName = coachProfile?.name || 'Coach';

  // Get coach email via auth admin
  let coachEmail: string | null = null;
  if (coachProfile?.user_id) {
    try {
      const { data: authUser } = await supabase.auth.admin.getUserById(coachProfile.user_id);
      coachEmail = authUser?.user?.email ?? null;
    } catch {
      // non-blocking
    }
  }

  if (coachEmail && env.RESEND_API_KEY) {
    try {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Laktic <noreply@laktic.com>',
          to: [coachEmail],
          subject: `Athlete alert — ${athleteName}`,
          html: `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:8px;">
<div style="font-size:20px;font-weight:900;color:#22c55e;margin-bottom:24px;">LAKTIC</div>
<h2 style="margin:0 0 8px;">Alert from your coaching bot</h2>
<p style="color:#ccc;margin:0 0 16px;">Your athlete <strong>${athleteName}</strong> may need your attention.</p>
<div style="background:#1a2d1e;border:1px solid #2a4a2e;border-radius:8px;padding:16px;margin-bottom:24px;">
  <p style="margin:0;color:#eee;">${message}</p>
</div>
<p style="color:#888;font-size:13px;">This alert was generated by ${athleteName}'s coaching bot based on their message or training data.</p>
</div>`,
        }),
      });
    } catch {
      // non-blocking
    }
  }

  console.log(`[flagCoach] Alert for ${coachName} (${coachEmail}) re athlete ${athleteName}: ${message}`);
  return { ok: true, message: `${coachName} has been notified` };
}
