import { Response, NextFunction } from 'express';
import { supabase } from '../db/supabase';
import { AuthRequest } from './auth';

export async function requireSubscription(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const userId = req.user.id;
  const { data: ownSub } = await supabase.from('subscriptions').select('*')
    .eq('user_id', userId).in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false }).limit(1).single();
  if (ownSub) {
    if (ownSub.status === 'active' || ownSub.status === 'trialing') return next();
    if (ownSub.status === 'past_due' && ownSub.current_period_end) {
      const grace = new Date(new Date(ownSub.current_period_end).getTime() + 14 * 86400000);
      if (new Date() < grace) return next();
    }
  }
  const { data: athleteProfile } = await supabase.from('athlete_profiles')
    .select('id').eq('user_id', userId).single();
  if (athleteProfile) {
    const { data: memberships } = await supabase.from('team_members')
      .select('team_id, teams!inner(coach_id)').eq('athlete_id', athleteProfile.id).eq('status', 'active');
    if (memberships) {
      for (const membership of memberships) {
        const coachId = (membership as any).teams?.coach_id;
        if (!coachId) continue;
        const { data: cp } = await supabase.from('coach_profiles').select('user_id').eq('id', coachId).single();
        if (!cp) continue;
        const { data: coachSub } = await supabase.from('subscriptions').select('status, current_period_end')
          .eq('user_id', cp.user_id).eq('plan_type', 'coach_team')
          .in('status', ['active', 'trialing', 'past_due'])
          .order('created_at', { ascending: false }).limit(1).single();
        if (coachSub) {
          if (coachSub.status === 'active' || coachSub.status === 'trialing') return next();
          if (coachSub.status === 'past_due' && coachSub.current_period_end) {
            const grace = new Date(new Date(coachSub.current_period_end).getTime() + 14 * 86400000);
            if (new Date() < grace) return next();
          }
        }
      }
    }
  }
  return res.status(402).json({ error: 'Subscription required',
    message: 'An active subscription is required to access this feature.' });
}
