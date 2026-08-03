-- ROLLBACK de 20260803120000_comprobantes_por_chat.sql
--
-- Borra las dos tablas del canal de comprobantes. NO toca la pestaña "Compras" ni nada de
-- public.*/orq.*: lo que ya se escribió en el Sheet queda escrito, que es lo correcto — el rollback
-- de una tabla de estado no puede deshacer un efecto externo.
--
-- OJO: al borrar `comprobantes_cargados` se pierde la barrera de idempotencia. Si se vuelve a
-- aplicar la migración, un comprobante ya cargado podría entrar de nuevo por el chat.

drop table if exists comunicacion.comprobantes_cargados;
drop table if exists comunicacion.comprobante_fajos;
