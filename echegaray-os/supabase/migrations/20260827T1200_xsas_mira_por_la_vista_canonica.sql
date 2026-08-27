-- XSAS DEJA DE TENER SU PROPIA IDEA DEL AVANCE, LAS FECHAS Y EL CIERRE.
--
-- ═══ LA CAUSA RAÍZ DE LA COBERTURA BAJA (27/08/2026) ═══
--
-- Ayer XSAS publicó «5 actividades con real, 0 con fechas reales, ninguna cerrada» y la conclusión
-- fue que el circuito operativo no producía hechos. **Era falso.** El circuito los producía:
-- `obra_actividad_control` —la vista canónica que la app ya usa— tenía en ese mismo momento 270
-- actividades con avance, **152 con inicio real, 127 con fin real y 131 terminadas**.
--
-- El defecto era de `xsas_actividad`, que se había construido sobre las tablas crudas y volvía a
-- decidir por su cuenta qué es el avance, cuándo empieza una actividad y cuándo termina. Cuatro
-- definiciones nuevas de conceptos que ya estaban definidos, y todas peores:
--
--   · el avance, que en la vista sale del `metodo_avance` de cada actividad —cantidad, partes,
--     pasos o manual—; acá era «el máximo avance_pct de los partes», que para las 27 actividades
--     medidas por cantidad da NULL.
--   · el inicio real, que es la fecha de la primera evidencia (parte o imputación de HH);
--     acá se leía la columna declarada, que no la escribe nadie: 350 NULL.
--   · el fin real, que es la fecha de la última evidencia **cuando la actividad está terminada**.
--   · terminada, que es `estado = 'hecha' o avance >= 100`.
--
-- Un módulo que redefine por su cuenta un concepto que el sistema ya tiene no produce un error:
-- produce un número distinto, y después una conclusión equivocada sobre la empresa. Se corrige de
-- la única forma que sirve: mirando por donde miran los demás.
--
-- No se toca `obra_actividad_control`. Esta vista pasa a ser una LECTURA de ella.

drop view if exists public.xsas_obra;
drop view if exists public.xsas_actividad;

create view public.xsas_actividad
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
  comp.composicion

from public.obra_actividad_control c
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
  'El plan y el real de cada actividad, LEÍDOS de obra_actividad_control. No redefine avance, fechas ni cierre: los toma de la vista canónica que usa la app. Lo que no está cargado sale NULL.';

create view public.xsas_obra
with (security_invoker = true) as
select
  o.id                                    as obra_id,
  o.nombre                                as obra,
  coalesce(c.nombre_comercial, c.razon_social, o.cliente_texto) as cliente,
  o.cliente_id,
  o.estado,
  o.etapa,
  o.jefe_obra,
  o.contrato_monto,
  o.contrato_moneda,
  o.monto_contratado,
  o.fecha_inicio_plan, o.fecha_fin_plan, o.fecha_inicio_real, o.fecha_fin_real,
  act.actividades,
  act.con_plan_hh,
  act.con_hh_real,
  act.terminadas,
  act.plan_hh,
  act.hh_real,
  act.primera_evidencia,
  act.ultima_evidencia,
  -- El avance de la obra pesado por las HH planificadas: una actividad de 300 hs no avanza lo mismo
  -- que una de 3. Sin HH plan en ninguna actividad sale NULL, que es la verdad.
  act.avance_ponderado_pct,
  act.avance_simple_pct,
  cos.costo_real,
  cos.costo_real_puente,
  case when o.monto_contratado is not null and cos.costo_real is not null
       then o.monto_contratado - cos.costo_real end as contrato_menos_costo_cargado
from public.obra_canonica o
left join public.clientes c on c.id = o.cliente_id
left join lateral (
  select count(*)::int                                                     as actividades,
         count(*) filter (where v.plan_hh is not null)::int                as con_plan_hh,
         count(*) filter (where v.hh_real is not null)::int                as con_hh_real,
         count(*) filter (where v.terminada)::int                          as terminadas,
         sum(v.plan_hh)                                                    as plan_hh,
         sum(v.hh_real)                                                    as hh_real,
         min(v.inicio_real)                                                as primera_evidencia,
         max(v.ultimo_parte)                                               as ultima_evidencia,
         case when sum(v.plan_hh) > 0
              then sum(v.plan_hh * coalesce(v.avance_pct, 0)) / sum(v.plan_hh) end as avance_ponderado_pct,
         -- El promedio simple, para las obras que no tienen HH planificadas. Vale MENOS que el
         -- ponderado —trata igual una actividad de 300 hs y una de 3— y por eso va en otra columna
         -- con otro nombre, no rellenando la de arriba.
         avg(v.avance_pct) filter (where v.avance_pct is not null)          as avance_simple_pct
    from public.xsas_actividad v
   where v.obra_id = o.id
) act on true
left join lateral (
  select case when e.cuantas = 1 then
           (select sum(r.monto) from public.costos_reales r where r.obra_id = e.unica) end as costo_real,
         case when e.cuantas = 1 then 'nombre exacto'
              when e.cuantas = 0 then 'sin obra equivalente en public.obras'
              else 'ambiguo: ' || e.cuantas::text || ' obras con ese nombre' end as costo_real_puente
    from (select count(*)::int as cuantas, min(x.id::text)::uuid as unica
            from public.obras x
           where lower(btrim(x.nombre)) = lower(btrim(o.nombre))) e
) cos on true;

comment on view public.xsas_obra is
  'La obra vista desde XSAS: cliente, contrato, avance ponderado por HH planificadas, actividades terminadas y costo cargado. El resultado es PARCIAL y el nombre de la columna lo dice.';

grant select on public.xsas_actividad to authenticated, service_role;
grant select on public.xsas_obra      to authenticated, service_role;
