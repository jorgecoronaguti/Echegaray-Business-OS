-- La vista de control publica el vínculo de tarea y cuántas tiene cada actividad; `obra_avance`
-- las EXCLUYE del promedio. Si contaran, una actividad partida en seis pesaría siete veces contra
-- una que nadie partió, y la obra informaría un avance que depende de cuánto se detalló el plan.

-- `create or replace` Y NO `drop`: de esta vista cuelgan obra_avance → obra_panel → obra_plan_vs_real
-- y cliente_panel. Reemplazar sólo puede AGREGAR columnas al final, así que las cuatro nuevas van
-- al final aunque queden lejos de lo que se les parece.
create or replace view public.obra_actividad_control with (security_invoker = true) as
select
    a.id                as actividad_id,
    a.id,
    a.obra_id, a.codigo, a.codigo_padre, a.nombre, a.tipo, a.orden, a.seccion, a.archivada,
    a.clave, a.dias_plan, a.dias_real, a.editado_a_mano, a.fuente_pestana, a.creada_en_web,
    a.cuadrilla,
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
      then round(h.hh_real / a.hh_plan * 100, 1) end as consumo_hh_pct,

    -- LAS CUATRO NUEVAS, AL FINAL POR OBLIGACIÓN de `create or replace view`.
    a.actividad_padre_id,
    coalesce(t.n_tareas, 0)::integer        as n_tareas,
    coalesce(t.n_tareas_hechas, 0)::integer as n_tareas_hechas,
    coalesce(ped.n_pedidos, 0)::integer     as n_pedidos
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
     where x.actividad_id = a.id and x.fecha_liberacion is null) imp on true
  left join lateral (
    select count(*)::integer as n_tareas,
           count(*) filter (where x.estado = 'hecha')::integer as n_tareas_hechas
      from public.obra_actividad x where x.actividad_padre_id = a.id and not x.archivada) t on true
  left join lateral (
    select count(*)::integer as n_pedidos
      from public.pedidos_materiales x where x.actividad_id = a.id) ped on true;

grant select on public.obra_actividad_control to authenticated;

-- LAS TAREAS NO ENTRAN EN EL PROMEDIO DE LA OBRA.
create or replace view public.obra_avance with (security_invoker = true) as
 select oc.id as obra_id,
    oc.nombre as obra,
    count(a.*) filter (where a.tipo <> 'resumen') as n_actividades,
    count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null) as n_medidas,
    count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is null) as n_sin_planificar,
    count(a.*) filter (where a.tipo = 'resumen') as n_secciones,
    count(a.*) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null and a.avance_pct >= 100) as n_completas,
    round(avg(a.avance_pct) filter (where a.tipo <> 'resumen' and a.inicio_plan is not null))::integer as avance_pct,
    min(a.inicio_plan) filter (where a.tipo <> 'resumen') as desde,
    max(a.fin_plan) filter (where a.tipo <> 'resumen') as hasta,
    max(a.sincronizado_en) as sincronizado_en,
    max(a.fuente_pestana) as fuente_pestana
   from public.obra_canonica oc
     left join (
       select c.*, t.sincronizado_en
         from public.obra_actividad_control c
         join public.obra_actividad t on t.id = c.actividad_id
        where c.actividad_padre_id is null
     ) a on a.obra_id = oc.id
  group by oc.id, oc.nombre;
