-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- EL ESTÁNDAR DICE SI LA CUADRILLA LA VALIDÓ ALGUIEN
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- ADITIVA. Dos columnas AL FINAL de `estandar_productivo`. Ninguna columna existente cambia de
-- nombre, de tipo ni de posición — que es la condición que `create or replace view` impone y la
-- razón por la que las nuevas van últimas: un consumidor que hoy hace `select codigo, cuadrilla, …`
-- sigue leyendo exactamente lo mismo.
--
-- ── POR QUÉ ESTO NO ES COSMÉTICO ──────────────────────────────────────────────────────────────
--
-- La vista publicaba `cuadrilla`, `cuadrilla_personas`, `capacidad_ponderada` y
-- `produccion_diaria_referencia`, y no publicaba de dónde salían. El 2026-08-31 se cargaron cuatro
-- cuadrillas OBSERVADAS —de `Horas Hombre.xlsm`, que nadie revisó— y esas cuatro tareas pasaron de
-- `produccion_diaria_referencia` NULL a un número:
--
--     T1181 1,100 u/día · T1183 3,499 · T1184 3,840 · T1185 2,928
--
-- Sin `cuadrilla_estado`, quien lea la vista —el motor de cotización incluido— usa ese número como
-- si fuera norma. **CANDIDATO se leería como VALIDADO**, y ese es el par que no se puede confundir:
-- VALIDADO es norma y puede declarar que otro dato está mal; CANDIDATO lo aprendió el sistema y no
-- lo aprobó nadie. «Que consulte también analisis_cuadrilla» no arregla nada: el consumidor de una
-- vista consume la vista, y si la procedencia exige una segunda consulta la primera miente sola.
--
-- ── POR QUÉ EL ESTADO ES EL MÍNIMO Y NO EL MÁXIMO ─────────────────────────────────────────────
--
-- Una cuadrilla son VARIAS filas, una por categoría. Si el oficial está VALIDADO y el ayudante es
-- CANDIDATO, la cuadrilla no está validada: la mitad aprobada no lava a la otra mitad, y la
-- producción diaria sale de la capacidad ponderada de las DOS. El orden es
-- CANDIDATO < HISTORICO < VALIDADO y se toma el mínimo. Es la misma dirección conservadora que
-- `analisis.estado`, que nace HISTORICO porque marcar VALIDADO sería afirmar una revisión que no
-- ocurrió.
--
-- ── LO QUE NO CAMBIA ──────────────────────────────────────────────────────────────────────────
--
-- La vista sigue siendo `security_invoker`: las dos columnas nuevas salen del mismo LATERAL sobre
-- `analisis_cuadrilla` del que ya salían `cuadrilla` y `capacidad_ponderada`, así que no abren
-- ninguna fila que el lector no viera antes. Y `create or replace view` conserva los GRANT: no hay
-- que volver a otorgarlos, y volver a otorgarlos de más sería ampliar el acceso sin querer.

create or replace view public.estandar_productivo with (security_invoker = true) as
select a.id                                         as analisis_id,
       a.tarea_tipo_id,
       t.codigo,
       t.nombre                                     as tarea,
       t.unidad,
       a.variante,
       a.version,
       a.vigencia_desde,
       a.vigencia_hasta,
       a.contexto,
       ac.hs_unitarias                              as hh_por_unidad,
       case when ac.hs_unitarias > 0
            then round(1 / ac.hs_unitarias, 4) end  as rendimiento_unidades_por_hh,
       cu.cuadrilla,
       cu.personas                                  as cuadrilla_personas,
       cu.capacidad_ponderada,
       public.produccion_diaria(ac.hs_unitarias, cu.capacidad_ponderada)
                                                    as produccion_diaria_referencia,
       ac.costo_directo                             as costo_unitario,
       ac.n_lineas,
       (cu.capacidad_ponderada is null)             as sin_cuadrilla_declarada,
       -- ── LAS DOS NUEVAS, AL FINAL ────────────────────────────────────────────────────────────
       cu.estado                                    as cuadrilla_estado,
       cu.fuente                                    as cuadrilla_fuente
  from public.analisis a
  join public.tarea_tipo t on t.id = a.tarea_tipo_id
  left join public.analisis_costo ac on ac.analisis_id = a.id
  left join lateral (
        select jsonb_object_agg(q.categoria, q.cantidad) as cuadrilla,
               sum(q.cantidad)                           as personas,
               sum(q.cantidad * cat.capacidad)           as capacidad_ponderada,
               -- El más débil manda. Sin el `min`, una sola línea VALIDADO ascendería a toda la
               -- cuadrilla y la producción diaria saldría de una capacidad mitad sin revisar.
               (array['CANDIDATO', 'HISTORICO', 'VALIDADO'])[
                 min(case q.estado when 'CANDIDATO' then 1
                                   when 'HISTORICO' then 2
                                   when 'VALIDADO'  then 3 end)]           as estado,
               string_agg(distinct q.fuente, ' · ')                        as fuente
          from public.analisis_cuadrilla q
          join public.categoria_obra cat on cat.clave = q.categoria
         where q.analisis_id = a.id) cu on true
 where a.vigente;

comment on view public.estandar_productivo is
  'El estandar vigente de cada tarea, con CADA MAGNITUD EN SU COLUMNA y ninguna mezclada: '
  'hh_por_unidad es esfuerzo, rendimiento_unidades_por_hh es su inversa, capacidad_ponderada es '
  'plantel y produccion_diaria_referencia es ritmo. Esta ultima la calcula produccion_diaria(), con '
  'la jornada como PARAMETRO y default 8 —el mismo de obra_canonica—: es de REFERENCIA porque el '
  'estandar no pertenece a ninguna obra, y el plazo real lo calcula la conversion con la jornada de '
  'la obra. Hay evidencia de que «Horas Hombre.xlsm» calcula con 7,5 h; cambiar cual rige es cambiar '
  'un default, no buscar un numero tipeado adentro de una vista. costo_unitario sale de '
  'recurso_precio: para quien no ve economia llega en NULL, igual que en analisis_costo. '
  'cuadrilla_estado dice si esa cuadrilla la valido alguien: sin esa columna un CANDIDATO se leia '
  'igual que una norma, y hay cuatro tareas que publican produccion diaria por una cuadrilla '
  'observada y no revisada.';

comment on column public.estandar_productivo.cuadrilla_estado is
  'El estado de la LINEA MAS DEBIL de la cuadrilla, en el orden CANDIDATO < HISTORICO < VALIDADO. '
  'Una cuadrilla con el oficial VALIDADO y el ayudante CANDIDATO no esta validada. NULL cuando no '
  'hay cuadrilla: «no hay» no es «candidato».';

comment on column public.estandar_productivo.cuadrilla_fuente is
  'De donde salieron las lineas de la cuadrilla, concatenadas si son varias. Las que cargo '
  'xsas-basemaestra-auditar.mjs llevan ese prefijo y se revierten con un solo delete.';
