-- EL AVANCE MANUAL SALE DE LOS HECHOS, NO DE UNA COLUMNA QUE NADIE ACTUALIZA (24/08/2026 · E2E §47).
--
-- Medido en vivo por el E2E del rediseño: el avance masivo del jefe escribió 2 filas en
-- `obra_ejecucion` (avance_pct=25, metodo='manual', masivo=true), la UI confirmó «✓ 2 tareas al
-- 25 %», y `actividad_avance` siguió publicando 0 % — porque para el método 'manual' la vista
-- devolvía `obra_actividad.pct`, el número DECLARADO al crear la actividad, que ningún camino de
-- escritura toca. Éxito informado, dato quieto: el modo de falla que este sistema existe para no
-- tener. El mismo agujero alcanzaba al guardado individual de J03.
--
-- La fila de `obra_ejecucion` ES el hecho (quién, cuándo, cuánto, con qué criterio). Una
-- declaración manual es ABSOLUTA («la tarea está al 25 %»), no incremental como un parte: por eso
-- acá NO se suma — manda la ÚLTIMA declaración (por fecha del hecho, y a igual fecha la más
-- recién cargada). `obra_actividad.pct` queda como semilla: vale sólo mientras no exista ningún
-- hecho registrado.
--
-- Se cambia LA VISTA y no los escritores: dos escritores actualizando una columna espejo es la
-- receta de la deriva; la vista es la única definición de «avance» y todos los consumidores
-- (panel, cartera, J03, masivo) la leen.

create or replace view public.actividad_avance as
 SELECT a.id AS actividad_id,
    a.obra_id,
    e.cantidad_ejecutada,
    e.avance_partes,
    e.n_partes,
    e.primer_parte,
    e.ultimo_parte,
    ps.n_pasos,
    ps.n_pasos_hechos,
    ps.peso_total AS peso_pasos,
    ps.peso_hecho,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN
            CASE
                WHEN a.cantidad_objetivo > 0::numeric THEN LEAST(100::numeric, round(COALESCE(e.cantidad_ejecutada, 0::numeric) / a.cantidad_objetivo * 100::numeric, 1))
                ELSE NULL::numeric
            END
            WHEN 'partes'::text THEN LEAST(100::numeric, round(COALESCE(e.avance_partes, 0::numeric), 1))
            WHEN 'pasos'::text THEN
            CASE
                WHEN ps.peso_total > 0::numeric THEN round(COALESCE(ps.peso_hecho, 0::numeric) / ps.peso_total * 100::numeric, 1)
                ELSE NULL::numeric
            END
            ELSE LEAST(100::numeric, round(COALESCE(e.ultimo_manual_pct, a.pct), 1))
        END AS avance_pct,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN 'cantidad'::text
            WHEN 'partes'::text THEN 'partes'::text
            WHEN 'pasos'::text THEN 'pasos'::text
            ELSE
            CASE
                WHEN e.ultimo_manual_pct IS NOT NULL OR a.pct IS NOT NULL THEN 'declarado'::text
                ELSE NULL::text
            END
        END AS origen_avance
   FROM obra_actividad a
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS cantidad_ejecutada,
            sum(x.avance_pct) AS avance_partes,
            count(*)::integer AS n_partes,
            min(x.fecha) AS primer_parte,
            max(x.fecha) AS ultimo_parte,
            -- La última declaración manual: absoluta, no se suma. El orden es (fecha del hecho,
            -- carga) — una corrección cargada hoy sobre el mismo día gana, una fila vieja no.
            (array_agg(x.avance_pct ORDER BY x.fecha DESC, x.creado_en DESC)
              FILTER (WHERE x.avance_pct IS NOT NULL))[1] AS ultimo_manual_pct
           FROM obra_ejecucion x
          WHERE x.actividad_id = a.id) e ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pasos,
            count(*) FILTER (WHERE x.hecho_en IS NOT NULL)::integer AS n_pasos_hechos,
            sum(x.peso) AS peso_total,
            sum(x.peso) FILTER (WHERE x.hecho_en IS NOT NULL) AS peso_hecho
           FROM obra_actividad_paso x
          WHERE x.actividad_id = a.id) ps ON true;
