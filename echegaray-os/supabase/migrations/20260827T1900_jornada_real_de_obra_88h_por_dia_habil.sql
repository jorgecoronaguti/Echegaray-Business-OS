-- LA JORNADA DE OBRA NO ES DE 8 HORAS: EL CRONOGRAMA CONVERTÍA HH EN DÍAS CON UN NÚMERO CORTO.
--
-- ═══ LA RESPUESTA DEL DUEÑO (27/08/2026) ═══
--
-- «9 h de lunes a jueves y 8 h el viernes», y es REGLA GENERAL: no varía por obra — «todo igual y
-- así». Son 44 h semanales. Las 18 obras de `obra_canonica` tenían `jornada_horas = 8` (el default
-- de la tabla), o sea 40 h: un 10% menos.
--
-- ═══ QUÉ ROMPÍA, EXACTAMENTE ═══
--
-- `jornada_horas` no es decorativo: `cronogramaDeLaObra` y `simularArrastre`
-- (orquestador/lib/cronograma-obra.mjs) dividen las HH de cada actividad por esta cifra para sacar su
-- DURACIÓN EN DÍAS. Con 8 en vez de 8,8 toda actividad salía un 10% más larga, la ruta crítica se
-- estiraba y las fechas de fin proyectadas se corrían — sin dar un solo error, que es como estas
-- cosas llegan a producción.
--
-- ═══ POR QUÉ 8,8 Y NO 9 ═══
--
-- El calendario de estas obras es `dias_habiles = {1,2,3,4,5}`: lunes a viernes. Lo que corresponde
-- ahí es la jornada PROMEDIO de un día hábil, 44/5 = 8,8 — no las 9 del lunes ni las 8 del viernes,
-- que describen días distintos. La tabla completa por día de la semana vive en
-- `orquestador/lib/jornada-uocra.mjs`, que es la ÚNICA definición: de ahí sale también el piso del
-- convenio en Jornales y el valor de un día de vacaciones en Cargas Sociales. Este valor se deriva de
-- esa tabla; no es un número independiente que haya que acordarse de mover.
--
-- ═══ EL SÁBADO NO ENTRA ACÁ, Y LA DISTINCIÓN NO ES UN DETALLE ═══
--
-- En obra se trabaja el sábado (el espejo `_J_OBREROS` lo tiene cargado con 4 h en diciembre), y esas
-- horas SÍ entran en la proyección de nómina. Pero meterlas acá obligaría a agregar el 6 a
-- `dias_habiles` de las 18 obras, y eso mueve el cronograma entero de cada una — un efecto que el
-- dueño NO pidió y que no se cuela adentro de una migración de jornada. El sábado es un supuesto de
-- NÓMINA (cuánto se paga); `jornada_horas` responde otra pregunta (cuándo termina una tarea).
--
-- ═══ SE PISAN LAS 18 FILAS A PROPÓSITO ═══
--
-- Todas están exactamente en 8, que es el default: ninguna tiene una jornada que alguien haya
-- decidido a mano, así que no hay decisión de nadie que esta migración pueda borrar. Se acota con
-- `where jornada_horas = 8` justamente para eso: si el día de mañana alguien puso 7,5 en una obra
-- puntual, esa fila queda intacta y su criterio manda.

alter table public.obra_canonica alter column jornada_horas set default 8.8;

update public.obra_canonica
   set jornada_horas = 8.8
 where jornada_horas = 8;

comment on column public.obra_canonica.jornada_horas is
  'Horas por DÍA HÁBIL con las que el cronograma convierte HH en duración. 8,8 = 44 h semanales / 5 '
  'días (9 h de lunes a jueves y 8 el viernes, regla del dueño del 27/08/2026). La tabla por día de '
  'la semana —y el sábado, que es un supuesto de nómina y no un día del plan— viven en '
  'orquestador/lib/jornada-uocra.mjs: si cambia, cambia ahí primero.';
