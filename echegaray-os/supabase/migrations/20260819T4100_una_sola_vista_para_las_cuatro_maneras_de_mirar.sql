-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- `obra_actividad_control` — LA ÚNICA LECTURA DEL TRABAJO DE UNA OBRA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Gantt, Lista, Tablero, Próximos, Ejecución y Plan vs Real son SEIS MANERAS DE MIRAR LO MISMO. Cada
-- una con su propia consulta terminaría igual que terminó el Flujo de Caja: seis definiciones del
-- avance que empiezan iguales y se separan sin que nadie lo note. Todas leen esta vista.
--
-- ═══ EL AVANCE SE CALCULA, Y LA VISTA DICE DE DÓNDE SALIÓ ═══
--
--   · `cantidad`  → 100 × producción acumulada / cantidad objetivo. El número no se escribe: se
--                   deduce de los partes diarios, que son hechos con fecha.
--   · `partes`    → la actividad no es cuantificable pero tiene partes con avance declarado: se
--                   suman los incrementos, topeados en 100. Es exactamente lo que hace hoy la grilla
--                   diaria de «Avances de Obra».
--   · `declarado` → nadie cargó un parte todavía: vale el porcentaje que trajo el Sheet o que
--                   escribió alguien en la ficha.
--
-- `origen_avance` viaja hasta la pantalla. Un 53% calculado desde 95 de 180 m² y un 53% que alguien
-- tipeó no valen lo mismo, y quien decide tiene que poder distinguirlos de un vistazo.
--
-- ═══ «BLOQUEADA» NO SE GUARDA: SE DERIVA ═══
--
-- `estado_operativo` es el estado cargado, salvo que la actividad tenga un impedimento abierto en
-- `obra_restriccion` —y entonces es 'bloqueada'—. Guardarlo como un quinto valor daría dos verdades:
-- el día que alguien libera el impedimento, la actividad seguiría diciendo que está trabada.
--
-- `security_invoker`: hereda el RLS de `obra_actividad`, así que un jefe de obra ve las suyas y nada
-- más, sin un `where` propio que se pueda olvidar.

drop view if exists public.obra_actividad_control;

create view public.obra_actividad_control with (security_invoker = true) as
select
    a.id                as actividad_id,
    a.obra_id,
    a.codigo,
    a.codigo_padre,
    a.nombre,
    a.tipo,
    a.orden,
    a.seccion,
    a.archivada,
    -- EL RUBRO ES LA ACTIVIDAD DE RESUMEN QUE LA CUELGA. No es un campo nuevo: la jerarquía ya vive
    -- en `codigo_padre`, y lo único que faltaba era publicar el NOMBRE en vez del código.
    padre.nombre        as rubro,
    a.estado,
    a.unidad,
    a.cantidad_objetivo,
    a.metodo_avance,
    a.inicio_plan, a.fin_plan, a.inicio_base, a.fin_base, a.sellada_en,
    a.inicio_real, a.fin_real,
    a.hh_plan,
    a.responsable_id,
    a.cuadrilla_id,
    cu.nombre           as cuadrilla_prevista,
    a.comentario,
    a.partida_codigo,
    a.partida_cantidad,
    a.pct               as avance_declarado,
    e.cantidad_ejecutada,
    e.avance_partes,
    e.n_partes,
    e.ultimo_parte,
    h.hh_real,
    h.hh_extra,
    coalesce(h.n_imputaciones, 0)::integer as n_imputaciones,
    coalesce(imp.abiertos, 0)::integer      as impedimentos_abiertos,

    case
      when a.metodo_avance = 'cantidad' and a.cantidad_objetivo > 0
        then least(100, round(coalesce(e.cantidad_ejecutada, 0) / a.cantidad_objetivo * 100, 1))
      when e.avance_partes is not null then least(100, round(e.avance_partes, 1))
      else a.pct
    end as avance_pct,

    case
      when a.metodo_avance = 'cantidad' and a.cantidad_objetivo > 0 then 'cantidad'
      when e.avance_partes is not null then 'partes'
      when a.pct is not null then 'declarado'
      else null
    end as origen_avance,

    case when coalesce(imp.abiertos, 0) > 0 then 'bloqueada' else a.estado end as estado_operativo,

    -- PRODUCTIVIDAD REAL: unidades por hora hombre. Sólo existe con las dos puntas cargadas; con una
    -- sola es una división por un dato que falta, no un indicador bajo.
    case when e.cantidad_ejecutada > 0 and h.hh_real > 0
      then round(e.cantidad_ejecutada / h.hh_real, 3) end as productividad,

    case when a.hh_plan > 0 and h.hh_real is not null
      then round(h.hh_real / a.hh_plan * 100, 1) end as consumo_hh_pct
  from public.obra_actividad a
  left join public.obra_actividad padre
    on padre.obra_id = a.obra_id and padre.codigo = a.codigo_padre and padre.tipo = 'resumen'
  left join public.cuadrilla cu on cu.id = a.cuadrilla_id
  left join lateral (
    select sum(x.cantidad)                        as cantidad_ejecutada,
           sum(x.avance_pct)                      as avance_partes,
           count(*)::integer                      as n_partes,
           max(x.fecha)                           as ultimo_parte
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
