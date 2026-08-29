-- LOS UMBRALES DEJAN DE VIVIR EN TYPESCRIPT
--
-- ═══ QUÉ ESTABA MAL ═══
--
-- Cinco números que son POLÍTICA de la empresa estaban escritos como constantes de un componente:
--
--   ListaPresupuestos.tsx:58            MARGEN_OBJETIVO = 17
--   base-maestra/services/reglas.ts:109 DIAS_FRESCO     = 60
--   base-maestra/services/reglas.ts:110 DIAS_ACEPTABLE  = 180
--   base-maestra/services/reglas.ts:175 JORNADA_HORAS   = 8
--   base-maestra/services/reglas.ts:272 BANDA_DESVIO    = 0.1
--
-- Ninguno tenía fuente ni fecha, y el margen objetivo tiene ADEMÁS un conflicto declarado: el
-- handoff de diseño de la cartera dice 12 % y el código productivo usa 17 %. Un número sin
-- procedencia que decide si un presupuesto se pinta «bajo objetivo» es una regla de negocio
-- disfrazada de detalle de implementación: cambiarla exige un deploy y nadie puede decir de dónde
-- salió. REALIDAD ÚNICA: un concepto crítico se define una sola vez y su fuente es Postgres.
--
-- ═══ POR QUÉ HAY UNA COLUMNA `economico` ═══
--
-- `margen_objetivo_pct` es el margen de la empresa y lo ven Dirección y Administración. Los otros
-- cuatro —frescura de un precio, jornada, banda de desvío— los mira también un jefe de obra para
-- entender por qué una tarea aparece marcada. Una sola policy que exigiera `ve_economia()` para
-- toda la tabla dejaría al jefe de obra sin poder leer por qué su propia pantalla dice lo que dice.
-- El portero va POR FILA declarada, no por tabla.
--
-- ═══ EL CONFLICTO NO SE RESUELVE ACÁ ═══
--
-- §31 y §45 del programa: un CONFLICTO se mantiene hasta que lo resuelva evidencia o autoridad. Se
-- siembra el valor que HOY está en producción (17 %), con estado CONFLICTO y con la otra lectura
-- escrita al lado. La pantalla lo muestra como conflicto, no elige. Lo decide el dueño.
--
-- ADITIVA: crea una tabla y no toca ninguna existente. Nada deja de funcionar si esto no se aplica
-- — el código lee la tabla y, si no hay fila vigente, lo dice en vez de suponer un número.

-- ── 1 · la tabla ──────────────────────────────────────────────────────────────────────────────

create table if not exists public.parametro_operativo (
  id           uuid primary key default gen_random_uuid(),
  clave        text not null,
  valor        numeric not null,
  -- La unidad se guarda porque 0,1 y 10 % son el mismo umbral escrito de dos formas, y quien lee la
  -- tabla sin la unidad no puede saber cuál de las dos está mirando.
  unidad       text not null check (unidad in ('pct', 'fraccion', 'dias', 'horas', 'cantidad')),
  ambito       text not null,
  -- ¿Es plata de la empresa? Decide quién puede leer la fila. Ver el encabezado.
  economico    boolean not null default false,
  descripcion  text not null,
  -- PROVENANCE: de dónde salió este número. Sin esto la tabla sería el mismo número sin fuente,
  -- mudado de archivo.
  fuente       text not null,
  -- Los estados de dominio del contrato del cotizador (orquestador/lib/cotizador/contrato.mjs).
  -- Un umbral CONFIRMADO y uno en CONFLICTO no se muestran igual.
  estado       text not null default 'CONFIRMADO' check (estado in (
    'EXTRAIDO','CALCULADO','HISTORICO','PROPUESTO','CONFIRMADO','VALIDADO',
    'FALTA_DATO','AMBIGUO','CONFLICTO','ERROR','NO_APLICA')),
  -- Qué otra fuente dice otra cosa. Obligatorio cuando el estado es CONFLICTO: un conflicto sin la
  -- versión contraria escrita no se puede resolver, sólo recordar.
  conflicto    text,
  version      int not null default 1,
  vigente      boolean not null default false,
  vigencia_desde date not null default current_date,
  vigencia_hasta date,
  creado_en    timestamptz not null default now(),
  creado_por   uuid default auth.uid(),
  constraint parametro_operativo_clave_version unique (clave, version),
  constraint parametro_operativo_conflicto_declarado
    check (estado <> 'CONFLICTO' or (conflicto is not null and length(btrim(conflicto)) > 0)),
  constraint parametro_operativo_vigencia_coherente
    check (vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);

comment on table public.parametro_operativo is
  'Los umbrales operativos de la empresa, con su fuente y su estado. Vivían como constantes de '
  'TypeScript sin procedencia. Un cambio acá NO necesita deploy.';

-- Un índice único con una columna que acepta NULL no restringe nada (ya pasó, sobre 206 NULLs):
-- por eso el parcial, que sólo mira las filas vigentes.
create unique index if not exists parametro_operativo_uno_vigente_por_clave
  on public.parametro_operativo (clave) where vigente;

-- ── 2 · el que lee la pantalla ────────────────────────────────────────────────────────────────

create or replace view public.parametro_operativo_vigente as
  select clave, valor, unidad, ambito, economico, descripcion, fuente, estado, conflicto,
         version, vigencia_desde
    from public.parametro_operativo
   where vigente;

comment on view public.parametro_operativo_vigente is
  'Lo vigente y nada más. La pantalla nunca elige entre versiones: si hay dos, el índice parcial ya '
  'lo impidió.';

-- ── 3 · la siembra: los valores que HOY están en el código, con su procedencia ─────────────────

insert into public.parametro_operativo
  (clave, valor, unidad, ambito, economico, descripcion, fuente, estado, conflicto, version, vigente)
values
  ('margen_objetivo_pct', 17, 'pct', 'presupuestos', true,
   'Debajo de este margen sobre el precio, un presupuesto de la cartera se marca como bajo objetivo.',
   'Constante MARGEN_OBJETIVO en src/features/presupuestos/components/ListaPresupuestos.tsx:58, sin fuente declarada al 29/08/2026.',
   'CONFLICTO',
   'El handoff de diseño de la cartera (pantalla 14) dice 12 %; el codigo productivo usa 17 %. No hay evidencia de cual decidio el dueno. Se conserva el valor productivo y el conflicto queda a la vista hasta que lo resuelva el dueno (programa §31, §45).',
   1, true),

  ('dias_precio_fresco', 60, 'dias', 'base_maestra', false,
   'Hasta estos dias, un precio de la base maestra se considera nuevo.',
   'Constante DIAS_FRESCO en src/features/base-maestra/services/reglas.ts:109, sin fuente declarada al 29/08/2026.',
   'CONFIRMADO', null, 1, true),

  ('dias_precio_aceptable', 180, 'dias', 'base_maestra', false,
   'Pasados estos dias, el precio de la base maestra se marca como desactualizado.',
   'Constante DIAS_ACEPTABLE en src/features/base-maestra/services/reglas.ts:110, sin fuente declarada al 29/08/2026.',
   'CONFIRMADO', null, 1, true),

  ('jornada_horas', 8, 'horas', 'base_maestra', false,
   'Horas de una jornada, para convertir HH en dias de duracion. HH totales NO cambian con la cuadrilla (programa §12).',
   'Constante JORNADA_HORAS en src/features/base-maestra/services/reglas.ts:175. Coincide con la jornada del CCT UOCRA, no verificado contra el convenio vigente.',
   'CONFIRMADO', null, 1, true),

  ('banda_desvio', 0.1, 'fraccion', 'base_maestra', false,
   'Fuera de esta banda alrededor de 1, un rendimiento real se declara mejor o peor que el de analisis.',
   'Constante BANDA_DESVIO en src/features/base-maestra/services/reglas.ts:272, sin fuente declarada al 29/08/2026.',
   'CONFIRMADO', null, 1, true)
on conflict (clave, version) do nothing;

-- ── 4 · permisos ──────────────────────────────────────────────────────────────────────────────
--
-- El portero va envuelto en `(select ...)`: sin eso PostgREST lo evalúa UNA VEZ POR FILA y una
-- consulta de este repo llegó a costar 64 s por ese motivo. Con el subselect corre una sola vez.

alter table public.parametro_operativo enable row level security;

drop policy if exists parametro_operativo_lectura on public.parametro_operativo;
create policy parametro_operativo_lectura on public.parametro_operativo
  for select to authenticated
  using (economico = false or (select public.ve_economia()));

-- Cambiar un umbral es cambiar una política de la empresa: lo escribe quien ve la economía.
drop policy if exists parametro_operativo_escritura on public.parametro_operativo;
create policy parametro_operativo_escritura on public.parametro_operativo
  for all to authenticated
  using ((select public.ve_economia())) with check ((select public.ve_economia()));

grant select, insert, update, delete on public.parametro_operativo to authenticated;
grant all    on public.parametro_operativo to service_role;
-- Una vista sin `security_invoker` corre con los permisos de su dueño y se saltearía la policy de
-- arriba: el jefe de obra vería el margen objetivo por la vista aunque la tabla se lo niegue.
alter view public.parametro_operativo_vigente set (security_invoker = on);
grant select on public.parametro_operativo_vigente to authenticated;
grant select on public.parametro_operativo_vigente to service_role;
