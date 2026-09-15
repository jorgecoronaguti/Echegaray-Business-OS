-- LOS JEFES DE OBRA NO SUMAN HORAS DE OBRA — decisión del dueño, 14/09/2026 18:10.
--
-- «Quitar los jefes de obra de la consideración de horas de cualquiera de las horas.» Sus horas no cuentan en
-- las HH de ninguna obra, de ninguna fuente (JORNALES ni la app), y su costo va entero a Estructura –
-- Administración (`costo_mo_quincena_calculo`, 20260915T0800). En Liquidación y en Horas de Personal se les
-- sigue pagando y mostrando igual: esas pantallas leen `registros_hh` y `persona_hh_dia`, no esta vista.
--
-- ═══ QUIÉN ES JEFE ═══
--
-- `personas.puesto` normalizado en ('jefe_de_obra', 'jefe_obra'): el corte de `esJefeDeObra()`
-- (vocabularioPersona.ts) y el que la vista ya usaba para `origen = 'jefe_app'`. Medido el 15/09/2026: MALDONADO
-- BATISTA EMILIANO MIGUEL y NIEVAS VILLEGAS JUAN PABLO, los mismos dos que tienen `persona_tarifa.neto_mensual`
-- ($1.800.000). `puesto` no tiene historia: la regla se aplica a TODAS sus horas, también las de JORNALES de
-- enero–agosto (Maldonado 1.229 h en La Estrella y 204,5 h en San Francisco; Nievas 1.424 h en San Francisco).
--
-- ═══ QUÉ CAMBIA, CONSUMIDOR POR CONSUMIDOR ═══
--
--   · `hh_que_cuentan_en_obra` deja afuera toda fila de un jefe. Mismas columnas, mismo orden; la rama
--     `'jefe_app'` de `origen` desaparece porque ya no puede darse.
--       - `pantalla_cliente_en_vivo` (CRM, ficha del cliente): hh_real, registros, personas, inicio y última
--         carga sin jefes; `hh_jefe_app` queda null.
--       - `hh_de_obra_en_vivo` (desglose): sin las celdas del jefe; `horas_app` queda null.
--       - `costo_de_obras_a_la_fecha`: sólo usa la vista para la primera quincena de la obra.
--     El `sin_respaldo` de las dos primeras se arma con «trabajada y NO está en la vista»: sin tocarlas, el jefe
--     reaparecería como horas de la app sin respaldo. Por eso 20260915T0842.
--   · `obra_plan_vs_real.hh_real` (módulo Obras: cartera, economía, desvío de HH) sin jefes.
--
-- `security_invoker` y los GRANT se repiten explícitos: un `create or replace view` pelado ya perdió
-- `security_invoker` tres veces. NO se borra `ficha_cliente_cache`: se invalidan a mano los clientes afectados.

create or replace view public.hh_que_cuentan_en_obra
with (security_invoker = true) as
  select r.id, r.obra_canonica_id, r.persona_id, r.fecha, r.horas, r.tipo_hora, r.fuente_legacy,
         case when r.fuente_legacy = 'sheet:jornales' then 'jornales' else 'app' end::text as origen
    from public.registros_hh r
    left join public.personas p on p.id = r.persona_id
   where (r.fuente_legacy = 'sheet:jornales' or r.tipo_hora in ('normal', 'extra_50', 'extra_100'))
     -- EL JEFE DE OBRA NO CUENTA (dueño, 14/09/2026). Sin persona o sin puesto, no es jefe.
     and not coalesce(regexp_replace(lower(trim(p.puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra'), false);

alter view public.hh_que_cuentan_en_obra set (security_invoker = true);

revoke all on public.hh_que_cuentan_en_obra from public, anon;
grant select on public.hh_que_cuentan_en_obra to authenticated, service_role;

comment on view public.hh_que_cuentan_en_obra is
  'Filas de registros_hh que cuentan como hora de obra: toda hora trabajada (normal/extra_50/extra_100) '
  'de cualquier fuente, más ausencias y licencias de sheet:jornales para el desglose, SIN los jefes de obra '
  '(personas.puesto). origen: jornales | app (20260915T0840). La leen pantalla_cliente_en_vivo, '
  'hh_de_obra_en_vivo y costo_de_obras_a_la_fecha.';

-- ── obra_plan_vs_real: la definición viva del 15/09/2026, con el jefe fuera de `hh` ──

create or replace view public.obra_plan_vs_real
with (security_invoker = true) as
 WITH hh AS (
         SELECT r.obra_canonica_id AS obra_id,
            sum(r.horas) AS hh_real
           FROM registros_hh r
             LEFT JOIN personas p ON p.id = r.persona_id
          WHERE r.obra_canonica_id IS NOT NULL AND (r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text]))
            -- EL JEFE DE OBRA NO SUMA HH DE OBRA (20260915T0840).
            AND NOT coalesce(regexp_replace(lower(trim(p.puesto)), '[[:space:]_-]+', '_', 'g') in ('jefe_de_obra', 'jefe_obra'), false)
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

alter view public.obra_plan_vs_real set (security_invoker = true);

revoke all on public.obra_plan_vs_real from public, anon;
grant select on public.obra_plan_vs_real to authenticated;
grant all on public.obra_plan_vs_real to service_role;

notify pgrst, 'reload schema';
