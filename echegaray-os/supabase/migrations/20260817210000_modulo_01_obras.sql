-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- MÓDULO 01 — OBRAS. El modelo mínimo para planificar y ejecutar una obra.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- QUÉ HABILITA. Portafolio · ciclo de vida · cronograma (Gantt con fechas, jerarquía, dependencias,
-- hitos y baseline) · plan vs real · lookahead con restricciones · documentos de Drive por obra.
--
-- ═══ POR QUÉ CUELGA TODO DE `obra_canonica` Y NO DE `obras` ═══
--
-- `public.obras` es legacy: 4 filas del 09/07, NINGUNA activa, y la vista `obra_panel` la engancha
-- por `norm_obra(nombre)`, un join que hoy pega en 1 de 5 obras. Por eso el panel publica
-- `monto_contratado`, `fecha_inicio` y `margen` en NULL para las cuatro obras que están facturando.
-- El eje real es `obra_canonica` (id text, slug), que es a donde ya apuntan cobranzas, certificados,
-- adicionales y el alias de costos. Acá se le agrega lo comercial y lo temporal para que la vista
-- deje de depender de ese join.
--
-- ═══ LA FRONTERA, QUE ES UNA REGLA Y NO UN COMENTARIO ═══
--
-- Obras NO administra Compras, Finanzas, Personal ni Contabilidad: los RELACIONA por `obra_canonica`.
-- Acá no hay ni una columna de costo, ni de HH, ni de pago, ni de certificación cobrada. El costo
-- real sigue saliendo de `obra_costo_real` (que resuelve `costos_obra` por `obra_alias`), las HH de
-- `registros_hh`, la cobranza de `cobranza`/`certificados`, y los archivos siguen viviendo en Drive
-- —acá sólo se guarda el vínculo, nunca una copia.
--
-- ═══ LO QUE DELIBERADAMENTE NO SE CREA ═══
--
-- · Tabla de hitos: un hito es una actividad de duración cero. Alcanza `tipo = 'hito'`.
-- · Compromisos semanales y PPC del Last Planner: se construyen sobre restricciones y actividades,
--   y exigen dos listas cerradas (tipos de restricción y causas de incumplimiento) que el dueño
--   todavía no fijó. Una lista que cambia después rompe toda la serie histórica del Pareto, que es
--   lo único que convierte el módulo en aprendizaje. Se deja para cuando estén acordadas.
-- · Copia de costo/HH/cobranza en la obra. Ver la frontera de arriba.
--
-- ═══ LA FORMA ES LA ESTÁNDAR DE UN GANTT, A PROPÓSITO ═══
--
-- `obra_actividad` = {id, nombre, inicio, fin, duración, avance, tipo, padre} y `obra_dependencia` =
-- {origen, destino, tipo, lag}. Es el shape que usan todas las librerías de Gantt del mercado. El
-- componente se escribe a medida —las dos librerías gratis serias ponen baseline y camino crítico
-- detrás de licencia paga, y son dos de los cuatro requisitos— pero si mañana hay que reemplazarlo,
-- se cambia el componente y NO la base. Es un seguro que cuesta cero.

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 1) LA OBRA: identidad comercial y ciclo de vida
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.obra_canonica
  add column if not exists cliente_texto     text,
  add column if not exists etapa             text not null default 'desarrollo',
  add column if not exists monto_contratado  numeric,
  add column if not exists fecha_inicio_plan date,
  add column if not exists fecha_fin_plan    date,
  add column if not exists fecha_inicio_real date,
  add column if not exists fecha_fin_real    date,
  add column if not exists jefe_obra         text,
  add column if not exists drive_carpeta_id  text,
  add column if not exists orden             integer not null default 100;

-- Las cinco etapas son las que pidió el dueño, en su orden. Es una lista cerrada porque la etapa
-- decide qué deja hacer el sistema: sin baseline aprobado no se sale de 'previo', y una obra en
-- 'cierre' es de sólo lectura.
do $$ begin
  alter table public.obra_canonica add constraint obra_canonica_etapa_chk
    check (etapa in ('previo','inicio','desarrollo','terminacion','cierre'));
exception when duplicate_object then null; end $$;

comment on column public.obra_canonica.etapa is
  'Previo → Inicio → Desarrollo → Terminación → Cierre. Gobierna qué habilita el módulo.';
comment on column public.obra_canonica.drive_carpeta_id is
  'Carpeta raíz de la obra en Drive. Los archivos NO se copian: se enlazan.';

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 2) EL CRONOGRAMA: una actividad es una FILA, no una entrada de un jsonb
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Hoy el avance vive en `avance_obra.detalle` como `[{codigo, actividad, pct, estado}]`. El archivo
-- de Drive del que sale SÍ trae `Start`, `End`, `Days`, `Días Reales` y `CUADRILLA` por actividad —
-- el parser los descarta. No hay que inventar un cronograma: hay que dejar de tirarlo.

create table if not exists public.obra_actividad (
  id            uuid primary key default gen_random_uuid(),
  obra_id       text not null references public.obra_canonica(id) on delete cascade,

  codigo        text not null,                 -- '1', '1.01', '2,03' — la jerarquía del tracker
  codigo_padre  text,                          -- derivado del código; nulo en el primer nivel
  nombre        text not null,
  tipo          text not null default 'tarea'
                check (tipo in ('tarea','resumen','hito')),
  orden         integer not null default 0,

  -- PLAN — lo que se va a hacer. Se mueve cuando se replanifica.
  inicio_plan   date,
  fin_plan      date,
  dias_plan     numeric,

  -- REAL — lo que pasó.
  inicio_real   date,
  fin_real      date,
  dias_real     numeric,

  -- BASELINE — el plan aprobado, congelado. Es contra ESTO que se mide el desvío, y por eso
  -- ningún sincronizador lo pisa: sólo lo sella un acto explícito, con fecha.
  inicio_base   date,
  fin_base      date,
  sellada_en    timestamptz,

  pct           numeric check (pct >= 0 and pct <= 100),
  estado        text,
  cuadrilla     text,
  comentario    text,

  -- PROCEDENCIA. `editado_a_mano` es el candado: lo que tocó una persona le gana al sincronizador.
  fuente          text not null default 'avances_de_obra_drive',
  fuente_pestana  text,
  fuente_fila     integer,
  editado_a_mano  boolean not null default false,
  sincronizado_en timestamptz not null default now(),
  creado_en       timestamptz not null default now(),

  unique (obra_id, codigo)
);

create index if not exists obra_actividad_obra_idx  on public.obra_actividad (obra_id, orden);
create index if not exists obra_actividad_fecha_idx on public.obra_actividad (obra_id, inicio_plan);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 3) DEPENDENCIAS
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- HOY ESTA TABLA NACE VACÍA, y se declara: el dato NO existe en ninguna fuente — ni en la base ni
-- en el Gantt de Drive, que no tiene columna de predecesoras. No se deduce de las fechas: que una
-- actividad empiece cuando otra termina no prueba que dependa de ella. Se llena cuando alguien
-- dibuje la precedencia en la pantalla, y hasta entonces el Gantt no muestra ninguna flecha.

create table if not exists public.obra_dependencia (
  id         uuid primary key default gen_random_uuid(),
  obra_id    text not null references public.obra_canonica(id) on delete cascade,
  origen_id  uuid not null references public.obra_actividad(id) on delete cascade,
  destino_id uuid not null references public.obra_actividad(id) on delete cascade,
  tipo       text not null default 'FS' check (tipo in ('FS','SS','FF','SF')),
  lag_dias   integer not null default 0,
  creado_en  timestamptz not null default now(),
  unique (origen_id, destino_id),
  check (origen_id <> destino_id)
);
create index if not exists obra_dependencia_obra_idx on public.obra_dependencia (obra_id);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 4) RESTRICCIONES — el corazón del make-ready del Last Planner
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Una restricción sin RESPONSABLE con nombre y sin FECHA COMPROMETIDA de liberación no es gestión:
-- es una lista de quejas. Por eso las dos columnas existen desde el día uno. `actividades_semanales`
-- ya tenía un campo `restricciones` de texto libre: 15 filas, cero cargadas, una obra pausada.

create table if not exists public.obra_restriccion (
  id            uuid primary key default gen_random_uuid(),
  obra_id       text not null references public.obra_canonica(id) on delete cascade,
  actividad_id  uuid references public.obra_actividad(id) on delete set null,

  tipo          text not null
                check (tipo in ('material','informacion','equipo','mano_de_obra','trabajo_previo',
                                'permiso','ingenieria_cliente','seguridad','acceso','contrato','otro')),
  descripcion   text not null,

  responsable   text,        -- una PERSONA. Un área no libera nada.
  fecha_necesidad   date,    -- cuándo la necesita la actividad
  fecha_compromiso  date,    -- cuándo prometieron liberarla
  fecha_liberacion  date,    -- cuándo se liberó de verdad

  estado        text not null default 'abierta'
                check (estado in ('abierta','en_curso','liberada')),
  creado_en     timestamptz not null default now(),
  creado_por    uuid
);
create index if not exists obra_restriccion_obra_idx on public.obra_restriccion (obra_id, estado);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 5) DOCUMENTOS: un puente a Drive, nunca una copia
-- ─────────────────────────────────────────────────────────────────────────────────────────────

create table if not exists public.obra_documento (
  obra_id       text not null references public.obra_canonica(id) on delete cascade,
  drive_file_id text not null,
  rol           text,
  origen        text not null default 'manual' check (origen in ('manual','path_inferido')),
  creado_en     timestamptz not null default now(),
  primary key (obra_id, drive_file_id)
);

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 6) RLS. Toda tabla nueva la lleva: una tabla sin policy falla en silencio.
-- ─────────────────────────────────────────────────────────────────────────────────────────────

alter table public.obra_actividad   enable row level security;
alter table public.obra_dependencia enable row level security;
alter table public.obra_restriccion enable row level security;
alter table public.obra_documento   enable row level security;

do $$
declare t text;
begin
  foreach t in array array['obra_actividad','obra_dependencia','obra_restriccion','obra_documento'] loop
    execute format('drop policy if exists %I_select on public.%I', t, t);
    execute format('create policy %I_select on public.%I for select to authenticated using (true)', t, t);
    execute format('drop policy if exists %I_write on public.%I', t, t);
    execute format($f$create policy %I_write on public.%I for all to authenticated
        using (public.current_rol() = any (array['direccion','administracion','jefe_obra']))
        with check (public.current_rol() = any (array['direccion','administracion','jefe_obra']))$f$, t, t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 7) LAS OBRAS QUE FALTABAN EN EL EJE CANÓNICO
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Confirmado por el dueño el 17/08/2026:
--  · Quattropani: *"Es una obra: darla de alta"*. Tiene $32,9M de costo cargado y tracker abierto
--    desde el 30/07, y no existía en `obra_canonica`.
--  · LE-Comedor y LE-Galpón 9: *"son dos obras distintas del mismo cliente «la estrella»"*. Son las
--    dos pestañas con MEJOR dato de avance (85% con 37 actividades y 100% con 7) y estaban
--    clasificadas 'excluido', o sea que no llegaban a ninguna pantalla.

insert into public.obra_canonica (id, nombre, estado, tipo, cliente_texto, etapa, orden) values
  ('quattropani', 'Salón Comercial',  'activa', 'obra', 'Quattropani - Melisa García SAS', 'inicio', 10),
  ('le-comedor',  'Comedor',          'activa', 'obra', 'La Estrella', 'desarrollo', 20),
  ('le-galpon-9', 'Galpón 9',         'activa', 'obra', 'La Estrella', 'terminacion', 30)
on conflict (id) do nothing;

update public.obra_canonica set cliente_texto = coalesce(cliente_texto, nombre)
 where cliente_texto is null;

-- Los alias son el único camino por el que una compra llega a una obra (`obra_costo_real` los usa).
-- `norm_obra()` ya normaliza: acá se escriben tal como quedan normalizados.
insert into public.obra_alias (alias, obra_id, clasificacion, ejemplo_raw) values
  (public.norm_obra('Quattropani - Melisa García SAS'), 'quattropani', 'obra', 'Quattropani - Melisa García SAS'),
  (public.norm_obra('Salones Comerciales'),             'quattropani', 'obra', 'Salones Comerciales'),
  (public.norm_obra('LE - Comedor'),                    'le-comedor',  'obra', 'LE - Comedor'),
  (public.norm_obra('LE - Galpon 9'),                   'le-galpon-9', 'obra', 'LE - Galpon 9')
on conflict (alias) do update set obra_id = excluded.obra_id, clasificacion = excluded.clasificacion;

-- ─────────────────────────────────────────────────────────────────────────────────────────────
-- 8) EL PANEL DEJA DE DEPENDER DEL JOIN POR NOMBRE CON LA TABLA LEGACY
-- ─────────────────────────────────────────────────────────────────────────────────────────────
--
-- Antes: `left join obras o on norm_obra(o.nombre) = norm_obra(oc.nombre)`. Ese join pegaba en 1 de
-- 5 obras, y por eso `monto_contratado`, `fecha_inicio` y `margen_sobre_contratado_pct` salían NULL
-- justo en las cuatro obras que están facturando. Ahora sale todo del eje canónico.

-- Se DESTRUYE y se rehace: la vista vieja llamaba `obra_nombre` a lo que ahora es `nombre`, y
-- Postgres no deja renombrar una columna con `create or replace`. Sin `cascade` a propósito: si algo
-- dependiera de ella, quiero que falle acá y no enterarme cuando ya lo borré.
drop view if exists public.obra_panel;

create view public.obra_panel as
select
  oc.id                as obra_id,
  oc.nombre,
  oc.cliente_texto,
  oc.estado,
  oc.tipo,
  oc.etapa,
  oc.jefe_obra,
  oc.orden,
  oc.monto_contratado,
  oc.fecha_inicio_plan,
  oc.fecha_fin_plan,
  oc.fecha_inicio_real,
  oc.fecha_fin_real,
  oc.drive_carpeta_id,
  ocr.costo_real,
  ocr.n_comprobantes,
  case when oc.monto_contratado > 0 and coalesce(ocr.costo_real, 0) > 0
       then round((oc.monto_contratado - ocr.costo_real) / oc.monto_contratado * 100, 1) end
    as margen_sobre_contratado_pct,
  -- AVANCE FÍSICO, promediado sobre las actividades que NO son de resumen: una fila de rubro
  -- repetiría el avance de sus hijas y lo pesaría doble.
  (select round(avg(a.pct)) from public.obra_actividad a
    where a.obra_id = oc.id and a.tipo <> 'resumen' and a.pct is not null) as avance_pct,
  (select count(*)::int from public.obra_actividad a where a.obra_id = oc.id)              as n_actividades,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada')                                     as restricciones_abiertas,
  (select count(*)::int from public.obra_restriccion r
    where r.obra_id = oc.id and r.estado <> 'liberada'
      and r.fecha_compromiso is not null and r.fecha_compromiso < current_date)             as restricciones_vencidas
from public.obra_canonica oc
left join public.obra_costo_real ocr on ocr.obra_id = oc.id;

comment on view public.obra_panel is
  'El portafolio del Módulo 01. Sale entero de obra_canonica: ya no depende del join por nombre con public.obras legacy.';
