import { z } from 'zod';

// ── Coach ───────────────────────────────────────────────────────────────────

export const coachProfileSchema = z.object({
  name: z.string().min(1).max(200),
  school_or_org: z.string().max(200).optional()
});

export const botCreateSchema = z.object({
  name: z.string().min(1).max(200),
  philosophy: z.string().max(5000).optional(),
  event_focus: z.string().max(100).optional(),
  level_focus: z.string().max(100).optional()
});

export const botUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  philosophy: z.string().max(5000).optional(),
  event_focus: z.string().max(100).optional(),
  level_focus: z.string().max(100).optional(),
  is_published: z.boolean().optional()
});

export const workoutSchema = z.object({
  day_of_week: z.number().int().min(1).max(7),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().default(''),
  distance_miles: z.number().min(0).max(100).optional(),
  pace_guideline: z.string().max(200).optional().default(''),
  ai_adjustable: z.boolean().optional().default(true)
});

export const knowledgeCreateSchema = z.object({
  title: z.string().min(1).max(200),
  document_type: z.string().min(1).max(50),
  content_text: z.string().min(1).max(20000),
  source_file_name: z.string().max(200).optional()
});

export const knowledgeUpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  document_type: z.string().min(1).max(50).optional(),
  content_text: z.string().min(1).max(20000).optional(),
  source_file_name: z.string().max(200).optional()
});

// ── Athlete ─────────────────────────────────────────────────────────────────

export const athleteProfileSchema = z.object({
  name: z.string().min(1).max(200),
  weekly_volume_miles: z.number().min(0).max(200).optional(),
  primary_events: z.string().max(200).optional(),
  pr_mile: z.string().max(20).optional(),
  pr_5k: z.string().max(20).optional()
});

export const athleteProfileUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  weekly_volume_miles: z.number().min(0).max(200).optional(),
  primary_events: z.string().max(200).optional(),
  pr_mile: z.string().max(20).optional(),
  pr_5k: z.string().max(20).optional()
});

export const chatMessageSchema = z.object({
  message: z.string().min(1).max(5000)
});

const raceSchema = z.object({
  name: z.string().min(1).max(200),
  date: z.string().min(1),
  distance: z.string().max(100).optional(),
  goal_time: z.string().max(50).optional(),
  priority: z.enum(['A', 'B', 'C']).optional()
});

export const racesSchema = z.object({
  races: z.array(raceSchema).max(50)
});

// ── Teams ───────────────────────────────────────────────────────────────────

export const teamCreateSchema = z.object({
  name: z.string().min(1).max(200),
  default_bot_id: z.string().uuid().optional()
});

export const memberStatusSchema = z.object({
  status: z.enum(['active', 'injured', 'inactive'])
});

// ── Strava ──────────────────────────────────────────────────────────────────

export const stravaCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().uuid(),
  scope: z.string().optional()
});

export const activitiesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(20),
  after: z.string().optional(),
  before: z.string().optional()
});

export const syncSchema = z.object({
  days: z.number().int().min(1).max(365).default(30)
});

// -- Progress ----------------------------------------------------------------

export const raceResultSchema = z.object({
  race_name: z.string().min(1).max(200),
  race_date: z.string().min(1),
  distance: z.string().min(1).max(100),
  finish_time: z.string().min(1).max(50),
  pace_per_mile: z.string().max(20).optional(),
  placement: z.string().max(100).optional(),
  is_pr: z.boolean().optional().default(false),
  conditions: z.string().max(500).optional(),
  notes: z.string().max(2000).optional()
});

export const raceResultUpdateSchema = z.object({
  race_name: z.string().min(1).max(200).optional(),
  race_date: z.string().min(1).optional(),
  distance: z.string().min(1).max(100).optional(),
  finish_time: z.string().min(1).max(50).optional(),
  pace_per_mile: z.string().max(20).optional(),
  placement: z.string().max(100).optional(),
  is_pr: z.boolean().optional(),
  conditions: z.string().max(500).optional(),
  notes: z.string().max(2000).optional()
});

export const weeklyQuerySchema = z.object({
  weeks: z.coerce.number().int().min(1).max(52).default(12)
});

// ── Billing ────────────────────────────────────────────────────────────────

export const checkoutSchema = z.object({
  plan_type: z.enum(['coach_team', 'athlete_individual'])
});
