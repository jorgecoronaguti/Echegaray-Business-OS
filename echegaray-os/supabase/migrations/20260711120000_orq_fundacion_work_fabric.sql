-- ============================================================================
-- ORQ — Work Fabric · FASE 0: Seguridad y Fundación
-- ============================================================================
-- Capa satélite de ejecución del núcleo autónomo de Echegaray Business OS.
--
-- Principios (decisiones ratificadas D1..D7):
--   D1  Estado + eventos en el MISMO Postgres, Transactional Outbox.
--   D2  Solo Postgres portable. Nada propietario de Supabase en el núcleo.
--   D4  tenant / project / repository / principal / correlation_id /
--       causation_id reservados desde el día 1 (un solo tenant hoy).
--   D5  Los agentes NO escriben dominio con service_role de backdoor: pasan por
--       Policy Engine + capacidades tipadas. Esta capa gobierna esa decisión.
--   D6  Cada agente/persona/sistema es un principal con identidad y clearance.
--   D7  Coordinación por estado durable + eventos; nada en memoria de proceso.
--
-- TODO en schema `orq`: NO toca ninguna tabla de `public`. Referencia lo
-- existente (perfiles, backlog_autonomo, acciones, ...) por (subject_type,
-- subject_id) — mismo patrón polimórfico origen_tabla/origen_id ya validado.
--
-- Es 100% aditivo y reversible. Rollback: orquestador/db/rollback/0000_down.sql
-- ============================================================================

create schema if not exists orq;

comment on schema orq is
  'Work Fabric: núcleo autónomo del Business OS. Capa satélite de ejecución; '
  'no reemplaza detección (backlog_autonomo) ni seguimiento humano (acciones).';

-- --- helper de timestamp propio del schema (no depende de public.set_updated_at,
--     para que orq sea portable/auto-contenido — D2) --------------------------
create or replace function orq.touch_updated_at()
returns trigger
language plpgsql
set search_path = orq, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- comparador de clearance A..F (A el más bajo, F el más alto) ----------------
create or replace function orq.clearance_rank(p_level char)
returns int
language sql
immutable
set search_path = orq, pg_temp
as $$
  select position(p_level in 'ABCDEF');
$$;

-- ============================================================================
-- 1. IDENTIDAD Y EJES RESERVADOS (D4)
-- ============================================================================

create table orq.tenants (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  nombre      text not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table orq.projects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references orq.tenants(id) on delete restrict,
  slug        text not null,
  nombre      text not null,
  -- 'software' = repos de código; 'negocio' = procesos de la constructora
  kind        text not null check (kind in ('software', 'negocio')),
  activo      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (tenant_id, slug)
);

create table orq.repositories (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references orq.tenants(id) on delete restrict,
  project_id      uuid not null references orq.projects(id) on delete cascade,
  slug            text not null,
  -- raíz REAL del working tree de git (ojo: acá el root git es app/, no app/echegaray-os/)
  root_path       text not null,
  default_branch  text not null default 'main',
  remote          text,
  activo          boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- Principals: humanos, agentes y sistema. clearance = máxima autonomía (A..F)
-- que este principal puede ejercer. (D6)
create table orq.principals (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references orq.tenants(id) on delete restrict,
  kind          text not null check (kind in ('human', 'agent', 'system')),
  slug          text not null,
  display_name  text not null,
  -- link suave (sin FK dura) al perfil real de public.perfiles cuando kind='human'
  perfil_id     uuid,
  rol           text,
  clearance     char(1) not null default 'A' check (clearance in ('A','B','C','D','E','F')),
  activo        boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (tenant_id, slug)
);

-- ============================================================================
-- 2. AUTONOMÍA (A..F) Y BLAST RADIUS  — vocabulario canónico (D5)
-- ============================================================================

create table orq.autonomy_levels (
  level                char(1) primary key check (level in ('A','B','C','D','E','F')),
  label                text not null,
  description          text not null,
  -- disposición por defecto de la Policy para este nivel
  default_disposition  text not null check (default_disposition in ('auto','requires_approval','forbidden'))
);

insert into orq.autonomy_levels (level, label, description, default_disposition) values
  ('A','leer/analizar',        'Lectura y análisis. Sin efecto.',                                  'auto'),
  ('B','preparar/planificar',  'Planificar, documentar, recomendar. Sin efecto externo.',          'auto'),
  ('C','actuar internamente',  'Código en worktree, tests, lint, build, commit local, crear tareas.','auto'),
  ('D','efecto interno estado','Migraciones aditivas/reversibles del Fabric, systemd propio.',       'auto'),
  ('E','efecto externo revers.','Push, PR, merge, deploy, comms externas, escritura de dominio real.','requires_approval'),
  ('F','irreversible/crítico', 'Pagos, transferencias, secretos, acciones legales/fiscales.',        'forbidden');

-- ============================================================================
-- 3. CAPACIDADES TIPADAS (C3)  — qué puede hacerse y con qué riesgo
-- ============================================================================

create table orq.capabilities (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text not null unique,
  domain                text not null,
  description           text not null,
  required_clearance    char(1) not null check (required_clearance in ('A','B','C','D','E','F')),
  blast_radius          text not null check (blast_radius in ('none','low','medium','high','critical')),
  idempotency           text not null default 'idempotent'
                          check (idempotency in ('idempotent','dedup_key','side_effecting','compensable')),
  -- override opcional de la disposición del nivel (null = usa autonomy_levels)
  disposition_override  text check (disposition_override in ('auto','requires_approval','forbidden')),
  input_schema          jsonb,
  output_schema         jsonb,
  rate_limit_per_min    int,
  secret_scope          text,
  enabled               boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Set fundacional de capacidades = codifica la POLÍTICA INICIAL DE AUTONOMÍA
-- ratificada, como DATOS (no como código disperso).
insert into orq.capabilities
  (slug, domain, description, required_clearance, blast_radius, idempotency, disposition_override) values
  -- AUTOMÁTICO
  ('read.analyze',        'core',      'Leer y analizar datos/documentos/código.',            'A','none','idempotent',    null),
  ('plan.decompose',      'planning',  'Descomponer un objetivo en subtareas (DAG).',         'B','none','idempotent',    null),
  ('doc.write',           'knowledge', 'Escribir documentación interna.',                     'B','low','idempotent',     null),
  ('task.create',         'core',      'Crear tareas hijas en el ledger.',                    'C','low','dedup_key',      null),
  ('code.edit_worktree',  'software',  'Crear/modificar código en un worktree aislado.',      'C','low','idempotent',     null),
  ('run.tests',           'software',  'Ejecutar tests (playwright/unit).',                   'C','low','idempotent',     null),
  ('run.lint',            'software',  'Ejecutar linter.',                                    'C','low','idempotent',     null),
  ('run.build',           'software',  'Ejecutar build local.',                               'C','low','idempotent',     null),
  ('git.commit_local',    'software',  'Commit local en branch aislada. Nunca push.',         'C','low','side_effecting', null),
  ('knowledge.write_memory','knowledge','Escribir memoria/aprendizaje preliminar (.claude/memory).','C','medium','idempotent', null),
  ('db.migrate_additive', 'devops',    'Aplicar migración aditiva/reversible del Fabric.',    'D','medium','side_effecting', null),
  ('systemd.manage_own',  'devops',    'Instalar/reiniciar servicios systemd propios del orquestador.','D','medium','side_effecting', null),
  -- REQUIERE APROBACIÓN (E)
  ('git.push',            'software',  'Push a un remoto.',                                   'E','high','side_effecting', 'requires_approval'),
  ('git.open_pr',         'software',  'Abrir Pull Request.',                                 'E','high','side_effecting', 'requires_approval'),
  ('deploy.production',   'devops',    'Deploy productivo (con rollback).',                   'E','high','compensable',    'requires_approval'),
  ('secret.write',        'devops',    'Modificar secretos.',                                 'E','high','side_effecting', 'requires_approval'),
  ('domain.write_economic','business', 'Escribir datos económicos/fiscales/laborales/legales reales.','E','high','side_effecting','requires_approval'),
  ('external.comms',      'business',  'Enviar comunicación externa (email/WhatsApp/etc).',   'E','high','side_effecting', 'requires_approval'),
  ('policy.raise_limits', 'core',      'Aumentar límites de gasto o concurrencia.',           'E','high','side_effecting', 'requires_approval'),
  -- PROHIBIDO (F)
  ('finance.payment',     'business',  'Pagos, transferencias, movimientos bancarios.',       'F','critical','side_effecting','forbidden'),
  ('data.hard_delete',    'core',      'Eliminación irreversible de información.',            'F','critical','side_effecting','forbidden'),
  ('legal.act',           'business',  'Acciones legales o fiscales automáticas.',            'F','critical','side_effecting','forbidden'),
  ('identity.impersonate','business',  'Comunicarse haciéndose pasar por una persona.',       'F','critical','side_effecting','forbidden');

-- Policy Engine (C5): decisión PURA. Dada una capacidad, un principal y un
-- blast-override opcional -> 'auto' | 'requires_approval' | 'forbidden'.
create or replace function orq.policy_decide(
  p_capability_slug text,
  p_principal_id    uuid,
  p_blast_override  text default null
)
returns text
language plpgsql
stable
set search_path = orq, pg_temp
as $$
declare
  cap            orq.capabilities%rowtype;
  prin           orq.principals%rowtype;
  lvl_dispo      text;
  base_dispo     text;
  eff_blast      text;
begin
  select * into cap from orq.capabilities where slug = p_capability_slug;
  if not found then
    return 'forbidden';               -- capacidad desconocida => denegar
  end if;
  if not cap.enabled then
    return 'forbidden';
  end if;

  select * into prin from orq.principals where id = p_principal_id;
  if not found or not prin.activo then
    return 'forbidden';
  end if;

  select default_disposition into lvl_dispo
    from orq.autonomy_levels where level = cap.required_clearance;

  base_dispo := coalesce(cap.disposition_override, lvl_dispo);
  eff_blast  := coalesce(p_blast_override, cap.blast_radius);

  -- Prohibido nunca se relaja.
  if base_dispo = 'forbidden' then
    return 'forbidden';
  end if;

  -- Clearance insuficiente => escala a aprobación (nunca auto).
  if orq.clearance_rank(cap.required_clearance) > orq.clearance_rank(prin.clearance) then
    return 'requires_approval';
  end if;

  -- Blast radius crítico nunca es auto.
  if eff_blast = 'critical' then
    return 'requires_approval';
  end if;

  return base_dispo;
end;
$$;

-- ============================================================================
-- 4. MÁQUINA DE ESTADOS (referencia) — consumida por el ledger de Fase 1
-- ============================================================================

create table orq.task_states (
  state       text primary key,
  is_terminal boolean not null default false,
  is_active   boolean not null default false,   -- ocupa un slot de concurrencia
  description text not null
);

insert into orq.task_states (state, is_terminal, is_active, description) values
  ('received',         false, false, 'Admitida por Intake, sin planificar.'),
  ('planned',          false, false, 'Con plan/DAG resuelto.'),
  ('ready',            false, false, 'Sin dependencias pendientes; encolable.'),
  ('claimed',          false, true,  'Tomada por un worker (lease activo).'),
  ('running',          false, true,  'En ejecución por un runner.'),
  ('reviewing',        false, true,  'En revisión (quality gate).'),
  ('awaiting_approval',false, false, 'Esperando decisión humana (Policy=E).'),
  ('approved',         false, false, 'Aprobada; lista para aplicar efecto.'),
  ('succeeded',        true,  false, 'Completada con éxito.'),
  ('failed',           false, false, 'Falló un intento; evaluará reintento.'),
  ('retrying',         false, false, 'Programada para reintento con backoff.'),
  ('dead_letter',      true,  false, 'Agotó reintentos; requiere intervención.'),
  ('cancelled',        true,  false, 'Cancelada por humano o política.'),
  ('paused',           false, false, 'Pausada por humano.'),
  ('compensating',     false, true,  'Ejecutando compensación (saga).'),
  ('rejected',         true,  false, 'Rechazada en aprobación humana.');

create table orq.task_transitions (
  from_state  text not null references orq.task_states(state),
  to_state    text not null references orq.task_states(state),
  primary key (from_state, to_state)
);

insert into orq.task_transitions (from_state, to_state) values
  ('received','planned'), ('received','ready'), ('received','cancelled'),
  ('planned','ready'), ('planned','cancelled'),
  ('ready','claimed'), ('ready','paused'), ('ready','cancelled'),
  ('claimed','running'), ('claimed','ready'), ('claimed','cancelled'),
  ('running','reviewing'), ('running','failed'), ('running','awaiting_approval'),
    ('running','cancelled'), ('running','ready'),
  ('reviewing','succeeded'), ('reviewing','awaiting_approval'), ('reviewing','failed'),
  ('awaiting_approval','approved'), ('awaiting_approval','rejected'),
    ('awaiting_approval','cancelled'), ('awaiting_approval','paused'),
  ('approved','ready'), ('approved','running'), ('approved','succeeded'),
  ('failed','retrying'), ('failed','dead_letter'),
  ('retrying','ready'),
  ('paused','ready'), ('paused','cancelled'),
  ('compensating','failed'), ('compensating','succeeded'),
  ('succeeded','compensating');   -- compensación de una tarea ya completada (saga)

-- valida si una transición está permitida (usada por el ledger en Fase 1)
create or replace function orq.transition_allowed(p_from text, p_to text)
returns boolean
language sql
stable
set search_path = orq, pg_temp
as $$
  select exists (
    select 1 from orq.task_transitions where from_state = p_from and to_state = p_to
  );
$$;

-- ============================================================================
-- 5. EVENT LOG / OUTBOX (C2, D1) — append-only, polimórfico (origen_tabla/id)
-- ============================================================================

create table orq.events (
  id             bigint generated always as identity primary key,
  tenant_id      uuid not null references orq.tenants(id) on delete restrict,
  project_id     uuid references orq.projects(id) on delete set null,
  -- referencia polimórfica al sujeto (task, backlog_autonomo, acciones, ...)
  subject_type   text not null,
  subject_id     uuid,
  type           text not null,
  actor_id       uuid references orq.principals(id) on delete set null,
  correlation_id uuid,
  causation_id   uuid,
  blast_radius   text check (blast_radius in ('none','low','medium','high','critical')),
  payload        jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index events_correlation_idx on orq.events (correlation_id, id);
create index events_subject_idx      on orq.events (subject_type, subject_id, id);
create index events_type_idx         on orq.events (type, id);
create index events_unconsumed_idx   on orq.events (id);

-- Append-only: prohibir update/delete a nivel de trigger (defensa en profundidad).
create or replace function orq.events_immutable()
returns trigger
language plpgsql
set search_path = orq, pg_temp
as $$
begin
  raise exception 'orq.events es append-only (intento de % denegado)', tg_op;
end;
$$;

create trigger events_no_update before update on orq.events
  for each row execute function orq.events_immutable();
create trigger events_no_delete before delete on orq.events
  for each row execute function orq.events_immutable();

-- Emisor de eventos. Los productores de estado (Fase 1) lo invocan DENTRO de la
-- misma transacción que el cambio de estado => Transactional Outbox (D1).
create or replace function orq.emit_event(
  p_tenant_id      uuid,
  p_subject_type   text,
  p_subject_id     uuid,
  p_type           text,
  p_actor_id       uuid    default null,
  p_project_id     uuid    default null,
  p_correlation_id uuid    default null,
  p_causation_id   uuid    default null,
  p_blast_radius   text    default null,
  p_payload        jsonb   default '{}'::jsonb
)
returns bigint
language plpgsql
set search_path = orq, pg_temp
as $$
declare
  v_id bigint;
begin
  insert into orq.events (
    tenant_id, project_id, subject_type, subject_id, type, actor_id,
    correlation_id, causation_id, blast_radius, payload
  ) values (
    p_tenant_id, p_project_id, p_subject_type, p_subject_id, p_type, p_actor_id,
    coalesce(p_correlation_id, p_subject_id), p_causation_id, p_blast_radius, coalesce(p_payload,'{}'::jsonb)
  ) returning id into v_id;
  return v_id;
end;
$$;

-- ============================================================================
-- 6. TRIGGERS updated_at
-- ============================================================================
create trigger tenants_touch      before update on orq.tenants      for each row execute function orq.touch_updated_at();
create trigger projects_touch     before update on orq.projects     for each row execute function orq.touch_updated_at();
create trigger repositories_touch before update on orq.repositories for each row execute function orq.touch_updated_at();
create trigger principals_touch   before update on orq.principals   for each row execute function orq.touch_updated_at();
create trigger capabilities_touch before update on orq.capabilities for each row execute function orq.touch_updated_at();

-- ============================================================================
-- 7. SEEDS DE FUNDACIÓN (un solo tenant / repo hoy; ejes reservados — D4)
-- ============================================================================
insert into orq.tenants (slug, nombre) values ('echegaray', 'Echegaray Construcciones');

insert into orq.projects (tenant_id, slug, nombre, kind)
  select id, 'echegaray-os', 'Echegaray Business OS', 'software' from orq.tenants where slug='echegaray';

insert into orq.repositories (tenant_id, project_id, slug, root_path, default_branch, remote)
  select t.id, p.id, 'echegaray-os', '/home/jorge/echegaray-os/app', 'main', 'origin'
  from orq.tenants t join orq.projects p on p.tenant_id=t.id
  where t.slug='echegaray' and p.slug='echegaray-os';

-- principal 'system' (actor de detecciones automáticas y del propio Fabric).
insert into orq.principals (tenant_id, kind, slug, display_name, clearance)
  select id, 'system', 'system', 'Sistema (Work Fabric)', 'D' from orq.tenants where slug='echegaray';

-- ============================================================================
-- 8. RLS + GRANTS  (patrón del proyecto: authenticated lee, service_role opera)
--    El worker se conecta por Postgres directo (bypassa RLS). La UI (Fase 5)
--    leerá vía service_role/vistas. GRANT explícito: sin él Postgres deniega
--    antes de evaluar la policy (bug ya documentado en el proyecto).
-- ============================================================================
grant usage on schema orq to authenticated, service_role;
grant select on all tables in schema orq to authenticated;
grant select, insert, update, delete on all tables in schema orq to service_role;
grant usage, select on all sequences in schema orq to service_role;
grant execute on all functions in schema orq to authenticated, service_role;
alter default privileges in schema orq grant select on tables to authenticated;
alter default privileges in schema orq grant select, insert, update, delete on tables to service_role;

do $$
declare t text;
begin
  for t in
    select tablename from pg_tables where schemaname='orq'
  loop
    execute format('alter table orq.%I enable row level security', t);
    execute format($p$create policy %1$s_read on orq.%1$I for select to authenticated using (true)$p$, t);
    execute format($p$create policy %1$s_srv  on orq.%1$I for all to service_role using (true) with check (true)$p$, t);
  end loop;
end$$;
