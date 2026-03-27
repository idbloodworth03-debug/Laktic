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

app.use('/api', gdprRouter);

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Laktic backend running on port ${env.PORT}`);
});

export default app;
