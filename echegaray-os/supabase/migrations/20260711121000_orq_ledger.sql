-- ============================================================================
-- ORQ — Work Fabric · FASE 1: Work Ledger (capa satélite de ejecución)
-- ============================================================================
-- El ledger de EJECUCIÓN. Separado a propósito de:
--   - detección  (backlog_autonomo)   -> se referencia por subject_type/subject_id
--   - seguimiento humano (acciones)    -> se referencia por subject_type/subject_id
-- Nada de esto se duplica: una tarea PUEDE nacer de un item de backlog y lo
-- apunta (patrón origen_tabla/origen_id ya validado en el proyecto).
--
-- Claim con FOR UPDATE SKIP LOCKED (portable, D2). Leases con visibility-timeout,
-- reintentos con backoff, dead-letter y recuperación de trabajo abandonado.
-- Cada función que cambia estado emite su evento en la MISMA transacción (outbox).
--
-- Aditiva y reversible. Rollback: orquestador/db/rollback/0001_ledger_down.sql
-- ============================================================================

-- transiciones extra que el claim de retrying necesita (aditivo sobre F0)
insert into orq.task_transitions (from_state, to_state) values ('retrying','claimed')
  on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. TABLAS
-- ---------------------------------------------------------------------------
create table orq.tasks (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references orq.tenants(id) on delete restrict,
  project_id        uuid references orq.projects(id) on delete set null,
  repository_id     uuid references orq.repositories(id) on delete set null,

  -- linaje / idempotencia (D4, principio de idempotencia)
  dedupe_key        text unique,                 -- múltiples NULL permitidos
  correlation_id    uuid not null default gen_random_uuid(),
  causation_id      uuid,
  parent_task_id    uuid references orq.tasks(id) on delete set null,

  -- origen: referencia polimórfica a lo existente (backlog_autonomo/acciones/…)
  subject_type      text,
  subject_id        uuid,

  -- intención
  type              text not null,
  title             text not null,
  goal              text,
  inputs            jsonb not null default '{}'::jsonb,
  success_criteria  text,                        -- definition of done

  -- policy / asignación
  capability_slug   text references orq.capabilities(slug),
  blast_override    text check (blast_override in ('none','low','medium','high','critical')),
  agent_slug        text,                        -- principal (agente) asignado
  engine            text,                        -- motor elegido (null = default)

  -- scheduling
  priority          int not null default 0,      -- mayor = más prioritario
  run_after         timestamptz,                 -- no ejecutar antes de
  deadline          timestamptz,

  -- workspace (Fase 2)
  worktree_path     text,
  branch            text,

  -- ciclo de vida
  state             text not null default 'received' references orq.task_states(state),
  attempt           int not null default 0,
  max_attempts      int not null default 3,

  -- lease
  locked_by         text,
  lease_expires_at  timestamptz,
  heartbeat_at      timestamptz,

  -- resultado / evidencia / costo
  result            jsonb,
  evidence          jsonb,
  cost              jsonb,
  error             text,

  created_by        uuid references orq.principals(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index tasks_claimable_idx on orq.tasks (state, priority desc, created_at)
  where state in ('ready','retrying');
create index tasks_lease_idx      on orq.tasks (state, lease_expires_at)
  where state in ('claimed','running','reviewing','compensating');
create index tasks_correlation_idx on orq.tasks (correlation_id);
create index tasks_subject_idx     on orq.tasks (subject_type, subject_id);
create index tasks_parent_idx      on orq.tasks (parent_task_id);

-- DAG de dependencias (D7)
create table orq.task_deps (
  task_id            uuid not null references orq.tasks(id) on delete cascade,
  depends_on_task_id uuid not null references orq.tasks(id) on delete cascade,
  primary key (task_id, depends_on_task_id),
  check (task_id <> depends_on_task_id)
);

-- un registro por intento de ejecución (retry-aware)
create table orq.task_attempts (
  id           uuid primary key default gen_random_uuid(),
  task_id      uuid not null references orq.tasks(id) on delete cascade,
  attempt_no   int not null,
  state        text not null default 'running'
                 check (state in ('running','succeeded','failed','timeout','cancelled')),
  worker_id    text,
  engine       text,
  session_id   text,                 -- id de sesión del motor (ej. Claude)
  exit_code    int,
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  tokens       jsonb,
  cost         jsonb,
  logs_ref     text,
  review       jsonb,
  error        text,
  unique (task_id, attempt_no)
);

create trigger tasks_touch before update on orq.tasks
  for each row execute function orq.touch_updated_at();

-- ---------------------------------------------------------------------------
-- 2. ENQUEUE (Intake) — idempotente por dedupe_key. Emite task.received.
-- ---------------------------------------------------------------------------
create or replace function orq.enqueue_task(p_task jsonb)
returns uuid
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_id     uuid;
  v_tenant uuid;
  v_dupe   text := nullif(p_task->>'dedupe_key','');
begin
  select id into v_tenant from orq.tenants where slug = coalesce(p_task->>'tenant','echegaray');

  insert into orq.tasks (
    tenant_id, project_id, repository_id, dedupe_key, causation_id, parent_task_id,
    subject_type, subject_id, type, title, goal, inputs, success_criteria,
    capability_slug, blast_override, agent_slug, engine, priority, run_after, deadline,
    state, max_attempts, created_by
  )
  select
    v_tenant,
    (select id from orq.projects   where tenant_id=v_tenant and slug=coalesce(p_task->>'project','echegaray-os')),
    (select id from orq.repositories where tenant_id=v_tenant and slug=coalesce(p_task->>'repo','echegaray-os')),
    v_dupe,
    (p_task->>'causation_id')::uuid,
    (p_task->>'parent_task_id')::uuid,
    p_task->>'subject_type',
    (p_task->>'subject_id')::uuid,
    coalesce(p_task->>'type','generic'),
    coalesce(p_task->>'title','(sin título)'),
    p_task->>'goal',
    coalesce(p_task->'inputs','{}'::jsonb),
    p_task->>'success_criteria',
    p_task->>'capability_slug',
    p_task->>'blast_override',
    p_task->>'agent_slug',
    p_task->>'engine',
    coalesce((p_task->>'priority')::int, 0),
    (p_task->>'run_after')::timestamptz,
    (p_task->>'deadline')::timestamptz,
    coalesce(p_task->>'state','ready'),
    coalesce((p_task->>'max_attempts')::int, 3),
    coalesce((p_task->>'created_by')::uuid,
             (select id from orq.principals where tenant_id=v_tenant and slug='system'))
  on conflict (dedupe_key) do nothing
  returning id into v_id;

  if v_id is null then            -- ya existía (dedupe): devolver el existente
    select id into v_id from orq.tasks where dedupe_key = v_dupe;
    return v_id;
  end if;

  perform orq.emit_event(
    v_tenant, 'task', v_id, 'task.received',
    coalesce((p_task->>'created_by')::uuid, (select id from orq.principals where tenant_id=v_tenant and slug='system')),
    (select id from orq.projects where tenant_id=v_tenant and slug=coalesce(p_task->>'project','echegaray-os')),
    (select correlation_id from orq.tasks where id=v_id),
    (p_task->>'causation_id')::uuid, null,
    jsonb_build_object('type', coalesce(p_task->>'type','generic'), 'title', coalesce(p_task->>'title','(sin título)'))
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. CLAIM — FOR UPDATE SKIP LOCKED. Toma UNA tarea elegible, crea el intento,
--    emite task.claimed. Todo atómico. Devuelve 0 o 1 fila.
-- ---------------------------------------------------------------------------
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
      where d.task_id = t.id and dt.state <> 'succeeded'
    )
  order by t.priority desc, t.created_at asc
  for update skip locked
  limit 1;

  if not found then
    return;                       -- conjunto vacío: no hay trabajo para este worker
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
    jsonb_build_object('worker_id', p_worker_id, 'attempt', v_task.attempt));

  return next v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. HEARTBEAT — extiende el lease mientras la tarea corre. Solo el dueño.
-- ---------------------------------------------------------------------------
create or replace function orq.heartbeat_task(p_task_id uuid, p_worker_id text, p_lease_seconds int)
returns boolean
language plpgsql
set search_path = orq, pg_temp
as $$
declare v_ok boolean;
begin
  update orq.tasks
     set lease_expires_at = now() + make_interval(secs => p_lease_seconds),
         heartbeat_at = now()
   where id = p_task_id and locked_by = p_worker_id
     and state in ('claimed','running','reviewing','compensating')
   returning true into v_ok;
  return coalesce(v_ok, false);
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. TRANSITION — cambio de estado validado + evento (outbox). Enforce lease
--    en estados activos. Cierra el intento y libera lease al terminar.
-- ---------------------------------------------------------------------------
create or replace function orq.transition_task(
  p_task_id   uuid,
  p_worker_id text,
  p_to_state  text,
  p_patch     jsonb default '{}'::jsonb
)
returns orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_task  orq.tasks;
  v_active_from boolean;
begin
  select * into v_task from orq.tasks where id = p_task_id for update;
  if not found then raise exception 'tarea % inexistente', p_task_id; end if;

  if not orq.transition_allowed(v_task.state, p_to_state) then
    raise exception 'transición inválida % -> % (tarea %)', v_task.state, p_to_state, p_task_id;
  end if;

  select is_active into v_active_from from orq.task_states where state = v_task.state;
  if v_active_from and p_worker_id is not null and v_task.locked_by is distinct from p_worker_id then
    raise exception 'worker % no es dueño del lease de la tarea % (dueño: %)', p_worker_id, p_task_id, v_task.locked_by;
  end if;

  update orq.tasks
     set state = p_to_state,
         worktree_path = coalesce(p_patch->>'worktree_path', worktree_path),
         branch        = coalesce(p_patch->>'branch', branch),
         result        = coalesce(p_patch->'result', result),
         evidence      = coalesce(p_patch->'evidence', evidence),
         cost          = coalesce(p_patch->'cost', cost),
         error         = coalesce(p_patch->>'error', error),
         locked_by        = case when (select is_terminal or state in ('awaiting_approval','ready','paused','retrying')
                                        from orq.task_states where state = p_to_state) then null else locked_by end,
         lease_expires_at = case when (select is_terminal or state in ('awaiting_approval','ready','paused','retrying')
                                        from orq.task_states where state = p_to_state) then null else lease_expires_at end,
         updated_at = now()
   where id = p_task_id
   returning * into v_task;

  -- cerrar el intento en éxito
  if p_to_state = 'succeeded' then
    update orq.task_attempts
       set state='succeeded', finished_at=now(), review = coalesce(p_patch->'review', review)
     where task_id = p_task_id and attempt_no = v_task.attempt and state='running';
  end if;

  perform orq.emit_event(
    v_task.tenant_id, 'task', v_task.id, 'task.' || p_to_state, null, v_task.project_id,
    v_task.correlation_id, null, v_task.blast_override,
    jsonb_build_object('worker_id', p_worker_id, 'attempt', v_task.attempt));

  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. FAIL + RESCHEDULE — reintento con backoff o dead-letter. Cierra el intento.
-- ---------------------------------------------------------------------------
create or replace function orq.fail_task(
  p_task_id    uuid,
  p_worker_id  text,
  p_error      text,
  p_backoff_ms bigint default 30000
)
returns orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_task orq.tasks;
  v_next text;
begin
  select * into v_task from orq.tasks where id = p_task_id for update;
  if not found then raise exception 'tarea % inexistente', p_task_id; end if;

  update orq.task_attempts
     set state='failed', finished_at=now(), error=p_error
   where task_id=p_task_id and attempt_no=v_task.attempt and state='running';

  -- primero a 'failed'
  update orq.tasks set state='failed', error=p_error, locked_by=null, lease_expires_at=null, updated_at=now()
   where id=p_task_id returning * into v_task;
  perform orq.emit_event(v_task.tenant_id,'task',v_task.id,'task.failed',null,v_task.project_id,
     v_task.correlation_id,null,null, jsonb_build_object('attempt',v_task.attempt,'error',p_error));

  -- decidir reintento vs dead-letter
  if v_task.attempt >= v_task.max_attempts then
    v_next := 'dead_letter';
    update orq.tasks set state='dead_letter', updated_at=now() where id=p_task_id returning * into v_task;
  else
    v_next := 'retrying';
    update orq.tasks set state='retrying', run_after = now() + make_interval(secs => (p_backoff_ms/1000.0)), updated_at=now()
     where id=p_task_id returning * into v_task;
  end if;

  perform orq.emit_event(v_task.tenant_id,'task',v_task.id,'task.'||v_next,null,v_task.project_id,
     v_task.correlation_id,null,null,
     jsonb_build_object('attempt',v_task.attempt,'max_attempts',v_task.max_attempts,
                        'run_after', v_task.run_after));
  return v_task;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. REAP — recuperación de trabajo abandonado (leases vencidos). Idempotente.
--    Corre al arrancar el supervisor y periódicamente.
-- ---------------------------------------------------------------------------
create or replace function orq.reap_expired_leases()
returns setof orq.tasks
language plpgsql
set search_path = orq, pg_temp
as $$
declare v_task orq.tasks;
begin
  for v_task in
    select * from orq.tasks
     where state in ('claimed','running','reviewing','compensating')
       and lease_expires_at is not null and lease_expires_at < now()
     for update skip locked
  loop
    update orq.task_attempts set state='timeout', finished_at=now(), error='lease expirado'
      where task_id=v_task.id and attempt_no=v_task.attempt and state='running';

    if v_task.attempt >= v_task.max_attempts then
      update orq.tasks set state='dead_letter', locked_by=null, lease_expires_at=null,
             error='lease expirado; agotó reintentos', updated_at=now()
        where id=v_task.id returning * into v_task;
    else
      update orq.tasks set state='retrying', locked_by=null, lease_expires_at=null,
             run_after=now(), updated_at=now()
        where id=v_task.id returning * into v_task;
    end if;

    perform orq.emit_event(v_task.tenant_id,'task',v_task.id,'task.lease_expired',null,v_task.project_id,
       v_task.correlation_id,null,null, jsonb_build_object('attempt',v_task.attempt,'new_state',v_task.state));
    return next v_task;
  end loop;
end;
$$;

-- grants para las tablas nuevas (mismo patrón; default privileges de F0 cubren
-- lo esencial, se explicita por robustez) + RLS
do $$
declare t text;
begin
  for t in select unnest(array['tasks','task_deps','task_attempts'])
  loop
    execute format('grant select on orq.%I to authenticated', t);
    execute format('grant select, insert, update, delete on orq.%I to service_role', t);
    execute format('alter table orq.%I enable row level security', t);
    execute format($p$create policy %1$s_read on orq.%1$I for select to authenticated using (true)$p$, t);
    execute format($p$create policy %1$s_srv  on orq.%1$I for all to service_role using (true) with check (true)$p$, t);
  end loop;
end$$;
