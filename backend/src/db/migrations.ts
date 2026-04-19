import { supabase } from './supabase';

const CREATE_FOLLOWS_TABLE = `
CREATE TABLE IF NOT EXISTS public.athlete_follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES public.athlete_profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);
CREATE INDEX IF NOT EXISTS idx_athlete_follows_follower  ON public.athlete_follows(follower_id);
CREATE INDEX IF NOT EXISTS idx_athlete_follows_following ON public.athlete_follows(following_id);
ALTER TABLE public.athlete_follows ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='athlete_follows' AND policyname='follows_select') THEN
    CREATE POLICY follows_select ON public.athlete_follows FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='athlete_follows' AND policyname='follows_insert') THEN
    CREATE POLICY follows_insert ON public.athlete_follows FOR INSERT
      WITH CHECK (follower_id IN (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='athlete_follows' AND policyname='follows_delete') THEN
    CREATE POLICY follows_delete ON public.athlete_follows FOR DELETE
      USING (follower_id IN (SELECT id FROM public.athlete_profiles WHERE user_id = auth.uid()));
  END IF;
END $$;
`;

async function tableExists(): Promise<boolean> {
  const { error } = await supabase.from('athlete_follows').select('id').limit(1);
  return !error;
}

async function tryRpc(fnName: string, sql: string): Promise<boolean> {
  try {
    const { error } = await (supabase as any).rpc(fnName, { query: sql });
    if (!error) return true;
    const { error: e2 } = await (supabase as any).rpc(fnName, { sql });
    if (!e2) return true;
    const { error: e3 } = await (supabase as any).rpc(fnName, { statement: sql });
    if (!e3) return true;
  } catch {}
  return false;
}

async function tryRestSql(sql: string): Promise<boolean> {
  try {
    const url = process.env.SUPABASE_URL!;
    const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    // Supabase exposes a SQL API via the management layer on some plans
    const res = await fetch(`${url}/rest/v1/`, {
      method: 'POST',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/sql',
        'Accept': 'application/json',
      },
      body: sql,
    });
    return res.ok;
  } catch { return false; }
}

const ADD_LAST_ACTIVE_COLUMNS = `
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
ALTER TABLE public.coach_profiles   ADD COLUMN IF NOT EXISTS last_active TIMESTAMPTZ;
`;

const ADD_BIRTHDAY_COLUMN = `
ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS birthday DATE;
`;

async function lastActiveExists(): Promise<boolean> {
  const { error } = await supabase
    .from('athlete_profiles')
    .select('last_active')
    .limit(1);
  return !error;
}

export async function applyPendingMigrations(): Promise<void> {
  // ── Migration 040: last_active columns ────────────────────────────────────
  if (!(await lastActiveExists())) {
    console.log('[migrations] last_active columns missing — attempting auto-migration…');
    let applied = false;
    for (const fn of ['exec_sql', 'exec', 'run_sql', 'execute_sql', 'pgexec']) {
      if (await tryRpc(fn, ADD_LAST_ACTIVE_COLUMNS)) {
        console.log(`[migrations] last_active columns created via rpc.${fn} ✓`);
        applied = true;
        break;
      }
    }
    if (!applied && await tryRestSql(ADD_LAST_ACTIVE_COLUMNS)) {
      console.log('[migrations] last_active columns created via REST SQL ✓');
      applied = true;
    }
    if (!applied) {
      console.warn('[migrations] ⚠️  Could not auto-add last_active columns. Run manually:\n', ADD_LAST_ACTIVE_COLUMNS);
    }
  } else {
    console.log('[migrations] last_active ✓');
  }

  // ── Migration 041: birthday column ───────────────────────────────────────
  const { error: bdErr } = await supabase.from('athlete_profiles').select('birthday').limit(1);
  if (bdErr) {
    let applied = false;
    for (const fn of ['exec_sql', 'exec', 'run_sql', 'execute_sql', 'pgexec']) {
      if (await tryRpc(fn, ADD_BIRTHDAY_COLUMN)) { applied = true; break; }
    }
    if (!applied) await tryRestSql(ADD_BIRTHDAY_COLUMN);
    console.log('[migrations] birthday column applied');
  } else {
    console.log('[migrations] birthday ✓');
  }

  // ── Migration 036: athlete_follows ────────────────────────────────────────
  if (await tableExists()) {
    console.log('[migrations] athlete_follows ✓');
    return;
  }

  console.log('[migrations] athlete_follows table missing — attempting auto-migration…');

  // Try common SQL-execution RPC function names used in Supabase projects
  for (const fn of ['exec_sql', 'exec', 'run_sql', 'execute_sql', 'pgexec']) {
    if (await tryRpc(fn, CREATE_FOLLOWS_TABLE)) {
      console.log(`[migrations] athlete_follows created via rpc.${fn} ✓`);
      return;
    }
  }

  // Try Supabase REST SQL endpoint
  if (await tryRestSql(CREATE_FOLLOWS_TABLE)) {
    console.log('[migrations] athlete_follows created via REST SQL ✓');
    return;
  }

  // Could not auto-apply — log the SQL so the developer can paste it into
  // the Supabase SQL editor (Dashboard → SQL Editor → New Query)
  console.warn('[migrations] ⚠️  Could not auto-create athlete_follows table.');
  console.warn('[migrations] Please run Migration 036 manually in the Supabase SQL editor:');
  console.warn('--- START SQL ---');
  console.warn(CREATE_FOLLOWS_TABLE);
  console.warn('--- END SQL ---');
}
