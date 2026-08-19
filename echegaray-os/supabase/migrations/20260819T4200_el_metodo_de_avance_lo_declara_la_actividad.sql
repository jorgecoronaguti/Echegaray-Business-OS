-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- TRES MÉTODOS DE AVANCE, Y LA ACTIVIDAD DICE CUÁL USA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Al migrar la grilla diaria del Excel aparecieron cuatro actividades donde la grilla y el `% Done`
-- declarado NO coinciden, y en una la diferencia es del lado peligroso:
--
--     MONTAJE DE COLUMNA METALICA        grilla 30%     declarado 100% (Completado)
--
-- Con la vista prefiriendo los partes por el solo hecho de que existan, esa actividad pasaba a
-- informar 30% — una obra terminada empeorando su avance por una grilla que se llenó a medias. Y al
-- revés también: preferir siempre el declarado tira a la basura el registro diario, que es lo único
-- que dice CUÁNDO se avanzó.
--
-- Ninguno de los dos puede ganar por regla general, así que no gana por regla general: LA ACTIVIDAD
-- DECLARA SU MÉTODO. Los partes se conservan siempre como historia; que además manden sobre el
-- número es una decisión con nombre.
--
--   'cantidad' → 100 × producción acumulada / cantidad objetivo. Exige unidad y objetivo.
--   'partes'   → la suma de los avances diarios. Es lo que hace hoy la grilla del Excel.
--   'manual'   → el porcentaje que alguien declara. El default, y lo que había hasta hoy.
--
-- La migración pone 'partes' SÓLO donde la grilla cierra con el declarado (±1 punto). Las cuatro que
-- no cierran quedan en 'manual' con sus partes cargados y la diferencia a la vista: la resuelve una
-- persona mirando la obra, no una regla de desempate.

alter table public.obra_actividad drop constraint if exists obra_actividad_metodo_avance_check;
alter table public.obra_actividad add constraint obra_actividad_metodo_avance_check
  check (metodo_avance in ('cantidad', 'partes', 'manual'));

comment on column public.obra_actividad.metodo_avance is
  'cantidad = se calcula desde la producción física. partes = se suman los avances diarios. '
  'manual = alguien declara el porcentaje. La vista obra_actividad_control publica origen_avance '
  'para que un 53% calculado y un 53% tipeado no se confundan en la pantalla.';

drop view if exists public.obra_actividad_control;

create view public.obra_actividad_control with (security_invoker = true) as
select
    a.id                as actividad_id,
    a.obra_id, a.codigo, a.codigo_padre, a.nombre, a.tipo, a.orden, a.seccion, a.archivada,
    padre.nombre        as rubro,
    a.estado,
    a.unidad, a.cantidad_objetivo, a.metodo_avance,
    a.inicio_plan, a.fin_plan, a.inicio_base, a.fin_base, a.sellada_en, a.inicio_real, a.fin_real,
    a.hh_plan, a.responsable_id, a.cuadrilla_id,
    cu.nombre           as cuadrilla_prevista,
    a.comentario, a.partida_codigo, a.partida_cantidad,
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
  left join public.obra_actividad padre
    on padre.obra_id = a.obra_id and padre.codigo = a.codigo_padre and padre.tipo = 'resumen'
  left join public.cuadrilla cu on cu.id = a.cuadrilla_id
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
