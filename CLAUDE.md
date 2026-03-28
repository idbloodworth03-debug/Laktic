# Laktic — Multi-Agent Build System

## Project
AI-powered athlete coaching platform.
Coaches set up a bot once. The bot coaches every athlete autonomously.

## Stack
Frontend: React 18 + TypeScript + Vite + Tailwind + Zustand
Backend: Node.js + Express + TypeScript
Database: Supabase (PostgreSQL + Auth + RLS)
AI: OpenAI GPT-4o
Payments: Stripe (pending LLC)
GPS: Strava OAuth (pending approval)
Email: Resend
Monitoring: Sentry

## Agent Roles
When working on tasks, adopt the correct specialist role:

### backend-engineer
Owns /backend/src/ — routes, services, middleware
Never touches frontend or migrations directly

### frontend-engineer  
Owns /frontend/src/ — pages, components, stores
Never touches backend directly

### db-engineer
Owns migrations.sql and all schema changes
All new tables go through this role first

### ai-engineer
Owns seasonPlanService.ts, chatService.ts, knowledgeService.ts
The 14-day chat rule is sacred — never break it

### security-qa
Reviews all code before it merges
Runs test suites, checks auth, validates Supabase RLS

### devops
Owns .github/workflows/, Railway config, Vercel config
Handles deployment and environment variables

## Rules
1. Never push directly to master — always feature branches
2. Never commit .env files
3. Never expose SUPABASE_SERVICE_ROLE_KEY to frontend
4. Run npm run build and npm run typecheck before every PR
5. Output COMPLETED: [task] when done
6. Output BLOCKED: [reason] when stuck