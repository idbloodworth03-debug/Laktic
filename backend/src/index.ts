import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';

import identityRouter from './routes/identity';
import coachRouter from './routes/coach';
import botsRouter from './routes/bots';
import athleteRouter from './routes/athlete';
import teamRouter from './routes/team';

import { apiLimiter } from './middleware/rateLimit';
import { errorHandler } from './middleware/errorHandler';

const app = express();

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

app.use(errorHandler);

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Laktic backend running on port ${env.PORT}`);
});

export default app;
