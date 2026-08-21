-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- LO QUE LA TABLA AGREGA, LA VISTA LO PUBLICA — Y LA COLUMNA NUEVA NECESITA SU PERMISO
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Dos guardianes del repo agarraron cambios míos incompletos, y los dos avisaron de algo que no
-- habría fallado nunca en pantalla: habría llegado VACÍO.
--
-- ═══ 1 · las columnas nuevas de `obra_canonica` no tenían GRANT ═══
--
-- `obra_canonica` no concede SELECT sobre la tabla: lo concede **columna por columna**, para dejar
-- `monto_contratado` afuera del alcance de quien no ve economía. Consecuencia: toda columna nueva
-- nace SIN permiso. `jornada_horas`, `dias_habiles` y `radio_obra_metros` estaban en la base y la
-- web las iba a leer vacías — la jornada habría caído al default del cálculo y nadie se enteraba.
-- El test lo dice con todas las letras: «estas columnas quedaron sin conceder y la web las ve
-- vacías».
--
-- ═══ 2 · `obra_actividad_control` debe publicar todo lo que la tabla tiene ═══
--
-- La regla del repo: la vista de control publica cada columna de `obra_actividad` salvo las cuatro
-- de contabilidad del sincronizador. Agregué seis y no las publiqué, así que la pantalla no podía
-- ver ni el análisis con el que se planificó una actividad ni el tope de su frente.

-- ── 1 · los permisos de las columnas nuevas ───────────────────────────────────────────────────
grant select (jornada_horas, dias_habiles, radio_obra_metros) on public.obra_canonica to authenticated;
grant update (jornada_horas, dias_habiles, radio_obra_metros) on public.obra_canonica to authenticated;

comment on column public.obra_canonica.jornada_horas is
  'Horas de la jornada de esta obra. Entra en el cálculo de duración, así que si la web la leyera '
  'vacía el motor caería al default de 8 sin decirlo. Por eso la columna lleva su GRANT explícito: '
  'en esta tabla el SELECT se concede columna por columna, y lo nuevo nace sin permiso.';

-- ── 2 · la vista vuelve a publicar todo ───────────────────────────────────────────────────────
create or replace view public.obra_actividad_control with (security_invoker = true) as
 SELECT a.id AS actividad_id,
    a.id,
    a.obra_id,
    a.codigo,
    a.codigo_padre,
    a.nombre,
    a.tipo,
    a.orden,
    a.seccion,
    a.archivada,
    a.clave,
    a.dias_plan,
    a.dias_real,
    a.editado_a_mano,
    a.fuente_pestana,
    a.creada_en_web,
    a.cuadrilla,
    ( SELECT p.nombre
           FROM obra_actividad p
          WHERE p.obra_id = a.obra_id AND p.codigo = a.codigo_padre AND p.tipo = 'resumen'::text
          ORDER BY p.orden
         LIMIT 1) AS rubro,
    a.estado,
    a.unidad,
    a.cantidad_objetivo,
    a.metodo_avance,
    a.inicio_plan,
    a.fin_plan,
    a.inicio_base,
    a.fin_base,
    a.sellada_en,
    a.inicio_real,
    a.fin_real,
    a.hh_plan,
    a.responsable_id,
    a.cuadrilla_id,
    ( SELECT c.nombre
           FROM cuadrilla c
          WHERE c.id = a.cuadrilla_id) AS cuadrilla_prevista,
    a.comentario,
    a.partida_codigo,
    a.partida_cantidad,
    a.pct,
    a.pct AS avance_declarado,
    e.cantidad_ejecutada,
    e.avance_partes,
    e.n_partes,
    e.ultimo_parte,
    h.hh_real,
    h.hh_extra,
    COALESCE(h.n_imputaciones, 0::bigint)::integer AS n_imputaciones,
    COALESCE(imp.abiertos, 0) AS impedimentos_abiertos,
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
            ELSE a.pct
        END AS avance_pct,
        CASE a.metodo_avance
            WHEN 'cantidad'::text THEN 'cantidad'::text
            WHEN 'partes'::text THEN 'partes'::text
            WHEN 'pasos'::text THEN 'pasos'::text
            ELSE
            CASE
                WHEN a.pct IS NOT NULL THEN 'declarado'::text
                ELSE NULL::text
            END
        END AS origen_avance,
        CASE
            WHEN COALESCE(imp.abiertos, 0) > 0 THEN 'bloqueada'::text
            ELSE a.estado
        END AS estado_operativo,
        CASE
            WHEN e.cantidad_ejecutada > 0::numeric AND h.hh_real > 0::numeric THEN round(e.cantidad_ejecutada / h.hh_real, 3)
            ELSE NULL::numeric
        END AS productividad,
        CASE
            WHEN a.hh_plan > 0::numeric AND h.hh_real IS NOT NULL THEN round(h.hh_real / a.hh_plan * 100::numeric, 1)
            ELSE NULL::numeric
        END AS consumo_hh_pct,
    a.actividad_padre_id,
    COALESCE(t.n_tareas, 0) AS n_tareas,
    COALESCE(t.n_tareas_hechas, 0) AS n_tareas_hechas,
    COALESCE(ped.n_pedidos, 0) AS n_pedidos,
    COALESCE(nt.n_notas, 0) AS n_notas,
    COALESCE(doc.n_documentos, 0) AS n_documentos,
    COALESCE(eq.n_equipos, 0) AS n_equipos,
    COALESCE(ps.n_pasos, 0) AS n_pasos,
    COALESCE(ps.n_pasos_hechos, 0) AS n_pasos_hechos,
    ps.peso_total AS peso_pasos,
    a.rol_estructura,
    a.tope_frente,
    a.dotacion_prevista,
    a.analisis_id,
    a.tarea_tipo_id,
    a.cotizacion_partida_id
   FROM obra_actividad a
     LEFT JOIN LATERAL ( SELECT sum(x.cantidad) AS cantidad_ejecutada,
            sum(x.avance_pct) AS avance_partes,
            count(*)::integer AS n_partes,
            max(x.fecha) AS ultimo_parte
           FROM obra_ejecucion x
          WHERE x.actividad_id = a.id) e ON true
     LEFT JOIN LATERAL ( SELECT sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS hh_real,
            sum(r.horas) FILTER (WHERE r.tipo_hora = ANY (ARRAY['extra_50'::text, 'extra_100'::text])) AS hh_extra,
            count(*) FILTER (WHERE r.tipo_hora = ANY (ARRAY['normal'::text, 'extra_50'::text, 'extra_100'::text])) AS n_imputaciones
           FROM registros_hh r
          WHERE r.actividad_id = a.id) h ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS abiertos
           FROM obra_restriccion x
          WHERE x.actividad_id = a.id AND x.fecha_liberacion IS NULL) imp ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_tareas,
            count(*) FILTER (WHERE x.estado = 'hecha'::text)::integer AS n_tareas_hechas
           FROM obra_actividad x
          WHERE x.actividad_padre_id = a.id AND NOT x.archivada) t ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pedidos
           FROM pedidos_materiales x
          WHERE x.actividad_id = a.id) ped ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_notas
           FROM obra_actividad_nota x
          WHERE x.actividad_id = a.id) nt ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_documentos
           FROM obra_documento x
          WHERE x.actividad_id = a.id) doc ON true
     LEFT JOIN LATERAL ( SELECT count(*)::integer AS n_pasos,
            count(*) FILTER (WHERE x.hecho_en IS NOT NULL)::integer AS n_pasos_hechos,
            sum(x.peso) AS peso_total,
            sum(x.peso) FILTER (WHERE x.hecho_en IS NOT NULL) AS peso_hecho
           FROM obra_actividad_paso x
          WHERE x.actividad_id = a.id) ps ON true
     LEFT JOIN LATERAL ( SELECT count(DISTINCT x.equipo)::integer AS n_equipos
           FROM obra_ejecucion_equipo x
             JOIN obra_ejecucion p ON p.id = x.ejecucion_id
          WHERE p.actividad_id = a.id) eq ON true;

grant select on public.obra_actividad_control to authenticated;
grant select on public.obra_actividad_control to service_role;
