import { Router } from 'express';
import { Resend } from 'resend';
import { env } from '../config/env';
import { asyncHandler } from '../utils/asyncHandler';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const contactSchema = z.object({
  name: z.string().min(1).max(200),
  email: z.string().email(),
  organization: z.string().min(1).max(200),
  team_count: z.number().int().min(1).optional(),
  athlete_count: z.number().int().min(1).optional(),
  message: z.string().max(2000).optional(),
});

// POST /api/contact-sales
router.post(
  '/',
  validate(contactSchema),
  asyncHandler(async (req, res) => {
    const { name, email, organization, team_count, athlete_count, message } = req.body;

    if (env.RESEND_API_KEY && env.ADMIN_EMAIL) {
      const resend = new Resend(env.RESEND_API_KEY);
      try {
        await resend.emails.send({
          from: 'Laktic <noreply@laktic.app>',
          to: env.ADMIN_EMAIL,
          subject: `Enterprise Sales Inquiry — ${organization}`,
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;">
              <h2>Enterprise Sales Inquiry</h2>
              <table style="width:100%;border-collapse:collapse;">
                <tr><td style="padding:8px 0;color:#666;">Name</td><td>${name}</td></tr>
                <tr><td style="padding:8px 0;color:#666;">Email</td><td><a href="mailto:${email}">${email}</a></td></tr>
                <tr><td style="padding:8px 0;color:#666;">Organization</td><td>${organization}</td></tr>
                ${team_count ? `<tr><td style="padding:8px 0;color:#666;">Teams</td><td>${team_count}</td></tr>` : ''}
                ${athlete_count ? `<tr><td style="padding:8px 0;color:#666;">Athletes</td><td>${athlete_count}</td></tr>` : ''}
                ${message ? `<tr><td style="padding:8px 0;color:#666;vertical-align:top;">Message</td><td>${message}</td></tr>` : ''}
              </table>
            </div>`,
        });

        // Also send confirmation to inquiry sender
        await resend.emails.send({
          from: 'Laktic <noreply@laktic.app>',
          to: email,
          subject: 'We received your Laktic enterprise inquiry',
          html: `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#111;color:#eee;padding:32px;border-radius:8px;">
              <h2 style="color:#22c55e;margin-top:0;">Thanks, ${name}!</h2>
              <p>We received your inquiry for <strong>${organization}</strong> and will be in touch within 1 business day.</p>
              <p style="color:#ccc;">In the meantime, you can explore our Team License ($999/year) for a single coach team at <a href="${env.FRONTEND_URL}/pricing" style="color:#22c55e;">laktic.com/pricing</a>.</p>
              <p style="color:#666;font-size:12px;margin-top:24px;">Laktic AI Coaching Platform</p>
            </div>`,
        });
      } catch (err) {
        console.error('[contactSales] Failed to send email:', err);
      }
    }

    return res.json({ ok: true });
  })
);

export default router;
