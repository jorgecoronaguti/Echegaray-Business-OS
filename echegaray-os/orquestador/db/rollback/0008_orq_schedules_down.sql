-- Rollback de 20260715150000_orq_schedules.sql (PRP-015 Fase 4)
drop view if exists public.orq_schedules;
drop table if exists orq.schedules;
