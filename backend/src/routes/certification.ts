import { Router, Response } from 'express';
import { z } from 'zod';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';
import { env } from '../config/env';
import Stripe from 'stripe';

const router = Router();

const MODULES = [
  {
    id: 1,
    title: 'Periodization & Training Principles',
    questions: [
      { q: 'What does ACWR stand for?', options: ['Acute:Chronic Workload Ratio','Athletic Coaching Weekly Review','Aerobic Capacity Workout Rating','Annual Cumulative Workload Record'], answer: 0 },
      { q: 'Which training zone primarily develops aerobic base?', options: ['Zone 4','Zone 2','Zone 5','Zone 1'], answer: 1 },
      { q: 'What is the recommended maximum weekly mileage increase?', options: ['20%','10%','30%','5%'], answer: 1 },
    ],
  },
  {
    id: 2,
    title: 'Nutrition & Recovery Science',
    questions: [
      { q: 'What is the optimal carbohydrate intake window post-race?', options: ['6 hours','30 minutes','3 hours','24 hours'], answer: 1 },
      { q: 'HRV stands for:', options: ['High Rate Variability','Heart Rate Variation','Heart Rate Variability','High Resting Volume'], answer: 2 },
      { q: 'Which macro is most important for muscle repair?', options: ['Fat','Carbohydrates','Protein','Fiber'], answer: 2 },
    ],
  },
  {
    id: 3,
    title: 'Race Strategy & Pacing',
    questions: [
      { q: 'The Riegel formula is used to predict:', options: ['Recovery time','Race finish time','Injury risk','VO2 max'], answer: 1 },
      { q: 'Negative splitting means:', options: ['Running first half faster','Running second half faster','Equal splits','Running uphill segments faster'], answer: 1 },
      { q: 'What weather condition most impacts marathon performance?', options: ['Wind','Altitude','Humidity and heat','Rain'], answer: 2 },
    ],
  },
  {
    id: 4,
    title: 'Injury Prevention & Biomechanics',
    questions: [
      { q: 'Shin splints are medically known as:', options: ['Plantar fasciitis','Medial tibial stress syndrome','IT band syndrome','Achilles tendinopathy'], answer: 1 },
      { q: 'Cadence for efficient running is approximately:', options: ['120 spm','160 spm','180 spm','200 spm'], answer: 2 },
      { q: 'Which is a primary risk factor for stress fractures?', options: ['High cadence','Overstriding','Forefoot striking','Trail running'], answer: 1 },
    ],
  },
  {
    id: 5,
    title: 'AI-Powered Coaching Techniques',
    questions: [
      { q: 'What does CTL represent in training load analytics?', options: ['Current Training Level','Chronic Training Load','Cumulative Training Log','Critical Threshold Limit'], answer: 1 },
      { q: 'TSB (Training Stress Balance) is calculated as:', options: ['ATL - CTL','CTL - ATL','ATL + CTL','CTL / ATL'], answer: 1 },
      { q: 'Which readiness factor has the highest impact on performance prediction?', options: ['Muscle soreness','Sleep quality','Mood','Energy level'], answer: 1 },
    ],
  },
];

const PASS_SCORE = 0.75;

router.get('/', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id, certified_coach').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const { data: cert } = await supabase.from('coach_certifications').select('*').eq('coach_id', profile.id).single();
  res.json({
    certification: cert ?? null,
    certified: profile.certified_coach,
    modules: MODULES.map(m => ({ id: m.id, title: m.title, question_count: m.questions.length })),
  });
});

router.get('/module/:id', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const moduleId = parseInt(req.params.id);
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return res.status(404).json({ error: 'Module not found' });

  res.json({
    id: module.id,
    title: module.title,
    questions: module.questions.map((q, i) => ({ index: i, q: q.q, options: q.options })),
  });
});

const submitSchema = z.object({ answers: z.array(z.number().int()) });

router.post('/module/:id/submit', auth, async (req: AuthRequest, res: Response) => {
  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });

  const moduleId = parseInt(req.params.id);
  const module = MODULES.find(m => m.id === moduleId);
  if (!module) return res.status(404).json({ error: 'Module not found' });

  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const { answers } = parsed.data;
  let correct = 0;
  for (let i = 0; i < module.questions.length; i++) {
    if (answers[i] === module.questions[i].answer) correct++;
  }
  const score = correct / module.questions.length;
  const passed = score >= PASS_SCORE;

  const { data: existing } = await supabase.from('coach_certifications').select('*').eq('coach_id', profile.id).single();
  const quizScores = { ...(existing?.quiz_scores ?? {}), [moduleId]: { score, passed, attempted_at: new Date().toISOString() } };
  const modulesCompleted = Object.values(quizScores).filter((v: any) => v.passed).length;
  const allPassed = modulesCompleted === MODULES.length;

  if (existing) {
    await supabase.from('coach_certifications').update({
      quiz_scores: quizScores, modules_completed: modulesCompleted,
      passed: allPassed, updated_at: new Date().toISOString(),
    }).eq('coach_id', profile.id);
  } else {
    await supabase.from('coach_certifications').insert({
      coach_id: profile.id, quiz_scores: quizScores,
      modules_completed: modulesCompleted, passed: allPassed,
    });
  }

  res.json({ score, passed, correct, total: module.questions.length, modules_completed: modulesCompleted, all_passed: allPassed });
});

router.post('/checkout', auth, async (req: AuthRequest, res: Response) => {
  if (!env.STRIPE_SECRET_KEY) return res.status(503).json({ error: 'Payments not configured' });

  const userId = req.user!.id;
  const { data: profile } = await supabase.from('coach_profiles').select('id, certified_coach').eq('user_id', userId).single();
  if (!profile) return res.status(403).json({ error: 'Coach only' });
  if (profile.certified_coach) return res.status(400).json({ error: 'Already certified' });

  const { data: cert } = await supabase.from('coach_certifications').select('passed').eq('coach_id', profile.id).single();
  if (!cert?.passed) return res.status(400).json({ error: 'Complete all modules first' });

  const stripe = new Stripe(env.STRIPE_SECRET_KEY);

  const lineItem = env.STRIPE_CERTIFICATION_PRICE_ID
    ? { price: env.STRIPE_CERTIFICATION_PRICE_ID, quantity: 1 }
    : { price_data: { currency: 'usd' as const, product_data: { name: 'Laktic Coach Certification' }, unit_amount: 29900 }, quantity: 1 };

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    line_items: [lineItem],
    success_url: `${env.FRONTEND_URL}/coach/certification?success=1`,
    cancel_url: `${env.FRONTEND_URL}/coach/certification`,
    metadata: { type: 'certification', coach_id: profile.id },
  });

  res.json({ url: session.url });
});

export default router;
