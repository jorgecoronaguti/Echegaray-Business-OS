-- ============================================================================
-- LA ECONOMÍA DE LA OBRA: EL JEFE VE LOS COSTOS, NO EL PRECIO. DIRECCIÓN Y ADMINISTRACIÓN, TODO.
--
-- ═══ EL ROJO QUE ESTO CORRIGE (obra-economia-sheet.pg.test.mjs, 18/09/2026) ═══
--
-- El test del 08/09 fija la regla: con la sesión de un jefe de obra, `obra_economia_cartera`
-- devuelve la fila de la obra con `costo_mo` y `costo_materiales` y con `contratado` y `margen` en
-- NULL; la tabla `obra_economia_sheet` le entrega los costos por grant de columna y le NIEGA
-- `contratado`; dirección lee todo. Es la línea del 19/08: ADMINISTRAR (dirección, administración,
-- jefe de obra = `es_administracion()`) no es VER LA PLATA (dirección y administración =
-- `ve_economia()`). El jefe administra la obra: sus costos son su herramienta. El precio de venta
-- no.
--
-- `20260913T1200` cerró la vista y la tabla ENTERAS a `ve_economia()` para que un perfil campo no
-- leyera costos —correcto— y de paso dejó al jefe sin la fila: hoy la sesión del jefe recibe cero
-- filas de `obra_economia_cartera` y cero de la tabla. No es una fuga: es la regla al revés, y el
-- test lo venía diciendo en rojo desde entonces.
--
-- ═══ LO QUE ABRIRLE LA FILA AL JEFE HABRÍA FUGADO, Y SE CIERRA ACÁ ═══
--
-- La vista enmascaraba por columna `contratado`, `contratado_usd`, `margen` y `contrato_*`, pero
-- `oc_civa_ventana` y `oc_civa_historico` (Σ de las Órdenes de Compra del cliente con IVA: el
-- precio, por otro camino) y `nota` («OC $X c/IVA vs Cobranzas $Y»: el precio, en texto) salían
-- sin máscara, y las tres columnas estaban en el grant de la tabla a `authenticated`. Mientras el
-- jefe no recibía filas, no importaba. Al devolverle la fila, importa: se enmascaran en la vista
-- con el mismo `ve_economia()` que el contratado y se les quita el grant de columna en la tabla.
-- `referencia` («según OC 2256») y `oc_n_*` (cantidad de órdenes) no son plata y quedan.
--
-- Ninguna lectura de `src/` va a la tabla directa (medido 13/09 y 18/09: sólo `obra_economia_cartera`
-- y `contratado_de_cliente()`, que es security definer). Dirección y Administración leen exactamente
-- lo mismo que antes: todas las máscaras son `ve_economia() OR auth.uid() IS NULL`, y la rama de
-- `obra_canonica` (obras cerradas con contratado de formulario: sólo precio) sigue cerrada a
-- `ve_economia()` porque para el jefe no tiene nada que mostrar.
--
-- La vista sigue como su dueño (`security_invoker = false`) por la razón de `20260913T1200`: lee
-- `obra_canonica.monto_contratado`, cerrada a `authenticated`; con invoker Dirección leería
-- «permission denied». El cuerpo es `pg_get_viewdef` de la base viva del 18/09 con tres máscaras y
-- un portero cambiados: mismas columnas, mismo orden, mismos tipos, conserva sus GRANT.
-- ============================================================================

set local lock_timeout = '3s';
set local statement_timeout = '20s';

-- ── 1 · LA TABLA: la fila para quien administra, las columnas de plata para quien la ve ──────────
drop policy if exists obra_economia_sheet_lee on public.obra_economia_sheet;
create policy obra_economia_sheet_lee on public.obra_economia_sheet
  for select to authenticated
  using ((select public.es_administracion()));

-- `contratado`, `contratado_usd` y `margen` ya no estaban en el grant (20260908T1800). Se suman las
-- tres que también dicen el precio.
revoke select (oc_civa_ventana, oc_civa_historico, nota) on public.obra_economia_sheet from authenticated;

-- ── 2 · LA VISTA ────────────────────────────────────────────────────────────────────────────────
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
