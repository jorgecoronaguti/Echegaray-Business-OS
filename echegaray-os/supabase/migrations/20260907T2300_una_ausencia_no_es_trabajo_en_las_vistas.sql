-- UNA AUSENCIA TIENE HORAS Y NO ES TRABAJO — y tres vistas la estaban sumando como si lo fuera.
--
-- ═══ QUÉ ESTABA MAL ═══
--
-- `registros_hh.horas` tiene `CHECK (horas > 0)`, así que una ausencia NO se puede registrar como
-- cero: se guarda con las horas de la jornada y `tipo_hora = 'ausencia'`. Eso ya estaba decidido en
-- `features/obras/services/tipoHora.ts` («una ausencia tiene horas y no es trabajo») y respetado por
-- ocho de las doce vistas que leen la tabla. Estas tres no lo respetaban:
--
--   obra_plan_vs_real   `sum(r.horas)` sin filtro → `hh_real` de la OBRA. Es la peor: alimenta el
--                       plan contra real, el consumo de HH y el margen forecast. Un mes con cuatro
--                       faltas le sumaba 35 horas de trabajo que nadie hizo.
--   actividad_fechas    `max(fecha)` sobre las HH de una actividad → la «última fecha» de una
--                       actividad podía ser el día que alguien FALTÓ.
--   xsas_actividad      `count(DISTINCT persona_id)` → contaba como «persona con HH» a quien no vino.
--
-- ═══ QUÉ NO SE TOCA, Y POR QUÉ ═══
--
-- `subcontrato_costo` y `subcontrato_aporte_detalle` también suman `r.horas` sin filtrar, pero por
-- `JOIN ... ON r.id = a.registros_hh_id`: la fila la eligió una persona al crear el aporte del
-- subcontrato. Vincular una ausencia a un aporte es un error de carga, no de la vista, y filtrarlo
-- acá escondería ese error en vez de mostrarlo. Se deja como está, dicho.
--
-- ═══ POR QUÉ ES SEGURO ═══
--
-- Medido en la base el 07/09/2026 ANTES de aplicar: `registros_hh` tiene 25 filas y las 25 son
-- `tipo_hora = 'normal'` (730 hs). Cero ausencias, cero licencias. Así que este filtro NO mueve
-- ningún número existente: `obra_plan_vs_real.hh_real` de `quattropani` vale 49,00 antes y tiene
-- que valer 49,00 después. Es la evidencia de que el cambio es el filtro y nada más.
--
-- ═══ CÓMO SE HIZO ═══
--
-- Las tres definiciones se sacaron con `pg_get_viewdef(..., true)` de la base viva y se les agregó
-- SÓLO el `AND`. No se reescribió ninguna consulta a mano: reescribir 93 líneas de SQL para cambiar
-- un `WHERE` es la forma de introducir un defecto que nadie va a encontrar.
--
-- REVERSIBLE: `create or replace view` con la definición de arriba menos el `AND`. No cambia
-- ninguna columna, así que no hace falta `drop` y nada que dependa de estas vistas se rompe.
-- Las tres son `security_invoker = true` y siguen siéndolo.

-- ── obra_plan_vs_real ──
create or replace view public.obra_plan_vs_real
with (security_invoker = true) as
 WITH hh AS (
         SELECT r.obra_canonica_id AS obra_id,
            sum(r.horas) AS hh_real
           FROM registros_hh r
          WHERE r.obra_canonica_id IS NOT NULL AND r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])
          GROUP BY r.obra_canonica_id
        ), hh_plan AS (
         SELECT a.obra_id,
            sum(a.hh_plan) AS hh_plan
           FROM obra_actividad a
          WHERE a.hh_plan IS NOT NULL AND NOT a.archivada
          GROUP BY a.obra_id
        ), pres AS (
         SELECT DISTINCT ON (p.obra_canonica_id) p.obra_canonica_id AS obra_id,
            p.id AS presupuesto_id,
            presupuesto_monto(p.id) AS monto_presupuestado,
            p.costo_directo_presupuestado,
            presupuesto_margen(p.id) AS margen_esperado,
            p.hh_estimada
           FROM presupuestos p
          WHERE p.obra_canonica_id IS NOT NULL
          ORDER BY p.obra_canonica_id, (p.estado = 'aprobado'::text) DESC, p.version DESC
        ), cert AS (
         SELECT c.obra_canonica_id AS obra_id,
            sum(c.monto_certificado) AS certificado,
            sum(c.monto_facturado) AS facturado
           FROM certificados c
          WHERE c.obra_canonica_id IS NOT NULL
          GROUP BY c.obra_canonica_id
        )
 SELECT op.obra_id,
    op.nombre,
    op.cliente_id,
    op.cliente_nombre,
    op.estado,
    op.etapa,
    f.inicio_plan,
    f.fin_plan,
    f.inicio_base,
    f.fin_base,
        CASE
            WHEN f.fin_base IS NOT NULL AND f.fin_plan IS NOT NULL THEN f.fin_plan - f.fin_base
            ELSE NULL::integer
        END AS desvio_plazo_dias,
    f.n_atrasadas AS actividades_atrasadas,
    f.n_con_baseline AS actividades_con_baseline,
    op.avance_pct,
    op.n_actividades_medidas,
    op.n_actividades,
    hh_plan.hh_plan,
    pres.hh_estimada,
    hh.hh_real,
        CASE
            WHEN COALESCE(hh_plan.hh_plan, pres.hh_estimada) > 0::numeric AND hh.hh_real IS NOT NULL THEN round((hh.hh_real - COALESCE(hh_plan.hh_plan, pres.hh_estimada)) / COALESCE(hh_plan.hh_plan, pres.hh_estimada) * 100::numeric, 1)
            ELSE NULL::numeric
        END AS desvio_hh_pct,
    pres.presupuesto_id,
    pres.monto_presupuestado,
    pres.costo_directo_presupuestado AS costo_presupuestado,
    op.costo_real,
        CASE
            WHEN pres.costo_directo_presupuestado > 0::numeric AND op.costo_real > 0::numeric THEN round((op.costo_real - pres.costo_directo_presupuestado) / pres.costo_directo_presupuestado * 100::numeric, 1)
            ELSE NULL::numeric
        END AS desvio_costo_pct,
    op.monto_contratado,
    pres.margen_esperado,
    cert.certificado,
    cert.facturado,
    cob.cobrado,
    cob.cobrado_neto,
        CASE
            WHEN es_administracion() AND op.monto_contratado IS NOT NULL THEN op.monto_contratado - COALESCE(cert.certificado, 0::numeric)
            ELSE NULL::numeric
        END AS pendiente_certificar,
    cob.por_cobrar_proyectado,
    cob.n_cobranzas,
    f.inicio_real,
    f.fin_real,
    f.forecast_fin,
        CASE
            WHEN f.fin_plan IS NOT NULL AND f.forecast_fin IS NOT NULL THEN f.forecast_fin - f.fin_plan
            ELSE NULL::integer
        END AS desvio_forecast_dias,
    f.n_sin_fecha AS actividades_sin_fecha,
    f.origen_fechas_plan,
    f.fin_plan_declarado
   FROM obra_panel op
     LEFT JOIN hh ON hh.obra_id = op.obra_id
     LEFT JOIN hh_plan ON hh_plan.obra_id = op.obra_id
     LEFT JOIN pres ON pres.obra_id = op.obra_id
     LEFT JOIN cert ON cert.obra_id = op.obra_id
     LEFT JOIN obra_cobranza cob ON cob.obra_id = op.obra_id
     LEFT JOIN obra_fechas f ON f.obra_id = op.obra_id;

-- ── actividad_fechas ──
create or replace view public.actividad_fechas
with (security_invoker = true) as
 WITH ev AS (
         SELECT a_1.id AS actividad_id,
            min(x.fecha) FILTER (WHERE x.origen = 'ejecucion'::text) AS primer_parte,
            max(x.fecha) FILTER (WHERE x.origen = 'ejecucion'::text) AS ultimo_parte,
            min(x.fecha) FILTER (WHERE x.origen = 'hh'::text) AS primera_hh,
            max(x.fecha) FILTER (WHERE x.origen = 'hh'::text) AS ultima_hh,
            min(x.fecha) AS primera,
            max(x.fecha) AS ultima
           FROM obra_actividad a_1
             LEFT JOIN LATERAL ( SELECT e.fecha,
                    'ejecucion'::text AS origen
                   FROM obra_ejecucion e
                  WHERE e.actividad_id = a_1.id AND e.fecha <= CURRENT_DATE
                UNION ALL
                 SELECT r_1.fecha,
                    'hh'::text AS text
                   FROM registros_hh r_1
                  WHERE r_1.actividad_id = a_1.id AND r_1.fecha <= CURRENT_DATE AND r_1.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) x ON true
          GROUP BY a_1.id
        )
 SELECT a.id AS actividad_id,
    a.obra_id,
    a.tipo,
    a.archivada,
        CASE
            WHEN a.sellada_en IS NOT NULL THEN a.inicio_base
            ELSE NULL::date
        END AS inicio_base,
        CASE
            WHEN a.sellada_en IS NOT NULL THEN a.fin_base
            ELSE NULL::date
        END AS fin_base,
    a.sellada_en,
    a.inicio_plan,
    a.fin_plan,
    ev.primera AS inicio_real,
        CASE
            WHEN term.terminada THEN ev.ultima
            ELSE NULL::date
        END AS fin_real,
        CASE
            WHEN ev.primera IS NULL THEN NULL::text
            WHEN ev.primer_parte IS NOT NULL AND (ev.primera_hh IS NULL OR ev.primer_parte <= ev.primera_hh) THEN 'parte de avance'::text
            ELSE 'imputación de HH'::text
        END AS origen_inicio_real,
        CASE
            WHEN NOT term.terminada OR ev.ultima IS NULL THEN NULL::text
            WHEN ev.ultimo_parte IS NOT NULL AND (ev.ultima_hh IS NULL OR ev.ultimo_parte >= ev.ultima_hh) THEN 'parte de avance'::text
            ELSE 'imputación de HH'::text
        END AS origen_fin_real,
    a.inicio_real AS inicio_real_declarado,
    a.fin_real AS fin_real_declarado,
        CASE
            WHEN term.terminada THEN ev.ultima
            WHEN r.dias_restantes IS NOT NULL THEN GREATEST(sumar_dias_habiles(a.obra_id, CURRENT_DATE, r.dias_restantes), CURRENT_DATE)
            WHEN a.fin_plan IS NOT NULL THEN GREATEST(a.fin_plan, CURRENT_DATE)
            ELSE NULL::date
        END AS forecast_fin,
        CASE
            WHEN term.terminada THEN 'terminada: la fecha del último parte · DATO REAL'::text
            WHEN r.dias_restantes IS NOT NULL THEN r.base_del_forecast
            WHEN a.fin_plan IS NOT NULL THEN 'sin ritmo medible: se publica el fin del plan · ESTIMACIÓN'::text
            ELSE 'sin base: la actividad no tiene plan ni producción medida'::text
        END AS base_del_forecast,
    r.dias_restantes,
    r.hh_restantes,
    a.inicio_plan IS NOT NULL OR a.fin_plan IS NOT NULL AS tiene_fecha_plan,
    a.inicio_plan IS NOT NULL OR a.fin_plan IS NOT NULL OR a.sellada_en IS NOT NULL OR ev.primera IS NOT NULL AS tiene_fecha,
    term.terminada,
        CASE
            WHEN term.terminada THEN 'terminada'::text
            WHEN ev.primera IS NOT NULL THEN 'en_curso'::text
            WHEN a.inicio_plan IS NOT NULL OR a.fin_plan IS NOT NULL THEN 'planificada'::text
            ELSE 'sin_fecha'::text
        END AS estado_fecha,
        CASE
            WHEN a.sellada_en IS NOT NULL AND a.fin_base IS NOT NULL AND a.fin_plan IS NOT NULL THEN a.fin_plan - a.fin_base
            ELSE NULL::integer
        END AS desvio_plan_dias,
        CASE
            WHEN a.fin_plan IS NOT NULL THEN
            CASE
                WHEN term.terminada AND ev.ultima IS NOT NULL THEN ev.ultima - a.fin_plan
                WHEN r.dias_restantes IS NOT NULL THEN GREATEST(sumar_dias_habiles(a.obra_id, CURRENT_DATE, r.dias_restantes), CURRENT_DATE) - a.fin_plan
                ELSE NULL::integer
            END
            ELSE NULL::integer
        END AS desvio_forecast_dias
   FROM obra_actividad a
     LEFT JOIN ev ON ev.actividad_id = a.id
     LEFT JOIN actividad_ritmo r ON r.actividad_id = a.id
     LEFT JOIN LATERAL ( SELECT a.estado = 'hecha'::text OR COALESCE(av.avance_pct, 0::numeric) >= 100::numeric AS terminada
           FROM actividad_avance av
          WHERE av.actividad_id = a.id) term ON true;

-- ── xsas_actividad ──
create or replace view public.xsas_actividad
with (security_invoker = true) as
 SELECT c.actividad_id,
    c.obra_id,
    o.nombre AS obra,
    COALESCE(cl.nombre_comercial, cl.razon_social, o.cliente_texto) AS cliente,
    o.cliente_id,
    o.estado AS obra_estado,
    o.contrato_monto,
    o.contrato_moneda,
    c.codigo,
    c.nombre AS actividad,
    c.estado AS actividad_estado,
    c.estado_operativo,
    c.unidad,
    c.tarea_tipo_id,
    tt.codigo AS tarea_codigo,
    tt.nombre AS tarea,
    c.analisis_id,
    c.cotizacion_partida_id,
    c.cantidad_objetivo AS plan_cantidad,
    c.hh_plan AS plan_hh,
    c.dias_plan AS plan_dias,
    c.dotacion_prevista AS plan_dotacion,
    c.inicio_plan,
    c.fin_plan,
    cp.hs_unitarias AS presupuesto_hs_unitarias,
    cp.costo_unitario AS presupuesto_costo_unitario,
    cp.cantidad AS presupuesto_cantidad,
    c.cantidad_ejecutada AS cantidad_real,
    c.avance_pct,
    c.origen_avance,
    c.estado_fecha = 'terminada'::text AS terminada,
    c.metodo_avance = 'manual'::text AND c.pct IS NOT NULL AND c.avance_partes IS NOT NULL AS avance_sumado,
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
        CASE
            WHEN c.inicio_real IS NOT NULL AND c.fin_real IS NOT NULL THEN c.fin_real - c.inicio_real + 1
            ELSE NULL::integer
        END AS dias_real,
    dot.dotacion_real,
    cau.causas,
    c.cuadrilla_id,
    comp.composicion,
    ac.seccion,
    ac.tipo IS DISTINCT FROM 'hito'::text AND NOT (EXISTS ( SELECT 1
           FROM obra_actividad h
          WHERE h.actividad_padre_id = c.actividad_id)) AS es_trabajo,
    per.personas_con_hh AS dotacion_por_hh
   FROM obra_actividad_control c
     LEFT JOIN obra_actividad ac ON ac.id = c.actividad_id
     LEFT JOIN obra_canonica o ON o.id = c.obra_id
     LEFT JOIN clientes cl ON cl.id = o.cliente_id
     LEFT JOIN tarea_tipo tt ON tt.id = c.tarea_tipo_id
     LEFT JOIN cotizacion_partida cp ON cp.id = c.cotizacion_partida_id
     LEFT JOIN LATERAL ( SELECT count(DISTINCT h.persona_id)::integer AS personas_con_hh
           FROM registros_hh h
          WHERE h.actividad_id = c.actividad_id AND h.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) per ON true
     LEFT JOIN LATERAL ( SELECT COALESCE(NULLIF(per.personas_con_hh, 0), ( SELECT count(DISTINCT s.persona_id)::integer AS count
                   FROM obra_asignacion s
                  WHERE s.actividad_id = c.actividad_id AND (s.hasta IS NULL OR s.hasta >= CURRENT_DATE))) AS dotacion_real) dot ON true
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(x.causa, x.n) AS causas
           FROM ( SELECT registros_hh.causa_desvio AS causa,
                    count(*)::integer AS n
                   FROM registros_hh
                  WHERE registros_hh.actividad_id = c.actividad_id AND registros_hh.causa_desvio IS NOT NULL
                  GROUP BY registros_hh.causa_desvio
                UNION ALL
                 SELECT obra_ejecucion.causa_desvio,
                    count(*)::integer AS count
                   FROM obra_ejecucion
                  WHERE obra_ejecucion.actividad_id = c.actividad_id AND obra_ejecucion.causa_desvio IS NOT NULL
                  GROUP BY obra_ejecucion.causa_desvio) x
          WHERE x.causa IS NOT NULL) cau ON true
     LEFT JOIN LATERAL ( SELECT jsonb_object_agg(y.categoria, y.n) AS composicion
           FROM ( SELECT COALESCE(p.categoria, 'sin categoría'::text) AS categoria,
                    count(*)::integer AS n
                   FROM cuadrilla_integrante ci
                     JOIN personas p ON p.id = ci.persona_id
                  WHERE ci.cuadrilla_id = c.cuadrilla_id AND (ci.hasta IS NULL OR ci.hasta >= COALESCE(c.fin_real, CURRENT_DATE))
                  GROUP BY (COALESCE(p.categoria, 'sin categoría'::text))) y) comp ON true
  WHERE c.archivada IS NOT TRUE;

comment on view public.obra_plan_vs_real is
  'Plan contra real de la obra. `hh_real` cuenta SÓLO horas trabajadas (normal, extra_50, extra_100): una ausencia tiene horas en registros_hh —el CHECK exige horas > 0— y no es trabajo.';
