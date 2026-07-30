-- ROLLBACK del skill `personal.registrar_asistencia`.
--
-- Seguro de correr: todo lo que borra es configuración de permisos, estado efímero de
-- formularios y una vista de lectura. NO borra asistencia (vive en el Sheet JORNALES)
-- ni auditoría (vive en orq.events, que es append-only y no se toca acá).

drop view if exists comunicacion.v_asistencia_auditoria;
drop function if exists comunicacion.vencer_sesiones_asistencia();
drop table if exists comunicacion.asistencia_sesiones;
drop table if exists comunicacion.permisos_skill;
