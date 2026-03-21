import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/me', auth, async (req: AuthRequest, res) => {
  const userId = req.user!.id;

  const { data: coach } = await supabase
    .from('coach_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (coach) return res.json({ role: 'coach', profile: coach });

  const { data: athlete } = await supabase
    .from('athlete_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (athlete) return res.json({ role: 'athlete', profile: athlete });

  return res.status(404).json({ error: 'Profile not found' });
});

export default router;
