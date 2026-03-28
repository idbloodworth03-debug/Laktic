# Laktic Product Roadmap

*Updated: March 2026 — After 6 PRs from the OverWatch team*

## What's Been Built (PRs 1-6)

### Foundation Layer (Merged)
- [x] Security hardening (.gitignore, ESLint, Prettier, CI)
- [x] API hardening (Zod validation, rate limiting, CORS, error handling, helmet)
- [x] Team roster (create team, invite codes, roster management, audit trail)
- [x] Strava OAuth (connect, sync activities, webhook, activity list)

### Ready to Merge
- [x] Athlete progress dashboard (weekly summaries, race results, coach overview)
- [x] Stripe subscription billing (checkout, portal, webhooks, paywall middleware)

---

## Phase 1: Ship the MVP (Weeks 1-2)

**Goal:** Get the first paying coach on the platform.

### 1.1 Deploy to Production
- [ ] Deploy backend to Railway / Render / Fly.io
- [ ] Deploy frontend to Vercel / Netlify
- [ ] Set up Supabase production project (separate from dev)
- [ ] Configure Stripe production keys + webhook endpoint
- [ ] Set up custom domain (laktic.app or similar)
- [ ] SSL + CDN (Cloudflare)

### 1.2 Strava App Approval
- [ ] Create Strava API application at strava.com/settings/api
- [ ] Submit for API access (takes 1-2 weeks)
- [ ] While waiting, test with Strava sandbox accounts

### 1.3 Onboarding Flow Polish
- [ ] Welcome email on signup (Resend or SendGrid)
- [ ] Coach onboarding wizard (step-by-step: create profile → create bot → add workouts → upload docs → create team → share invite code)
- [ ] Athlete onboarding (join team → connect Strava → set race calendar → get plan)
- [ ] Password reset flow (Supabase handles this, just wire up the UI)

### 1.4 Trial Period
- [ ] 14-day free trial for coaches (Stripe trial support already in billing schema)
- [ ] Trial banner in UI ("12 days remaining")
- [ ] Trial-to-paid conversion email drip

---

## Phase 2: Core Experience (Weeks 3-6)

**Goal:** Make the product sticky — coaches and athletes use it daily.

### 2.1 Fatigue Monitoring
- [ ] Pull resting HR + HRV from Strava/Garmin activities
- [ ] Compute daily readiness score (weighted: HRV trend, sleep, training load)
- [ ] Display readiness on athlete dashboard (green/yellow/red)
- [ ] AI uses readiness to auto-adjust next workout intensity
- [ ] Coach sees team readiness heatmap

### 2.2 Adaptive AI Plans
- [ ] Feed Strava activity data into the plan generation prompt
- [ ] AI compares planned vs actual (did athlete hit the workout?)
- [ ] Auto-adjust future workouts based on compliance + readiness
- [ ] "Plan deviation" alerts to coach when athlete is consistently under/over

### 2.3 Team Calendar (Shared)
- [x] `team_calendar_events` table (practice, race, off_day, travel, meeting, other)
- [x] Coach creates events → syncs to all athletes
- [ ] AI plan generator accounts for team events (no hard workout on travel day)
- [x] iCal export (.ics) for athletes to add to their phone calendar

### 2.4 Attendance Tracker
- [x] GPS check-in: athlete opens app within 200m of practice location → auto-marked present
- [x] Manual check-in by coach
- [x] Attendance report for coach (who missed what, % attendance per athlete)
- [ ] Integrate with readiness (absent + low readiness = possible injury flag)

---

## Phase 3: Growth Features (Weeks 7-12)

**Goal:** Word-of-mouth growth + retention.

### 3.1 Push Notifications (Mobile PWA)
- [ ] Service worker for PWA install
- [ ] Push notifications: new plan available, workout reminder, race day countdown
- [ ] Post-run intake prompt ("Log your post-run fueling")
- [ ] Coach notifications: athlete missed practice, new race result, low readiness alert

### 3.2 Garmin + Coros Integration
- [ ] Garmin Connect API OAuth (similar pattern to Strava)
- [ ] Coros API integration
- [ ] Unified activity model (already designed — `source` field in athlete_activities)
- [ ] Auto-detect which platform athlete uses

### 3.3 Progress Analytics V2
- [ ] Training load chart (acute vs chronic — ATL/CTL/TSB)
- [ ] Fitness/fatigue curves
- [ ] Race prediction based on training trends
- [ ] Comparison to previous seasons
- [ ] Exportable PDF reports for athletes/parents

### 3.4 Nutrition & Hydration Module
- [ ] Athlete body metrics (height, weight, sweat rate)
- [ ] Weather API integration for practice location
- [ ] Post-run fueling calculator (based on duration, temp, sweat rate)
- [ ] Under-fueling tracking + correlation with fatigue
- [ ] Push notification: "Time to refuel — aim for 300-400 calories within 30 min"

---

## Phase 4: Marketplace (Months 3-6)

**Goal:** Revenue flywheel — elite coaches monetize, athletes get premium content.

### 4.1 Elite Coaching Marketplace
- [ ] `marketplace_coaches` table (bio, credentials, pricing)
- [ ] Coach onboarding: structured training philosophy upload (templates provided)
- [ ] Coach review + approval process (manual initially)
- [ ] Marketplace browse page with coach cards (philosophy, specialization, price)
- [ ] Athlete subscribes to coach model ($20-30/month)
- [ ] Revenue share: 70% Laktic / 30% coach (adjustable)

### 4.2 Coach Content Updates
- [ ] Quarterly content refresh requirement (per business plan)
- [ ] Content submission portal for marketplace coaches
- [ ] Version history on knowledge docs
- [ ] A/B testing: which coach philosophy produces better athlete outcomes?

### 4.3 Social Features
- [ ] Team feed (athlete logs activity → teammates see it)
- [ ] Kudos/reactions on activities
- [ ] Team leaderboard (weekly miles, streak length)
- [ ] Share race results to feed

---

## Technical Debt & Infrastructure

### Must-Do Before Launch
- [ ] Add comprehensive test suite (vitest for backend, Playwright for E2E)
- [ ] Set up error monitoring (Sentry)
- [ ] Set up analytics (PostHog or Mixpanel)
- [ ] Database backup strategy (Supabase handles this, but verify)
- [ ] Rate limit monitoring + alerting
- [ ] GDPR compliance (data export, account deletion)

### Nice-To-Have
- [ ] Redis for caching (Strava API rate limits, session data)
- [ ] Background job queue (Bull/BullMQ) for activity sync
- [ ] Email templates (React Email)
- [ ] Admin dashboard for platform management
- [ ] Feature flags (LaunchDarkly or Unleash)

---

## Revenue Projections (From Business Plan)

| Phase | Timeline | Revenue Target |
|---|---|---|
| MVP Launch | Month 1-2 | 5 coaches × $89/mo = $445/mo |
| Growth | Month 3-6 | 25 coaches + 100 athletes = $4,225/mo |
| Marketplace | Month 6-12 | 50 coaches + 500 athletes + marketplace = $15,000+/mo |

**Key metric:** Coach retention. If coaches stay 12+ months, LTV = $1,068+. Target CAC < $100.

---

## Architecture Notes

### Current Stack
- **Frontend:** React 18 + TypeScript + Vite + Tailwind + Zustand
- **Backend:** Node.js + Express + TypeScript
- **Database:** Supabase (PostgreSQL + Auth + RLS)
- **AI:** OpenAI GPT-4o (plan generation + coaching chat)
- **Payments:** Stripe (checkout, portal, webhooks)
- **GPS Data:** Strava OAuth + webhook
- **CI:** GitHub Actions (lint + typecheck)

### Recommended Additions
- **Hosting:** Vercel (frontend) + Railway (backend) + Supabase (managed DB)
- **Monitoring:** Sentry (errors) + PostHog (analytics)
- **Email:** Resend (transactional) or SendGrid
- **Background Jobs:** BullMQ + Redis (for Strava sync, email drips)
- **CDN:** Cloudflare (free tier covers everything)

### Database Schema (Current)
```
coach_profiles → coach_bots → bot_workouts
                            → coach_knowledge_documents
                            → teams → team_members → team_events

athlete_profiles → athlete_seasons → chat_messages
                 → strava_connections
                 → athlete_activities
                 → weekly_summaries
                 → race_results
                 → subscriptions
```

---

*Built with help from the OverWatch autonomous agent fleet. Ship it! 🚀*
