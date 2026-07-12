-- ============================================================================
-- FASE 5 — Observabilidad + Control Humano en la interfaz existente
-- Aditivo y reversible. La app (PostgREST) solo ve el schema `public`; en vez de
-- exponer `orq` a la API, publicamos VISTAS read-only en `public` (security
-- invoker: respetan la RLS de las tablas base) y FUNCIONES de control humano
-- (SECURITY DEFINER, sólo para usuarios autenticados). No duplica estado: las
-- vistas leen orq; las funciones transicionan orq validando contra el propio
-- state machine (orq.task_transitions).
-- Rollback: orquestador/db/rollback/0003_f5_down.sql
-- ============================================================================

-- --- Vistas read-only expuestas a la app -----------------------------------
create or replace view public.orq_tasks
  with (security_invoker = true) as
  select t.id, t.tenant_id, t.project_id, t.type, t.title, t.state, t.priority,
         t.attempt, t.max_attempts, t.capability_slug, t.agent_slug, t.engine,
         t.parent_task_id, t.correlation_id, t.locked_by, t.lease_expires_at,
         t.run_after, t.deadline, t.error, t.result, t.evidence, t.cost,
         t.created_at, t.updated_at
    from orq.tasks t;

create or replace view public.orq_task_attempts
  with (security_invoker = true) as
  select a.id, a.task_id, a.attempt_no, a.state, a.worker_id, a.engine,
         a.session_id, a.exit_code, a.cost, a.review, a.error,
         a.started_at, a.finished_at
    from orq.task_attempts a;

create or replace view public.orq_events
  with (security_invoker = true) as
  select e.id, e.tenant_id, e.subject_type, e.subject_id, e.type, e.actor_id,
         e.correlation_id, e.causation_id, e.blast_radius, e.payload, e.created_at
    from orq.events e;

create or replace view public.orq_agents
  with (security_invoker = true) as
  select ag.slug, ag.role, p.clearance, ag.default_model, ag.max_cost_usd_per_task,
         ag.max_concurrent, ag.enabled
    from orq.agents ag join orq.principals p on p.id = ag.principal_id;

-- vista agregada de la cola por estado (para el panel)
create or replace view public.orq_queue
  with (security_invoker = true) as
  select s.state, s.is_terminal, s.is_active, coalesce(c.n, 0)::int as n
    from orq.task_states s
    left join (select state, count(*) n from orq.tasks group by state) c on c.state = s.state;

grant select on public.orq_tasks, public.orq_task_attempts, public.orq_events,
                public.orq_agents, public.orq_queue to authenticated;

-- --- Transiciones adicionales para control humano (aditivo) ------------------
insert into orq.task_transitions (from_state, to_state) values
  ('dead_letter','ready'),      -- reintento manual de una tarea muerta
  ('cancelled','ready'),        -- reactivar una cancelada
  ('failed','cancelled'),
  ('retrying','cancelled'),
  ('reviewing','cancelled'),
  ('retrying','paused')
on conflict do nothing;

-- --- Transición por acción humana (sin lease; valida contra el state machine) -
create or replace function orq.human_transition(p_task_id uuid, p_to_state text, p_note text)
returns orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare v_task orq.tasks;
begin
  select * into v_task from orq.tasks where id = p_task_id for update;
  if not found then raise exception 'tarea % inexistente', p_task_id; end if;

  if not exists (select 1 from orq.task_transitions
                  where from_state = v_task.state and to_state = p_to_state) then
    raise exception 'transición no permitida: % -> %', v_task.state, p_to_state;
  end if;

  update orq.tasks
     set state = p_to_state,
         -- al salir de un estado activo o al reactivar, se libera el lease
         locked_by = case when p_to_state in ('ready','paused','cancelled','rejected') then null else locked_by end,
         lease_expires_at = case when p_to_state in ('ready','paused','cancelled','rejected') then null else lease_expires_at end,
         -- reintento manual: garantizar cupo de intentos
         max_attempts = case when p_to_state = 'ready' and v_task.state in ('dead_letter','cancelled')
                             then greatest(max_attempts, attempt + 1) else max_attempts end,
         updated_at = now()
   where id = p_task_id
   returning * into v_task;

  perform orq.emit_event(v_task.tenant_id, 'task', v_task.id, 'task.human.'||p_to_state,
    null, v_task.project_id, v_task.correlation_id, null, null,
    jsonb_build_object('to_state', p_to_state, 'note', p_note));
  return v_task;
end;
$$;

-- Mapea una acción humana a su estado destino y transiciona.
create or replace function orq.human_action(p_task_id uuid, p_action text, p_note text default null)
returns orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare v_to text;
begin
  v_to := case p_action
    when 'retry'   then 'ready'
    when 'cancel'  then 'cancelled'
    when 'pause'   then 'paused'
    when 'resume'  then 'ready'
    when 'approve' then 'approved'
    when 'reject'  then 'rejected'
    else null end;
  if v_to is null then raise exception 'acción humana desconocida: %', p_action; end if;
  return orq.human_transition(p_task_id, v_to, p_note);
end;
$$;

-- --- Wrapper público para la app (autenticado). No expone orq a la API. -------
create or replace function public.orq_task_action(p_task_id uuid, p_action text, p_note text default null)
returns public.orq_tasks
language plpgsql
security definer
set search_path = public, orq, pg_temp
as $$
declare v_task orq.tasks;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  v_task := orq.human_action(p_task_id, p_action, p_note);
  return (select t from public.orq_tasks t where t.id = v_task.id);
end;
$$;

revoke all on function public.orq_task_action(uuid, text, text) from public;
grant execute on function public.orq_task_action(uuid, text, text) to authenticated;
