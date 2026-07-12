-- Rollback de 20260712120000_orq_f3_planner_agents.sql (Fase 3). Aditivo/reversible.
-- No borra datos de negocio de public. Deja intactas F0 y F1.
drop table if exists orq.model_routes cascade;
drop table if exists orq.agent_capabilities cascade;
drop table if exists orq.agents cascade;
alter table orq.capabilities drop column if exists agent_role;
delete from orq.principals where kind='agent' and slug like 'agent:%';
