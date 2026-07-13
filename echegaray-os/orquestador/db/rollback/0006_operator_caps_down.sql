-- Rollback de 20260715120000_orq_operator_capabilities.sql (PRP-014 F3)
drop function if exists public.orq_operation_action(uuid, text, text);
drop view if exists public.orq_pending_operations;
drop table if exists orq.pending_operations cascade;
delete from orq.capabilities
 where slug in ('drive.read','drive.draft','doc.create','mail.draft','drive.write','mail.send','drive.delete');
