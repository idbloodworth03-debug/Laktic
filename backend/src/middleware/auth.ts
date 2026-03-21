import { Request, Response, NextFunction } from 'express';
import { supabase } from '../db/supabase';

export interface AuthRequest extends Request {
  user?: { id: string };
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
  req.user = { id: user.id };
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
  req.coach = data;
  next();
}

export async function requireAthlete(req: AuthRequest, res: Response, next: NextFunction) {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabase
    .from('athlete_profiles')
    .select('*')
    .eq('user_id', req.user.id)
    .single();
  if (error || !data) return res.status(403).json({ error: 'Not an athlete' });
  req.athlete = data;
  next();
}
