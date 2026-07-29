-- Rollback PR-4.1 · lane de comunicación. Restaura el claim_task de 2 args
-- (versión anthropic_engine) y quita la columna/trigger de lane.
drop trigger if exists tasks_route_queue on orq.tasks;
drop function if exists orq.route_task_queue();
drop function if exists orq.claim_task(text, int, text);
drop index if exists orq.tasks_queue_claimable_idx;
alter table orq.tasks drop column if exists queue;

-- Re-crear claim_task(text,int) tal como lo dejó 20260714120000_orq_anthropic_engine.sql
create or replace function orq.claim_task(p_worker_id text, p_lease_seconds int)
returns setof orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_task orq.tasks;
begin
  select t.* into v_task
  from orq.tasks t
  where t.state in ('ready','retrying')
    and (t.run_after is null or t.run_after <= now())
    and not exists (
      select 1 from orq.task_deps d
      join orq.tasks dt on dt.id = d.depends_on_task_id
      join orq.task_states ts on ts.state = dt.state
      where d.task_id = t.id and not ts.is_terminal
    )
  order by t.priority desc, t.created_at asc
  for update skip locked
  limit 1;
  if not found then return; end if;
  update orq.tasks
     set state = 'claimed', locked_by = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(), attempt = attempt + 1, updated_at = now()
   where id = v_task.id returning * into v_task;
  insert into orq.task_attempts (task_id, attempt_no, state, worker_id, engine)
    values (v_task.id, v_task.attempt, 'running', p_worker_id, v_task.engine);
  perform orq.emit_event(v_task.tenant_id, 'task', v_task.id, 'task.claimed', null, v_task.project_id,
    v_task.correlation_id, null, null, jsonb_build_object('worker_id', p_worker_id, 'attempt', v_task.attempt));
  return next v_task;
end;
$$;
