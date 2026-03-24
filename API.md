# Laktic API Reference

Base URL: `http://localhost:3001`

All authenticated endpoints require `Authorization: Bearer <supabase_access_token>`.

## Health

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/health` | None | Health check |

## Identity

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/me` | User | Get current user role and profile |

## Coach

| Method | Path | Auth | Body | Description |
|--------|------|------|------|-------------|
| POST | `/api/coach/profile` | User | `{ name, school_or_org? }` | Create coach profile |
| GET | `/api/coach/bot` | Coach | - | Get coach's bot with workouts and knowledge |
| POST | `/api/coach/bot` | Coach | `{ name, philosophy?, event_focus?, level_focus? }` | Create bot |
| PATCH | `/api/coach/bot` | Coach | `{ name?, philosophy?, event_focus?, level_focus?, is_published? }` | Update bot |
| POST | `/api/coach/bot/publish` | Coach | - | Publish bot (requires 5+ workouts, 1+ knowledge doc) |
| POST | `/api/coach/bot/workouts` | Coach | `{ day_of_week, title, description?, distance_miles?, pace_guideline?, ai_adjustable? }` | Upsert workout |
| DELETE | `/api/coach/bot/workouts/:day` | Coach | - | Delete workout by day |
| GET | `/api/coach/bot/knowledge` | Coach | - | List knowledge documents |
| POST | `/api/coach/bot/knowledge` | Coach | `{ title, document_type, content_text, source_file_name? }` | Create knowledge document |
| PATCH | `/api/coach/bot/knowledge/:id` | Coach | `{ title?, document_type?, content_text? }` | Update knowledge document |
| DELETE | `/api/coach/bot/knowledge/:id` | Coach | - | Delete knowledge document |

## Bots (Public Browse)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/bots` | User | List published bots (optional query: `event_focus`, `level_focus`) |
| GET | `/api/bots/:botId` | User | Get published bot detail |

## Athlete

| Method | Path | Auth | Body | Rate Limit | Description |
|--------|------|------|------|------------|-------------|
| POST | `/api/athlete/profile` | User | `{ name, weekly_volume_miles?, primary_events?, pr_mile?, pr_5k? }` | Standard | Create athlete profile |
| PATCH | `/api/athlete/profile` | Athlete | `{ name?, weekly_volume_miles?, primary_events?, pr_mile?, pr_5k? }` | Standard | Update athlete profile |
| GET | `/api/athlete/season` | Athlete | - | Standard | Get active season |
| PATCH | `/api/athlete/season/races` | Athlete | `{ races: [{ name, date, distance?, goal_time?, priority? }] }` | Standard | Update race calendar |
| POST | `/api/athlete/subscribe/:botId` | Athlete | - | AI (20/15min) | Subscribe to bot and generate plan |
| POST | `/api/athlete/season/regenerate` | Athlete | - | AI (20/15min) | Regenerate season plan |
| GET | `/api/athlete/chat` | Athlete | - | Standard | Get chat history |
| POST | `/api/athlete/chat` | Athlete | `{ message }` | AI (20/15min) | Send message to coach bot |

## Rate Limits

- **Standard**: 100 requests / 15 minutes (keyed by user ID, fallback to IP)
- **AI**: 20 requests / 15 minutes (keyed by user ID, fallback to IP)

## Error Responses

All errors return JSON: `{ "error": "message", "details"?: { ... } }`

| Status | Meaning |
|--------|---------|
| 400 | Validation failed or bad request |
| 401 | Missing or invalid auth token |
| 403 | Not authorized for this role / CORS |
| 404 | Resource not found |
| 429 | Rate limit exceeded |
| 500 | Internal server error |
