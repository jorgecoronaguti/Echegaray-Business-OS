-- Rollback de 20260731120000 (calendario completo: alcance, clase y días no laborables).
--
-- QUÉ SE PIERDE. El módulo vuelve al calendario de 20260731090000: sólo feriados, 14 fechas,
-- sin distinguir trasladables de inamovibles ni feriados de días no laborables. Eso sigue
-- funcionando —es lo que está hoy en producción—, pero:
--   · desaparecen los dos trasladables verificados (Güemes 15/06 y Soberanía 23/11): esas dos
--     fechas vuelven a precargarse como día laborable normal;
--   · desaparecen los seis días no laborables (turísticos, Jueves Santo, día del gremio y la
--     Fundación de San Juan): el jefe deja de ver el aviso, y como esas filas tenían `horas` en
--     NULL, la jornada que se precarga NO cambia. No se rompe nada, se pierde el aviso;
--   · `jornadaConfigurada` deja de encontrar `clase` y `decide_empleador` y cae sola a la
--     consulta base — está previsto en el código y no hay que desplegar nada.
--
-- Orden inverso al de creación, para no dejar filas huérfanas de la FK.

-- 1. Las filas que sembró esta migración. Acotado por `creado_por`: nada cargado por una
--    persona ni por la migración anterior se toca.
delete from comunicacion.jornada_config where creado_por = 'migracion_20260731120000';

-- 2. La clasificación que se aplicó a las 14 filas preexistentes. Se limpia sólo la columna,
--    que igual desaparece con el drop de abajo; el resto de la fila queda intacto.
update comunicacion.jornada_config
   set clase = null
 where creado_por = 'migracion_20260731090000';

-- 3. La marca de obra parada. Se pierde el dato ya registrado; el motivo que lo originó NO,
--    sigue en la columna `motivo` y se puede volver a derivar del catálogo.
alter table comunicacion.asistencia_novedades drop column if exists paraliza_obra;

-- 4. Las columnas y sus catálogos.
alter table comunicacion.jornada_config drop constraint if exists jornada_config_clase_fk;
alter table comunicacion.jornada_config drop column if exists clase;
drop table if exists comunicacion.jornada_clase;

alter table comunicacion.jornada_config drop constraint if exists jornada_config_alcance_fk;
drop table if exists comunicacion.jornada_alcance;

-- 5. El tipo de regla nuevo. El delete del paso 1 ya sacó todas las filas que lo referencian,
--    así que la FK de `tipo` no lo bloquea. Si quedara alguna cargada a mano, el delete falla
--    a propósito: es preferible el error a borrarle la regla a alguien.
delete from comunicacion.jornada_tipo_regla where tipo = 'dia_no_laborable';

alter table comunicacion.jornada_tipo_regla drop column if exists decide_empleador;
