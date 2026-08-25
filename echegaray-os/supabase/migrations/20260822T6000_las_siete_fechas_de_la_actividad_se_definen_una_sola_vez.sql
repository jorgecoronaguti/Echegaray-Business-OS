-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS SIETE FECHAS DE UNA ACTIVIDAD SE DEFINEN UNA SOLA VEZ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ LO QUE SE MIDIÓ EN LA BASE PRODUCTIVA (22/08/2026) ═══
--
--   · 350 actividades. 196 con `inicio_plan`, 162 con línea base sellada, **0 con `inicio_real`**.
--   · 242 partes de ejecución sobre 145 actividades, y 117 actividades en estado `hecha`.
--
-- O sea: la evidencia de que una actividad arrancó y terminó EXISTE —el parte de avance tiene
-- fecha— y ninguna pantalla la usaba como fecha real, porque todas leían la columna `inicio_real`
-- de la tabla, que nadie llena. El resultado es que una tarea cerrada el 5 de agosto se publica
-- como «terminada» sin fecha, y una tarea abierta hace un mes no puede distinguirse de una que
-- todavía no arrancó.
--
-- ═══ LA SEMÁNTICA CANÓNICA — cuatro pares y un cálculo ═══
--
--   1. LÍNEA BASE (`inicio_base`/`fin_base`): contra qué se mide el desvío. Existe SÓLO si está
--      sellada (`sellada_en`). Una base sin sello es una base a medio sellar, y publicarla como
--      línea base convierte un borrador en el patrón de medida.
--   2. PLAN VIGENTE (`inicio_plan`/`fin_plan`): lo editable, contra lo que se trabaja hoy. NUNCA
--      se rellena con la base ni con el real: rellenarlo hace que una actividad sin plan parezca
--      planificada y desaparezca de la lista de lo que falta programar.
--   3. REAL (`inicio_real`/`fin_real`): SÓLO DE EVIDENCIA —el parte de ejecución y la imputación
--      de horas—, nunca de una declaración. Y NUNCA FUTURO: un «real» posterior a hoy no es un
--      hecho, es un plan mal rotulado. El `fin_real` además exige que la actividad esté terminada:
--      el último parte de una actividad abierta es el último parte, no su fecha de cierre.
--   4. FORECAST FIN: cuándo va a terminar de verdad, al ritmo medido. Terminada → su fecha real;
--      en curso o atrasada → hoy + los días que faltan al ritmo real; sin ritmo → el plan. Y nunca
--      antes de hoy mientras no esté terminada: lo que no terminó no pudo terminar ayer.
--
-- ═══ POR QUÉ TRES VISTAS NUEVAS Y NO UNA ═══
--
-- `forecast_fin` necesita los días que faltan, que salen del ritmo (HH restantes ÷ dotación), que
-- a su vez necesita el avance medido. Todo eso YA estaba calculado, pero adentro de
-- `obra_actividad_control` y de `obra_actividad_forecast`, que son las vistas que tienen que
-- CONSUMIR las fechas. Copiar las fórmulas para romper el ciclo habría dejado dos definiciones del
-- mismo número — exactamente el defecto que esta migración corrige. Así que el cálculo baja a tres
-- vistas base y las dos grandes pasan a leer de ellas:
--
--     actividad_avance  →  actividad_ritmo  →  actividad_fechas  →  obra_actividad_control
--                                                               →  obra_actividad_forecast
--
-- Ninguna fórmula quedó duplicada: `obra_actividad_control` y `obra_actividad_forecast` no
-- calculan más avance, ni ritmo, ni fechas — las leen.
--
-- `with (security_invoker = true)` se repite EXPRESAMENTE en cada `create or replace`: la que no
-- lo repite BORRA la opción y abre la vista a quien no debería verla (pasó con `cliente_panel` el
-- 19/08). Las vistas nuevas nacen con la opción puesta y con el `grant` explícito: una policy sin
-- grant no se evalúa, y PostgREST lo devuelve como 404.

-- ── 1 · el avance medido de la actividad ──────────────────────────────────────────────────────
-- Sale tal cual estaba dentro de `obra_actividad_control` (mismos cuatro métodos, mismo redondeo,
-- mismo tope de 100): acá sólo cambia de lugar, para que el ritmo y las fechas puedan leerlo sin
-- depender de la vista que después las consume.
create or replace view public.actividad_avance with (security_invoker = true) as
select
  a.id                                    as actividad_id,
  a.obra_id,
  e.cantidad_ejecutada,
  e.avance_partes,
  e.n_partes,
  e.primer_parte,
  e.ultimo_parte,
  ps.n_pasos,
  ps.n_pasos_hechos,
  ps.peso_total                           as peso_pasos,
  ps.peso_hecho,
  case a.metodo_avance
    when 'cantidad' then case when a.cantidad_objetivo > 0
      then least(100::numeric, round(coalesce(e.cantidad_ejecutada, 0) / a.cantidad_objetivo * 100, 1)) end
    when 'partes'   then least(100::numeric, round(coalesce(e.avance_partes, 0), 1))
    when 'pasos'    then case when ps.peso_total > 0
      then round(coalesce(ps.peso_hecho, 0) / ps.peso_total * 100, 1) end
    else a.pct
  end                                     as avance_pct,
  case a.metodo_avance
    when 'cantidad' then 'cantidad'
    when 'partes'   then 'partes'
    when 'pasos'    then 'pasos'
    else case when a.pct is not null then 'declarado' end
  end                                     as origen_avance
from public.obra_actividad a
left join lateral (
  select sum(x.cantidad)      as cantidad_ejecutada,
         sum(x.avance_pct)    as avance_partes,
         count(*)::integer    as n_partes,
         min(x.fecha)         as primer_parte,
         max(x.fecha)         as ultimo_parte
  from public.obra_ejecucion x where x.actividad_id = a.id
) e on true
left join lateral (
  select count(*)::integer                                        as n_pasos,
         count(*) filter (where x.hecho_en is not null)::integer   as n_pasos_hechos,
         sum(x.peso)                                              as peso_total,
         sum(x.peso) filter (where x.hecho_en is not null)         as peso_hecho
  from public.obra_actividad_paso x where x.actividad_id = a.id
) ps on true;

grant select on public.actividad_avance to authenticated, service_role;

-- ── 2 · el ritmo: cuántas horas y cuántos días faltan ─────────────────────────────────────────
-- Es la mitad de arriba de `obra_actividad_forecast`, sacada afuera. El criterio no cambia: si hay
-- producción propia manda el ritmo REAL (horas productivas por unidad ya ejecutada); si todavía no
-- hay, se proyecta con el ritmo del PLAN y se declara que es una inferencia; si no hay ninguna de
-- las dos, no hay forecast — y eso también se dice.
create or replace view public.actividad_ritmo with (security_invoker = true) as
with base as (
  select
    a.id            as actividad_id,
    a.obra_id,
    a.hh_plan,
    a.metodo_avance,
    a.cantidad_objetivo,
    av.cantidad_ejecutada,
    av.avance_pct,
    ah.hh_productivas,
    coalesce(a.dotacion_prevista, padre.dotacion_prevista)         as dotacion,
    coalesce(o.jornada_horas, 8)                                    as jornada,
    case when coalesce(av.cantidad_ejecutada, 0) > 0 and coalesce(ah.hh_productivas, 0) > 0
      then ah.hh_productivas / av.cantidad_ejecutada end            as rendimiento_real,
    case when a.metodo_avance = 'cantidad' and a.cantidad_objetivo is not null
      then greatest(a.cantidad_objetivo - coalesce(av.cantidad_ejecutada, 0), 0) end as cantidad_restante,
    case when av.avance_pct is not null
      then greatest(1 - av.avance_pct / 100.0, 0) end               as fraccion_restante
  from public.obra_actividad a
  join public.actividad_avance av on av.actividad_id = a.id
  join public.actividad_horas ah on ah.actividad_id = a.id
  left join public.obra_actividad padre on padre.id = a.actividad_padre_id
  left join public.obra_canonica o on o.id = a.obra_id
)
select
  b.actividad_id,
  b.obra_id,
  b.dotacion                                                        as dotacion_prevista,
  b.jornada                                                         as jornada_horas,
  round(b.rendimiento_real, 4)                                      as rendimiento_real,
  case when b.cantidad_objetivo > 0 and b.hh_plan is not null
    then round(b.hh_plan / b.cantidad_objetivo, 4) end               as rendimiento_plan,
  b.cantidad_restante,
  b.fraccion_restante,
  round(hh.hh_restantes, 2)                                          as hh_restantes,
  public.duracion_dias(hh.hh_restantes, b.dotacion::numeric, b.jornada, 0) as dias_restantes,
  case
    when b.rendimiento_real is not null and b.cantidad_restante is not null
      then 'ritmo real: horas productivas por unidad ya ejecutada · CÁLCULO'
    when b.hh_plan is not null and b.fraccion_restante is not null
      then 'ritmo del plan: no hay producción propia todavía · INFERENCIA'
    else 'sin base: la actividad no tiene HH previstas ni producción medida'
  end                                                                as base_del_forecast
from base b
left join lateral (
  select case
    when b.rendimiento_real is not null and b.cantidad_restante is not null
      then b.cantidad_restante * b.rendimiento_real
    when b.hh_plan is not null and b.fraccion_restante is not null
      then b.hh_plan * b.fraccion_restante
  end as hh_restantes
) hh on true;

grant select on public.actividad_ritmo to authenticated, service_role;

-- ── 3 · LA FUENTE ÚNICA DE LAS FECHAS ─────────────────────────────────────────────────────────
create or replace view public.actividad_fechas with (security_invoker = true) as
with ev as (
  -- LA EVIDENCIA, Y NADA MÁS. Un parte de avance y una imputación de horas son hechos con fecha:
  -- alguien estuvo ahí ese día. Se descarta lo posterior a hoy en la FUENTE —no en cada pantalla—
  -- porque una carga con la fecha mal tipeada no puede convertirse en «arrancó la semana que viene».
  select a.id as actividad_id,
         min(x.fecha) filter (where x.origen = 'ejecucion') as primer_parte,
         max(x.fecha) filter (where x.origen = 'ejecucion') as ultimo_parte,
         min(x.fecha) filter (where x.origen = 'hh')        as primera_hh,
         max(x.fecha) filter (where x.origen = 'hh')        as ultima_hh,
         min(x.fecha)                                        as primera,
         max(x.fecha)                                        as ultima
  from public.obra_actividad a
  left join lateral (
    select e.fecha, 'ejecucion'::text as origen from public.obra_ejecucion e
      where e.actividad_id = a.id and e.fecha <= current_date
    union all
    select r.fecha, 'hh'::text from public.registros_hh r
      where r.actividad_id = a.id and r.fecha <= current_date
  ) x on true
  group by a.id
)
select
  a.id                                                        as actividad_id,
  a.obra_id,
  a.tipo,
  a.archivada,

  -- 1 · LÍNEA BASE — sólo con sello. Sin sello no hay contra qué medir, y se dice.
  case when a.sellada_en is not null then a.inicio_base end   as inicio_base,
  case when a.sellada_en is not null then a.fin_base   end    as fin_base,
  a.sellada_en,

  -- 2 · PLAN VIGENTE — tal cual está, sin rellenos.
  a.inicio_plan,
  a.fin_plan,

  -- 3 · REAL — de la evidencia, nunca del futuro.
  ev.primera                                                  as inicio_real,
  case when term.terminada then ev.ultima end                 as fin_real,
  case when ev.primera is null then null
       when ev.primer_parte is not null and (ev.primera_hh is null or ev.primer_parte <= ev.primera_hh)
         then 'parte de avance' else 'imputación de HH' end   as origen_inicio_real,
  case when not term.terminada or ev.ultima is null then null
       when ev.ultimo_parte is not null and (ev.ultima_hh is null or ev.ultimo_parte >= ev.ultima_hh)
         then 'parte de avance' else 'imputación de HH' end   as origen_fin_real,
  -- Lo que alguien escribió a mano (o trajo el Sheet) viaja como PROCEDENCIA, no como fecha real:
  -- se puede mostrar rotulado «declarado», pero no entra en `inicio_real`/`fin_real`.
  a.inicio_real                                               as inicio_real_declarado,
  a.fin_real                                                  as fin_real_declarado,

  -- 4 · FORECAST FIN — terminada: su fecha real. Si no: hoy + lo que falta al ritmo medido, y como
  -- piso el plan. Nunca antes de hoy mientras no esté terminada.
  case
    when term.terminada then ev.ultima
    when r.dias_restantes is not null
      then greatest(public.sumar_dias_habiles(a.obra_id, current_date, r.dias_restantes), current_date)
    when a.fin_plan is not null then greatest(a.fin_plan, current_date)
  end                                                          as forecast_fin,
  case
    when term.terminada then 'terminada: la fecha del último parte · DATO REAL'
    when r.dias_restantes is not null then r.base_del_forecast
    when a.fin_plan is not null then 'sin ritmo medible: se publica el fin del plan · ESTIMACIÓN'
    else 'sin base: la actividad no tiene plan ni producción medida'
  end                                                          as base_del_forecast,
  r.dias_restantes,
  r.hh_restantes,

  -- 5 · SIN FECHA ES UN ESTADO, Y ES EL MISMO EN TODAS LAS PANTALLAS.
  (a.inicio_plan is not null or a.fin_plan is not null)        as tiene_fecha_plan,
  (a.inicio_plan is not null or a.fin_plan is not null
   or a.sellada_en is not null or ev.primera is not null)      as tiene_fecha,
  -- TERMINADA ES DEL TRABAJO, `estado_fecha` ES DE LAS FECHAS. Son dos preguntas distintas y
  -- confundirlas cuesta caro en las dos direcciones: si «terminada» exigiera evidencia, las cinco
  -- actividades de Quattropani declaradas al 100 % sin un solo parte se contarían atrasadas; si
  -- `fin_real` no la exigiera, se inventaría una fecha de cierre que nadie registró.
  term.terminada,
  case
    when term.terminada                                      then 'terminada'
    when ev.primera is not null                              then 'en_curso'
    when a.inicio_plan is not null or a.fin_plan is not null then 'planificada'
    else 'sin_fecha'
  end                                                          as estado_fecha,
  -- El desvío del plan contra su propia línea base, en días. Sin sello no hay desvío: hay un plan.
  case when a.sellada_en is not null and a.fin_base is not null and a.fin_plan is not null
    then a.fin_plan - a.fin_base end                           as desvio_plan_dias,
  -- Y el desvío de lo que va a pasar contra lo planificado.
  case when a.fin_plan is not null then
    case
      when term.terminada and ev.ultima is not null then ev.ultima - a.fin_plan
      when r.dias_restantes is not null
        then greatest(public.sumar_dias_habiles(a.obra_id, current_date, r.dias_restantes), current_date) - a.fin_plan
    end
  end                                                          as desvio_forecast_dias
from public.obra_actividad a
left join ev on ev.actividad_id = a.id
left join public.actividad_ritmo r on r.actividad_id = a.id
left join lateral (
  select (a.estado = 'hecha' or coalesce(av.avance_pct, 0) >= 100) as terminada
  from public.actividad_avance av where av.actividad_id = a.id
) term on true;

grant select on public.actividad_fechas to authenticated, service_role;

comment on view public.actividad_fechas is
  'FUENTE ÚNICA de las fechas de una actividad: línea base sellada, plan vigente, real SÓLO de '
  'evidencia y nunca futuro, y forecast de fin. Toda pantalla que muestre una fecha de actividad '
  'la lee de acá — no de obra_actividad.';
