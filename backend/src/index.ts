import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import identityRouter from './routes/identity';
import coachRouter from './routes/coach';
import botsRouter from './routes/bots';
import athleteRouter from './routes/athlete';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: function(origin, callback) {
    callback(null, true);
  },
  credentials: true
}));
app.use(express.json({ limit: '2mb' }));

app.get('/api/health', (_, res) => res.json({ ok: true, ts: new Date().toISOString() }));

app.use('/api', identityRouter);
app.use('/api/coach', coachRouter);
app.use('/api/bots', botsRouter);
app.use('/api/athlete', athleteRouter);

app.listen(PORT, () => {
  console.log(`🚀 Laktic backend running on port ${PORT}`);
});

export default app;