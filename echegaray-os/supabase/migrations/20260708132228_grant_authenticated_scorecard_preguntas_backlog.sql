-- Bug real encontrado por tests/backlog-autonomo-conversion.spec.ts: las 3 tablas
-- nuevas de OLA 1/2 (scorecard_dominios, preguntas_negocio, backlog_autonomo) tenían
-- RLS correcta pero les faltaba el GRANT base a `authenticated` -- sin eso, Postgres
-- deniega el acceso antes de siquiera evaluar la policy. Mismo patrón que ya usan
-- acciones/actividades_semanales.
grant select, insert, update, delete on public.scorecard_dominios to authenticated;
grant select, insert, update, delete on public.preguntas_negocio to authenticated;
grant select, insert, update, delete on public.backlog_autonomo to authenticated;
