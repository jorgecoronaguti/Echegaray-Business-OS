-- Rollback de 20260711121000_orq_ledger.sql (Fase 1). Aditivo/reversible.
-- No borra datos de negocio de public. Deja intacta la fundación F0.
drop function if exists orq.reap_expired_leases();
drop function if exists orq.fail_task(uuid,text,text,bigint);
drop function if exists orq.transition_task(uuid,text,text,jsonb);
drop function if exists orq.heartbeat_task(uuid,text,int);
drop function if exists orq.claim_task(text,int);
drop function if exists orq.enqueue_task(jsonb);
drop table if exists orq.task_attempts cascade;
drop table if exists orq.task_deps cascade;
drop table if exists orq.tasks cascade;
delete from orq.task_transitions where from_state='retrying' and to_state='claimed';
