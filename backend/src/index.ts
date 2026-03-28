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

app.use('/api', gdprRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Laktic backend running on port ${env.PORT}`);
});

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

export default app;
