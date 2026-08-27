-- XSAS v1 — LO QUE LA OBRA PUEDE ENSEÑAR SE MIDE POR SEPARADO, Y LO QUE NO PUEDE SE DICE.
--
-- ═══ LOS TRES HUECOS QUE ESTO CIERRA (27/08/2026) ═══
--
-- 1. **La experiencia se aprendía de filas que no son trabajo.** El cronograma importado trae
--    encabezados de frente e hitos: filas sin trabajo propio cuyas fechas son la envolvente de sus
--    hijas. Dos de los 117 hechos de duración salían de ahí. La vista canónica pasa a decir cuáles
--    son trabajo, una sola vez, y todos los que aprenden miran esa columna.
--
-- 2. **La dotación no se aprendía.** Existían las horas por unidad y los días; cuánta gente hace
--    falta —el dato con el que se arma una cuadrilla y se promete un plazo— no se guardaba en
--    ningún lado. Va a su propia tabla, por el mismo motivo por el que la duración tiene la suya:
--    tres métricas con tres requisitos distintos, y una sola tabla obligaría a rellenar con NULL
--    dos tercios de cada fila.
--
-- 3. **La dotación real podía salir de quién FIGURABA asignado.** La columna `dotacion_real` de la
--    vista cae a `obra_asignacion` cuando nadie imputó horas. Para pintar una pantalla alcanza;
--    para aprender una dotación no: quién figuraba no es quién estuvo. Se expone aparte la cuenta
--    que sólo mira horas imputadas, y el aprendizaje usa ÉSA.
--
-- ═══ EL COSTO POR ACTIVIDAD SIGUE SIN EXISTIR, Y ESO NO ES UN OLVIDO ═══
--
-- `costos_reales` se imputa por OBRA. No hay ninguna tabla de la que salga el costo de una
-- actividad, así que no se crea una columna para llenarla con una repartija proporcional: un costo
-- prorrateado por avance parece un dato y no lo es. Queda declarado como no disponible —lo dice el
-- propio aprendizaje— hasta que exista una imputación real por actividad.

-- ── 1. LA VISTA CANÓNICA DE XSAS DICE QUÉ ES TRABAJO Y CUÁNTA GENTE IMPUTÓ ──────────────────

create or replace view public.xsas_actividad
with (security_invoker = true) as
select
  c.actividad_id,
  c.obra_id,
  o.nombre                               as obra,
  coalesce(cl.nombre_comercial, cl.razon_social, o.cliente_texto) as cliente,
  o.cliente_id,
  o.estado                               as obra_estado,
  o.contrato_monto,
  o.contrato_moneda,
  c.codigo,
  c.nombre                               as actividad,
  c.estado                               as actividad_estado,
  c.estado_operativo,
  c.unidad,
  c.tarea_tipo_id,
  tt.codigo                              as tarea_codigo,
  tt.nombre                              as tarea,
  c.analisis_id,
  c.cotizacion_partida_id,

  -- PLAN
  c.cantidad_objetivo                    as plan_cantidad,
  c.hh_plan                              as plan_hh,
  c.dias_plan                            as plan_dias,
  c.dotacion_prevista                    as plan_dotacion,
  c.inicio_plan,
  c.fin_plan,

  -- PRESUPUESTO — de dónde salió el plan, cuando la actividad cuelga de una partida cotizada
  cp.hs_unitarias                        as presupuesto_hs_unitarias,
  cp.costo_unitario                      as presupuesto_costo_unitario,
  cp.cantidad                            as presupuesto_cantidad,

  -- REAL — todo por la definición canónica, ninguna cuenta propia
  c.cantidad_ejecutada                   as cantidad_real,
  c.avance_pct,
  c.origen_avance,
  (c.estado_fecha = 'terminada')         as terminada,
  -- ═══ UN AVANCE QUE SE ARMÓ SUMANDO DOS DECLARACIONES NO ES UNA MEDICIÓN ═══
  --
  -- Para `metodo_avance = 'manual'`, la vista canónica calcula el avance como
  -- `LEAST(100, pct declarado + avance de los partes)`. Hay 7 actividades vivas con las dos fuentes
  -- cargadas: «Armado armadura de VF» tiene 75 declarado + 75 de partes y sale 100 — TERMINADA al
  -- 75% real. Eso está bien para pintar una barra y está mal para aprender un rendimiento: si esa
  -- actividad recibe una hora imputada, el ciclo le inventaría la cantidad objetivo entera con
  -- confianza alta y ese número entraría a cotizar.
  (c.metodo_avance = 'manual' and c.pct is not null and c.avance_partes is not null) as avance_sumado,
  c.estado_fecha,
  c.n_partes,
  c.ultimo_parte,
  c.hh_real,
  c.hh_improductivas,
  c.hh_productivas,
  c.n_imputaciones,
  c.inicio_real,
  c.fin_real,
  c.origen_inicio_real,
  c.origen_fin_real,
  -- La duración real sale de las fechas derivadas, no de la columna `dias_real` que nadie escribe.
  case when c.inicio_real is not null and c.fin_real is not null
       then (c.fin_real - c.inicio_real) + 1 end as dias_real,
  dot.dotacion_real,
  cau.causas,
  c.cuadrilla_id,
  comp.composicion,

  -- ═══ LAS TRES COLUMNAS QUE AGREGA XSAS v1 ═══
  --
  -- Van al final porque `create or replace view` sólo admite columnas nuevas al final: lo de arriba
  -- no se toca, ni una coma.
  ac.seccion,
  -- ¿ESTA FILA ES TRABAJO, O ES EL RÓTULO DE UN GRUPO DE TRABAJO?
  --
  -- El cronograma importado trae filas que no son tareas: encabezados de frente («GALPÓN 1»),
  -- rótulos de rubro («Encofrado» sin fechas, con siete hijas debajo) e hitos. Sus fechas son la
  -- ENVOLVENTE de lo que agrupan, no la duración de una tarea, y aprender de ellas mete en la Base
  -- Maestra un número que no corresponde a ningún trabajo. Un hito, además, dura cero días.
  --
  -- La prueba de que agrupa es estructural —tiene hijas— y no depende del rótulo, que lo puso una
  -- importación. El rótulo se usa sólo para los hitos, que no tienen otra marca.
  (ac.tipo is distinct from 'hito'
   and not exists (select 1 from public.obra_actividad h
                    where h.actividad_padre_id = c.actividad_id))    as es_trabajo,
  -- CUÁNTA GENTE IMPUTÓ HORAS DE VERDAD. `dotacion_real` la de arriba cae a los asignados cuando
  -- nadie imputó, y eso alcanza para pintar una pantalla pero no para aprender una dotación: quién
  -- figuraba asignado no es quién estuvo. Esta columna nunca tiene ese respaldo — es el hecho o es
  -- cero, y el cero se lee como «nadie imputó», no como «trabajaron cero personas».
  per.personas_con_hh                                                as dotacion_por_hh

from public.obra_actividad_control c
left join public.obra_actividad     ac on ac.id = c.actividad_id
left join public.obra_canonica      o  on o.id  = c.obra_id
left join public.clientes           cl on cl.id = o.cliente_id
left join public.tarea_tipo         tt on tt.id = c.tarea_tipo_id
left join public.cotizacion_partida cp on cp.id = c.cotizacion_partida_id

-- Cuánta gente estuvo de verdad: personas distintas que imputaron horas a la actividad. La vista
-- canónica cuenta imputaciones (`n_imputaciones`), que no es lo mismo — una persona cinco días son
-- cinco imputaciones y una sola persona.
left join lateral (
  select count(distinct h.persona_id)::int as personas_con_hh
    from public.registros_hh h where h.actividad_id = c.actividad_id
) per on true
left join lateral (
  select coalesce(nullif(per.personas_con_hh, 0),
                  (select count(distinct s.persona_id)::int from public.obra_asignacion s
                    where s.actividad_id = c.actividad_id
                      and (s.hasta is null or s.hasta >= current_date))) as dotacion_real
) dot on true

-- POR QUÉ SE FUE MÁS LENTO DE LO PREVISTO. Las causas de desvío las cargan las personas en el
-- parte y en la imputación de horas, y son la única explicación que viaja con el número: un
-- rendimiento malo con «espera de equipo» detrás no enseña lo mismo que uno sin causa.
left join lateral (
  select jsonb_object_agg(causa, n) as causas from (
    select causa_desvio as causa, count(*)::int n from public.registros_hh
     where actividad_id = c.actividad_id and causa_desvio is not null group by 1
     union all
    select causa_desvio, count(*)::int from public.obra_ejecucion
     where actividad_id = c.actividad_id and causa_desvio is not null group by 1
  ) x where causa is not null
) cau on true

-- CON QUIÉN SE HIZO. La cuadrilla de la actividad, con su composición por categoría: dos
-- rendimientos de la misma tarea con cuadrillas distintas no son comparables sin esto.
left join lateral (
  select jsonb_object_agg(categoria, n) as composicion from (
    select coalesce(p.categoria, 'sin categoría') as categoria, count(*)::int n
      from public.cuadrilla_integrante ci
      join public.personas p on p.id = ci.persona_id
     where ci.cuadrilla_id = c.cuadrilla_id
       and (ci.hasta is null or ci.hasta >= coalesce(c.fin_real, current_date))
     group by 1
  ) y
) comp on true

where c.archivada is not true;

comment on view public.xsas_actividad is
  'El plan y el real de cada actividad, LEÍDOS de obra_actividad_control. No redefine avance, fechas ni cierre: los toma de la vista canónica que usa la app. Agrega es_trabajo (la fila es una tarea y no el rótulo de un grupo) y dotacion_por_hh (personas que imputaron horas de verdad, sin caer a los asignados). Lo que no está cargado sale NULL.';

comment on column public.xsas_actividad.es_trabajo is
  'FALSE cuando la fila agrupa a otras o es un hito: sus fechas son la envolvente de lo que agrupa, no la duración de una tarea. Todo el aprendizaje de obra filtra por esta columna.';
comment on column public.xsas_actividad.dotacion_por_hh is
  'Personas distintas que IMPUTARON horas a la actividad. 0 significa que nadie imputó, no que trabajaron cero personas. Es la única fuente admisible para aprender dotación.';

-- ── 2. LO YA APRENDIDO DE FILAS QUE NO SON TRABAJO SE RETIRA ─────────────────────────────────
--
-- Un filtro nuevo no limpia lo que la corrida anterior ya escribió: el aprendizaje es idempotente
-- por actividad, así que una fila que deja de calificar se queda para siempre con el número viejo.
-- Es la capa fósil de siempre. Se borran acá, una vez, y el filtro impide que vuelvan.

delete from public.duracion_historica d
 where exists (select 1 from public.xsas_actividad v
                where v.actividad_id = d.actividad_id and v.es_trabajo is false);

-- ── 3. LA DOTACIÓN APRENDIDA ────────────────────────────────────────────────────────────────

create table if not exists public.dotacion_historica (
  id                uuid primary key default gen_random_uuid(),
  actividad_id      uuid not null references public.obra_actividad(id) on delete cascade,
  obra_id           text not null,
  tarea_tipo_id     uuid references public.tarea_tipo(id),
  actividad_nombre  text not null,
  -- LA REAL ES OBLIGATORIA Y LA PLANIFICADA NO. El hecho es cuánta gente estuvo; el plan puede no
  -- haber existido nunca —la mayoría de las obras entraron como cronograma sin dotación prevista—
  -- y sin plan el hecho sigue siendo cierto: lo único que falta es el desvío.
  dotacion_real     integer not null check (dotacion_real > 0),
  dotacion_plan     integer check (dotacion_plan > 0),
  desvio_pct        numeric,
  dias_real         numeric,
  fecha_desde       date,
  fecha_hasta       date,
  estado            text not null default 'CANDIDATO'
                      check (estado in ('CANDIDATO', 'VALIDADO', 'DESCARTADO')),
  confianza         text check (confianza in ('alta', 'media', 'baja')),
  veces_confirmado  integer not null default 1,
  evidencia         jsonb,
  clave             text not null unique,
  creado_en         timestamptz not null default now(),
  actualizado_en    timestamptz not null default now()
);

comment on table public.dotacion_historica is
  'Cuánta gente trabajó de verdad en cada actividad, contra la prevista. Es la TERCERA métrica del aprendizaje de obra: rendimiento_historico mide hs/unidad y necesita HH imputadas; duracion_historica mide días y sólo necesita fechas; ésta mide personas y sólo aprende de horas imputadas — nunca de quién figuraba asignado.';
comment on column public.dotacion_historica.dotacion_plan is
  'Nullable a propósito: sin dotación prevista el hecho real sigue siendo cierto, lo único que no se puede calcular es el desvío.';

create index if not exists dotacion_historica_tarea_ix on public.dotacion_historica (tarea_tipo_id)
  where tarea_tipo_id is not null;
create index if not exists dotacion_historica_obra_ix on public.dotacion_historica (obra_id);

alter table public.dotacion_historica enable row level security;

do $$ begin
  create policy dotacion_historica_lee on public.dotacion_historica for select to authenticated using (true);
exception when duplicate_object then null; end $$;

-- Una policy sin GRANT es un permiso denegado: la policy filtra filas, el grant abre la puerta.
grant select on public.dotacion_historica to authenticated;
grant select, insert, update, delete on public.dotacion_historica to service_role;

-- ── 4. LA EXPERIENCIA POR TAREA SUMA LA TERCERA MÉTRICA ─────────────────────────────────────
--
-- Las tres viajan juntas y SEPARADAS, cada una con sus casos y sus obras. La regla de qué es
-- reutilizable es la misma para las tres y no la inventa esta vista: con una sola obra hay un dato,
-- no una referencia.

create or replace view public.experiencia_por_tarea
with (security_invoker = true) as
select
  t.id                                        as tarea_tipo_id,
  t.codigo, t.nombre, t.unidad,
  d.casos                                     as casos_duracion,
  d.obras                                     as obras_duracion,
  d.dias_plan_mediana,
  d.dias_real_mediana,
  d.desvio_pct_mediana,
  d.confianza_minima                          as confianza_duracion,
  r.casos                                     as casos_rendimiento,
  r.obras                                     as obras_rendimiento,
  r.hs_unitarias_mediana,
  r.confianza_minima                          as confianza_rendimiento,
  (coalesce(d.obras, 0) >= 2)                 as duracion_reutilizable,
  (coalesce(r.obras, 0) >= 2)                 as rendimiento_reutilizable,
  o.casos                                     as casos_dotacion,
  o.obras                                     as obras_dotacion,
  o.dotacion_mediana,
  o.confianza_minima                          as confianza_dotacion,
  (coalesce(o.obras, 0) >= 2)                 as dotacion_reutilizable,
  -- EL COSTO POR ACTIVIDAD NO EXISTE, Y LA VISTA LO DICE en vez de dejar una columna en NULL que
  -- se lea como «todavía no se midió». No es que falte el dato: es que no hay de dónde sacarlo.
  'no disponible: costos_reales se imputa por obra, no por actividad'::text as costo_por_tarea
from public.tarea_tipo t
left join lateral (
  select count(*)::int casos, count(distinct obra_id)::int obras,
         percentile_cont(0.5) within group (order by dias_plan)  as dias_plan_mediana,
         percentile_cont(0.5) within group (order by dias_real)  as dias_real_mediana,
         -- EL DESVÍO SÓLO SE PUBLICA CONTRA UN PLAN QUE SIGNIFIQUE ALGO. Un plan de 1 día que tardó
         -- 41 produce +4000%, y con un solo caso por tarea la mediana ES ese número.
         percentile_cont(0.5) within group (order by desvio_pct)
           filter (where dias_plan >= 3)                    as desvio_pct_mediana,
         count(*) filter (where dias_plan < 3)::int          as casos_plan_corto,
         -- Una confianza sin declarar es lo MENOS confiable que hay, no lo más.
         min(case confianza when 'alta' then 2 when 'media' then 1 else 0 end) conf
    from public.duracion_historica x where x.tarea_tipo_id = t.id and x.estado <> 'DESCARTADO'
) dd on true
left join lateral (select dd.casos, dd.obras, dd.dias_plan_mediana, dd.dias_real_mediana,
                         dd.desvio_pct_mediana, dd.casos_plan_corto,
                         (array['baja','media','alta'])[dd.conf + 1] as confianza_minima) d on true
left join lateral (
  select count(*)::int casos, count(distinct obra_id)::int obras,
         percentile_cont(0.5) within group (order by hs_unitarias) as hs_unitarias_mediana,
         min(case confianza when 'alta' then 2 when 'media' then 1 else 0 end) conf
    from public.rendimiento_historico x
   where x.tarea_tipo_id = t.id and x.estado <> 'DESCARTADO' and x.hs_unitarias is not null
) rr on true
left join lateral (select rr.casos, rr.obras, rr.hs_unitarias_mediana,
                         (array['baja','media','alta'])[rr.conf + 1] as confianza_minima) r on true
left join lateral (
  select count(*)::int casos, count(distinct obra_id)::int obras,
         percentile_cont(0.5) within group (order by dotacion_real) as dotacion_mediana,
         min(case confianza when 'alta' then 2 when 'media' then 1 else 0 end) conf
    from public.dotacion_historica x where x.tarea_tipo_id = t.id and x.estado <> 'DESCARTADO'
) oo on true
left join lateral (select oo.casos, oo.obras, oo.dotacion_mediana,
                         (array['baja','media','alta'])[oo.conf + 1] as confianza_minima) o on true
where t.activo is not false;

comment on view public.experiencia_por_tarea is
  'Lo que Echegaray aprendió de cada tarea, con las TRES métricas SEPARADAS (duración, rendimiento, dotación) y su cantidad de casos y obras. Reutilizable pide dos obras distintas: con una hay un dato, no una referencia. El costo por tarea no existe y la vista lo declara.';

grant select on public.experiencia_por_tarea to authenticated, service_role;
