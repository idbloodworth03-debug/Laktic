-- Rollback for migrations/002_teams.sql
DROP TABLE IF EXISTS team_events;
DROP TABLE IF EXISTS team_members;
DROP TABLE IF EXISTS teams;
