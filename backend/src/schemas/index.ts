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

// ── Direct Messages ─────────────────────────────────────────────────────────

export const directMessageSchema = z.object({
  message: z.string().min(1).max(5000)
});

// ── Calendar & Attendance ────────────────────────────────────────────────────

export const calendarEventSchema = z.object({
  title: z.string().min(1).max(200),
  event_type: z.enum(['practice', 'race', 'off_day', 'travel', 'meeting', 'other']),
  event_date: z.string().min(1),
  start_time: z.string().max(10).optional(),
  end_time: z.string().max(10).optional(),
  location_name: z.string().max(300).optional(),
  location_lat: z.number().min(-90).max(90).optional(),
  location_lng: z.number().min(-180).max(180).optional(),
  notes: z.string().max(2000).optional()
});

export const calendarEventUpdateSchema = calendarEventSchema.partial();

export const checkInSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180)
});

export const manualAttendanceSchema = z.object({
  athlete_id: z.string().uuid(),
  status: z.enum(['present', 'absent', 'excused', 'late']),
  notes: z.string().max(500).optional()
});

// ── Billing ────────────────────────────────────────────────────────────────

export const checkoutSchema = z.object({
  plan_type: z.enum(['coach_team', 'athlete_individual'])
});

// ── Nutrition ───────────────────────────────────────────────────────────────

export const bodyMetricsSchema = z.object({
  weight_kg: z.number().min(20).max(300).optional(),
  height_cm: z.number().min(100).max(250).optional(),
  sweat_rate_ml_per_hr: z.number().min(100).max(3000).optional()
});

export const fuelLogEntrySchema = z.object({
  logged_at: z.string().min(1),
  calories: z.number().int().min(0).max(10000).optional(),
  carbs_g: z.number().min(0).max(2000).optional(),
  protein_g: z.number().min(0).max(500).optional(),
  hydration_ml: z.number().int().min(0).max(20000).optional(),
  notes: z.string().max(500).optional()
});

export const fuelCalculatorSchema = z.object({
  duration_min: z.number().min(1).max(600),
  temp_c: z.number().min(-30).max(55).optional()
});

// ── Push Notifications ──────────────────────────────────────────────────────

export const pushSubscribeSchema = z.object({
  endpoint: z.string().url(),
  p256dh: z.string().min(1),
  auth: z.string().min(1)
});

export const pushUnsubscribeSchema = z.object({
  endpoint: z.string().url()
});

// ── Marketplace ──────────────────────────────────────────────────────────────

export const marketplaceApplySchema = z.object({
  bio: z.string().min(50).max(2000),
  credentials: z.string().min(10).max(1000),
  specialization: z.enum(['distance', 'sprints', 'triathlon', 'trail', 'field', 'cross_country', 'multi_event']),
  price_per_month: z.number().min(5).max(200).default(25)
});

export const marketplaceRejectSchema = z.object({
  rejection_reason: z.string().min(10).max(500)
});

// ── Social Feed ──────────────────────────────────────────────────────────────

export const feedPostSchema = z.object({
  body: z.string().min(1).max(500)
});

// ── AI Enhancement ───────────────────────────────────────────────────────────

export const enhancePhilosophySchema = z.object({
  philosophy: z.string().min(10).max(5000)
});
