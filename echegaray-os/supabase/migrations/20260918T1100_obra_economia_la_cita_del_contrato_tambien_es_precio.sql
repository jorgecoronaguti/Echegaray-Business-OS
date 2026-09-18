-- ============================================================================
-- LA CITA DEL CONTRATO TAMBIÉN ES EL PRECIO: EL JEFE DE OBRA NO LA LEE.
--
-- ═══ LA FUGA (auditoría independiente, 18/09/2026) ═══
--
-- `20260918T0910` le devolvió al jefe de obra la fila de `obra_economia_cartera` con los costos y
-- enmascaró con `ve_economia()` los montos de venta: contratado, margen, contrato_* numéricos,
-- oc_civa_* y nota. Quedaron sin máscara `contrato_cita` y `contrato_nota`, que son TEXTO copiado
-- del papel del contrato y traen el precio escrito adentro. Con la sesión real de «QA Jefe» por
-- PostgREST, el 18/09 se leían en 8 obras, por ejemplo:
--   quattropani            «Precio de mano de obra: U$S 63.000 + IVA, ajuste alzado. Materiales: …
--                           $ 44.110.169,31»
--   pisos-industriales     «… SUB TOTAL 47.590.271,50»
--   instalacion-electrica  nota «Precio pactado $ 40.000.000 … sobre una cotización de $ 42.876.310,34»
-- y por las mismas dos columnas salían en `obra_economia_rubros` (invoker, lee esta vista) y en el
-- JSON de `pantalla_clientes()` y `pantalla_cliente_en_vivo()` (`economia_obras[]`), que también las
-- leen de acá. Enmascarar los números sin enmascarar la cita no protegía nada.
--
-- ═══ EL ARREGLO ═══
--
-- Las dos columnas pasan por la misma máscara que el contratado: `ve_economia() OR auth.uid() IS
-- NULL`. Dirección y Administración (ve_economia) y la conexión directa sin JWT leen exactamente lo
-- mismo que antes. Se arregla en ESTA vista y no en cada consumidor: `obra_economia_rubros`, las dos
-- RPC de pantalla y `cliente_economia`/`obra_cuenta` heredan la máscara sin tocarlas.
--
-- `contrato_fuente`, `contrato_fuente_nombre` (nombre del archivo: «Presupuesto - Instalacion
-- Electrica.pdf») y `referencia` («según OC 2256») no traen montos —medido en las 17 filas el
-- 18/09— y quedan: le dicen al jefe QUÉ papel respalda la obra sin decirle cuánto vale.
--
-- La tabla `obra_contrato` no necesita cambio: su única policy de lectura es `ve_economia()`, así
-- que el jefe recibe cero filas (medido). Esta vista la lee como su dueño y por eso la máscara va
-- acá.
--
-- La vista sigue como su dueño (`security_invoker = false`, como la dejó 0910: lee
-- `obra_canonica.monto_contratado`, cerrada a authenticated). El cuerpo es `pg_get_viewdef` de la
-- base viva del 18/09 (idéntico al de 0910) con esas dos columnas cambiadas: mismas columnas, mismo
-- orden, mismos tipos (text), conserva sus GRANT. Sólo DDL de vista: sin reescritura de tabla.
--
-- Reversa: `20260918T1100_obra_economia_la_cita_del_contrato_tambien_es_precio.reversa.sql` en
-- `supabase/reversas/` (el mismo cuerpo con las dos columnas sin máscara).
-- ============================================================================

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
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN c.cita
            ELSE NULL::text
        END AS contrato_cita,
        CASE
            WHEN ve_economia() OR auth.uid() IS NULL THEN c.nota
            ELSE NULL::text
        END AS contrato_nota,
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
  'La economía de cada obra para las pantallas. Desde el 10/09/2026 el contratado en dólares se valúa acá con public.tc_vigente() —no en el sync— y viaja con `referencia` (el papel que lo respalda), `nota` (la discrepancia declarada contra las OC cargadas) y los dos totales de OC: la ventana del año y el histórico de la obra fusionada, que NO se suman entre sí. Desde el 11/09/2026 trae además el desglose del contrato (`obra_contrato`): mano de obra y materiales valuados en pesos, su moneda de origen, el total contractual y el papel que lo respalda. Desde el 18/09/2026 corre como su dueño con el portero en el WHERE: la fila la ve quien administra (es_administracion: dirección, administración, jefe de obra); el precio —contratado, margen, contrato_* numéricos, contrato_cita, contrato_nota, oc_civa_*, nota— sólo quien ve la plata (ve_economia). Sin JWT (conexión directa) sale todo.';
