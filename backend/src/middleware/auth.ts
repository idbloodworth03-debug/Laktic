import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase';

const _lastActiveCache = new Map<string, number>();
function _touchLastActive(table: 'athlete_profiles' | 'coach_profiles', userId: string) {
  const now = Date.now();
  if ((now - (_lastActiveCache.get(userId) ?? 0)) < 5 * 60 * 1000) return;
  _lastActiveCache.set(userId, now);
  supabase.from(table).update({ last_active: new Date().toISOString() }).eq('user_id', userId).then(() => {});
}

export interface AuthRequest extends Request {
  user?: { id: string; email?: string };
  coach?: any;
  athlete?: any;
}

export async function auth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid token' });
  }
  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  req.user = { id: user.id, email: user.email };

  // Block banned emails
  if (user.email) {
    const { data: ban } = await supabase.from('banned_emails').select('id').eq('email', user.email.toLowerCase()).maybeSingle();
    if (ban) return res.status(403).json({ error: 'Account banned' });
  }

  next();
}

export async function requireCoach(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('coach_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) return res.status(403).json({ error: 'Not a coach' });
  if (data.suspended) return res.status(403).json({ error: 'Account suspended' });
  req.coach = data;
  _touchLastActive('coach_profiles', req.user.id);
  next();
}

export async function requireAthlete(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('athlete_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .single();

  if (!error && data) {
    if (data.suspended) return res.status(403).json({ error: 'Account suspended' });
    req.athlete = data;
    _touchLastActive('athlete_profiles', req.user.id);
    return next();
  }

  // Profile missing for a valid authenticated user — upsert to handle race conditions
  const name = req.user.email?.split('@')[0] ?? 'Athlete';
  const { data: created, error: createErr } = await supabase
    .from('athlete_profiles')
    .upsert({ user_id: req.user.id, name }, { onConflict: 'user_id', ignoreDuplicates: false })
    .select()
    .single();

  if (createErr || !created) {
    // Last resort: re-fetch in case a concurrent request already created it
    const { data: refetched } = await supabase.from('athlete_profiles').select('*').eq('user_id', req.user.id).single();
    if (refetched) { req.athlete = refetched; return next(); }
    console.error('[requireAthlete] auto-create failed:', createErr?.message);
    return res.status(403).json({ error: 'Not an athlete' });
  }

  req.athlete = created;
  next();
}
