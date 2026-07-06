-- PRP-002: Obra como Unidad Económica
-- Extiende `obras` (creada en PRP-001/Fundación) con los datos económicos del contrato.
-- Sin backfill: 0 filas en `obras` al momento de aplicar (verificado antes de migrar).

alter table obras
  add column monto_contratado numeric(14,2),
  add column fecha_inicio date,
  add column fecha_fin_objetivo date;

alter table obras
  alter column monto_contratado set not null,
  alter column fecha_inicio set not null,
  alter column fecha_fin_objetivo set not null;

alter table obras add constraint obras_monto_contratado_check check (monto_contratado > 0);
alter table obras add constraint obras_fechas_check check (fecha_fin_objetivo >= fecha_inicio);

-- Amplía el ciclo de vida para incluir 'contratada': el momento en que se firma el
-- contrato, antes de que arranque la ejecución física (el AS-IS distingue
-- Contratación de Ejecución como etapas separadas).
alter table obras drop constraint obras_estado_check;
alter table obras add constraint obras_estado_check
  check (estado in ('contratada', 'activa', 'pausada', 'cerrada'));
alter table obras alter column estado set default 'contratada';
