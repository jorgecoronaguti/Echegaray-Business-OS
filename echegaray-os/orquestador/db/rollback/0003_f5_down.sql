-- Rollback de 20260712130000_orq_f5_ui_control.sql (Fase 5). Aditivo/reversible.
-- No borra datos: sólo quita vistas, funciones y transiciones agregadas.
drop function if exists public.orq_task_action(uuid, text, text);
drop function if exists orq.human_action(uuid, text, text);
drop function if exists orq.human_transition(uuid, text, text);
drop view if exists public.orq_queue;
drop view if exists public.orq_agents;
drop view if exists public.orq_events;
drop view if exists public.orq_task_attempts;
drop view if exists public.orq_tasks;
delete from orq.task_transitions where (from_state, to_state) in (
  ('dead_letter','ready'), ('cancelled','ready'), ('failed','cancelled'),
  ('retrying','cancelled'), ('reviewing','cancelled'), ('retrying','paused'));
