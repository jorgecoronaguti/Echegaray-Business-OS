-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LA VISTA DEVOLVÍA NUEVE ACTIVIDADES DE MÁS QUE LA TABLA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
--     obra_actividad          350 filas
--     obra_actividad_control  359 filas
--
-- El nombre del rubro se traía con un `left join` contra las actividades de resumen por
-- `(obra_id, codigo)`, y ESO NO ES ÚNICO: en Messina hay dos resúmenes con código «1», dos con «2» y
-- dos con «3». Un join contra dos filas devuelve la actividad DOS VECES.
--
-- Se notó en el navegador antes que en ningún número: React avisó «Encountered two children with the
-- same key» nueve veces. Sin ese aviso, el Gantt y la Lista habrían mostrado nueve actividades
-- duplicadas y los promedios de avance de la obra habrían contado dos veces las mismas — una obra
-- informando un avance que no tiene, por un join.
--
-- El código del tracker NO es una clave y no puede tratarse como tal: la columna `#` de «Avances de
-- Obra» arranca como código y a la mitad de algunas pestañas pasa a ser una cantidad. El rubro pasa
-- a resolverse con una subconsulta escalar, que devuelve UNA fila o ninguna por definición.

drop view if exists public.obra_actividad_control;

create view public.obra_actividad_control with (security_invoker = true) as
select
    a.id                as actividad_id,
    a.id,
    a.obra_id, a.codigo, a.codigo_padre, a.nombre, a.tipo, a.orden, a.seccion, a.archivada,
    a.clave, a.dias_plan, a.dias_real, a.editado_a_mano, a.fuente_pestana, a.creada_en_web,
    a.cuadrilla,
    -- UNA fila o ninguna, por definición. `order by orden` para que, con el código repetido, la
    -- elegida sea siempre la misma y no cambie de una consulta a la otra.
    (select p.nombre from public.obra_actividad p
      where p.obra_id = a.obra_id and p.codigo = a.codigo_padre and p.tipo = 'resumen'
      order by p.orden limit 1) as rubro,
    a.estado,
    a.unidad, a.cantidad_objetivo, a.metodo_avance,
    a.inicio_plan, a.fin_plan, a.inicio_base, a.fin_base, a.sellada_en, a.inicio_real, a.fin_real,
    a.hh_plan, a.responsable_id, a.cuadrilla_id,
    (select c.nombre from public.cuadrilla c where c.id = a.cuadrilla_id) as cuadrilla_prevista,
    a.comentario, a.partida_codigo, a.partida_cantidad,
    a.pct,
    a.pct               as avance_declarado,
    e.cantidad_ejecutada, e.avance_partes, e.n_partes, e.ultimo_parte,
    h.hh_real, h.hh_extra,
    coalesce(h.n_imputaciones, 0)::integer as n_imputaciones,
    coalesce(imp.abiertos, 0)::integer      as impedimentos_abiertos,

    case a.metodo_avance
      when 'cantidad' then case when a.cantidad_objetivo > 0
        then least(100, round(coalesce(e.cantidad_ejecutada, 0) / a.cantidad_objetivo * 100, 1)) end
      when 'partes' then least(100, round(coalesce(e.avance_partes, 0), 1))
      else a.pct
    end as avance_pct,

    case a.metodo_avance
      when 'cantidad' then 'cantidad'
      when 'partes' then 'partes'
      else case when a.pct is not null then 'declarado' end
    end as origen_avance,

    case when coalesce(imp.abiertos, 0) > 0 then 'bloqueada' else a.estado end as estado_operativo,

    case when e.cantidad_ejecutada > 0 and h.hh_real > 0
      then round(e.cantidad_ejecutada / h.hh_real, 3) end as productividad,
    case when a.hh_plan > 0 and h.hh_real is not null
      then round(h.hh_real / a.hh_plan * 100, 1) end as consumo_hh_pct
  from public.obra_actividad a
  left join lateral (
    select sum(x.cantidad) as cantidad_ejecutada, sum(x.avance_pct) as avance_partes,
           count(*)::integer as n_partes, max(x.fecha) as ultimo_parte
      from public.obra_ejecucion x where x.actividad_id = a.id) e on true
  left join lateral (
    select sum(r.horas) filter (where r.tipo_hora in ('normal', 'extra_50', 'extra_100')) as hh_real,
           sum(r.horas) filter (where r.tipo_hora in ('extra_50', 'extra_100'))           as hh_extra,
           count(*) filter (where r.tipo_hora in ('normal', 'extra_50', 'extra_100'))     as n_imputaciones
      from public.registros_hh r where r.actividad_id = a.id) h on true
  left join lateral (
    select count(*)::integer as abiertos from public.obra_restriccion x
     where x.actividad_id = a.id and x.fecha_liberacion is null) imp on true;

grant select on public.obra_actividad_control to authenticated;
