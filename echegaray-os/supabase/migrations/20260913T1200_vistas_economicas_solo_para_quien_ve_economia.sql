-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LAS VISTAS ECONÓMICAS SÓLO PARA QUIEN VE ECONOMÍA · Y LAS PERSONAS DE PRUEBA SÓLO PARA LA PRUEBA
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ═══ EL RECHAZO QUE ESTO CORRIGE (auditor de cierre, 13/09/2026) ═══
--
-- Con el `sub` de «QA Campo» (rol campo) y `set role authenticated`, se leían filas de vistas que
-- corren como su dueño y no llevan portero: `nomina_por_mes` (12, costo de nómina), `egreso_por_area`
-- (880, cada compra con proveedor, obra y total), `obra_economia_cartera` (10, costos y plazos),
-- `finanzas_scorecard_vigente` (16), `recupero_art_sin_imputar` (1, trabajador e importe). Y la
-- columna `recupero_art.cbu_acreditacion`. Una vista sin `security_invoker` saltea el RLS de sus
-- tablas: la única cerradura posible es el `where` de la propia vista.
--
-- ═══ POR QUÉ PORTERO EN EL WHERE Y NO `security_invoker` ═══
--
-- `obra_economia_cartera` lee `obra_canonica`, cuyo `monto_contratado` está cerrado a
-- `authenticated` desde `20260912T1600`. Con invoker, la ficha del cliente de Dirección leería
-- «permission denied»: se arreglaría la fuga rompiendo la pantalla de quien sí puede ver la plata.
-- Quedan definer, con el portero en el WHERE, como ya lo hacen `obra_cuenta` y `cobranza_imputacion`.
--
-- EL `or auth.uid() is null` NO ES UNA PUERTA NUEVA: es la misma escapatoria que ya tenían las
-- columnas de `obra_economia_cartera` y `contratado_de_obra()`. Sin JWT sólo llega una conexión
-- directa (el orquestador, los sincronizadores: `nomina-replica`, `obras-economia-sync`), que ya es
-- dueña del esquema. `anon` no tiene grant sobre ninguna de estas vistas (medido 13/09).
--
-- La función de área: `liquida_sueldos()` para nómina y ART, `ve_economia()` para el resto. Hoy
-- las dos dicen lo mismo (dirección y administración) y se separan igual: si mañana liquidar sueldos
-- y ver la plata de las obras dejan de ser el mismo grupo, cada vista ya pregunta lo que le toca.
--
-- ═══ LAS 32 VISTAS SIN INVOKER QUE `authenticated` PUEDE LEER (catálogo, 13/09/2026) ═══
--
--  (i) PROPIAS O DESESCALADA DECLARADA — no se tocan (13)
--      mi_asignacion, mi_asistencia_dia, mi_correccion_asistencia, mi_cuadrilla, mi_documento_legajo,
--      mi_hh_dia, mi_impedimento, mi_legajo, mi_obra, mi_recibo, mi_tarea → `mi_persona_id()`.
--      persona_legajo → `where es_administracion()`. persona_plantel → cinco columnas sin plata,
--      declarada en `vistas-security-invoker.test.mjs`.
--
--  (ii) ECONÓMICAS QUE YA TENÍAN EL PORTERO EN EL WHERE — no se tocan (7)
--      cliente_cobranza, cobranza_imputacion, obra_cobranza, obra_cuenta, obra_forecast_economico →
--      `ve_economia()`. subcontrato_costo, subcontrato_aporte_detalle → `ve_obra()` por obra, el
--      mismo alcance que la policy de `subcontrato` (el jefe de obra ve lo de sus obras).
--
--  (ii) ECONÓMICAS SIN PORTERO — SE CIERRAN ACÁ (6)
--      obra_economia_cartera, egreso_por_area, finanzas_scorecard_vigente → `ve_economia()`.
--      nomina_por_mes, recupero_art_por_mes, recupero_art_sin_imputar → `liquida_sueldos()`.
--      `obra_economia_cartera` enmascaraba contratado y margen por columna pero publicaba
--      `costo_mo` y `costo_materiales` a cualquiera: un margen se reconstruye con eso.
--
--  (iii) OPERATIVAS SIN PLATA — quedan como están, y por qué (6)
--      actividad_avance            avance físico por actividad (cantidades, partes, pasos). Cero $.
--      aprendizaje_activo          reglas de aprendizaje del OS vigentes. Cero $.
--      factor_ajuste               índices públicos (IPC, CAC) acumulados: dato publicado, no de ECSAS.
--      v_capacidades_xsas          catálogo de capacidades del asistente. Cero $.
--      v_drive_busqueda_alias      métricas de búsqueda en Drive. Cero $.
--      v_drive_busqueda_metricas   ídem.
--
-- ═══ LO QUE UN PORTERO EN LA VISTA NO ALCANZA: LA TABLA ABIERTA DEBAJO ═══
--
-- «Un dato protegido en la vista y libre en su tabla no está protegido: está disimulado» (la regla
-- de `columnas-comerciales-cerradas`). Las tablas de origen de estas vistas tenían policy de lectura
-- `using (true)` con grant a `authenticated`: `jornales_quincena`, `cargas_sociales_periodo`,
-- `recupero_art`, `recupero_art_imputacion`, `finanzas_scorecard` y `obra_economia_sheet` (esta por
-- columna, con `costo_mo`/`costo_materiales`). Se cierran con la misma función que su vista.
--
-- QUÉ SE MIDIÓ ANTES PARA NO APAGAR UNA PANTALLA: en `src/` la única lectura directa de esas tablas
-- es `jornales_quincena` desde las solapas de Liquidación (`costoLecturas.getJornalesDelSheet`),
-- que se dibujan con `veEconomia(rol)` — el mismo grupo que `liquida_sueldos()`. Ninguna vista con
-- `security_invoker` las lee (pg_depend); `contratado_de_cliente()` lee `obra_economia_sheet` pero
-- es security definer. Los escritores (`nomina-replica`, `registrar-recupero-art`) van por
-- conexión directa, que no pasa por RLS.
--
-- ═══ LAS PERSONAS DE PRUEBA EN LA TABLA (segundo defecto del auditor, 13/09) ═══
--
-- `20260912T1200` filtró `es_prueba` en tres vistas y dejó la TABLA: una cuenta real de Dirección
-- contaba 6 personas de prueba en `select … from personas`. Efecto medido en código:
-- `recursosService` cuenta categorías del plantel sobre la tabla sin filtrar `es_prueba`, y
-- `auditoriaService` resuelve nombres sobre ella. Arreglar cada lectura es la forma de que la
-- próxima se olvide; la regla va en la tabla, UNA vez, como policy RESTRICTIVA de SELECT: se suma
-- con `and` a `personas_select` sin reescribirla, y alcanza también a todas las vistas invoker que
-- leen `personas` (persona_directorio, cuadrilla_panel, presencia_del_dia, persona_hh_dia…).
-- `service_role` y la conexión directa no pasan por RLS: el bot y los scripts no pierden a nadie.
--
-- ═══ ESTA MIGRACIÓN NO SE APLICA DESDE EL WORKTREE ═══
--
-- La aplica el dueño de la sesión principal. La evidencia del efecto sin aplicarla está en
-- `orquestador/lib/vistas-economicas-portero.pg.test.mjs` (ORQ_PG_DDL=1, transacción revertida).

-- ── 1 · LAS SEIS VISTAS ─────────────────────────────────────────────────────────────────────────
--
-- Cada cuerpo es `pg_get_viewdef` de la base viva del 13/09/2026 —no una migración vieja— con UNA
-- sola cosa agregada: el portero. Mismas columnas, mismo orden, mismos tipos: por eso
-- `create or replace` las acepta y conservan sus GRANT. `security_invoker = false` se escribe
-- explícito para que quien la lea sepa que correr como dueño es deliberado.

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
  WHERE ((select public.ve_economia()) or (select auth.uid()) is null);

create or replace view public.egreso_por_area with (security_invoker = false) as
SELECT COALESCE(c.area, 'sin_clasificar'::text) AS area,
    a.nombre AS area_nombre,
    c.unidad_negocio,
        CASE
            WHEN c.area = 'personas'::text AND lower(TRIM(BOTH FROM COALESCE(c.proveedor, ''::text))) = 'sueldos'::text THEN 'Sueldo neto'::text
            WHEN c.area = 'personas'::text AND lower(TRIM(BOTH FROM COALESCE(c.proveedor, ''::text))) = 'sac'::text THEN 'SAC / aguinaldo'::text
            WHEN c.area = 'personas'::text AND lower(TRIM(BOTH FROM COALESCE(c.obra_texto, ''::text))) = 'f931'::text THEN 'F931 — cargas sociales'::text
            WHEN c.area = 'personas'::text AND lower(TRIM(BOTH FROM COALESCE(c.proveedor, ''::text))) = 'sindicatos'::text THEN 'Sindicatos'::text
            WHEN c.area = 'personas'::text AND lower(TRIM(BOTH FROM COALESCE(c.obra_texto, ''::text))) = 'fcl'::text THEN 'Fondo de cese'::text
            WHEN c.area = 'personas'::text THEN 'Otros de nómina'::text
            WHEN c.area = 'obras'::text THEN 'Compra imputada a obra'::text
            WHEN c.area = 'administracion_finanzas'::text THEN 'Bancario y financiero'::text
            WHEN c.area = 'contabilidad_legales'::text THEN 'Impuestos y planes'::text
            WHEN c.area = 'compras'::text AND COALESCE(c.concepto, ''::text) ~* '(\yford\y|\ytoyota\y|\ymoto\y|chevrolet|hilux|amarok|patente)'::text THEN 'Flota y equipos'::text
            WHEN c.area = 'compras'::text THEN 'Estructura / indirecto'::text
            ELSE 'Sin clasificar'::text
        END AS grupo,
    c.proveedor,
    c.obra_texto,
    c.concepto,
    c.total,
    c.fecha,
    c.mes,
    c.origen
   FROM costos_obra c
     LEFT JOIN area_canonica a ON a.clave = c.area
  WHERE ((select public.ve_economia()) or (select auth.uid()) is null);

create or replace view public.finanzas_scorecard_vigente with (security_invoker = false) as
SELECT id,
    corrida_id,
    area,
    seccion,
    metrica,
    etiqueta,
    valor,
    unidad,
    estado,
    fuente_unica,
    orden,
    detalle,
    capturado_en
   FROM finanzas_scorecard s
  WHERE corrida_id = (( SELECT x.corrida_id
           FROM finanzas_scorecard x
          WHERE x.area = s.area
          ORDER BY x.id DESC
         LIMIT 1))
    AND ((select public.ve_economia()) or (select auth.uid()) is null);

create or replace view public.recupero_art_por_mes with (security_invoker = false) as
SELECT to_date(periodo || '-01'::text, 'YYYY-MM-DD'::text) AS mes,
    sum(monto) FILTER (WHERE linea = 'jornales'::text) AS recupero_jornales,
    sum(monto) FILTER (WHERE linea = 'cargas_sociales'::text) AS recupero_cargas,
    sum(monto) AS recupero_total,
    bool_or(es_estimacion) AS es_estimacion
   FROM recupero_art_imputacion i
  WHERE periodo <> ''::text
    AND ((select public.liquida_sueldos()) or (select auth.uid()) is null)
  GROUP BY (to_date(periodo || '-01'::text, 'YYYY-MM-DD'::text));

create or replace view public.recupero_art_sin_imputar with (security_invoker = false) as
SELECT r.siniestro,
    r.trabajador,
    r.fecha_cobro,
    r.importe_liquidado,
    sum(i.monto) AS monto_sin_imputar
   FROM recupero_art r
     JOIN recupero_art_imputacion i ON i.recupero_id = r.id
  WHERE i.periodo = ''::text
    AND ((select public.liquida_sueldos()) or (select auth.uid()) is null)
  GROUP BY r.siniestro, r.trabajador, r.fecha_cobro, r.importe_liquidado;

create or replace view public.nomina_por_mes with (security_invoker = false) as
WITH j AS (
         SELECT date_trunc('month'::text, jornales_quincena.desde::timestamp with time zone)::date AS mes,
            sum(jornales_quincena.total) AS jornales,
            bool_or(jornales_quincena.estado = 'proyectada'::text) AS tiene_proyectado
           FROM jornales_quincena
          GROUP BY (date_trunc('month'::text, jornales_quincena.desde::timestamp with time zone)::date)
        ), c AS (
         SELECT to_date(cargas_sociales_periodo.periodo || '-01'::text, 'YYYY-MM-DD'::text) AS mes,
            sum(cargas_sociales_periodo.monto) AS cargas,
            bool_or(cargas_sociales_periodo.tipo = 'proyectado'::text) AS tiene_proyectado
           FROM cargas_sociales_periodo
          GROUP BY (to_date(cargas_sociales_periodo.periodo || '-01'::text, 'YYYY-MM-DD'::text))
        ), r AS (
         SELECT recupero_art_por_mes.mes,
            recupero_art_por_mes.recupero_jornales,
            recupero_art_por_mes.recupero_cargas,
            recupero_art_por_mes.recupero_total,
            recupero_art_por_mes.es_estimacion
           FROM recupero_art_por_mes
        )
 SELECT COALESCE(j.mes, c.mes, r.mes) AS mes,
    COALESCE(j.jornales, 0::numeric) AS jornales,
    COALESCE(c.cargas, 0::numeric) AS cargas_sociales,
    COALESCE(j.jornales, 0::numeric) + COALESCE(c.cargas, 0::numeric) AS costo_nomina,
    COALESCE(r.recupero_jornales, 0::numeric) AS recupero_jornales,
    COALESCE(r.recupero_cargas, 0::numeric) AS recupero_cargas,
    COALESCE(r.recupero_total, 0::numeric) AS recupero_art,
    COALESCE(j.jornales, 0::numeric) + COALESCE(c.cargas, 0::numeric) - COALESCE(r.recupero_total, 0::numeric) AS costo_nomina_neto,
    COALESCE(j.tiene_proyectado, false) OR COALESCE(c.tiene_proyectado, false) OR COALESCE(r.es_estimacion, false) AS es_estimacion
   FROM j
     FULL JOIN c ON j.mes = c.mes
     FULL JOIN r ON r.mes = COALESCE(j.mes, c.mes)
  WHERE ((select public.liquida_sueldos()) or (select auth.uid()) is null)
  ORDER BY (COALESCE(j.mes, c.mes, r.mes));

-- ── 2 · LAS TABLAS DE ORIGEN ────────────────────────────────────────────────────────────────────
--
-- `alter policy` y no drop + create: conserva nombre, comando y roles, y cambia sólo el `using`.
-- El portero va como subconsulta para que se evalúe una vez por consulta (InitPlan), no por fila.
alter policy jornales_quincena_read on public.jornales_quincena
  using ((select public.liquida_sueldos()));
alter policy cargas_sociales_periodo_read on public.cargas_sociales_periodo
  using ((select public.liquida_sueldos()));
alter policy recupero_art_lectura on public.recupero_art
  using ((select public.liquida_sueldos()));
alter policy recupero_art_imputacion_lectura on public.recupero_art_imputacion
  using ((select public.liquida_sueldos()));
alter policy finanzas_scorecard_read on public.finanzas_scorecard
  using ((select public.ve_economia()));
alter policy obra_economia_sheet_lee on public.obra_economia_sheet
  using ((select public.ve_economia()));

-- ── 3 · EL CBU DE ACREDITACIÓN DE LA ART ────────────────────────────────────────────────────────
--
-- Ninguna pantalla con sesión lo lee (`rg cbu_acreditacion src` → cero; lo escribe y lee
-- `registrar-recupero-art.mjs` por conexión directa). Cerrar la policy de arriba ya no deja verlo a
-- Obras, pero Dirección y Administración tampoco lo necesitan por la web: la cuenta bancaria viaja
-- sólo por la vía de administración (service role / conexión directa).
--
-- Se CALCULA la lista del catálogo, igual que `20260912T1600`: una columna agregada después nace
-- cerrada en vez de abierta.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position) into cols
    from information_schema.columns
   where table_schema = 'public' and table_name = 'recupero_art'
     and column_name not in ('cbu_acreditacion');
  execute 'revoke select on public.recupero_art from authenticated';
  execute format('grant select (%s) on public.recupero_art to authenticated', cols);
end $$;

-- ── 4 · PERSONAS: LA PRUEBA SÓLO PARA LA PRUEBA, EN LA TABLA ────────────────────────────────────
--
-- `is not true` y no `= false`: un NULL es una persona que nadie declaró de prueba, o sea real.
-- Sin sesión `sesion_es_de_prueba()` da false, pero sin sesión no se llega acá: service role y
-- conexión directa saltean el RLS.
drop policy if exists personas_prueba_solo_para_la_prueba on public.personas;
create policy personas_prueba_solo_para_la_prueba on public.personas
  as restrictive
  for select
  to authenticated
  using (es_prueba is not true or (select public.sesion_es_de_prueba()));

comment on policy personas_prueba_solo_para_la_prueba on public.personas is
  'Una cuenta real no ve a las personas de prueba en la TABLA (antes sólo en tres vistas). '
  'Restrictiva: se suma con AND a personas_select. Ver 20260913T1200.';
