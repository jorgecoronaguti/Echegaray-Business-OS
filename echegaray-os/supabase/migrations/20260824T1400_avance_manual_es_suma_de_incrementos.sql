-- EL AVANCE MANUAL ES SEMILLA + SUMA DE INCREMENTOS — una sola semántica con el escritor
-- (24/08/2026 · E2E §47, segunda pasada).
--
-- La 20260824T1300 hizo que el manual saliera de los hechos, pero eligió la semántica equivocada:
-- leía la ÚLTIMA fila como valor ABSOLUTO, y el escritor (`deltaHasta` en
-- src/features/jefe/services/medicion.ts, usado por el masivo y por J03) guarda el INCREMENTO.
-- Medido en vivo por el E2E: masivo al 25 % → vista 25 ✓; segunda pasada pidiendo 50 % → el
-- escritor guardó delta 25 y la vista se quedó en 25 con la UI cantando «✓ 2 tareas al 50 %».
--
-- Manda la semántica del ESCRITOR, por dos razones: (1) las filas históricas de obra_ejecucion ya
-- son incrementos — leerlas como absolutos reescribe el pasado; (2) es la misma semántica de
-- 'partes' (cada fila es «se avanzó X % más»), así que la vista cuenta las dos con la misma regla.
-- `obra_actividad.pct` queda como SEMILLA estática (el avance declarado al crear la actividad,
-- que nadie actualiza): avance = semilla + Σ incrementos, con techo 100. La cadena cierra porque
-- `deltaHasta(objetivo, actual)` calcula el delta CONTRA esta misma vista.
--
-- Sin semilla y sin hechos → NULL (no 0: «sin dato» y «0 %» son cosas distintas).

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
            ELSE
            CASE
                WHEN a.pct IS NULL AND e.avance_partes IS NULL THEN NULL::numeric
                ELSE LEAST(100::numeric, round(COALESCE(a.pct, 0::numeric) + COALESCE(e.avance_partes, 0::numeric), 1))
            END
        END AS avance_pct,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN 'cantidad'::text
            WHEN 'partes'::text THEN 'partes'::text
            WHEN 'pasos'::text THEN 'pasos'::text
            ELSE
            CASE
                WHEN a.pct IS NOT NULL OR e.avance_partes IS NOT NULL THEN 'declarado'::text
                ELSE NULL::text
            END
        END AS origen_avance
   FROM obra_actividad a
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS cantidad_ejecutada,
            sum(x.avance_pct) AS avance_partes,
            count(*)::integer AS n_partes,
            min(x.fecha) AS primer_parte,
            max(x.fecha) AS ultimo_parte
           FROM obra_ejecucion x
          WHERE x.actividad_id = a.id) e ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pasos,
            count(*) FILTER (WHERE x.hecho_en IS NOT NULL)::integer AS n_pasos_hechos,
            sum(x.peso) AS peso_total,
            sum(x.peso) FILTER (WHERE x.hecho_en IS NOT NULL) AS peso_hecho
           FROM obra_actividad_paso x
          WHERE x.actividad_id = a.id) ps ON true;
