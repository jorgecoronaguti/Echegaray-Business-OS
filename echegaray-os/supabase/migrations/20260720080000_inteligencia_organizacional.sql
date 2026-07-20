-- INTELIGENCIA ORGANIZACIONAL — las piezas que faltaban del programa de las 8 áreas.
--
-- Contexto: la auditoría del 20/07 mostró que el "qué" ya existía casi todo (36 skills = criterio
-- profesional, 49 capacidades = KPIs determinísticos, orq.* = work fabric, post_mortems, acciones,
-- backlog_autonomo), pero no estaba REGISTRADO como catálogo consultable ni conectado a las 8 áreas.
-- 20260720060000 unificó la taxonomía; 20260720070000 agregó las revisiones operativas.
-- Esto agrega el resto: catálogo de frameworks/playbooks/checklists/KPIs, reglas de decisión,
-- casos de decisión con evidencia y resultado, objetivos, reuniones y aprendizajes.
--
-- REGLA QUE GOBIERNA TODO ESTE ARCHIVO: las tablas se crean vacías y se llenan desde lo que YA
-- existe (las skills del repo, las capacidades registradas, los post-mortems reales). No se
-- siembran playbooks ni KPIs inventados: un catálogo lleno de contenido ficticio es peor que uno
-- vacío, porque el OS lo citaría como si fuera criterio de la empresa.

-- ── Campos comunes: toda pieza pertenece a un área, se versiona y se aprueba ──
-- (no se usa una tabla genérica con `tipo` porque cada pieza tiene forma propia y las queries
--  quedarían llenas de jsonb opaco; se repiten 6 columnas a cambio de poder consultarlas)

-- 1. FRAMEWORKS — el criterio profesional. Hoy vive como prosa en .claude/skills/<n>/SKILL.md y
--    se carga al contexto del chat. Acá se REGISTRA para poder consultarlo por área y medir su uso.
create table if not exists public.knowledge_frameworks (
  id          uuid primary key default gen_random_uuid(),
  clave       text unique not null,          -- el nombre real de la carpeta de la skill
  nombre      text not null,
  objetivo    text,
  area        text references public.area_canonica(clave),
  ruta        text,                          -- .claude/skills/<clave>/SKILL.md — la fuente real
  estado      text not null default 'vigente',   -- vigente | borrador | archivado
  version     int  not null default 1,
  veces_usado int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- 2. PLAYBOOKS — qué hacer cuando pasa X. Se disparan por condición, no por pedido.
create table if not exists public.knowledge_playbooks (
  id                uuid primary key default gen_random_uuid(),
  clave             text unique not null,
  nombre            text not null,
  area              text references public.area_canonica(clave),
  disparador        text,                    -- descripción de la condición que lo activa
  severidad         text,                    -- critica | alta | media | baja
  pasos_json        jsonb,                   -- [{orden, accion, responsable, evidencia}]
  requiere_aprobacion boolean not null default true,
  criterio_exito    text,
  capacidad_os      text,                    -- capacidad del OS que lo ejecuta o lo detecta
  estado            text not null default 'borrador',
  version           int  not null default 1,
  veces_ejecutado   int  not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- 3. CHECKLISTS — control repetitivo con evidencia. control-administrativo ya es uno, ejecutable.
create table if not exists public.knowledge_checklists (
  id            uuid primary key default gen_random_uuid(),
  clave         text unique not null,
  nombre        text not null,
  area          text references public.area_canonica(clave),
  frecuencia    text,                        -- diaria | semanal | quincenal | mensual | por evento
  items_json    jsonb,                       -- [{punto, evidencia_requerida}]
  capacidad_os  text,                        -- la capacidad que lo corre sola, si existe
  estado        text not null default 'borrador',
  version       int  not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 4. KPIs — el catálogo de indicadores. Cada uno DEBE declarar su base contable: mezclar devengado
--    con percibido es la regla de oro que más plata cuesta romper (CLAUDE.md raíz).
create table if not exists public.knowledge_kpis (
  id              uuid primary key default gen_random_uuid(),
  clave           text unique not null,
  nombre          text not null,
  area            text references public.area_canonica(clave),
  descripcion     text,
  base_contable   text,                      -- devengado | percibido | fisico | n/a
  unidad          text,                      -- $ | % | dias | horas | cantidad
  direccion       text,                      -- sube_mejor | baja_mejor | rango
  objetivo        numeric,
  umbral_alerta   numeric,
  umbral_critico  numeric,
  frecuencia      text,
  capacidad_os    text,                      -- la capacidad determinística que lo calcula
  decision_asociada text,                    -- qué decisión cambia si este número cambia
  estado          text not null default 'vigente',
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on column public.knowledge_kpis.base_contable is
  'OBLIGATORIO declararla. P&L = devengado, Cash Flow = percibido. Un KPI sin base declarada no se muestra junto a otros.';
comment on column public.knowledge_kpis.decision_asociada is
  'Qué decisión cambia si este número cambia. Sin respuesta, el indicador es decorativo (CLAUDE.md raíz).';

-- 5. REGLAS DE DECISIÓN — condición → recomendación, con aprobación explícita cuando toca plata.
create table if not exists public.knowledge_decision_rules (
  id            uuid primary key default gen_random_uuid(),
  clave         text unique not null,
  nombre        text not null,
  area          text references public.area_canonica(clave),
  prioridad     int not null default 100,
  condicion     text not null,
  recomendacion text not null,
  requiere_aprobacion boolean not null default true,
  fundamento    text,                        -- de dónde sale la regla (skill, norma, aprendizaje)
  estado        text not null default 'borrador',
  version       int not null default 1,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- 6. CASOS DE DECISIÓN — para poder medir después si la decisión salió bien.
create table if not exists public.organizational_decision_cases (
  id              uuid primary key default gen_random_uuid(),
  area            text not null references public.area_canonica(clave),
  titulo          text not null,
  descripcion     text,
  hechos_json     jsonb,                     -- lo verificable
  supuestos_json  jsonb,                     -- lo asumido: separado de los hechos, siempre
  opciones_json   jsonb,
  opcion_recomendada text,
  razon           text,
  confianza       text,
  riesgo          text,
  requiere_aprobacion boolean not null default true,
  estado_aprobacion text not null default 'pendiente',  -- pendiente | aprobada | rechazada
  origen_review_id uuid references public.operating_reviews(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  resuelto_en     timestamptz
);
comment on column public.organizational_decision_cases.supuestos_json is
  'Los supuestos van SEPARADOS de los hechos. Mezclarlos es presentar una inferencia como dato.';

create table if not exists public.organizational_decision_evidence (
  id            uuid primary key default gen_random_uuid(),
  caso_id       uuid not null references public.organizational_decision_cases(id) on delete cascade,
  tipo          text,                        -- dato_os | documento | afirmacion | externo
  origen_tabla  text,
  origen_id     text,
  extracto      text,
  created_at    timestamptz not null default now()
);

create table if not exists public.organizational_decision_outcomes (
  id              uuid primary key default gen_random_uuid(),
  caso_id         uuid not null references public.organizational_decision_cases(id) on delete cascade,
  opcion_elegida  text,
  ejecutada_en    timestamptz,
  resultado_esperado text,
  resultado_real  text,
  impacto_economico numeric,
  evaluacion      text,                      -- mejor | como_esperado | peor
  aprendizaje     text,
  created_at      timestamptz not null default now()
);

-- 7. APRENDIZAJES — con la clasificación A–E del CLAUDE.md. Una observación aislada (A) NUNCA se
--    convierte sola en regla: pasar a D o E exige validación humana proporcional al riesgo.
create table if not exists public.organizational_lessons (
  id              uuid primary key default gen_random_uuid(),
  area            text references public.area_canonica(clave),
  titulo          text not null,
  situacion       text,
  decision        text,
  resultado       text,
  aprendizaje     text not null,
  clase           text not null default 'A',  -- A observacion | B recurrencia | C patron | D validado | E regla
  regla_propuesta text,
  origen_tabla    text,
  origen_id       text,
  aprobado_por    text,
  aprobado_en     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
alter table public.organizational_lessons drop constraint if exists lessons_clase_check;
alter table public.organizational_lessons add constraint lessons_clase_check check (clase in ('A','B','C','D','E'));
comment on column public.organizational_lessons.clase is
  'A observación aislada · B recurrencia · C patrón probable · D validado · E regla aprobada. La captura autónoma NUNCA supera B.';

-- 8. OBJETIVOS — objetivo → resultado clave → KPI → responsable → fecha.
create table if not exists public.objetivos (
  id            uuid primary key default gen_random_uuid(),
  area          text references public.area_canonica(clave),
  titulo        text not null,
  descripcion   text,
  horizonte     text,                        -- anual | trimestral | mensual
  periodo_desde date,
  periodo_hasta date,
  responsable   text,
  estado        text not null default 'activo',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists public.objetivo_resultados (
  id            uuid primary key default gen_random_uuid(),
  objetivo_id   uuid not null references public.objetivos(id) on delete cascade,
  titulo        text not null,
  kpi_clave     text references public.knowledge_kpis(clave),
  valor_inicial numeric,
  valor_objetivo numeric,
  valor_actual  numeric,
  unidad        text,
  actualizado_en timestamptz,
  created_at    timestamptz not null default now()
);

-- 9. REUNIONES — la cadencia. Cada una declara qué información necesita ANTES de empezar, para
--    que el OS la prepare y la reunión se use para decidir, no para leer números.
create table if not exists public.operating_meeting_templates (
  id                uuid primary key default gen_random_uuid(),
  clave             text unique not null,
  nombre            text not null,
  area              text references public.area_canonica(clave),
  frecuencia        text not null,
  duracion_minutos  int,
  participantes     text,
  entradas_json     jsonb,                   -- capacidades del OS que se corren antes
  agenda_json       jsonb,
  estado            text not null default 'vigente',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Índices por área (toda consulta de la biblioteca entra por ahí) ──
create index if not exists kf_area_idx  on public.knowledge_frameworks (area);
create index if not exists kp_area_idx  on public.knowledge_playbooks (area, estado);
create index if not exists kc_area_idx  on public.knowledge_checklists (area);
create index if not exists kk_area_idx  on public.knowledge_kpis (area, estado);
create index if not exists kdr_area_idx on public.knowledge_decision_rules (area, prioridad);
create index if not exists odc_area_idx on public.organizational_decision_cases (area, estado_aprobacion);
create index if not exists ol_area_idx  on public.organizational_lessons (area, clase);
create index if not exists obj_area_idx on public.objetivos (area, estado);
create index if not exists omt_area_idx on public.operating_meeting_templates (area);

-- ── RLS en todas (mismo criterio que 20260719170000) ──
do $$
declare t text;
begin
  foreach t in array array[
    'knowledge_frameworks','knowledge_playbooks','knowledge_checklists','knowledge_kpis',
    'knowledge_decision_rules','organizational_decision_cases','organizational_decision_evidence',
    'organizational_decision_outcomes','organizational_lessons','objetivos','objetivo_resultados',
    'operating_meeting_templates']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_select', t);
    execute format('drop policy if exists %I on public.%I', t || '_write', t);
    execute format('create policy %I on public.%I for all to authenticated using (true) with check (true)', t || '_write', t);
  end loop;
end $$;

-- ── La biblioteca completa por área: extiende conocimiento_por_area con las piezas nuevas ──
create or replace view public.biblioteca_completa as
  select area, tipo, titulo, confianza, activo, origen_id, origen_tabla, created_at
    from public.conocimiento_por_area
  union all
  select area, 'framework', nombre, null, estado = 'vigente', id::text, 'knowledge_frameworks', created_at
    from public.knowledge_frameworks
  union all
  select area, 'playbook', nombre, severidad, estado = 'vigente', id::text, 'knowledge_playbooks', created_at
    from public.knowledge_playbooks
  union all
  select area, 'checklist', nombre, frecuencia, estado = 'vigente', id::text, 'knowledge_checklists', created_at
    from public.knowledge_checklists
  union all
  select area, 'kpi', nombre, base_contable, estado = 'vigente', id::text, 'knowledge_kpis', created_at
    from public.knowledge_kpis
  union all
  select area, 'regla', nombre, prioridad::text, estado = 'vigente', id::text, 'knowledge_decision_rules', created_at
    from public.knowledge_decision_rules
  union all
  select area, 'aprendizaje', titulo, clase, true, id::text, 'organizational_lessons', created_at
    from public.organizational_lessons
  union all
  select area, 'objetivo', titulo, horizonte, estado = 'activo', id::text, 'objetivos', created_at
    from public.objetivos
  union all
  select area, 'reunion', nombre, frecuencia, estado = 'vigente', id::text, 'operating_meeting_templates', created_at
    from public.operating_meeting_templates
  union all
  select area, 'decision', titulo, estado_aprobacion, resuelto_en is null, id::text, 'organizational_decision_cases', created_at
    from public.organizational_decision_cases;

comment on view public.biblioteca_completa is
  'TODA la inteligencia organizacional por área: conocimiento + frameworks + playbooks + checklists + KPIs + reglas + aprendizajes + objetivos + reuniones + decisiones. No copia filas.';
