import { Resend } from 'resend';
import { env } from '../config/env';

const resend = env.RESEND_API_KEY ? new Resend(env.RESEND_API_KEY) : null;
const FROM = env.EMAIL_FROM || 'Laktic <onboarding@laktic.app>';

// Fire-and-forget — never throw to the caller
async function send(payload: { to: string; subject: string; html: string }) {
  if (!resend) return; // no key configured — skip silently in dev
  try {
    await resend.emails.send({ from: FROM, ...payload });
  } catch {
    // email failure must never break signup
  }
}

// ── Welcome emails ────────────────────────────────────────────────────────────

export async function sendCoachWelcome(to: string, name: string) {
  await send({
    to,
    subject: 'Welcome to Laktic — set up your coaching bot',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#e5e7eb;background:#0f1117;padding:32px;border-radius:12px;">
        <div style="font-size:24px;font-weight:900;color:#4ade80;letter-spacing:-1px;margin-bottom:24px;">LAKTIC</div>
        <h1 style="font-size:20px;font-weight:700;margin:0 0 8px;">Welcome, ${name}!</h1>
        <p style="color:#9ca3af;line-height:1.6;margin:0 0 20px;">
          Your coaching account is ready. Set up your bot once — it will coach every athlete autonomously in your voice.
        </p>
        <div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-weight:600;">Getting started checklist:</p>
          <ul style="color:#9ca3af;margin:0;padding-left:20px;line-height:1.8;">
            <li>Write your coaching philosophy</li>
            <li>Define your weekly training template (7 workouts)</li>
            <li>Upload 1–3 knowledge documents</li>
            <li>Create your team and share the invite code</li>
            <li>Publish your bot</li>
          </ul>
        </div>
        <a href="${env.FRONTEND_URL}/coach/onboarding"
           style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
          Set up your bot →
        </a>
        <p style="color:#4b5563;font-size:12px;margin-top:24px;">
          Your free trial runs for 14 days. No credit card required right now.
        </p>
      </div>
    `,
  });
}

export async function sendAthleteWelcome(to: string, name: string) {
  await send({
    to,
    subject: 'Welcome to Laktic — your personalized plan is one step away',
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#e5e7eb;background:#0f1117;padding:32px;border-radius:12px;">
        <div style="font-size:24px;font-weight:900;color:#4ade80;letter-spacing:-1px;margin-bottom:24px;">LAKTIC</div>
        <h1 style="font-size:20px;font-weight:700;margin:0 0 8px;">Welcome, ${name}!</h1>
        <p style="color:#9ca3af;line-height:1.6;margin:0 0 20px;">
          You're in. Join your team, add your upcoming races, and subscribe to a coaching bot — your AI-powered season plan will be generated in seconds.
        </p>
        <div style="background:#1a1d27;border:1px solid #2a2d3a;border-radius:8px;padding:16px;margin-bottom:24px;">
          <p style="margin:0 0 8px;font-weight:600;">Next steps:</p>
          <ul style="color:#9ca3af;margin:0;padding-left:20px;line-height:1.8;">
            <li>Enter your team invite code</li>
            <li>Add your goal races to your calendar</li>
            <li>Subscribe to a coach bot</li>
            <li>Get your personalized season plan</li>
          </ul>
        </div>
        <a href="${env.FRONTEND_URL}/athlete/join"
           style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;">
          Join your team →
        </a>
      </div>
    `,
  });
}
