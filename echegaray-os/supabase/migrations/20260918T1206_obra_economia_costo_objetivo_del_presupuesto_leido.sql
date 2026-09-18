-- `obra_economia.costo_objetivo`: PRIMERO EL PRESUPUESTO LEÍDO DEL DOCUMENTO (18/09/2026).
--
-- La ficha de la obra (Economía) publicaba como costo objetivo de Quattropani $ 1.766.784: «partidas
-- congeladas convertidas a esta obra (2)», dos partidas de un presupuesto del OS convertidas en agosto.
-- Analíticas publica $ 83.690.842: el presupuesto por rubro leído de «Cotizacion Final.xlsm» más el
-- fondo de materiales del contrato. El dueño pidió los mismos números en toda la app: el costo objetivo
-- es el presupuesto leído del documento (obra_presupuesto_lectura); si no hay, el costo directo del
-- presupuesto aprobado en `presupuestos`; y sólo al final las partidas congeladas convertidas, que son
-- un pedazo y no el presupuesto (ver costoObjetivoValido en Analíticas).
--
-- Sólo cambia la precedencia de `costo_objetivo`, su `_origen`, `margen_cotizado` y
-- `costo_indirecto_objetivo`. Las demás columnas quedan iguales. Grants y security_invoker se conservan.
set local lock_timeout = '5s';

create or replace view public.obra_economia with (security_invoker = true) as
 WITH adic AS (
         SELECT adicionales.obra_canonica_id AS obra_id,
            sum(adicionales.monto_aprobado) AS adicionales_aprobados,
            count(*)::integer AS n_adicionales_aprobados
           FROM adicionales
          WHERE adicionales.obra_canonica_id IS NOT NULL AND adicionales.fecha_aprobacion IS NOT NULL AND adicionales.monto_aprobado IS NOT NULL
          GROUP BY adicionales.obra_canonica_id
        ), pres AS (
         SELECT DISTINCT ON (p.obra_canonica_id) p.obra_canonica_id AS obra_id,
            p.costo_directo_presupuestado,
            p.costo_indirecto_presupuestado,
            p.costo_pendiente_motivo,
            p.version,
            p.estado
           FROM presupuestos p
          WHERE p.obra_canonica_id IS NOT NULL AND p.estado = 'aprobado'::text
          ORDER BY p.obra_canonica_id, p.version DESC
        ), lect AS (
         SELECT l.obra_canonica_id AS obra_id, l.costo_directo, l.fuente_nombre, l.fuente_fecha, l.motivo, l.estado
           FROM obra_presupuesto_lectura l
        ), venta AS (
         SELECT oc_1.id AS obra_id,
            contratado_de_obra(oc_1.id) AS venta_contratada
           FROM obra_canonica oc_1
        )
 SELECT oc.id AS obra_id,
    oc.nombre AS obra,
    v.venta_contratada,
    a.adicionales_aprobados,
    COALESCE(a.n_adicionales_aprobados, 0) AS n_adicionales_aprobados,
        CASE
            WHEN v.venta_contratada IS NOT NULL THEN v.venta_contratada + COALESCE(a.adicionales_aprobados, 0::numeric)
            ELSE NULL::numeric
        END AS venta_total,
    COALESCE(le.costo_directo, pr.costo_directo_presupuestado, fe.costo_cotizado) AS costo_objetivo,
        CASE
            WHEN le.costo_directo IS NOT NULL THEN 'costo directo del presupuesto leído por rubro de «' || COALESCE(le.fuente_nombre, 'documento') || '»' || COALESCE(' (' || to_char(le.fuente_fecha, 'DD/MM/YYYY') || ')', '')
            WHEN pr.costo_directo_presupuestado IS NOT NULL THEN ((('costo directo del presupuesto v'::text || pr.version) || ' ('::text) || pr.estado) || ')'::text
            WHEN fe.costo_cotizado IS NOT NULL THEN ('partidas congeladas convertidas a esta obra ('::text || fe.n_partidas_congeladas) || ')'::text
            WHEN le.estado = 'sin_presupuesto' THEN 'sin presupuesto: ' || COALESCE(le.motivo, 'sin motivo')
            WHEN pr.costo_pendiente_motivo IS NOT NULL THEN (('presupuesto v'::text || pr.version) || ' aprobado sin costo cotizado: '::text) || pr.costo_pendiente_motivo
            ELSE 'sin presupuesto congelado convertido y sin presupuesto cargado para esta obra'::text
        END AS costo_objetivo_origen,
    ocr.costo_real,
    ocr.n_comprobantes AS costo_real_n_comprobantes,
    ocr.costo_mano_de_obra AS costo_real_mano_de_obra,
    NULL::numeric AS costo_comprometido,
    'no hay fuente: obligaciones.obra_id apunta a la tabla legacy `obras` y está en NULL en las filas que existen, y cheques.obra guarda la unidad de negocio, no la obra'::text AS costo_comprometido_estado,
        CASE
            WHEN fe.costo_proyectado_inferido IS NOT NULL THEN round(fe.costo_proyectado_inferido - COALESCE(ocr.costo_real, 0::numeric), 2)
            ELSE NULL::numeric
        END AS costo_restante_proyectado,
    fe.costo_proyectado_inferido AS costo_final_proyectado,
    fe.base_de_la_proyeccion AS base_del_forecast,
        CASE
            WHEN v.venta_contratada IS NOT NULL AND COALESCE(le.costo_directo, pr.costo_directo_presupuestado, fe.costo_cotizado) IS NOT NULL
              THEN v.venta_contratada + COALESCE(a.adicionales_aprobados, 0::numeric) - COALESCE(le.costo_directo, pr.costo_directo_presupuestado, fe.costo_cotizado) -
            CASE
                WHEN le.costo_directo IS NOT NULL OR pr.costo_directo_presupuestado IS NOT NULL THEN COALESCE(pr.costo_indirecto_presupuestado, 0::numeric)
                ELSE 0::numeric
            END
            ELSE NULL::numeric
        END AS margen_cotizado,
        CASE
            WHEN v.venta_contratada IS NOT NULL AND fe.costo_proyectado_inferido IS NOT NULL THEN v.venta_contratada + COALESCE(a.adicionales_aprobados, 0::numeric) - fe.costo_proyectado_inferido
            ELSE NULL::numeric
        END AS margen_final_proyectado,
    ce.certificado,
    ce.facturado,
    cob.cobrado,
    cob.cobrado_neto,
    cob.por_cobrar_proyectado,
    COALESCE(cob.n_cobranzas, 0) AS n_cobranzas,
        CASE
            WHEN (le.costo_directo IS NOT NULL OR pr.costo_directo_presupuestado IS NOT NULL) THEN pr.costo_indirecto_presupuestado
            ELSE NULL::numeric
        END AS costo_indirecto_objetivo
   FROM obra_canonica oc
     JOIN venta v ON v.obra_id = oc.id
     LEFT JOIN adic a ON a.obra_id = oc.id
     LEFT JOIN pres pr ON pr.obra_id = oc.id
     LEFT JOIN lect le ON le.obra_id = oc.id
     LEFT JOIN obra_costo_real ocr ON ocr.obra_id = oc.id
     LEFT JOIN obra_forecast_economico fe ON fe.obra_id = oc.id
     LEFT JOIN obra_cobranza cob ON cob.obra_id = oc.id
     LEFT JOIN ( SELECT certificados.obra_canonica_id AS obra_id,
            sum(certificados.monto_certificado) AS certificado,
            sum(certificados.monto_facturado) AS facturado
           FROM certificados
          WHERE certificados.obra_canonica_id IS NOT NULL
          GROUP BY certificados.obra_canonica_id) ce ON ce.obra_id = oc.id;
