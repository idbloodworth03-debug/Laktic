-- Rollback 004_progress.sql

DROP POLICY IF EXISTS "Coaches see team results" ON race_results;
DROP POLICY IF EXISTS "Athletes own results" ON race_results;
DROP POLICY IF EXISTS "Coaches see team summaries" ON weekly_summaries;
DROP POLICY IF EXISTS "Athletes see own summaries" ON weekly_summaries;

DROP INDEX IF EXISTS idx_race_results_athlete;
DROP INDEX IF EXISTS idx_weekly_summaries_athlete;

DROP TABLE IF EXISTS race_results;
DROP TABLE IF EXISTS weekly_summaries;
