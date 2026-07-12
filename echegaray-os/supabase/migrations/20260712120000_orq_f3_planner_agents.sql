-- ============================================================================
-- FASE 3 — Planner · Agent Registry · Capability routing · Model Router
-- Aditivo y reversible. Extiende la fundación (orq.principals, orq.capabilities)
-- sin duplicarla: un agente ES un principal (kind='agent') con atributos extra,
-- y el Capability Registry (orq.capabilities) suma su dimensión de enrutamiento.
-- Rollback: orquestador/db/rollback/0002_f3_down.sql
-- ============================================================================

-- --- Agent Registry: identidad/rol/capabilities/permisos/límites (D6) --------
-- La identidad y el clearance viven en orq.principals. Acá van los atributos
-- operativos del agente (modelo por defecto, límites de costo, concurrencia).
create table if not exists orq.agents (
  id                      uuid primary key default gen_random_uuid(),
  tenant_id               uuid not null references orq.tenants(id) on delete restrict,
  principal_id            uuid not null references orq.principals(id) on delete cascade,
  slug                    text not null,
  role                    text not null,
  description             text not null,
  -- puntero a contexto portable (skill, context-pack). NO acopla el saber al agente.
  context_ref             text,
  default_engine          text not null default 'claude-cli',
  default_model           text not null default 'sonnet',
  max_cost_usd_per_task   numeric(10,4) not null default 0.75,
  max_cost_usd_per_day    numeric(10,4) not null default 10.0,
  max_concurrent          int not null default 1,
  -- allowlist de tools del engine (override); null = default del engine
  allowed_tools           text,
  disallowed_tools        text,
  enabled                 boolean not null default true,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (tenant_id, slug),
  unique (principal_id)
);

-- Qué capacidades puede EJECUTAR cada agente (además del clearance del principal).
create table if not exists orq.agent_capabilities (
  agent_id         uuid not null references orq.agents(id) on delete cascade,
  capability_slug  text not null references orq.capabilities(slug) on delete cascade,
  primary key (agent_id, capability_slug)
);

-- Dimensión de enrutamiento del Capability Registry: rol de agente por defecto
-- que atiende cada capacidad (nullable = sin ruta por defecto).
alter table orq.capabilities add column if not exists agent_role text;

-- --- Model Router: candidatos ordenados (engine+model) con techo de costo -----
-- Resolución por especificidad: capability > agent > default. priority asc = se
-- intenta primero. El siguiente candidato es el FALLBACK ante fallo/timeout.
create table if not exists orq.model_routes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references orq.tenants(id) on delete restrict,
  scope         text not null check (scope in ('capability','agent','default')),
  match_key     text not null,               -- capability_slug | agent_slug | '*'
  priority      int  not null default 100,   -- menor = se intenta antes
  engine        text not null default 'claude-cli',
  model         text not null,
  max_cost_usd  numeric(10,4) not null default 0.75,
  enabled       boolean not null default true,
  created_at    timestamptz not null default now(),
  unique (tenant_id, scope, match_key, priority)
);
create index if not exists model_routes_lookup on orq.model_routes (tenant_id, scope, match_key, priority);

-- --- triggers updated_at (reusa el helper de fundación) ----------------------
create or replace trigger agents_touch before update on orq.agents
  for each row execute function orq.touch_updated_at();

-- --- RLS + grants (mismo patrón que la fundación) ---------------------------
alter table orq.agents             enable row level security;
alter table orq.agent_capabilities enable row level security;
alter table orq.model_routes       enable row level security;

do $$
declare t text;
begin
  foreach t in array array['agents','agent_capabilities','model_routes'] loop
    execute format('create policy %I_sel on orq.%I for select to authenticated using (true)', t, t);
    execute format('create policy %I_all on orq.%I for all to service_role using (true) with check (true)', t, t);
    execute format('grant select on orq.%I to authenticated', t);
    execute format('grant all on orq.%I to service_role', t);
  end loop;
end $$;

-- ============================================================================
-- SEEDS — 6 agentes mínimos + su mapa de capacidades + rutas de modelo
-- ============================================================================
do $$
declare
  v_tenant uuid;
  v_agent  uuid;
  v_princ  uuid;
  rec record;
begin
  select id into v_tenant from orq.tenants where slug = 'echegaray';

  -- (slug, role, description, clearance, default_model, caps[])
  for rec in
    select * from (values
      ('director-planner', 'Director / Planner',
       'Descompone objetivos en un DAG de subtareas con criterios de éxito.',
       'C', 'sonnet', array['read.analyze','plan.decompose','task.create','doc.write']),
      ('software-architect','Software Architect',
       'Analiza el repo y define enfoque técnico y criterios de aceptación.',
       'C', 'sonnet', array['read.analyze','doc.write']),
      ('implementer','Implementer',
       'Implementa cambios de código en un worktree aislado y commitea local.',
       'C', 'sonnet', array['read.analyze','code.edit_worktree','git.commit_local']),
      ('reviewer-qa','Reviewer / QA',
       'Corre tests, lint y build; valida la definición de hecho.',
       'C', 'sonnet', array['read.analyze','run.tests','run.lint','run.build']),
      ('devops','DevOps',
       'Migraciones aditivas del Fabric y gestión de servicios propios.',
       'D', 'sonnet', array['read.analyze','db.migrate_additive','systemd.manage_own']),
      ('knowledge-manager','Knowledge Manager',
       'Registra aprendizaje y documentación interna reutilizable.',
       'C', 'sonnet', array['read.analyze','doc.write','knowledge.write_memory'])
    ) as t(slug, role, descr, clearance, model, caps)
  loop
    -- principal (identidad + clearance) — idempotente
    insert into orq.principals (tenant_id, kind, slug, display_name, rol, clearance)
    values (v_tenant, 'agent', 'agent:'||rec.slug, rec.role, rec.role, rec.clearance::char(1))
    on conflict (tenant_id, slug) do update set rol = excluded.rol, clearance = excluded.clearance
    returning id into v_princ;

    -- agente (atributos operativos) — idempotente
    insert into orq.agents (tenant_id, principal_id, slug, role, description, default_model)
    values (v_tenant, v_princ, rec.slug, rec.role, rec.descr, rec.model)
    on conflict (tenant_id, slug) do update
      set role = excluded.role, description = excluded.description, default_model = excluded.default_model
    returning id into v_agent;

    -- capacidades del agente
    insert into orq.agent_capabilities (agent_id, capability_slug)
    select v_agent, unnest(rec.caps)
    on conflict do nothing;
  end loop;

  -- enrutamiento por defecto de capacidades -> rol de agente
  update orq.capabilities set agent_role = 'director-planner'  where slug in ('plan.decompose','task.create');
  update orq.capabilities set agent_role = 'implementer'       where slug in ('code.edit_worktree','git.commit_local');
  update orq.capabilities set agent_role = 'reviewer-qa'       where slug in ('run.tests','run.lint','run.build');
  update orq.capabilities set agent_role = 'knowledge-manager' where slug in ('doc.write','knowledge.write_memory');
  update orq.capabilities set agent_role = 'devops'            where slug in ('db.migrate_additive','systemd.manage_own');
  update orq.capabilities set agent_role = 'software-architect' where slug = 'read.analyze';

  -- Model Router: default sonnet; ruta barata para análisis puro; fallback opus
  insert into orq.model_routes (tenant_id, scope, match_key, priority, engine, model, max_cost_usd) values
    (v_tenant, 'default',    '*',              100, 'claude-cli', 'sonnet', 0.75),
    (v_tenant, 'default',    '*',              200, 'claude-cli', 'opus',   1.50),   -- fallback
    (v_tenant, 'capability', 'read.analyze',    50, 'claude-cli', 'haiku',  0.15),
    (v_tenant, 'capability', 'read.analyze',   100, 'claude-cli', 'sonnet', 0.50),   -- fallback
    (v_tenant, 'capability', 'plan.decompose',  50, 'claude-cli', 'sonnet', 0.75),
    (v_tenant, 'capability', 'plan.decompose', 100, 'claude-cli', 'opus',   1.50)    -- fallback
  on conflict (tenant_id, scope, match_key, priority) do nothing;
end $$;
