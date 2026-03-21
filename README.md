# LAKTIC — Train Smarter. Go Laktic.

AI-powered training plans built on your coach's philosophy. Coaches set up once; the bot coaches every athlete autonomously.

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| Backend | Node.js + Express + TypeScript |
| Auth + DB | Supabase (Auth + Postgres) |
| AI | OpenAI GPT-4o |
| State | Zustand (persisted) |

---

## Project Structure

```
laktic/
├── backend/
│   ├── src/
│   │   ├── db/supabase.ts         # Service role Supabase client
│   │   ├── middleware/auth.ts     # JWT auth, requireCoach, requireAthlete
│   │   ├── routes/
│   │   │   ├── identity.ts        # GET /api/me
│   │   │   ├── coach.ts           # All /api/coach/* endpoints
│   │   │   ├── bots.ts            # GET /api/bots (public directory)
│   │   │   └── athlete.ts         # All /api/athlete/* endpoints
│   │   ├── services/
│   │   │   ├── knowledgeService.ts  # Doc selection + formatting
│   │   │   ├── seasonPlanService.ts # GPT-4o plan generation
│   │   │   └── chatService.ts       # GPT-4o chat + 14-day enforcement
│   │   ├── utils/dateUtils.ts     # Week start date logic
│   │   └── index.ts               # Express app
│   ├── package.json
│   └── tsconfig.json
├── frontend/
│   ├── src/
│   │   ├── components/ui.tsx      # All shared UI components
│   │   ├── lib/
│   │   │   ├── supabaseClient.ts
│   │   │   └── api.ts             # apiFetch with auto auth header
│   │   ├── store/authStore.ts     # Zustand auth store (persisted)
│   │   ├── pages/
│   │   │   ├── AuthPages.tsx      # Landing, Register, Login
│   │   │   ├── CoachDashboard.tsx
│   │   │   ├── BotSetupEdit.tsx
│   │   │   ├── KnowledgeDocuments.tsx
│   │   │   ├── BotPages.tsx       # Browse + Bot Detail
│   │   │   ├── RaceCalendar.tsx
│   │   │   ├── SeasonPlan.tsx
│   │   │   └── Chat.tsx
│   │   ├── App.tsx                # Router + protected routes
│   │   └── main.tsx
│   ├── index.html
│   └── package.json
└── migrations.sql                 # All 7 Supabase migrations
```

---

## Setup

### 1. Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → Auth** and disable email confirmation
3. Go to **SQL Editor** and run the contents of `migrations.sql`
4. Copy your keys from **Settings → API**

### 2. OpenAI

1. Get an API key from [platform.openai.com](https://platform.openai.com)
2. The app uses `gpt-4o` for both plan generation and chat

### 3. Backend

```bash
cd backend
cp .env.example .env
# Fill in your .env values:
# SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, PORT, FRONTEND_URL

npm install
npm run dev
# → Running on http://localhost:3001
# → Test: curl http://localhost:3001/api/health
```

### 4. Frontend

```bash
cd frontend
cp .env.example .env
# Fill in your .env values:
# VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_API_BASE_URL

npm install
npm run dev
# → Running on http://localhost:5173
```

---

## Environment Variables

### backend/.env

| Variable | Source |
|---|---|
| `SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API → service_role key (**never expose to frontend**) |
| `OPENAI_API_KEY` | platform.openai.com → API Keys |
| `PORT` | `3001` |
| `FRONTEND_URL` | `http://localhost:5173` in dev |

### frontend/.env

| Variable | Source |
|---|---|
| `VITE_SUPABASE_URL` | Supabase → Settings → API → Project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase → Settings → API → anon/public key |
| `VITE_API_BASE_URL` | `http://localhost:3001` in dev |

---

## Build Order Verification

### Step 1 — Health check
```bash
curl http://localhost:3001/api/health
# → { "ok": true, "ts": "..." }
```

### Step 2 — Database
Verify all 7 tables exist in Supabase Table Editor:
- `coach_profiles`
- `athlete_profiles`
- `coach_bots`
- `bot_workouts`
- `coach_knowledge_documents`
- `athlete_seasons`
- `chat_messages`

### Step 10 — End-to-End Test Checklist

```
□ Register coach → /coach/dashboard loads
□ Create bot with name + philosophy + 7 workouts
□ Upload 2 knowledge documents (paste text)
□ Try to publish without philosophy → blocked with correct error
□ Publish valid bot → Published badge shown
□ Register athlete → add 3 races (1 goal race 10 weeks out)
□ Browse bots → subscribe → plan generated
□ Verify correct week count + taper before goal race
□ Open workout → see "Why: ..." change_reason
□ Add new race → Regenerate → past weeks unchanged
□ Chat: "I tweaked my calf" → bot modifies only next 14 days
□ Chat: "Rewrite my whole season" → bot redirects to Regenerate Plan
□ Coach cannot access /athlete/* routes → 403
□ Athlete cannot access /coach/* routes → 403
```

---

## Key Design Decisions

**Chat is limited to 14 days.** The AI can only modify workouts within the next 14 days from a chat message. Larger restructuring requires the Regenerate Plan action. This keeps AI output predictable and prevents cascading changes.

**Knowledge docs are context, not fine-tuning.** Coach documents are injected as prompt context during every plan generation and chat response. They are never used to fine-tune or retrain the model.

**Coaches never see individual athletes.** The entire architecture is async — coaches set up their bot once and never interact with athletes directly. All athlete data is private to the athlete.

**Fallback on AI failure.** If GPT-4o fails after 2 attempts, the system falls back to repeating the coach's template week-by-week. `ai_used = false` is stored in the DB.

**Week start is always Monday.** All date math runs in UTC to avoid timezone bugs. `getWeekStartDate()` finds the next Monday from any date.
