-- Rollback de los enlaces de un solo uso de la pantalla de asistencia.
--
-- Aditiva y aislada: al retirarla, la pantalla web deja de poder garantizar el único uso y
-- por lo tanto debe apagarse junto con esta tabla (fail-closed: el verificador rechaza el
-- enlace si el consumo no se puede registrar). El flujo conversacional de asistencia por
-- Mattermost NO depende de esto y sigue funcionando igual.
--
-- Se pierde la traza de quién abrió la pantalla. No se pierde ningún dato de asistencia: eso
-- vive en el Sheet JORNALES.
drop function if exists comunicacion.purgar_enlaces_asistencia(int);
drop index if exists comunicacion.asistencia_enlaces_usuario_idx;
drop index if exists comunicacion.asistencia_enlaces_expira_idx;
drop table if exists comunicacion.asistencia_enlaces;
