-- ============================================================================
-- TESORERO INVERSOR IA — especialista subordinado al CFO IA + su ledger.
--
-- ADITIVA Y AISLADA. No toca ninguna tabla existente: crea el schema `tesoreria`
-- y agrega una capacidad y un agente al organigrama que ya existe (orq.agents /
-- orq.capabilities), con el mismo mecanismo del resto de los especialistas.
--
-- POR QUÉ UN SCHEMA PROPIO. Las observaciones de mercado son un HISTÓRICO que
-- crece rápido y que no comparte ciclo de vida con nada del OS. Mezclarlo en
-- `public` haría que las tablas de negocio convivan con un log de scraping.
--
-- LA REGLA DEL HISTÓRICO: las observaciones NUNCA se actualizan. Una tasa leída
-- ayer es un hecho de ayer; pisarla borraría la única forma de auditar si el
-- agente decidió con el dato que había. Por eso no hay `on conflict do update`
-- en `observaciones`.
-- ============================================================================

create schema if not exists tesoreria;

-- --- Capacidad y agente -----------------------------------------------------
insert into orq.capabilities
  (slug, domain, description, required_clearance, blast_radius, idempotency, agent_role) values
  ('advise.treasury', 'finanzas',
   'Analizar excedentes de caja por horizonte y proponer colocaciones; NUNCA ejecuta operaciones financieras.',
   'C', 'low', 'idempotent', 'tesorero')
on conflict (slug) do nothing;

do $$
declare v_tenant uuid; v_princ uuid; v_agent uuid;
begin
  select id into v_tenant from orq.tenants where slug = 'echegaray';
  if v_tenant is null then raise notice 'sin tenant echegaray: no se siembra el Tesorero'; return; end if;

  insert into orq.principals (tenant_id, kind, slug, display_name, rol, clearance)
  values (v_tenant, 'agent', 'agent:tesorero', 'Tesorero Inversor IA', 'Tesorero Inversor IA', 'C')
  on conflict (tenant_id, slug) do update set rol = excluded.rol, clearance = excluded.clearance
  returning id into v_princ;

  -- org_order 1.5 no existe (es int): va 12, después de los roles de software. El
  -- organigrama lo muestra bajo Finanzas por su capacidad, no por el número.
  insert into orq.agents (tenant_id, principal_id, slug, role, description, context_ref,
                          default_model, max_cost_usd_per_task, max_cost_usd_per_day,
                          max_concurrent, org_title, org_order)
  values (v_tenant, v_princ, 'tesorero', 'Tesorero Inversor IA',
          'Excedentes de caja e inversiones corporativas. Subordinado al CFO IA: consume su modelo de liquidez, no lo recalcula. Propone colocaciones con criterio percibido y NUNCA opera.',
          'echegaray-os/.claude/skills/tesoreria-inversiones-corporativas',
          'sonnet', 0.50, 4.0, 1, 'Tesorero Inversor IA', 12)
  on conflict (tenant_id, slug) do update
    set role = excluded.role, description = excluded.description, context_ref = excluded.context_ref,
        org_title = excluded.org_title, org_order = excluded.org_order
  returning id into v_agent;

  insert into orq.agent_capabilities (agent_id, capability_slug)
  select v_agent, unnest(array['advise.treasury', 'read.analyze', 'doc.write'])
  on conflict do nothing;

  insert into orq.model_routes (tenant_id, scope, match_key, priority, engine, model, max_cost_usd) values
    (v_tenant, 'capability', 'advise.treasury',  50, 'claude-cli', 'sonnet', 0.50),
    (v_tenant, 'capability', 'advise.treasury', 100, 'claude-cli', 'opus',   1.00)
  on conflict (tenant_id, scope, match_key, priority) do nothing;
end $$;

-- --- Corridas ---------------------------------------------------------------
create table if not exists tesoreria.corridas (
  run_id          uuid primary key default gen_random_uuid(),
  correlation_id  text,
  iniciada_en     timestamptz not null default now(),
  terminada_en    timestamptz,
  estado          text not null default 'en_curso'
                    check (estado in ('en_curso','ok','sin_dato','session_required','error','omitida')),
  motivo          text,
  spreadsheet_id  text,
  rangos_leidos   text[] not null default '{}',
  versiones_skill jsonb not null default '{}'::jsonb,
  sesion_balanz   text,
  publicado       boolean not null default false,
  payload         jsonb
);
create index if not exists tesoreria_corridas_fecha_idx on tesoreria.corridas (iniciada_en desc);

-- --- Posición de caja (snapshot percibido) ----------------------------------
create table if not exists tesoreria.posiciones (
  id              bigint generated always as identity primary key,
  run_id          uuid not null references tesoreria.corridas(run_id) on delete cascade,
  observado_en    timestamptz not null default now(),
  en_descubierto  boolean not null,
  caja_real       numeric(16,2),
  caja_comprometida numeric(16,2),
  caja_restringida  numeric(16,2),
  caja_minima       numeric(16,2),
  caja_excedente    numeric(16,2),
  confianza       text,
  datos_faltantes text[] not null default '{}',
  payload         jsonb
);

-- --- Ventanas de excedente invertible ---------------------------------------
create table if not exists tesoreria.ventanas (
  id            bigint generated always as identity primary key,
  run_id        uuid not null references tesoreria.corridas(run_id) on delete cascade,
  bloque        text not null check (bloque in ('A','B','C','D','E','F','G')),
  moneda        text not null default 'ARS',
  monto_maximo  numeric(16,2),
  fecha_inicial date,
  fecha_limite  date,
  dias_libres   int,
  motivo        text,
  confianza     text,
  payload       jsonb
);

-- --- Instrumentos y sus observaciones ---------------------------------------
create table if not exists tesoreria.instrumentos (
  id            text primary key,
  nombre        text not null,
  ticker        text,
  categoria     text not null,
  emisor        text,
  moneda        text not null default 'ARS',
  apto_tesoreria boolean,
  visto_primero timestamptz not null default now(),
  visto_ultimo  timestamptz not null default now()
);

-- HISTÓRICO INMUTABLE: una fila por lectura. Nunca se actualiza (ver cabecera).
create table if not exists tesoreria.observaciones (
  id            bigint generated always as identity primary key,
  run_id        uuid references tesoreria.corridas(run_id) on delete set null,
  instrumento_id text not null references tesoreria.instrumentos(id),
  observado_en  timestamptz not null default now(),
  precio        numeric(18,6),
  tasa_tipo     text,
  tasa_valor    numeric(12,8),
  tasa_naturaleza text,
  plazo_rescate_dias int,
  liquidacion_dias   int,
  costos        jsonb,
  evidencia     text not null,
  campos_faltantes text[] not null default '{}',
  url           text
);
create index if not exists tesoreria_obs_instrumento_idx on tesoreria.observaciones (instrumento_id, observado_en desc);

-- --- Recomendaciones, validaciones y feedback -------------------------------
create table if not exists tesoreria.recomendaciones (
  id            text primary key,
  run_id        uuid not null references tesoreria.corridas(run_id) on delete cascade,
  bloque        text not null,
  instrumento_id text,
  monto_maximo  numeric(16,2) not null,
  moneda        text not null,
  horizonte_dias int not null,
  rendimiento_neto_periodo numeric(12,8),
  ganancia_neta_estimada   numeric(16,2),
  confianza     text,
  -- NO HAY ESTADO 'ejecutada'. Este agente no opera: el ciclo de vida termina en
  -- aprobada/rechazada por un humano, o vencida por el paso del tiempo.
  estado        text not null default 'propuesta'
                  check (estado in ('propuesta','aprobada','rechazada','vencida','reemplazada')),
  creada_en     timestamptz not null default now(),
  vence_en      timestamptz not null,
  payload       jsonb not null
);
create index if not exists tesoreria_rec_vigentes_idx on tesoreria.recomendaciones (estado, vence_en desc);

create table if not exists tesoreria.validaciones (
  id             bigint generated always as identity primary key,
  recomendacion_id text not null references tesoreria.recomendaciones(id) on delete cascade,
  validado_en    timestamptz not null default now(),
  aprobada       boolean not null,
  fallas         text[] not null default '{}',
  chequeos       jsonb not null
);

create table if not exists tesoreria.feedback (
  id             bigint generated always as identity primary key,
  recomendacion_id text references tesoreria.recomendaciones(id) on delete set null,
  recibido_en    timestamptz not null default now(),
  autor          text,
  origen         text not null default 'mattermost',
  tipo           text not null,
  clase          text not null check (clase in ('A','B','C','D','E')),
  texto          text,
  aplicable_automaticamente boolean not null default false,
  requiere_aprobacion       boolean not null default true,
  aprobado_por   text,
  aprobado_en    timestamptz,
  payload        jsonb
);

-- --- Políticas financieras (memoria del agente) -----------------------------
-- Una política se cambia con una fila nueva y aprobación explícita, nunca con un
-- update en caliente: así queda el historial de qué regla regía cuándo.
create table if not exists tesoreria.politicas (
  id            bigint generated always as identity primary key,
  clave         text not null,
  valor         jsonb not null,
  vigente_desde timestamptz not null default now(),
  vigente_hasta timestamptz,
  -- APROBADA_POR Y APROBADA_EN VAN JUNTAS, y son lo que distingue una política de una propuesta.
  -- Sin ellas, `creada_en` sería lo único disponible y "guardado" se confundiría con "aprobado" —
  -- que es exactamente la confusión que este agente no puede permitirse: sin aprobación real, todo
  -- lo que calcula es un techo técnico, no un monto ejecutable.
  aprobada_por  text,
  aprobada_en   timestamptz,
  motivo        text,
  creada_en     timestamptz not null default now(),
  constraint politicas_aprobacion_completa check ((aprobada_por is null) = (aprobada_en is null))
);
-- Para una base donde la migración ya corrió sin la columna (aditivo, no destructivo).
alter table tesoreria.politicas add column if not exists aprobada_en timestamptz;
create index if not exists tesoreria_politicas_vigentes_idx on tesoreria.politicas (clave, vigente_desde desc);

-- --- Seguridad y errores del navegador --------------------------------------
create table if not exists tesoreria.bloqueos_seguridad (
  id           bigint generated always as identity primary key,
  run_id       uuid references tesoreria.corridas(run_id) on delete cascade,
  ocurrido_en  timestamptz not null default now(),
  motivo       text not null,
  coincidencia text,
  campo        text,
  -- Sólo etiqueta, rol y 80 caracteres de texto: alcanza para auditar y no
  -- reconstruye la pantalla de un bróker autenticado.
  elemento     jsonb
);

create table if not exists tesoreria.errores_extraccion (
  id          bigint generated always as identity primary key,
  run_id      uuid references tesoreria.corridas(run_id) on delete cascade,
  ocurrido_en timestamptz not null default now(),
  url         text,
  detalle     text not null
);

-- --- RLS: escritura sólo service_role, lectura autenticada ------------------
do $$
declare t text;
begin
  foreach t in array array['corridas','posiciones','ventanas','instrumentos','observaciones',
                           'recomendaciones','validaciones','feedback','politicas',
                           'bloqueos_seguridad','errores_extraccion']
  loop
    execute format('alter table tesoreria.%I enable row level security', t);
    execute format('drop policy if exists %I on tesoreria.%I', t||'_service', t);
    execute format('create policy %I on tesoreria.%I for all to service_role using (true) with check (true)', t||'_service', t);
    execute format('drop policy if exists %I on tesoreria.%I', t||'_read', t);
    execute format('create policy %I on tesoreria.%I for select to authenticated using (true)', t||'_read', t);
    execute format('grant select on tesoreria.%I to authenticated', t);
  end loop;
end $$;

grant usage on schema tesoreria to authenticated, service_role;

comment on schema tesoreria is
  'Tesorero Inversor IA: ledger de corridas, posición de caja, ventanas de excedente, instrumentos, observaciones de mercado (histórico inmutable), recomendaciones, validaciones y bloqueos de seguridad. El agente NUNCA ejecuta operaciones financieras.';
