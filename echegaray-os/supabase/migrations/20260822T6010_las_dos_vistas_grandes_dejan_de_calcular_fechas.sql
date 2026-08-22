-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS DOS VISTAS GRANDES DEJAN DE CALCULAR Y PASAN A LEER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- `obra_actividad_control` es la vista que leen la ficha de la obra, el panel del jefe, el parte de
-- campo, las tareas, los subcontratos y el cronograma: TODO lo que muestra una actividad sale de
-- acá. Hasta hoy publicaba `a.inicio_real`/`a.fin_real` crudas de la tabla —la columna que nadie
-- llena— y calculaba el avance adentro. Ahora las fechas las lee de `actividad_fechas` y el avance
-- de `actividad_avance`, así que las nueve pantallas quedan sobre la misma definición sin tocar una
-- sola de ellas.
--
-- Las columnas viejas conservan NOMBRE, TIPO Y ORDEN —`create or replace view` no admite otra cosa
-- cuando hay vistas colgadas (`obra_avance`, `rendimiento_a_capturar`, `obra_actividad_forecast`)—
-- y lo nuevo se agrega al final. Lo que cambia es de DÓNDE sale cada valor, no cómo se llama:
--
--   · `inicio_real`/`fin_real` → evidencia, nunca futuro, y el fin sólo si terminó.
--   · lo declarado a mano sigue disponible, rotulado `*_declarado`, para poder mostrarlo como lo
--     que es sin volver a confundirlo con un hecho.
--
-- `with (security_invoker = true)` va repetido en las dos: omitirlo lo BORRA.

create or replace view public.obra_actividad_control with (security_invoker = true) as
select
  a.id                                as actividad_id,
  a.id,
  a.obra_id,
  a.codigo,
  a.codigo_padre,
  a.nombre,
  a.tipo,
  a.orden,
  a.seccion,
  a.archivada,
  a.clave,
  a.dias_plan,
  a.dias_real,
  a.editado_a_mano,
  a.fuente_pestana,
  a.creada_en_web,
  a.cuadrilla,
  (select p.nombre from public.obra_actividad p
    where p.obra_id = a.obra_id and p.codigo = a.codigo_padre and p.tipo = 'resumen'
    order by p.orden limit 1)          as rubro,
  a.estado,
  a.unidad,
  a.cantidad_objetivo,
  a.metodo_avance,

  -- ── LAS FECHAS SALEN DE `actividad_fechas` Y DE NINGÚN OTRO LADO ──
  f.inicio_plan,
  f.fin_plan,
  f.inicio_base,
  f.fin_base,
  f.sellada_en,
  f.inicio_real,
  f.fin_real,

  a.hh_plan,
  a.responsable_id,
  a.cuadrilla_id,
  (select c.nombre from public.cuadrilla c where c.id = a.cuadrilla_id) as cuadrilla_prevista,
  a.comentario,
  a.partida_codigo,
  a.partida_cantidad,
  a.pct,
  a.pct                                as avance_declarado,
  av.cantidad_ejecutada,
  av.avance_partes,
  av.n_partes,
  av.ultimo_parte,
  h.hh_real,
  h.hh_extra,
  coalesce(h.n_imputaciones, 0)::integer as n_imputaciones,
  coalesce(imp.abiertos, 0)            as impedimentos_abiertos,
  av.avance_pct,
  av.origen_avance,
  case when coalesce(imp.abiertos, 0) > 0 then 'bloqueada' else a.estado end as estado_operativo,
  case when av.cantidad_ejecutada > 0 and ah.hh_productivas > 0
    then round(av.cantidad_ejecutada / ah.hh_productivas, 3) end as productividad,
  case when a.hh_plan > 0 and h.hh_real is not null
    then round(h.hh_real / a.hh_plan * 100, 1) end               as consumo_hh_pct,
  a.actividad_padre_id,
  coalesce(t.n_tareas, 0)              as n_tareas,
  coalesce(t.n_tareas_hechas, 0)       as n_tareas_hechas,
  coalesce(ped.n_pedidos, 0)           as n_pedidos,
  coalesce(nt.n_notas, 0)              as n_notas,
  coalesce(doc.n_documentos, 0)        as n_documentos,
  coalesce(eq.n_equipos, 0)            as n_equipos,
  coalesce(av.n_pasos, 0)              as n_pasos,
  coalesce(av.n_pasos_hechos, 0)       as n_pasos_hechos,
  av.peso_pasos,
  a.rol_estructura,
  a.tope_frente,
  a.dotacion_prevista,
  a.analisis_id,
  a.tarea_tipo_id,
  a.cotizacion_partida_id,
  a.tiempo_tecnico,
  ah.hh_improductivas,
  ah.hh_productivas,
  ah.n_incidencias,

  -- ── LO NUEVO: la procedencia de cada fecha, el forecast y el estado de fecha ──
  f.inicio_real_declarado,
  f.fin_real_declarado,
  f.origen_inicio_real,
  f.origen_fin_real,
  f.forecast_fin,
  f.base_del_forecast,
  f.dias_restantes,
  f.tiene_fecha,
  f.tiene_fecha_plan,
  f.estado_fecha,
  f.desvio_plan_dias,
  f.desvio_forecast_dias
from public.obra_actividad a
join public.actividad_horas ah on ah.actividad_id = a.id
join public.actividad_fechas f on f.actividad_id = a.id
join public.actividad_avance av on av.actividad_id = a.id
left join lateral (
  select sum(r.horas) filter (where r.tipo_hora = any (array['normal','extra_50','extra_100'])) as hh_real,
         sum(r.horas) filter (where r.tipo_hora = any (array['extra_50','extra_100']))          as hh_extra,
         count(*)     filter (where r.tipo_hora = any (array['normal','extra_50','extra_100'])) as n_imputaciones
  from public.registros_hh r where r.actividad_id = a.id
) h on true
left join lateral (
  select count(*)::integer as abiertos from public.obra_restriccion x
   where x.actividad_id = a.id and x.fecha_liberacion is null
) imp on true
left join lateral (
  select count(*)::integer as n_tareas,
         count(*) filter (where x.estado = 'hecha')::integer as n_tareas_hechas
  from public.obra_actividad x where x.actividad_padre_id = a.id and not x.archivada
) t on true
left join lateral (
  select count(*)::integer as n_pedidos from public.pedidos_materiales x where x.actividad_id = a.id
) ped on true
left join lateral (
  select count(*)::integer as n_notas from public.obra_actividad_nota x where x.actividad_id = a.id
) nt on true
left join lateral (
  select count(*)::integer as n_documentos from public.obra_documento x where x.actividad_id = a.id
) doc on true
left join lateral (
  select count(distinct x.equipo)::integer as n_equipos
  from public.obra_ejecucion_equipo x join public.obra_ejecucion p on p.id = x.ejecucion_id
  where p.actividad_id = a.id
) eq on true;

-- ── El forecast de HORAS deja de traer fechas por su cuenta ────────────────────────────────────
-- Publicaba `inicio_real`/`fin_real` copiadas de la tabla y NO publicaba una fecha de fin: decía
-- «faltan 4 días» sin decir 4 días desde cuándo. Ahora lee el ritmo de `actividad_ritmo` (el mismo
-- que alimenta el forecast de fecha: una sola definición de «cuánto falta») y la fecha de
-- `actividad_fechas`.
create or replace view public.obra_actividad_forecast with (security_invoker = true) as
select
  c.actividad_id,
  c.obra_id,
  c.nombre,
  c.unidad,
  c.metodo_avance,
  c.cantidad_objetivo,
  c.cantidad_ejecutada,
  r.cantidad_restante,
  c.avance_pct,
  c.hh_plan,
  ah.hh_real,
  ah.hh_improductivas,
  ah.hh_productivas,
  r.rendimiento_real,
  r.rendimiento_plan,
  r.hh_restantes,
  case when r.hh_restantes is not null
    then round(coalesce(ah.hh_real, 0) + r.hh_restantes, 2) end                    as hh_forecast,
  case when r.hh_restantes is not null and c.hh_plan is not null
    then round(coalesce(ah.hh_real, 0) + r.hh_restantes - c.hh_plan, 2) end        as desvio_hh,
  case when r.hh_restantes is not null and c.hh_plan > 0
    then round((coalesce(ah.hh_real, 0) + r.hh_restantes - c.hh_plan) / c.hh_plan * 100, 1) end as desvio_hh_pct,
  r.dias_restantes,
  r.dotacion_prevista,
  r.jornada_horas,
  f.inicio_plan,
  f.fin_plan,
  f.inicio_base,
  f.fin_base,
  f.inicio_real,
  f.fin_real,
  r.base_del_forecast,
  f.forecast_fin,
  f.desvio_forecast_dias,
  f.estado_fecha
from public.obra_actividad_control c
join public.actividad_horas ah on ah.actividad_id = c.actividad_id
join public.actividad_fechas f on f.actividad_id = c.actividad_id
join public.actividad_ritmo r on r.actividad_id = c.actividad_id
where c.tipo <> 'resumen' and not c.archivada;
