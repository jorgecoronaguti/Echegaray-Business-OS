-- DOS CORRIDAS A LA VEZ NO PUEDEN ABRIR DOS PROPUESTAS DE LA MISMA TAREA.
--
-- ═══ EL AGUJERO (27/08/2026) ═══
--
-- `proponerTareasMaestras` deduplica leyendo primero y escribiendo después. Entre las dos cosas hay
-- una ventana, y hay dos caminos que pueden estar corriendo a la vez: el timer de XSAS cada seis
-- horas y el script de a mano. Las dos lecturas no encuentran nada, las dos insertan, y el dueño
-- termina con la misma tarea propuesta dos veces. Una bandeja con duplicados enseña a ignorarla.
--
-- La deduplicación en código está bien y se queda —evita la escritura innecesaria— pero la garantía
-- la tiene que dar la base, que es la única que ve las dos transacciones.
--
-- El índice es PARCIAL sobre las propuestas de XSAS: `fuente` es un campo libre que el resto de las
-- filas de `backlog_autonomo` usa para describir de dónde salió el hallazgo ('aprendizaje del chat',
-- 'auditoría de caja'), y muchas legítimamente lo repiten. Un índice único sobre toda la columna
-- rompería esas.

create unique index if not exists backlog_autonomo_tarea_maestra_ux
  on public.backlog_autonomo (fuente)
  where fuente like 'xsas:tarea-maestra:%';

comment on index public.backlog_autonomo_tarea_maestra_ux is
  'Una sola propuesta abierta por tarea maestra faltante. La clave es la fuente (xsas:tarea-maestra:<palabras normalizadas>) y no el título, porque el título puede cambiar de rótulo cuando aparece otra escritura más frecuente de la misma tarea.';
