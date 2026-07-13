-- ============================================================================
-- ETAPA 4 — ORGANIZACIÓN IA. Aditivo y reversible. Reutiliza TODO el Work Fabric:
-- los especialistas son agentes/principals más; su trabajo es una tarea
-- type='specialist' (análisis/preparación, Nivel C) enrutada por capacidad; el
-- Director cierra el objetivo con un nodo type='direction_consolidate' que depende
-- de todas las hojas. NO crea tablas, estados, colas, motores ni sistemas nuevos.
--
-- Organigrama (11 especialistas bajo el Director General IA):
--   CFO · Contador · Compras · Comercial · Ingeniería · Arquitecto ·
--   Ingeniero Civil · Abogado · RRHH · Software Architect · Software Developer
-- Software Architect/Developer se respaldan en los agentes de infraestructura ya
-- existentes (software-architect / implementer); el resto de los roles internos de
-- F3 (reviewer-qa, devops, director-planner, knowledge-manager) siguen activos pero
-- fuera del organigrama visible (org_title = null).
--
-- Rollback: orquestador/db/rollback/0005_organizacion_down.sql
-- ============================================================================

-- --- Membresía del organigrama (aditivo sobre orq.agents) --------------------
-- org_title = nombre visible en la Organización IA; null = rol interno oculto.
alter table orq.agents add column if not exists org_title text;
alter table orq.agents add column if not exists org_order int;

-- --- Capacidades de dominio (una por especialista de negocio) ----------------
-- Nivel C (actuar internamente: analizar/preparar/recomendar), blast low, auto.
-- El trabajo con efecto económico/fiscal/legal real sigue siendo Nivel E (queda
-- como approval_request, NO se ejecuta autónomamente).
insert into orq.capabilities
  (slug, domain, description, required_clearance, blast_radius, idempotency, agent_role) values
  ('advise.finance',      'finanzas',     'Analizar caja, cobranzas, pagos y financiamiento; recomendar (sin ejecutar).', 'C','low','idempotent','cfo'),
  ('advise.accounting',   'contabilidad', 'Analizar P&L devengado, costos y resultado; recomendar tratamiento contable.', 'C','low','idempotent','contador'),
  ('advise.procurement',  'compras',      'Evaluar proveedores, subcontratos y abastecimiento; recomendar.',              'C','low','idempotent','compras'),
  ('advise.commercial',   'comercial',    'Analizar pipeline, clientes y riesgo comercial; recomendar prioridades.',      'C','low','idempotent','comercial'),
  ('advise.engineering',  'planificacion','Analizar planificación, producción, avance y rendimientos; recomendar.',       'C','low','idempotent','ingenieria'),
  ('advise.architecture', 'arquitectura', 'Analizar calidad, especificación y solución arquitectónica; recomendar.',      'C','low','idempotent','arquitecto'),
  ('advise.civil',        'ingenieria',   'Analizar viabilidad técnica, métodos constructivos y patologías; recomendar.', 'C','low','idempotent','ingeniero-civil'),
  ('advise.legal',        'legal',        'Analizar contratos, adicionales, reclamos y riesgo legal; recomendar.',        'C','low','idempotent','abogado'),
  ('advise.hr',           'rrhh',         'Analizar régimen laboral de construcción (UOCRA/IERIC), personal; recomendar.','C','low','idempotent','rrhh')
on conflict (slug) do nothing;

-- ============================================================================
-- SEEDS — 9 especialistas de negocio (principal + agente + capacidades + rutas)
-- Cada uno apunta por context_ref a su SKILL de dominio ya existente en el repo:
-- el handler 'specialist' corre con cwd = repo, así el motor puede cargar la skill
-- nativamente (mismo mecanismo D3 que ya usa el Director). No acopla el saber al
-- agente: solo lo referencia.
-- ============================================================================
do $$
declare
  v_tenant uuid;
  v_princ  uuid;
  v_agent  uuid;
  rec record;
begin
  select id into v_tenant from orq.tenants where slug = 'echegaray';

  for rec in
    select * from (values
      ('cfo',             'CFO IA',             1, 'advise.finance',
       'Dirección financiera: comprende caja, cobranzas, pagos, obligaciones y capital de trabajo; recomienda. No ejecuta movimientos.',
       'finanzas-tesoreria-construccion'),
      ('contador',        'Contador IA',        2, 'advise.accounting',
       'Contabilidad de gestión y P&L devengado; costos, resultado e impuestos; recomienda. No presenta ni liquida.',
       'contabilidad-constructoras'),
      ('compras',         'Compras IA',         3, 'advise.procurement',
       'Compras, abastecimiento y subcontratación; evalúa proveedores y riesgo; recomienda. No adjudica.',
       'compras-abastecimiento-subcontratacion'),
      ('comercial',       'Comercial IA',       4, 'advise.commercial',
       'Comercial y pipeline; clientes, oportunidades y riesgo de concentración; recomienda. No cotiza en firme.',
       'gestion-empresarial-riesgos'),
      ('ingenieria',      'Ingeniería IA',      5, 'advise.engineering',
       'Planificación y producción; cronograma, avance, rendimientos y forecast; recomienda.',
       'planificacion-produccion'),
      ('arquitecto',      'Arquitecto IA',      6, 'advise.architecture',
       'Arquitectura y calidad de obra; especificación, tolerancias y no conformidades; recomienda.',
       'calidad-obra'),
      ('ingeniero-civil', 'Ingeniero Civil IA', 7, 'advise.civil',
       'Ingeniería civil; viabilidad técnica, métodos, materiales y patologías; recomienda.',
       'ingenieria-civil-construccion'),
      ('abogado',         'Abogado IA',         8, 'advise.legal',
       'Derecho de la construcción y contratos; adicionales, reclamos, garantías y retenciones; recomienda. No dictamina.',
       'derecho-construccion-contratos'),
      ('rrhh',            'RRHH IA',            9, 'advise.hr',
       'Régimen laboral de la construcción (UOCRA, IERIC, Fondo de Cese); personal; recomienda. No da altas/bajas.',
       'derecho-laboral-construccion')
    ) as t(slug, org_title, org_order, cap, descr, skill)
  loop
    insert into orq.principals (tenant_id, kind, slug, display_name, rol, clearance)
    values (v_tenant, 'agent', 'agent:'||rec.slug, rec.org_title, rec.org_title, 'C')
    on conflict (tenant_id, slug) do update set rol = excluded.rol, clearance = excluded.clearance
    returning id into v_princ;

    -- context_ref relativo a la RAÍZ del repo (root_path = app/), donde corre el
    -- motor: la skill vive en app/echegaray-os/.claude/skills/<skill>.
    insert into orq.agents (tenant_id, principal_id, slug, role, description, context_ref,
                            default_model, max_cost_usd_per_task, max_cost_usd_per_day,
                            max_concurrent, org_title, org_order)
    values (v_tenant, v_princ, rec.slug, rec.org_title, rec.descr,
            'echegaray-os/.claude/skills/'||rec.skill, 'sonnet', 1.00, 12.0, 1, rec.org_title, rec.org_order)
    on conflict (tenant_id, slug) do update
      set role = excluded.role, description = excluded.description, context_ref = excluded.context_ref,
          org_title = excluded.org_title, org_order = excluded.org_order
    returning id into v_agent;

    -- capacidad primaria de dominio + auxiliares de lectura/documentación
    insert into orq.agent_capabilities (agent_id, capability_slug)
    select v_agent, unnest(array[rec.cap, 'read.analyze', 'doc.write', 'knowledge.write_memory'])
    on conflict do nothing;

    -- rutas de modelo del dominio: sonnet, fallback opus
    insert into orq.model_routes (tenant_id, scope, match_key, priority, engine, model, max_cost_usd) values
      (v_tenant, 'capability', rec.cap,  50, 'claude-cli', 'sonnet', 1.00),
      (v_tenant, 'capability', rec.cap, 100, 'claude-cli', 'opus',   2.00)
    on conflict (tenant_id, scope, match_key, priority) do nothing;
  end loop;

  -- --- Membresía del organigrama para los roles ya existentes -----------------
  -- Director como raíz; Software Architect/Developer respaldados por F3.
  update orq.agents set org_title = 'Director General IA',  org_order = 0  where slug = 'director-general';
  update orq.agents set org_title = 'Software Architect IA', org_order = 10 where slug = 'software-architect';
  update orq.agents set org_title = 'Software Developer IA', org_order = 11 where slug = 'implementer';
end $$;

-- ============================================================================
-- OBSERVABILIDAD — vista por especialista (agregada de orq.tasks + task_attempts)
-- security_invoker: respeta la RLS de las tablas base. No duplica estado.
-- ============================================================================
create or replace view public.orq_org
  with (security_invoker = true) as
  with t as (
    select agent_slug,
           count(*)::int                                                   as tareas,
           count(*) filter (where state = 'succeeded')::int                as exitos,
           count(*) filter (where state = 'dead_letter')::int              as fallos,
           count(*) filter (where state in ('claimed','running','reviewing'))::int as en_curso,
           coalesce(sum((result->'cost'->>'usd')::numeric), 0)             as costo_usd,
           coalesce(sum(
             coalesce((result->'tokens'->>'input_tokens')::numeric, 0) +
             coalesce((result->'tokens'->>'output_tokens')::numeric, 0)), 0)::bigint as tokens,
           max(updated_at)                                                 as ultima_actividad
      from orq.tasks
     group by agent_slug
  ), a as (
    select tk.agent_slug,
           count(*) filter (where at.state in ('failed','timeout'))::int   as retries,
           round(avg(extract(epoch from (at.finished_at - at.started_at)))
                 filter (where at.finished_at is not null))::int           as duracion_prom_s
      from orq.task_attempts at
      join orq.tasks tk on tk.id = at.task_id
     group by tk.agent_slug
  )
  select ag.slug, ag.org_title, ag.org_order, ag.role, p.clearance,
         ag.default_model, ag.context_ref, ag.enabled,
         case when coalesce(t.en_curso, 0) > 0 then 'trabajando' else 'disponible' end as estado,
         coalesce(t.tareas, 0)   as tareas,
         coalesce(t.exitos, 0)   as exitos,
         coalesce(t.fallos, 0)   as fallos,
         coalesce(t.en_curso, 0) as en_curso,
         coalesce(a.retries, 0)  as retries,
         coalesce(t.costo_usd, 0) as costo_usd,
         coalesce(t.tokens, 0)   as tokens,
         a.duracion_prom_s,
         t.ultima_actividad
    from orq.agents ag
    join orq.principals p on p.id = ag.principal_id
    left join t on t.agent_slug = ag.slug
    left join a on a.agent_slug = ag.slug
   where ag.org_title is not null
   order by ag.org_order;

grant select on public.orq_org to authenticated;

-- ============================================================================
-- CIERRE DEL LAZO — el objetivo del Director se cierra con un nodo
-- type='direction_consolidate' que depende de todas las hojas del plan y sintetiza
-- el informe final. Se expone en una vista PROPIA (no se toca public.orq_direction,
-- de la que depende el RPC orq_submit_objective): la migración es 100% aditiva.
-- La UI une objetivo↔cierre por objective_id.
-- ============================================================================
create or replace view public.orq_objective_closure
  with (security_invoker = true) as
  select c.parent_task_id as objective_id,
         c.id             as consolidation_task_id,
         c.state          as closure_state,
         c.result         as closure,
         c.updated_at     as closed_at
    from orq.tasks c
   where c.type = 'direction_consolidate' and c.parent_task_id is not null;

grant select on public.orq_objective_closure to authenticated;
