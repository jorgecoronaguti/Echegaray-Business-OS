-- SE RETIRA EL SEGUNDO APRENDIZ DE RENDIMIENTOS. QUEDA UNO.
--
-- ═══ QUÉ HABÍA (27/08/2026) ═══
--
-- Dos mecanismos escribían `rendimiento_historico` con reglas distintas:
--
--   `public.capturar_rendimientos()`   por pg_cron todos los días 11:20 desde el 21/08.
--   el ciclo de XSAS                   por timer, cuatro veces al día.
--
-- El viejo exige `avance_pct >= 100`, cantidad > 0 y horas > 0, y captura una fila por actividad
-- terminada. En treinta y siete días **no capturó una sola**: ninguna actividad reunía las tres
-- condiciones a la vez. Las diez filas que había en la tabla son la semilla del xlsm, no suyas.
--
-- Aun sin haber escrito nada, es un problema: el día que una actividad reúna las tres, escribiría
-- una fila SIN estado, SIN confianza, SIN evidencia y SIN el rendimiento planificado contra el que
-- comparar — las cuatro columnas con las que el OS decide si un rendimiento sirve para cotizar. Y
-- lo haría bajo otra regla de validación que la del ciclo. Dos definiciones de «lo que la obra
-- enseñó» es exactamente lo que este OS no admite.
--
-- ═══ QUÉ QUEDA ═══
--
-- La vista `rendimiento_a_capturar` NO se toca: sigue siendo el mejor diagnóstico de qué le falta a
-- una actividad para poder enseñar algo, y no escribe nada.
--
-- La función se conserva pero deja de poder escribir: falla con el motivo y el camino nuevo. Se
-- prefiere eso a borrarla — un `function does not exist` seis meses después no le explica a nadie
-- qué pasó, y esta traza sí.

-- El cron primero: mientras exista el job, la función sigue siendo un escritor programado.
do $$
begin
  perform cron.unschedule(jobid) from cron.job where command ilike '%capturar_rendimientos%';
exception when undefined_table or undefined_function then
  raise notice 'sin pg_cron en esta base: nada que desprogramar';
end $$;

create or replace function public.capturar_rendimientos(p_obra_id text default null)
returns integer
language plpgsql
as $$
begin
  raise exception 'capturar_rendimientos está retirado desde el 27/08/2026: el rendimiento de obra lo mide el ciclo de XSAS (orquestador/scripts/xsas-ciclo.mjs), que además guarda estado, confianza y evidencia. Para ver qué le falta a una actividad, consultá public.rendimiento_a_capturar.'
    using errcode = 'feature_not_supported', hint = 'node orquestador/scripts/xsas-ciclo.mjs --dry';
  return 0;
end $$;

comment on function public.capturar_rendimientos(text) is
  'RETIRADO el 27/08/2026. Lo reemplaza el ciclo de XSAS, que mide plan contra real desde el 20% de '
  'avance con confianza declarada y no sólo al 100%. Se deja fallando a propósito para que quien la '
  'llame sepa a dónde ir.';
