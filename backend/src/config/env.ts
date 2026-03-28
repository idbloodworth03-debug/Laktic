import { z } from 'zod';
import dotenv from 'dotenv';

dotenv.config();

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  OPENAI_API_KEY: z.string().min(1),
  PORT: z.string().default('3001'),
  FRONTEND_URL: z.string().url().default('http://localhost:5173'),
  STRAVA_CLIENT_ID: z.string().optional(),
  STRAVA_CLIENT_SECRET: z.string().optional(),
  STRAVA_REDIRECT_URI: z.string().optional(),
  STRAVA_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  VAPID_PUBLIC_KEY: z.string().optional(),
  VAPID_PRIVATE_KEY: z.string().optional(),
  VAPID_SUBJECT: z.string().optional(),
  ADMIN_EMAIL: z.string().email().optional()
});

const result = envSchema.safeParse(process.env);
if (!result.success) {
  // eslint-disable-next-line no-console
  console.error('Missing or invalid environment variables:');
  for (const [key, errors] of Object.entries(result.error.flatten().fieldErrors)) {
    // eslint-disable-next-line no-console
    console.error(`  ${key}: ${errors?.join(', ')}`);
  }
  process.exit(1);
}

export const env = result.data;
