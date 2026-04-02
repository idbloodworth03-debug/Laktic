import { z } from 'zod';

// ── Coach ───────────────────────────────────────────────────────────────────

export const coachProfileSchema = z.object({
  name: z.string().min(1).max(200),
  school_or_org: z.string().max(200).optional()
});

export const botCreateSchema = z.object({
  name: z.string().min(1).max(200),
  philosophy: z.string().max(5000).nullish(),
  event_focus: z.string().max(100).nullish(),
  level_focus: z.string().max(100).nullish(),
  personality: z.string().max(50).nullish(),
  personality_prompt: z.string().max(2000).nullish(),
});

export const botUpdateSchema = z.object({
  name: z.string().min(1).max(200).nullish(),
  philosophy: z.string().max(5000).nullish(),
  event_focus: z.string().max(100).nullish(),
  level_focus: z.string().max(100).nullish(),
  is_published: z.boolean().optional(),
  personality: z.string().max(50).nullish(),
  personality_prompt: z.string().max(2000).nullish(),
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
  primary_events: z.array(z.string().max(100)).max(20).optional(),
  pr_mile: z.string().max(20).optional(),
  pr_5k: z.string().max(20).optional()
});

export const athleteProfileUpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  weekly_volume_miles: z.number().min(0).max(200).nullish(),
  primary_events: z.array(z.string().max(100)).max(20).nullish(),
  pr_mile: z.string().max(20).nullish(),
  pr_5k: z.string().max(20).nullish(),
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/).optional(),
  public_sections: z.object({
    races: z.boolean(),
    stats: z.boolean(),
    milestones: z.boolean(),
  }).optional(),
  onboarding_completed: z.boolean().optional(),
  fitness_level: z.string().max(50).nullish(),
  primary_goal: z.string().max(100).nullish(),
  training_days_per_week: z.number().int().min(1).max(7).nullish(),
  biggest_challenge: z.string().max(100).nullish(),
  injury_notes: z.string().max(1000).nullish(),
  has_target_race: z.boolean().nullish(),
  target_race_name: z.string().max(200).nullish(),
  target_race_date: z.string().nullish(),
  avatar_url: z.string().url().max(2000).nullish(),
  current_weekly_mileage: z.number().min(0).max(300).nullish(),
  pr_10k: z.string().max(20).nullish(),
  pr_half_marathon: z.string().max(20).nullish(),
  pr_marathon: z.string().max(20).nullish(),
  experience_level: z.string().max(50).nullish(),
  long_run_distance: z.number().min(0).max(100).nullish(),
  // New onboarding fields
  pr_800m: z.string().max(20).nullish(),
  age: z.number().int().min(0).max(120).nullish(),
  gender: z.string().max(50).nullish(),
  fitness_rating: z.number().int().min(1).max(10).nullish(),
  height_ft: z.number().int().min(0).max(10).nullish(),
  height_in: z.number().int().min(0).max(11).nullish(),
  weight_lbs: z.number().min(0).max(1000).nullish(),
  sleep_average: z.string().max(50).nullish(),
  goal_time: z.string().max(50).nullish(),
  runner_types: z.array(z.string().max(100)).max(10).nullish(),
  biggest_challenges: z.array(z.string().max(200)).max(20).nullish(),
  target_race_distance: z.string().max(100).nullish(),
  pr_1500m: z.string().max(20).nullish(),
  season_start_date: z.string().nullish(),
  season_end_date: z.string().nullish(),
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
  default_bot_id: z.string().uuid().optional(),
  max_uses: z.number().int().positive().optional(),
  invite_code_expires_at: z.string().optional()
});

export const memberStatusSchema = z.object({
  status: z.enum(['active', 'injured', 'inactive'])
});

// ── Strava ──────────────────────────────────────────────────────────────────

export const stravaCallbackSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(1), // "${athleteId}" or "${athleteId}|${returnTo}"
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

