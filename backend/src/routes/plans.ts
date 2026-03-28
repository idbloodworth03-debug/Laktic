import { Router } from 'express';
import { supabase } from '../db/supabase';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// GET /api/plans/status/:jobId
router.get(
  '/status/:jobId',
  auth,
  requireAthlete,
  asyncHandler(async (req: AuthRequest, res) => {
    const { jobId } = req.params;

    const { data: job, error } = await supabase
      .from('plan_jobs')
      .select('id, athlete_id, status, result, error')
      .eq('id', jobId)
      .single();

    if (error || !job) return res.status(404).json({ error: 'Job not found' });

    if (job.athlete_id !== req.athlete.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    return res.json({
      status: job.status,
      ...(job.result ? { seasonId: (job.result as any).seasonId } : {}),
      ...(job.error ? { jobError: job.error } : {})
    });
  })
);

export default router;
