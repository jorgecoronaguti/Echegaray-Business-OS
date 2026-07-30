-- Rollback de la migración 20260731090000 (novedades de asistencia + configuración de jornada).
--
-- QUÉ SE PIERDE AL CORRERLO. Las dos capacidades son ADITIVAS y AISLADAS: al retirarlas, el
-- módulo de asistencia vuelve exactamente a la v1 —carga de HORAS por celda, jornada calibrada
-- desde la planilla— que es la versión que está en producción y funciona sola.
--   · Sin `jornada_config`, `jornadaConfigurada` deja de encontrar tabla: la pantalla tiene que
--     caer a la calibración de la planilla. Se pierde el calendario de feriados cargado.
--   · Sin `asistencia_novedades`, se pierden los MOTIVOS ya registrados. Las HORAS no: viven en
--     JORNALES y no se tocan. La traza de cada confirmación tampoco: vive en orq.events, que es
--     append-only y este script no toca.
--
-- A DIFERENCIA del rollback de 20260730130000, este NO dropea ningún objeto compartido: las
-- tres tablas nacen en esta migración y no las usa nadie más.
--
-- Orden inverso al de creación, para respetar la FK de `tipo`.

drop index if exists comunicacion.asistencia_novedades_art_idx;
drop index if exists comunicacion.asistencia_novedades_trabajador_idx;
drop index if exists comunicacion.asistencia_novedades_fecha_idx;
drop index if exists comunicacion.asistencia_novedades_unica_idx;
drop table if exists comunicacion.asistencia_novedades;

drop index if exists comunicacion.jornada_config_lookup_idx;
drop index if exists comunicacion.jornada_config_dia_idx;
drop index if exists comunicacion.jornada_config_fecha_idx;
drop table if exists comunicacion.jornada_config;

drop table if exists comunicacion.jornada_tipo_regla;
