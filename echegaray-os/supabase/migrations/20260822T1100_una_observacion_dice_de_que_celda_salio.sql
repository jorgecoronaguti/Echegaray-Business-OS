-- ═══════════════════════════════════════════════════════════════════════════════════════════════
-- UNA OBSERVACIÓN DE RENDIMIENTO DICE DE QUÉ CELDA SALIÓ — Y NO SE PUEDE CARGAR DOS VECES
-- ═══════════════════════════════════════════════════════════════════════════════════════════════
--
-- Aplicada por el coordinador el 22/08/2026 (la escribió el agente del addendum, la aplicó quien integra).
--
-- `rendimiento_historico` nació para lo que vuelve de la obra: la actividad lo cierra, el capturador
-- lo escribe, y el índice `rendimiento_historico_una_por_actividad` garantiza una fila por
-- actividad. Eso alcanza mientras la única puerta sea la obra.
--
-- No alcanza para la evidencia IMPORTADA. Al cargar las 9 ejecuciones observadas de
-- «Horas Hombre.xlsm» —hoja `DESCRIPCION DE TAREAS`, obra no identificada— aparecen dos huecos que
-- el modelo actual no tiene cómo tapar:
--
--   · **de dónde salió el dato**. `fuente` dice «xlsm-horas-hombre» y con eso no se vuelve al
--     origen: no distingue la fila 2 de la fila 10 del mismo libro. `recurso.origen` y
--     `tarea_tipo.origen` ya resuelven exactamente esto con el formato
--     «archivo · hoja!celda · ingesta AAAA-MM-DD»; acá faltaba.
--   · **nada impide cargar la misma observación dos veces**. El único índice único mira
--     `actividad_id`, que en la evidencia importada es NULL — y un índice único sobre una columna
--     que acepta NULL no restringe nada (ya vivió sobre 206 NULLs sin quejarse). Dos corridas del
--     importador duplican la muestra, y `rendimiento_recomendado` cuenta `count(r.id)` y
--     `count(distinct r.obra_id)`: el duplicado NO se ve como error, se ve como más evidencia.
--     Ése es el defecto que esta migración cierra.
--
-- No se inventa tabla ni catálogo: una columna de texto con el mismo nombre y el mismo formato que
-- las dos que ya existen, y su unicidad parcial.

alter table public.rendimiento_historico add column if not exists origen text;

comment on column public.rendimiento_historico.origen is
  'De qué celda concreta salió esta observación cuando NO la produjo una actividad del OS: '
  '«Horas Hombre.xlsm · DESCRIPCION DE TAREAS!A2:G2 · ingesta 2026-08-22». Mismo formato que '
  'recurso.origen y tarea_tipo.origen. `fuente` dice de qué CLASE de fuente viene; `origen` dice '
  'de cuál exactamente, y es lo que permite volver al papel y discutir el número.';

-- El backfill sale del jsonb donde el importador ya lo venía escribiendo: no inventa una
-- procedencia, la promueve de `composicion` a columna.
update public.rendimiento_historico
   set origen = composicion ->> 'origen'
 where origen is null and composicion ? 'origen';

-- PARCIAL sobre `origen not null`: la evidencia importada no se puede cargar dos veces, y las filas
-- que vienen de una actividad (origen NULL) siguen gobernadas por su propio índice.
create unique index if not exists rendimiento_historico_un_origen
  on public.rendimiento_historico (origen) where origen is not null;
