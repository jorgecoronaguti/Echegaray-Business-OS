-- EL APRENDIZAJE DEL BUSCADOR PASA A SER POR PERSONA.
--
-- `drive_busqueda_uso` guardaba una fila por (consulta, archivo): "para 'flujo de fondos' se
-- eligió este". Eso mezcla a toda la empresa en una sola preferencia. Lo que Jorge pide con
-- "el flujo" no es lo que pide Administración, y promediarlos hace que el buscador acierte
-- menos para todos.
--
-- Cambio aditivo: se agrega `usuario` con default vacío —las 10 filas que ya existen quedan
-- como aprendizaje de la casa, que es lo que son— y la clave única pasa a incluirlo.
--
-- Sin esta migración el buscador sigue funcionando: lee la forma vieja y aprende como antes.

alter table public.drive_busqueda_uso
  add column if not exists usuario text not null default '';

comment on column public.drive_busqueda_uso.usuario is
  'Quién aceptó el resultado (plataformaUserId). Vacío = aprendizaje de la empresa, sin dueño.';

-- La clave vieja impedía que dos personas eligieran distinto para la misma consulta.
alter table public.drive_busqueda_uso
  drop constraint if exists drive_busqueda_uso_consulta_norm_drive_file_id_key;

create unique index if not exists drive_busqueda_uso_clave
  on public.drive_busqueda_uso (consulta_norm, drive_file_id, usuario);
