-- Alinear las áreas a la división REAL del dueño: 8 áreas (Personas ES área). DROP del CHECK viejo
-- ANTES de renombrar (si no, el UPDATE viola el constraint aún activo), luego renombrar (sin orfanar)
-- y agregar el CHECK nuevo. administracion_finanzas queda igual.
alter table public.acciones drop constraint if exists acciones_area_check;
update public.acciones set area='gestion_general'  where area='direccion';
update public.acciones set area='obras'            where area='obras_produccion';
update public.acciones set area='compras'          where area='compras_abastecimiento';
update public.acciones set area='personas'         where area='personas_productividad';
update public.acciones set area='comercial'        where area='comercial_presupuestacion';
alter table public.acciones add constraint acciones_area_check check (area in (
  'gestion_general','administracion_finanzas','compras','obras','calidad','comercial','contabilidad_legales','personas'));
