-- UN APRENDIZAJE SE ACTIVA CON GOBERNANZA, Y SE PUEDE VOLVER ATRÁS.
--
-- ═══ EL HUECO QUE ESTO CIERRA (30/08/2026) ═══
--
-- El bucle de aprendizaje ya existía entero como funciones puras (`conocimiento/promocion.mjs`) y
-- las reglas que promovía se guardaban en un ARCHIVO JSON del repo. Un archivo del repo no lo puede
-- leer la web, ni el chat, ni el cotizador: la última flecha del ciclo —REUTILIZACIÓN— quedaba sin
-- destino. Y el CLAUDE.md raíz es explícito: un concepto que consumen varias caras se define una
-- sola vez y su fuente es Postgres.
--
-- ═══ POR QUÉ LA MEDICIÓN Y LA NORMA SON DOS TABLAS ═══
--
-- El primer diseño las juntaba en una fila: la medición de hoy y la regla vigente en las mismas
-- columnas. Los tests lo voltearon en dos golpes distintos y los dos tenían la misma raíz:
--
--  · recalcular con una obra nueva PISABA la regla vigente antes de que el registro pudiera
--    guardarla, así que la «regla anterior» que quedaba archivada ya era la nueva. El rollback
--    volvía a donde ya estaba.
--  · una obra nueva que contradice al aprendizaje activo no se podía ni siquiera anotar, porque la
--    fila activa tenía que seguir cumpliendo el piso.
--
-- Separadas, cada una dice una cosa sola:
--
--   `aprendizaje_candidato`  LA MEDICIÓN DE HOY. Se reescribe en cada corrida del bucle. Su estado
--                            llega hasta APTO: **acá no existe ACTIVO**, porque CANDIDATO ≠ NORMA.
--   `aprendizaje_version`    LA NORMA. Append-only. Cada activación guarda el snapshot ENTERO de lo
--                            que pasa a regir y el ENTERO de lo que regía. Volver atrás es agregar
--                            una fila, nunca recalcular: «parecido» no es volver.
--
-- ═══ EL PISO QUE IMPONE LA BASE ═══
--
-- La política vive en `conocimiento/gobernanza.mjs` y puede endurecerse sin migrar nada. El CHECK de
-- acá es el piso que ningún script puede saltear: nada rige con una sola obra, con menos de dos
-- mediciones, sin dispersión calculable o por debajo de clase D. Un invariante que sólo vive en
-- JavaScript es un invariante hasta que alguien escribe otro script.

-- ── 1. LA MEDICIÓN DE HOY ────────────────────────────────────────────────────────────────────

create table if not exists public.aprendizaje_candidato (
  clave            text primary key,
  area             text not null default 'cotizacion',
  afirmacion       text not null,
  unidad           text,
  valor            numeric,
  -- Cuántas mediciones y DE QUÉ OBRAS. Las dos, porque veinte mediciones de una obra son una obra:
  -- contarlas como veinte es exactamente cómo un caso particular se disfraza de regla general.
  sample_count     integer not null default 0,
  obras            text[]  not null default '{}',
  obras_distintas  integer not null default 0,
  -- En qué condiciones vale. Sin contexto, un rendimiento de hormigón bombeado se aplica a hormigón
  -- a mano y nadie se entera hasta que la obra se atrasa.
  contexto         jsonb,
  -- La ventana de la muestra: permite decir «esto es viejo» sin adivinar.
  fecha_desde      date,
  fecha_hasta      date,
  media            numeric,
  minimo           numeric,
  maximo           numeric,
  dispersion       numeric,
  clase            text,
  evidencia        jsonb not null default '[]'::jsonb,
  -- La regresión con la que se lo probó y los controles que pasó o no, con su motivo. Guardarlos
  -- convierte «no se promovió» en una respuesta auditable en vez de en un misterio.
  regresion        jsonb,
  gobernanza       jsonb,
  estado           text not null default 'CANDIDATO',
  motivo           text,
  creado_en        timestamptz not null default now(),
  actualizado_en   timestamptz not null default now()
);

do $$ begin
  alter table public.aprendizaje_candidato add constraint aprendizaje_candidato_estado_ck
    check (estado in ('CANDIDATO', 'APTO', 'RECHAZADO'));
exception when duplicate_object then null; end $$;

do $$ begin
  alter table public.aprendizaje_candidato add constraint aprendizaje_candidato_clase_ck
    check (clase is null or clase in ('A', 'B', 'C', 'D', 'E'));
exception when duplicate_object then null; end $$;

create index if not exists aprendizaje_candidato_apto_ix
  on public.aprendizaje_candidato (area, clave) where estado = 'APTO';

comment on table public.aprendizaje_candidato is
  'Lo que la ejecución de obra propone que la empresa aprenda, medido hoy. NO es la norma: la norma vive en aprendizaje_version. Por eso acá el estado llega hasta APTO y nunca dice ACTIVO.';
comment on column public.aprendizaje_candidato.obras_distintas is
  'Obras DISTINTAS que sostienen la muestra. Dos frentes de la misma obra comparten cuadrilla, encargado, terreno y clima: no son dos casos.';
comment on column public.aprendizaje_candidato.dispersion is
  'Coeficiente de variación (desvío/media). NULL = no se puede calcular (una sola medición o media cero), y NULL bloquea: desconocida no es cero.';

-- ── 2. LA NORMA, Y LO QUE HACE POSIBLE VOLVER ────────────────────────────────────────────────

create table if not exists public.aprendizaje_version (
  id               bigserial primary key,
  clave            text not null references public.aprendizaje_candidato(clave) on delete cascade,
  version          integer not null,
  accion           text not null,
  -- Los dos snapshots ENTEROS. Un puntero a una fila que se va a reescribir no sirve para volver.
  regla_anterior   jsonb,
  regla_nueva      jsonb,
  gobernanza       jsonb,
  por_que          text not null,
  -- Quién. La clase E es una regla operativa aprobada: sin firma no existe.
  quien            text,
  cuando           timestamptz not null default now()
);

do $$ begin
  alter table public.aprendizaje_version add constraint aprendizaje_version_accion_ck
    check (accion in ('ACTIVACION', 'ROLLBACK'));
exception when duplicate_object then null; end $$;

-- Una versión por clave: dos corridas simultáneas no pueden activar dos veces lo mismo, porque la
-- segunda choca contra esta única.
do $$ begin
  alter table public.aprendizaje_version add constraint aprendizaje_version_unica
    unique (clave, version);
exception when duplicate_object then null; end $$;

-- EL PISO. Toda regla que pase a regir —por activación o por rollback— tiene que sostenerse en al
-- menos dos obras distintas, dos mediciones, dispersión calculable y clase D o E.
do $$ begin
  alter table public.aprendizaje_version add constraint aprendizaje_version_piso_ck
    check (regla_nueva is null or (
      (regla_nueva->>'obras_distintas')::int >= 2
      and (regla_nueva->>'sample_count')::int >= 2
      and (regla_nueva->>'dispersion') is not null
      and (regla_nueva->>'valor') is not null
      and (regla_nueva->>'clase') in ('D', 'E')));
exception when duplicate_object then null; end $$;

create index if not exists aprendizaje_version_clave_ix on public.aprendizaje_version (clave, version desc);

comment on table public.aprendizaje_version is
  'Append-only: cada activación y cada rollback, con la regla que pasa a regir y la que regía, enteras. La última fila de cada clave ES la norma vigente; si su regla_nueva es NULL, no rige nada.';

-- ── 3. LO ÚNICO QUE COTIZA ───────────────────────────────────────────────────────────────────

create or replace view public.aprendizaje_activo as
  select u.clave,
         u.regla_nueva->>'area'            as area,
         u.regla_nueva->>'afirmacion'      as afirmacion,
         u.regla_nueva->>'unidad'          as unidad,
         (u.regla_nueva->>'valor')::numeric        as valor,
         (u.regla_nueva->>'sample_count')::int     as sample_count,
         u.regla_nueva->'obras'            as obras,
         (u.regla_nueva->>'obras_distintas')::int  as obras_distintas,
         u.regla_nueva->'contexto'         as contexto,
         (u.regla_nueva->>'fecha_desde')::date     as fecha_desde,
         (u.regla_nueva->>'fecha_hasta')::date     as fecha_hasta,
         (u.regla_nueva->>'dispersion')::numeric   as dispersion,
         u.regla_nueva->>'clase'           as clase,
         u.regla_nueva->'evidencia'        as evidencia,
         u.version, u.cuando as activado_en, u.accion as ultima_accion
    from (select distinct on (clave) * from public.aprendizaje_version
           order by clave, version desc, id desc) u
   where u.regla_nueva is not null;

comment on view public.aprendizaje_activo is
  'La UNA fuente de qué aprendizaje está en uso: la última fila del registro por clave. Quien cotiza lee esto y no la tabla de candidatos — estar medido no es estar activo.';

-- ── 4. RLS ───────────────────────────────────────────────────────────────────────────────────

alter table public.aprendizaje_candidato enable row level security;
alter table public.aprendizaje_version   enable row level security;

do $$ begin
  create policy aprendizaje_candidato_lee on public.aprendizaje_candidato for select to authenticated using (true);
exception when duplicate_object then null; end $$;

do $$ begin
  create policy aprendizaje_version_lee on public.aprendizaje_version for select to authenticated using (true);
exception when duplicate_object then null; end $$;

grant select on public.aprendizaje_candidato to authenticated;
grant select on public.aprendizaje_version   to authenticated;
grant select on public.aprendizaje_activo    to authenticated;
grant select, insert, update, delete on public.aprendizaje_candidato to service_role;
grant select, insert, update, delete on public.aprendizaje_version   to service_role;
grant usage, select on sequence public.aprendizaje_version_id_seq to service_role;
grant select on public.aprendizaje_activo to service_role;
