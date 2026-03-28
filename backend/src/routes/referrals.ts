import { Router } from 'express';
import { nanoid } from 'nanoid';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';
import { Resend } from 'resend';
import { env } from '../config/env';

const router = Router();

const trackSignupSchema = z.object({
  ref_code: z.string().min(6).max(12),
  referred_email: z.string().email().optional(),
});

// ── Helpers ───────────────────────────────────────────────────────────────────

async function ensureReferralCode(profileId: string, profileType: 'athlete' | 'coach'): Promise<string> {
  const table = profileType === 'athlete' ? 'athlete_profiles' : 'coach_profiles';
  const { data } = await supabase
    .from(table)
    .select('referral_code')
    .eq('id', profileId)
    .single();

  if (data?.referral_code) return data.referral_code;

  // Generate a unique code
  let code = '';
  let attempts = 0;
  while (attempts < 5) {
    code = nanoid(8).toUpperCase();
    const { error } = await supabase
      .from(table)
      .update({ referral_code: code })
      .eq('id', profileId);
    if (!error) break;
    attempts++;
  }
  return code;
}

async function checkAndGrantReward(referralId: string, referredAthleteId: string): Promise<void> {
  // Check if referred athlete has 3+ activities
  const { count } = await supabase
    .from('athlete_activities')
    .select('id', { count: 'exact', head: true })
    .eq('athlete_id', referredAthleteId);

  if ((count ?? 0) < 3) return;

  const { data: referral } = await supabase
    .from('referrals')
    .select('*')
    .eq('id', referralId)
    .single();

  if (!referral || referral.reward_granted) return;

  // Mark converted + grant reward
  await supabase
    .from('referrals')
    .update({ status: 'converted', reward_granted: true })
    .eq('id', referralId);

  // Add 30 bonus days to referrer
  const table = referral.referrer_type === 'athlete' ? 'athlete_profiles' : 'coach_profiles';
  const { data: referrer } = await supabase
    .from(table)
    .select('referral_credit_days')
    .eq('id', referral.referrer_id)
    .single();

  await supabase
    .from(table)
    .update({ referral_credit_days: ((referrer?.referral_credit_days ?? 0) + 30) })
    .eq('id', referral.referrer_id);
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/referrals/my — own referral dashboard data
router.get('/my', auth, asyncHandler(async (req: AuthRequest, res) => {
  const isCoach = !!req.coach;
  const profileId = isCoach ? req.coach!.id : req.athlete?.id;
  if (!profileId) return res.status(403).json({ error: 'Profile not found' });

  const profileType = isCoach ? 'coach' : 'athlete';
  const code = await ensureReferralCode(profileId, profileType);

  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, referred_email, status, reward_granted, created_at')
    .eq('referrer_id', profileId)
    .order('created_at', { ascending: false });

  const table = isCoach ? 'coach_profiles' : 'athlete_profiles';
  const { data: profile } = await supabase
    .from(table)
    .select('referral_credit_days')
    .eq('id', profileId)
    .single();

  const signedUp = (referrals ?? []).filter(r => r.status !== 'pending').length;
  const converted = (referrals ?? []).filter(r => r.status === 'converted').length;

  return res.json({
    referral_code: code,
    referral_link: `${env.FRONTEND_URL}/join?ref=${code}`,
    total_referred: (referrals ?? []).length,
    signed_up: signedUp,
    converted,
    credit_days: profile?.referral_credit_days ?? 0,
    referrals: referrals ?? [],
  });
}));

// POST /api/referrals/track-signup — called during registration when ref code present
router.post('/track-signup', validate(trackSignupSchema), asyncHandler(async (req, res) => {
  const { ref_code, referred_email } = req.body;

  // Find referrer
  let referrerId: string | null = null;
  let referrerType: 'athlete' | 'coach' | null = null;

  const { data: athleteRef } = await supabase
    .from('athlete_profiles')
    .select('id')
    .eq('referral_code', ref_code)
    .single();

  if (athleteRef) {
    referrerId = athleteRef.id;
    referrerType = 'athlete';
  } else {
    const { data: coachRef } = await supabase
      .from('coach_profiles')
      .select('id')
      .eq('referral_code', ref_code)
      .single();

    if (coachRef) {
      referrerId = coachRef.id;
      referrerType = 'coach';
    }
  }

  if (!referrerId || !referrerType) {
    return res.status(404).json({ error: 'Invalid referral code' });
  }

  const { data: referral, error } = await supabase
    .from('referrals')
    .insert({
      referrer_id: referrerId,
      referrer_type: referrerType,
      referred_email: referred_email ?? null,
      status: 'signed_up',
    })
    .select()
    .single();

  if (error) return res.status(400).json({ error: error.message });

  // Email referrer
  if (env.RESEND_API_KEY) {
    try {
      const table = referrerType === 'athlete' ? 'athlete_profiles' : 'coach_profiles';
      const { data: referrerProfile } = await supabase
        .from(table)
        .select('name, user_id')
        .eq('id', referrerId)
        .single();

      if (referrerProfile?.user_id) {
        const { data: { users } } = await supabase.auth.admin.listUsers();
        const referrerUser = (users as any[]).find((u: any) => u.id === referrerProfile.user_id);
        if (referrerUser?.email) {
          const resend = new Resend(env.RESEND_API_KEY);
          await resend.emails.send({
            from: 'Laktic <noreply@laktic.app>',
            to: referrerUser.email,
            subject: 'Someone just joined Laktic with your referral link!',
            html: `
              <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:8px;">
                <h2 style="color:#22c55e;margin-top:0;">Your referral worked!</h2>
                <p>Hi ${referrerProfile.name},</p>
                <p>${referred_email ? `<strong>${referred_email}</strong> has` : 'Someone has'} just signed up for Laktic using your referral link.</p>
                <p style="color:#ccc;">Once they complete their first 3 workouts, you'll automatically receive <strong style="color:#22c55e;">30 bonus days</strong> on your subscription.</p>
                <p><a href="${env.FRONTEND_URL}/referrals" style="display:inline-block;background:#22c55e;color:#000;padding:10px 20px;border-radius:6px;text-decoration:none;font-weight:bold;">View Your Referrals</a></p>
                <p style="color:#666;font-size:12px;margin-top:24px;">Laktic AI Coaching Platform</p>
              </div>`,
          });
        }
      }
    } catch {
      // Email failure should not fail the request
    }
  }

  return res.status(201).json(referral);
}));

// POST /api/referrals/check-reward/:athleteId — check if referred athlete qualifies
router.post('/check-reward/:athleteId', asyncHandler(async (req, res) => {
  const { athleteId } = req.params;

  const { data: referral } = await supabase
    .from('referrals')
    .select('*')
    .eq('referred_user_id', athleteId)
    .eq('status', 'signed_up')
    .single();

  if (referral) {
    await checkAndGrantReward(referral.id, athleteId);
  }

  return res.json({ ok: true });
}));

// POST /api/referrals/generate-code — generate/retrieve referral code
router.post('/generate-code', auth, asyncHandler(async (req: AuthRequest, res) => {
  const isCoach = !!req.coach;
  const profileId = isCoach ? req.coach!.id : req.athlete?.id;
  if (!profileId) return res.status(403).json({ error: 'Profile not found' });

  const code = await ensureReferralCode(profileId, isCoach ? 'coach' : 'athlete');
  return res.json({ referral_code: code, referral_link: `${env.FRONTEND_URL}/join?ref=${code}` });
}));

export default router;
