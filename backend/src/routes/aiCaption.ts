import { Router } from 'express';
import OpenAI from 'openai';
import { env } from '../config/env';
import { auth, requireAthlete, AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { filterText, containsSevereProfanity } from '../utils/contentFilter';
import { validate } from '../middleware/validate';
import { z } from 'zod';

const router = Router();

const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });

// Simple in-memory cache keyed by the input text (1 hr TTL)
const cache = new Map<string, { captions: CaptionResult; expiresAt: number }>();
const CACHE_TTL_MS = 60 * 60 * 1000;

interface CaptionResult {
  short: string;
  hype: string;
  reflective: string;
}

const captionSchema = z.object({
  milestone_label: z.string().max(300).optional(),
  activity_summary: z.string().max(500).optional()
});

// POST /api/ai/generate-caption
router.post(
  '/generate-caption',
  auth,
  requireAthlete,
  validate(captionSchema),
  asyncHandler(async (req: AuthRequest, res) => {
    const { milestone_label, activity_summary } = req.body;
    const rawContext = milestone_label || activity_summary || '';
    if (rawContext && containsSevereProfanity(rawContext)) return res.status(400).json({ error: 'Your message contains inappropriate content' });
    const context = rawContext ? filterText(rawContext) : 'a great workout';
    const cacheKey = context.toLowerCase().trim();

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.json({ captions: cached.captions });
    }

    const prompt = `You are a social media caption writer for endurance athletes. Generate exactly 3 captions for this post context: "${context}".

Return ONLY a valid JSON object with these keys:
- "short": 1 punchy sentence under 60 chars
- "hype": 1-2 energetic sentences with emoji, under 120 chars
- "reflective": 1-2 thoughtful sentences about the journey, under 150 chars

No extra text, just the JSON.`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
      response_format: { type: 'json_object' }
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let captions: CaptionResult;

    try {
      const parsed = JSON.parse(raw);
      captions = {
        short: parsed.short ?? context,
        hype: parsed.hype ?? context,
        reflective: parsed.reflective ?? context
      };
    } catch {
      captions = { short: context, hype: context, reflective: context };
    }

    // Cache result
    cache.set(cacheKey, { captions, expiresAt: Date.now() + CACHE_TTL_MS });
    // Evict old entries if cache grows large
    if (cache.size > 500) {
      const now = Date.now();
      for (const [key, val] of cache.entries()) {
        if (val.expiresAt < now) cache.delete(key);
      }
    }

    res.json({ captions });
  })
);

export default router;
