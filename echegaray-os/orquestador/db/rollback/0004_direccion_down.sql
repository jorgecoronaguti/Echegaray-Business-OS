-- Rollback de 20260712140000_orq_direccion_ia.sql (Etapa 3 — Dirección IA).
-- Aditivo/reversible. No borra datos de negocio.
drop function if exists public.orq_submit_objective(text, text, int, text);
drop view if exists public.orq_direction;
drop trigger if exists tasks_direction_assignment on orq.tasks;
drop function if exists orq.enforce_direction_assignment();
delete from orq.model_routes where scope='capability' and match_key in ('direction.plan','direction.assess');
delete from orq.agent_capabilities where agent_id in (select id from orq.agents where slug='director-general');
delete from orq.agents where slug='director-general';
delete from orq.principals where slug='agent:director-general';
delete from orq.capabilities where slug in ('direction.assess','direction.plan','direction.report');
