-- PR-4.1 · Aislamiento de worker por COLA (lane) en el Work Fabric.
--
-- Problema (auditoría PR-4): el worker de comunicación usaba orq.claim_task, que
-- reclama CUALQUIER tarea `ready`. Riesgo: robar tareas del worker general (IA,
-- finanzas, etc.) o que el general robe tareas de comunicación.
--
-- Solución mínima y compatible, SIN rediseñar el Work Fabric ni duplicar el claim:
--   1) una columna `queue` (lane) en orq.tasks, default 'default';
--   2) un trigger que rutea las tareas `comunicacion.%` a la lane 'comunicacion'
--      de forma atómica en el INSERT (no toca enqueue_task);
--   3) UNA sola implementación de claim_task, ahora con `p_queue` (default
--      'default') que filtra la lane DENTRO del SELECT ... FOR UPDATE SKIP LOCKED.
--
-- Compatibilidad: el worker general llama claim_task($1,$2) → p_queue='default'
-- (comportamiento idéntico al previo, porque todas las tareas existentes quedan
-- en 'default'). El worker de comunicación llama claim_task($1,$2,'comunicacion')
-- y SÓLO ve su lane. Aislamiento en ambos sentidos, atómico, sin post-filtrado.
--
-- ADITIVA y AISLADA. NO se aplica a producción como parte de PR-4.1 (se aplica en
-- la ventana de la prueba controlada). Rollback en db/rollback/.

-- 1) Columna de lane + índice de reclamo por lane.
alter table orq.tasks add column if not exists queue text not null default 'default';

create index if not exists tasks_queue_claimable_idx
  on orq.tasks (queue, priority desc, created_at)
  where state in ('ready','retrying');

-- 2) Ruteo por tipo → lane, en el INSERT (determinístico, en un solo lugar).
create or replace function orq.route_task_queue()
returns trigger language plpgsql set search_path = orq, pg_temp as $$
begin
  -- Sólo rutea si el emisor no fijó una lane explícita distinta de 'default'.
  if new.queue is null or new.queue = 'default' then
    if new.type like 'comunicacion.%' then
      new.queue := 'comunicacion';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists tasks_route_queue on orq.tasks;
create trigger tasks_route_queue before insert on orq.tasks
  for each row execute function orq.route_task_queue();

-- 3) claim_task con filtro de lane. Se DROPEA la versión de 2 args para que exista
--    UNA sola implementación; las llamadas de 2 args resuelven al default 'default'.
drop function if exists orq.claim_task(text, int);

create or replace function orq.claim_task(p_worker_id text, p_lease_seconds int, p_queue text default 'default')
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
    and t.queue = p_queue                       -- ← aislamiento por lane (atómico)
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

  if not found then
    return;
  end if;

  update orq.tasks
     set state = 'claimed',
         locked_by = p_worker_id,
         lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now(),
         attempt = attempt + 1,
         updated_at = now()
   where id = v_task.id
   returning * into v_task;

  insert into orq.task_attempts (task_id, attempt_no, state, worker_id, engine)
    values (v_task.id, v_task.attempt, 'running', p_worker_id, v_task.engine);

  perform orq.emit_event(
    v_task.tenant_id, 'task', v_task.id, 'task.claimed', null, v_task.project_id,
    v_task.correlation_id, null, null,
    jsonb_build_object('worker_id', p_worker_id, 'attempt', v_task.attempt, 'queue', v_task.queue));

  return next v_task;
end;
$$;

comment on column orq.tasks.queue is 'PR-4.1: lane de worker. default = worker general; comunicacion = worker de comunicación. Aislamiento de claim.';
