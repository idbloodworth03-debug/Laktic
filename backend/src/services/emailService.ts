/**
 * emailService.ts — Transactional email via Resend
 *
 * All sends are no-ops (logged only) until RESEND_API_KEY is set.
 * Fire-and-forget — never throw to the caller.
 */

const RESEND_API = 'https://api.resend.com/emails';
const FROM_ADDRESS = 'Laktic <hello@laktic.app>';

async function send(to: string, subject: string, html: string): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    // eslint-disable-next-line no-console
    console.warn(`[emailService] RESEND_API_KEY not set — skipping email to ${to}`);
    return;
  }

  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: FROM_ADDRESS, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    // eslint-disable-next-line no-console
    console.error(`[emailService] Resend error ${res.status}: ${body}`);
  }
}

// ── Welcome email — Coach ─────────────────────────────────────────────────────
export async function sendCoachWelcomeEmail(email: string, name: string): Promise<void> {
  await send(
    email,
    'Welcome to Laktic — Set up your coaching bot',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080c09;color:#edf4ee;margin:0;padding:0;}
  .wrap{max-width:560px;margin:40px auto;padding:0 24px;}
  .logo{font-size:24px;font-weight:900;color:#22c55e;letter-spacing:-0.03em;margin-bottom:32px;}
  h1{font-size:22px;font-weight:700;margin-bottom:8px;}
  p{color:#c4d9c8;line-height:1.7;margin:0 0 16px;}
  .btn{display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:8px 0 24px;}
  .step{background:#0d1610;border:1px solid #1a2d1e;border-radius:12px;padding:16px 20px;margin-bottom:12px;}
  .step-num{color:#22c55e;font-weight:700;margin-right:8px;}
  .footer{color:#68876e;font-size:12px;margin-top:40px;border-top:1px solid #1a2d1e;padding-top:20px;}
</style></head>
<body>
<div class="wrap">
  <div class="logo">LAKTIC</div>
  <h1>Welcome, ${name}! Let's build your coaching bot.</h1>
  <p>You've taken the first step. Your bot will coach every athlete in your voice — 24/7, at scale. Here's how to get it live:</p>

  <div class="step"><span class="step-num">1</span><strong>Write your coaching philosophy</strong> — The AI coaches from this. The more detail, the better.</div>
  <div class="step"><span class="step-num">2</span><strong>Add your weekly template</strong> — 7 days of workout structure. AI adapts distances and paces per athlete.</div>
  <div class="step"><span class="step-num">3</span><strong>Upload knowledge documents</strong> — Sample weeks, taper notes, injury rules. These teach the AI your system.</div>
  <div class="step"><span class="step-num">4</span><strong>Publish your bot</strong> — Athletes can now subscribe and receive personalized season plans.</div>

  <a href="${process.env.FRONTEND_URL}/coach/onboarding" class="btn">Set Up My Bot →</a>

  <p>Questions? Just reply to this email. We read everything.</p>
  <p style="font-size:13px;color:#68876e;">Your free trial runs for 14 days. No credit card required right now.</p>

  <div class="footer">Laktic · AI-powered athlete coaching · <a href="${process.env.FRONTEND_URL}" style="color:#22c55e;">laktic.app</a></div>
</div>
</body>
</html>`
  );
}

// ── Welcome email — Athlete ───────────────────────────────────────────────────
export async function sendAthleteWelcomeEmail(email: string, name: string): Promise<void> {
  await send(
    email,
    'Welcome to Laktic — Your personalized plan is almost ready',
    `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#080c09;color:#edf4ee;margin:0;padding:0;}
  .wrap{max-width:560px;margin:40px auto;padding:0 24px;}
  .logo{font-size:24px;font-weight:900;color:#22c55e;letter-spacing:-0.03em;margin-bottom:32px;}
  h1{font-size:22px;font-weight:700;margin-bottom:8px;}
  p{color:#c4d9c8;line-height:1.7;margin:0 0 16px;}
  .btn{display:inline-block;background:#22c55e;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600;margin:8px 0 24px;}
  .step{background:#0d1610;border:1px solid #1a2d1e;border-radius:12px;padding:16px 20px;margin-bottom:12px;}
  .step-num{color:#22c55e;font-weight:700;margin-right:8px;}
  .footer{color:#68876e;font-size:12px;margin-top:40px;border-top:1px solid #1a2d1e;padding-top:20px;}
</style></head>
<body>
<div class="wrap">
  <div class="logo">LAKTIC</div>
  <h1>Welcome, ${name}! Your training plan is waiting.</h1>
  <p>Laktic connects you with AI coaching built on your coach's actual philosophy. Here's how to get started:</p>

  <div class="step"><span class="step-num">1</span><strong>Join your team</strong> — Enter the invite code your coach gave you.</div>
  <div class="step"><span class="step-num">2</span><strong>Add your race calendar</strong> — Your season plan is built around your goal race.</div>
  <div class="step"><span class="step-num">3</span><strong>Connect Strava</strong> — So your plan adapts based on your actual runs.</div>
  <div class="step"><span class="step-num">4</span><strong>Subscribe to a coaching bot</strong> — GPT-4o generates your full season plan in seconds.</div>

  <a href="${process.env.FRONTEND_URL}/athlete/join" class="btn">Join Your Team →</a>

  <div class="footer">Laktic · AI-powered athlete coaching · <a href="${process.env.FRONTEND_URL}" style="color:#22c55e;">laktic.app</a></div>
</div>
</body>
</html>`
  );
}
