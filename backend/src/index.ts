import * as Sentry from '@sentry/node';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';

if (env.SENTRY_DSN) {
  Sentry.init({ dsn: env.SENTRY_DSN, environment: process.env.NODE_ENV || 'development' });
}

import identityRouter from './routes/identity';
import coachRouter from './routes/coach';
import botsRouter from './routes/bots';
import athleteRouter from './routes/athlete';
import teamRouter from './routes/team';
import stravaRouter from './routes/strava';
import progressRouter from './routes/progress';
import gdprRouter from './routes/gdpr';
import calendarRouter from './routes/calendar';
import nutritionRouter from './routes/nutrition';
import notificationsRouter from './routes/notifications';
import marketplaceRouter from './routes/marketplace';
import feedRouter from './routes/feed';
import plansRouter from './routes/plans';
import communityRouter from './routes/community';
import aiCaptionRouter from './routes/aiCaption';
import milestonesRouter from './routes/milestones';
import challengesRouter from './routes/challenges';
import teamChallengesRouter from './routes/teamChallenges';
import injuryRiskRouter from './routes/injuryRisk';
import gameplansRouter from './routes/gameplans';
import predictionsRouter from './routes/predictions';
import debriefsRouter from './routes/debriefs';
import coachDigestRouter from './routes/coachDigest';
import recoveryRouter from './routes/recovery';
import publicProfilesRouter from './routes/publicProfiles';
import referralsRouter from './routes/referrals';
import shareEventsRouter from './routes/shareEvents';
import contactSalesRouter from './routes/contactSales';
import marketplacePlansRouter from './routes/marketplacePlans';
import athleteProRouter from './routes/athletePro';
import trainingAnalyticsRouter from './routes/trainingAnalytics';
import certificationRouter from './routes/certification';
import recruitingRouter from './routes/recruiting';
import adminRouter from './routes/admin';
import cron from 'node-cron';
import { runRaceCountdownCron } from './services/notificationService';
import { runGameplanCron } from './routes/gameplans';
import { runWeeklyDigest } from './routes/coachDigest';

import { apiLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';

const app = express();

// Stripe webhook needs raw body BEFORE JSON parser for signature verification

app.use(helmet());
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile, curl, server-to-server)
      if (!origin) return callback(null, true);
      const allowed = [env.FRONTEND_URL];
      if (allowed.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  })
);
app.use(express.json({ limit: '2mb' }));
app.use(apiLimiter);

app.get('/api/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api', identityRouter);
app.use('/api/coach', coachRouter);
app.use('/api/bots', botsRouter);
app.use('/api/athlete', athleteRouter);
app.use('/api/coach/team', teamRouter);
app.use('/api/athlete', teamRouter);
app.use('/api/strava', stravaRouter);
app.use('/api/athlete', stravaRouter);
app.use('/api/athlete', progressRouter);
app.use('/api/coach/team', progressRouter);

app.use('/api/coach/team', calendarRouter);
app.use('/api/athlete', calendarRouter);

app.use('/api/athlete', nutritionRouter);
app.use('/api/notifications', notificationsRouter);
app.use('/api/marketplace', marketplaceRouter);
app.use('/api/athlete', feedRouter);
app.use('/api/plans', plansRouter);
app.use('/api/community', communityRouter);
app.use('/api/ai', aiCaptionRouter);
app.use('/api/milestones', milestonesRouter);
app.use('/api/challenges', challengesRouter);
app.use('/api/team-challenges', teamChallengesRouter);
app.use('/api/injury-risk', injuryRiskRouter);
app.use('/api/gameplans', gameplansRouter);
app.use('/api/predictions', predictionsRouter);
app.use('/api/debriefs', debriefsRouter);
app.use('/api/digest', coachDigestRouter);
app.use('/api/recovery', recoveryRouter);
app.use('/api/public', publicProfilesRouter);
app.use('/api/referrals', referralsRouter);
app.use('/api/share-events', shareEventsRouter);
app.use('/api/contact-sales', contactSalesRouter);
app.use('/api/marketplace-plans', marketplacePlansRouter);
app.use('/api/athlete-pro', athleteProRouter);
app.use('/api/training-analytics', trainingAnalyticsRouter);
app.use('/api/certification', certificationRouter);
app.use('/api/recruiting', recruitingRouter);
app.use('/api/admin', adminRouter);

app.use('/api', gdprRouter);

app.use(errorHandler);

// ── Schema probe — log missing migrations so Railway logs make it obvious ────
async function probeSchema() {
  const { supabase: db } = await import('./db/supabase');

  // Check for chat_conversations (migration 035)
  const { error } = await db.from('chat_conversations').select('id').limit(1);
  if (error) {
    // eslint-disable-next-line no-console
    console.error(
      '\n' +
      '════════════════════════════════════════════════════════\n' +
      '[MIGRATION REQUIRED] chat_conversations table is missing.\n' +
      'Run the following SQL in your Supabase SQL Editor:\n\n' +
      "CREATE TABLE IF NOT EXISTS public.chat_conversations (\n" +
      "  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),\n" +
      "  season_id       UUID REFERENCES public.athlete_seasons(id) ON DELETE CASCADE NOT NULL,\n" +
      "  name            TEXT NOT NULL DEFAULT 'New Conversation',\n" +
      "  created_at      TIMESTAMPTZ DEFAULT NOW(),\n" +
      "  last_message_at TIMESTAMPTZ DEFAULT NOW()\n" +
      ");\n" +
      "ALTER TABLE public.chat_messages\n" +
      "  ADD COLUMN IF NOT EXISTS conversation_id UUID REFERENCES public.chat_conversations(id) ON DELETE CASCADE;\n\n" +
      'See migrations.sql (Migration 035) for the full script.\n' +
      '════════════════════════════════════════════════════════\n'
    );
  } else {
    // eslint-disable-next-line no-console
    console.log('[schema] chat_conversations ✓');
  }
}

try {
  app.listen(env.PORT, () => {
    // eslint-disable-next-line no-console
    console.log(`Laktic backend running on port ${env.PORT}`);
    probeSchema().catch(() => {});
  });
} catch (err) {
  // eslint-disable-next-line no-console
  console.error('[startup] Fatal error starting server:', err);
  process.exit(1);
}

// ── Scheduled jobs ────────────────────────────────────────────────────────────
// Race countdown notifications — runs daily at 7:00 AM UTC
cron.schedule('0 7 * * *', () => {
  runRaceCountdownCron().catch(() => {});
});

// Gameplan auto-generation — runs every 6 hours for upcoming races in next 48h
cron.schedule('0 */6 * * *', () => {
  runGameplanCron().catch(() => {});
});

// Weekly coach digest — runs every Monday at 8:00 AM UTC
cron.schedule('0 8 * * 1', async () => {
  try {
    const { data: coaches } = await (await import('./db/supabase')).supabase
      .from('coach_profiles')
      .select('id');
    for (const coach of coaches ?? []) {
      await runWeeklyDigest(coach.id).catch(() => {});
    }
  } catch {}
});

// Strava data retention — delete athlete_activities older than 7 days (Strava API compliance)
// Runs nightly at 2:00 AM UTC
cron.schedule('0 2 * * *', async () => {
  try {
    const { supabase: db } = await import('./db/supabase');
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { error, count } = await db
      .from('athlete_activities')
      .delete({ count: 'exact' })
      .eq('source', 'strava')
      .lt('created_at', cutoff);
    if (error) {
      console.error('[Strava retention cron] Delete failed:', error.message);
    } else if (count && count > 0) {
      console.log(`[Strava retention cron] Deleted ${count} stale Strava activities`);
    }
  } catch (err) {
    console.error('[Strava retention cron] Unexpected error:', err);
  }
});

// Weekly adaptive plan refresh — every Monday at 6:00 AM UTC
// Re-generates future weeks for athletes whose plans are active
cron.schedule('0 6 * * 1', async () => {
  console.log('[weekly-plan-cron] Starting weekly adaptive plan refresh');
  try {
    const { supabase: db } = await import('./db/supabase');
    const { generate } = await import('./services/seasonPlanService');

    // Get all active seasons
    const { data: activeSeasonsRaw } = await db
      .from('athlete_seasons')
      .select('id, athlete_id, bot_id, season_plan, race_calendar')
      .eq('status', 'active');

    for (const season of activeSeasonsRaw ?? []) {
      try {
        const [{ data: bot }, { data: athleteProfile }, { data: botWorkouts }] = await Promise.all([
          db.from('coach_bots').select('*').eq('id', season.bot_id).single(),
          db.from('athlete_profiles').select('*').eq('id', season.athlete_id).single(),
          db.from('bot_workouts').select('*').eq('bot_id', season.bot_id).order('day_of_week'),
        ]);

        if (!bot || !athleteProfile) continue;

        // Fetch context
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
        const [{ data: recentActivities }, { data: latestReadiness }] = await Promise.all([
          db.from('athlete_activities').select('start_date, activity_type, distance_miles, pace, duration')
            .eq('athlete_id', season.athlete_id).gte('start_date', thirtyDaysAgo).order('start_date', { ascending: false }).limit(20),
          db.from('daily_readiness').select('score, label, recommended_intensity')
            .eq('athlete_id', season.athlete_id).order('date', { ascending: false }).limit(1).single(),
        ]);

        const today = new Date().toISOString().split('T')[0];
        const existingWeeks = (season.season_plan || []).filter((w: any) => w.week_start_date < today);

        const { plan, aiUsed } = await generate({
          athleteProfile,
          bot,
          botWorkouts: botWorkouts || [],
          raceCalendar: season.race_calendar || [],
          existingWeeks,
          recentActivities: recentActivities || [],
          latestReadiness: latestReadiness ?? null,
        });

        await db.from('athlete_seasons')
          .update({ season_plan: plan, ai_used: aiUsed, updated_at: new Date().toISOString() })
          .eq('id', season.id);

        console.log(`[weekly-plan-cron] Refreshed plan for athlete ${season.athlete_id} (aiUsed=${aiUsed})`);
      } catch (err: any) {
        console.error(`[weekly-plan-cron] Failed for athlete ${season.athlete_id}:`, err.message);
      }
    }
    console.log('[weekly-plan-cron] Done');
  } catch (err) {
    console.error('[weekly-plan-cron] Fatal error:', err);
  }
});

export default app;
