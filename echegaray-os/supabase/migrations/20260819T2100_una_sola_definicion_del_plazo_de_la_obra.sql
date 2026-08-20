-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- CUÁNDO EMPIEZA Y TERMINA UNA OBRA SE DEFINE UNA SOLA VEZ
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ LA DIVERGENCIA, ENCONTRADA AL CONSTRUIR EL GANTT GLOBAL (19/08/2026) ═══
--
-- El CTE `plazo` de `obra_plan_vs_real` calcula `min(inicio_plan)` y `max(fin_plan)` sobre TODAS las
-- actividades de la obra. El Gantt de la obra, en cambio, dibuja `sinArchivar()`. Son dos
-- definiciones del mismo concepto conviviendo:
--
--   · el renglón de la obra en el Gantt global sale de la vista;
--   · las barras del Gantt de esa obra salen de la tabla, sin archivadas.
--
-- Hoy no se nota —medido: 0 de 344 actividades archivadas, y las 7 obras dan idéntico por los dos
-- caminos—. Se nota el día que alguien archive una actividad con la fecha más lejana: la barra
-- global se estira más allá de lo que muestra el detalle, y las dos pantallas dicen plazos distintos
-- del mismo trabajo sin que ninguna esté "rota". Ése es exactamente el modo de falla que este
-- sistema tiene prohibido: no da error, da dos verdades.
--
-- Se arregla en la VISTA y no en la pantalla, porque la vista es la fuente: el portafolio, el bloque
-- «Plan contra real» de la ficha y el Gantt global la consumen los tres. Corregir el renglón del
-- Gantt habría dejado el desvío de plazo de la ficha con la definición vieja.
--
-- Las dos cuentas de abajo (`atrasadas`, `con_baseline`) YA filtraban `not archivada` cada una en su
-- `FILTER`: eran las agregaciones de fecha las únicas que no lo hacían. Con el `WHERE` a nivel de
-- CTE ese filtro queda escrito una sola vez y no puede volver a olvidarse en la mitad de arriba.
--
-- `with (security_invoker = true)` se repite EXPRESAMENTE: `create or replace view` que no la repite
-- **borra la opción**, y así se abrió `cliente_panel` a un jefe de obra el 19/08.

create or replace view public.obra_plan_vs_real with (security_invoker = true) as
WITH hh AS (
         SELECT registros_hh.obra_canonica_id AS obra_id,
            sum(registros_hh.horas) AS hh_real
           FROM registros_hh
          WHERE registros_hh.obra_canonica_id IS NOT NULL
          GROUP BY registros_hh.obra_canonica_id
        ), hh_plan AS (
         SELECT obra_actividad.obra_id,
            sum(obra_actividad.hh_plan) AS hh_plan
           FROM obra_actividad
          WHERE obra_actividad.hh_plan IS NOT NULL AND NOT obra_actividad.archivada
          GROUP BY obra_actividad.obra_id
        ), pres AS (
         SELECT DISTINCT ON (presupuestos.obra_canonica_id) presupuestos.obra_canonica_id AS obra_id,
            presupuestos.id AS presupuesto_id,
            presupuesto_monto(presupuestos.id) AS monto_presupuestado,
            presupuestos.costo_directo_presupuestado,
            presupuesto_margen(presupuestos.id) AS margen_esperado,
            presupuestos.hh_estimada
           FROM presupuestos
          WHERE presupuestos.obra_canonica_id IS NOT NULL
          ORDER BY presupuestos.obra_canonica_id, (presupuestos.estado = 'aprobado'::text) DESC, presupuestos.version DESC
        ), cert AS (
         SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado,
            sum(certificados.monto_cobrado) AS cobrado
           FROM certificados
          WHERE certificados.obra_canonica_id IS NOT NULL
          GROUP BY certificados.obra_canonica_id
        ), plazo AS (
         SELECT obra_actividad.obra_id,
            min(obra_actividad.inicio_plan) AS inicio_plan,
            max(obra_actividad.fin_plan) AS fin_plan,
            min(obra_actividad.inicio_base) AS inicio_base,
            max(obra_actividad.fin_base) AS fin_base,
            count(*) FILTER (WHERE NOT obra_actividad.archivada AND obra_actividad.tipo <> 'resumen'::text AND obra_actividad.fin_plan IS NOT NULL AND obra_actividad.fin_plan < CURRENT_DATE AND COALESCE(obra_actividad.pct, 0::numeric) < 100::numeric) AS atrasadas,
            count(*) FILTER (WHERE NOT obra_actividad.archivada AND obra_actividad.inicio_base IS NOT NULL) AS con_baseline
           FROM obra_actividad
          WHERE NOT obra_actividad.archivada
          GROUP BY obra_actividad.obra_id
        )
 SELECT op.obra_id,
    op.nombre,
    op.cliente_id,
    op.cliente_nombre,
    op.estado,
    op.etapa,
    plazo.inicio_plan,
    plazo.fin_plan,
    plazo.inicio_base,
    plazo.fin_base,
        CASE
            WHEN plazo.fin_base IS NOT NULL AND plazo.fin_plan IS NOT NULL THEN plazo.fin_plan - plazo.fin_base
            ELSE NULL::integer
        END AS desvio_plazo_dias,
    plazo.atrasadas::integer AS actividades_atrasadas,
    plazo.con_baseline::integer AS actividades_con_baseline,
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
        CASE
            WHEN op.monto_contratado > 0::numeric AND op.costo_real > 0::numeric THEN op.monto_contratado - op.costo_real
            ELSE NULL::numeric
        END AS margen_actual,
    cert.certificado,
    cert.facturado,
    cert.cobrado,
        CASE
            WHEN es_administracion() AND op.monto_contratado IS NOT NULL THEN op.monto_contratado - COALESCE(cert.certificado, 0::numeric)
            ELSE NULL::numeric
        END AS pendiente_certificar,
    COALESCE(cert.certificado, 0::numeric) - COALESCE(cert.cobrado, 0::numeric) AS pendiente_cobrar
   FROM obra_panel op
     LEFT JOIN hh ON hh.obra_id = op.obra_id
     LEFT JOIN hh_plan ON hh_plan.obra_id = op.obra_id
     LEFT JOIN pres ON pres.obra_id = op.obra_id
     LEFT JOIN cert ON cert.obra_id = op.obra_id
     LEFT JOIN plazo ON plazo.obra_id = op.obra_id;

grant select on public.obra_plan_vs_real to authenticated, service_role;
