-- EL CONTRATADO DE LAS OBRAS CERRADAS ES EL DEL FORMULARIO — decisión del dueño, 14/09/2026.
--
-- «Sí, tomar el del formulario.» Una obra CERRADA que no figura en OBRAS y no tiene contrato desglosado se veía
-- «sin precio» en la ficha, la cartera y la cuenta corriente aunque su formulario tuviera el monto: LE - OFICINA
-- Y FÁBRICA DE PALITOS $246,1 M, SF - GALPONES $204,4 M, LE - GALPÓN 9 $49,7 M, ME - BASES TANQUE SO2 $14,1 M,
-- ME - BSA ADICIONAL $6,0 M, ME - PILÓN $5,8 M, ME - LIMPIEZA DE ESCOMBROS $5,0 M, ME - RELEVAMIENTO $0,9 M.
--
-- ═══ QUÉ CAMBIA Y QUÉ NO ═══
--
-- `obra_economia_cartera` suma una segunda rama con esas obras (origen 'formulario'). La rama de OBRAS queda
-- IGUAL, byte a byte, a 20260913T1200: el formulario nunca le gana a OBRAS ni al contrato. Mismas columnas,
-- mismo orden, mismos tipos: `create or replace` la acepta y conserva sus GRANT. Corre como su dueño CON
-- portero en las dos ramas (`vistas-sin-invoker-llevan-portero.test.mjs`).
--
--   · `obra_cuenta.contratado` de esas obras deja de ser null. `por_cobrar` y `vencido` salen de Cobranzas
--     y no cambian (cotejo del 14/09).
--   · `cliente_economia.n_obras_con_precio` las cuenta; `contratado_de_cliente()` lee `obra_economia_sheet`
--     y no cambia.
--   · Fuera: obras ACTIVAS sin OBRAS (H1 sigue para ellas) y obras FUSIONADAS. El dueño dijo (14/09 18:10) que
--     BSA PLANTA $11,7 M y PISOS 120 M² $7,1 M suman a la mayor: YA SUMAN. La suma viva de ME - BSA ($17.704.199,40)
--     son las filas 41+42+89 de Cobranzas ($11.729.999,40, la OC 279 de BSA PLANTA) + la 43; el contrato de
--     ME - PISOS 120 M² Y RAMPA ($9.463.141,93) cita «Pisos 7.108.886,54 + Rampa 2.354.255,39». Sumarlas duplicaba.
--
-- ═══ LA HIJA CUBIERTA POR SU PADRE NO SUMA DOS VECES (auditoría 15/09/2026) ═══
--
-- ME - BSA ADICIONAL ($5.974.200) entraba por esta rama y su importe YA está en la suma viva de ME - BSA (fila 43,
-- OC 00002-00001985, cargada en la obra padre): la cartera de Messina contaba $5,97 M dos veces. Regla: una obra
-- con `obra_padre_id` NO toma su formulario cuando el padre ya publica precio (fila en OBRAS o contrato
-- desglosado). La señal es `obra_padre_id` porque es la única relación persistida entre las dos obras:
--   · `cobranza_imputacion` está vacía (0 filas): la imputación de Cobranzas a obras vive sólo en el sync;
--   · la hija no tiene OC propia en `cliente_orden` (la 1985 está en la padre), así que no hay OC compartida;
--   · el texto del concepto de Cobranzas no es una señal (ya reclasificó mal por regex una vez).
-- Límite: `obra_padre_id` dice que la hija es parte de la padre, no prueba que la base de la padre incluya su
-- importe. Se verificó para la única obra afectada hoy (bsa-adicional); el ensayo `costo-mo-ensayo-tx.mjs`
-- publica la cartera del cliente antes y después.
--
-- La aplicación sigue sin leer `monto_contratado` por su cuenta: lo lee de esta vista, y el title dice
-- «contratado según formulario de la obra» (`fraseDeOrigenContratado`).

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
    e.nota,
    e.oc_civa_ventana,
    e.oc_civa_historico,
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
  WHERE ((select public.ve_economia()) or (select auth.uid()) is null)
  UNION ALL
  -- RAMA FORMULARIO (dueño, 14/09/2026): obras cerradas, no fusionadas, sin OBRAS y sin contrato desglosado.
  SELECT oc.id AS obra_canonica_id,
    NULL::text AS obra_clave,
        CASE
            when public.ve_economia() or auth.uid() is null then oc.monto_contratado
            ELSE NULL::numeric
        END AS contratado,
    NULL::numeric AS contratado_usd,
    NULL::numeric(14,2) AS costo_mo,
    NULL::numeric(14,2) AS costo_materiales,
    NULL::numeric AS margen,
    NULL::date AS plazo_desde,
    NULL::date AS plazo_hasta,
    'formulario'::text AS origen,
    NULL::timestamptz AS leido_en,
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
   FROM public.obra_canonica oc
  where ((select public.ve_economia()) or (select auth.uid()) is null)
    and oc.estado = 'cerrada'
    and oc.fusionada_en is null
    and oc.monto_contratado is not null
    and not exists (select 1 from public.obra_economia_sheet s where s.obra_canonica_id = oc.id)
    and not exists (select 1 from public.obra_contrato k where k.obra_id = oc.id)
    -- LA HIJA CUBIERTA POR SU PADRE: el padre ya publica precio (OBRAS o contrato), su formulario no suma otra vez.
    and not exists (select 1 from public.obra_canonica pa
                     where pa.id = oc.obra_padre_id
                       and (exists (select 1 from public.obra_economia_sheet s where s.obra_canonica_id = pa.id)
                            or exists (select 1 from public.obra_contrato k where k.obra_id = pa.id)));
-- FIN DE LA VISTA

notify pgrst, 'reload schema';
