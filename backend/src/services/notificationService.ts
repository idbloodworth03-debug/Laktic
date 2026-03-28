import webpush from 'web-push';
import { supabase } from '../db/supabase';
import { env } from '../config/env';

// ── VAPID setup ───────────────────────────────────────────────────────────────
// Generate keys once with: npx web-push generate-vapid-keys
// Then set VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT in .env

let vapidConfigured = false;

if (env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT) {
  webpush.setVapidDetails(
    env.VAPID_SUBJECT,
    env.VAPID_PUBLIC_KEY,
    env.VAPID_PRIVATE_KEY
  );
  vapidConfigured = true;
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

// ── Core send function ────────────────────────────────────────────────────────

async function sendToUser(userId: string, payload: PushPayload): Promise<void> {
  if (!vapidConfigured) return; // silently skip if VAPID not configured

  const { data: subscriptions } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', userId);

  if (!subscriptions || subscriptions.length === 0) return;

  const message = JSON.stringify(payload);
  const staleIds: string[] = [];

  await Promise.allSettled(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          message
        );
      } catch (err: any) {
        // 410 Gone or 404 = subscription expired, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          staleIds.push(sub.id);
        }
      }
    })
  );

  if (staleIds.length > 0) {
    await supabase.from('push_subscriptions').delete().in('id', staleIds);
  }
}

// ── High-level notification helpers ──────────────────────────────────────────

export async function notifyPlanReady(userId: string, botName: string) {
  await sendToUser(userId, {
    title: 'New Training Plan Ready',
    body: `${botName} has generated your updated training plan.`,
    url: '/athlete/plan',
    tag: 'plan-ready'
  });
}

export async function notifyAthleteAbsent(coachUserId: string, athleteName: string, eventTitle: string) {
  await sendToUser(coachUserId, {
    title: 'Athlete Absence',
    body: `${athleteName} was marked absent from "${eventTitle}".`,
    url: '/coach/calendar',
    tag: `absent-${athleteName}`
  });
}

export async function notifyRaceCountdown(userId: string, raceName: string, daysUntil: number) {
  const body = daysUntil === 0
    ? `Race day! Good luck at ${raceName}.`
    : daysUntil === 1
    ? `${raceName} is tomorrow — get ready!`
    : `${daysUntil} days until ${raceName}.`;

  await sendToUser(userId, {
    title: daysUntil === 0 ? 'Race Day!' : 'Race Countdown',
    body,
    url: '/athlete/races',
    tag: `race-${raceName}`
  });
}

export async function notifyCoachReplied(userId: string, coachName: string) {
  await sendToUser(userId, {
    title: 'Your coach replied',
    body: `${coachName} replied to your message.`,
    url: '/athlete/chat',
    tag: 'coach-reply'
  });
}

export async function notifyWorkoutReminder(userId: string, workoutTitle: string) {
  await sendToUser(userId, {
    title: 'Workout Today',
    body: `Today's workout: ${workoutTitle}`,
    url: '/athlete/plan',
    tag: 'workout-reminder'
  });
}

// ── Race day countdown cron (called from index.ts scheduler) ─────────────────

export async function runRaceCountdownCron() {
  if (!vapidConfigured) return;

  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);

  // Get 1 and 3 day countdowns
  const notify1 = new Date(today); notify1.setDate(notify1.getDate() + 1);
  const notify3 = new Date(today); notify3.setDate(notify3.getDate() + 3);
  const notify7 = new Date(today); notify7.setDate(notify7.getDate() + 7);

  const targetDates = [
    { date: todayStr, days: 0 },
    { date: notify1.toISOString().slice(0, 10), days: 1 },
    { date: notify3.toISOString().slice(0, 10), days: 3 },
    { date: notify7.toISOString().slice(0, 10), days: 7 }
  ];

  for (const { date, days } of targetDates) {
    // Find all active seasons where a race is on this date
    const { data: seasons } = await supabase
      .from('athlete_seasons')
      .select('athlete_id, race_calendar, athlete_profiles!athlete_id(user_id)')
      .eq('status', 'active');

    for (const season of seasons || []) {
      const races: Array<{ name: string; date: string; is_goal_race?: boolean }> =
        season.race_calendar || [];

      const matchingRaces = races.filter(r => r.date === date);
      for (const race of matchingRaces) {
        const userId = (season as any).athlete_profiles?.user_id;
        if (userId) {
          await notifyRaceCountdown(userId, race.name, days);
        }
      }
    }
  }
}

export { vapidConfigured };
