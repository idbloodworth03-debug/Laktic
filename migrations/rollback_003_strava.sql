-- rollback_003_strava.sql — Undo Strava tables

DROP POLICY IF EXISTS "Coaches see team activities" ON athlete_activities;
DROP POLICY IF EXISTS "Athletes see own activities" ON athlete_activities;
DROP POLICY IF EXISTS "Athletes own their connections" ON strava_connections;

DROP INDEX IF EXISTS idx_strava_connections_athlete;
DROP INDEX IF EXISTS idx_activities_strava_id;
DROP INDEX IF EXISTS idx_activities_athlete_date;

DROP TABLE IF EXISTS athlete_activities;
DROP TABLE IF EXISTS strava_connections;
