-- REVERSA de 20260918T1100_obra_economia_la_cita_del_contrato_tambien_es_precio.sql
-- Vuelve `contrato_cita` y `contrato_nota` a salir sin máscara (el estado del 18/09 después de 0910).
-- OJO: reabre la fuga del precio al jefe de obra. Sólo si la máscara rompe algo que no se puede
-- arreglar de otro modo. Aplicarla NO borra la constancia en migracion_aplicada: hacerlo a mano.
set local lock_timeout = '3s';
set local statement_timeout = '20s';

create or replace view public.obra_economia_cartera with (security_invoker = false) as
 WITH valuado AS (
         SELECT c_1.obra_id,
            c_1.mano_obra,
            c_1.mano_obra_moneda,
            c_1.materiales,
            c_1.materiales_moneda,
            c_1.fuente_tipo,
            c_1.fuente_drive_id,
            c_1.fuente_nombre,
            c_1.cita,
            c_1.nota,
            c_1.cargado_en,
            c_1.cargado_por,
                CASE
                    WHEN c_1.mano_obra_moneda = 'USD'::text THEN contratado_valuado(NULL::numeric, c_1.mano_obra)
                    ELSE c_1.mano_obra
                END AS mo_pesos,
                CASE
                    WHEN c_1.materiales_moneda = 'USD'::text THEN contratado_valuado(NULL::numeric, c_1.materiales)
                    ELSE c_1.materiales
                END AS mat_pesos
           FROM obra_contrato c_1
        )
 SELECT e.obra_canonica_id,
    e.obra_clave,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN contratado_valuado(e.contratado, e.contratado_usd)
            ELSE NULL::numeric
        END AS contratado,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN e.contratado_usd
            ELSE NULL::numeric
        END AS contratado_usd,
    e.costo_mo,
    e.costo_materiales,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN e.contratado_usd IS NOT NULL AND tc_vigente() IS NOT NULL AND e.costo_mo IS NOT NULL AND e.costo_materiales IS NOT NULL THEN contratado_valuado(e.contratado, e.contratado_usd) - e.costo_mo - e.costo_materiales
                ELSE e.margen
            END
            ELSE NULL::numeric
        END AS margen,
    e.plazo_desde,
    e.plazo_hasta,
    e.origen,
    e.leido_en,
    e.referencia,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN e.nota
            ELSE NULL::text
        END AS nota,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN e.oc_civa_ventana
            ELSE NULL::numeric
        END AS oc_civa_ventana,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN e.oc_civa_historico
            ELSE NULL::numeric
        END AS oc_civa_historico,
    e.oc_n_ventana,
    e.oc_n_historico,
    tc_vigente() AS tipo_cambio,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN c.mo_pesos
            ELSE NULL::numeric
        END AS contrato_mano_obra,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN c.mano_obra_moneda = 'USD'::text THEN c.mano_obra
                ELSE NULL::numeric
            END
            ELSE NULL::numeric
        END AS contrato_mano_obra_usd,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN c.mat_pesos
            ELSE NULL::numeric
        END AS contrato_materiales,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN c.materiales_moneda = 'USD'::text THEN c.materiales
                ELSE NULL::numeric
            END
            ELSE NULL::numeric
        END AS contrato_materiales_usd,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN
            CASE
                WHEN c.obra_id IS NULL THEN NULL::numeric
                WHEN c.mano_obra IS NOT NULL AND c.mo_pesos IS NULL THEN NULL::numeric
                WHEN c.materiales IS NOT NULL AND c.mat_pesos IS NULL THEN NULL::numeric
                WHEN (COALESCE(c.mo_pesos, 0::numeric) + COALESCE(c.mat_pesos, 0::numeric)) <= 0::numeric THEN NULL::numeric
                ELSE COALESCE(c.mo_pesos, 0::numeric) + COALESCE(c.mat_pesos, 0::numeric)
            END
            ELSE NULL::numeric
        END AS contrato_total,
    c.fuente_tipo AS contrato_fuente,
    c.fuente_drive_id AS contrato_fuente_drive_id,
    c.fuente_nombre AS contrato_fuente_nombre,
    c.cita AS contrato_cita,
    c.nota AS contrato_nota,
    pa.obra_padre_id
   FROM obra_economia_sheet e
     LEFT JOIN valuado c ON c.obra_id = e.obra_canonica_id
     LEFT JOIN obra_canonica pa ON pa.id = e.obra_canonica_id
  WHERE ( SELECT es_administracion() AS es_administracion) OR (( SELECT auth.uid() AS uid)) IS NULL
UNION ALL
 SELECT oc.id AS obra_canonica_id,
    NULL::text AS obra_clave,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN oc.monto_contratado
            ELSE NULL::numeric
        END AS contratado,
    NULL::numeric AS contratado_usd,
    NULL::numeric(14,2) AS costo_mo,
    NULL::numeric(14,2) AS costo_materiales,
    NULL::numeric AS margen,
    NULL::date AS plazo_desde,
    NULL::date AS plazo_hasta,
    'formulario'::text AS origen,
    NULL::timestamp with time zone AS leido_en,
    NULL::text AS referencia,
    NULL::text AS nota,
    NULL::numeric AS oc_civa_ventana,
    NULL::numeric AS oc_civa_historico,
    NULL::integer AS oc_n_ventana,
    NULL::integer AS oc_n_historico,
    tc_vigente() AS tipo_cambio,
    NULL::numeric AS contrato_mano_obra,
    NULL::numeric AS contrato_mano_obra_usd,
    NULL::numeric AS contrato_materiales,
    NULL::numeric AS contrato_materiales_usd,
    NULL::numeric AS contrato_total,
    NULL::text AS contrato_fuente,
    NULL::text AS contrato_fuente_drive_id,
    NULL::text AS contrato_fuente_nombre,
    NULL::text AS contrato_cita,
    NULL::text AS contrato_nota,
    oc.obra_padre_id
   FROM obra_canonica oc
  WHERE (( SELECT ve_economia() AS ve_economia) OR (( SELECT auth.uid() AS uid)) IS NULL) AND oc.estado = 'cerrada'::text AND oc.fusionada_en IS NULL AND oc.monto_contratado IS NOT NULL AND NOT (EXISTS ( SELECT 1
           FROM obra_economia_sheet s
          WHERE s.obra_canonica_id = oc.id)) AND NOT (EXISTS ( SELECT 1
           FROM obra_contrato k
          WHERE k.obra_id = oc.id)) AND NOT (EXISTS ( SELECT 1
           FROM obra_canonica pa
          WHERE pa.id = oc.obra_padre_id AND ((EXISTS ( SELECT 1
                   FROM obra_economia_sheet s
                  WHERE s.obra_canonica_id = pa.id)) OR (EXISTS ( SELECT 1
                   FROM obra_contrato k
                  WHERE k.obra_id = pa.id)))));
comment on view public.obra_economia_cartera is
  'La economía de cada obra para las pantallas. Desde el 10/09/2026 el contratado en dólares se valúa acá con public.tc_vigente() —no en el sync— y viaja con `referencia` (el papel que lo respalda), `nota` (la discrepancia declarada contra las OC cargadas) y los dos totales de OC: la ventana del año y el histórico de la obra fusionada, que NO se suman entre sí. Desde el 11/09/2026 trae además el desglose del contrato (`obra_contrato`): mano de obra y materiales valuados en pesos, su moneda de origen, el total contractual y el papel que lo respalda. Desde el 18/09/2026 corre como su dueño con el portero en el WHERE: la fila la ve quien administra (es_administracion: dirección, administración, jefe de obra); el precio —contratado, margen, contrato_*, oc_civa_*, nota— sólo quien ve la plata (ve_economia). Sin JWT (conexión directa) sale todo.';
