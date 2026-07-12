-- ============================================================================
-- ETAPA 3 — DIRECCIÓN IA. Aditivo y reversible. Reutiliza todo el Work Fabric:
-- el Director es un agente/principal más; su "pensar" es una tarea type='direction';
-- sus planes son DAGs de tareas para especialistas (Planner/router ya existentes).
-- Invariante arquitectónico (a nivel DB): SOLO el Director asigna trabajo a
-- especialistas; los especialistas nunca se coordinan directamente entre sí.
-- Rollback: orquestador/db/rollback/0004_direccion_down.sql
-- ============================================================================

-- --- Capacidades de dirección (enrutan al Director) --------------------------
insert into orq.capabilities
  (slug, domain, description, required_clearance, blast_radius, idempotency, agent_role) values
  ('direction.assess',   'direction', 'Comprender el estado integral de la empresa y el sistema.', 'B','none','idempotent','director-general'),
  ('direction.plan',     'direction', 'Priorizar y descomponer objetivos en un DAG para especialistas.', 'C','low','dedup_key','director-general'),
  ('direction.report',   'direction', 'Emitir informe ejecutivo, recomendaciones y solicitudes de aprobación.', 'B','low','idempotent','director-general')
on conflict (slug) do nothing;

-- --- Registro del Director General IA (principal + agente) -------------------
do $$
declare v_tenant uuid; v_princ uuid; v_agent uuid;
begin
  select id into v_tenant from orq.tenants where slug='echegaray';

  insert into orq.principals (tenant_id, kind, slug, display_name, rol, clearance)
  values (v_tenant, 'agent', 'agent:director-general', 'Director General IA', 'Director General IA', 'D')
  on conflict (tenant_id, slug) do update set rol=excluded.rol, clearance=excluded.clearance
  returning id into v_princ;

  insert into orq.agents (tenant_id, principal_id, slug, role, description, default_model,
                          max_cost_usd_per_task, max_cost_usd_per_day, max_concurrent)
  values (v_tenant, v_princ, 'director-general', 'Director General IA',
          'Dirige el trabajo de la organización digital: comprende estado, prioriza, planifica, descompone, asigna a especialistas, controla y reporta. No ejecuta acciones de aprobación humana.',
          'sonnet', 1.50, 20.0, 1)
  on conflict (tenant_id, slug) do update set role=excluded.role, description=excluded.description
  returning id into v_agent;

  insert into orq.agent_capabilities (agent_id, capability_slug)
  select v_agent, unnest(array['read.analyze','plan.decompose','task.create',
                               'direction.assess','direction.plan','direction.report','doc.write'])
  on conflict do nothing;

  -- rutas de modelo para el ciclo de dirección (sonnet, fallback opus)
  insert into orq.model_routes (tenant_id, scope, match_key, priority, engine, model, max_cost_usd) values
    (v_tenant, 'capability', 'direction.plan',   50, 'claude-cli', 'sonnet', 1.50),
    (v_tenant, 'capability', 'direction.plan',  100, 'claude-cli', 'opus',   3.00),
    (v_tenant, 'capability', 'direction.assess', 50, 'claude-cli', 'sonnet', 1.00)
  on conflict (tenant_id, scope, match_key, priority) do nothing;
end $$;

-- --- INVARIANTE DE COORDINACIÓN (D5) ----------------------------------------
-- Una tarea asignada a un ESPECIALISTA (agente != director-general) sólo puede
-- ser creada por el Director, el sistema o un humano. Si el creador es otro
-- agente especialista, se bloquea: la coordinación pasa siempre por Dirección IA.
create or replace function orq.enforce_direction_assignment()
returns trigger
language plpgsql
set search_path = orq, pg_temp
as $$
declare v_kind text; v_slug text; v_is_specialist boolean;
begin
  if NEW.agent_slug is null then return NEW; end if;
  select exists(select 1 from orq.agents a where a.slug = NEW.agent_slug and a.slug <> 'director-general')
    into v_is_specialist;
  if not v_is_specialist then return NEW; end if;

  if NEW.created_by is not null then
    select p.kind, p.slug into v_kind, v_slug from orq.principals p where p.id = NEW.created_by;
    if v_kind = 'agent' and v_slug <> 'agent:director-general' then
      raise exception 'coordinación prohibida: el especialista % no puede asignar trabajo a especialistas; debe pasar por Dirección IA (%->%)',
        v_slug, coalesce(NEW.created_by::text,'?'), NEW.agent_slug;
    end if;
  end if;
  return NEW;
end;
$$;

create or replace trigger tasks_direction_assignment
  before insert on orq.tasks
  for each row execute function orq.enforce_direction_assignment();

-- --- Vista de Dirección para la UI (objetivos + progreso del plan) -----------
create or replace view public.orq_direction
  with (security_invoker = true) as
  select t.id, t.title, t.goal, t.state, t.priority, t.engine,
         t.result, t.evidence, t.error, t.created_at, t.updated_at,
         (select count(*) from orq.tasks c where c.parent_task_id = t.id)::int as subtasks,
         (select count(*) from orq.tasks c where c.parent_task_id = t.id and c.state = 'succeeded')::int as subtasks_done,
         (select count(*) from orq.tasks c where c.parent_task_id = t.id and c.state in ('dead_letter','failed'))::int as subtasks_failed
    from orq.tasks t
   where t.type = 'direction';

grant select on public.orq_direction to authenticated;

-- --- RPC: cargar un objetivo de Dirección (autenticado) ---------------------
-- Crea una tarea type='direction' que el Director procesará (asignada a él mismo).
create or replace function public.orq_submit_objective(
  p_title text, p_goal text, p_priority int default 0, p_engine text default 'claude-cli'
)
returns public.orq_direction
language plpgsql
security definer
set search_path = public, orq, pg_temp
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'no autorizado'; end if;
  if coalesce(trim(p_goal),'') = '' then raise exception 'el objetivo no puede estar vacío'; end if;
  v_id := orq.enqueue_task(jsonb_build_object(
    'type','direction', 'title', p_title, 'goal', p_goal, 'priority', p_priority,
    'engine', p_engine, 'capability_slug','direction.plan', 'agent_slug','director-general'
  ));
  return (select d from public.orq_direction d where d.id = v_id);
end;
$$;

revoke all on function public.orq_submit_objective(text, text, int, text) from public;
grant execute on function public.orq_submit_objective(text, text, int, text) to authenticated;
